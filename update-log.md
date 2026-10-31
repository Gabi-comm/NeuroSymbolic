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

---

## Phase 4 — Auth, RLS and data hygiene (2026-09-20)

Supabase connected. The project is **OASYS** (`vybijjvazuopatbewras`), which sits in a
different organization from the account's three other projects, which is why it never
appeared in a project listing.

### ✅ Fixed a bug from Phase 1: the admin console was unreachable
`utils/supabase.ts` created the client with `storage: window.localStorage`, so the
session lived only in the browser. `proxy.ts` gates `/admin/*` by reading a **cookie** —
which was therefore never present. **The middleware redirected everyone away from the
admin console, signed-in administrators included.**

Migrated both to `@supabase/ssr` (already a dependency): `createBrowserClient` writes
cookies, `createServerClient` reads them in the middleware and route handlers, and the
middleware now refreshes the session on every request. The gate uses `getUser()` rather
than `getSession()`, because the latter only decodes a cookie a client could forge.

### ✅ Email verification
`mailer_autoconfirm` was `true` — anyone could sign up with an address they did not own
and the account confirmed instantly. Sign-up now passes `emailRedirectTo`, and the new
**`app/auth/callback/route.ts`** exchanges the emailed code for a session. The modal
shows a "check your email" state instead of silently doing nothing.

⚠️ **Enabling confirmation is a dashboard toggle only you can flip** — see below.

### ✅ Forgot password, end to end
`resetPasswordForEmail` was called with no `redirectTo`, there was no reset page, and
nothing handled `PASSWORD_RECOVERY` or called `updateUser`. The flow sent an email and
stopped. Added **`app/reset-password/page.tsx`** with explicit expired-link handling,
and routed the recovery link through the callback.

### ✅ RLS: user enumeration closed
`Allow everyone to read users` was `USING (true)` — any signed-in user could read all
14 emails, usernames and roles. Replaced with own-row access plus an admin policy
backed by a `SECURITY DEFINER` `is_admin()`. Self-delete dropped: it orphaned the auth
account and locked the user out with no way back.

### ✅ Sign-up made atomic
An `on_auth_user_created` trigger creates the profile in the same transaction as the
auth user. The old two-step approach had produced **nine orphan profiles** with a null
`userloginuuid` that could never sign in.

### ✅ Legacy data cleared
All 5 test accounts, 14 profiles and 2 test reports deleted. One of those reports
stored `"Error connecting to Gemini API: 403…"` as if it were a bulletin; the other was
pinned at lat 12, lng 13 — Central Africa — with `file_name: "FILE_NAME"`.

### ✅ Role assignment hardened
- **Last-admin guard**: a `BEFORE UPDATE OR DELETE` trigger refuses any change that
  would leave zero administrators. Previously the final admin could be demoted, leaving
  **no administrator and no interface able to create one**.
- **Audit trail**: `role_change_log` records who changed whose role, from what, when.
  Written only by a `SECURITY DEFINER` trigger, readable only by admins, with no write
  policies — an audit log a user can rewrite is not an audit log.

### ✅ `/admin` landing page
New front door for the console: who you are signed in as, four counts, and cards to
Dashboard, Reports and Users. Nav now points at `/admin`; the label is "Console".

### ✅ Auth redirects are no longer silent
`?signIn=required` and `?authError=` were being set but never displayed, so an expired
confirmation link looked like the app had ignored the click. **`AuthNotice`** renders
them and clears the parameter so a refresh cannot resurrect a stale message.

### ❌ Not done, deliberately
**No `password` column** (decision D6). Supabase Auth already stores a bcrypt hash in
`auth.users.encrypted_password`; a second copy would be a credential store to defend at
defence, would drift out of sync, and under the *old* RLS every signed-in user could
have read it. The ERD can show `userloginuuid → auth.users.id` without storing secrets.

**Verified:** `tsc` clean, eslint clean, build green across 17 routes. `/admin` returns
307 with `?signIn=required` for anonymous visitors. `/auth/callback` with no code
redirects with a legible message. Publishable key authenticates; anonymous reads of
`UserDetail` return `[]`.

---

## Scan / Report separation — 2026-09-20

### ✅ Fixed: submit hung forever
`handleSubmitReport` called `supabase.auth.getUser()` — a network round-trip —
before inserting. supabase-js serialises auth operations through the Web Locks
API, and the component also holds an `onAuthStateChange` subscription; the await
never settled, so the `finally` never ran and the button sat on "Submitting…".

The session is already read on mount and kept current by that subscription, so
the user id was available without asking the server. Removed the call and wrapped
the insert in a 30-second timeout, so a stall now reports itself instead of
spinning silently.

### ✅ Fixed: nav flickered "Sign in" → "Log out"
`authUser` starts null and the session check is async, so the first paint always
rendered "Sign in" before swapping. The auth slot now waits for the check and
shows a same-size placeholder, so there is no flicker and no layout shift.

### ✅ Submit is now a full confirmation panel
"Submitted ✓" on a button was too quiet for the end of the task. The panel turns
green: **"Report has been submitted"**, stating it is queued as *Needs Action*.

### ✅ Scan results are informational; only reports reach the queue
Driven by the paper. Figure 7.5: a report *"would not proceed without an attached
image or an address"*. Figure 7.6 lists **Location** among the result fields. The
use case list promises *"Provide Accurate Map View… Displays defect locations"*.

A scan has no address, so submitting one produced a report the admin could not
dispatch against and that the map — which filters on coordinates — could never
show.

- Scan results now offer **"Add location and report"** instead of Submit.
- The finished analysis is carried across in `utils/pendingAnalysis.ts`, so the
  report flow only needs a pin. Without it the hop would re-run road detection,
  SAM segmentation and the bulletin — about 25 seconds to reproduce a result
  already in hand.
- `/report-damage` treats a carried analysis as satisfying the photo step and
  shows the annotated image; choosing a different photo discards it, since it no
  longer describes that image.
- `UploadResultUi` takes a `mode` prop: `'scan'` bridges, `'report'` submits.

Types moved to `utils/pendingAnalysis.ts` so a util no longer has to import from
a component.

---

## Admin console refinements — 2026-09-20

### ✅ Admin navigation shows the console's sections
Signing in as an admin still showed Scan / Report / About — the public site's
pages. Admins now get **Dashboard · Reports · Users**, and the wordmark links to
`/admin` rather than the public home page. Non-admins are unchanged.

### ✅ `/admin` rebuilt around what needs doing
It led with totals, which is not what an administrator opens the console to
learn. It now opens with the state of the queue in a sentence — *"3 reports need
review, 1 high severity"* — then the three sections, then a live list of what is
waiting, with totals last as context.

### ✅ "Manage users" removed from the dashboard
Redundant once Users has its own nav item and its own card on `/admin`.

### ✅ Reports can be corrected, not just resolved
"Mark resolved" was the only action, which assumed every report was right. A
report can be right about the defect and wrong about where it is.

**Fix report** opens a modal for damage type, severity, address, a map pin and an
optional note.

**The important part is how it stores them.** Two kinds of field, handled
differently:

| Field | Treatment | Why |
|---|---|---|
| `address`, `lat`, `lng` | corrected **in place** | user-supplied, not model output — a wrong pin is simply wrong |
| `severity`, `damage_type` | original kept, correction stored **beside** it | this is the model's output, and overwriting it would destroy the evidence RQ3 and RQ4 rest on |

New columns: `corrected_severity`, `corrected_damage_type`, `corrected_at`,
`corrected_by`, `correction_note`.

**This is worth a paragraph in the paper.** Every correction is a licensed
engineer disagreeing with the model on a specific detection — precisely the
paired data Cohen's Kappa needs for RQ4. The system now collects its own
evaluation set as a by-product of being used, rather than requiring a separate
double-blind exercise. `corrected_severity` against `severity_fuzzy` is the
comparison; `backend/eval/compare.py` already computes it.

The UI shows the admin's verdict first and the system's original beside it
(*"corrected · was Medium"*), so nothing is hidden.

---

## Console, canvas and the pipeline walkthrough — 2026-09-20 (evening)

### ✅ Console tab restored to the admin nav

Replacing Scan/Report/About with Dashboard/Reports/Users had removed every
explicit link to `/admin` itself — only the wordmark reached it. The admin nav is
now **Console · Dashboard · Reports · Users**.

### ✅ "Fix report" button — the feature shipped without a way in

`FixReportModal`, the `fixing` state and the save handler were all wired from the
previous session. Nothing ever called `setFixing`. The button now sits beside
Mark resolved in the expanded card.

**Why the previous verification missed it.** I grepped the built bundle for
`"Fix report"` and `"Save correction"` — but both strings live *inside* the modal
component, so they were present because the component existed, not because
anything rendered it. The check confirmed the code shipped, not that it was
reachable. The re-check looked for the handler instead: `onClick:()=>k(e)` next to
the Mark-resolved button in the same flex row.

Every other `useState` setter in the app was then audited for the same defect.
None found. The only handler-less `<button>` is a deliberately disabled
placeholder on `/report-damage`.

### ✅ One background for every tab

There were three treatments:

| Surface | Before |
|---|---|
| admin tabs | flat `#525252` |
| `/report-damage` | flat `#1a1a1a` |
| everything else | nothing — fell through to `:root` |

The grey was the real problem: black gradient panels sat on a mid-grey sheet and
read as **holes punched through the page** rather than cards raised off it. Dark
UI reads elevation as lightness, and the admin console was inverting it.

A single canvas is now painted on a fixed `body::before` — near-black `#08090c`,
three low-alpha blue glows, and a 48 px survey grid at an alpha you register as
texture rather than see as lines. A pseudo-element rather than
`background-attachment: fixed`, which iOS renders at the wrong size and which
forces a full-layer repaint on every scroll frame.

`<body>` had to lose its own background for this: a block-level background paints
*after* negative-z-index descendants, so an opaque body would have hidden the
canvas entirely.

The rest of the scale was re-ordered to match — panels lifted to `#1f232b →
#12141a`, hero bands raised above the canvas so their rounded bottom edge still
reads, their invisible black `shadow-2xl` swapped for a blue-tinted lit edge, and
the nav reduced to 75% canvas with a heavy blur and a hairline.

While unifying: six dashboard panels and the reports filter moved off flat
`bg-zinc-900`; the resolution-status track and the map placeholders were
`zinc-800` — *lighter* than the panel they sat on, so they read as raised instead
of recessed.

**Contrast re-run against the new surfaces**, because changing a page background
changes every ratio on it. All pass. Two findings:

- Raw `#dc2626` measures 3.7:1, but the High badge uses `#f87171` for text
  (6.5:1) and `#dc2626` only as a 15% fill — non-text, so the 4.5 floor does not
  apply. Palette sound as shipped.
- `text-gray-600` measured **2.4:1** on the dark surfaces, below the 3:1 floor
  even for meta text. Four dark-surface uses moved to `gray-500`; the three on
  white were left alone.

**Kept deliberately:** the white report cards on `/admin/reports`. They are a
document metaphor, the validated `onLight` severity palette exists specifically
for them, and against a darker canvas they read with stronger figure/ground.

### ✅ `/admin/users` brought onto the pattern

The one admin tab with no hero band, using a flat `bg-zinc-900` card while the
others used the panel gradient. Two of four tabs looking like a different product
is a background problem. Its redundant "← Dashboard" button is gone — Dashboard
is a nav tab now.

### ✅ Pipeline walkthrough — `/process`

All six stages already ran on every request; only the final composite was ever
returned. The backend now emits each intermediate frame with a caption carrying
that run's real numbers. Full detail in `documentation.md` §4c.

Verified with 21 renderer unit tests (empty masks, zero detections, `masks=None`,
missing results) and an end-to-end run on a real road photo: accepted at 17.1%
coverage, six stages, 269 KB total, with Box Filtering genuinely exercised — 2
candidates in, 1 kept, 1 suppressed.

### ✅ Box filtering was invisible, not broken

Reported as *"box filtering doesn't seem to work properly."* The NMS logic was
correct; the **rendering** was the bug. Discarded boxes were drawn 1 px grey on
grey asphalt. Quantified: against a mid-grey road the old render changed **zero
pixels** above a visibility threshold. It was literally invisible, so the stage
looked like it had done nothing.

Now: kept boxes solid green at 3 px, discarded boxes **dashed magenta** at 2 px,
discarded drawn first so a survivor overlapping one sits on top. Dash-vs-solid is
the primary cue with colour secondary — the same belt-and-braces the severity
badges use, so it still reads with red-green colour deficiency.

Two related fixes:

- **The honest no-op case.** When NMS finds nothing to suppress, stage 4 is
  genuinely identical to stage 3, which reads as broken. It now says so:
  *"No detections overlapped by more than 40%, so all N were kept."*
- **A bug of mine.** The suppression count was gated on `masks is not None`, so a
  result with boxes but no masks would have reported *every* detection as a
  discarded duplicate — blaming NMS for something it never ran. Suppression needs
  only boxes; the gate is gone.

### ✅ The result screen is returnable

Wiring the `/process` back-arrow exposed that its destination was broken. The
result screen calls `clearPendingScan()` after analysing, so re-mounting it found
nothing and showed *"No image found to analyze. Please upload one again."* **That
applied to the browser's back button too, and had done since long before
`/process` existed.** It was only found by tracing what the new link would land
on.

The finished result is now kept in `sessionStorage`, keyed by path so a scan's
result cannot surface on the report screen.

That in turn opened a worse hole: a restored screen would show the Submit button
again and let the same report be filed twice. The stored result therefore carries
a `submitted` flag, and a restored screen that was already filed comes back
showing the confirmation.

The stored return URL is validated to same-site absolute paths — a tampered or
stale value cannot turn the arrow into an open redirect. Twelve tests against the
real compiled `parseStagePayload` cover it: query strings survive intact;
`https://`, `//host` and `javascript:` all fall back to `/`.

### ✅ Copy removed

"— the image is not re-processed." struck from the scan result's report prompt.

### Not done, noted

**Export CSV omits the correction columns.** `corrected_severity`,
`corrected_damage_type` and `correction_note` are the RQ3/RQ4 paired data, and
the dashboard export does not include them. Worth adding before the analysis.

---

## City Engineer revision — 2026-10-22

Source: the interview plan "OASYS revision plan for the City Engineer". Road
model and photo collection deliberately out of scope for this round.

### ✅ Scan removed; one report flow
`/upload-media` and its result page deleted. Report damage is the only entry:
photo, location, analyse, review, submit.

### ✅⚠️ GPS geotagging
EXIF GPS first, then the device Geolocation API, then a manual pin. Accuracy
circle, draggable pin, `location_source` and `location_accuracy_m` recorded.
Reverse geocoding moved server-side (`app/api/geocode`, Nominatim with
`extratags`, cached) and also returns barangay, road class and the OSM surface
tag that pre-fills pavement type. Overpass was dropped: no public instance
answered from the development network. ⚠️ Needs migration section F.

### ✅ Scale locked at 4.357 mm/px
The road-width input is gone. The capture rule frames one 3.05 m lane; the
guidelines screen says so. A reference card overrides it per photo (below).

### ✅ City Engineer's severity bands
`WIDTH_MF` gains an `open` term: Low < 3 mm (DPWH Narrow), Medium 3–10 mm,
High > 10 mm. Rule tables (`LINEAR_RULES`, `AREA_RULES`) are written once and
drive both the fuzzy engine and the crisp baseline, so RQ3 still compares the
reasoning method alone. Potholes are stratified on DPWH's 0.25 m² count unit:
one up to 0.25 m² is Medium, larger or several is High. 📄 Cite 10 mm as the
City Engineer's criterion (see `proof.md` §11).

### ✅ Width measured the DPWH way (`backend/measure.py`)
Predominant width = median of 2d − 0.5 along the skeleton, d the distance
transform. Within ±0.5 px on exact bands. Synthetic check
(`python -m eval.synthetic_width`), MAPE over widths ≥ 2 px:
**11.2% vs 27.6%** for the old area/length ratio at 4.357 mm/px, **12.4% vs
26.4%** at 0.5 mm/px. At 4.357 mm/px nothing under ~4.4 mm is resolvable; that
is a scale limit, and the reason for the card.

### ✅ Reference card (`backend/scale.py`, `public/reference-card.svg`)
ArUco DICT_4X4_50 id 7, 50 mm, detected in the bird's-eye view; sets
`gsd_mm_px` and `scale_source = reference_card`. Rendered card read at
0.2123 mm/px against a true 0.2121. Card regenerated by
`backend/tools/make_reference_card.py`.

**Finding:** a marker pasted into a real test photo came back with a side
stretch of 1.81 after IPM. The warp does not scale x and y equally, so a
measured width depends on crack orientation. The card's geometric mean is used;
a per-axis scale is the proper fix and is not done.

### ✅ Repair per defect, severity and pavement
`INTERVENTIONS[defect][severity][pavement]` → activity, method, response, from
D.O. 47 s.2024 Appendix A-9 / Table 4.1 (verbatim in `proof.md` §6) and Blue Book
Item 311. Shown per defect on the result screen and in the bulletin; the
primary one is stored in `FileUpload.recommendation`.

### ✅ Security: column guards (migration section F)
The own-row policies let a user change their own `role`, or the grade on their
own report. Triggers now restrict roles, user types, grades, corrections and
status to the City Engineer. ⚠️ Needs migration section F.

**Verification:** 25 unit tests (`python -m unittest discover -s tests`),
synthetic width check, two dataset test images run end to end through the live
backend as concrete and as asphalt, `npx tsc --noEmit`, eslint, `npm run build`.

## Captured Distress — 2026-10-22

- New page `/captured-distress` (nav: "Captured Distress", signed-in users). Take a photo on the road; it is saved with its location (photo EXIF, else device GPS, else a pin) to the private `captures` bucket and the `captured_distress` table, and listed as "Waiting to be reported" / "Already reported".
- "Report this" opens `/report-damage?capture=<id>`, which loads the photo and the location recorded at capture. The report page has a "Use a captured photo" link. Submitting sets `reported_at` on the capture (query key `cap`).
- `utils/captures.ts` holds the storage/table calls; `downscaleToDataUrl` in `utils/pendingScan.ts` is now exported and reused.
- `migration.sql` section G: bucket, owner-folder storage policies, table with RLS (owner CRUD, City Engineer read) and an explicit GRANT to `authenticated`. Not yet run.
- Wording: "damage" in the UI is now "distress" (titles, headings, report button, admin labels). Routes and DB columns keep their names.

## Step 2: role views — 2026-10-22

- Reporter type (Civilian / Reporter / Inspector) is assigned by the City Engineer on `/admin/users`, not picked at sign-up. Every new account starts as Civilian: section F's `handle_new_user` no longer reads `user_type` from sign-up metadata.
- The admin role is labelled "Admin" on screen (an earlier pass called it "City Engineer"; reverted at Gab's request).
- `/my-reports`: the reporter's own reports with severity, status, address and repair activity.
- `/admin/reports`: each report shows who filed it and their reporter type.
- Only the City Engineer changes grades, status, roles or reporter types: enforced by section F's guard triggers.

## Paging: lighter list loads — 2026-10-25

- `components/Pagination.tsx` (new): Prev/Next controls, "Showing x–y of n", `PAGE_SIZE = 5`, `pageRange()` / `lastPage()` helpers.
- `/my-reports`: 5 reports per page via `.range()` + `count: 'exact'`; "awaiting action" is a head-only count.
- `/captured-distress`: "Waiting to be reported" and "Already reported" page separately, 5 each; `listCaptures(userId, { reported, page })` returns `{ rows, total }`. Only the thumbnails on screen are signed.
- `/admin/reports`: loads a light index of every report (no `image_url`, no bulletin) for the map, search and counts, so Defect locations still shows every defect. Needs action and Resolved page 5 at a time; card details load only for visible cards, and the photo only when a card is opened (Review). `?report=<id>` opens on the right page.
- `/admin/users`: filter chips All / Civilian / Reporter / Inspector / Admin with counts (null type counts as Civilian), 5 accounts per page from the server.
- Fix (found while testing): 14 of 18 `UserDetail` rows have a null `userloginuuid` (older accounts). The Users list keyed on it, so paging left stale rows on screen, and role/type updates matched on it, so they changed nothing on those accounts. Both now use the `id` primary key; the list orders by `username, id` so pages are stable.

## RLS: users see only their own reports — 2026-10-25

- `migration.sql` section H (not yet run): drops every policy on `FileUpload` and `UserDetail` (the live set had drifted; a non-admin could read all 34 reports and 18 profiles) and recreates: owner reads/inserts own reports, owner reads own profile, admin reads/manages all. No own-row update/delete (the app never does either). `anon` grants revoked on both tables.

## Admin reports: queue toggle — 2026-10-25

- `/admin/reports`: Needs action and Resolved are now a toggle above one full-width list instead of two columns. Each view keeps its own page (5 per page); only the selected view's cards load details. `?report=<id>` switches to the right view and page.

## Fix: tab switch no longer throws the admin back to the console — 2026-10-25

- Cause: `components/Navigation.tsx` sent admins to `/admin` on every `SIGNED_IN` event. Supabase auth-js (2.100) also fires `SIGNED_IN` from `_recoverAndRefresh()` whenever the browser tab becomes visible again, so every tab switch looked like a fresh login.
- Fix: a ref remembers who was signed in before each auth event; the redirect runs only on a signed-out → signed-in transition. Verified by simulating tab hide/show: old code jumped `/admin/users` → `/admin`, new code stays put across repeated switches.

## Console and Dashboard load faster — 2026-10-25

- `utils/adminData.ts` (new): one light query of every report (no photos/bulletins) plus a head-only account count, shared by Console and Dashboard and kept in memory for 30 s (stale copy shown at once, refreshed in the background). Also `AdminSessionContext` (admin's id and username) and a verified-admin memory, both cleared on sign-out or account change.
- `app/admin/layout.tsx`: reads the session locally (`getSession`) instead of an auth-server round trip — the role query under RLS still verifies the token; fetches role + username in one query; starts the report summary in parallel with the role check. `components/PageTransition` remounts the layout on every route change, so a verified admin now renders immediately and is re-checked in the background (no "Verifying admin access…" on each move).
- `app/admin/page.tsx`: no own auth calls or 7 count queries; counts are derived from the shared summary. `app/admin/dashboard/page.tsx`: same summary.
- `app/admin/reports/page.tsx`: resolve/reopen/fix clears the cached summary so Console numbers update.
- Measured (production build, localhost): Console opened with 4 requests in parallel instead of 20 chained; on screen at ~1.1 s (its data used to finish ~3.1 s in dev); Console ↔ Dashboard switches 9–22 ms with no report refetch (previously 350–970 ms, each re-running the role check).

## UI redesign: light/dark, sidebar shell, user dashboard, intro, help and tour — 2026-10-28

Approved in Figma (`x8yXuIT9Xazyb5VKOnfR28`) before any code changed.

- **Themes** (`app/globals.css`): semantic tokens (`bg surface surface-2 inset line fg fg-muted brand accent danger warn ok sev-*`) on `:root` (Light) and `:root[data-theme='dark']`. Navy bands (`bg-brand-gradient`, `bg-header-gradient`, `.on-brand`) re-scope the tokens to light-on-navy; `.off-brand` restores them for popovers opened inside a band. Legacy names (`oasys-blue`, `app-bg`, `card-bg`, `panel-bg`, `bg-panel-gradient`) now resolve to the tokens. Light/Dark only, no Auto; default Light, stored in `localStorage['oasys.theme']`, set before first paint by `components/shell/themeBoot.ts`. Switching reveals the new theme as a circle from the toggle (View Transitions), cross-fades where unsupported, instant under reduced motion. Map tiles are inverted in Dark; Leaflet popups follow the theme.
- **Fonts** (`app/layout.tsx`, `next/font`): Geist for UI and headings, Barlow Condensed for stat numbers only (`.font-stat`), JetBrains Mono for coordinates/IDs.
- **Shell** (`components/shell/`): `Sidebar` (desktop, 264px; grouped links with a sliding active marker, search, Guide card, theme switch, account), `MobileHeader` (navy band; search, guide, theme, account menu), `BottomTabBar` (Home, Captured, centre + = Report, Reports, About; admins get Console/Dashboard/Reports/Users), `CommandPalette` (Ctrl/⌘ K). `AuthProvider` is `components/Navigation`'s auth logic moved unchanged (SIGNED_IN refocus guard, deferred profile fetch, admin redirect on real sign-in only); `Navigation.tsx` is deleted. Logo: real mark, no tile; navy `public/oasys-logo-dark.png` (new) on light, silver on dark.
- **Token sweep**: 20 files moved from hardcoded dark classes to tokens; page tops no longer pad for the old fixed nav (`pt-28 sm:pt-32` → `pt-8 md:pt-12`). Modal inputs are `bg-inset` instead of white.
- **No chip backgrounds**: `SeverityBadge` is glyph + word in `text-sev-*` (the `tone` prop is now ignored); new `StatusLabel` is dot + word; the admin Needs action / Resolved toggle is bold + underline. Subtitles under sign-in headings removed.
- **Home** (`app/page.tsx`): signed-out visitors get `components/dashboard/Landing`; signed-in reporters get `UserDashboard` — greeting hero, four count-up tiles that filter the map (filed / needs action / resolved / captures waiting), live map of their reports or captures (`ReportsMap` gains `heightClass` and capture pins), severity breakdown with growing bars, activity timeline, recent reports with photos, captures waiting. Data from new `utils/userData.ts` (light columns for all reports, photos for the newest 3, first page of unreported captures; cached 30 s per user).
- **Intro** (`components/help/IntroSplash.tsx`): road draws, scan beam sweeps, logo resolves inside a detection box, wordmark rises, sheet lifts away. ~3 s, once per session (`sessionStorage['oasys.introSeen']`), Skip button, not shown under reduced motion; the boot script covers the page in navy until it mounts, so nothing flashes.
- **Help** (`components/help/HelpButton.tsx`, `demos.tsx`): "?" beside section headings opens a looping SVG demo (map, pin, upload, result, capture, track). Used on the dashboard map and captures; topics `pin`/`upload`/`result`/`track` are ready for the Report and My reports headings.
- **Tour** (`components/help/Tour.tsx`): 5-step spotlight over `data-tour` targets with Back/Next/Skip and arrow keys; starts once on a reporter's first dashboard visit (after the intro), replayable from Guide, the mobile "?" and the palette. `localStorage['oasys.tourDone']`.
- **Motion utilities** (`globals.css`): `.stagger`, `.lift`, `.grow-x`, `.ping`, `.skeleton`, `.pop-in`, `.tour-spot`, pin drop; all neutralised by the existing reduced-motion rule.
- Verified: `tsc`, `eslint`, `next build` clean; browser at 1440 and 390 in both themes (signed out), tour steps, intro, no console errors. The signed-in dashboard was not seen in a browser — needs a reporter login.
- Follow-up (same day): the intro now plays on every load (still skipped under reduced motion) and was rebuilt as a perspective road scene — edges draw to the horizon, centre dashes stream toward the viewer, a scan line sweeps down, a detection box snaps onto the logo, letters rise one by one, and the sheet opens outward into the app (~3.8 s). Search lists pages and the tour only (no "Page" hint, no theme commands). Dashboard severity bars became "cut lines": a dashed guide with a solid line scored along it by a glowing tip that stops at the count.
- Follow-up 2: background grid lines removed (only two soft glows remain). Palette re-tuned: navy-tinted dark theme (`#070b16` bg, `#0e1426` surface) instead of neutral greys, refined light neutrals, a more saturated accent (`#2347d6` / `#86a3ff`), and brand bands as a navy-to-indigo gradient with blue and cyan glows; light `--ok` darkened to `#12703a` for contrast on grey cards (severity palette unchanged). Intro rebuilt as a night scene: aurora and stars, perspective road with oncoming headlights and receding tail lights, a scan line that finds a pothole and grades it ("pothole · 0.94 · HIGH"), the camera rushes to the horizon, the logo bursts in with rings, letters flip up with a light sweep, and an iris closes onto the app (~4.5 s). Dashboard hero: the road lines are replaced by `components/dashboard/Street.tsx`, a top-down street with cars, a jeepney and a motorcycle driving both ways with headlights on.
- Follow-up 3: intro trimmed to the logo and text only (logo pop with burst rings and glow, letters flip up with a light sweep, tagline, iris close; ~3 s) — road, traffic, stars and aurora removed. Hero street fixed: westbound vehicles were mirrored around the middle of the road (their wrapper was full-width), which drew them on the wrong side so they appeared and vanished mid-road; the wrapper now hugs the vehicle. Each lane now has one speed with vehicles evenly spaced, so none overlap, and all start and end fully off the road. The hero has a Light version (`.hero-theme`): pale blue daylight banner with dark text, a navy primary button, grey asphalt with white dashes and shadowed vehicles; Dark keeps the navy night band with headlight beams.
- Follow-up 4: each tour card now opens with a looping how-to animation (`HelpDemoArt` from `demos.tsx`): welcome shows the whole flow (pin → photo → graded result, new `flow` demo), the numbers step shows a tile being tapped and the map filtering (new `stats` demo), then map, pin and capture. The card is measured after render and placed beside narrow targets (sidebar links) so it no longer covers them, else below or above the target, always kept 16px inside the screen; over a full-height target it floats in the target's corner; phones keep the bottom sheet. Dashboard map is now full width and taller (26 / 30 / 38rem), with Severity breakdown and Activity side by side below it.
- Follow-up 5 (PWA, for the Vercel deploy): installable on phones. `public/manifest.json` (standalone, navy theme/background, 192/512 icons plus a maskable 512, shortcuts to Report / Captured / My reports) linked from `app/layout.tsx` metadata, with `appleWebApp` for iOS and `app/apple-icon.png` (180, file convention, because `app/icon.png` overrides config icons). Icons in `public/icons/` are the real logo on the brand navy gradient. `public/sw.js` is deliberately minimal: pages, Supabase and `/api/analyze` always go to the network (no stale reports or auth); it only serves `public/offline.html` when a page can't load, plus that page's icon. Registered by `components/shell/ServiceWorker.tsx` in production only. `next.config.ts` serves `sw.js` with `no-cache` so a fix reaches installed phones on the next visit; `proxy.ts` skips the manifest, worker and offline page. Dashboard severity breakdown fills its row beside Activity: total graded in the header, rows spread to the card height, bigger counts with a % share, a thicker cut line (`.cut-track-lg`). Verified: `tsc`, `eslint`, `next build`; on `next start` the worker activates, the manifest parses, an updated worker takes over by itself, and with the server down a page load shows the offline page with its icon.
- Follow-up 6: the tour cards show the real app instead of drawn diagrams. `components/help/TourScene.tsx` plays a 5.6 s loop over a screenshot (`public/tour/<scene>-light|dark.webp`, 720×450, ~20–90 KB each; the theme picks the matching shot): the view eases in, a cursor taps twice with a ripple, and each tap's result appears — rings on the Report button and a number tile (welcome), Needs action then Reports filed (numbers), the Needs action tab and a pin popup (map), a pin dropping on the Report map and a photo filling the upload box (report), a capture and the Open link (captures). Shots were taken at 1280 px from the dashboard rendered with sample data and from /report-damage; tap points are percentages of each shot, read from the images. Under reduced motion there is no cursor and the tap results show still. The tour-only `flow`/`stats` SVG demos and their CSS are removed. Search no longer lists "Take the tour" (Guide in the sidebar and the mobile "?" still start it).
- Follow-up 7 (model slot + admin redesign):
  - **Bulletin model is swappable** (for the planned VPS + Hugging Face API).
    - `backend/llm.py` (new) holds the whole bulletin-model call, chosen by `LLM_PROVIDER`:
      - `ollama` (default; the old code, moved here unchanged).
      - `remote`: `POST {LLM_API_URL}/generate` with `Authorization: Bearer {LLM_API_KEY}` and body `{prompt, max_new_tokens, temperature}`, returning `{text, model}`; `GET /health` returns `{status, model}`.
      - `generate()` never raises; on failure the bulletin keeps its template text as before.
    - `backend/api.py` calls `llm.generate(...)` and adds `GET /llm/status`.
    - `backend/llm_server/` (new) is a placeholder FastAPI server for the VPS (`app.py`, `requirements.txt`):
      - It lazily loads a transformers pipeline (`HF_MODEL_ID`, default `Qwen/Qwen2.5-1.5B-Instruct`).
      - The bearer key is checked with `secrets.compare_digest`.
      - `generate_text` is marked `TODO(Gab)`.
    - New variables in `backend/.env.example`: `LLM_PROVIDER`, `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL_LABEL`, `LLM_TIMEOUT_S`.
    - Privacy (RA 10173): only the prompt text (detections, metrics, address) leaves the server; no photos and no user identity.
    - `app/api/llm-status/route.ts` proxies the status and never sends the endpoint URL to the browser.
    - Switching over takes only an env change plus a backend restart.
  - **Admin redesign.**
    - Shared pieces in `components/admin/ui.tsx`: `AdminHeader`, `Panel`, `StatTile` (count-up, change vs previous period, sparkline), `UnderlineTabs`, `ConfirmDialog`, `Toast`.
    - Pure stats helpers in `utils/adminStats.ts`.
    - `components/Charts.tsx` was rewritten:
      - `LineChart`: measured, smoothed (monotone cubic), with crosshair + tooltip, a legend for 2+ series, x labels that thin out by width, and an sr-only table.
      - `ProgressList`, `StackedBar`, `RingProgress` and `Sparkline`.
      - `BarTally` and `TrendLine` were removed.
    - Console: resolved ring + stacked bar, four tiles with 14-day sparklines, a "Next up" queue (severity, then oldest), Waiting time bars, and the "Bulletin model" card (`components/admin/LlmStatusCard.tsx`: live Ollama status plus a "Hugging Face API — Not connected" slot that becomes the live row once `LLM_PROVIDER=remote`).
    - Dashboard: 7 days / 30 days / 12 months range, a submissions line chart (Total / By severity / Corrections), severity and distress-type progress bars, resolution ring, waiting time, latest filings, CSV export.
    - Reports: cards with a severity edge; the expanded view has confidence and crack-density meters; confirm dialogs for resolve/reopen.
    - Users: an Accounts composition panel and a list with glyph + word roles.
    - Data logic and queries are unchanged.
  - **Verified:**
    - `tsc` and `eslint` are clean.
    - All four admin pages were checked in the browser with mocked data, at 1440 (light) and 390 (dark), with no horizontal scroll.
    - `next build` was not run (the dev server was using `.next`).
- Follow-up 8:
  - **Model card removed.**
    - The "Bulletin model" card is removed from the Console (`components/admin/LlmStatusCard.tsx` and `app/api/llm-status/` deleted). The VPS/Hugging Face switch stays a backend-only placeholder: `backend/llm.py`, `backend/llm_server/`, `GET /llm/status`.
  - **Console queue band.**
    - It uses the new `components/admin/QueueHero.tsx` instead of the generic ring and stacked bar.
    - `QueueDial`: a 48-tick dial whose ticks light up in turn while a blue→cyan arc sweeps round with a glowing, breathing head; the percentage counts up.
    - `QueueBar`: resolved (gradient, with a passing glint) / waiting / high-severity waiting. The waiting segments carry slowly moving stripes.
    - Colours come from the band's own glows (`--hero-a`/`--hero-b` on `.hero-theme`, per theme), replacing the green/amber that clashed. The only other colour is the validated `--sev-high`.
    - CSS is under "Queue hero" in `globals.css`. Reduced motion shows the end state.
  - **Vercel (Services, beta).**
    - `vercel.json`:
      - `app` (Next.js, repo root) is the only public service.
      - `backend` (`backend/`, container runtime) is private, reached through a binding that injects `BACKEND_URL`.
      - The suggested `/api/(.*)` → backend rewrite was not used: it would send `/api/analyze` and `/api/geocode` (Next routes) to FastAPI, which has neither.
    - `app/api/analyze/route.ts` reads `BACKEND_URL`, then `API_BASE_URL`, then localhost, and sets `maxDuration = 300`.
    - `backend/Dockerfile` (python:3.14-slim, CPU-only torch, libGL for opencv, writable caches in `/tmp`, uvicorn on `$PORT`). A container is used because torch + ultralytics + opencv + SAM exceed the 500 MB Python bundle limit.
    - `backend/fetch_weights.sh` downloads the SAM checkpoint (358 MB, over GitHub's file limit) and `yolov8n.pt` at build time. `best.pt` / `ultrabestroad.pt` must be committed: `.gitignore` now un-ignores those two, or set `WEIGHTS_BASE_URL` and drop the exception.
    - Also added `backend/.dockerignore` and `.vercelignore` (CLI deploys).
    - Not deployed or built here (no Docker on this machine).
    - Risks:
      - Hobby functions cap at 2 GB / 1 vCPU, which is tight for SAM + two YOLO models; Pro allows 4 GB.
      - A cold start loads every model.
      - Request/response bodies are capped at 4.5 MB (uploads are 1600 px JPEGs, so fine).
      - Ollama does not exist on Vercel, so bulletins use the template text until `LLM_PROVIDER=remote`.
- Follow-up 9: the Console queue band was restyled after Gab's reference (`Downloads/loke.jpg`).
  - **Dark card:** in Dark it is a flat charcoal card (`#202126`) instead of the navy gradient (`.hero-theme.queue-band`). Other hero bands are unchanged.
  - **Donut:** separate thick rounded segments with 6px gaps (Resolved / Waiting / High severity). The resolved % sits in the centre in its segment's colour.
  - **Bar:** the same three parts as separate rounded pieces.
  - **Legend:** dot + label + bold count + %.
  - **Colours:** sky `#4ea6e6` (Dark) / accent `#2347d6` (Light) for resolved, neutral grey for waiting, and the validated `--sev-high`. Sky and grey passed the dataviz validator's separation checks on the dark card. The grey reads as neutral on purpose, and the red's lightness is the fixed severity palette.
  - **Motion:** the donut turns in while the segments draw one after another, the centre counts up, the bar segments grow in order, and a glint passes over the resolved piece. The ticks, stripes and travelling head from follow-up 8 are removed.
- Follow-up 10: sidebar Guide card moved from the bottom block to directly under the Info group (inside the nav); theme switch and account stay at the bottom.
- Follow-up 11: Guide is now a row in the sidebar Info group (compass icon + "Guide", same style as the links; "Take the 1-minute tour" removed). It starts the tour rather than navigating.
- Follow-up 12: About > How it works step numbers are plain accent numerals (font-stat) with no circle fill or ring.
- Follow-up 13: How it works steps redesigned: zero-padded numerals (01–10) in a fixed left column, a hairline above each step with a short accent bar over the number, numbered down each column on desktop (1–5 left, 6–10 right); one column on phones.
- Follow-up 14: mobile tab bar: on Report the centre button (shown as ×) now closes Report, returning to the page it was opened from (Home if opened directly); aria-label switches to "Close report". Previously it linked to /report-damage again and did nothing.
- Follow-up 15: admin Reports: severity filter (All / High / Medium / Low, glyph + word + count, coloured underline; re-tap returns to All) applied to cards, tab counts and map. Map now shows only the open tab (Needs action or Resolved), every page of it, pins coloured by corrected severity. Admin guided tour: 5 steps (console, queue, Reports, Dashboard, Users) with animated screenshot cards (public/tour/admin-*-light|dark.webp, sample data), own done-key oasys.adminTourDone, auto-starts on first /admin visit; Guide row in admin sidebar, Guide button in mobile header for admins, data-tour on admin nav + tab bar.
- Follow-up 16: intro splash has no Skip button; a double click / double tap anywhere (350 ms window, timed from pointerup) or Escape skips it. Report analyzing screen no longer says "This usually takes 20–30 seconds."
- Follow-up 17: browser tab icon is the OASYS logo: app/favicon.ico (16/32/48/64/256) and app/icon.png regenerated from public/icons/icon-512.png (logo on navy, rounded corners) — favicon.ico was still Next's default triangle.
- Follow-up 18: default tab title is now just "OASYS" (was "OASYS — Road Distress Assessment"); page titles keep the "Page · OASYS" template. manifest.json name unchanged.
