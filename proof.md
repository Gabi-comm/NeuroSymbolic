# Threshold Justification — Evidence and Provenance

Documentary basis for every severity threshold used by the symbolic component
(`backend/fuzzy_engine.py`), and a full trace of how each crack's severity is
calculated.

Compiled 2026-09-17. Every quotation below was extracted from the primary PDF as
published by DPWH, not from a secondary description.

> **Correction on the record.** An earlier revision of this project used **6 mm
> and 19 mm** crack-width thresholds taken from the US *Pavement Distress
> Identification Manual* (ASTM D6433 / LTPP lineage), on the stated belief that
> the DPWH manual was not publicly downloadable. **That belief was wrong.** The
> D.O. 120 s.2019 PDF *is* downloadable from dpwh.gov.ph; the first attempt
> failed only because the request did not send a browser user-agent, and the
> wrong conclusion was drawn from that failure. The thresholds have been
> corrected to the DPWH values documented below. See §7.

---

## 1. Primary source — DPWH D.O. 120, s. 2019

**Department Order No. 120, Series of 2019** — *"Updating of the Road Network
Definition and Inventory Update Manual and Visual Road Condition Assessment
Manual Under the Road and Bridge Information Application (RBIA)"*
Signed **MARK A. VILLAR**, Secretary, **24 October 2019**.

| | |
|---|---|
| Direct PDF | `https://www.dpwh.gov.ph/dpwh/sites/default/files/issuances/do_120_s2019.pdf` |
| Landing page | `https://www.dpwh.gov.ph/dpwh/issuances/department-order/17627` |
| Size / extract | 12,423,129 bytes; 8,748 lines of extracted text |
| Issued by | Planning Service |

The order is not a standalone memo — **the two technical manuals are attached in
full**, which is why the file is 12 MB. The cover page prescribes:

> "In order to maintain the integrity and reliability of the Department's Road and
> Bridge Information Application (RBIA) Database System and with the objective of
> providing detailed instructions to RBIA users with regards to the conduct of
> Road Condition (RoCond) assessment and collection and maintenance of road
> inventory data, the following updated manuals are hereby prescribed for
> implementation by all DPWH Regional Offices and District Engineering Offices:
>
> 1. Road Network Definition and Inventory Update Manual 2019 Version 5
> 2. **Visual Road Condition Assessment Manual 2019 Version 2**"

Manual 2 is the authority for everything in §2 and §3 below.

---

## 2. Crack severity — the 3 mm threshold

### 2.1 The severity bands, verbatim

From the rating item **"Crocodile, Longitudinal and Transverse Cracking"**,
under the heading **SEVERITY** (extract lines 7361–7363):

> **SEVERITY**
> The severity of distress is:
> **Narrow 'N' ≤ 3 mm average crack width**
> **Wide 'W' > 3 mm average crack width**

The same pair is restated in the worked rating example (extract lines 7902–7903).

**This is the whole of the DPWH crack-width scale.** Two bands, one cut, at
**3 mm**. There is no 6 mm band and no 19 mm band anywhere in the manual.

### 2.2 What is measured, and how

> "Pavement cracking in the selected lane is inspected on foot and rated
> according to:
> • the type of cracking.
> • **the severity of distress as indicated by crack width**; and
> • the length of distress as indicated, this is converted to extent(%) by the
> data entry spreadsheet."

> "**Severity of cracking is rated according to the predominant average crack
> width** as measured with the Crack Width Scale (see section 0) and using the
> Flexible Pavement Marks."

The measurand is therefore the **predominant average crack width**, not the
maximum width and not the width at a single point. This matters: it is exactly
the quantity the pipeline computes (§5.2).

### 2.3 The Crack Width Scale is a physical gauge

Section C.9 **EQUIPMENT** lists what a rating team carries:

> "Straight Edge, 1.2m long · Measuring Wedge · Rule in mm · **Crack Width
> Scale** · Measuring Wheel · Spray Paint"

A full-scale printable template is provided at manual page 72,
**"TEMPLATE FOR CRACK WIDTH SCALE"**:

> "Test the crack gap by working from narrowest to widest mark width — Align
> bottom of mark with one side of crack — **The first mark wide enough to cover
> the crack gap will show the correct 'severity' code** — Ensure correct pavement
> type scale is used"

**Why this justifies fuzzifying a crisp threshold.** DPWH's own instrument is a
set of printed marks compared by eye against a crack in the field. The standard
states 3 mm crisply, but the measurement method it prescribes does not resolve
tenths of a millimetre, and neither does an optical measurement taken through an
IPM warp. Treating 2.9 mm and 3.1 mm as categorically different asserts a
precision that neither the standard's instrument nor this system's camera
possesses. Overlapping membership functions around the 3 mm cut represent that
measurement uncertainty explicitly instead of hiding it.

### 2.4 Distress definitions

> "**Crocodile Cracking**: This is cracking consisting of interconnected or
> interlaced cracks forming a series of small polygons resembling a crocodile
> hide."

> "**Transverse Cracking**: This is cracking running transversely across the
> pavement. The length of such cracks should exceed 0.6 m in order to be
> significant for rating purposes."

> "Cracks that are well sealed are still considered cracks with only narrow
> severity."

**Terminology note.** DPWH's RoCond manual says **"Crocodile Cracking"** where
this study says *alligator cracking*. They are the same distress — the manual's
own definition ("resembling a crocodile hide") matches the standard definition of
alligator cracking, and DPWH's *maintenance* order (D.O. 47 s.2024, §4) uses
"**Alligator Cracks** — Interconnected or interlaced cracks forming a series of
small polygons resembling an alligator hide" for the identical defect. Either
term is defensible; the paper should note the equivalence once.

---

## 3. Extent — the second axis

### 3.1 DPWH rates cracking two-dimensionally

> "Defects for concrete and asphalt are rated on a **two-dimensional scale
> covering the severity and extent of distress exhibited**. **Severity levels are
> banded in either 2 or 3 levels**, and extent is measured in terms of the
> percentage of area affected by the particular distress."

This single sentence is the licence for the design in §4: DPWH itself does not
grade cracking on width alone, and it does not fix the number of severity bands
at two for all distresses.

### 3.2 How extent is defined

> "Extent of cracking is calculated by the DES according to the **total area of
> cracking within the segment over the total area of the segment and expressed as
> a percentage**."

This is precisely the definition of `crack_density_pct` implemented in
`backend/api.py` (§5.3) — defect mask area over analysed road-surface area, as a
percentage. Same formula, applied at a different spatial scale (§6.2).

### 3.3 The one published extent boundary

DPWH publishes no low/medium/high extent *bands* for cracking — extent enters the
VCI formula as a continuous percentage. It does, however, publish a decision
boundary, in **D.O. 47 s.2024, Table 5.1 "Beyond Routine Maintenance Parameters"**:

> "Code 02 – **Alligator Cracks: More than 167.5 sq.m. (continuous)**"
> "Code 05 – Pumping and Depression: More than 167.5 sq.m. (continuous)"
> "Code 13 – Raveling: More than 502.5 sq.m. (continuous)"

Over a standard 3.05 m lane, 167.5 m² is ≈ 55 m of continuous cracking, i.e.
**≈ 55% of a 100 m segment lane area**. That is the anchor for the "dense" extent
set in the fuzzy engine — the point past which DPWH stops calling the problem
routine maintenance at all.

---

## 4. Why a two-band standard yields three output levels

The study requires Low / Medium / High. DPWH's *severity* axis is binary. These
are reconciled, not fudged, as follows.

**DPWH's rating scheme is two-dimensional** (§3.1). A grade is a function of
severity **and** extent, and DPWH combines them itself — with published weights.

**D.O. 120 s.2019, Table 4 — "Distress weight factors for Asphalt VCI":**

| Distress | Weight factor |
|---|---|
| Cracking – Crocodile – **Narrow** | **3.5** |
| Cracking – Crocodile – **Wide** | **5.9** |
| Cracking – Transverse – **Narrow** | **3.3** |
| Cracking – Transverse – **Wide** | **5.5** |
| Rutting (RDM) | 4 |
| Patching | 1.25 |
| Edge Break (large / medium / small) | 1.25 / 0.82 / 0.41 |
| **Potholes (number)** | **0.36** |
| Surface Failures | 0.18 |
| Wearing Surface – Minor / Severe | 0.55 / 1.2 |

Three things follow directly, and each is encoded in the rule bases:

1. **Wide outranks Narrow** for both crack types (5.9 > 3.5; 5.5 > 3.3). Width
   therefore drives severity upward — the `linear` rule base.
2. **Crocodile outranks Transverse** at both severities (5.9 > 5.5; 3.5 > 3.3).
   Alligator cracking is treated as the more serious distress — so the `area`
   rule base escalates on extent faster than the `linear` one does.
3. The weighted distresses are summed and mapped through a continuous VCI
   formula to a 0–1 index. **DPWH's own output is continuous, not two-valued.**
   A three-band output derived from the same two inputs is consistent with that,
   not a departure from it.

The literal two-band DPWH verdict is preserved unmodified as
**`severity_dpwh_nw`** (`Narrow` / `Wide`) on every detection, so any rating can
be checked against the standard directly.

---

## 5. How severity is calculated, end to end

### 5.1 Segmentation

YOLOv8 detects and classifies; SAM segments. The two masks are combined with a
bitwise AND (consensus), then cleaned with an adaptive threshold inside the
bounding box. Yields `mask_pixels` — the defect's area in bird's-eye-view pixels.

### 5.2 Mean crack width

Morphological skeletonization reduces the mask to a single-pixel centreline,
giving `length_px`. Then:

```
width_mm = (mask_pixels / length_px) × GSD
```

`mask_pixels / length_px` is mean width in pixels — area divided by centreline
length. Multiplying by Ground Sample Distance converts to millimetres.

This is an **average over the whole defect**, which is what DPWH asks for:
*"the predominant average crack width"* (§2.2). A maximum-width measure would not
match the standard.

**GSD** defaults to 4.357 mm/px, the value stated in the study's §3.3.C. The
bird's-eye view is a fixed 700 px square, so `GSD = road width (mm) / 700`;
4.357 × 700 = 3050 mm, i.e. one 3.05 m lane. The capture screen lets an inspector
enter the actual road width, which recomputes GSD.

### 5.3 Crack extent

```
crack_density_pct = (Σ mask_pixels across all detections / road_area_px) × 100
```

`road_area_px` is the full bird's-eye frame when perspective correction succeeded
(the warp maps the road trapezoid onto the whole frame), or the detected road
mask area when it did not — so sky and verge are never counted as road.

This mirrors DPWH's definition in §3.2.

### 5.4 Fuzzy inference

| Variable | Term | Trapezoid `[a,b,c,d]` | Anchored on |
|---|---|---|---|
| `width_mm` | Narrow | 0, 0, 2, 4 | DPWH 3 mm cut |
| | Wide | 2, 4, 60, 60 | DPWH 3 mm cut |
| `density_pct` | Sparse | 0, 0, 5, 15 | below routine-maintenance concern |
| | Medium | 10, 20, 35, 50 | approaching BRM |
| | Dense | 45, 55, 100, 100 | **BRM at ≈55%** (§3.3) |

Mamdani inference, centroid defuzzification, output 0–100 banded in even thirds
(Low < 33.34, Medium < 66.67, High).

**Linear rule base** (Longitudinal, Transverse) — width leads:

| | Sparse | Medium | Dense |
|---|---|---|---|
| **Narrow** | Low | Low | Medium |
| **Wide** | Medium | High | High |

**Area rule base** (Crocodile / Alligator) — extent leads, escalating faster,
per the Table 4 weights and the BRM parameter:

| | Sparse | Medium | Dense |
|---|---|---|---|
| **Narrow** | Low | Medium | High |
| **Wide** | Medium | High | High |

### 5.5 Potholes are not graded

DPWH, under **POTHOLES (Flexible Pavement)**:

> "Potholes are rated according to the **number** of potholes, recorded according
> to the diameter of the potholes within the carriageway area over the total
> length of the segment."
> "MEASUREMENT: The number of potholes is rated per 100m lengths. **One (1)
> pothole is equivalent to 0.25 m²**."

There is no severity band for potholes anywhere in the manual — they are counted.
Table 4 confirms it: the VCI weight is *"Potholes (**number**)"*, 0.36.

**This settles the depth question twice over.** Depth is not measurable from 2D
optical data (the study's delimitation 3), *and* DPWH does not ask for it —
pothole severity is not a graded quantity in the standard at all.

A detected pothole is therefore reported at a fixed grade. **High** is used on
urgency grounds, evidenced in §6.1: potholes carry the shortest response time
(3 working days) and the single highest inspection weight (10%) of any defect.

---

## 6. Maintenance response — DPWH D.O. 47, s. 2024

**Department Order No. 47, Series of 2024** — *"Comprehensive Policy Guidelines
on the Maintenance of National Roads and Bridges"*, 8 April 2024.
`https://www.dpwh.gov.ph/dpwh/sites/default/files/issuances/do_047_s2024.pdf`

Its Appendix A-9 is stated to derive from the **Philippine Highway Maintenance
Management Manual (PHMMM)**.

### 6.1 Response times and inspection weights

**Table 4.1 — Defects/Deficiencies and Response Time** (working days):

| Code | Defect | Response |
|---|---|---|
| 01 | **Potholes** | **3** |
| 02 | **Alligator Cracks** | **3** |
| 12 | **Cracks** | **3** |
| 04 | Shoving and Corrugation | 10 |
| 13 | Raveling | 7 |
| 03 | Major Scaling | 30 |
| 05 | Pumping and Depression | 30 |

**Table 6.1a — Corresponding Weight Percentage:**

| Code | Defect | Weight |
|---|---|---|
| 01 | **Potholes** | **10.00%** |
| 02 | **Alligator Cracks** | **9.00%** |
| 12 | **Cracks** | **5.00%** |
| 03 | Major Scaling | 8.00% |
| 05 | Pumping and Depression | 9.00% |

This is the evidence for the priority ordering in `fuzzy_engine.priority_level()`
and for grading potholes High.

### 6.2 Interventions

**Appendix A-9**, verbatim:

- **Code 01/02 Potholes** — *"On bituminous pavement, bituminous premix (hot) or
  penetration patching of the affected area; adding base materials is included if
  no subgrade repair is required."* — 3 Days — Act. 111 Premix Patching /
  Act. 112 Penetration Patching / Act. 121 Patching on Concrete Pavements
- **Code 12 Cracks** — *"Seal cracks with asphalt sealant"* — 3 Days —
  Act. 122 Crack and Joints Sealing of Concrete Pavements (concrete) /
  Act. 113 Sealing of Bituminous Pavement (asphalt)
- **Code 03 Major Scaling** — *"Replacement of concrete pavement"* — 30 Days

These map onto `fuzzy_engine.INTERVENTIONS`, which is resolved symbolically —
never by the language model.

---

## 7. Sources checked, and what each yielded

| Source | Verdict |
|---|---|
| **D.O. 120 s.2019** PDF | ✅ **Primary authority.** Contains the Visual Road Condition Assessment Manual 2019 v2 in full: the 3 mm N/W threshold, the extent definition, pothole counting, VCI Table 4 |
| **D.O. 47 s.2024** PDF | ✅ **Primary authority** for response times, inspection weights, BRM parameters and interventions |
| dpwh.gov.ph issuance page 17627 | ✅ Landing page for D.O. 120; links the PDF. Metadata only — no thresholds |
| **D.O. 27 s.2023** PDF | ❌ *"DPWH Disaster and Incident Management Operations Manual."* Disaster/incident response. Contains **no** pavement distress severity criteria |
| foi.gov.ph | ➖ Not needed. The manual proved directly downloadable; no FOI request required |
| Bureau of Maintenance page | ➖ Organisational listing. No threshold data |
| Scribd *"RBIA Theories and Procedures"* | ⚠️ Third-party re-upload of DPWH material. **Not cited** — the primary D.O. 120 PDF supersedes it, and a thesis should cite the issuing agency rather than a document-sharing site |

### Previously cited and now withdrawn

| Source | Why withdrawn |
|---|---|
| Pavement Distress Identification Manual (ASTM D6433 / LTPP), 6 mm and 19 mm | Correct for US practice, **wrong for DPWH**. Superseded by §2.1 |
| DPWH bid bulletin 26DI0067 | *"Construction of Multi-Purpose Building, Barangay Malaban, Biñan City."* Its "6mm" is groove depth in a non-skid **floor** finish; its "19 mm" is an architectural floor-level drop and square bar stock. Zero matches for alligator/pothole/crack width/severity/distress. **Not a road standard** |

---

## 8. Statements this evidence supports

Each may be asserted in the paper and defended from the quotations above.

1. **"Crack severity is graded on average crack width against the DPWH threshold
   of 3 mm."** — §2.1, verbatim from the Visual Road Condition Assessment Manual
   2019 v2 (D.O. 120 s.2019).
2. **"Severity is assessed from the predominant average crack width, consistent
   with DPWH's prescribed measurement."** — §2.2; the pipeline computes mean
   width as mask area ÷ centreline length (§5.2).
3. **"Crack extent is the area of cracking as a percentage of the assessed road
   area, following DPWH's own definition."** — §3.2 and §5.3.
4. **"Combining severity with extent follows DPWH's two-dimensional rating
   scheme."** — §3.1, verbatim.
5. **"A three-level output is consistent with DPWH practice, which bands severity
   in two or three levels and combines severity with extent through a continuous
   weighted index."** — §3.1 and §4, Table 4.
6. **"Alligator cracking is weighted more heavily than transverse cracking at
   equal severity, and wide more heavily than narrow."** — §4, Table 4.
7. **"Potholes are not graded by severity under DPWH; they are counted, and depth
   is not an input."** — §5.5.
8. **"Potholes carry the highest maintenance priority of any pavement defect."** —
   §6.1: shortest response time (3 days) and highest inspection weight (10%).
9. **"Extensive alligator cracking beyond ~55% of lane area exceeds routine
   maintenance."** — §3.3, D.O. 47 s.2024 Table 5.1.
10. **"Recommended interventions follow DPWH's prescribed corrective
    measures."** — §6.2, Appendix A-9.

---

## 9. Reproducing this verification

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
(KHTML, like Gecko) Chrome/120 Safari/537.36"

curl -sL -A "$UA" -o do_120_s2019.pdf \
  https://www.dpwh.gov.ph/dpwh/sites/default/files/issuances/do_120_s2019.pdf
curl -sL -A "$UA" -o do_047_s2024.pdf \
  https://www.dpwh.gov.ph/dpwh/sites/default/files/issuances/do_047_s2024.pdf

pdftotext -layout do_120_s2019.pdf do_120_s2019.txt
pdftotext -layout do_047_s2024.pdf do_047_s2024.txt

grep -n "average crack width" do_120_s2019.txt      # the 3 mm bands
grep -n "total area of cracking"  do_120_s2019.txt  # the extent definition
grep -n "equivalent to 0.25"      do_120_s2019.txt  # pothole counting
grep -n "Crocodile - Narrow"      do_120_s2019.txt  # VCI Table 4
grep -n "167.5"                   do_047_s2024.txt  # BRM parameter
```

**The browser user-agent is required.** Without `-A`, dpwh.gov.ph returns a
212-byte non-PDF body and `pdftotext` reports *"May not be a PDF file … Couldn't
read xref table"* — which is what produced the earlier false conclusion that the
manual was unavailable.

---

## 10. Outstanding

- **Extent membership bands** (`sparse` / `medium` / `dense`) are the one set not
  taken verbatim from DPWH: only the ~55% BRM boundary is DPWH-sourced (§3.3).
  The interior breakpoints are this study's, and section 3.1 commits to refining
  the rule base from domain-expert feedback. Put them to the civil engineers on
  the evaluation panel and record their adjustments.
- **Rigid (concrete) pavement** thresholds are not yet implemented. D.O. 120
  contains a separate Concrete VCI weight table (Table 5) and concrete distress
  items. The current scope is flexible pavement only; state that explicitly.
- **Terminology**: decide between "alligator" and DPWH's "crocodile" cracking and
  note the equivalence once (§2.4).
