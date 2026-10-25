# OASYS — Neurosymbolic Road Defect Detection and Assessment

Undergraduate thesis system for the University of the East Caloocan, College of
Engineering: *A Neurosymbolic AI Framework Approach to Road Defect Detection and
Assessment*.

OASYS grades road damage from a single photograph. A neural stage finds and
segments the defect; a **symbolic** stage measures it and grades its severity
against DPWH engineering standards. The grade is produced by a fuzzy inference
engine with an auditable trace, not by a black box — which is the point of the
thesis, and the reason the severity of every detection can be explained.

## What it does

Upload a road photo and the system returns the defect type, its physical
measurement in millimetres or square metres, a severity grade, and a maintenance
bulletin.

- **Detects** alligator, longitudinal and transverse cracking, and potholes
- **Measures** in real-world units via Ground Sample Distance after perspective
  correction, so a crack is the same size wherever it sits in the frame
- **Grades** severity with a Mamdani fuzzy engine on crack width and crack
  density, centred on the **3 mm** DPWH threshold (D.O. 120 s.2019)
- **Explains** every grade — each detection carries its membership trace and
  three parallel severity outputs (fuzzy, crisp, confidence-weighted)
- **Refuses** images that are not roads, rather than confidently assessing a
  photo of something else
- **Blurs** faces and plates before anything is detected, measured or stored

Reports go to an admin console where an engineer can resolve them or correct
them. Corrections are stored *beside* the model's output, never over it, which
turns ordinary use into the paired data Cohen's Kappa needs.

## Pipeline

```
photo
  └─ privacy blur          faces and plates, before any detection
  └─ road detection        YOLOv8 segmentation; <15% road coverage is refused
  └─ perspective correction  IPM warp to a 700×700 top-down view
  └─ crack detection       YOLOv8 segmentation on the corrected view
  └─ box filtering         non-maximum suppression at IoU 0.4
  └─ SAM masking           Segment Anything ∩ YOLO mask — only agreed pixels count
  └─ skeletonization       one-pixel centreline; length and mean width
  └─ fuzzy severity        trapezoidal MFs, Mamdani inference, centroid defuzz
  └─ bulletin              local llama3.2, no network egress
```

Every stage above is returned to the browser as an image. **"Show Process"** on
the result screen opens `/process`, a step-through of what each stage did to
*your* photo, with that run's real numbers.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| Backend | FastAPI, PyTorch, Ultralytics YOLOv8, Segment Anything (ViT-B), OpenCV |
| Symbolic | scikit-fuzzy — `backend/fuzzy_engine.py` |
| Bulletin | Ollama `llama3.2`, local only |
| Auth & data | Supabase (Postgres, RLS, `@supabase/ssr` cookie sessions) |

## How to run

OASYS is three programs that run at the same time, each in its own terminal:

| # | Program | Port | What breaks without it |
|---|---|---|---|
| 1 | Ollama (`llama3.2`) | 11434 | The maintenance bulletin |
| 2 | Python analysis backend (FastAPI) | 8000 | Every analysis: "Could not reach the analysis backend" |
| 3 | Next.js website | 3000 | Everything |

Commands below are for Windows (PowerShell or Command Prompt), from the repo
root `C:\Users\Gab\Documents\GitHub\NeuroSymbolic`.

### First-time setup

Do this once per machine.

**1. Install the tools.** Python 3.14, Node 20+ and [Ollama](https://ollama.com).
Then pull the bulletin model:

```
ollama pull llama3.2
```

**2. Python environment.** The project uses the `deps\` virtual environment.
Create it only if it is missing:

```
python -m venv deps
deps\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Always run the backend with `deps\Scripts\python.exe`, not the global Python.

**3. Model weights.** These aren't in the repo. Put them in `backend\`:

| File | Size | What it is |
|---|---|---|
| `ultrabestroad.pt` | 23 MB | road segmentation |
| `best.pt` | 54 MB | defect detection |
| `sam_files\sam_vit_b_01ec64.pth` | 375 MB | [Segment Anything, download](https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth) |

If one is missing, the backend refuses to start and names the exact path.

**4. Website packages and settings.**

```
npm install
copy .env.local.example .env.local
```

Open `.env.local` and fill in:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable (anon) key from the same page |
| `API_BASE_URL` | `http://127.0.0.1:8000` |

`API_BASE_URL` has no `NEXT_PUBLIC_` prefix on purpose. The browser never calls
the backend directly; it goes through `app/api/analyze/route.ts`.

**5. Database.** In the Supabase dashboard open **SQL Editor → New query**,
paste the whole of `migration.sql` and click **Run**. It is safe to run again;
every section skips what already exists. It creates the tables, the security
policies, the `captures` photo bucket (section G) and the triggers that stop
non-admins changing grades or roles (section F).

If Supabase warns about destructive operations, those are the
`drop policy if exists` lines that let the script re-run. Choose **Run this query**.

**6. Make yourself admin.** Sign up on the website first, then run this in the
SQL Editor with your email:

```sql
update "UserDetail" set role = 'admin' where email = 'you@example.com';
```

After that, every other account is managed from **Users** in the admin console:
admin access and reporter type (Civilian, Reporter or Inspector).

### Every time

Open three terminals.

**Terminal 1: Ollama.** It usually starts by itself with Windows (tray icon).
If it isn't running:

```
ollama serve
```

**Terminal 2: the analysis backend.**

```
cd backend
..\deps\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000
```

Wait for `Application startup complete`. Loading YOLO and SAM takes a while
and needs a few GB of free memory, so close heavy programs first. Check it at
<http://127.0.0.1:8000/docs>; the page should load.

**Terminal 3: the website.**

```
npm run build
npx next start -p 3000
```

Open <http://localhost:3000>. You only need `npm run build` again after the
code changes, and you must restart `next start` after every build (it caches
the build manifest at boot and otherwise serves pages pointing at chunks that
no longer exist).

> **Use the production build, not `npm run dev`.** Turbopack's dev compile can
> run out of memory on a machine with only a few GB free. If you need hot
> reload: `set NODE_OPTIONS=--max-old-space-size=4096` then `npm run dev`.

### Using it

1. Sign in, then **Report**: read *Before you upload* once, add a photo, check
   the pin and the road surface, and click **Analyze and review**.
2. To photograph now and file later, use **Captured Distress**: the photo is
   saved with where it was taken. **Report this** opens it in the report flow.
3. **My reports** shows what you have filed and its status.
4. Admins get the console: **Reports** (resolve, correct, **Track report** on
   the map), **Dashboard** and **Users**.

Location needs a secure page. `http://localhost` counts; a LAN address such as
`http://192.168.x.x:3000` on a phone doesn't, so GPS is refused there and you
pin the location by hand.

### Tests

```
cd backend
..\deps\Scripts\python.exe -m unittest discover -s tests -v
..\deps\Scripts\python.exe -m eval.synthetic_width
```

The first is the symbolic layer, width measurement and reference-card tests;
the second prints width-measurement error against synthetic cracks. For the
website: `npx tsc --noEmit`, `npm run lint` and `npm run build`.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Could not reach the analysis backend" | Terminal 2 isn't running, or `API_BASE_URL` is wrong. Start the backend and wait for `Application startup complete`. |
| Bulletin missing or says the model is unavailable | Ollama isn't running, or `llama3.2` isn't pulled. |
| "column … does not exist" / "relation … does not exist" | `migration.sql` hasn't been run, or not all of it. Run it again. |
| Saving a capture fails with a bucket or permission error | Section G hasn't been run. |
| "Only an admin can change …" | Expected. Grades, status, roles and reporter types are admin-only. |
| Pages load with missing styles or 404 chunks | `next start` was not restarted after a build. |
| Backend exits on startup | A model file is missing; the error names it. |

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing |
| `/report-damage` → `/report-damage/result` | Report: photo, location, road surface, analysis, then file it |
| `/captured-distress` | Captured Distress: photograph now with its location, report later |
| `/my-reports` | The signed-in reporter's own reports and their status |
| `/process` | Stage-by-stage walkthrough of the last analysis |
| `/about` | What the system does |
| `/admin` | Console — what needs review |
| `/admin/dashboard` | Trends, breakdowns, CSV export |
| `/admin/reports` | Every report; resolve or correct |
| `/admin/users` | Accounts, admin access and reporter type |

Analysing a photo needs no account. Submitting a report, Captured Distress and
My reports do. `/admin/*` is gated by
`proxy.ts` server-side and, decisively, by Supabase RLS.

## Documentation

| File | What it is |
|---|---|
| [`documentation.md`](documentation.md) | System reference — architecture, API contract, schema, setup |
| [`proof.md`](proof.md) | **Documentary evidence for every severity threshold** — verbatim DPWH quotations, source URLs, reproduction commands |
| [`update-log.md`](update-log.md) | Chronological record of every fix, with the reasoning |
| `migration.sql` | Idempotent schema and RLS |

There is also an Obsidian vault at `Documents/Obsidian Vault/NeuroSymbolic/`;
start at **NeuroSymbolic — Hub**.

**Take `proof.md` to the defence.** Every threshold in the fuzzy engine is
sourced there, including the correction from 6/19 mm (ASTM D6433, wrong standard)
to the DPWH 3 mm figure.

## Limitations

- **Depth is not measured.** A single 2D photograph carries no depth, so pothole
  severity is graded on plan area alone and is deliberately not stratified by
  depth. See `documentation.md` §3.
- **The scale is assumed unless the reference card is in frame.** 4.357 mm/px
  comes from the capture rule (one 3.05 m lane across the frame). With the
  printed card (`public/reference-card.svg`) beside the defect, the scale is
  measured from it instead. Deviating from the capture rule without the card
  scales every measurement.
- **Perspective correction can fail.** When road edges cannot be fitted the
  original view is kept and measurements are perspective-distorted; the response
  reports `ipm_applied: false` and the walkthrough says so.
- Research tool for the Caloocan study area. Not a production asset-management
  system.
