# Update Log

Every change made to this project during the remediation of **2026-09-17**, in the
order it was done. Problem IDs (P1–P38) match the registry in the Obsidian vault
(`NeuroSymbolic/Problem Registry.md`).

**Status key:** ✅ done · ⚠️ needs Gab · 📄 paper edit outstanding

---

## Summary

| Phase | Scope | Items | Status |
|---|---|---|---|
| 0 | Security and reproducibility | 5 | ✅ (1 ⚠️) |
| 1 | Core loop | 13 | ✅ (1 ⚠️) |
| 2 | Thesis contribution | 8 | ✅ (1 📄) |
| — | DPWH threshold alignment | 4 | ✅ (1 ⚠️) |
| 3 | User interface | 12 | ✅ |

**Verification at each phase:** `npx tsc --noEmit` clean, `npm run build` green
across 11 routes, `npx eslint` clean, and a real Caloocan road image analysed end
to end through the live backend.

---

## Phase 0 — Security and reproducibility

### P1 ✅⚠️ Gemini API key was live on a public GitHub repository
`backend/api.py:32` hardcoded a Google Gemini key, and it was committed in
`451449d` and readable at the raw URL on `main` of a **public** repo.

- Removed the key and the entire `google-generativeai` dependency (see D2).
- Added `backend/.env.example` and `.env.local.example`.

⚠️ **The key itself must still be revoked** at aistudio.google.com/apikey.
Deleting the line does not remove it from git history.

### P2 ⚠️ Row Level Security was unverified
The Supabase anon key ships to every browser, so RLS is the only real boundary.

- Wrote `migration.sql` with `public.is_admin()` as a `SECURITY DEFINER` function
  (querying `UserDetail` from inside a `UserDetail` policy would recurse).
- Owner-read/write and admin-read-all policies for both tables.
- Sign-up insert is forced to `role = 'user'` so nobody can self-promote.

⚠️ **Must be run** in the Supabase SQL editor.

### P3 ✅ Repository carried the dataset, weights and bytecode
`.git` was 202 MB across 7,927 tracked files; 7,868 of them were `road-3/`.

- Untracked `road-3/`, `runs/`, `backend/__pycache__/`, `best.pt`,
  `ultrabestroad.pt` (files kept on disk).
- **7,927 → 39 tracked files.**

### P4 ✅ `deps/` virtualenv was untracked only by luck
Extended `.gitignore` with `deps/`, `__pycache__/`, `*.pyc`, `*.pt`, `*.pth`,
`runs/`, `road-3/`, plus `!` exceptions so the `.env.example` files survive.

### P5 ✅ No Python dependency manifest existed
Added `backend/requirements.txt`, fully pinned and verified against Python 3.14.6.

---

## Phase 1 — Core loop

### P6 ✅ SAM checkpoint was missing
`sam_files/sam_vit_b_01ec64.pth` did not exist, so every analysis returned 500.
Downloaded (375 MB) and documented.

### P7 ✅ Model paths resolved against the working directory
`YOLO('best.pt')` only worked if the server was started from inside `backend/`.
Now resolved via `Path(__file__).resolve().parent`.

### P8 ✅ Model-load failures were swallowed
The loader caught exceptions, printed them, then printed *"Models loaded
successfully! Server is ready."* regardless. Now fails at startup naming the
exact missing path.

> **Discovered here:** neither `google.generativeai` nor `segment_anything` was
> installed in *any* environment on this machine, and both were imported at
> module scope. **The backend had never once started.** The `.pyc` files in
> `__pycache__` are from compilation, not from a successful run.

### P9 ✅⚠️ Submissions were written to a table nothing read
`UploadResultUi.tsx` inserted into `damage_reports`; every admin screen queried
`FileUpload`. **No submitted report could ever reach an administrator.**

- Submit path rewritten onto `FileUpload`, the table in the paper's ERD.
- `migration.sql` migrates existing `damage_reports` rows before dropping it.

⚠️ Blocked until the migration is run.

### P10 ✅ Submit payload omitted most of what the admin renders
Now sends `damage_type`, `address`, `file_name`, `confidence`,
`detection_details`, `observation_details`, `uploadtime`, `state`, plus the
Phase 2 symbolic fields — all of which were already on screen at submit time.

### P11 ✅ Overall severity was the *first* detection, not the worst
`traced_data[0]['severity']` meant an image led by a hairline crack reported
"Low" even when it also contained a high-severity pothole. For a prioritisation
tool, that is the one direction the error must never go. Added `worst_severity()`.

### P12 ✅ Non-maximum suppression was computed and discarded
`filter_overlapping_boxes()` was assigned to `boxes_filtered` and then used only
as an is-it-empty guard, while the loop iterated the **unfiltered** boxes. Every
overlapping duplicate reached the output.

Fixed by returning kept *indices* rather than a `Boxes` slice, because masks,
confidences and class ids must be looked up at the same positions.

### P13 ✅ Back button pointed at a route that does not exist
`/report-damage/upload` → `/report-damage`.

### P14 ✅ The browser called the Python host directly
Hardcoded `http://localhost:8000` in two components meant nothing would work once
deployed. All analysis now routes through `/api/analyze`, which reads
`API_BASE_URL` server-side (deliberately no `NEXT_PUBLIC_` prefix).

### P15 ✅ `/api/analyze` existed but was never called
Now the only path to the backend.

### P16 ✅ GSD contradicted the paper
Code used `1.5` mm/px; the paper states `4.357` (§3.3.C). **Every length was
understated ~2.9×, every area ~8.4×.** Corrected, with an optional per-image
override.

### P17 ✅ Two localStorage keys, and a quota that could be hit
`/upload-media` wrote `pendingRoadScan`, `/report-damage` wrote
`upload_image_base64`, and only the second was ever read. Unified into
`utils/pendingScan.ts`, which also downscales to 1600 px so the ~5 MB quota is no
longer reachable.

### P18 ✅ Admin guard did nothing
`proxy.ts` had its redirect commented out and checked a cookie named `auth_token`
that Supabase never sets. Now matches the real `sb-*-auth-token` cookie family.

### Extra — Supabase client crashed the production build
Not in the original registry. `utils/supabase.ts` used
`process.env.NEXT_PUBLIC_SUPABASE_URL!` on a value that is genuinely absent (there
is no `.env.local`), so `createClient` threw during module evaluation and took
down the build while prerendering `/_not-found`. Missing configuration is now a
loud, attributable warning instead.

---

## Phase 2 — Thesis contribution

### P19 ✅ No Fuzzy Logic engine existed
Chapter 1 and RQ3 commit to fuzzy reasoning; the code had three crisp `if/elif`
cuts on one variable. Built `backend/fuzzy_engine.py`:

- Overlapping trapezoidal membership functions over **mean width** and **crack
  density**, Mamdani inference, centroid defuzzification to a 0–100 score.
- **Two rule bases selected by defect class** — linear (width-led) and area
  (extent-led) — nine rules each.

### P20 ✅ Crack density was never computed
The prompt asked the model to analyse an *"Overall Extent %"* that was never
passed — **it had been inventing that number on every run.** Density is now
measured as defect mask area over analysed road area, and supplied to both the
engine and the report.

When IPM succeeds the warp fills the frame with road, so the frame is the
denominator; when it fails, the road mask area is used instead, so sky and verge
are not counted as road.

### P21 ✅ Area defects were graded by crack width
Potholes and alligator cracking were graded on mean width even though their area
was already computed. The area rule base is now extent-led.

### P22 ✅ RQ3 had no data
Every detection now carries `severity_fuzzy`, `severity_crisp`,
`severity_confidence` and `severity_legacy_crisp`, plus a `membership_trace` —
the explainable logic trace the architecture model promises. All are returned by
the API and persisted to `FileUpload`.

### P23 ✅ Cloud Gemini contradicted the stated privacy position
Replaced with a local Ollama `llama3.2` model over HTTP. Nothing leaves the host,
which is what the §3.5 RA 10173 claim requires. *(Done early, in Phase 0.)*

### P24 ✅ Privacy blurring was absent
§3.3.D promises "automated blurring for data privacy". Implemented with stock
COCO YOLOv8n, running **before any detection or storage**:

- People blurred entirely; vehicles blurred across the bottom 45% where plates sit
  (blurring the whole vehicle would cover the defect behind it).
- Kernel scales with region size, so a small distant face is as unrecoverable as a
  large near one.
- Load failure is **fatal at startup** — a privacy control that quietly does
  nothing is worse than none.

### P25 📄 Three conflicting severity definitions
The abstract says bounding-box area over frame; the objectives say IPM
morphology; the code used mean width. The code now has one definition.
📄 **The abstract and §3.3.C still need rewriting to match.**

### P26 ✅ No evaluation harness
Added `backend/eval/`: `mask_iou`, `cldice`, `mape`, `cohens_kappa`,
`weighted_mean`, a batch runner exporting one CSV row per detection, and a
comparison tool reporting Cohen's Kappa per method (RQ4) and **exact McNemar**
for fuzzy against each baseline (RQ3).

McNemar rather than comparing two accuracy figures, because the methods grade the
*same* detections — the samples are paired, and an unpaired test would discard
that and lose power.

### Extra — the language model could not be trusted with decisions
Asked to restate the assessment, `llama3.2` prescribed **mill-and-overlay for a
transverse crack** (that is alligator's intervention), duplicated one line per
detection instead of per type, and emitted **two priority levels at once**.

Interventions and priority are now resolved symbolically from
`fuzzy_engine.INTERVENTIONS`; the model writes only the narrative paragraph. More
defensible for a neurosymbolic system too — every recommendation traces to a
table rather than a sampled token sequence.

---

## DPWH threshold alignment

### ✅ Severity thresholds realigned
The study's 3.0 / 6.0 mm cuts were **uncited and roughly 3× stricter than the
standard** at the upper bound. Combined with the GSD correction they pushed
nearly every measured defect to High.

| Distress | Low | Medium | High |
|---|---|---|---|
| Longitudinal / Transverse / Alligator | ≤ 6 mm | 6–19 mm | > 19 mm |
| Pothole | *not stratified — present or absent* | | |

Density bands are now anchored on **Maximum Allowable Extent** — the share of area
at which each severity drives the condition index to failure: **70% low, 30%
medium, 10% high** for alligator cracking.

**Effect:** the same road image went from overall **High** (all four detections
saturating at the top band) to overall **Medium**, with 11.7–12.6 mm cracks
correctly placed in the 6–19 mm band.

### ✅ Depth excluded, and justified twice over
1. It cannot be measured — 2D optical only, no depth sensor (delimitation 3).
2. The standard does not ask for it — potholes are not stratified by severity at
   all.

A detected pothole now reports a fixed **High**, matching DPWH's three-day repair
window for potholes: the same judgement expressed as urgency rather than a
severity band. `POTHOLE_STRATIFIED = False` controls this.

This converts what read as a limitation into a standards-compliance statement.

### ✅ Crisp baseline shares the fuzzy engine's cut points
Had the baseline kept different threshold *values*, "fuzzy vs crisp" would
confound two changes — the reasoning method and the numbers — and RQ3 could not
attribute any difference to fuzzy reasoning. The original 3/6 mm rule is retained
separately as `severity_legacy_crisp`.

### ⚠️ Provenance caveat
The DPWH *Visual Road Condition Assessment Manual* (D.O. 120 s.2019) is **not
published for download** — only the order's metadata page is public. The values
used come from the distress manual DPWH visual assessment practice follows
(ASTM D6433 / LTPP lineage).

⚠️ **Request the manual from the DPWH Planning Service and confirm.** Every value
is a module-level constant, so substituting confirmed figures is a one-file edit.

---

## Phase 3 — User interface

### P27 ✅ No capture-guidelines screen existed
The wireframes require users to "acknowledge capture guidelines", and the study's
own delimitation says IPM accuracy "relies entirely on known camera parameters" —
yet nothing ever prompted them.

Added a gate before both upload flows: four numbered rules (chest height, 2 m
distance, daylight, unobstructed surface) plus a **road width input** that sets
the scale.

> **Where 4.357 mm/px comes from.** The backend warps to a fixed 700×700
> bird's-eye view, so GSD is a property of the warp: `GSD = road width (mm) / 700`.
> The paper's 4.357 implies 3.05 m — one standard lane. That gives inspectors a
> physical quantity to adjust rather than an opaque number.

Acknowledgement is held in `sessionStorage`, so it lapses when the browser closes
and the guidelines are re-read each session.

### P28 ✅ No preliminary-assessment disclaimer
§3.5 mandates one. Now on every result screen and at the foot of every generated
bulletin.

### P29 ✅ Dead configuration files
The project is on **Tailwind v4**, which is CSS-first and does not auto-load a JS
config without an `@config` directive — which was absent. `tailwind.config.ts` was
therefore entirely dead, and `oasysBlue` was referenced nowhere. Deleted it and
the duplicate `postcss.config.js`.

### P30 ✅ Hardcoded hex everywhere while tokens went unused
`#1E1E1E`, `#262626`, `#D9D9D9`, `#525252`, `#3b82f6` were scattered across pages.
All moved onto `@theme` tokens in `globals.css`, now the single source of truth.

### P31 ✅ Severity was inconsistent and colour-only
Medium was **yellow** on the dashboard and **orange** on the reports page. For a
tool whose entire output is a severity grade, that is the one colour that cannot
drift.

Added `components/Severity.tsx` with one vocabulary and **three independent cues**
per badge — colour, a distinct shape (circle / triangle / octagon), and the word
itself — because roughly 8% of male inspectors, the stated user group, have some
colour vision deficiency.

**The palette was computed, not chosen by eye.** Validated with the colour
validator:

| Surface | Palette | Result |
|---|---|---|
| Dark | `#16a34a` `#fbbf24` `#dc2626` | CVD separation 15.2, normal-vision 27.6, contrast ≥3:1 — pass |
| Light | `#15803d` `#854d0e` `#dc2626` | normal-vision 17.5, contrast pass |

The first palette attempted (`#d97706` amber) **failed** the normal-vision floor
at ΔE 14.4 against red — and those are adjacent severity levels, the most
important distinction in the app.

Two accepted trade-offs, both deliberate:
- The dark amber sits above the *categorical* lightness band. That band exists to
  keep series co-equal, and severity is deliberately **not** co-equal.
- On light surfaces the red/amber pair separates poorly under deuteranopia (2.8)
  and cannot be fixed while keeping traffic-light semantics — both are dark warms.
  That pair is carried by shape and by the word.

### P32 ✅ Desktop-only, for a field-inspector product
Result columns were pinned at `h-[650px]`, the hero was `text-9xl`, and admin
tables had no mobile treatment.

- Result screen stacks; panels scroll internally instead of being fixed height.
- Hero scales `text-6xl` → `text-9xl` across breakpoints.
- Admin tables replaced with responsive lists.
- Navigation gained a mobile menu — five items in a row overflowed a phone.
- `overflow-x: hidden` on body; reduced-motion support; visible focus rings
  (the file inputs are hidden inside `<label>`, so focus was previously invisible).
- Added a skip-to-content link.

### P33 ✅ No camera capture
`accept="image/*"` with no `capture` attribute meant a phone opened a file
browser — the wrong tool outdoors. Added `capture="environment"` to both uploads.

### P34 ✅ The dashboard chart was fabricated
A hardcoded SVG path with six fixed points labelled Mon–Sat that never changed,
beside a filter dropdown that did nothing. **A dashboard that invents its own
numbers is worse than no dashboard.**

Replaced with real aggregation from `FileUpload`:
- **Submissions over time** — a line chart with a crosshair tooltip, over a working
  7-day / 30-day / 12-month range selector. Buckets are seeded so gaps render as
  zero rather than compressing the axis.
- **Damage type breakdown** — horizontal bars with direct labels (horizontal
  because the category names are multi-word and would need rotating otherwise).

Both are single-series, so no categorical palette and no legend — the title names
the series.

### P35 ✅ Dead buttons
"Export Data" now downloads a real CSV with proper quote escaping. "Review" now
deep-links to `/admin/reports?report=<id>`, which expands that report.

### P36 ✅ Missing admin map
"Provide accurate map view of the local area" is a named use case. Added a Leaflet
map of all report locations, with pins that carry a severity glyph as well as a
colour — a map read at a glance is exactly where colour-only encoding fails
hardest.

### P37 ✅ `/about` contained none of the actual copy
It had generic mission/vision text. Rewritten with the real content: what the tool
does, the four defect types, all ten pipeline stages, the severity legend (using
the corrected thresholds, not the old "area relative to frame" description), key
features, how it is evaluated, and who it helps.

### P38 ✅ Blocking dialogs, unoptimised images, no metadata
- Every `alert()` and `confirm()` replaced with inline messages, accessible
  modals (`role="dialog"`, `aria-modal`) and dismissible toasts.
- Root layout is no longer `"use client"` — that had opted the **entire app** out
  of Server Components and made a `metadata` export impossible, so the site had no
  title or description at all. Now exports proper metadata and viewport.
- The removed nav-hiding logic targeted `/admin/reports/<id>`, a route that does
  not exist; reports expand inline, so the condition never fired.

### Extra — lint errors fixed along the way
- `Navigation.tsx`: closed the mobile menu on click rather than in an effect on
  `pathname`, which fired a synchronous `setState` on every navigation.
- `admin/layout.tsx`: read `useRef().current` during render to seed state and
  looped its effect on its own output. Replaced with a plain state machine.
- `captureSettings.ts`: `sessionStorage` is an external store, so it is read with
  `useSyncExternalStore` rather than copied into state inside an effect.
- `LoginModal.tsx`: removed `any` types and unused bindings.

---

## Still outstanding

| # | Item | Why only you can do it |
|---|---|---|
| 1 | **Revoke the Gemini API key** | It was public on GitHub; assume compromised |
| 2 | **Run `migration.sql`** | Needs Supabase SQL editor access |
| 3 | **Obtain the DPWH manual** | Not published for download; request from Planning Service |
| 4 | **Paper edits** | §3.3.C thresholds, the abstract's severity definition, the local LLM, the blurring step and the density metric |

Ground-truth data collection also remains before the evaluation harness can
produce results: annotated masks, tape measurements, and double-blind inspector
grades from 10–15 participants.

---

## Files added

```
backend/fuzzy_engine.py          symbolic severity engine, interventions, priority
backend/requirements.txt         pinned dependencies
backend/.env.example             backend configuration template
backend/eval/metrics.py          IoU, clDice, MAPE, Cohen's Kappa, weighted mean
backend/eval/run_batch.py        batch analysis to CSV
backend/eval/compare.py          RQ3 / RQ4 statistical comparison
backend/eval/README.md           evaluation workflow
components/Severity.tsx          one severity vocabulary, validated palette
components/CaptureGuidelines.tsx pre-upload acknowledgement gate
components/Charts.tsx            trend line and bar tally
components/ReportsMap.tsx        admin map of defect locations
utils/pendingScan.ts             image handoff, with downscaling
utils/captureSettings.ts         capture guidelines and GSD
migration.sql                    schema reconciliation, data migration, RLS
documentation.md                 system documentation
update-log.md                    this file
.env.local.example               frontend configuration template
```

## Files removed

```
tailwind.config.ts               dead under Tailwind v4 (no @config directive)
postcss.config.js                duplicate of postcss.config.mjs
```

---

## DPWH threshold correction — 2026-09-17 (post Phase 3)

### Obtained the actual DPWH manual

**D.O. 120 s.2019 is publicly downloadable** from dpwh.gov.ph and contains the
*Visual Road Condition Assessment Manual 2019 Version 2* in full (12.4 MB,
8,748 lines of extracted text). The earlier conclusion that it was unavailable
was wrong — the first download failed only because the request did not send a
browser user-agent, returning a 212-byte non-PDF body.

### What the manual actually says

| Finding | Evidence |
|---|---|
| Crack severity has **two bands, split at 3 mm** — Narrow 'N' ≤ 3 mm, Wide 'W' > 3 mm | Manual, "Crocodile, Longitudinal and Transverse Cracking", SEVERITY |
| Measured as the **predominant average crack width** with a printed Crack Width Scale | same section; equipment list §C.9; template at page 72 |
| Extent = **area of cracking ÷ segment area, as a percentage** | same section, METHOD |
| Defects are rated on a **two-dimensional scale** of severity and extent; severity banded in **2 or 3 levels** | manual, assessment overview |
| **Potholes are counted, not graded**; 1 pothole = 0.25 m² | POTHOLES (Flexible Pavement) |
| VCI weights: Crocodile Narrow 3.5 / Wide 5.9, Transverse Narrow 3.3 / Wide 5.5, Potholes 0.36 | Table 4, Asphalt VCI |
| Response times: Potholes 3 d, Alligator Cracks 3 d, Cracks 3 d | D.O. 47 s.2024, Table 4.1 |
| Inspection weights: Potholes 10%, Alligator Cracks 9%, Cracks 5% | D.O. 47 s.2024, Table 6.1a |
| Beyond Routine Maintenance: alligator cracking > 167.5 m² continuous | D.O. 47 s.2024, Table 5.1 |

### Changes made

- **Crack width thresholds corrected from 6/19 mm to the DPWH 3 mm cut.** The
  6/19 mm figures were ASTM D6433 (US practice), not DPWH.
- Width membership functions rebuilt as two overlapping sets straddling 3 mm.
- Extent bands re-anchored on the ~55% Beyond Routine Maintenance boundary.
- Rule bases reduced to 2 × 3 = 6 rules each, with the area base escalating
  faster on extent per the Table 4 weights.
- **Added `severity_dpwh_nw`** — the literal DPWH Narrow/Wide verdict — so any
  rating can be checked against the standard unmodified. Propagated to the API
  response, the evaluation CSV export and the frontend types.
- `severity_crisp` now combines the same DPWH inputs with hard cuts, keeping the
  RQ3 comparison focused on the reasoning method rather than on threshold values.
- Pothole justification restated from the DPWH source directly rather than from
  the US manual.
- **`proof.md` created** — verbatim quotations, source URLs, statement-by-statement
  backing, and the exact commands to reproduce the verification.

### Sources ruled out

- **D.O. 27 s.2023** is the *Disaster and Incident Management Operations Manual*
  — no pavement distress criteria.
- **Bid bulletin 26DI0067** is a building construction contract; its "6mm" is
  floor-groove depth and its "19 mm" an architectural level drop.
- **Scribd "RBIA Theories and Procedures"** is a third-party re-upload, superseded
  by the primary PDF and not cited.
- **foi.gov.ph** proved unnecessary — the manual downloads directly.

---

## Interface changes — 2026-09-17 (post DPWH correction)

### ✅ Road gate — non-road images are now refused
`ultrabestroad.pt` must segment **>= 15%** of the frame as road surface before
analysis proceeds. Below that: **HTTP 422**, `error: "no_road_detected"`, with a
message telling the user how to reframe the shot.

Previously **any** image was accepted and produced a full, confident assessment.

**Verified:**

| Image | Road coverage | Result |
|---|---|---|
| Real Caloocan road photo | **68.41%** | accepted — 4 detections, Medium |
| Flat indoor wall | 0.0% | refused 422 |
| Random noise | 0.0% | refused 422 |
| Sky with sun | 0.0% | refused 422 |

`/api/analyze` forwards the backend's own message instead of a bare status code,
and the result screen renders a dedicated "No road surface detected" state with
capture guidance rather than a generic failure.

### ✅ All preliminary-assessment disclaimers removed
Removed from **both** surfaces at the researcher's request:
- the amber banner on the result screen
- the `Note:` section appended to every generated bulletin

⚠️ **Paper action required.** Section 3.5 commits to a mandatory in-interface
disclaimer — *"the system interface will include a mandatory disclaimer stating
that all AI-generated assessments are 'preliminary' and must be validated by a
licensed Civil Engineer or DPWH official before any repair resources are
dispatched."* The interface no longer carries one anywhere, so §3.5 must be
revised to match the shipped system.

### ✅ Sign-in / sign-up redesigned
The old modal was a fixed `800x500` box with both forms absolutely positioned as
half-width panels behind a sliding blue cover. It worked at one viewport width
and overflowed the screen on a phone — the wrong half to optimise for, given the
stated user is an on-field inspector.

Now: one column on mobile, two on desktop; segmented Sign in / Sign up control
instead of the sliding cover; password visibility toggle; Escape to close; focus
moves into the dialog on open; background scroll locked; `aria-live` region for
messages. **Opens on Sign in**, matching the button that opens it — the previous
default showed Sign up, contradicting its own trigger.

All Supabase calls are unchanged.

### ✅ Sign-in panel content removed
The three-point value list and the "Scanning an image needs no account" footnote
were removed from the brand panel at the researcher's request. The panel now
centres the OASYS wordmark and strapline only.
