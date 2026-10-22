"""Crack width, measured the way DPWH rates it.

DPWH grades cracking on the *predominant average width* (D.O. 120 s.2019, read
with a Crack Width Scale). The pipeline used to compute mean width as

    mask pixels / skeleton pixels * GSD

The skeleton is a subset of the mask, so that ratio can never fall below one
pixel: at 4.357 mm/px no crack could ever measure under 4.4 mm, and the 3 mm
DPWH cut could never fire. Ragged mask edges also inflate the area term, so the
ratio overstates width on exactly the noisy masks it is most often given.

Here the width is read along the centreline instead. The distance transform of
the mask gives, at every skeleton pixel, the distance d to the nearest edge
pixel centre. On a pixel grid a band of width w has a centre distance of
ceil(w/2): odd widths give 2d - 1 exactly, even ones 2d. The two cannot be told
apart from d alone, so the width is taken as 2d - 0.5, which splits the
difference -- every width is within half a pixel, with no bias either way. The
median over the skeleton is the predominant width, and it is far less
sensitive to a few ragged edge pixels than an area ratio.

The price is at the floor: a crack exactly one pixel wide reads 1.5 px. It is
not worth trading away -- clamping the area ratio into [2d - 1, 2d] fixes that
case but halves even widths, whose skeletons come out two pixels thick, and
doubled the error over the widths that matter (eval/synthetic_width.py).

What this does NOT fix: nothing can measure below one pixel. Sub-3 mm widths
need a finer scale (a reference card in frame, see scale.py, or a closer photo),
not a better formula. Kept free of torch and the models so it can be tested
directly (backend/tests, backend/eval/synthetic_width.py).
"""

from __future__ import annotations

import cv2
import numpy as np


def skeletonize(img: np.ndarray) -> np.ndarray:
    """Morphological skeleton (Lantuejoul): a one-pixel centreline of a mask."""
    skel = np.zeros(img.shape, np.uint8)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    img = img.copy()

    while True:
        open_ = cv2.morphologyEx(img, cv2.MORPH_OPEN, element)
        temp = cv2.subtract(img, open_)
        eroded = cv2.erode(img, element)
        skel = cv2.bitwise_or(skel, temp)
        img = eroded

        if cv2.countNonZero(img) == 0:
            break

    return skel


def measure_width(mask: np.ndarray, gsd_mm_px: float, skeleton: np.ndarray | None = None) -> dict:
    """Width and length of one crack mask.

    Returns width_mm (median along the centreline, the DPWH reading),
    width_mm_area_ratio (the previous method, kept for comparison), length_px
    and the skeleton used.
    """
    binary = (mask > 0).astype(np.uint8) * 255
    skel = skeletonize(binary) if skeleton is None else skeleton
    length_px = int(cv2.countNonZero(skel))
    mask_px = int(cv2.countNonZero(binary))

    if length_px == 0 or mask_px == 0:
        return {"width_mm": 0.0, "width_mm_area_ratio": 0.0, "length_px": 0, "skeleton": skel}

    # Pad so a crack touching the crop edge is not measured as infinitely wide:
    # the transform measures to the nearest ZERO pixel, and the border is not one.
    padded = cv2.copyMakeBorder(binary, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    dist = cv2.distanceTransform(padded, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)[1:-1, 1:-1]

    d = float(np.median(dist[skel > 0]))
    ratio_px = mask_px / length_px
    width_px = max(1.0, 2.0 * d - 0.5)

    return {
        "width_mm": width_px * gsd_mm_px,
        "width_mm_area_ratio": ratio_px * gsd_mm_px,
        "length_px": length_px,
        "skeleton": skel,
    }
