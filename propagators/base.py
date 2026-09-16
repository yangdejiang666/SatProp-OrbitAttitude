"""
Abstract Base Class for Orbit Propagators
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any
import numpy as np


class BasePropagator(ABC):
    """
    Abstract interface for all orbital propagators (Analytical, Numerical, and Hybrid).
    """

    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    def propagate(
        self,
        t_span_seconds: float,
        dt_step: float,
        initial_epoch_jd: float,
        initial_state_eci: np.ndarray = None,
    ) -> Dict[str, Any]:
        """
        Propagate orbit over a given duration.

        Args:
            t_span_seconds: Duration of propagation in seconds.
            dt_step: Output time step in seconds.
            initial_epoch_jd: Initial epoch in Julian Date.
            initial_state_eci: Optional 6D Cartesian state [x,y,z, vx,vy,vz] in ECI J2000 [m, m/s].

        Returns:
            Dictionary containing:
                - times_s: array of time offsets (seconds)
                - jds: array of Julian Dates
                - states_eci: (N, 6) array [r_eci, v_eci]
                - states_ecef: (N, 6) array [r_ecef, v_ecef]
                - geodetic: (N, 3) array [lat_deg, lon_deg, alt_m]
                - metadata: dict of run statistics
        """
        pass
