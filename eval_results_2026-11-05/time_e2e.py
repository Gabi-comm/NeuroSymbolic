"""Time 10 POST /analyze-road requests against a locally running backend.

Images: first 10 files (sorted by name) of My-First-Project-1/test/images.
Payload matches the frontend (app/api/analyze/route.ts forwards the body as-is):
{"image_base64": "data:image/jpeg;base64,..."}; pavement_type left at backend default.
Writes e2e_timing.csv and e2e_responses.json (bulletins, no images) next to this file.
"""
import base64, json, statistics, sys, time, csv
from pathlib import Path
import requests

HERE = Path(__file__).parent
IMG_DIR = HERE.parent / "My-First-Project-1" / "test" / "images"
API = "http://127.0.0.1:8000/analyze-road"

imgs = sorted(p for p in IMG_DIR.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})[:10]
rows, keep = [], []
for p in imgs:
    payload = {"image_base64": "data:image/jpeg;base64," + base64.b64encode(p.read_bytes()).decode()}
    t0 = time.perf_counter()
    r = requests.post(API, json=payload, timeout=900)
    dt = time.perf_counter() - t0
    body = r.json()
    rows.append({"image": p.name, "status": r.status_code, "seconds": round(dt, 3)})
    keep.append({
        "image": p.name, "status": r.status_code, "seconds": round(dt, 3),
        "bulletin": body.get("gemini_bulletin"),
        "distresses": [{k: d.get(k) for k in ("label", "severity_fuzzy", "severity")} for d in body.get("distresses", [])],
        "overall_severity": body.get("overall_severity"),
        "crack_density_pct": body.get("crack_density_pct"),
        "message": body.get("message"),
    })
    print(f"{p.name}: HTTP {r.status_code} {dt:.2f}s", flush=True)

with open(HERE / "e2e_timing.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["image", "status", "seconds"]); w.writeheader(); w.writerows(rows)
(HERE / "e2e_responses.json").write_text(json.dumps(keep, indent=2), encoding="utf-8")

s = [r["seconds"] for r in rows]
print(f"n={len(s)} mean={statistics.mean(s):.3f} median={statistics.median(s):.3f} max={max(s):.3f} min={min(s):.3f}")
