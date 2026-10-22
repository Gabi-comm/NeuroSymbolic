"""Unit tests for the symbolic layer, width measurement and reference scale.

Standard library only, so they run in the project venv as it stands:

    cd backend
    ../deps/Scripts/python.exe -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fuzzy_engine as fe  # noqa: E402
import measure  # noqa: E402
import scale  # noqa: E402

LINEAR = ("Longitudinal Crack", "Transverse Crack")
SPARSE = 5.0


class CrackBands(unittest.TestCase):
    """The City Engineer's bands: < 3 mm Low, 3-10 mm Medium, > 10 mm High."""

    def grade(self, label, width, density=SPARSE):
        return fe.evaluate(label, width, density, confidence=0.8)

    def test_linear_bands(self):
        for label in LINEAR:
            for width, expected in ((1.0, "Low"), (2.0, "Low"), (6.0, "Medium"),
                                    (9.0, "Medium"), (14.0, "High"), (30.0, "High")):
                with self.subTest(label=label, width=width):
                    self.assertEqual(self.grade(label, width)["severity_fuzzy"], expected)

    def test_crisp_baseline_uses_same_cuts(self):
        for width, expected in ((3.0, "Low"), (3.1, "Medium"), (10.0, "Medium"), (10.1, "High")):
            with self.subTest(width=width):
                self.assertEqual(fe.crisp_severity(width, SPARSE, "Transverse Crack"), expected)

    def test_dense_alligator_is_high_whatever_the_width(self):
        for width in (1.0, 6.0, 14.0):
            with self.subTest(width=width):
                self.assertEqual(self.grade("Alligator Crack", width, 70.0)["severity_fuzzy"], "High")

    def test_sparse_narrow_alligator_is_low(self):
        self.assertEqual(self.grade("Alligator Crack", 1.5, 2.0)["severity_fuzzy"], "Low")

    def test_dpwh_two_band_verdict_unchanged(self):
        self.assertEqual(fe.dpwh_severity(3.0), "Narrow")
        self.assertEqual(fe.dpwh_severity(3.1), "Wide")
        self.assertEqual(fe.dpwh_severity(15.0), "Wide")

    def test_trace_reports_three_width_terms(self):
        trace = self.grade("Transverse Crack", 9.0)["membership_trace"]["width"]
        self.assertEqual(set(trace), {"narrow", "open", "wide"})
        self.assertGreater(trace["open"], trace["wide"])

    def test_rule_tables_cover_every_term_pair(self):
        pairs = {(w, d) for w in fe.WIDTH_MF for d in fe.DENSITY_MF}
        self.assertEqual(set(fe.LINEAR_RULES), pairs)
        self.assertEqual(set(fe.AREA_RULES), pairs)


class Potholes(unittest.TestCase):
    """One pothole up to 0.25 m2 is Medium; larger, or several, is High."""

    def grade(self, area, count=1):
        return fe.evaluate("Pothole", 5.0, SPARSE, 0.8, area_m2=area, pothole_count=count)

    def test_single_small_pothole_is_medium(self):
        self.assertEqual(self.grade(0.20)["severity_fuzzy"], "Medium")
        self.assertEqual(self.grade(0.25)["severity_fuzzy"], "Medium")

    def test_large_pothole_is_high(self):
        self.assertEqual(self.grade(0.40)["severity_fuzzy"], "High")

    def test_several_potholes_are_high(self):
        self.assertEqual(self.grade(0.10, count=2)["severity_fuzzy"], "High")

    def test_unknown_area_errs_high(self):
        self.assertEqual(self.grade(None)["severity_fuzzy"], "High")

    def test_pothole_not_rated_on_dpwh_width_scale(self):
        result = self.grade(0.2)
        self.assertEqual(result["severity_dpwh_nw"], "Not rated")
        self.assertEqual(result["rule_base"], "pothole-area")


class Recommendations(unittest.TestCase):

    def test_every_defect_severity_and_pavement_has_an_entry(self):
        for label in fe.INTERVENTIONS:
            for severity in ("Low", "Medium", "High"):
                for pavement in fe.PAVEMENT_TYPES:
                    with self.subTest(label=label, severity=severity, pavement=pavement):
                        rec = fe.intervention_for(label, severity, pavement)
                        self.assertTrue(rec["activity"])
                        self.assertTrue(rec["method"])
                        self.assertTrue(rec["response"])

    def test_concrete_and_asphalt_differ_where_the_repair_does(self):
        concrete = fe.intervention_for("Transverse Crack", "High", "concrete")
        asphalt = fe.intervention_for("Transverse Crack", "High", "asphalt")
        self.assertIn("Item 311", concrete["activity"])
        self.assertIn("reconstruction", asphalt["activity"])

    def test_dpwh_activity_numbers(self):
        self.assertIn("Act. 122", fe.intervention_for("Longitudinal Crack", "Low", "concrete")["activity"])
        self.assertIn("Act. 113", fe.intervention_for("Longitudinal Crack", "Low", "asphalt")["activity"])
        self.assertIn("Act. 121", fe.intervention_for("Pothole", "Medium", "concrete")["activity"])
        self.assertIn("Act. 111", fe.intervention_for("Pothole", "High", "asphalt")["activity"])

    def test_unknown_pavement_falls_back_to_default(self):
        self.assertEqual(
            fe.intervention_for("Pothole", "High", "gravel"),
            fe.intervention_for("Pothole", "High", fe.DEFAULT_PAVEMENT),
        )

    def test_unknown_defect_gets_inspection(self):
        self.assertEqual(fe.intervention_for("Rutting", "High")["activity"],
                         "Inspect and assess on site")

    def test_result_is_a_copy(self):
        rec = fe.intervention_for("Pothole", "High", "asphalt")
        rec["activity"] = "changed"
        self.assertNotEqual(fe.intervention_for("Pothole", "High", "asphalt")["activity"], "changed")


class Width(unittest.TestCase):

    def band(self, width_px):
        img = np.zeros((200, 300), np.uint8)
        img[100:100 + width_px, 30:270] = 255
        return img

    def test_within_half_a_pixel(self):
        for w in range(1, 21):
            with self.subTest(width_px=w):
                self.assertLessEqual(abs(measure.measure_width(self.band(w), 1.0)["width_mm"] - w), 0.5)

    def test_scales_with_gsd(self):
        self.assertAlmostEqual(measure.measure_width(self.band(7), 0.5)["width_mm"], 3.75)

    def test_crack_touching_the_crop_edge_is_not_infinite(self):
        img = np.zeros((40, 300), np.uint8)
        img[:5, :] = 255
        self.assertLess(measure.measure_width(img, 1.0)["width_mm"], 7.0)

    def test_empty_mask(self):
        self.assertEqual(measure.measure_width(np.zeros((50, 50), np.uint8), 1.0)["width_mm"], 0.0)


class ReferenceScale(unittest.TestCase):

    @staticmethod
    def scene(side_px, marker_id=scale.REFERENCE_MARKER_ID):
        dictionary = cv2.aruco.getPredefinedDictionary(scale.ARUCO_DICTIONARY)
        marker = cv2.aruco.generateImageMarker(dictionary, marker_id, side_px)
        img = np.full((700, 700, 3), 110, np.uint8)  # grey "asphalt"
        quiet = side_px // 5
        img[200 - quiet:200 + side_px + quiet, 200 - quiet:200 + side_px + quiet] = 255
        img[200:200 + side_px, 200:200 + side_px] = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
        return img

    def test_recovers_scale_within_two_percent(self):
        for side_px in (60, 100, 240):
            with self.subTest(side_px=side_px):
                found = scale.detect_reference_scale(self.scene(side_px))
                self.assertIsNotNone(found)
                expected = scale.MARKER_SIDE_MM / side_px
                self.assertLess(abs(found["mm_per_px"] - expected) / expected, 0.02)

    def test_no_card(self):
        self.assertIsNone(scale.detect_reference_scale(np.full((700, 700, 3), 110, np.uint8)))

    def test_other_marker_ids_are_ignored(self):
        self.assertIsNone(scale.detect_reference_scale(self.scene(100, marker_id=3)))


if __name__ == "__main__":
    unittest.main()
