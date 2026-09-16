"""
Cowell Numerical Orbit Propagator
Solves orbital motion differential equations directly in Cartesian coordinates
with arbitrary combination of perturbation forces (J2/J3/J4, Drag, Third-Body, SRP).
Supports RK4, RKF78, and ABM4 integrators.
Reference: Cowell & Crommelin (1910); Montenbruck & Gill (2000).
"""

from typing import Dict, Any, Optional
import numpy as np
from core.constants import SECONDS_PER_DAY
from core.coordinates import eci_to_ecef, ecef_to_geodetic
from core.kepler import rv_to_coe
from core.perturbations import total_perturbation_acceleration
from propagators.base import BasePropagator
from propagators.integrators import (
    integrate_rk4,
    integrate_rkf78,
    integrate_abm4,
    NumericalIntegratorResult,
)


class CowellPropagator(BasePropagator):
    """
    Cowell Numerical Orbit Propagator with full perturbation support.
    """

    def __init__(
        self,
        name: str = "Cowell-Propagator",
        integrator: str = "RKF78",
        use_j2: bool = True,
        use_j3: bool = True,
        use_j4: bool = True,
        use_drag: bool = True,
        use_sun: bool = True,
        use_moon: bool = True,
        use_srp: bool = True,
        cd: float = 2.2,
        cr: float = 1.8,
        area_m2: float = 2.0,
        mass_kg: float = 500.0,
        tol: float = 1e-9,
    ):
        super().__init__(name=name)
        self.integrator = integrator.upper()
        self.use_j2 = use_j2
        self.use_j3 = use_j3
        self.use_j4 = use_j4
        self.use_drag = use_drag
        self.use_sun = use_sun
        self.use_moon = use_moon
        self.use_srp = use_srp
        self.cd = cd
        self.cr = cr
        self.area_m2 = area_m2
        self.mass_kg = mass_kg
        self.tol = tol

    def _dynamics_rhs(self, t_sec: float, y: np.ndarray, epoch_jd: float) -> np.ndarray:
        """
        Right-hand side ODE derivative dy/dt = [v; a_total].
        """
        r_eci = y[0:3]
        v_eci = y[3:6]
        current_jd = epoch_jd + t_sec / SECONDS_PER_DAY

        a_total = total_perturbation_acceleration(
            r_eci=r_eci,
            v_eci=v_eci,
            jd=current_jd,
            use_j2=self.use_j2,
            use_j3=self.use_j3,
            use_j4=self.use_j4,
            use_drag=self.use_drag,
            use_sun=self.use_sun,
            use_moon=self.use_moon,
            use_srp=self.use_srp,
            cd=self.cd,
            cr=self.cr,
            area_m2=self.area_m2,
            mass_kg=self.mass_kg,
        )

        return np.concatenate([v_eci, a_total])

    def propagate(
        self,
        t_span_seconds: float,
        dt_step: float,
        initial_epoch_jd: float,
        initial_state_eci: np.ndarray = None,
    ) -> Dict[str, Any]:
        """
        Propagate orbit using Cowell's method and chosen numerical integrator.
        """
        if initial_state_eci is None:
            raise ValueError("CowellPropagator requires an initial Cartesian state [r, v].")

        y0 = np.array(initial_state_eci, dtype=np.float64)
        t_span = (0.0, float(t_span_seconds))

        rhs = lambda t, y: self._dynamics_rhs(t, y, initial_epoch_jd)

        if self.integrator == "RK4":
            res: NumericalIntegratorResult = integrate_rk4(rhs, t_span, y0, dt=dt_step)
        elif self.integrator == "RKF78":
            t_eval = np.arange(0.0, t_span_seconds + 0.5 * dt_step, dt_step)
            res = integrate_rkf78(rhs, t_span, y0, tol=self.tol, t_eval=t_eval)
        elif self.integrator == "ABM4":
            res = integrate_abm4(rhs, t_span, y0, dt=dt_step)
        else:
            raise ValueError(f"Unsupported integrator: {self.integrator}")

        times_s = res.t
        states_eci = res.y
        n_points = len(times_s)

        jds = np.zeros(n_points, dtype=np.float64)
        states_ecef = np.zeros((n_points, 6), dtype=np.float64)
        geodetic = np.zeros((n_points, 3), dtype=np.float64)
        coes = []

        for i in range(n_points):
            t_sec = times_s[i]
            jd_curr = initial_epoch_jd + t_sec / SECONDS_PER_DAY
            jds[i] = jd_curr

            r_eci = states_eci[i, 0:3]
            v_eci = states_eci[i, 3:6]

            # Coordinate conversions
            r_ecef, v_ecef = eci_to_ecef(r_eci, v_eci, jd_curr)
            states_ecef[i, 0:3] = r_ecef
            states_ecef[i, 3:6] = v_ecef

            lat, lon, alt = ecef_to_geodetic(r_ecef)
            geodetic[i] = [lat, lon, alt]

            # Compute osculating orbital elements periodically
            if i % max(1, n_points // 100) == 0 or i == n_points - 1:
                coes.append({"t_sec": float(t_sec), **rv_to_coe(r_eci, v_eci)})

        return {
            "name": self.name,
            "integrator": self.integrator,
            "times_s": times_s,
            "jds": jds,
            "states_eci": states_eci,
            "states_ecef": states_ecef,
            "geodetic": geodetic,
            "coes": coes,
            "stats": res.stats,
        }
