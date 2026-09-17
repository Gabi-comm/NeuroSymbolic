"""Batch-run images through the analysis API and export a CSV for evaluation.

This produces the dataset research question 3 needs: one row per detection, with
all three severity methods side by side, so their agreement with a human
inspector baseline can be compared rather than asserted.

Usage
-----
    # Backend must be running.
    python -m eval.run_batch --images ./eval/samples --out ./eval/results.csv

    # With a known capture geometry for this batch:
    python -m eval.run_batch --images ./eval/samples --out r.csv --gsd 4.357

Then have inspectors grade the same images blind (section 3.5 requires a
double-blind protocol), put their grades in a CSV with columns
`image,detection_index,severity`, and run:

    python -m eval.compare --system results.csv --inspector inspector.csv
"""

from __future__ import annotations

import argparse
import base64
import csv
import sys
import time
from pathlib import Path

import requests

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

FIELDNAMES = [
    "image",
    "detection_index",
    "label",
    "rule_base",
    "width_mm",
    "crack_density_pct",
    "metric_value",
    "unit",
    "confidence",
    "severity_fuzzy",
    "severity_score",
    "severity_crisp",
    "severity_confidence",
    "severity_legacy_crisp",
    "severity_dpwh_nw",
    "overall_severity",
    "gsd_mm_px",
    "ipm_applied",
    "elapsed_s",
]


def encode_image(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".")
    mime = "jpeg" if suffix in {"jpg", "jpeg"} else suffix
    return f"data:image/{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def analyze(api: str, path: Path, gsd: float | None, timeout: int) -> dict | None:
    payload = {"image_base64": encode_image(path)}
    if gsd is not None:
        payload["gsd_mm_px"] = gsd

    started = time.time()
    try:
        response = requests.post(f"{api}/analyze-road", json=payload, timeout=timeout)
    except requests.exceptions.RequestException as exc:
        print(f"  ! {path.name}: {exc}")
        return None

    if response.status_code != 200:
        print(f"  ! {path.name}: HTTP {response.status_code}")
        return None

    result = response.json()
    result["_elapsed"] = time.time() - started
    return result


def rows_for(path: Path, result: dict):
    for index, distress in enumerate(result.get("distresses", [])):
        # The "Clear" placeholder is not a detection; skip it so it cannot
        # inflate agreement statistics.
        if distress.get("label") == "Clear":
            continue

        yield {
            "image": path.name,
            "detection_index": index,
            "label": distress.get("label"),
            "rule_base": distress.get("rule_base"),
            "width_mm": round(distress.get("width_mm", 0), 3),
            "crack_density_pct": distress.get("crack_density_pct"),
            "metric_value": round(distress.get("metric_value", 0), 4),
            "unit": distress.get("unit"),
            "confidence": round(distress.get("confidence", 0), 4),
            "severity_fuzzy": distress.get("severity_fuzzy"),
            "severity_score": distress.get("severity_score"),
            "severity_crisp": distress.get("severity_crisp"),
            "severity_confidence": distress.get("severity_confidence"),
            "severity_legacy_crisp": distress.get("severity_legacy_crisp"),
            "severity_dpwh_nw": distress.get("severity_dpwh_nw"),
            "overall_severity": result.get("overall_severity"),
            "gsd_mm_px": result.get("gsd_mm_px"),
            "ipm_applied": result.get("ipm_applied"),
            "elapsed_s": round(result.get("_elapsed", 0), 2),
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", required=True, type=Path, help="folder of road images")
    parser.add_argument("--out", required=True, type=Path, help="CSV to write")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--gsd", type=float, default=None, help="override GSD in mm/px")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()

    if not args.images.is_dir():
        print(f"Not a folder: {args.images}")
        return 1

    images = sorted(p for p in args.images.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)
    if not images:
        print(f"No images found in {args.images}")
        return 1

    print(f"Analyzing {len(images)} image(s) via {args.api}")
    args.out.parent.mkdir(parents=True, exist_ok=True)

    written = 0
    failed = 0
    with args.out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()

        for path in images:
            result = analyze(args.api, path, args.gsd, args.timeout)
            if result is None:
                failed += 1
                continue

            rows = list(rows_for(path, result))
            writer.writerows(rows)
            written += len(rows)
            print(
                f"  {path.name}: {len(rows)} detection(s), "
                f"density {result.get('crack_density_pct')}%, "
                f"overall {result.get('overall_severity')} "
                f"({result.get('_elapsed', 0):.1f}s)"
            )

    print(f"\nWrote {written} detection row(s) to {args.out}")
    if failed:
        print(f"{failed} image(s) failed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
