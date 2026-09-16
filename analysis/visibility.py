"""
Ground Station Visibility Windows and Contact Pass Analysis
Calculates AER (Azimuth, Elevation, Range), AOS/LOS times, and maximum elevation for telemetry tracking.
"""

from typing import Dict, Any, List, Tuple
import numpy as np
from core.coordinates import ecef_to_topocentric_sez, sez_to_aer
from core.time_systems import jd_to_datetime


DEFAULT_GROUND_STATIONS = [
    {"name": "Beijing Tracking Station", "lat_deg": 40.05, "lon_deg": 116.32, "alt_m": 50.0, "min_el_deg": 5.0},
    {"name": "Kashi Ground Station", "lat_deg": 39.47, "lon_deg": 75.99, "alt_m": 1289.0, "min_el_deg": 5.0},
    {"name": "Sanya Tracking Station", "lat_deg": 18.25, "lon_deg": 109.51, "alt_m": 20.0, "min_el_deg": 5.0},
    {"name": "Svalbard Polar Station", "lat_deg": 78.22, "lon_deg": 15.40, "alt_m": 498.0, "min_el_deg": 3.0},
    {"name": "Malindi Tracking Station", "lat_deg": -2.99, "lon_deg": 40.19, "alt_m": 15.0, "min_el_deg": 5.0},
]


def calculate_station_aer_series(
    states_ecef: np.ndarray,
    times_s: np.ndarray,
    station: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Compute time series of Azimuth, Elevation, and Range for a satellite trajectory relative to a ground station.
    """
    n_points = len(times_s)
    az_arr = np.zeros(n_points)
    el_arr = np.zeros(n_points)
    rng_arr = np.zeros(n_points)
    visible_mask = np.zeros(n_points, dtype=bool)

    lat = station["lat_deg"]
    lon = station["lon_deg"]
    alt = station["alt_m"]
    min_el = station.get("min_el_deg", 5.0)

    for i in range(n_points):
        r_sat_ecef = states_ecef[i, 0:3]
        rho_sez = ecef_to_topocentric_sez(r_sat_ecef, lat, lon, alt)
        az, el, rng = sez_to_aer(rho_sez)

        az_arr[i] = az
        el_arr[i] = el
        rng_arr[i] = rng
        if el >= min_el:
            visible_mask[i] = True

    return {
        "station_name": station["name"],
        "azimuth_deg": az_arr,
        "elevation_deg": el_arr,
        "range_km": rng_arr / 1000.0,
        "is_visible": visible_mask,
    }


def find_visibility_passes(
    times_s: np.ndarray,
    jds: np.ndarray,
    elevation_deg: np.ndarray,
    min_el_deg: float = 5.0,
) -> List[Dict[str, Any]]:
    """
    Extract discrete contact passes (AOS, TCA, LOS, duration, max elevation).
    """
    passes = []
    in_pass = False
    current_pass = {}

    n = len(times_s)
    for i in range(n):
        el = elevation_deg[i]
        t = times_s[i]
        jd = jds[i]

        if el >= min_el_deg and not in_pass:
            # AOS (Acquisition of Signal)
            in_pass = True
            current_pass = {
                "aos_t_sec": float(t),
                "aos_jd": float(jd),
                "aos_utc": jd_to_datetime(jd).isoformat(),
                "max_el_deg": float(el),
                "tca_t_sec": float(t),
                "tca_jd": float(jd),
            }
        elif in_pass:
            if el > current_pass["max_el_deg"]:
                current_pass["max_el_deg"] = float(el)
                current_pass["tca_t_sec"] = float(t)
                current_pass["tca_jd"] = float(jd)

            if el < min_el_deg or i == n - 1:
                # LOS (Loss of Signal)
                in_pass = False
                current_pass["los_t_sec"] = float(t)
                current_pass["los_jd"] = float(jd)
                current_pass["los_utc"] = jd_to_datetime(jd).isoformat()
                current_pass["duration_sec"] = float(
                    current_pass["los_t_sec"] - current_pass["aos_t_sec"]
                )
                passes.append(current_pass)
                current_pass = {}

    return passes


def compute_all_station_windows(
    states_ecef: np.ndarray,
    times_s: np.ndarray,
    jds: np.ndarray,
    stations: List[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Compute visibility passes across all designated ground stations.
    """
    if stations is None:
        stations = DEFAULT_GROUND_STATIONS

    station_results = []
    for st in stations:
        aer = calculate_station_aer_series(states_ecef, times_s, st)
        passes = find_visibility_passes(
            times_s, jds, aer["elevation_deg"], st.get("min_el_deg", 5.0)
        )
        station_results.append({
            "station": st,
            "passes": passes,
            "pass_count": len(passes),
            "max_elevation_all_passes": max([p["max_el_deg"] for p in passes]) if passes else 0.0,
            "total_contact_time_sec": sum([p["duration_sec"] for p in passes]) if passes else 0.0,
        })

    return station_results
