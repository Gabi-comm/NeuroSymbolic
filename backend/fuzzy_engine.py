"""Symbolic component: a Fuzzy Logic severity engine.

This replaces the three crisp if/elif cuts that previously graded every defect on
mean crack width alone. Those cuts are kept, but only as a labelled baseline, so
research question 3 has something to compare against.

Why fuzzy at all
----------------
Optical measurement of a pavement defect is uncertain: the mask boundary is
approximate, the IPM warp assumes the capture guidelines were followed, and a
crack that measures 5.9 mm is not meaningfully different from one that measures
6.1 mm. A crisp threshold at 6.0 mm claims a precision the measurement does not
have. Overlapping membership functions let a defect be partly Moderate and partly
Wide, which is how a human inspector actually reasons.

Three severity outputs per detection
------------------------------------
    severity_fuzzy       this engine (the proposed method)
    severity_crisp       the previous hard thresholds (rule-based baseline)
    severity_confidence  neural detection confidence alone (neural baseline)

RQ3 asks whether fuzzy reasoning differs significantly from "relying solely on
standard neural network confidence scores". Emitting all three per detection is
what makes that comparison computable rather than asserted.

Provenance of the thresholds
----------------------------
Sourced directly from the **DPWH Visual Road Condition Assessment Manual 2019
Version 2**, attached to Department Order No. 120, Series of 2019, and from
**DPWH Department Order No. 47, Series of 2024**. See `proof.md` in the repo root
for verbatim quotations and page anchors.

DPWH rates flexible-pavement cracking severity on crack width, in TWO bands:

    Narrow 'N'  <= 3 mm average crack width
    Wide   'W'   > 3 mm average crack width

measured with a physical Crack Width Scale against the Flexible Pavement Marks.
This applies to Crocodile (alligator), Longitudinal and Transverse cracking.

Extent is a separate axis: "the total area of cracking within the segment over
the total area of the segment and expressed as a percentage". The manual states
defects are "rated on a two-dimensional scale covering the severity and extent of
distress exhibited", with severity "banded in either 2 or 3 levels".

Potholes carry NO severity band: they are counted, and "One (1) pothole is
equivalent to 0.25 m2".

CORRECTION, 2026-09-17: an earlier revision of this file used 6 mm and 19 mm,
taken from the US Pavement Distress Identification Manual (ASTM D6433 / LTPP).
Those are NOT the DPWH values. The D.O. 120 s.2019 PDF *is* publicly downloadable
from dpwh.gov.ph -- an earlier fetch failed only for want of a browser
user-agent, and the wrong conclusion was drawn from that failure. The study's
own original 3.0 mm figure was right; its 6.0 mm second cut has no DPWH basis.

Why three output levels from a two-level standard
-------------------------------------------------
DPWH's severity axis is binary, but its rating scheme is explicitly
two-dimensional: severity AND extent. The fuzzy engine combines those two DPWH
axes into the Low/Medium/High output this study requires. That synthesis is
consistent with DPWH's own weighting, which already treats the combination as
graded -- VCI weight factors (D.O. 120, Table 4) run Crocodile-Narrow 3.5,
Crocodile-Wide 5.9, Transverse-Narrow 3.3, Transverse-Wide 5.5.

The literal DPWH two-band verdict is emitted alongside, as `severity_dpwh_nw`,
so a rating can always be checked against the standard unmodified.

TUNING
------
Every number lives in the dicts at the top of this module. Section 3.1 commits to
refining the rule base from domain-expert feedback, so these are deliberately in
one place and not scattered through the code.
"""

from __future__ import annotations

import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl

# ---------------------------------------------------------------------------
# Tunable parameters
# ---------------------------------------------------------------------------

# Mean crack width in millimetres. Trapezoids as [a, b, c, d]: membership ramps
# 0->1 across a..b, holds at 1 across b..c, ramps 1->0 across c..d.
#
# DPWH defines exactly two bands, split at 3 mm (D.O. 120 s.2019, Visual Road
# Condition Assessment Manual, "SEVERITY"):
#     Narrow 'N' <= 3 mm      Wide 'W' > 3 mm
#
# The fuzzy sets straddle that single cut. A 2.9 mm crack and a 3.1 mm crack are
# not categorically different, and an optical measurement through an IPM warp
# cannot resolve 0.2 mm anyway -- which is the whole reason for fuzzifying a
# threshold the standard states crisply.
WIDTH_MF = {
    "narrow": [0.0, 0.0, 2.0, 4.0],
    "wide":   [2.0, 4.0, 60.0, 60.0],
}
# Generous headroom: DPWH's Wide band is unbounded above 3 mm.
WIDTH_MAX_MM = 60.0

# The DPWH cut itself, for the literal two-band verdict.
DPWH_NARROW_MAX_MM = 3.0

# Crack extent: defect mask area as a percentage of the analysed road surface.
# This matches DPWH's own definition of extent -- "the total area of cracking
# within the segment over the total area of the segment and expressed as a
# percentage" -- applied to a single photographed patch rather than to a 100 m
# segment. That difference of spatial scale is a stated limitation, not a
# different metric.
#
# DPWH publishes no discrete extent bands for cracking (extent feeds the VCI
# formula as a continuous percentage), but it does publish a decision boundary:
# alligator cracking "More than 167.5 sq.m. (continuous)" is Beyond Routine
# Maintenance (D.O. 47 s.2024, Table 5.1). Over a standard 3.05 m lane that is
# roughly 55 m of continuous cracking, i.e. about 55% of a 100 m segment lane
# area -- which is where the "dense" set is anchored.
DENSITY_MF = {
    "sparse": [0.0, 0.0, 5.0, 15.0],
    "medium": [10.0, 20.0, 35.0, 50.0],
    "dense":  [45.0, 55.0, 100.0, 100.0],
}
DENSITY_MAX_PCT = 100.0

# Beyond Routine Maintenance anchor, as a share of lane area (D.O. 47 s.2024).
BRM_EXTENT_PCT = 55.0

# Defuzzified severity score, 0-100.
SEVERITY_MF = {
    "low":    [0.0, 0.0, 15.0, 35.0],
    "medium": [25.0, 40.0, 60.0, 75.0],
    "high":   [65.0, 85.0, 100.0, 100.0],
}

# Score -> label. Even thirds, so the banding is trivial to state in the paper.
BAND_LOW_MAX = 33.34
BAND_MEDIUM_MAX = 66.67

# Defects measured by surface extent rather than by crack width.
AREA_DEFECT_LABELS = {"Alligator Crack", "Pothole"}

# --- Potholes -----------------------------------------------------------------
#
# The distress standard does not stratify potholes: "There are no stratified
# severities for Patching/Potholes. They either are present or they are not."
#
# That is also the answer to whether depth belongs in the calculation. It does
# not, for two independent reasons:
#   1. The study is 2D optical only and cannot measure depth (delimitation 3).
#   2. The governing standard does not ask for it -- pothole severity is not a
#      graded quantity at all.
#
# DPWH confirms this directly: potholes are "rated according to the number of
# potholes... One (1) pothole is equivalent to 0.25 m2" -- a count, not a grade
# (D.O. 120 s.2019, POTHOLES (Flexible Pavement)).
#
# So a detected pothole is reported at a single fixed severity. High is used
# because D.O. 47 s.2024 gives potholes a 3-working-day response time (the
# shortest band, Table 4.1) and the highest inspection weight of any pavement
# defect at 10% (Table 6.1a) -- the same judgement expressed as urgency.
POTHOLE_LABEL = "Pothole"
POTHOLE_STRATIFIED = False
POTHOLE_FIXED_SEVERITY = "High"
POTHOLE_FIXED_SCORE = 100.0

# Baselines -------------------------------------------------------------------

# Rule-based baseline: the same DPWH inputs, combined crisply instead of fuzzily.
#
# Holding the inputs and cut points identical to the fuzzy engine isolates the
# one variable RQ3 tests -- the reasoning method -- rather than confounding it
# with a change of threshold values.
CRISP_WIDTH_CUT_MM = 3.0
CRISP_EXTENT_MEDIUM_PCT = 15.0
CRISP_EXTENT_DENSE_PCT = 50.0

# Superseded. The study's original pair: 3.0 mm matches DPWH, 6.0 mm does not.
LEGACY_CRISP_LOW_MAX_MM = 3.0
LEGACY_CRISP_MEDIUM_MAX_MM = 6.0

# Neural-only baseline: severity inferred from detection confidence alone. This
# is deliberately a weak proxy -- demonstrating that is the point of RQ3. A
# detector's confidence expresses "how sure am I this is a crack", never "how bad
# is this crack", so any mapping is arbitrary. Equal thirds avoid smuggling in
# engineering judgement that the neural output does not contain.
CONFIDENCE_LOW_MAX = 0.3334
CONFIDENCE_MEDIUM_MAX = 0.6667


# ---------------------------------------------------------------------------
# Control system construction
# ---------------------------------------------------------------------------

_WIDTH_UNIVERSE = np.arange(0.0, WIDTH_MAX_MM + 0.05, 0.05)
_DENSITY_UNIVERSE = np.arange(0.0, DENSITY_MAX_PCT + 0.25, 0.25)
_SEVERITY_UNIVERSE = np.arange(0.0, 100.25, 0.25)


def _build_antecedents():
    width = ctrl.Antecedent(_WIDTH_UNIVERSE, "width_mm")
    density = ctrl.Antecedent(_DENSITY_UNIVERSE, "density_pct")
    severity = ctrl.Consequent(_SEVERITY_UNIVERSE, "severity_score")

    for name, points in WIDTH_MF.items():
        width[name] = fuzz.trapmf(width.universe, points)
    for name, points in DENSITY_MF.items():
        density[name] = fuzz.trapmf(density.universe, points)
    for name, points in SEVERITY_MF.items():
        severity[name] = fuzz.trapmf(severity.universe, points)

    return width, density, severity


def _linear_rules(width, density, severity):
    """Longitudinal and Transverse cracking.

    Width leads. DPWH treats a Wide crack as materially worse regardless of how
    much of the segment it covers: VCI weight 5.5 Wide against 3.3 Narrow for
    transverse cracking (D.O. 120 s.2019, Table 4).
    """
    return [
        ctrl.Rule(width["narrow"] & density["sparse"], severity["low"]),
        ctrl.Rule(width["narrow"] & density["medium"], severity["low"]),
        ctrl.Rule(width["narrow"] & density["dense"], severity["medium"]),

        ctrl.Rule(width["wide"] & density["sparse"], severity["medium"]),
        ctrl.Rule(width["wide"] & density["medium"], severity["high"]),
        ctrl.Rule(width["wide"] & density["dense"], severity["high"]),
    ]


def _area_rules(width, density, severity):
    """Crocodile (alligator) cracking.

    Extent leads, and escalates faster than for linear cracking. DPWH weights
    crocodile above transverse at both severities (5.9 / 3.5 against 5.5 / 3.3),
    gives alligator cracking a 3-working-day response time and a 9% inspection
    weight, and declares it Beyond Routine Maintenance past 167.5 sq.m
    continuous -- none of which has a crack-width term in it.
    """
    return [
        ctrl.Rule(density["sparse"] & width["narrow"], severity["low"]),
        ctrl.Rule(density["sparse"] & width["wide"], severity["medium"]),

        ctrl.Rule(density["medium"] & width["narrow"], severity["medium"]),
        ctrl.Rule(density["medium"] & width["wide"], severity["high"]),

        ctrl.Rule(density["dense"] & width["narrow"], severity["high"]),
        ctrl.Rule(density["dense"] & width["wide"], severity["high"]),
    ]


_WIDTH, _DENSITY, _SEVERITY = _build_antecedents()
_LINEAR_SYSTEM = ctrl.ControlSystem(_linear_rules(_WIDTH, _DENSITY, _SEVERITY))
_AREA_SYSTEM = ctrl.ControlSystem(_area_rules(_WIDTH, _DENSITY, _SEVERITY))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def score_to_label(score: float) -> str:
    if score < BAND_LOW_MAX:
        return "Low"
    if score < BAND_MEDIUM_MAX:
        return "Medium"
    return "High"


def dpwh_severity(width_mm: float) -> str:
    """The literal DPWH two-band verdict: 'Narrow' or 'Wide'.

    D.O. 120 s.2019, Visual Road Condition Assessment Manual:
        Narrow 'N' <= 3 mm average crack width
        Wide   'W'  > 3 mm average crack width
    """
    return "Narrow" if width_mm <= DPWH_NARROW_MAX_MM else "Wide"


def crisp_severity(width_mm: float, density_pct: float) -> str:
    """The same DPWH inputs combined with hard cuts: the rule-based baseline."""
    wide = width_mm > CRISP_WIDTH_CUT_MM

    if density_pct >= CRISP_EXTENT_DENSE_PCT:
        return "High"
    if wide and density_pct >= CRISP_EXTENT_MEDIUM_PCT:
        return "High"
    if wide or density_pct >= CRISP_EXTENT_MEDIUM_PCT:
        return "Medium"
    return "Low"


def confidence_severity(confidence: float) -> str:
    """Neural baseline: severity from detection confidence alone (RQ3).

    Deliberately a weak proxy. A detector's confidence expresses "how sure am I
    this is a crack", never "how bad is this crack", so any mapping is arbitrary;
    equal thirds avoid smuggling in engineering judgement the neural output does
    not contain. Demonstrating that weakness is the point of RQ3.
    """
    if confidence < CONFIDENCE_LOW_MAX:
        return "Low"
    if confidence < CONFIDENCE_MEDIUM_MAX:
        return "Medium"
    return "High"


def legacy_crisp_severity(width_mm: float) -> str:
    """The study's original 3.0/6.0 mm thresholds, for reproducing prior results."""
    if width_mm < LEGACY_CRISP_LOW_MAX_MM:
        return "Low"
    if width_mm <= LEGACY_CRISP_MEDIUM_MAX_MM:
        return "Medium"
    return "High"


def membership_trace(width_mm: float, density_pct: float) -> dict:
    """Degree to which the inputs belong to each linguistic term.

    This is the explainable logic trace the architecture model promises: it shows
    an engineer *why* a grade was assigned, e.g. a 5.8 mm crack reading 0.48
    Moderate and 0.32 Wide rather than being silently forced to one side of a
    6.0 mm line.
    """
    width_mm = float(np.clip(width_mm, 0.0, WIDTH_MAX_MM))
    density_pct = float(np.clip(density_pct, 0.0, DENSITY_MAX_PCT))

    return {
        "width_mm": round(width_mm, 3),
        "density_pct": round(density_pct, 3),
        "width": {
            name: round(
                float(fuzz.interp_membership(_WIDTH.universe, _WIDTH[name].mf, width_mm)), 3
            )
            for name in WIDTH_MF
        },
        "density": {
            name: round(
                float(
                    fuzz.interp_membership(_DENSITY.universe, _DENSITY[name].mf, density_pct)
                ),
                3,
            )
            for name in DENSITY_MF
        },
    }


def evaluate(label: str, width_mm: float, density_pct: float, confidence: float) -> dict:
    """Grade one detection with all three methods.

    Returns the fuzzy grade and score, the two baselines, the rule base used, and
    the membership trace.
    """
    width_mm = float(np.clip(width_mm, 0.0, WIDTH_MAX_MM))
    density_pct = float(np.clip(density_pct, 0.0, DENSITY_MAX_PCT))

    # Potholes are not a graded distress under the standard; see POTHOLE_* above.
    if label == POTHOLE_LABEL and not POTHOLE_STRATIFIED:
        return {
            "severity_fuzzy": POTHOLE_FIXED_SEVERITY,
            "severity_score": POTHOLE_FIXED_SCORE,
            "severity_crisp": POTHOLE_FIXED_SEVERITY,
            "severity_confidence": confidence_severity(confidence),
            "severity_legacy_crisp": legacy_crisp_severity(width_mm),
            "severity_dpwh_nw": "Not rated",
            "rule_base": "pothole-unstratified",
            "membership_trace": membership_trace(width_mm, density_pct),
        }

    is_area_defect = label in AREA_DEFECT_LABELS
    system = _AREA_SYSTEM if is_area_defect else _LINEAR_SYSTEM

    # A fresh simulation per call: ControlSystemSimulation carries state between
    # computes and is not safe to share across requests.
    simulation = ctrl.ControlSystemSimulation(system)
    simulation.input["width_mm"] = width_mm
    simulation.input["density_pct"] = density_pct

    try:
        simulation.compute()
        score = float(simulation.output["severity_score"])
        fuzzy_label = score_to_label(score)
    except Exception:
        # Total rule failure should be impossible: the trapezoids span both
        # universes. Fall back to the crisp baseline rather than 500 the request.
        score = float("nan")
        fuzzy_label = crisp_severity(width_mm, density_pct)

    return {
        "severity_fuzzy": fuzzy_label,
        "severity_score": None if np.isnan(score) else round(score, 2),
        "severity_crisp": crisp_severity(width_mm, density_pct),
        "severity_confidence": confidence_severity(confidence),
        "severity_legacy_crisp": legacy_crisp_severity(width_mm),
        "severity_dpwh_nw": dpwh_severity(width_mm),
        "rule_base": "area" if is_area_defect else "linear",
        "membership_trace": membership_trace(width_mm, density_pct),
    }


# ---------------------------------------------------------------------------
# Maintenance intervention mapping
# ---------------------------------------------------------------------------
#
# Resolved symbolically, not by the language model. Asking a 3B model to look up
# an intervention from a reference table produced cross-contaminated answers
# (mill-and-overlay prescribed for a transverse crack, which belongs to alligator
# cracking). The mapping is deterministic engineering knowledge, so it belongs in
# the symbolic layer, where it is auditable and citable. The LLM then only has to
# write prose around facts that are already settled -- which is the whole premise
# of a neurosymbolic system.
#
# Aligned to standard asphalt maintenance practice for each distress class.
# DPWH response-time rules set the urgency separately: potholes and cracks carry a
# three-day repair window, scaling and depressions up to thirty days.
# CONFIRM the exact intervention names against the DPWH manual before defence.

INTERVENTIONS = {
    "Longitudinal Crack": {
        "Low": "Crack sealing",
        "Medium": "Crack sealing",
        "High": "Rout and seal",
    },
    "Transverse Crack": {
        "Low": "Crack sealing",
        "Medium": "Crack sealing",
        "High": "Rout and seal",
    },
    "Alligator Crack": {
        "Low": "Surface seal",
        "Medium": "Partial-depth patching",
        "High": "Mill-and-overlay",
    },
    "Pothole": {
        "Low": "Cold-mix patching",
        "Medium": "Cold-mix patching",
        "High": "Full-depth patching",
    },
}

DEFAULT_INTERVENTION = "Inspect and assess on site"

# Overall priority from the worst severity present and the measured extent.
PRIORITY_DENSITY_ESCALATION_PCT = 25.0


def intervention_for(label: str, severity: str) -> str:
    return INTERVENTIONS.get(label, {}).get(severity, DEFAULT_INTERVENTION)


def priority_level(worst_severity: str, density_pct: float) -> str:
    """Routine / Moderate / High / Urgent.

    Severity sets the floor; widespread extent escalates one step, because a road
    covered in medium-severity distress needs attention sooner than one with a
    single medium defect.
    """
    base = {"Low": "Routine", "Medium": "Moderate", "High": "High"}.get(
        worst_severity, "Routine"
    )

    if density_pct >= PRIORITY_DENSITY_ESCALATION_PCT:
        return {"Routine": "Moderate", "Moderate": "High", "High": "Urgent"}[base]

    return base
