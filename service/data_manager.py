"""
Data Management and Telemetry Ingestion Platform
Handles:
- Loading and caching real TLE datasets (CartoSat, ISS, Tiangong, Starlink, BeiDou)
- Telemetry ingestion API (ECEF/ECI coordinates, attitude quaternions, gyro rates)
- Orbit correction and station-keeping maneuver calculation ("回归正轨" / Nominal Orbit Restoration)
"""

import os
import glob
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import numpy as np
from core.time_systems import datetime_to_jd, jd_to_datetime
from core.coordinates import ecef_to_eci, eci_to_ecef, ecef_to_geodetic
from core.kepler import rv_to_coe, coe_to_rv
from attitude.quaternions import quat_to_euler
from propagators.sgp4_propagator import SGP4Propagator


class SatelliteDataManager:
    """
    Central repository for satellite ephemerides, telemetry streams, and orbital mission plans.
    """

    def __init__(self, data_dir: str = None):
        if data_dir is None:
            data_dir = os.path.join(os.path.dirname(__file__), "..", "data")
        self.data_dir = os.path.abspath(data_dir)
        self.tle_dir = os.path.join(self.data_dir, "real_tles")
        self.satellites: Dict[str, Dict[str, Any]] = {}
        self.telemetry_history: Dict[str, List[Dict[str, Any]]] = {}

        self.load_predefined_tles()

    def load_predefined_tles(self):
        """Scan real_tles folder and register satellites."""
        tle_files = glob.glob(os.path.join(self.tle_dir, "*.tle"))
        for tf in tle_files:
            sat_id = os.path.splitext(os.path.basename(tf))[0]
            with open(tf, "r", encoding="utf-8") as f:
                lines = [l.strip() for l in f if l.strip()]
            if len(lines) >= 2:
                line1, line2 = lines[0], lines[1]
                try:
                    prop = SGP4Propagator(line1, line2, name=sat_id.upper())
                    self.satellites[sat_id] = {
                        "id": sat_id,
                        "name": sat_id.upper(),
                        "line1": line1,
                        "line2": line2,
                        "satnum": prop.satnum,
                        "epoch_jd": prop.epoch_jd,
                        "epoch_utc": jd_to_datetime(prop.epoch_jd).isoformat(),
                        "inclination_deg": prop.inclination_deg,
                        "bstar": prop.bstar,
                        "propagator": prop,
                    }
                    self.telemetry_history[sat_id] = []
                except Exception as e:
                    print(f"Failed to load TLE {tf}: {e}")

    def get_satellite_list(self) -> List[Dict[str, Any]]:
        """Return catalog metadata for all registered satellites."""
        return [
            {
                "id": s["id"],
                "name": s["name"],
                "satnum": s["satnum"],
                "epoch_utc": s["epoch_utc"],
                "inclination_deg": s["inclination_deg"],
                "bstar": s["bstar"],
                "has_telemetry": len(self.telemetry_history.get(s["id"], [])) > 0,
            }
            for s in self.satellites.values()
        ]

    def ingest_telemetry_frame(self, frame: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ingest real-time remote sensing telemetry frame:
        Expected keys:
          - sat_id: str
          - timestamp_utc: str (ISO format) or jd: float
          - r_ecef or r_eci: [x, y, z] [m]
          - v_ecef or v_eci: [vx, vy, vz] [m/s]
          - quaternion: [q0, q1, q2, q3]
          - omega_body: [wx, wy, wz] [rad/s]
        """
        sat_id = frame.get("sat_id", "custom_sat")
        if "timestamp_utc" in frame:
            dt = datetime.fromisoformat(frame["timestamp_utc"].replace("Z", "+00:00"))
            jd = datetime_to_jd(dt)
        else:
            jd = float(frame.get("jd", datetime_to_jd(datetime.now(timezone.utc))))
            dt = jd_to_datetime(jd)

        # Coordinate resolution
        if "r_ecef" in frame:
            r_ecef = np.array(frame["r_ecef"], dtype=np.float64)
            v_ecef = np.array(frame.get("v_ecef", [0, 0, 0]), dtype=np.float64)
            r_eci, v_eci = ecef_to_eci(r_ecef, v_ecef, jd)
        else:
            r_eci = np.array(frame.get("r_eci", [7000000.0, 0.0, 0.0]), dtype=np.float64)
            v_eci = np.array(frame.get("v_eci", [0.0, 7500.0, 0.0]), dtype=np.float64)
            r_ecef, v_ecef = eci_to_ecef(r_eci, v_eci, jd)

        lat, lon, alt = ecef_to_geodetic(r_ecef)
        coe = rv_to_coe(r_eci, v_eci)

        q = np.array(frame.get("quaternion", [1.0, 0.0, 0.0, 0.0]), dtype=np.float64)
        roll, pitch, yaw = quat_to_euler(q)
        omega = np.array(frame.get("omega_body", [0.0, 0.0, 0.0]), dtype=np.float64)

        record = {
            "sat_id": sat_id,
            "timestamp_utc": dt.isoformat(),
            "jd": jd,
            "r_eci": r_eci.tolist(),
            "v_eci": v_eci.tolist(),
            "r_ecef": r_ecef.tolist(),
            "v_ecef": v_ecef.tolist(),
            "geodetic": {"lat_deg": lat, "lon_deg": lon, "alt_m": alt},
            "coe": coe,
            "quaternion": q.tolist(),
            "euler_angles_deg": {"roll": roll, "pitch": pitch, "yaw": yaw},
            "omega_body": omega.tolist(),
        }

        if sat_id not in self.telemetry_history:
            self.telemetry_history[sat_id] = []
        self.telemetry_history[sat_id].append(record)

        # Keep rolling buffer of last 5000 frames
        if len(self.telemetry_history[sat_id]) > 5000:
            self.telemetry_history[sat_id].pop(0)

        return record

    def plan_station_keeping_maneuver(
        self,
        current_state_eci: np.ndarray,
        nominal_semi_major_axis: float = 6878137.0,  # 500 km altitude
        nominal_eccentricity: float = 0.001,
    ) -> Dict[str, Any]:
        """
        Calculate impulsive Delta-V burn to correct an orbital drift back to nominal slot ("回归正轨").
        Hohmann-based semi-major axis restoration and inclination correction.
        """
        r_curr = current_state_eci[0:3]
        v_curr = current_state_eci[3:6]
        coe_curr = rv_to_coe(r_curr, v_curr)

        a_curr = coe_curr["a"]
        e_curr = coe_curr["e"]

        # Delta-a required
        delta_a = nominal_semi_major_axis - a_curr

        # Tangential burn Delta-V_t approx = (n / 2) * delta_a
        n = np.sqrt(3.986004418e14 / (a_curr**3))
        delta_v_tangential = 0.5 * n * delta_a

        # Burn direction: unit vector along velocity
        v_norm = np.linalg.norm(v_curr)
        u_v = v_curr / v_norm
        delta_v_vec = delta_v_tangential * u_v

        corrected_state = current_state_eci.copy()
        corrected_state[3:6] += delta_v_vec
        coe_corrected = rv_to_coe(corrected_state[0:3], corrected_state[3:6])

        return {
            "initial_coe": coe_curr,
            "target_semi_major_axis_km": nominal_semi_major_axis / 1000.0,
            "delta_a_km": delta_a / 1000.0,
            "delta_v_magnitude_ms": float(abs(delta_v_tangential)),
            "delta_v_vector_eci": delta_v_vec.tolist(),
            "burn_type": "Prograde" if delta_v_tangential > 0 else "Retrograde",
            "corrected_coe": coe_corrected,
            "initial_state_eci": current_state_eci.tolist(),
            "corrected_state_eci": corrected_state.tolist(),
        }
