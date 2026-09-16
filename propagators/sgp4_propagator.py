"""
Analytical SGP4 / SDP4 Orbit Propagator Wrapper
Integrates Brandon Rhodes' sgp4 library with full TEME-to-J2000 ECI,
ECEF, and Geodetic transformations.
Reference: Hoots & Roehrich (1980) Spacetrack Report #3; Vallado (2006).
"""

from typing import Dict, Any, Optional
import numpy as np
from sgp4.api import Satrec, WGS72
from core.constants import SECONDS_PER_DAY
from core.coordinates import teme_to_j2000, eci_to_ecef, ecef_to_geodetic
from core.kepler import rv_to_coe
from propagators.base import BasePropagator


class SGP4Propagator(BasePropagator):
    """
    Standard SGP4/SDP4 analytical orbit propagator.
    """

    def __init__(self, line1: str, line2: str, name: str = "SGP4-Propagator"):
        super().__init__(name=name)
        self.line1 = line1.strip()
        self.line2 = line2.strip()
        self.satrec = Satrec.twoline2rv(self.line1, self.line2, WGS72)

        # Epoch JD from TLE
        self.epoch_jd = self.satrec.jdsatepoch + self.satrec.jdsatepochF
        self.satnum = self.satrec.satnum
        self.bstar = self.satrec.bstar
        self.inclination_deg = np.degrees(self.satrec.inclo)

    def get_initial_state_eci(self) -> np.ndarray:
        """Evaluate satellite state at TLE epoch in J2000 ECI frame [m, m/s]."""
        e, r_teme_km, v_teme_kms = self.satrec.sgp4(
            self.satrec.jdsatepoch, self.satrec.jdsatepochF
        )
        if e != 0:
            raise RuntimeError(f"SGP4 propagation error at epoch: code {e}")

        r_teme_m = np.array(r_teme_km, dtype=np.float64) * 1000.0
        v_teme_ms = np.array(v_teme_kms, dtype=np.float64) * 1000.0

        r_eci, v_eci = teme_to_j2000(r_teme_m, v_teme_ms, self.epoch_jd)
        return np.concatenate([r_eci, v_eci])

    def propagate(
        self,
        t_span_seconds: float,
        dt_step: float,
        initial_epoch_jd: float = None,
        initial_state_eci: np.ndarray = None,
    ) -> Dict[str, Any]:
        """
        Propagate SGP4 orbit over duration t_span_seconds with step dt_step.
        """
        if initial_epoch_jd is None:
            initial_epoch_jd = self.epoch_jd

        times_s = np.arange(0.0, t_span_seconds + 0.5 * dt_step, dt_step)
        n_points = len(times_s)

        jds = np.zeros(n_points, dtype=np.float64)
        states_eci = np.zeros((n_points, 6), dtype=np.float64)
        states_ecef = np.zeros((n_points, 6), dtype=np.float64)
        geodetic = np.zeros((n_points, 3), dtype=np.float64)
        coes = []

        for i, t_sec in enumerate(times_s):
            current_jd = initial_epoch_jd + t_sec / SECONDS_PER_DAY
            jds[i] = current_jd

            # SGP4 expects integer jd and fractional jd
            jd_int = np.floor(current_jd)
            jd_frac = current_jd - jd_int

            err, r_teme_km, v_teme_kms = self.satrec.sgp4(jd_int, jd_frac)
            if err != 0:
                # If decay or error, keep previous or extrapolate
                if i > 0:
                    states_eci[i] = states_eci[i - 1]
                    states_ecef[i] = states_ecef[i - 1]
                    geodetic[i] = geodetic[i - 1]
                continue

            r_teme_m = np.array(r_teme_km, dtype=np.float64) * 1000.0
            v_teme_ms = np.array(v_teme_kms, dtype=np.float64) * 1000.0

            # Convert TEME to J2000 ECI
            r_eci, v_eci = teme_to_j2000(r_teme_m, v_teme_ms, current_jd)
            states_eci[i, 0:3] = r_eci
            states_eci[i, 3:6] = v_eci

            # Convert ECI to ECEF
            r_ecef, v_ecef = eci_to_ecef(r_eci, v_eci, current_jd)
            states_ecef[i, 0:3] = r_ecef
            states_ecef[i, 3:6] = v_ecef

            # Geodetic
            lat, lon, alt = ecef_to_geodetic(r_ecef)
            geodetic[i] = [lat, lon, alt]

            if i % max(1, n_points // 100) == 0 or i == n_points - 1:
                coes.append({"t_sec": float(t_sec), **rv_to_coe(r_eci, v_eci)})

        return {
            "name": self.name,
            "satnum": self.satnum,
            "epoch_jd": self.epoch_jd,
            "times_s": times_s,
            "jds": jds,
            "states_eci": states_eci,
            "states_ecef": states_ecef,
            "geodetic": geodetic,
            "coes": coes,
            "stats": {"method": "SGP4", "n_points": n_points},
        }
