"""
Unit and Integration Tests for UnifiedOrbitPredictor and TelemetryIngestionManager.
"""

import unittest
import sys
import os
import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from propagators.unified_predictor import UnifiedOrbitPredictor
from service.telemetry_interface import TelemetryIngestionManager
from core.time_systems import datetime_to_jd
from datetime import datetime, timezone


class TestUnifiedPredictor(unittest.TestCase):
    def setUp(self):
        self.predictor = UnifiedOrbitPredictor(
            integrator="RKF78",
            use_j2=True,
            use_j3=True,
            use_j4=True,
            use_drag=True,
            use_sun=True,
            use_moon=True,
            use_srp=True,
            enable_attitude_coupling=True,
            attitude_mode="NADIR",
        )
        self.epoch_jd = 2460000.5
        # Circular LEO state: ~6871 km altitude, ~7.6 km/s
        self.y0_eci = np.array([6871000.0, 0.0, 0.0, 0.0, 7616.0, 0.0], dtype=np.float64)

    def test_equations_of_motion(self):
        dydt = self.predictor.equations_of_motion(0.0, self.y0_eci, self.epoch_jd)
        self.assertEqual(len(dydt), 6)
        # Velocity matches y0 velocity
        np.testing.assert_allclose(dydt[0:3], self.y0_eci[3:6], rtol=1e-6)
        # Acceleration points inwards towards Earth
        self.assertLess(dydt[3], 0.0)

    def test_predict_standard(self):
        res = self.predictor.predict(
            initial_state_eci=self.y0_eci,
            epoch_jd=self.epoch_jd,
            duration_hours=0.5,
            dt_step=60.0,
        )
        self.assertEqual(res["model_type"], "UNIFIED_ASTRODYNAMICS_PREDICTOR")
        self.assertGreater(len(res["states_eci"]), 0)
        self.assertIn("perigee", res)
        self.assertIn("apogee", res)
        self.assertIn("active_cd", res)

    def test_synthetic_observations_and_calibration(self):
        # Generate truth
        res_truth = self.predictor.predict(
            initial_state_eci=self.y0_eci,
            epoch_jd=self.epoch_jd,
            duration_hours=0.5,
            dt_step=60.0,
        )
        truth_states = np.array(res_truth["states_eci"])
        times_s = np.array(res_truth["times_s"])

        obs = self.predictor.generate_synthetic_observations(
            truth_states_eci=truth_states,
            times_s=times_s,
            obs_count=6,
            noise_sigma_m=2.0,
            arc_duration_s=600.0,
        )
        self.assertEqual(len(obs), 6)
        for o in obs:
            self.assertIn("time_s", o)
            self.assertIn("pos_eci", o)
            self.assertIn("vel_eci", o)

        # Calibrate with observations
        calib_res = self.predictor.predict(
            initial_state_eci=self.y0_eci,
            epoch_jd=self.epoch_jd,
            duration_hours=0.5,
            dt_step=60.0,
            observations=obs,
            truth_reference_eci=truth_states,
        )
        self.assertIn("calibration_summary", calib_res)
        self.assertIn("accuracy_metrics", calib_res)


class TestTelemetryInterface(unittest.TestCase):
    def setUp(self):
        self.tm = TelemetryIngestionManager()

    def test_ingest_state_vectors(self):
        records = [
            {"time": "2026-09-16T10:00:00Z", "x": 6800000.0, "y": 0.0, "z": 0.0, "vx": 0.0, "vy": 7600.0, "vz": 0.0},
            {"time": "2026-09-16T10:02:00Z", "x": 6700000.0, "y": 100000.0, "z": 0.0, "vx": -50.0, "vy": 7590.0, "vz": 0.0},
        ]
        res = self.tm.ingest_observations("sat_test_state", "STATE_VECTORS", records)
        self.assertEqual(res["records_ingested"], 2)
        self.assertEqual(res["sat_id"], "sat_test_state")

    def test_ingest_geodetic_gps(self):
        records = [
            {"time": "2026-09-16T12:00:00Z", "lat": 20.0, "lon": 110.0, "alt_km": 500.0, "speed_ms": 7600.0},
            {"time": "2026-09-16T12:05:00Z", "lat": 35.0, "lon": 115.0, "alt_km": 500.0, "speed_ms": 7600.0},
        ]
        res = self.tm.ingest_observations("sat_test_gps", "GEODETIC_GPS", records)
        self.assertEqual(res["records_ingested"], 2)

    def test_predict_from_ingested_data(self):
        records = [
            {"time": "2026-09-16T12:00:00Z", "lat": 20.0, "lon": 110.0, "alt_km": 500.0, "speed_ms": 7600.0},
            {"time": "2026-09-16T12:05:00Z", "lat": 35.0, "lon": 115.0, "alt_km": 500.0, "speed_ms": 7600.0},
        ]
        self.tm.ingest_observations("sat_test_predict", "GEODETIC_GPS", records)
        pred = self.tm.predict_from_ingested_data("sat_test_predict", duration_hours=0.5, dt_step=60.0)
        self.assertEqual(pred["satellite_id"], "sat_test_predict")
        self.assertEqual(pred["source"], "REAL_TELEMETRY_INGESTION")
        self.assertGreater(len(pred["states_eci"]), 0)


if __name__ == "__main__":
    unittest.main()
