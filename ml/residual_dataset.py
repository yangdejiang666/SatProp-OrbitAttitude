"""
Dataset Generator and Preprocessor for SGP4 Orbital Residual Learning
Constructs training and validation datasets by calculating RIC-frame residuals
between high-precision reference orbits (Cowell RKF78 / real ephemerides)
and analytical SGP4 predictions.
"""

from typing import Tuple, Dict, Any, List
import numpy as np
import torch
from torch.utils.data import Dataset
from core.coordinates import eci_to_ric_matrix


class OrbitResidualDataset(Dataset):
    """
    PyTorch Dataset for sequence-to-vector orbital residual prediction.
    Features and targets are normalized to zero-mean, unit-variance.
    """

    def __init__(
        self,
        features: np.ndarray,
        targets: np.ndarray,
        feat_mean: np.ndarray = None,
        feat_std: np.ndarray = None,
        target_mean: np.ndarray = None,
        target_std: np.ndarray = None,
    ):
        self.features = torch.tensor(features, dtype=torch.float32)
        self.raw_targets = torch.tensor(targets, dtype=torch.float32)

        if feat_mean is None:
            self.feat_mean = torch.mean(self.features, dim=(0, 1))
            self.feat_std = torch.std(self.features, dim=(0, 1)) + 1e-6
        else:
            self.feat_mean = torch.tensor(feat_mean, dtype=torch.float32).squeeze()
            self.feat_std = torch.tensor(feat_std, dtype=torch.float32).squeeze()

        if target_mean is None:
            self.target_mean = torch.mean(self.raw_targets, dim=0)
            self.target_std = torch.std(self.raw_targets, dim=0) + 1e-6
        else:
            self.target_mean = torch.tensor(target_mean, dtype=torch.float32).squeeze()
            self.target_std = torch.tensor(target_std, dtype=torch.float32).squeeze()

        # Normalize features and targets
        self.normalized_features = (self.features - self.feat_mean) / self.feat_std
        self.targets = (self.raw_targets - self.target_mean) / self.target_std

    def __len__(self) -> int:
        return len(self.features)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        return self.normalized_features[idx], self.targets[idx]


def build_residual_sequences(
    states_sgp4: np.ndarray,
    states_truth: np.ndarray,
    times_s: np.ndarray,
    seq_length: int = 15,
    pred_horizon: int = 1,
) -> Dict[str, Any]:
    """
    Compute RIC residuals and slice into sliding window sequences:
    Inputs: [seq_length, feature_dim]
    Targets: [target_dim] (dr_R, dr_I, dr_C, dv_R, dv_I, dv_C)
    """
    n_points = len(times_s)
    ric_residuals = np.zeros((n_points, 6), dtype=np.float64)

    for i in range(n_points):
        r_ref = states_sgp4[i, 0:3]
        v_ref = states_sgp4[i, 3:6]
        r_true = states_truth[i, 0:3]
        v_true = states_truth[i, 3:6]

        M_ric = eci_to_ric_matrix(r_ref, v_ref)
        dr_eci = r_true - r_ref
        dv_eci = v_true - v_ref

        ric_residuals[i, 0:3] = M_ric @ dr_eci
        ric_residuals[i, 3:6] = M_ric @ dv_eci

    # Feature vector at each step:
    # [dr_R, dr_I, dr_C, dv_R, dv_I, dv_C, r_norm_km, v_norm_kms, sin_phase, cos_phase]
    feature_dim = 10
    feature_matrix = np.zeros((n_points, feature_dim), dtype=np.float64)

    period_approx = 5400.0  # Typical LEO ~90 min period
    for i in range(n_points):
        r_norm_km = np.linalg.norm(states_sgp4[i, 0:3]) / 1000.0
        v_norm_kms = np.linalg.norm(states_sgp4[i, 3:6]) / 1000.0
        phase = 2.0 * np.pi * (times_s[i] % period_approx) / period_approx

        feature_matrix[i, 0:6] = ric_residuals[i]
        feature_matrix[i, 6] = r_norm_km
        feature_matrix[i, 7] = v_norm_kms
        feature_matrix[i, 8] = np.sin(phase)
        feature_matrix[i, 9] = np.cos(phase)

    # Build sequence windows
    X_list = []
    Y_list = []

    for i in range(n_points - seq_length - pred_horizon + 1):
        x_window = feature_matrix[i : i + seq_length]
        target_idx = i + seq_length + pred_horizon - 1
        y_target = ric_residuals[target_idx]  # 6-dim [dr_R, dr_I, dr_C, dv_R, dv_I, dv_C]

        X_list.append(x_window)
        Y_list.append(y_target)

    return {
        "features": np.array(X_list, dtype=np.float32),
        "targets": np.array(Y_list, dtype=np.float32),
        "raw_residuals": ric_residuals,
        "feature_matrix": feature_matrix,
    }
