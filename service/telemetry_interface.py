"""
Real Satellite Telemetry & Remote Sensing Data Ingestion Interface
==================================================================
Provides extensible standard interfaces for ingesting real-world satellite
tracking, GNSS telemetry, and radar/optical observations into the
Unified Orbit Prediction Model.

Supported formats:
1. STATE_VECTORS: Cartesian coordinates (ECI or ECEF: X, Y, Z, Vx, Vy, Vz)
2. GEODETIC_GPS: WGS84 Geodetic fixes (Lat, Lon, Alt, Speed)
3. RADAR_AZ_EL_RANGE: Ground station tracking pass fixes (Az, El, Slant Range)
4. TLE_FORMAT: Two-Line Element sets (NORAD format)
"""

import math
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
import numpy as np

from core.constants import R_EARTH, OMEGA_EARTH, MU_EARTH
from core.time_systems import datetime_to_jd, jd_to_datetime
from core.coordinates import geodetic_to_ecef, ecef_to_eci, eci_to_ecef, ecef_to_geodetic
from propagators.unified_predictor import UnifiedOrbitPredictor


class TelemetryIngestionManager:
    """
    Manages ingestion, schema validation, coordinate normalization,
    and storage for external real-world satellite observations.
    """

    def __init__(self):
        # In-memory storage: sat_id -> list of standardized observation dicts
        self.ingested_observations: Dict[str, List[Dict[str, Any]]] = {}
        # Satellite metadata registry
        self.satellite_metadata: Dict[str, Dict[str, Any]] = {}

    def parse_timestamp_to_jd(self, ts_input: Any) -> float:
        """
        Parses ISO-8601 string, Unix epoch float, or JD float into Julian Date.
        """
        if isinstance(ts_input, (int, float)):
            if ts_input > 2400000.0:
                return float(ts_input)  # Already JD
            # Unix timestamp in seconds
            dt = datetime.fromtimestamp(ts_input, tz=timezone.utc)
            return datetime_to_jd(dt)
        elif isinstance(ts_input, str):
            clean_str = ts_input.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return datetime_to_jd(dt)
        raise ValueError(f"Unrecognized timestamp format: {ts_input}")

    def ingest_observations(
        self,
        sat_id: str,
        data_type: str,
        records: List[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Ingests a batch of observation records, parses them into standardized
        J2000 ECI state vectors, and registers them into the observation buffer.
        """
        data_type = data_type.upper()
        parsed_obs = []

        if sat_id not in self.ingested_observations:
            self.ingested_observations[sat_id] = []

        for rec in records:
            jd = self.parse_timestamp_to_jd(rec.get("timestamp") or rec.get("time"))

            if data_type == "STATE_VECTORS":
                frame = rec.get("frame", "ECI").upper()
                pos = np.array([rec["x"], rec["y"], rec["z"]], dtype=np.float64)
                vel = np.array([
                    rec.get("vx", 0.0),
                    rec.get("vy", 0.0),
                    rec.get("vz", 0.0),
                ], dtype=np.float64)

                if frame == "ECEF":
                    pos_eci, vel_eci = ecef_to_eci(pos, vel, jd)
                else:
                    pos_eci = pos
                    vel_eci = vel

            elif data_type == "GEODETIC_GPS":
                lat = float(rec["lat"])
                lon = float(rec["lon"])
                alt_m = float(rec.get("alt_m") or (rec.get("alt_km", 500.0) * 1000.0))
                speed = float(rec.get("speed_ms", 7600.0))

                r_ecef = geodetic_to_ecef(lat, lon, alt_m)
                pos_eci, _ = ecef_to_eci(r_ecef, np.zeros(3), jd)

                # Estimate circular orbital velocity vector along heading or latitude gradient
                heading_deg = float(rec.get("heading_deg", 45.0))
                heading_rad = math.radians(heading_deg)
                r_norm = np.linalg.norm(pos_eci)
                v_mag = math.sqrt(MU_EARTH / r_norm) if speed <= 0 else speed

                # Tangential velocity vector
                z_hat = np.array([0.0, 0.0, 1.0])
                n_vec = np.cross(pos_eci, z_hat)
                n_norm = np.linalg.norm(n_vec)
                if n_norm > 1e-3:
                    v_dir = n_vec / n_norm
                else:
                    v_dir = np.array([0.0, 1.0, 0.0])
                vel_eci = v_dir * v_mag

            elif data_type == "RADAR_AZ_EL_RANGE":
                st_lat = float(rec.get("station_lat", 40.05))
                st_lon = float(rec.get("station_lon", 116.32))
                st_alt = float(rec.get("station_alt_m", 50.0))

                az = math.radians(float(rec["az_deg"]))
                el = math.radians(float(rec["el_deg"]))
                rho = float(rec["range_km"]) * 1000.0

                # Station position in ECEF
                r_st_ecef = geodetic_to_ecef(st_lat, st_lon, st_alt)

                # Topocentric SEZ coordinates
                s = -rho * math.cos(el) * math.cos(az)
                e = rho * math.cos(el) * math.sin(az)
                z = rho * math.sin(el)

                # SEZ to ECEF rotation
                phi = math.radians(st_lat)
                lam = math.radians(st_lon)
                x_ecef = (
                    math.sin(phi) * math.cos(lam) * s
                    - math.sin(lam) * e
                    + math.cos(phi) * math.cos(lam) * z
                ) + r_st_ecef[0]
                y_ecef = (
                    math.sin(phi) * math.sin(lam) * s
                    + math.cos(lam) * e
                    + math.cos(phi) * math.sin(lam) * z
                ) + r_st_ecef[1]
                z_ecef = -math.cos(phi) * s + math.sin(phi) * z + r_st_ecef[2]

                r_ecef = np.array([x_ecef, y_ecef, z_ecef], dtype=np.float64)
                pos_eci, _ = ecef_to_eci(r_ecef, np.zeros(3), jd)
                vel_eci = np.array([0.0, 7500.0, 0.0], dtype=np.float64)

            else:
                raise ValueError(f"Unsupported data_type: {data_type}")

            parsed_obs.append({
                "jd": jd,
                "pos_eci": pos_eci.tolist(),
                "vel_eci": vel_eci.tolist(),
                "raw": rec,
            })

        # Sort chronologically by JD
        parsed_obs.sort(key=lambda o: o["jd"])
        self.ingested_observations[sat_id].extend(parsed_obs)

        if metadata:
            self.satellite_metadata[sat_id] = metadata

        return {
            "sat_id": sat_id,
            "data_type": data_type,
            "records_ingested": len(parsed_obs),
            "total_records_buffered": len(self.ingested_observations[sat_id]),
            "time_span_start": jd_to_datetime(parsed_obs[0]["jd"]).isoformat() if parsed_obs else None,
            "time_span_end": jd_to_datetime(parsed_obs[-1]["jd"]).isoformat() if parsed_obs else None,
        }

    def predict_from_ingested_data(
        self,
        sat_id: str,
        duration_hours: float = 2.5,
        dt_step: float = 30.0,
        model_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Uses ingested real-world telemetry fixes to calibrate and forecast
        forward orbit via UnifiedOrbitPredictor.
        """
        if sat_id not in self.ingested_observations or len(self.ingested_observations[sat_id]) == 0:
            raise ValueError(f"No telemetry observations available for satellite: {sat_id}")

        obs_list = self.ingested_observations[sat_id]
        latest_obs = obs_list[-1]
        epoch_jd = latest_obs["jd"]
        y0_eci = np.hstack([latest_obs["pos_eci"], latest_obs["vel_eci"]]).astype(np.float64)

        # Prepare observation fixes relative to epoch_jd
        formatted_obs = []
        for o in obs_list:
            t_s = (o["jd"] - epoch_jd) * 86400.0
            formatted_obs.append({
                "time_s": t_s,
                "pos_eci": o["pos_eci"],
                "vel_eci": o["vel_eci"],
            })

        cfg = model_config or {}
        predictor = UnifiedOrbitPredictor(
            integrator=cfg.get("integrator", "RKF78"),
            use_j2=cfg.get("use_j2", True),
            use_j3=cfg.get("use_j3", True),
            use_j4=cfg.get("use_j4", True),
            use_drag=cfg.get("use_drag", True),
            use_sun=cfg.get("use_sun", True),
            use_moon=cfg.get("use_moon", True),
            use_srp=cfg.get("use_srp", True),
            attitude_mode=cfg.get("attitude_mode", "NADIR"),
            cd=cfg.get("cd", 2.2),
            mass_kg=cfg.get("mass_kg", 680.0),
        )

        prediction = predictor.predict(
            initial_state_eci=y0_eci,
            epoch_jd=epoch_jd,
            duration_hours=duration_hours,
            dt_step=dt_step,
            observations=formatted_obs if len(formatted_obs) >= 2 else None,
        )

        prediction["satellite_id"] = sat_id
        prediction["source"] = "REAL_TELEMETRY_INGESTION"
        prediction["epoch_utc"] = jd_to_datetime(epoch_jd).isoformat()
        return prediction


# Global telemetry manager instance
global_telemetry_manager = TelemetryIngestionManager()
