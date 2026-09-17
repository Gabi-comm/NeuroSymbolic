"""Statistical treatments named in the paper's Testing Stage (section 3.3) and
Statistical Treatment of Data (section 3.6).

Pure functions with no I/O, so each can be unit-tested and cited independently:

    mask_iou              SAM segmentation accuracy
    cldice                skeleton / centreline accuracy
    mape                  IPM spatial accuracy vs physical tape measures
    cohens_kappa          AI severity grades vs human inspector baselines
    weighted_mean         ISO 25010 Likert scoring

Deliberately implemented here rather than pulled from scikit-learn: these are the
metrics the study is evaluated on, so they should be readable and auditable by a
panel rather than hidden behind an import.
"""

from __future__ import annotations

from collections import Counter
from typing import Iterable, Sequence

import numpy as np


def _as_bool_mask(mask) -> np.ndarray:
    arr = np.asarray(mask)
    return arr > (127 if arr.dtype == np.uint8 and arr.max() > 1 else 0)


def mask_iou(predicted, ground_truth) -> float:
    """Intersection over Union between two binary masks.

    Reported for SAM mask quality. Returns NaN when both masks are empty, since
    an IoU of 1.0 there would flatter the model for finding nothing in an image
    that contained nothing.
    """
    pred = _as_bool_mask(predicted)
    gt = _as_bool_mask(ground_truth)

    if pred.shape != gt.shape:
        raise ValueError(f"shape mismatch: {pred.shape} vs {gt.shape}")

    union = np.logical_or(pred, gt).sum()
    if union == 0:
        return float("nan")

    return float(np.logical_and(pred, gt).sum() / union)


def cldice(predicted, ground_truth, pred_skeleton, gt_skeleton) -> float:
    """Centreline Dice, after Shit et al. (2021).

        T_prec = |S_pred AND V_gt|  / |S_pred|
        T_sens = |S_gt   AND V_pred| / |S_gt|
        clDice = 2 * T_prec * T_sens / (T_prec + T_sens)

    Volumetric Dice rewards getting a crack's thickness right; clDice rewards
    getting its *connectivity* right. For crack tracing that is the property
    that matters, because a skeleton broken into fragments produces a badly
    understated length even when the mask overlap looks respectable.

    Pass skeletons from `skeletonize_opencv` so the measurement matches the
    pipeline rather than a different thinning algorithm.
    """
    v_pred = _as_bool_mask(predicted)
    v_gt = _as_bool_mask(ground_truth)
    s_pred = _as_bool_mask(pred_skeleton)
    s_gt = _as_bool_mask(gt_skeleton)

    if s_pred.sum() == 0 or s_gt.sum() == 0:
        return float("nan")

    t_prec = float(np.logical_and(s_pred, v_gt).sum() / s_pred.sum())
    t_sens = float(np.logical_and(s_gt, v_pred).sum() / s_gt.sum())

    if (t_prec + t_sens) == 0:
        return 0.0

    return 2.0 * t_prec * t_sens / (t_prec + t_sens)


def mape(measured: Sequence[float], actual: Sequence[float]) -> float:
    """Mean Absolute Percentage Error, as a percentage.

    Used for IPM spatial validation: system measurements against physical tape
    measures. Zero-valued ground truths are skipped, as MAPE is undefined there.
    """
    measured = np.asarray(measured, dtype=float)
    actual = np.asarray(actual, dtype=float)

    if measured.shape != actual.shape:
        raise ValueError("measured and actual must be the same length")

    usable = actual != 0
    if not usable.any():
        return float("nan")

    return float(
        np.mean(np.abs((actual[usable] - measured[usable]) / actual[usable])) * 100.0
    )


def cohens_kappa(rater_a: Sequence, rater_b: Sequence) -> float:
    """Cohen's Kappa: agreement corrected for chance.

        k = (p_observed - p_expected) / (1 - p_expected)

    This is the paper's measure for "alignment with baseline manual evaluations
    by human inspectors". Raw percentage agreement would overstate the result,
    because two raters who both mostly say "Low" agree often by accident.

    Landis & Koch bands: <0 poor, 0-.20 slight, .21-.40 fair, .41-.60 moderate,
    .61-.80 substantial, .81-1 almost perfect.
    """
    a, b = list(rater_a), list(rater_b)
    if len(a) != len(b):
        raise ValueError("raters must have the same number of items")
    n = len(a)
    if n == 0:
        return float("nan")

    p_observed = sum(1 for x, y in zip(a, b) if x == y) / n

    count_a, count_b = Counter(a), Counter(b)
    p_expected = sum(
        (count_a[label] / n) * (count_b[label] / n)
        for label in set(count_a) | set(count_b)
    )

    if p_expected == 1.0:
        # Both raters used a single identical label throughout; kappa undefined.
        return float("nan")

    return (p_observed - p_expected) / (1 - p_expected)


def kappa_interpretation(kappa: float) -> str:
    if np.isnan(kappa):
        return "undefined"
    if kappa < 0:
        return "poor"
    if kappa <= 0.20:
        return "slight"
    if kappa <= 0.40:
        return "fair"
    if kappa <= 0.60:
        return "moderate"
    if kappa <= 0.80:
        return "substantial"
    return "almost perfect"


def weighted_mean(responses: Iterable[int], scale_max: int = 4) -> float:
    """Average Weighted Mean for the ISO 25010 questionnaire (4-point Likert)."""
    values = [v for v in responses if v is not None]
    if not values:
        return float("nan")
    if any(v < 1 or v > scale_max for v in values):
        raise ValueError(f"responses must fall within 1..{scale_max}")
    return float(sum(values) / len(values))


def accuracy(predicted: Sequence, truth: Sequence) -> float:
    """Plain agreement rate. Report alongside kappa, never instead of it."""
    if len(predicted) != len(truth):
        raise ValueError("predicted and truth must be the same length")
    if not predicted:
        return float("nan")
    return sum(1 for p, t in zip(predicted, truth) if p == t) / len(predicted)
