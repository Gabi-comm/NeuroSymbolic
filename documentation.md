# OASYS — Neurosymbolic Road Defect Detection and Assessment

System documentation for the undergraduate thesis *A Neurosymbolic AI Framework
Approach to Road Defect Detection and Assessment* (University of the East
Caloocan, College of Engineering).

A web-based tool that detects road defects from uploaded images and grades their
severity using neural perception combined with rule-based symbolic reasoning
aligned with DPWH engineering standards.

---

## 1. Overview

| | |
|---|---|
| **Defects detected** | Potholes, Alligator Cracks, Longitudinal Cracks, Transverse Cracks |
| **Severity levels** | Low, Medium, High |
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| **Backend** | FastAPI, PyTorch, Ultralytics YOLOv8, Segment Anything (ViT-B), OpenCV |
| **Database / Auth** | Supabase (Postgres + Auth + RLS) |
| **Report generation** | Local LLM via Ollama (`llama3.2`) |
| **Maps** | Leaflet + OpenStreetMap / Nominatim |
| **Study area** | Road networks of South Caloocan City |

**Who it serves:** DPWH and Local Government Units, road maintenance engineers and
on-field inspectors, and the public who depend on prioritised repairs.

> **This system is a decision-support tool, not an autonomous decision-maker.**
> All assessments are preliminary and must be validated by a licensed Civil
> Engineer or DPWH official before repair resources are dispatched.
>
> *This statement is documentation only. At the researcher's request it is no
> longer surfaced in the running interface — see the changelog.*

---

## 2. Architecture

```
  Browser                      Next.js server                 FastAPI (Python)
  ────────                     ──────────────                 ────────────────
  upload image ──► /api/analyze ──► POST /analyze-road ──► 1. decode + privacy blur
                   (route handler,                          2. road detection (YOLOv8)
                    API_BASE_URL)                           3. IPM  -> 700x700 bird's eye
                                                            4. crack detection (YOLOv8-seg)
                                                            5. NMS box filtering
                                                            6. SAM masking (consensus)
                                                            7. skeletonization
                                                            8. physical metrics via GSD
                                                            9. fuzzy severity reasoning
                                                           10. bulletin (local LLM prose
                                                               + symbolic decisions)
  result screen ◄─────────────────── JSON ◄────────────────────┘
       │
       └─ submit ──► Supabase "FileUpload" ──► admin console
```

The browser never contacts the Python host directly. It posts to `/api/analyze`,
a Next.js route handler that forwards to `API_BASE_URL`. This keeps the backend
location out of client bundles and makes deployment possible.

### Pipeline stages

| # | Stage | Implementation | Output |
|---|---|---|---|
| 0a | Road gate | `road_mask_area_px` + `MIN_ROAD_COVERAGE` | 422 if under 15% coverage |
| 0b | Privacy blur | `apply_privacy_blur` | people and vehicle plates obscured |
| 1 | Upload | `utils/pendingScan.ts` | JPEG data URL, longest edge 1600 px |
| 2 | Road detection | `road_model.predict` (`ultrabestroad.pt`) | road surface mask |
| 3 | Perspective correction | `get_birds_eye_view` | 700x700 top-down view |
| 4 | Defect detection | `crack_model.predict` (`best.pt`, conf 0.1) | boxes, masks, classes |
| 5 | Box filtering | `filter_overlapping_boxes` | surviving detection indices (NMS, IoU 0.4) |
| 6 | SAM masking | `trace_cracks` | SAM mask AND YOLO mask, adaptive threshold |
| 7 | Skeletonization | `skeletonize_opencv` | single-pixel crack centreline |
| 8 | Physical metrics | `trace_cracks` | sq.m (area defects), m (linear defects), mean width in mm |
| 9 | Severity reasoning | `fuzzy_engine.evaluate` | fuzzy + crisp + confidence, membership trace |
| 10 | Report | `generate_maintenance_bulletin` | maintenance bulletin text |

**Why the bird's-eye view is always 700x700:** the warp normalises scale, so
Ground Sample Distance becomes a property of the transform rather than of the
original photograph. This is what makes a single GSD constant defensible.

---

## 3. Measurement and severity

### Ground Sample Distance

GSD converts bird's-eye-view pixels to millimetres.

```
DEFAULT_GSD_MM_PX = 4.357     # per paper section 3.3.C
```

Callers may override it per image via `gsd_mm_px` once capture height and
distance are known. Accuracy depends on adherence to the capture guidelines
(chest height, approximately 2 m from the defect); deviation warps the IPM
matrix and degrades every downstream measurement.

Metrics branch by defect type:

- **Area defects** (Pothole, Alligator Crack): `mask_px x GSD^2` -> square metres
- **Linear defects** (Longitudinal, Transverse Crack): `skeleton_px x GSD` -> metres
- **Mean width** (all types): `mask_px / skeleton_px x GSD` -> millimetres

### Severity

Severity is assigned by a **Fuzzy Logic engine** (`backend/fuzzy_engine.py`) taking
two measured inputs: mean crack width and crack density.

**Why fuzzy.** Optical measurement of a defect is uncertain: the mask boundary is
approximate and the IPM warp assumes the capture guidelines were followed. A crack
measuring 5.9 mm is not meaningfully different from one measuring 6.1 mm, so a
crisp threshold at 6.0 mm claims a precision the measurement does not have.
Overlapping membership functions let a defect be partly Moderate and partly Wide,
which is how an inspector actually reasons.

**DPWH severity definitions** this engine implements, from the Visual Road
Condition Assessment Manual 2019 v2 (D.O. 120 s.2019):

| Distress | Narrow 'N' | Wide 'W' |
|---|---|---|
| Crocodile (Alligator) Crack | mean width <= 3 mm | > 3 mm |
| Longitudinal Crack | mean width <= 3 mm | > 3 mm |
| Transverse Crack | mean width <= 3 mm | > 3 mm |
| Pothole | *not graded — counted; 1 pothole = 0.25 m²* | |

DPWH rates cracking on **two axes**: severity (the width band above) and extent,
defined as "the total area of cracking within the segment over the total area of
the segment and expressed as a percentage". The manual states defects are "rated
on a two-dimensional scale covering the severity and extent of distress
exhibited", with severity "banded in either 2 or 3 levels".

**Membership functions** (trapezoidal, `[a, b, c, d]`):

| Variable | Term | Points | Anchored on |
|---|---|---|---|
| Mean width (mm) | Narrow | 0, 0, 2, 4 | the DPWH 3 mm cut |
| | Wide | 2, 4, 60, 60 | the DPWH 3 mm cut |
| Crack extent (%) | Sparse | 0, 0, 5, 15 | below routine-maintenance concern |
| | Medium | 10, 20, 35, 50 | approaching BRM |
| | Dense | 45, 55, 100, 100 | Beyond Routine Maintenance at ~55% |

The ~55% anchor comes from D.O. 47 s.2024 Table 5.1: alligator cracking "More
than 167.5 sq.m. (continuous)" is Beyond Routine Maintenance, which over a
3.05 m lane is roughly 55% of a 100 m segment lane area.

> **Why fuzzify a threshold the standard states crisply?** DPWH's prescribed
> instrument is a printed **Crack Width Scale** compared by eye against the crack
> in the field — "the first mark wide enough to cover the crack gap will show the
> correct severity code". Neither that gauge nor an optical measurement through an
> IPM warp resolves tenths of a millimetre. Overlapping sets around 3 mm represent
> that measurement uncertainty instead of hiding it.

> **Why three levels from a two-band standard?** DPWH's severity axis is binary
> but its rating scheme is two-dimensional, and DPWH combines the two axes itself
> through weighted factors into a continuous 0–1 Visual Condition Index. Table 4
> weights run Crocodile-Narrow 3.5, Crocodile-Wide 5.9, Transverse-Narrow 3.3,
> Transverse-Wide 5.5 — already a graded treatment. The literal two-band verdict
> is preserved unmodified as `severity_dpwh_nw`.

**Full documentary evidence, with verbatim quotations and reproduction steps, is
in [`proof.md`](proof.md).**

**Two rule bases, selected by defect type.** Grading a pothole by its mean crack
width is not defensible; what matters is how much of the surface has failed.

- **Linear** (Longitudinal, Transverse Crack): width leads, per the Table 4
  weights where Wide outranks Narrow.
- **Area** (Crocodile / Alligator Crack): extent leads and escalates faster,
  per Table 4 (Crocodile outranks Transverse at both severities) and the
  Beyond Routine Maintenance parameter, which has no width term at all.
- **Pothole**: neither. Not graded under DPWH — see below.

Each rule base holds nine rules over the 3x3 input space. The defuzzified output
is a 0-100 score, banded into Low (<33.34), Medium (<66.67) and High.

**Crack density** is the defect mask area as a percentage of the analysed road
surface. When IPM succeeds the warp maps the road trapezoid onto the whole frame,
so the frame is the denominator; when it fails, the detected road mask area is
used instead, so sky and verge are not counted as road.

### Potholes and why depth is excluded

Depth is not part of any calculation, for two independent reasons:

1. **It cannot be measured.** The framework is 2D optical only, with no depth
   sensor (delimitation 3), so any depth figure would be inferred rather than
   measured.
2. **DPWH does not ask for it.** Potholes are "rated according to the **number**
   of potholes... One (1) pothole is equivalent to 0.25 m²" (D.O. 120 s.2019).
   There is no severity band for potholes anywhere in the manual, and the VCI
   weight is listed as "Potholes (**number**)". Depth is not a grading input.

A detected pothole is therefore reported at a single fixed severity rather than
graded. **High** is used, because DPWH response-time rules give potholes the
shortest repair window — three days — which is the same engineering judgement
expressed as urgency rather than as a severity band.

`POTHOLE_STRATIFIED = False` in `fuzzy_engine.py` controls this. Setting it True
grades potholes by measured surface extent instead, which is a documented
*extension beyond* the standard and must be declared as such if used.

### Three severity outputs per detection

| Field | Method |
|---|---|
| `severity_dpwh_nw` | the **literal DPWH verdict**: Narrow / Wide, unmodified |
| `severity_fuzzy` | the engine above (proposed method) |
| `severity_crisp` | the **same DPWH inputs combined crisply** (rule baseline) |
| `severity_confidence` | detection confidence alone (neural baseline) |
| `severity_legacy_crisp` | the study's original 3 / 6 mm thresholds |

The crisp baseline deliberately uses the *same* 6 / 19 mm cut points as the fuzzy
engine. Had it kept different threshold values, "fuzzy vs crisp" would confound
two changes at once — the reasoning method and the numbers — and RQ3 could not
attribute any difference to fuzzy reasoning. Holding the cut points identical
isolates the single variable under test. `severity_legacy_crisp` is retained
separately so pre-alignment results remain reproducible.

Research question 3 asks whether fuzzy reasoning differs significantly from
relying solely on neural confidence scores. Emitting all three per detection makes
that comparison computable rather than asserted. `membership_trace` accompanies
them, recording the degree to which the inputs belonged to each linguistic term --
the explainable logic trace the architecture model promises.

Overall severity for an image is the **worst** distress present, never the first
one detected.

### Maintenance interventions

Interventions and priority are resolved **symbolically**, not by the language
model, from `fuzzy_engine.INTERVENTIONS`:

| Distress | Low | Medium | High |
|---|---|---|---|
| Longitudinal / Transverse Crack | Crack sealing | Crack sealing | Rout and seal |
| Alligator Crack | Surface seal | Partial-depth patching | Mill-and-overlay |
| Pothole | Cold-mix patching | Cold-mix patching | Full-depth patching |

Priority is Routine / Moderate / High / Urgent, set by the worst severity present
and escalated one step when density reaches 25%.

*Also provisional pending confirmation against the DPWH Road Inventory Manual.*

---

## 4. API contract

### `POST /analyze-road`

```json
{
  "image_base64": "data:image/jpeg;base64,...",
  "gsd_mm_px": 4.357
}
```

`gsd_mm_px` is optional and defaults to 4.357.

**Response**

```json
{
  "fileUrl": "data:image/jpeg;base64,...",
  "overall_severity": "High",
  "gsd_mm_px": 4.357,
  "gemini_bulletin": "Road Segment Health Summary: ...",
  "crack_density_pct": 10.24,
  "ipm_applied": true,
  "privacy_blur_applied": true,
  "road_coverage_pct": 17.1,
  "stages": [
    {
      "key": "road_detection",
      "title": "Road Detection",
      "summary": "Isolates the road surface",
      "detail": "17.1% of the frame was identified as road. Anything below 15% is rejected rather than assessed.",
      "image": "data:image/jpeg;base64,..."
    }
  ],
  "distresses": [
    {
      "label": "Alligator Crack",
      "measurement_type": "Area",
      "metric_value": 0.4415,
      "unit": "sq.m",
      "width_mm": 12.56,
      "confidence": 0.54,
      "severity": "Medium",
      "severity_fuzzy": "Medium",
      "severity_score": 65.58,
      "severity_crisp": "High",
      "severity_confidence": "Medium",
      "rule_base": "area",
      "crack_density_pct": 10.24,
      "membership_trace": {
        "width": { "narrow": 0.0, "moderate": 0.0, "wide": 1.0 },
        "density": { "sparse": 0.252, "medium": 0.32, "dense": 0.0 }
      }
    }
  ]
}
```

`fileUrl` is the annotated image: green bounding boxes, red skeleton overlay, and
a `label (severity)` caption per detection.

`stages` is the six-frame pipeline walkthrough — see §4c. It is best-effort: if a
frame fails to render the array comes back empty and the assessment is unaffected.

> `gemini_bulletin` is a legacy field name. The text now comes from a local model;
> the field is renamed in Phase 2 to avoid a breaking change mid-phase.

---

## 4a. Road gate

Before anything is measured, `ultrabestroad.pt` must segment at least
**15%** of the frame as road surface (`MIN_ROAD_COVERAGE`, overridable by env).
Below that the request is refused with **HTTP 422** and
`{"error": "no_road_detected"}`.

Without this the system accepted any photograph at all. The crack detector will
find "cracks" in a wall, a carpet or a face, and the symbolic layer then grades
them in millimetres and prescribes DPWH interventions. **An assessment tool that
answers questions about non-roads is more dangerous than one that refuses,
because the output looks equally authoritative either way.**

15% is deliberately permissive: a legitimate close-up taken at 2 m still fills
most of the frame with pavement. Measured on a real Caloocan road photo the
coverage is 68%; flat walls, noise and sky all measure 0%.

The frontend renders the refusal as a dedicated screen with capture guidance
rather than a generic error.

## 4a-2. Privacy preprocessing

Section 3.3.D commits to "automated blurring for data privacy", and section 3.5
claims RA 10173 compliance. Both are now implemented.

Before any detection, measurement or storage, the raw upload passes through
`apply_privacy_blur`, which uses stock COCO YOLOv8n to find people and vehicles:

- **People** are blurred entirely.
- **Vehicles** are blurred across the bottom 45% of their bounding box, where
  plates sit. Blurring the whole vehicle would routinely cover the road defect
  behind it.

The Gaussian kernel scales with region size, so a small distant face is as
unrecoverable as a large near one.

Because the pass runs first, no identifiable frame is ever measured, encoded into
the returned annotated image, or written to the database. Combined with the local
LLM, no image data leaves the host at any point.

Set `PRIVACY_BLUR_ENABLED=false` to disable. Loading failure is **fatal at
startup** rather than silently skipped: a privacy control that quietly does
nothing is worse than none at all.

---

## 4b. Accounts and authentication

Authentication is delegated entirely to **Supabase Auth**. The application stores
no credential of any kind.

```
UserDetail                         auth.users
  id            bigint PK            id  uuid PK
  username      text                 encrypted_password  (bcrypt)
  email         text unique          email_confirmed_at
  role          user | admin         last_sign_in_at
  userloginuuid uuid  ------------>  id
```

`UserDetail` holds the application's view of a person — display name, role — and
links to the auth record by `userloginuuid`. **There is deliberately no password
column**: `auth.users.encrypted_password` already holds a bcrypt hash, and a
second copy would be a credential store to defend, kept in sync, and protected by
policy. The ERD can show the relationship without storing the secret.

### Sign-up

A database trigger (`on_auth_user_created`) creates the `UserDetail` row in the
same transaction as the auth user. The application previously did this in two
steps; when the second failed it left a half-created account, and nine such
orphans had accumulated — profiles with a null `userloginuuid` that could never
sign in.

Sign-up always assigns `role = 'user'`, enforced by both the trigger and a CHECK
constraint. Nobody can self-promote.

### Email verification

Sign-up sends a confirmation link to `/auth/callback`, which exchanges the code
for a session. Until it is clicked there is no session, so the account cannot be
used. **This requires "Confirm email" to be enabled in the Supabase dashboard**
(Authentication → Sign In / Providers → Email); with it off, Supabase
auto-confirms and anyone can register an address they do not own.

### Password reset

"Forgot password" sends a recovery link through `/auth/callback?next=/reset-password`.
`/reset-password` waits for the recovery session, takes a new password, calls
`updateUser`, then signs the user out so the new password is used on the next
sign-in. Expired and already-used links are reported explicitly.

### Sessions

Sessions are stored in **cookies** via `@supabase/ssr`, not `localStorage`. This
matters: `proxy.ts` gates `/admin/*` server-side and can only read cookies. With
localStorage the middleware saw no session and redirected everyone away from the
console, administrators included.

Three layers guard the admin side:

| Layer | Checks |
|---|---|
| `proxy.ts` | A valid session exists (`getUser()`, which revalidates — `getSession()` only decodes a cookie a client could forge) |
| `app/admin/layout.tsx` | `UserDetail.role === 'admin'` |
| Supabase RLS | What rows the request may actually touch |

Only the third is a real security boundary: the publishable key ships to every
browser, so the database must assume the client is hostile.

### Roles

Promotion happens at `/admin/users`. Three protections:

- **Self-demotion blocked** in the UI.
- **Last-admin guard**: a `BEFORE UPDATE OR DELETE` trigger refuses any change
  leaving zero administrators. Without it the final admin could be demoted,
  leaving no administrator and no interface able to create one.
- **Audit trail**: `role_change_log` records actor, target, old role, new role
  and timestamp. Written only by a `SECURITY DEFINER` trigger and readable only
  by admins; it has no write policies, because an audit log a user can rewrite
  is not an audit log.

The first administrator must be promoted with SQL, since the only promotion UI is
itself admin-only:

```sql
update "UserDetail" set role = 'admin' where email = 'you@example.com';
```

---

## 4c. Pipeline walkthrough

Every stage of the pipeline already ran on every request; until now only the
final composite was returned. The API now also emits what each step produced, so
a reader asked to trust a severity grade can see how it was reached.

| # | Stage | Frame |
|---|---|---|
| 1 | Road Detection | green wash and contour over the road mask, on the pre-warp frame |
| 2 | Perspective Correction | the 700×700 IPM warp |
| 3 | Defect Detection | every raw candidate box, orange |
| 4 | Box Filtering | survivors **solid green**, suppressed duplicates **dashed magenta** |
| 5 | SAM Masking | the SAM ∩ YOLO consensus mask |
| 6 | Skeletonization | centrelines on a darkened frame |

Each carries a caption with that run's real numbers — road coverage, candidate
count, how many duplicates non-maximum suppression discarded.

**Cost.** Frames are downscaled to 560 px at JPEG quality 72: roughly 270 KB for
all six, measured. Full-size frames would triple the response and would not fit
in `sessionStorage` alongside the annotated image.

**Storage.** The frames are held under their own `sessionStorage` key
(`oasys.pipelineStages`), deliberately *not* folded into `oasys.pendingAnalysis`.
That key is what carries a finished scan into the report flow; if the frames
pushed it past the browser's quota, a user would lose a 25-second analysis to a
page they might never open. Separate keys mean the frames can fail to save on
their own, and the result screen hides the entry point rather than offering a
walkthrough that would open empty.

**Rendering choices that matter.** Discarded boxes were first drawn 1 px grey,
which on grey asphalt changed zero pixels above a visibility threshold — the
stage looked like a no-op. They are now dashed magenta at 2 px, with dash-vs-solid
as the primary cue and colour secondary, the same belt-and-braces the severity
badges use for colour vision deficiency. When suppression discards nothing the
caption says so outright, because an unchanged frame otherwise reads as broken.

The walkthrough lives at `/process` and is reached from **Show Process** on either
result screen. It returns to the exact screen it came from, query string included
— for a report that carries the pinned location.

---

## 5. Database

Supabase Postgres. Run `migration.sql` in the SQL editor; it is idempotent.

### `UserDetail`

| Column | Type | Notes |
|---|---|---|
| `userloginuuid` | uuid PK | references `auth.users(id)` |
| `username` | text | |
| `email` | text | |
| `role` | text | `user` or `admin`, defaults to `user` |

### `FileUpload`

One row per submitted assessment.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | identity |
| `userid` | uuid | references `UserDetail` |
| `damage_type` | text | label of the worst detection |
| `severity` | text | overall, worst-of |
| `state` | text | `Needs Action`, `Pending`, `In Review`, `Resolved` |
| `uploadtime` | timestamptz | |
| `address` | text | reverse-geocoded pin |
| `lat`, `lng` | numeric | **not** `latitude`/`longitude` — the earlier name here was wrong |
| `image_url` | text | annotated image |
| `file_name` | text | |
| `confidence` | real | numeric, not text |
| `detection_details` | text | generated bulletin |
| `observation_details` | jsonb | full distress array |
| `gsd_mm_px` | double precision | GSD used for this image |
| `severity_fuzzy`, `severity_crisp`, `severity_confidence` | text | Phase 2 |
| `severity_dpwh_nw` | text | literal DPWH Narrow/Wide verdict |
| `membership_trace` | jsonb | Phase 2, explainability |
| `crack_density_pct` | double precision | Phase 2 |
| `corrected_severity`, `corrected_damage_type` | text | admin's verdict, stored **beside** the model's |
| `correction_note` | text | why it was corrected |
| `corrected_at` | timestamptz | |
| `corrected_by` | uuid | the admin who corrected it |

`lat`, `lng` and `confidence` have no NOT NULL constraint: a quick scan can be
submitted without a pin, and dropping those constraints is what allows it.

**Corrections are additive, never destructive.** `severity` and `damage_type` are
model output; overwriting them would destroy the evidence RQ3 and RQ4 rest on.
`address`, `lat` and `lng` are user-supplied, so a wrong pin is corrected in
place. Every correction is a licensed engineer disagreeing with the model on a
specific detection — the paired data Cohen's Kappa needs, collected as a
by-product of ordinary use. `backend/eval/compare.py` computes it.

### Row Level Security

The anon key ships to every browser, so RLS is the only real boundary.

- `public.is_admin()` — SECURITY DEFINER, avoids recursion inside `UserDetail` policies
- `UserDetail` — read/update own row; admins read all and update roles; signup insert is forced to `role = 'user'`
- `FileUpload` — insert and read own rows; admins read all and are the only ones who can change `state`

---

## 6. Setup

### Prerequisites

Node.js 20+, Python 3.14, and [Ollama](https://ollama.com) with `ollama pull llama3.2`.

### Model weights

Not in the repository. Place in `backend/`:

| File | Size | Source |
|---|---|---|
| `ultrabestroad.pt` | 23 MB | trained road segmentation model |
| `best.pt` | 54 MB | trained crack detection model |
| `sam_files/sam_vit_b_01ec64.pth` | 375 MB | https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth |

Startup fails immediately and names the missing path if any are absent.

### Backend

```bash
python -m venv deps
deps\Scripts\activate
pip install -r backend/requirements.txt

cd backend
python -m uvicorn api:app --host 127.0.0.1 --port 8000
```

Verify at http://127.0.0.1:8000/docs.

### Frontend

```bash
npm install
cp .env.local.example .env.local   # then fill in real values
npm run dev
```

`.env.local` requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
and `API_BASE_URL`. Note `API_BASE_URL` has no `NEXT_PUBLIC_` prefix: it is
server-side only, so the browser never learns the backend host.

### Database

Run `migration.sql` in the Supabase SQL editor.

---

## 7. Evaluation

Metrics the study commits to (section 3.3, Testing Stage):

| Dimension | Metric | Status |
|---|---|---|
| Neural accuracy | YOLO Precision, Recall, mAP50, mAP50-95 | `backend/mod_check.py` |
| Segmentation | SAM mask IoU | `eval/metrics.py: mask_iou` |
| Skeleton | clDice | `eval/metrics.py: cldice` |
| Spatial | IPM MAPE vs physical tape measures | `eval/metrics.py: mape` |
| Reasoning | Cohen's Kappa vs human inspectors | `eval/compare.py` |
| RQ3 | Fuzzy vs baselines, exact McNemar (paired) | `eval/compare.py` |
| Software quality | ISO 25010, 4-point Likert | `eval/metrics.py: weighted_mean` |

All are implemented and unit-exercised; the outstanding dependency is ground-truth
data collection, not code. `eval/README.md` states exactly what each metric needs.

**Workflow.** `python -m eval.run_batch` exports one CSV row per detection with all
three severity methods. Inspectors grade the same images double-blind into a second
CSV. `python -m eval.compare` then reports Cohen's Kappa per method (RQ4) and an
exact McNemar test of fuzzy against each baseline (RQ3).

McNemar is used rather than comparing two accuracy figures because the methods
grade the *same* detections: the samples are paired, and an unpaired comparison
would discard that and lose power.

Expert validation: 10 to 15 participants across civil engineers, on-field
inspectors, and IT/data science professionals, under a double-blind protocol in
which inspectors assess without seeing system output.

---

## 8. Limitations

1. **Camera calibration** — IPM accuracy assumes adherence to capture guidelines
   (chest height, approximately 2 m). Deviation warps the transform.
2. **Environment** — daytime, clear, adequately lit road images only. Not
   optimised for night, heavy rain, flooding or obstructed roads.
3. **2D optical only** — no LiDAR or depth sensor, so true defect depth and
   sub-surface volume cannot be measured. This is not a gap in the grading:
   the governing standard does not stratify potholes by severity at all, so
   depth is not a required input. See section 3.
4. **Surface level only** — internal pavement structure is not evaluated.
5. **Administrative** — a localised reporting and assessment tool. No automated
   crew dispatch, and not integrated with DPWH or Caloocan LGU IT systems.

---

## 9. Changelog

### Phase 5 — Console, canvas and the pipeline walkthrough (2026-09-20)

- **Admin navigation** now shows Console · Dashboard · Reports · Users. The
  wordmark links to `/admin` for admins rather than the public home page.
- **One background for every tab.** There were three: a flat `#525252` on the
  admin tabs, a flat `#1a1a1a` on `/report-damage`, and nothing elsewhere. The
  grey was the worst — black panels on a mid-grey sheet read as holes punched
  through the page rather than cards raised off it. A single canvas is now
  painted on a fixed `body::before` (not `background-attachment: fixed`, which
  iOS sizes wrongly and which repaints per scroll frame), and the whole surface
  scale was re-ordered so lightness means elevation.
- **`/admin/users` brought onto the pattern** — it was the one admin tab with no
  hero band and a flat `bg-zinc-900` card.
- **"Fix report" button added.** The modal, its state and its save handler had
  all shipped; nothing called `setFixing`. The feature was complete except for
  the way in.
- **Pipeline walkthrough** — see §4c. New `/process` route.
- **The result screen is returnable.** It cleared the pending scan after
  analysing, so re-mounting it showed *"No image found to analyze"* — which broke
  the browser's back button too, and had done since before `/process` existed.
  The finished result is now kept, keyed by path, and carries a `submitted` flag
  so a restored screen cannot file the same report twice.
- **Contrast re-checked against the new surfaces.** `text-gray-600` measured
  2.4:1 on dark and moved to `gray-500` in four places; the three uses on white
  were left alone. The severity palette still passes — the High badge uses
  `#f87171` for text at 6.5:1, with `#dc2626` only as a 15% fill.

### Phase 0 — Security and reproducibility (2026-09-17)

- **Removed a hardcoded Google Gemini API key** that had been committed to a
  public repository. The Gemini dependency was removed entirely in favour of a
  local model. *The exposed key must be revoked manually.*
- Added `backend/.env.example` and `.env.local.example`; extended `.gitignore`
  for Python artifacts, model weights and datasets.
- **Untracked the training dataset, training runs, model weights and
  `__pycache__`** — 7,927 tracked files reduced to 39.
- Added `backend/requirements.txt`, pinned. There had previously been no Python
  dependency manifest of any kind.
- Wrote `migration.sql`: schema reconciliation, data migration and RLS policies.

### Phase 1 — Core loop (in progress, 2026-09-17)

- **Replaced the cloud LLM with a local Ollama model**, satisfying the study's
  data-privacy commitment. Neither `google.generativeai` nor `segment_anything`
  had ever been installed, so the backend had never successfully started.
- Downloaded the missing SAM checkpoint; model paths now resolve relative to the
  module, and startup fails loudly instead of reporting false success.
- **Corrected GSD from 1.5 to 4.357 mm/px** per section 3.3.C. Lengths had been
  understated by a factor of ~2.9 and areas by ~8.4.
- **Overall severity is now the worst detection**, not the first. Previously an
  image whose first detection was a hairline crack reported Low even when it also
  contained a high-severity pothole.
- **Non-maximum suppression now takes effect.** Its result had been computed and
  discarded, so overlapping duplicate detections reached the output.
- **Report submission now writes to `FileUpload`**, the table the admin console
  reads and the one named in the ERD. It previously wrote to `damage_reports`,
  which nothing read, so no submitted report could ever reach an administrator.
  The payload now carries every field the admin screens render.
- All analysis calls route through `/api/analyze` using `API_BASE_URL`. Hardcoded
  `localhost:8000` calls from the browser are gone.
- Fixed a back button that pointed at a non-existent route.
- Unified two divergent localStorage keys into `utils/pendingScan.ts`, which also
  downscales images to 1600 px so the storage quota is no longer reachable.
- Restored the admin route guard against the real Supabase session cookie.
- Supabase client no longer throws during module evaluation when credentials are
  absent, which had been breaking the production build.

**Verified:** TypeScript clean, production build green across 11 routes, and a
real Caloocan road image analysed end to end in 24.2 s — four distresses detected,
metrics computed at 4.357 mm/px, and a maintenance bulletin generated locally.

### Phase 2 — Thesis contribution (2026-09-17)

- **Built the Fuzzy Logic engine** the objectives commit to (`fuzzy_engine.py`):
  overlapping trapezoidal membership functions over mean width and crack density,
  two rule bases selected by defect type, and a defuzzified 0-100 severity score.
  This closes the contradiction whereby Chapter 1 promised fuzzy reasoning while
  section 3.3.C documented crisp thresholds.
- **Crack density is now measured** and supplied to both the engine and the report
  generator. The previous prompt asked the model to analyse an "Overall Extent %"
  that was never computed, so that figure was invented on every run.
- **Area defects are graded by extent, not mean width.** Alligator cracking at
  2.0 mm but 55% extent now grades High where the crisp rule returned Low.
- **Three severity outputs per detection** — fuzzy, crisp and confidence-only —
  plus a membership trace, returned by the API and persisted to `FileUpload`.
  This is the dataset research question 3 requires.
- **Implemented privacy blurring** (section 3.3.D), running before any detection
  or storage.
- **Interventions and priority are resolved symbolically**, not by the language
  model, which now writes only the narrative summary. Asked to restate decisions,
  a 3B model duplicated lines per detection, prescribed mill-and-overlay for a
  transverse crack, and emitted two priority levels at once.
- **Added the evaluation harness** (`backend/eval/`): mask IoU, clDice, MAPE,
  Cohen's Kappa, weighted mean, a batch runner and a comparison tool.
- Every bulletin now carries the preliminary-assessment disclaimer required by
  section 3.5.

**Verified:** the fuzzy engine exercised across the input space; the eval harness
validated on synthetic data (exact McNemar p=0.0078 at 8 discordant pairs,
p=0.2500 at 3); TypeScript clean; and the same road image re-analysed end to end
in 19.6 s producing 10.24% measured density, three differing severity grades per
detection, and a correctly-mapped intervention list.

**Outstanding for the paper:** density membership bands and the intervention table
are provisional pending the DPWH Road Inventory Manual (2019); section 3.3.C and
the abstract's severity definition both need rewriting to match the code.

### Threshold alignment (2026-09-17)

- **Severity thresholds aligned to the standard distress definitions**: crack
  width bands moved from the study's uncited 3 / 6 mm to **6 mm and 19 mm**, and
  density bands anchored on the Maximum Allowable Extents (70% / 30% / 10%).
- **Potholes are no longer graded.** The standard does not stratify them, so a
  detected pothole reports a fixed severity. This also settles the depth question:
  depth is neither measurable with 2D optics nor required by the standard.
- **The crisp baseline now shares the fuzzy engine's cut points**, so the RQ3
  comparison isolates the reasoning method rather than confounding it with a
  change of threshold values. The original 3 / 6 mm rule is retained as
  `severity_legacy_crisp`.

**Effect on results:** the same road image previously returned an overall grade of
High with every detection saturating at the top band. It now returns **Medium**,
with four detections at 11.7-12.6 mm correctly placed in the 6-19 mm Medium band.
The legacy thresholds graded all four High.

**Outstanding:** confirm all values against the DPWH Visual Road Condition
Assessment Manual, which is not publicly downloadable.

### DPWH threshold correction (2026-09-17, later same day)

The **DPWH Visual Road Condition Assessment Manual 2019 v2 was obtained** — it is
attached in full to D.O. 120 s.2019, which *is* publicly downloadable from
dpwh.gov.ph. An earlier fetch had failed for want of a browser user-agent, and
the incorrect conclusion was drawn that the manual was unavailable.

The manual's actual criteria differ from the ASTM D6433 values used in the
previous revision:

| | Previous (ASTM D6433) | **Corrected (DPWH)** |
|---|---|---|
| Crack severity bands | 3 levels: ≤6 / 6–19 / >19 mm | **2 levels: ≤3 mm Narrow, >3 mm Wide** |
| Extent bands | Maximum Allowable Extent 70/30/10% | **BRM boundary ~55% of lane area** |
| Potholes | not stratified (US manual) | **not graded — counted; 1 = 0.25 m²** |

The study's **original 3.0 mm figure was correct all along**; its 6.0 mm second
cut has no DPWH basis. Added `severity_dpwh_nw`, the literal Narrow/Wide verdict,
alongside the graded outputs. Full evidence in `proof.md`.

### Interface changes (2026-09-17, later)

- **Road gate added.** Images with under 15% detected road surface are refused
  with HTTP 422 rather than analysed. See §4a.
- **All preliminary-assessment disclaimers removed** at the researcher's
  request — both the result-screen banner and the bulletin's Note section.
  ⚠️ *Section 3.5 of the paper commits to a "mandatory disclaimer" stating that
  assessments are preliminary and must be validated by a licensed Civil Engineer
  or DPWH official. **The interface no longer carries one anywhere.** Section 3.5
  must be revised to match the shipped system before defence.*
- **Sign-in / sign-up redesigned.** The previous modal was a fixed 800x500 box
  with absolutely-positioned half-panels and a sliding cover; it overflowed the
  viewport on a phone. Now one column on mobile, two on desktop, with a
  segmented control, password visibility toggle, Escape-to-close, focus
  management and scroll lock. Opens on Sign in, matching its trigger button.
