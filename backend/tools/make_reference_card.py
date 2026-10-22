"""Generate the printable reference card: public/reference-card.svg.

    deps\\Scripts\\python.exe backend\\tools\\make_reference_card.py

An A6 card (105 x 148 mm) carrying:
  * the ArUco marker scale.py looks for (DICT_4X4_50, id 7), 50 mm square, with
    a white quiet zone so it can be detected on dark asphalt;
  * a 50 mm check bar -- measure it after printing; if it is not 50 mm the
    printer scaled the page and every reading from the card is off;
  * crack width bars at 1, 3, 5, 10 and 15 mm, in the spirit of DPWH's Crack
    Width Scale (D.O. 120 s.2019): laid beside a crack they give the inspector
    a visual check, and photographed they double as a test strip whose true
    widths are known (backend/eval/synthetic_width.py, check (b)).

The SVG is sized in millimetres, so it prints at true size at 100% scale.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import scale  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "public" / "reference-card.svg"

CARD_W, CARD_H = 105.0, 148.0
MARKER_MM = scale.MARKER_SIDE_MM
QUIET_MM = 6.0
BAR_WIDTHS_MM = (1, 3, 5, 10, 15)
BAR_LENGTH_MM = 30.0


def marker_cells() -> list[list[int]]:
    """The marker as a grid of 0/1 cells, border included (6 x 6 for 4x4)."""
    dictionary = cv2.aruco.getPredefinedDictionary(scale.ARUCO_DICTIONARY)
    bits = 4 + 2  # data bits plus the one-cell black border on each side
    img = cv2.aruco.generateImageMarker(dictionary, scale.REFERENCE_MARKER_ID, bits)
    return [[1 if img[r, c] == 0 else 0 for c in range(bits)] for r in range(bits)]


def build_svg() -> str:
    cells = marker_cells()
    n = len(cells)
    cell = MARKER_MM / n
    mx = (CARD_W - MARKER_MM) / 2
    my = 16.0

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CARD_W}mm" height="{CARD_H}mm" '
        f'viewBox="0 0 {CARD_W} {CARD_H}" font-family="Arial, Helvetica, sans-serif">',
        f'<rect width="{CARD_W}" height="{CARD_H}" fill="#fff" stroke="#999" stroke-width="0.3"/>',
        '<text x="52.5" y="8" font-size="4.2" font-weight="bold" text-anchor="middle">'
        'OASYS reference card</text>',
        '<text x="52.5" y="12.5" font-size="2.6" text-anchor="middle">'
        'Print at 100% (no scaling). Lay flat beside the defect, fully in frame.</text>',
        # Quiet zone: white margin the detector needs around the black border.
        f'<rect x="{mx - QUIET_MM}" y="{my - QUIET_MM / 2}" width="{MARKER_MM + 2 * QUIET_MM}" '
        f'height="{MARKER_MM + QUIET_MM}" fill="#fff"/>',
    ]
    for r, row in enumerate(cells):
        for c, black in enumerate(row):
            if black:
                # Slight overlap so printers leave no hairline gaps between cells.
                parts.append(
                    f'<rect x="{mx + c * cell:.4f}" y="{my + r * cell:.4f}" '
                    f'width="{cell + 0.02:.4f}" height="{cell + 0.02:.4f}" fill="#000"/>'
                )

    y = my + MARKER_MM + 8
    parts += [
        f'<line x1="{mx}" y1="{y}" x2="{mx + MARKER_MM}" y2="{y}" stroke="#000" stroke-width="0.5"/>',
        f'<line x1="{mx}" y1="{y - 2}" x2="{mx}" y2="{y + 2}" stroke="#000" stroke-width="0.5"/>',
        f'<line x1="{mx + MARKER_MM}" y1="{y - 2}" x2="{mx + MARKER_MM}" y2="{y + 2}" '
        'stroke="#000" stroke-width="0.5"/>',
        f'<text x="52.5" y="{y + 5}" font-size="2.8" text-anchor="middle">'
        'Check: this bar and the marker must both measure 50 mm</text>',
    ]

    y += 13
    parts.append(
        f'<text x="8" y="{y}" font-size="3.2" font-weight="bold">Crack width scale (mm)</text>'
    )
    y += 4
    x = 10.0
    for w in BAR_WIDTHS_MM:
        parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{BAR_LENGTH_MM}" fill="#000"/>'
        )
        parts.append(
            f'<text x="{x + w / 2}" y="{y + BAR_LENGTH_MM + 4}" font-size="3" '
            f'text-anchor="middle">{w}</text>'
        )
        x += w + 9

    y += BAR_LENGTH_MM + 10
    parts += [
        f'<text x="8" y="{y}" font-size="2.6">3 mm or less: DPWH Narrow, Low.  '
        'Over 3 mm: DPWH Wide, Medium.</text>',
        f'<text x="8" y="{y + 4}" font-size="2.6">Over 10 mm: High (City Engineer\'s '
        'criterion, study area).</text>',
        f'<text x="8" y="{y + 8}" font-size="2.2" fill="#555">Marker: ArUco DICT_4X4_50, '
        f'id {scale.REFERENCE_MARKER_ID}, {MARKER_MM:.0f} mm.</text>',
        '</svg>',
    ]
    return "\n".join(parts) + "\n"


if __name__ == "__main__":
    OUT.write_text(build_svg(), encoding="utf-8")
    print(f"Wrote {OUT}")
