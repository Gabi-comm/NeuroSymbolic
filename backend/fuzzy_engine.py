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

THE CITY ENGINEER'S 10 mm BAND (2026-10-22)
-------------------------------------------
The study area's City Engineer validated three width bands: Low under 3 mm
(micro cracks), Medium 3 to 10 mm (open cracks), High over 10 mm (wide
structural cracks), with High also covering several alligator cracks spanning
continuous sections. The 3 mm cut is DPWH's own (D.O. 120 s.2019; DILG LRBICS
2020 uses the same "Wide > 3 mm"). No pavement standard uses 10 mm as a width
cut: the nearest published basis is 13 mm (1/2 in) for concrete cracks in the
FHWA LTPP manual and the PAVER (ASTM D6433) concrete manual. It is cited as the
City Engineer's expert criterion, which Section 3.1 provides for. High is the
LRBICS "shattered slab" condition (Sec. III.5.2.5), and over 10 mm is the
engineer's field indicator for it.

Potholes are now stratified by area, not graded by depth, which a 2D photo
cannot measure: DPWH counts a pothole as 0.25 m2 (D.O. 120 s.2019), so a single
pothole up to 0.25 m2 is the engineer's "moderate pothole" (Medium), and a
larger one, or more than one in the photo, is High.

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
#
# The City Engineer splits Wide at 10 mm (see the module docstring), so there are
# three width terms: narrow (DPWH Narrow), open (3-10 mm) and wide (over 10 mm).
# Each cut is fuzzified over +/-2 mm, the same treatment as the 3 mm cut.
WIDTH_MF = {
    "narrow": [0.0, 0.0, 2.0, 4.0],
    "open":   [2.0, 4.0, 8.0, 12.0],
    "wide":   [8.0, 12.0, 60.0, 60.0],
}
# Generous headroom: DPWH's Wide band is unbounded above 3 mm.
WIDTH_MAX_MM = 60.0

# The DPWH cut itself, for the literal two-band verdict.
DPWH_NARROW_MAX_MM = 3.0

# City Engineer's criterion: above this a crack is wide and structural (High).
ENGINEER_HIGH_MIN_MM = 10.0

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
# Revised with the City Engineer (2026-10-22): the count unit itself gives a
# size line. A single pothole up to one DPWH unit (0.25 m2) is a "moderate
# pothole", Medium; one larger, or more than one in the photo, is High. Depth is
# still not used. Neither grade is below Medium: D.O. 47 s.2024 gives potholes a
# 3-working-day response (Table 4.1) and the highest inspection weight, 10%.
POTHOLE_LABEL = "Pothole"
POTHOLE_STRATIFIED = True
POTHOLE_UNIT_AREA_M2 = 0.25
POTHOLE_SCORES = {"Medium": 50.0, "High": 100.0}

# Baselines -------------------------------------------------------------------

# Rule-based baseline: the same DPWH inputs, combined crisply instead of fuzzily.
#
# Holding the inputs and cut points identical to the fuzzy engine isolates the
# one variable RQ3 tests -- the reasoning method -- rather than confounding it
# with a change of threshold values.
CRISP_WIDTH_CUT_MM = DPWH_NARROW_MAX_MM
CRISP_WIDTH_WIDE_MM = ENGINEER_HIGH_MIN_MM
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


# Rule tables: (width term, density term) -> severity term. One table per rule
# base, read by BOTH the fuzzy engine and the crisp baseline, so the two methods
# can only ever differ in how they reason, never in what the rules say.

# Longitudinal and Transverse cracking. Width leads: DPWH treats a Wide crack as
# materially worse regardless of extent (VCI weight 5.5 Wide against 3.3 Narrow,
# D.O. 120 s.2019, Table 4), and the City Engineer makes anything over 10 mm High
# on width alone.
LINEAR_RULES = {
    ("narrow", "sparse"): "low",
    ("narrow", "medium"): "low",
    ("narrow", "dense"):  "medium",
    ("open",   "sparse"): "medium",
    ("open",   "medium"): "medium",
    ("open",   "dense"):  "high",
    ("wide",   "sparse"): "high",
    ("wide",   "medium"): "high",
    ("wide",   "dense"):  "high",
}

# Crocodile (alligator) cracking. Extent leads and escalates faster: DPWH weights
# crocodile above transverse at both severities (5.9 / 3.5 against 5.5 / 3.3),
# and declares it Beyond Routine Maintenance past 167.5 sq.m continuous -- the
# engineer's "several alligator cracks spanning continuous road sections". Dense
# is High whatever the width.
AREA_RULES = {
    ("narrow", "sparse"): "low",
    ("open",   "sparse"): "medium",
    ("wide",   "sparse"): "high",
    ("narrow", "medium"): "medium",
    ("open",   "medium"): "medium",
    ("wide",   "medium"): "high",
    ("narrow", "dense"):  "high",
    ("open",   "dense"):  "high",
    ("wide",   "dense"):  "high",
}


def _rules_from(table, width, density, severity):
    return [
        ctrl.Rule(width[w] & density[d], severity[out])
        for (w, d), out in table.items()
    ]


_WIDTH, _DENSITY, _SEVERITY = _build_antecedents()
_LINEAR_SYSTEM = ctrl.ControlSystem(_rules_from(LINEAR_RULES, _WIDTH, _DENSITY, _SEVERITY))
_AREA_SYSTEM = ctrl.ControlSystem(_rules_from(AREA_RULES, _WIDTH, _DENSITY, _SEVERITY))


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


def _crisp_width_term(width_mm: float) -> str:
    if width_mm <= CRISP_WIDTH_CUT_MM:
        return "narrow"
    if width_mm <= CRISP_WIDTH_WIDE_MM:
        return "open"
    return "wide"


def _crisp_density_term(density_pct: float) -> str:
    if density_pct < CRISP_EXTENT_MEDIUM_PCT:
        return "sparse"
    if density_pct < CRISP_EXTENT_DENSE_PCT:
        return "medium"
    return "dense"


def crisp_severity(width_mm: float, density_pct: float, label: str | None = None) -> str:
    """The same DPWH inputs and rule table with hard cuts: the rule-based baseline."""
    table = AREA_RULES if label in AREA_DEFECT_LABELS else LINEAR_RULES
    term = table[(_crisp_width_term(width_mm), _crisp_density_term(density_pct))]
    return term.capitalize()


def pothole_severity(area_m2: float | None, pothole_count: int) -> str:
    """Medium for one pothole up to one DPWH unit (0.25 m2); High otherwise."""
    if pothole_count > 1:
        return "High"
    if area_m2 is None or area_m2 > POTHOLE_UNIT_AREA_M2:
        return "High"
    return "Medium"


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
    an engineer *why* a grade was assigned, e.g. a 9 mm crack reading 0.75 open
    and 0.25 wide rather than being silently forced to one side of the 10 mm
    line.
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


def evaluate(
    label: str,
    width_mm: float,
    density_pct: float,
    confidence: float,
    area_m2: float | None = None,
    pothole_count: int = 1,
) -> dict:
    """Grade one detection with all three methods.

    Returns the fuzzy grade and score, the two baselines, the rule base used, and
    the membership trace. area_m2 and pothole_count are only read for potholes.
    """
    width_mm = float(np.clip(width_mm, 0.0, WIDTH_MAX_MM))
    density_pct = float(np.clip(density_pct, 0.0, DENSITY_MAX_PCT))

    # Potholes: graded on DPWH's count unit, not on width; see POTHOLE_* above.
    if label == POTHOLE_LABEL:
        grade = pothole_severity(area_m2, pothole_count)
        return {
            "severity_fuzzy": grade,
            "severity_score": POTHOLE_SCORES[grade],
            "severity_crisp": grade,
            "severity_confidence": confidence_severity(confidence),
            "severity_legacy_crisp": legacy_crisp_severity(width_mm),
            "severity_dpwh_nw": "Not rated",
            "rule_base": "pothole-area",
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
        fuzzy_label = crisp_severity(width_mm, density_pct, label)

    return {
        "severity_fuzzy": fuzzy_label,
        "severity_score": None if np.isnan(score) else round(score, 2),
        "severity_crisp": crisp_severity(width_mm, density_pct, label),
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
# Keyed [defect][severity][pavement]. Concrete and asphalt are repaired
# differently -- reblocking is a concrete repair, patching and overlay are
# asphalt ones -- so without the pavement type the system would print a concrete
# repair for an asphalt crack.
#
# Activity numbers and names are DPWH D.O. 47 s.2024 Appendix A-9 and the
# response times Table 4.1, both quoted verbatim in proof.md section 6. Item 311
# is the Blue Book (Standard Specifications, Vol. II) item for Portland Cement
# Concrete Pavement. The one-line methods are standard maintenance practice,
# approved by the City Engineer; record that approval in the appendix with the
# validation letter.

ACT_111 = "Act. 111 Premix Patching"
ACT_112 = "Act. 112 Penetration Patching"
ACT_113 = "Act. 113 Sealing of Bituminous Pavement"
ACT_121 = "Act. 121 Patching on Concrete Pavements"
ACT_122 = "Act. 122 Crack and Joints Sealing of Concrete Pavements"
ITEM_311 = "Blue Book Item 311, Portland Cement Concrete Pavement (slab reblocking)"
RECONSTRUCTION = "Beyond Routine Maintenance: reconstruction"

PAVEMENT_TYPES = ("concrete", "asphalt")
DEFAULT_PAVEMENT = "concrete"


def _rec(activity, method, response, response_days):
    return {
        "activity": activity,
        "method": method,
        "response": response,
        "response_days": response_days,
    }


_LINEAR_CRACK = {
    "Low": {
        "concrete": _rec(
            ACT_122,
            "Routine preventive maintenance: clean and seal the crack with sealant "
            "or epoxy. Monitor at the next inspection.",
            "3 working days, or schedule with routine maintenance", 3),
        "asphalt": _rec(
            ACT_113, "Crack filling with asphalt sealant.",
            "3 working days, or schedule with routine maintenance", 3),
    },
    "Medium": {
        "concrete": _rec(
            ACT_122,
            "Rout and seal the crack. If the edges are spalled, partial-depth "
            "patch (Act. 121).",
            "3 working days", 3),
        "asphalt": _rec(
            ACT_113,
            "Rout and seal. Where cracks are many, localized patching or a thin "
            "overlay.",
            "3 working days", 3),
    },
    "High": {
        "concrete": _rec(
            ITEM_311, "Not serviceable: full slab reblocking.",
            "3 working days to make safe; repair as programmed", 3),
        "asphalt": _rec(
            RECONSTRUCTION,
            "Not serviceable: complete structural replacement of the section.",
            "3 working days to make safe; repair as programmed", 3),
    },
}

_POTHOLE = {
    "concrete": _rec(ACT_121, "Patching on concrete pavement.", "3 working days", 3),
    "asphalt": _rec(
        f"{ACT_111} / {ACT_112}",
        "Premix (hot) or penetration patching; add base material if no subgrade "
        "repair is needed.",
        "3 working days", 3),
}

INTERVENTIONS = {
    "Longitudinal Crack": _LINEAR_CRACK,
    "Transverse Crack": _LINEAR_CRACK,
    "Alligator Crack": {
        "Low": {
            "concrete": _rec(
                ACT_122, "Seal the cracks and inspect for subbase failure.",
                "3 working days", 3),
            "asphalt": _rec(ACT_113, "Surface seal over the area.", "3 working days", 3),
        },
        "Medium": {
            "concrete": _rec(
                ACT_121, "Partial or full-depth patch of the broken area.",
                "3 working days", 3),
            "asphalt": _rec(
                f"{ACT_111} / {ACT_112}",
                "Remove and patch full depth with premix, or penetration patching.",
                "3 working days", 3),
        },
        "High": {
            "concrete": _rec(
                ITEM_311, "Not serviceable: full slab reblocking.",
                "Program as rehabilitation (D.O. 47 Table 5.1)", None),
            "asphalt": _rec(
                RECONSTRUCTION,
                "Not serviceable: complete structural replacement, programmed as "
                "reconstruction.",
                "Program as rehabilitation (D.O. 47 Table 5.1)", None),
        },
    },
    # Potholes grade Medium or High; Low is kept so a lookup can never miss.
    "Pothole": {"Low": _POTHOLE, "Medium": _POTHOLE, "High": _POTHOLE},
}

DEFAULT_INTERVENTION = _rec(
    "Inspect and assess on site",
    "No table entry for this defect; a City Engineer should inspect it.",
    "As scheduled", None)

# Overall priority from the worst severity present and the measured extent.
PRIORITY_DENSITY_ESCALATION_PCT = 25.0


def intervention_for(label: str, severity: str, pavement: str = DEFAULT_PAVEMENT) -> dict:
    """The DPWH activity, one-line method and response time for one defect."""
    if pavement not in PAVEMENT_TYPES:
        pavement = DEFAULT_PAVEMENT
    entry = INTERVENTIONS.get(label, {}).get(severity)
    return dict(entry[pavement]) if entry else dict(DEFAULT_INTERVENTION)


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
