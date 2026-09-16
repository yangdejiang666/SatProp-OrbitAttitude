"""
SatProp-OrbitAttitude: Standalone ML Residual Model Training CLI
===============================================================
"""

import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import argparse
import time
import json
import torch
import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from propagators.cowell_propagator import CowellPropagator
from propagators.sgp4_propagator import SGP4Propagator
from ml.residual_dataset import build_residual_sequences
from ml.trainer import train_residual_model, evaluate_residual_correction
from service.data_manager import SatelliteDataManager


def run_train_cli(sat_id="cartosat2", model_type="LSTM", hours=3.0, step=30.0, seq_len=12, epochs=45, batch_size=16, lr=2e-3, save_path=None):
    data_mgr = SatelliteDataManager()
    if sat_id not in data_mgr.satellites:
        sat_id = "cartosat2"

    sat_info = data_mgr.satellites[sat_id]
    sgp4_prop: SGP4Propagator = sat_info["propagator"]
    epoch_jd = sgp4_prop.epoch_jd
    y0_eci = sgp4_prop.get_initial_state_eci()

    print("=" * 80)
    print(f"🧠 SGP4 动力学残差深度学习训练平台 ({model_type})")
    print(f"🛰️  目标卫星: {sat_info['name']} | 训练弧长: {hours}h | 步长: {step}s | 滑动窗口: {seq_len}")
    print("=" * 80)

    t_span = hours * 3600.0
    sgp4_res = sgp4_prop.propagate(t_span, step, epoch_jd)
    times_s = sgp4_res["times_s"]
    states_sgp4 = sgp4_res["states_eci"]

    cowell_truth = CowellPropagator(integrator="RKF78", tol=1e-9)
    truth_res = cowell_truth.propagate(t_span, step, epoch_jd, initial_state_eci=y0_eci)
    states_truth = truth_res["states_eci"]

    dataset = build_residual_sequences(
        states_sgp4=states_sgp4,
        states_truth=states_truth,
        times_s=times_s,
        seq_length=seq_len,
    )
    features = dataset["features"]
    targets = dataset["targets"]

    if save_path is None:
        ckpt_dir = os.path.join(PROJECT_ROOT, "checkpoints")
        os.makedirs(ckpt_dir, exist_ok=True)
        save_path = os.path.join(ckpt_dir, f"{sat_id}_{model_type.lower()}_residual.pt")

    t0 = time.perf_counter()
    model, history, scalers = train_residual_model(
        features=features,
        targets=targets,
        model_type=model_type,
        epochs=epochs,
        batch_size=batch_size,
        lr=lr,
        save_path=save_path,
    )
    train_time = time.perf_counter() - t0
    eval_res = evaluate_residual_correction(model, features, targets, scalers)

    print("\n" + "=" * 80)
    print("📈 模型验证评估结果 (对标 1h 预测误差 10% @ 1σ 目标):")
    print(f"   🔴 未校正 SGP4 1σ 绝对位置误差:   {eval_res['uncorrected']['pos_sigma_1_m']:10.2f} m")
    print(f"   🟢 混合矫正后 1σ 绝对位置误差:    {eval_res['corrected']['pos_sigma_1_m']:10.2f} m")
    print(f"   🚀 1σ 误差降低率 (Improvement):    {eval_res['reduction_pos_pct_1sigma']:10.2f} %")
    print(f"   🎯 达标状态 (目标 ≥10%):           {'✅ 达标' if eval_res['target_achieved'] else '❌ 未达标'}")
    print(f"   💾 模型检查点已保存至:             {save_path}")
    print("=" * 80 + "\n")
    return eval_res


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train ML Residual Model")
    parser.add_argument("--sat", type=str, default="cartosat2")
    parser.add_argument("--model", type=str, default="LSTM", choices=["LSTM", "TRANSFORMER"])
    parser.add_argument("--hours", type=float, default=3.0)
    parser.add_argument("--step", type=float, default=30.0)
    parser.add_argument("--seq_len", type=int, default=12)
    parser.add_argument("--epochs", type=int, default=45)
    parser.add_argument("--batch_size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-3)
    parser.add_argument("--save", type=str, default=None)
    args = parser.parse_args()
    run_train_cli(
        sat_id=args.sat,
        model_type=args.model,
        hours=args.hours,
        step=args.step,
        seq_len=args.seq_len,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        save_path=args.save,
    )
