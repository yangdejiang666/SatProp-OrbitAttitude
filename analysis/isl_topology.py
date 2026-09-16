"""
Inter-Satellite Links (ISL) Geometric Line-of-Sight and Network Topology Prediction
Evaluates Earth occultation, atmospheric grazing altitude, distance range,
and Doppler shift for satellite constellation communications.
Reference: Maral & Bousquet (2009) Satellite Communications Systems.
"""

from typing import Dict, Any, List, Tuple
import numpy as np
from core.constants import R_EARTH, SPEED_OF_LIGHT


def check_isl_visibility(
    r1_eci: np.ndarray,
    r2_eci: np.ndarray,
    h_grazing_m: float = 100000.0,
    max_range_m: float = 5000000.0,
) -> Tuple[bool, float, float]:
    """
    Check if an Inter-Satellite Link exists between two satellites.
    Returns:
        (is_visible, link_distance_m, min_clearance_alt_m)
    """
    d_vec = r2_eci - r1_eci
    dist_m = float(np.linalg.norm(d_vec))

    if dist_m > max_range_m:
        return False, dist_m, -1.0

    d_sq = dist_m**2
    if d_sq < 1e-6:
        return True, 0.0, float(np.linalg.norm(r1_eci) - R_EARTH)

    # Parametric projection t of Earth center (origin) onto line segment
    t_proj = -float(np.dot(r1_eci, d_vec)) / d_sq
    t_clamped = np.clip(t_proj, 0.0, 1.0)

    # Closest point on ray to Earth center
    r_closest = r1_eci + t_clamped * d_vec
    r_closest_norm = float(np.linalg.norm(r_closest))
    min_clearance_alt = r_closest_norm - R_EARTH

    # Earth occlusion check
    r_earth_effective = R_EARTH + h_grazing_m
    is_clear = bool(r_closest_norm >= r_earth_effective)

    return is_clear, dist_m, min_clearance_alt


def calculate_isl_doppler(
    r1_eci: np.ndarray,
    v1_eci: np.ndarray,
    r2_eci: np.ndarray,
    v2_eci: np.ndarray,
    carrier_freq_hz: float = 23e9,  # 23 GHz Ka-band or Optical
) -> float:
    """
    Calculate Doppler frequency shift [Hz] along the line-of-sight vector.
    """
    d_vec = r2_eci - r1_eci
    dist = float(np.linalg.norm(d_vec))
    if dist < 1e-3:
        return 0.0

    u_los = d_vec / dist
    v_rel = v2_eci - v1_eci
    range_rate = float(np.dot(v_rel, u_los))  # [m/s]

    doppler_hz = -carrier_freq_hz * (range_rate / SPEED_OF_LIGHT)
    return doppler_hz


def analyze_constellation_isl_topology(
    satellites_trajectories: List[Dict[str, Any]],
    time_idx: int = 0,
    h_grazing_m: float = 100000.0,
    max_range_m: float = 5000000.0,
) -> Dict[str, Any]:
    """
    Construct constellation ISL adjacency graph at specific time step.
    satellites_trajectories: list of dicts with 'name', 'states_eci' (N, 6)
    """
    n_sats = len(satellites_trajectories)
    adj_matrix = np.zeros((n_sats, n_sats), dtype=int)
    links = []

    for i in range(n_sats):
        for j in range(i + 1, n_sats):
            sat_i = satellites_trajectories[i]
            sat_j = satellites_trajectories[j]

            r_i = sat_i["states_eci"][time_idx, 0:3]
            v_i = sat_i["states_eci"][time_idx, 3:6]
            r_j = sat_j["states_eci"][time_idx, 0:3]
            v_j = sat_j["states_eci"][time_idx, 3:6]

            visible, dist_m, alt_m = check_isl_visibility(
                r_i, r_j, h_grazing_m=h_grazing_m, max_range_m=max_range_m
            )

            if visible:
                adj_matrix[i, j] = 1
                adj_matrix[j, i] = 1
                doppler_hz = calculate_isl_doppler(r_i, v_i, r_j, v_j)

                links.append({
                    "sat1_idx": i,
                    "sat1_name": sat_i["name"],
                    "sat2_idx": j,
                    "sat2_name": sat_j["name"],
                    "distance_km": dist_m / 1000.0,
                    "clearance_alt_km": alt_m / 1000.0,
                    "doppler_shift_khz": doppler_hz / 1000.0,
                    "r1_eci": r_i.tolist(),
                    "r2_eci": r_j.tolist(),
                })

    return {
        "time_idx": time_idx,
        "n_satellites": n_sats,
        "total_active_links": len(links),
        "adjacency_matrix": adj_matrix.tolist(),
        "active_links": links,
    }
