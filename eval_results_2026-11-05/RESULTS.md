# OASYS thesis evaluation, 2026-11-05

No source code, model or dataset was modified. Every number below was copied from
the output files in this folder.

**Hardware:** local laptop, AMD Ryzen 7 7445HS (Radeon 740M), 15.2 GB RAM, Windows 11.
The machine has an NVIDIA GeForce RTX 2050, but the project venv has `torch 2.13.0+cpu`,
so **all inference ran on CPU**. This is not the Hostinger deployment.
Software: Ultralytics 8.4.108, Python 3.14.6.

## 1. Detection / segmentation accuracy (test split)

- Model: `backend/best.pt` (the file `backend/api.py` loads as `CRACK_WEIGHTS`). YOLOv8m-seg, 27,224,700 params.
  Its embedded train args: imgsz 1024, 60 epochs, data `/kaggle/input/datasets/gabicomm/fineshytt/part4/data.yaml`, saved 2026-03-23.
- Data: `My-First-Project-1/data.yaml`, `split=test`, `imgsz=1024`, default val conf (0.001), device CPU.
- Raw console: `val_test_console.txt` (clean copy: `val_test_console_clean.txt`); curves and confusion matrices: `val_test_plots/`.

| Class | Images | Instances | Box P | Box R | Box mAP50 | Box mAP50-95 | Mask P | Mask R | Mask mAP50 | Mask mAP50-95 |
|---|---|---|---|---|---|---|---|---|---|---|
| **all** | 376 | 708 | 0.821 | 0.661 | 0.758 | 0.493 | 0.786 | 0.631 | 0.699 | 0.347 |
| Alligator Crack | 61 | 94 | 0.744 | 0.638 | 0.677 | 0.459 | 0.75 | 0.638 | 0.661 | 0.374 |
| Longitudinal Crack | 113 | 233 | 0.835 | 0.648 | 0.753 | 0.484 | 0.781 | 0.605 | 0.654 | 0.254 |
| Pothole | 59 | 205 | 0.872 | 0.765 | 0.865 | 0.595 | 0.855 | 0.747 | 0.851 | 0.528 |
| Transverse Crack | 87 | 176 | 0.832 | 0.591 | 0.739 | 0.433 | 0.756 | 0.534 | 0.632 | 0.234 |

Speed (CPU): 5.9 ms preprocess, 1143.5 ms inference, 19.5 ms postprocess per image.

**Caveat:** best.pt was trained on a different Kaggle dataset (`fineshytt/part4`), which is not
in this repo. I could not check whether any of these 376 test images were in its training
set. If they were, these figures are optimistic.

## 2. End-to-end time (POST /analyze-road)

- Backend started locally with `uvicorn api:app` (backend/.env as-is). Ollama was not running
  at first, so I started `ollama serve`. The configured bulletin model, `qwen2.5:1.5b`, was
  reachable (`/llm/status` → reachable: true), so **these timings include the bulletin step**.
  I did not run a separate timing without the bulletin step.
- Payload is the same one the frontend forwards (`{"image_base64": ...}`, default pavement type).
- Images: the first 10 files, sorted by name, from `My-First-Project-1/test/images` (Roboflow
  test images, not Samson Road captures). All 10 returned HTTP 200.
- Script: `time_e2e.py`; per-request times: `e2e_timing.csv`; responses without images: `e2e_responses.json`.

| n | mean (s) | median (s) | max (s) | min (s) |
|---|---|---|---|---|
| 10 | 10.825 | 10.221 | 16.282 | 9.630 |

The max (16.28 s) was the first request after the server and Ollama had just started. I did not
split out how much of that was cold-start time.

## 3. Language-model check on the 10 bulletins

Question: does the model-written summary paragraph name a repair other than the
rule table's activity?

- **10 / 10 name no different repair.** No summary mentions any repair at all. A regex scan for
  `act.|patch|seal|reblock|overlay|reconstruct|resurfac|repair|replace|fill|rout|recommend|should`
  found 0 matches in all 10 summaries. The prompt tells the model not to recommend actions, and
  the intervention lines are rendered from `fuzzy_engine`, not by the LLM.
- So **0 / 10 summaries restate the rule-table activity** either. They describe findings only.
- Other errors I saw when reading the summaries by hand (outside the question, listed for honesty):
  - `12_jpg…`: leaves out Transverse (3 detected); calls 2.25% "moderate to severe".
  - `138_jpg…`: says all distresses are medium and leaves out the High-severity Transverse.
  - `154_jpg.rf.82fca…`: leaves out Transverse; the text is cut off mid-sentence ("within the
    acceptable range for"), probably from the `OLLAMA_NUM_PREDICT=80` token cap.
  - `21_jpg…`: swaps the counts (says 2 transverse / 1 longitudinal; the table has 1 / 2).
  - The other 6 summaries match the table's types, counts and severities.
  - Summaries with an omission or wrong count: **4 / 10**.

## 4. Ground-truth data for IoU / clDice, Kappa / McNemar, repeatability

I searched the repo (excluding node_modules, deps, .git) by file name and content: samson,
inspector, ground truth, gt_mask, engineer, grades, repeat, centreline/centerline, annot, tape,
and every `.csv`/`.xlsx` file. I also looked for photos outside the Roboflow dataset folders.

- Hand-drawn ground-truth masks for Samson Road photos: **not found**.
- City Engineer severity grades: **not found** (there are no CSV or XLSX files in the repo).
- Repeat photos of the same defect: **not found**.
- `backend/eval/samples/` does not exist. Samson Road appears only as text in `updated-oasys.txt`.

So I did not run `backend/eval` (metrics.py / run_batch.py / compare.py), because there is nothing to compare against.

## Summary table

| Metric | Value |
|---|---|
| Test images / instances | 376 / 708 |
| Box Precision (all) | 0.821 |
| Box Recall (all) | 0.661 |
| Box mAP50 (all) | 0.758 |
| Box mAP50-95 (all) | 0.493 |
| Mask Precision (all) | 0.786 |
| Mask Recall (all) | 0.631 |
| Mask mAP50 (all) | 0.699 |
| Mask mAP50-95 (all) | 0.347 |
| Per-class P/R/mAP | see table in section 1 |
| E2E time, mean / median / max (local CPU, with Ollama bulletin) | 10.825 s / 10.221 s / 16.282 s |
| E2E time without the bulletin step | not measured (Ollama was running, so I timed with it) |
| Bulletin summary names no different repair | 10 / 10 |
| Bulletin summary with omission or wrong count | 4 / 10 |
| SAM mask IoU | not available (no hand-drawn ground-truth masks) |
| Skeleton clDice | not available (no hand-drawn ground-truth centrelines) |
| Cohen's Kappa (fuzzy / crisp / confidence vs inspector) | not available (no City Engineer grades) |
| McNemar (fuzzy vs baselines) | not available (no City Engineer grades) |
| Repeatability | not available (no repeat photos of the same defect) |
| IPM MAPE | not available (no tape measurements) |
