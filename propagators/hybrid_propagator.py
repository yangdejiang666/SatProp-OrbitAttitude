"""
Hybrid Orbit Propagator (Physical SGP4 Analytical Baseline + Deep Residual Corrector)
Combines computational speed of analytical SGP4 with accuracy of deep learning residual estimation.
"""

from typing import Dict, Any, Optional
import numpy as np
import torch
import torch.nn as nn
from core.constants import SECONDS_PER_DAY
from core.coordinates import eci_to_ecef, ecef_to_geodetic, eci_to_ric_matrix
from core.kepler import rv_to_coe
from propagators.base import BasePropagator
from propagators.sgp4_propagator import SGP4Propagator


class HybridOrbitPropagator(BasePropagator):
    """
    Hybrid Physics-Informed + Machine Learning Orbit Propagator.
    """

    def __init__(
        self,
        sgp4_prop: SGP4Propagator,
        ml_model: nn.Module,
        scalers: Dict[str, np.ndarray],
        seq_length: int = 12,
        name: str = "Hybrid-SGP4+ML-Propagator",
    ):
        super().__init__(name=name)
        self.sgp4_prop = sgp4_prop
        self.ml_model = ml_model
        self.scalers = scalers
        self.seq_length = seq_length
        self.ml_model.eval()

    def propagate(
        self,
        t_span_seconds: float,
        dt_step: float,
        initial_epoch_jd: float = None,
        initial_state_eci: np.ndarray = None,
    ) -> Dict[str, Any]:
        """
        Propagate orbit using hybrid analytical SGP4 + ML residual correction.
        """
        # Step 1: Run baseline SGP4 propagation
        base_res = self.sgp4_prop.propagate(t_span_seconds, dt_step, initial_epoch_jd)
        times_s = base_res["times_s"]
        jds = base_res["jds"]
        sgp4_eci = base_res["states_eci"]
        n_points = len(times_s)

        states_eci = sgp4_eci.copy()
        states_ecef = np.zeros_like(base_res["states_ecef"])
        geodetic = np.zeros_like(base_res["geodetic"])
        predicted_ric_residuals = np.zeros((n_points, 6), dtype=np.float64)

        # Build rolling feature buffer
        period_approx = 5400.0
        rolling_features = []

        feat_mean = self.scalers["feat_mean"]
        feat_std = self.scalers["feat_std"]
        target_mean = self.scalers["target_mean"]
        target_std = self.scalers["target_std"]

        with torch.no_grad():
            for i in range(n_points):
                t_sec = times_s[i]
                jd_curr = jds[i]

                r_sgp4 = sgp4_eci[i, 0:3]
                v_sgp4 = sgp4_eci[i, 3:6]
                r_norm_km = np.linalg.norm(r_sgp4) / 1000.0
                v_norm_kms = np.linalg.norm(v_sgp4) / 1000.0
                phase = 2.0 * np.pi * (t_sec % period_approx) / period_approx

                last_ric = (
                    predicted_ric_residuals[i - 1]
                    if i > 0
                    else np.zeros(6, dtype=np.float64)
                )

                step_feat = np.array([
                    last_ric[0],
                    last_ric[1],
                    last_ric[2],
                    last_ric[3],
                    last_ric[4],
                    last_ric[5],
                    r_norm_km,
                    v_norm_kms,
                    np.sin(phase),
                    np.cos(phase),
                ], dtype=np.float32)

                rolling_features.append(step_feat)
                if len(rolling_features) > self.seq_length:
                    rolling_features.pop(0)

                # Predict residual if window is full
                if len(rolling_features) == self.seq_length:
                    window = np.array(rolling_features, dtype=np.float32)
                    window_norm = (window - feat_mean.reshape(1, -1)) / feat_std.reshape(1, -1)
                    x_tensor = torch.tensor(window_norm, dtype=torch.float32)
                    if x_tensor.ndim == 2:
                        x_tensor = x_tensor.unsqueeze(0)
                    norm_pred = self.ml_model(x_tensor).detach().numpy()[0]
                    pred_ric = norm_pred * target_std.flatten() + target_mean.flatten()
                    predicted_ric_residuals[i] = pred_ric

                    # Transform RIC residual back to ECI
                    M_ric = eci_to_ric_matrix(r_sgp4, v_sgp4)
                    M_ric_inv = M_ric.T

                    dr_eci = M_ric_inv @ pred_ric[0:3]
                    dv_eci = M_ric_inv @ pred_ric[3:6]

                    # Add ML residual to SGP4 baseline
                    states_eci[i, 0:3] = r_sgp4 + dr_eci
                    states_eci[i, 3:6] = v_sgp4 + dv_eci
                else:
                    # In warm-up phase, default to baseline
                    states_eci[i] = sgp4_eci[i]

                # Update ECEF and Geodetic
                r_eci = states_eci[i, 0:3]
                v_eci = states_eci[i, 3:6]
                r_ecef, v_ecef = eci_to_ecef(r_eci, v_eci, jd_curr)
                states_ecef[i, 0:3] = r_ecef
                states_ecef[i, 3:6] = v_ecef

                lat, lon, alt = ecef_to_geodetic(r_ecef)
                geodetic[i] = [lat, lon, alt]

        # Smoothly back-fill warm-up phase (first seq_length steps) with initial predicted trend
        if n_points > self.seq_length and np.any(predicted_ric_residuals[self.seq_length]):
            first_ric = predicted_ric_residuals[self.seq_length]
            for i in range(self.seq_length):
                factor = (i + 1) / float(self.seq_length)
                ric_fill = first_ric * factor
                predicted_ric_residuals[i] = ric_fill
                M_ric = eci_to_ric_matrix(sgp4_eci[i, 0:3], sgp4_eci[i, 3:6])
                dr_eci = M_ric.T @ ric_fill[0:3]
                dv_eci = M_ric.T @ ric_fill[3:6]
                states_eci[i, 0:3] = sgp4_eci[i, 0:3] + dr_eci
                states_eci[i, 3:6] = sgp4_eci[i, 3:6] + dv_eci
                r_ecef, v_ecef = eci_to_ecef(states_eci[i, 0:3], states_eci[i, 3:6], jds[i])
                states_ecef[i, 0:3] = r_ecef
                states_ecef[i, 3:6] = v_ecef
                lat, lon, alt = ecef_to_geodetic(r_ecef)
                geodetic[i] = [lat, lon, alt]

        coes = []
        for i in range(0, n_points, max(1, n_points // 100)):
            coes.append({
                "t_sec": float(times_s[i]),
                **rv_to_coe(states_eci[i, 0:3], states_eci[i, 3:6]),
            })

        return {
            "name": self.name,
            "times_s": times_s,
            "jds": jds,
            "states_eci": states_eci,
            "states_ecef": states_ecef,
            "geodetic": geodetic,
            "coes": coes,
            "predicted_ric_residuals": predicted_ric_residuals,
            "baseline_sgp4_eci": sgp4_eci,
            "stats": {"method": "Hybrid-SGP4+ML", "n_points": n_points},
        }
