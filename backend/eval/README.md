# Evaluation harness

Scripts for the metrics named in paper sections 3.3 (Testing Stage) and 3.6
(Statistical Treatment of Data).

| File | Purpose |
|---|---|
| `metrics.py` | Pure functions: mask IoU, clDice, MAPE, Cohen's Kappa, weighted mean |
| `run_batch.py` | Run a folder of images through the API, export a per-detection CSV |
| `compare.py` | Compare the three severity methods against inspector grades (RQ3, RQ4) |

## Workflow

**1. Generate system output.** With the backend running:

    cd backend
    ../deps/Scripts/python.exe -m eval.run_batch --images ./eval/samples --out ./eval/results.csv

One row per detection, with `severity_fuzzy`, `severity_crisp` and
`severity_confidence` side by side.

**2. Collect inspector grades.** Section 3.5 requires a double-blind protocol:
inspectors grade the same images without seeing system output. Give them the
images and collect a CSV:

    image,detection_index,severity
    road_001.jpg,0,High
    road_001.jpg,1,Medium

`detection_index` must match the system CSV, so inspectors need the annotated
images (`fileUrl`) to know which detection is which — but not the grades.

**3. Compare.**

    ../deps/Scripts/python.exe -m eval.compare --system ./eval/results.csv --inspector ./eval/inspector.csv

Reports Cohen's Kappa per method against the inspector baseline (RQ4), and an
exact McNemar test of fuzzy against each baseline (RQ3).

## What still needs ground-truth data

| Metric | Needs |
|---|---|
| SAM mask IoU | hand-annotated defect masks |
| Skeleton clDice | hand-annotated centrelines |
| IPM MAPE | physical tape measurements of the same defects |
| Cohen's Kappa | inspector grades, double-blind |
| ISO 25010 | 4-point Likert responses from 10-15 participants |

`metrics.py` implements all of these; they are waiting on data collection, not on
code.

## Why McNemar rather than comparing two accuracies

The methods grade the *same* detections, so the samples are paired. Comparing two
independent accuracy figures discards that pairing and loses statistical power.
McNemar uses only the discordant pairs, which is exactly where the two methods
differ. The exact binomial form is used because discordant counts in a study this
size are typically too small for the chi-square approximation.
