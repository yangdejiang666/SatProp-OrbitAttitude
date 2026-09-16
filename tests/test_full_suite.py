"""
Comprehensive Automated Test Suite for SatProp-OrbitAttitude
Runs via: py -3 -m unittest tests/test_full_suite.py
"""

import unittest
import os
import sys
import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from core.constants import MU_EARTH, R_EARTH
from core.time_systems import datetime_to_jd, jd_to_datetime, gmst_rad
from core.kepler import coe_to_rv, rv_to_coe, solve_kepler
from core.coordinates import eci_to_ecef, ecef_to_eci, teme_to_j2000, compute_ric_errors
from core.perturbations import (
    accel_two_body,
    accel_j2,
    accel_j3,
    accel_j4,
    accel_atmospheric_drag,
    accel_srp,
    accel_third_body,
)
from propagators.integrators import integrate_rk4, integrate_rkf78, integrate_abm4
from propagators.sgp4_propagator import SGP4Propagator
from propagators.cowell_propagator import CowellPropagator
from ml.residual_dataset import build_residual_sequences
from ml.lstm_model import ResidualLSTM
from analysis.visibility import compute_all_station_windows, DEFAULT_GROUND_STATIONS
from analysis.isl_topology import check_isl_visibility
from attitude.quaternions import quat_normalize, quat_multiply, quat_to_euler
from attitude.dynamics import AttitudeSimulator


class TestAstrodynamicsCore(unittest.TestCase):
    def test_kepler_solver_and_conversion(self):
        # Round-trip COE -> RV -> COE
        a = 7000000.0  # 7000 km
        e = 0.001
        inc = 51.6
        raan = 120.0
        argp = 45.0
        nu = 30.0

        r_vec, v_vec = coe_to_rv(a, e, inc, raan, argp, nu)
        self.assertAlmostEqual(np.linalg.norm(r_vec), a, delta=a * e * 2)

        coe = rv_to_coe(r_vec, v_vec)
        self.assertAlmostEqual(coe["a"] / 1000.0, a / 1000.0, places=1)
        self.assertAlmostEqual(coe["e"], e, places=3)
        self.assertAlmostEqual(coe["i_deg"], inc, places=2)

    def test_coordinates_roundtrip(self):
        jd = 2460000.5
        r_eci = np.array([7000000.0, 0.0, 0.0])
        v_eci = np.array([0.0, 7500.0, 0.0])

        r_ecef, v_ecef = eci_to_ecef(r_eci, v_eci, jd)
        r_back, v_back = ecef_to_eci(r_ecef, v_ecef, jd)

        np.testing.assert_allclose(r_back, r_eci, atol=1e-3)
        np.testing.assert_allclose(v_back, v_eci, atol=1e-3)

    def test_perturbation_accelerations(self):
        r_vec = np.array([7000000.0, 0.0, 0.0])
        v_vec = np.array([0.0, 7540.0, 0.0])

        a_j2 = accel_j2(r_vec)
        self.assertGreater(np.linalg.norm(a_j2), 0.0)
        self.assertLess(np.linalg.norm(a_j2), 0.1)  # J2 is small perturbation (~0.01 m/s^2)

        a_drag = accel_atmospheric_drag(r_vec, v_vec, cd=2.2, area_m2=2.0, mass_kg=500.0)
        self.assertGreater(np.linalg.norm(a_drag), 0.0)


class TestPropagatorsAndML(unittest.TestCase):
    def setUp(self):
        self.tle1 = "1 25544U 98067A   26075.51736111  .00016717  00000-0  10270-3 0  9002"
        self.tle2 = "2 25544  51.6420 180.2000 0004500  70.1200 290.0000 15.49815300 10008"
        self.sgp4 = SGP4Propagator(self.tle1, self.tle2)

    def test_sgp4_propagation(self):
        res = self.sgp4.propagate(t_span_seconds=300.0, dt_step=60.0)
        self.assertEqual(len(res["times_s"]), 6)
        self.assertEqual(res["states_eci"].shape, (6, 6))

    def test_cowell_integrators(self):
        y0 = self.sgp4.get_initial_state_eci()
        epoch_jd = self.sgp4.epoch_jd

        # RKF78
        prop_rkf = CowellPropagator(integrator="RKF78", tol=1e-7, use_j2=True)
        res_rkf = prop_rkf.propagate(300.0, 60.0, epoch_jd, y0)
        self.assertEqual(len(res_rkf["times_s"]), 6)

        # ABM4
        prop_abm = CowellPropagator(integrator="ABM4", use_j2=True)
        res_abm = prop_abm.propagate(300.0, 60.0, epoch_jd, y0)
        self.assertEqual(len(res_abm["times_s"]), 6)

    def test_lstm_forward(self):
        import torch
        model = ResidualLSTM(input_dim=10, hidden_dim=32, output_dim=6)
        dummy_input = torch.randn(4, 12, 10)
        out = model(dummy_input)
        self.assertEqual(out.shape, (4, 6))


class TestMissionOperations(unittest.TestCase):
    def test_isl_line_of_sight(self):
        # Two satellites on opposite sides of Earth
        r1 = np.array([7000000.0, 0.0, 0.0])
        r2 = np.array([-7000000.0, 0.0, 0.0])
        visible, dist, alt = check_isl_visibility(r1, r2)
        self.assertFalse(visible)  # Occluded by Earth!

        # Two satellites near each other
        r3 = np.array([7000000.0, 50000.0, 0.0])
        visible2, dist2, alt2 = check_isl_visibility(r1, r3)
        self.assertTrue(visible2)

    def test_attitude_propagation(self):
        sim = AttitudeSimulator()
        times = np.array([0.0, 10.0, 20.0])
        states = np.zeros((3, 6))
        states[:, 0] = 7000000.0
        states[:, 4] = 7500.0
        res = sim.propagate_attitude(times, states, mode="NADIR")
        self.assertEqual(len(res["quaternions"]), 3)
        self.assertEqual(res["quaternions"].shape, (3, 4))


if __name__ == "__main__":
    unittest.main()
