"""Width validation without a tape measure: check (a), synthetic cracks.

Draws cracks of known width onto a blank mask -- straight at several angles, and
a meandering one -- runs each through the same measure.measure_width the API
uses, and reports MAPE against the drawn width with eval.metrics.mape. Both
methods are scored: the DPWH-style median along the centreline (current) and
the old mask-area / skeleton-length ratio.

It runs at two scales, because the scale is the real limit:

    4.357 mm/px   the default, one 3.05 m lane across the 700 px warp
    0.5 mm/px     what a reference card at close range gives

At 4.357 mm/px a 1 mm or 3 mm crack is under one pixel wide and cannot be
measured by any formula; it is drawn as one pixel and reads as one pixel. That
row is the evidence for the reference card, not a failure of the method.

    cd backend
    ../deps/Scripts/python.exe -m eval.synthetic_width
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import measure  # noqa: E402
from eval.metrics import mape  # noqa: E402

WIDTHS_MM = (1, 2, 3, 5, 10, 15)
SCALES_MM_PX = (4.357, 0.5)
ANGLES_DEG = (0, 20, 45, 70, 90)
CANVAS = 700


def centreline_straight(angle_deg: float) -> np.ndarray:
    img = np.zeros((CANVAS, CANVAS), np.uint8)
    t = np.deg2rad(angle_deg)
    c, half = CANVAS / 2, CANVAS * 0.38
    p1 = (int(c - half * np.cos(t)), int(c - half * np.sin(t)))
    p2 = (int(c + half * np.cos(t)), int(c + half * np.sin(t)))
    cv2.line(img, p1, p2, 255, 1)
    return img


def centreline_meander() -> np.ndarray:
    img = np.zeros((CANVAS, CANVAS), np.uint8)
    xs = np.linspace(80, CANVAS - 80, 400)
    ys = CANVAS / 2 + 90 * np.sin(xs / 70.0)
    pts = np.stack([xs, ys], axis=1).astype(np.int32)
    cv2.polylines(img, [pts], False, 255, 1)
    return img


def crack_mask(centreline: np.ndarray, width_px: float) -> np.ndarray:
    """Every pixel within width/2 of the centreline: a crack of exactly that width."""
    dist = cv2.distanceTransform(255 - centreline, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    # A crack narrower than a pixel still occupies one pixel on the sensor.
    return ((dist <= max(width_px, 1.0) / 2.0) * 255).astype(np.uint8)


def run() -> dict:
    shapes = [(f"straight {a} deg", centreline_straight(a)) for a in ANGLES_DEG]
    shapes.append(("meander", centreline_meander()))

    report = {}
    for gsd in SCALES_MM_PX:
        rows = []
        for width in WIDTHS_MM:
            new, old = [], []
            for _, line in shapes:
                result = measure.measure_width(crack_mask(line, width / gsd), gsd)
                new.append(result["width_mm"])
                old.append(result["width_mm_area_ratio"])
            rows.append((width, float(np.mean(new)), float(np.mean(old)),
                         mape(new, [width] * len(new)), mape(old, [width] * len(old))))
        report[gsd] = rows
    return report


if __name__ == "__main__":
    for gsd, rows in run().items():
        print(f"\nScale {gsd} mm/px")
        print(f"{'true mm':>8} {'median mm':>10} {'ratio mm':>9} {'MAPE median':>12} {'MAPE ratio':>11}")
        for width, new, old, e_new, e_old in rows:
            print(f"{width:>8} {new:>10.2f} {old:>9.2f} {e_new:>11.1f}% {e_old:>10.1f}%")
        resolvable = [r for r in rows if r[0] >= 2 * gsd]
        if resolvable:
            print(f"  MAPE over widths >= 2 px: median "
                  f"{np.mean([r[3] for r in resolvable]):.1f}%, ratio "
                  f"{np.mean([r[4] for r in resolvable]):.1f}%")
