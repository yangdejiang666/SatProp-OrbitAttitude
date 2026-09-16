"""
Numerical Integrator Benchmark and Long-Arc Error Accumulation Analysis
Compares RK4, RKF78, ABM4, and SGP4 in terms of:
- Execution runtime (ms)
- Function evaluations (RHS calls)
- Energy conservation error |Delta E / E0|
- Positional drift rate (m/hr)
- RIC error growth over multi-orbit arcs
"""

import time
from typing import Dict, Any, List
import numpy as np
from core.constants import MU_EARTH
from core.coordinates import compute_ric_errors
from propagators.cowell_propagator import CowellPropagator
from propagators.sgp4_propagator import SGP4Propagator


def compute_orbital_energy(r_vec: np.ndarray, v_vec: np.ndarray, mu: float = MU_EARTH) -> float:
    """Compute specific orbital mechanical energy E = v^2 / 2 - mu / r [J/kg]."""
    r = np.linalg.norm(r_vec)
    v = np.linalg.norm(v_vec)
    return float(0.5 * (v**2) - mu / r)


def run_integrator_benchmark(
    initial_state_eci: np.ndarray,
    epoch_jd: float,
    arc_duration_hours: float = 6.0,
    dt_step: float = 30.0,
) -> Dict[str, Any]:
    """
    Run comprehensive benchmark comparing RK4, RKF78, and ABM4 over specified arc length.
    """
    t_span = arc_duration_hours * 3600.0

    # 1. High-Precision Reference Truth: Cowell RKF78 with tight tolerance (tol=1e-11)
    truth_prop = CowellPropagator(
        integrator="RKF78",
        tol=1e-11,
        use_j2=True,
        use_j3=True,
        use_j4=True,
        use_drag=True,
        use_sun=True,
        use_moon=True,
        use_srp=True,
    )
    t0 = time.perf_counter()
    truth_res = truth_prop.propagate(t_span, dt_step, epoch_jd, initial_state_eci)
    truth_time = time.perf_counter() - t0

    times_s = truth_res["times_s"]
    states_truth = truth_res["states_eci"]
    n_points = len(times_s)

    methods = [
        ("RK4 (Fixed Step)", "RK4", {"dt_step": dt_step}),
        ("RKF78 (Adaptive)", "RKF78", {"tol": 1e-8}),
        ("ABM4 (Predictor-Corrector)", "ABM4", {"dt_step": dt_step}),
    ]

    benchmark_results = {
        "arc_duration_hours": arc_duration_hours,
        "n_points": n_points,
        "truth_time_s": truth_time,
        "methods": {},
    }

    initial_energy = compute_orbital_energy(initial_state_eci[0:3], initial_state_eci[3:6])

    for label, method_name, kwargs in methods:
        prop = CowellPropagator(
            integrator=method_name,
            use_j2=True,
            use_j3=True,
            use_j4=True,
            use_drag=True,
            use_sun=True,
            use_moon=True,
            use_srp=True,
            **{k: v for k, v in kwargs.items() if k in ["tol"]},
        )

        res = prop.propagate(t_span, dt_step, epoch_jd, initial_state_eci)
        states = res["states_eci"]
        stats = res["stats"]

        # Compute error time history vs truth
        pos_errors = np.zeros(n_points)
        vel_errors = np.zeros(n_points)
        radial_errors = np.zeros(n_points)
        in_track_errors = np.zeros(n_points)
        cross_track_errors = np.zeros(n_points)
        energy_errors = np.zeros(n_points)

        for i in range(n_points):
            r_i = states[i, 0:3]
            v_i = states[i, 3:6]
            r_true = states_truth[i, 0:3]
            v_true = states_truth[i, 3:6]

            ric = compute_ric_errors(r_i, v_i, r_true, v_true)
            pos_errors[i] = ric["total_pos_error"]
            vel_errors[i] = ric["total_vel_error"]
            radial_errors[i] = ric["dr_radial"]
            in_track_errors[i] = ric["dr_in_track"]
            cross_track_errors[i] = ric["dr_cross_track"]

            e_curr = compute_orbital_energy(r_i, v_i)
            energy_errors[i] = abs(e_curr - initial_energy) / abs(initial_energy)

        max_pos_err = float(np.max(pos_errors))
        final_pos_err = float(pos_errors[-1])
        rmse_pos_err = float(np.sqrt(np.mean(pos_errors**2)))
        drift_rate_m_hr = final_pos_err / arc_duration_hours

        benchmark_results["methods"][label] = {
            "method": method_name,
            "elapsed_s": float(stats.get("elapsed_s", 0.0)),
            "wall_time_ms": float(stats.get("elapsed_s", 0.0) * 1000.0),
            "n_evals": int(stats.get("n_evals", 0)),
            "max_pos_error_m": max_pos_err,
            "final_pos_error_m": final_pos_err,
            "rmse_pos_error_m": rmse_pos_err,
            "drift_rate_m_hr": drift_rate_m_hr,
            "max_energy_error": float(np.max(energy_errors)),
            "times_s": times_s.tolist(),
            "pos_errors_m": pos_errors.tolist(),
            "in_track_errors_m": in_track_errors.tolist(),
            "radial_errors_m": radial_errors.tolist(),
            "cross_track_errors_m": cross_track_errors.tolist(),
        }

    return benchmark_results
