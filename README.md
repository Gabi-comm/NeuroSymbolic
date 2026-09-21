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

## Getting started

### Prerequisites

Python 3.14 (the bundled `deps/` venv), Node 20+, and [Ollama](https://ollama.com)
with `llama3.2` pulled.

### Model weights

Not in the repo — they were untracked in Phase 0 along with the dataset, which
cut the working tree from 7,927 files to 39. Place in `backend/`:

| File | Size | Source |
|---|---|---|
| `ultrabestroad.pt` | 23 MB | road segmentation |
| `best.pt` | 54 MB | crack detection |
| `sam_files/sam_vit_b_01ec64.pth` | 375 MB | [download](https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth) |

Startup fails loudly and names the exact missing path.

### Backend

```bash
cd backend
../deps/Scripts/python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000
```

Check with `curl -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs` → `200`.

Use `deps/`, not the global Python. Both environments were incomplete and
`api.py` imports from both at module scope, which is why the backend had never
once started before Phase 0.

### Frontend

```bash
npm install
cp .env.local.example .env.local   # Supabase URL + publishable key, API_BASE_URL
npm run build
npx next start -p 3000
```

Then open <http://localhost:3000>.

> **Serve the production build, not `npm run dev`.** Turbopack's dev compile
> exhausts the heap on a machine with a few GB free; `npm run build` succeeds
> every time. If you need hot reload, use
> `NODE_OPTIONS=--max-old-space-size=4096 npm run dev`.

> **`next start` caches the build manifest at boot.** Restart it after every
> build or it serves HTML referencing chunks that no longer exist.

`API_BASE_URL` deliberately has no `NEXT_PUBLIC_` prefix — the browser must never
know the backend host, and calls it through `app/api/analyze/route.ts` instead.

### Database

Run `migration.sql` in the Supabase SQL editor. It is idempotent.

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing |
| `/upload-media` → `/upload-media/result` | Scan — analysis only, no account needed |
| `/report-damage` → `/report-damage/result` | Report — pin a location and file it |
| `/process` | Stage-by-stage walkthrough of the last analysis |
| `/about` | What the system does |
| `/admin` | Console — what needs review |
| `/admin/dashboard` | Trends, breakdowns, CSV export |
| `/admin/reports` | Every report; resolve or correct |
| `/admin/users` | Accounts and role assignment |

Scanning needs no account. Submitting a report does. `/admin/*` is gated by
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
- **GSD is assumed, not measured.** 4.357 mm/px comes from the paper's capture
  protocol — chest height, roughly 2 m from the defect. Deviating from that
  protocol scales every measurement.
- **Perspective correction can fail.** When road edges cannot be fitted the
  original view is kept and measurements are perspective-distorted; the response
  reports `ipm_applied: false` and the walkthrough says so.
- Research tool for the Caloocan study area. Not a production asset-management
  system.
