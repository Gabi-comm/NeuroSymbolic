"""Compare the three severity methods against a human inspector baseline.

Answers two of the study's research questions directly:

  RQ3  Is there a significant difference in severity classification accuracy
       using fuzzy logic reasoning versus relying solely on neural confidence?

  RQ4  How well does the framework's automated assessment align with baseline
       manual evaluations by human inspectors?

Usage
-----
    python -m eval.compare --system results.csv --inspector inspector.csv

`results.csv` comes from `eval.run_batch`.

`inspector.csv` is produced by your expert panel and needs three columns:

    image,detection_index,severity

with severity in {Low, Medium, High}. Section 3.5 requires a double-blind
protocol, so inspectors must grade without seeing the system output.

McNemar's test is used for RQ3 rather than comparing two accuracy figures,
because the two methods grade the *same* detections: the samples are paired, and
an unpaired comparison would throw that information away.
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from math import comb
from pathlib import Path

from .metrics import accuracy, cohens_kappa, kappa_interpretation

METHODS = {
    "severity_fuzzy": "Fuzzy logic (proposed)",
    "severity_crisp": "Crisp thresholds (rule baseline)",
    "severity_confidence": "Neural confidence (neural baseline)",
    "severity_legacy_crisp": "Legacy 3/6 mm thresholds (pre-alignment)",
}

SEVERITIES = ["Low", "Medium", "High"]


def load_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def key_of(row: dict) -> tuple:
    return (row["image"].strip(), str(row["detection_index"]).strip())


def exact_mcnemar(b: int, c: int) -> float:
    """Two-sided exact McNemar p-value from the discordant pair counts.

    b = method A right where B wrong, c = B right where A wrong. Under the null
    each discordant pair is a fair coin, so the count follows Binomial(b+c, 0.5).
    Exact rather than chi-square because discordant counts are usually small in a
    study of this size, where the chi-square approximation is unreliable.
    """
    n = b + c
    if n == 0:
        return 1.0

    tail = sum(comb(n, k) for k in range(0, min(b, c) + 1)) / (2 ** n)
    return min(1.0, 2.0 * tail)


def confusion(predicted: list[str], truth: list[str]) -> dict:
    matrix = {t: Counter() for t in SEVERITIES}
    for p, t in zip(predicted, truth):
        if t in matrix:
            matrix[t][p] += 1
    return matrix


def print_confusion(matrix: dict) -> None:
    header = "    truth\\pred " + "".join(f"{s:>9}" for s in SEVERITIES)
    print(header)
    for t in SEVERITIES:
        row = "".join(f"{matrix[t][p]:>9}" for p in SEVERITIES)
        print(f"    {t:<11}{row}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--system", required=True, type=Path)
    parser.add_argument("--inspector", required=True, type=Path)
    args = parser.parse_args()

    system_rows = load_csv(args.system)
    inspector_rows = load_csv(args.inspector)

    truth_by_key = {key_of(r): r["severity"].strip().title() for r in inspector_rows}

    paired = [(r, truth_by_key[key_of(r)]) for r in system_rows if key_of(r) in truth_by_key]

    if not paired:
        print("No detections matched between the two files.")
        print("Both need matching 'image' and 'detection_index' values.")
        return 1

    unmatched = len(system_rows) - len(paired)
    print(f"Matched {len(paired)} detection(s); {unmatched} system row(s) ungraded.\n")

    truth = [t for _, t in paired]
    print(f"Inspector grade distribution: {dict(Counter(truth))}\n")

    correctness = {}
    print("=" * 68)
    print("RQ4 - Agreement with human inspectors")
    print("=" * 68)

    available = {c: n for c, n in METHODS.items() if c in system_rows[0]}
    for column, name in available.items():
        predicted = [(r.get(column) or "").strip().title() for r, _ in paired]
        correctness[column] = [p == t for p, t in zip(predicted, truth)]

        kappa = cohens_kappa(predicted, truth)
        print(f"\n{name}")
        print(f"  accuracy       {accuracy(predicted, truth):.3f}")
        print(f"  Cohen's kappa  {kappa:.3f}  ({kappa_interpretation(kappa)})")
        print_confusion(confusion(predicted, truth))

    print("\n" + "=" * 68)
    print("RQ3 - Fuzzy logic vs the baselines (exact McNemar, paired)")
    print("=" * 68)

    fuzzy = correctness["severity_fuzzy"]
    for column in [c for c in correctness if c != "severity_fuzzy"]:
        other = correctness[column]
        b = sum(1 for f, o in zip(fuzzy, other) if f and not o)
        c = sum(1 for f, o in zip(fuzzy, other) if o and not f)
        p = exact_mcnemar(b, c)

        print(f"\nFuzzy vs {METHODS[column]}")
        print(f"  fuzzy correct, other wrong : {b}")
        print(f"  other correct, fuzzy wrong : {c}")
        print(f"  exact McNemar p            : {p:.4f}")
        verdict = "significant at a=0.05" if p < 0.05 else "not significant at a=0.05"
        print(f"  {verdict}")

    print(
        "\nNote: with few detections the test is underpowered. A non-significant "
        "result means insufficient evidence, not equivalence."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
