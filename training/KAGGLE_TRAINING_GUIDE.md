# Training the Road Distress Model on Kaggle

Notebook: [`kaggle_train_distress.ipynb`](kaggle_train_distress.ipynb)
Dataset: Roboflow `gab-pkfzz / my-first-project-oy4hj-lrohv`, **version 3 "troy eto"**

## 1. What changed since the 60% model

| | Old model (`backend/best.pt`) | New setup |
|---|---|---|
| Class names | `... Crack` | `Alligator Distress`, `Longitudinal Distress`, `Pothole`, `Transverse Distress` |
| Architecture | YOLOv8m-seg | YOLOv8l-seg |
| Resize | Stretch to 1024 (distorts tall photos, 42% of the set) | Fit with black edges to 1024 (no distortion) |
| Split | 96 / 2 / 2 (377 val images) | 70 / 20 / 10 (822 val, 411 test) |
| Class loss weight | `cls=3` (destabilises training) | `cls=0.5` (default) |
| Training | 60 epochs fine-tune at `lr0=0.0001` | 100 epochs from COCO weights, SGD `lr0=0.01`, cosine decay |
| Background images | 41% of the dataset (`uncracked_*` tiles) | Trimmed to 15% of train by the notebook |
| Leakage check | none | val/test near-duplicates of train images are removed |

Old model on its own test split: **box mAP50 0.758, mask mAP50 0.699, mask recall 0.631**.
Its weak spot is recall on thin cracks: Transverse mask mAP50 0.632, recall 0.534.

## 2. Version 3 "troy eto" settings (already created in Roboflow)

* **Preprocessing:** Auto-Orient, Resize *Fit (black edges) in 1024x1024*.
* **Augmentation (train only, 3 outputs per image):** horizontal flip, crop 0 to 20%, rotation ±5°, brightness ±15%, blur up to 0.9 px, noise up to 0.69%.
* **No 90° rotation and no vertical flip, on purpose.** Turning a road photo 90° makes a Longitudinal crack look Transverse while its label stays Longitudinal. That teaches the model the wrong thing.
* **Blur and noise are kept tiny.** Hairline cracks are 2 to 5 px wide, so a 2.5 px blur would erase them.
* **Filter Null** (trimming empty images) needs a paid Roboflow plan, so the notebook does it instead.

## 3. Kaggle setup (one time)

1. kaggle.com → **Create → New Notebook → File → Import Notebook** → upload `kaggle_train_distress.ipynb`.
2. Right panel → **Session options**:
   * Accelerator: **GPU T4 x2** (best) or **GPU P100**.
   * Internet: **On** (phone verification is required for this).
   * Persistence: Files only.
3. **Add-ons → Secrets → Add secret**: label `ROBOFLOW_API_KEY`, value = Roboflow → Settings → API Keys → *Private API Key*. Tick it for this notebook. **Never** paste the key into a cell, because Kaggle notebooks can be made public.
4. **Create the `old-distress-model` dataset** (needed for fine-tune mode):
   * kaggle.com → **Create → New Dataset**, title `old-distress-model`, keep it **Private**.
   * Upload two files: the old `backend/best.pt` (52 MB) and `training/v1_train_names.txt` (the 3,011 photos the old model trained on).
   * In the notebook: right panel → **Add Input** → *Your Datasets* → `old-distress-model`. The notebook finds the files anywhere under `/kaggle/input`.
5. If you use a P100 (one GPU), set `BATCH = 8` in section 1.

### Fine-tune mode (default) vs scratch mode
`MODE` in section 1 picks the starting weights:

| | `MODE = "finetune"` (recommended) | `MODE = "scratch"` |
|---|---|---|
| Starts from | old `backend/best.pt` (YOLOv8m-seg, trained on v1) | COCO `yolov8l-seg.pt` |
| Epochs / patience | 40 / 15 | 80 / 30 |
| `lr0` / `lrf` / warm-up | 0.002 / 0.1 / 1 | 0.01 / 0.01 / 3 |
| `close_mosaic` | 10 | 15 |
| Run name | `distress_v3_ft_old` | `distress_v3_l1024` |
| Time on T4 x2 | about 3 to 4 h | about 8 to 9 h |

Why fine-tune: the first scratch run on v3 plateaued at mask mAP50 ~0.52 by epoch 29. On test photos neither model had trained on, it scored 0.30 on Longitudinal and 0.29 on Transverse, against the old model's 0.61 and 0.51. It was better only on Alligator (0.81 vs 0.55). Fine-tuning keeps the old model's linear-crack skill and lets v3 improve Alligator.

### The v1-overlap filter (section 3b)
68% of the v3 test photos (and very likely much of val) were in the **old model's training set**, because v1 used a different split. A model fine-tuned from the old weights has already memorised them. That would inflate the test score, and `best.pt` would be picked on memorised val photos. Section 3b moves every val/test image whose original file name (the part before `.rf.`) is in `v1_train_names.txt` into train. Val and test then hold only photos neither model has seen, so section 7's old-vs-new comparison is fair too. Expect val and test to shrink to roughly a third of their size; that is normal.

## 4. Running

1. Run sections 1 to 4 interactively first. Look at the **audit table** and the **12 sample images** in section 4:
   * Class names must say `Distress` (the notebook stops if they don't).
   * Polygons must sit on the cracks or potholes.
2. Then click **Save Version → Save & Run All (Commit)**. A committed run keeps going after you close the browser, up to Kaggle's 12-hour limit. Expect about 5 to 8 hours on T4 x2 for YOLOv8l-seg at 1024.
3. When it finishes, open the version → **Output** and download:
   * `distress_best.pt`: the model for the backend.
   * `distress_v3_ft_old.zip` (or `distress_v3_l1024.zip` in scratch mode): curves, confusion matrix and `test_metrics.csv` for the thesis.

### Training parameters and why

| Parameter | Value | Reason |
|---|---|---|
| `model` | `yolov8l-seg.pt` | More capacity than m; fits a T4 at 1024. Fall back to `yolov8m-seg.pt` on OOM. |
| `imgsz` | 1024 | Cracks disappear at 640. |
| `epochs` / `patience` | 100 / 30 | v3 already triples the train set; early stop if val stalls. |
| `batch` | 16 (T4x2), 8 (P100) | Lower it if you see `CUDA out of memory`. |
| `optimizer`, `lr0`, `lrf` | SGD, 0.01, 0.01 | Standard schedule for training from COCO weights. |
| `cos_lr`, `warmup_epochs` | True, 3 | Smooth decay. |
| `box`, `cls`, `dfl` | 7.5, 0.5, 1.5 | Ultralytics defaults. |
| `mosaic`, `close_mosaic` | 1.0, 15 | Context mixing; the last 15 epochs use plain images. |
| `copy_paste` | 0.3 | Pastes distress masks onto other roads, which helps segmentation a lot. |
| `mixup` | 0.1 | Mild regularisation. |
| `degrees`, `flipud` | 5, 0.0 | Orientation-safe (see section 2). |
| `scale`, `translate` | 0.5, 0.1 | Size variety (near vs far damage). |
| `hsv_h/s/v` | 0.015 / 0.6 / 0.4 | Lighting and asphalt colour variety. |
| `mask_ratio`, `overlap_mask` | 4, True | Defaults. For thinner masks try `mask_ratio=2` (needs more GPU memory). |

### If the session dies
Start a new session and re-run sections 1 to 3. Then run (use the run name for your `MODE`):
```python
from ultralytics import YOLO
YOLO('/kaggle/working/runs/distress_v3_ft_old/weights/last.pt').train(resume=True)
```
To keep `last.pt` between sessions, save the notebook output as a Kaggle Dataset and attach it.

## 5. Reading the results honestly (important for the defense)

The notebook prints two different kinds of numbers. **Name each one correctly in the thesis.**

1. **mAP50, precision, recall and F1 (box and mask)** per class on the **test** split. These are the standard metrics for detection and segmentation. For thin-crack instance segmentation, published work usually reports mask mAP50 around 0.6 to 0.8. A mask mAP50 of 92 to 94% is not a realistic target for cracks; potholes can get close.
2. **Image-level classification accuracy**: for each test image, did the model correctly say whether each distress type is present? This is what most panels mean by "accuracy", and it is the number that can realistically reach the 90s. Call it *image-level accuracy*, not mAP.

The confidence threshold for (2) is chosen on the **validation** split, never on test. It is saved in `deploy_conf.json`, so use it in the backend as well.

Section 7 scores the old `best.pt` (from the `old-distress-model` dataset) and the new model on the **same** filtered test set, which gives a clean before/after table for the thesis.

## 6. Known dataset issues to fix in Roboflow when you have time

* 7 distress images have **no labels**: `alligator0842_aug.jpg`, `alligator1381_aug.jpg`, `alligator1571_aug.jpg`, `alligator3360_aug.jpg`, `alligator3964_aug.jpg`, `potholes158_png.png` and `longitudinal cracks (8446).jpg`. Either label them or delete them.
* 51 files named `longitudinal cracks (...)` carry only Transverse or Alligator labels. The ones checked were labelled correctly (the file name was wrong), but spot-check a few more.
* 1,698 `uncracked_*` tiles are close-up texture patches that look nothing like the road photos. Some background images help reduce false positives; consider replacing most of them with real empty-road frames from your own dashcam or phone.
* 50 file-name groups (e.g. `2.jpg`, `7.jpg`) exist in more than one split. The notebook's pHash check removes the ones that really are the same photo.

## 7. Deploying the new model in the backend

The backend already uses the `... Distress` names. `fuzzy_engine.canonical_label()` maps the old `... Crack` names onto them, so the old `best.pt` and the new `distress_best.pt` both grade correctly, and old reports still match in the admin correction form.

To deploy:
1. Copy `distress_best.pt` over `backend/best.pt` (keep the old file as `best_v2_crack.pt` for the before/after table).
2. Use the confidence in `deploy_conf.json` as the detector's `conf` in `backend/api.py`.
3. Run the backend tests: `cd backend && ../deps/Scripts/python.exe -m unittest discover -s tests`.
