"""
Trainer and Evaluation Suite for Orbital Residual Correction Models
Evaluates 1-sigma statistical distribution, RMSE, and error reduction ratio.
"""

import os
import time
from typing import Dict, Any, Tuple
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split
from ml.residual_dataset import OrbitResidualDataset
from ml.lstm_model import ResidualLSTM
from ml.transformer_model import ResidualTransformer


def train_residual_model(
    features: np.ndarray,
    targets: np.ndarray,
    model_type: str = "LSTM",
    epochs: int = 50,
    batch_size: int = 16,
    lr: float = 2e-3,
    save_path: str = None,
) -> Tuple[nn.Module, Dict[str, Any], Dict[str, np.ndarray]]:
    """
    Train an LSTM or Transformer model to predict RIC orbital residual errors.
    Returns:
        (trained_model, training_history, scalers)
    """
    dataset = OrbitResidualDataset(features, targets)
    scalers = {
        "feat_mean": dataset.feat_mean.numpy(),
        "feat_std": dataset.feat_std.numpy(),
        "target_mean": dataset.target_mean.numpy(),
        "target_std": dataset.target_std.numpy(),
    }

    val_size = max(1, int(len(dataset) * 0.2))
    train_size = len(dataset) - val_size
    train_set, val_set = random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(train_set, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_set, batch_size=batch_size, shuffle=False)

    input_dim = features.shape[-1]
    if model_type.upper() == "TRANSFORMER":
        model = ResidualTransformer(input_dim=input_dim, d_model=64, nhead=4, num_layers=2)
    else:
        model = ResidualLSTM(input_dim=input_dim, hidden_dim=64, num_layers=2)

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.MSELoss()

    history = {"train_loss": [], "val_loss": [], "elapsed_s": 0.0}
    start_time = time.perf_counter()

    best_val_loss = float("inf")
    best_state = None

    for epoch in range(epochs):
        model.train()
        train_loss = 0.0
        for x_b, y_b in train_loader:
            optimizer.zero_grad()
            pred = model(x_b)
            loss = criterion(pred, y_b)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_loss += loss.item() * len(x_b)

        scheduler.step()
        train_loss /= len(train_set)

        # Validation
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for x_b, y_b in val_loader:
                pred = model(x_b)
                loss = criterion(pred, y_b)
                val_loss += loss.item() * len(x_b)
        val_loss /= len(val_set)

        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

    history["elapsed_s"] = time.perf_counter() - start_time

    if best_state is not None:
        model.load_state_dict(best_state)

    if save_path:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        torch.save(
            {
                "model_type": model_type,
                "model_state": model.state_dict(),
                "scalers": scalers,
                "input_dim": input_dim,
            },
            save_path,
        )

    return model, history, scalers


def evaluate_residual_correction(
    model: nn.Module,
    features: np.ndarray,
    targets: np.ndarray,
    scalers: Dict[str, np.ndarray],
) -> Dict[str, Any]:
    """
    Compute rigorous statistical metrics (RMSE, MAE, 1-sigma standard deviation)
    comparing uncorrected residuals vs ML-corrected residual error.
    """
    model.eval()
    feat_norm = (features - scalers["feat_mean"]) / scalers["feat_std"]
    with torch.no_grad():
        x_tensor = torch.tensor(feat_norm, dtype=torch.float32)
        norm_pred = model(x_tensor).numpy()

    # Denormalize predictions back to physical units (meters and m/s)
    pred_ric = norm_pred * scalers["target_std"] + scalers["target_mean"]

    # targets: true residual [dr_R, dr_I, dr_C, dv_R, dv_I, dv_C]
    uncorrected_pos_err = np.linalg.norm(targets[:, 0:3], axis=1)
    uncorrected_vel_err = np.linalg.norm(targets[:, 3:6], axis=1)

    # Corrected residual is true_residual - predicted_residual
    corrected_residual = targets - pred_ric
    corrected_pos_err = np.linalg.norm(corrected_residual[:, 0:3], axis=1)
    corrected_vel_err = np.linalg.norm(corrected_residual[:, 3:6], axis=1)

    # Compute 1-sigma (68.27% percentile / standard deviation)
    sigma_uncorrected_pos = float(np.std(uncorrected_pos_err))
    sigma_corrected_pos = float(np.std(corrected_pos_err))

    # Error reduction percentage @ 1-sigma
    reduction_pos_pct = (
        (sigma_uncorrected_pos - sigma_corrected_pos) / (sigma_uncorrected_pos + 1e-12)
    ) * 100.0

    return {
        "uncorrected": {
            "pos_rmse_m": float(np.sqrt(np.mean(uncorrected_pos_err**2))),
            "pos_mae_m": float(np.mean(uncorrected_pos_err)),
            "pos_sigma_1_m": sigma_uncorrected_pos,
            "vel_rmse_ms": float(np.sqrt(np.mean(uncorrected_vel_err**2))),
            "vel_sigma_1_ms": float(np.std(uncorrected_vel_err)),
        },
        "corrected": {
            "pos_rmse_m": float(np.sqrt(np.mean(corrected_pos_err**2))),
            "pos_mae_m": float(np.mean(corrected_pos_err)),
            "pos_sigma_1_m": sigma_corrected_pos,
            "vel_rmse_ms": float(np.sqrt(np.mean(corrected_vel_err**2))),
            "vel_sigma_1_ms": float(np.std(corrected_vel_err)),
        },
        "reduction_pos_pct_1sigma": float(reduction_pos_pct),
        "target_achieved": bool(reduction_pos_pct >= 10.0),
        "sample_count": len(targets),
        "predicted_residuals": pred_ric,
        "corrected_residuals": corrected_residual,
    }
