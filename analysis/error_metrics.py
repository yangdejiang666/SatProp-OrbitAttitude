"""
Statistical Orbit Error Analysis and RIC Decomposition
Calculates 1-sigma, 2-sigma, 3-sigma confidence bounds, RMSE, and cumulative distribution.
"""

from typing import Dict, Any, List
import numpy as np
from core.coordinates import compute_ric_errors


def calculate_error_statistics(errors: np.ndarray) -> Dict[str, float]:
    """
    Compute 1-sigma (68.27%), 2-sigma (95.45%), 3-sigma (99.73%), RMSE, MAE, and Max.
    """
    abs_errors = np.abs(errors)
    mean_val = float(np.mean(abs_errors))
    std_val = float(np.std(abs_errors))
    rmse_val = float(np.sqrt(np.mean(abs_errors**2)))

    # Percentiles for non-Gaussian/empirical distributions
    p68 = float(np.percentile(abs_errors, 68.27))
    p95 = float(np.percentile(abs_errors, 95.45))
    p99 = float(np.percentile(abs_errors, 99.73))

    return {
        "rmse": rmse_val,
        "mae": mean_val,
        "std": std_val,
        "sigma_1": p68,
        "sigma_2": p95,
        "sigma_3": p99,
        "min": float(np.min(abs_errors)),
        "max": float(np.max(abs_errors)),
        "median": float(np.median(abs_errors)),
    }


def analyze_trajectory_errors(
    states_test_eci: np.ndarray,
    states_ref_eci: np.ndarray,
) -> Dict[str, Any]:
    """
    Perform full statistical breakdown of orbital error between two trajectories.
    Decomposes error into Radial, In-Track, Cross-Track, and Total 3D position/velocity.
    """
    n_points = min(len(states_test_eci), len(states_ref_eci))

    dr_3d = np.zeros(n_points)
    dr_r = np.zeros(n_points)
    dr_i = np.zeros(n_points)
    dr_c = np.zeros(n_points)

    dv_3d = np.zeros(n_points)
    dv_r = np.zeros(n_points)
    dv_i = np.zeros(n_points)
    dv_c = np.zeros(n_points)

    for idx in range(n_points):
        r_test = states_test_eci[idx, 0:3]
        v_test = states_test_eci[idx, 3:6]
        r_ref = states_ref_eci[idx, 0:3]
        v_ref = states_ref_eci[idx, 3:6]

        ric = compute_ric_errors(r_test, v_test, r_ref, v_ref)

        dr_3d[idx] = ric["total_pos_error"]
        dr_r[idx] = ric["dr_radial"]
        dr_i[idx] = ric["dr_in_track"]
        dr_c[idx] = ric["dr_cross_track"]

        dv_3d[idx] = ric["total_vel_error"]
        dv_r[idx] = ric["dv_radial"]
        dv_i[idx] = ric["dv_in_track"]
        dv_c[idx] = ric["dv_cross_track"]

    return {
        "position_3d": calculate_error_statistics(dr_3d),
        "radial": calculate_error_statistics(dr_r),
        "in_track": calculate_error_statistics(dr_i),
        "cross_track": calculate_error_statistics(dr_c),
        "velocity_3d": calculate_error_statistics(dv_3d),
        "sample_count": n_points,
    }
