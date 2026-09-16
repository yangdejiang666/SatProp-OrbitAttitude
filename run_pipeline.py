"""
SatProp-OrbitAttitude: End-to-End Mission Pipeline Launcher
==========================================================
Executes the full orbit prediction, ML residual learning, attitude simulation,
and mission analysis pipeline in a single unified script:

1. Real TLE Ingestion (CartoSat-2 / ISS / Custom)
2. SGP4 Analytical Baseline Propagation
3. High-Precision Cowell Numerical Propagation (RKF78 / RK4 / ABM4)
4. RTN Residual Dataset Generation & ML Training (LSTM / Transformer)
5. Physics + ML Hybrid Ephemeris Fusion & 1-Hour 1-sigma Error Evaluation
6. Ground Station Visibility Pass Prediction (AOS/LOS/Az/El)
7. Constellation Inter-Satellite Link (ISL) Line-of-Sight Topology
8. Satellite 3-Axis Attitude Quaternion Propagation (Nadir / Sun-Tracking)
9. 3D CZML Digital Twin Data Generation for CesiumJS WebGL Platform
"""

import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import time
import argparse
import json
from datetime import datetime, timezone
import numpy as np

# Ensure root directory is on sys.path
PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from core.constants import MU_EARTH, R_EARTH
from core.time_systems import datetime_to_jd, jd_to_datetime
from core.coordinates import eci_to_ecef, ecef_to_geodetic, compute_ric_errors
from core.kepler import rv_to_coe
from propagators.sgp4_propagator import SGP4Propagator
from propagators.cowell_propagator import CowellPropagator
from propagators.hybrid_propagator import HybridOrbitPropagator
from ml.residual_dataset import build_residual_sequences
from ml.trainer import train_residual_model, evaluate_residual_correction
from analysis.visibility import compute_all_station_windows, DEFAULT_GROUND_STATIONS
from analysis.isl_topology import analyze_constellation_isl_topology
from attitude.dynamics import AttitudeSimulator
from attitude.quaternions import quat_to_euler
from service.data_manager import SatelliteDataManager


def run_complete_pipeline(
    sat_id: str = "cartosat2",
    duration_hours: float = 2.0,
    dt_step: float = 30.0,
    model_type: str = "LSTM",
    epochs: int = 40,
    output_json: str = "pipeline_result.json",
):
    print("=" * 80)
    print("🛰️  SATPROP-ORBITATTITUDE: 轨道预测与星历计算全流程运行脚本")
    print(f"📌 任务配置: 卫星={sat_id.upper()} | 推演时长={duration_hours}h | 积分步长={dt_step}s | 模型={model_type}")
    print("=" * 80)

    # 1. 载入卫星数据
    data_mgr = SatelliteDataManager()
    if sat_id not in data_mgr.satellites:
        print(f"⚠️ 卫星 {sat_id} 未在预定义库中找到，默认切换为 cartosat2")
        sat_id = "cartosat2"

    sat_info = data_mgr.satellites[sat_id]
    sgp4_prop: SGP4Propagator = sat_info["propagator"]
    epoch_jd = sgp4_prop.epoch_jd
    y0_eci = sgp4_prop.get_initial_state_eci()
    r0_norm = np.linalg.norm(y0_eci[0:3]) / 1000.0
    v0_norm = np.linalg.norm(y0_eci[3:6]) / 1000.0

    print(f"\n[1/7] 🛰️ 卫星历元参数载入完成:")
    print(f"      - 卫星名称: {sat_info['name']} (NORAD: {sat_info['satnum']})")
    print(f"      - 历元时间: {sat_info['epoch_utc']}")
    print(f"      - 初始地心距: {r0_norm:.2f} km (轨道高度: {r0_norm - R_EARTH/1000:.2f} km)")
    print(f"      - 初始运行速度: {v0_norm:.3f} km/s")
    print(f"      - 轨道倾角: {sat_info['inclination_deg']:.2f}° | BSTAR: {sat_info['bstar']:.4e}")

    # 2. SGP4 解析外推基准
    t_span = duration_hours * 3600.0
    print(f"\n[2/7] ⚙️  执行 SGP4 解析外推...")
    t0 = time.perf_counter()
    sgp4_res = sgp4_prop.propagate(t_span, dt_step, epoch_jd)
    sgp4_time = time.perf_counter() - t0
    times_s = sgp4_res["times_s"]
    states_sgp4 = sgp4_res["states_eci"]
    print(f"      ✓ SGP4 完成, 计算耗时: {sgp4_time*1000:.2f} ms, 生成点数: {len(times_s)}")

    # 3. Cowell 高精度数值外推 (RKF78 作为高保真基准 Truth)
    print(f"\n[3/7] 🌌 执行 Cowell 高精数值积分 (J2-J4 + 大气阻力 + 日月引力 + 太阳光压)...")
    cowell_rkf78 = CowellPropagator(
        integrator="RKF78",
        tol=1e-9,
        use_j2=True,
        use_j3=True,
        use_j4=True,
        use_drag=True,
        use_sun=True,
        use_moon=True,
        use_srp=True,
    )
    t0 = time.perf_counter()
    truth_res = cowell_rkf78.propagate(t_span, dt_step, epoch_jd, initial_state_eci=y0_eci)
    rkf78_time = time.perf_counter() - t0
    states_truth = truth_res["states_eci"]
    print(f"      ✓ Cowell RKF78 高精基准完成, 耗时: {rkf78_time*1000:.2f} ms, RHS评估次数: {truth_res['stats']['n_evals']}")

    # 4. 构建 RTN 坐标系残差时序数据集并训练神经网络
    print(f"\n[4/7] 🧠 构建 RTN 解耦残差序列并训练 {model_type} 深度学习模型...")
    dataset_dict = build_residual_sequences(
        states_sgp4=states_sgp4,
        states_truth=states_truth,
        times_s=times_s,
        seq_length=12,
    )
    features = dataset_dict["features"]
    targets = dataset_dict["targets"]
    print(f"      - 样本切片数: {len(features)}, 特征维度: {features.shape[1:]}, 目标维度: {targets.shape[1:]}")

    t0 = time.perf_counter()
    model, history, scalers = train_residual_model(
        features=features,
        targets=targets,
        model_type=model_type,
        epochs=epochs,
        batch_size=16,
        lr=2e-3,
    )
    train_time = time.perf_counter() - t0
    print(f"      ✓ 模型训练完成, 耗时: {train_time:.2f}s, 最终训练损失 Loss: {history['train_loss'][-1]:.6f}, 验证损失: {history['val_loss'][-1]:.6f}")

    # 5. 混合外推融合与误差指标核验 (1h 预测误差 10% @ 1sigma)
    print(f"\n[5/7] 📊 评估物理+ML混合预测器精度指标 (对照 1h 10%@1σ 目标)...")
    eval_res = evaluate_residual_correction(model, features, targets, scalers)
    uncorrected_1sigma = eval_res["uncorrected"]["pos_sigma_1_m"]
    corrected_1sigma = eval_res["corrected"]["pos_sigma_1_m"]
    reduction_pct = eval_res["reduction_pos_pct_1sigma"]
    target_met = eval_res["target_achieved"]

    print(f"      ========================================================")
    print(f"      🔴 原始 SGP4 位置误差 (1σ):     {uncorrected_1sigma:10.2f} m")
    print(f"      🟢 混合矫正后位置误差 (1σ):     {corrected_1sigma:10.2f} m")
    print(f"      🚀 1σ 误差降低率:              {reduction_pct:10.2f} %")
    print(f"      🎯 目标达成情况 (≥10% @ 1σ):   {'✅ 达标' if target_met else '❌ 未达标'}")
    print(f"      ========================================================")

    # 6. 地面站可见性与星间链路计算
    print(f"\n[6/7] 📡 计算地面站可见性窗口与星间链路拓扑...")
    jds = epoch_jd + times_s / 86400.0
    states_ecef = np.zeros_like(states_truth)
    for i in range(len(times_s)):
        r_ecef, v_ecef = eci_to_ecef(states_truth[i, 0:3], states_truth[i, 3:6], jds[i])
        states_ecef[i, 0:3] = r_ecef
        states_ecef[i, 3:6] = v_ecef

    station_results = compute_all_station_windows(states_ecef, times_s, jds)
    for res_st in station_results:
        st_info = res_st["station"]
        p_count = res_st["pass_count"]
        print(f"      - 地面站 [{st_info['name']}]: 捕捉到 {p_count} 次过境窗口, 总跟踪时长: {res_st['total_contact_time_sec']:.1f}s")
        for p in res_st["passes"][:2]:
            print(f"        * 历元: {p['aos_utc']} ~ {p['los_utc']} | 持续: {p['duration_sec']:.1f}s | 最大仰角: {p['max_el_deg']:.2f}°")

    # 星间链路分析
    constellation_trajectories = [
        {"name": sat_id.upper(), "states_eci": states_truth},
        {"name": f"{sat_id.upper()}_PARTNER", "states_eci": states_truth + np.array([50000.0, 20000.0, 10000.0, 0.0, 0.0, 0.0])}
    ]

    isl_res = analyze_constellation_isl_topology(
        constellation_trajectories,
        time_idx=0,
        max_range_m=5000000.0
    )
    print(f"      ✓ 星间链路计算完成: 监测节点数={isl_res['n_satellites']}, 活跃链路数={isl_res['total_active_links']}")
    for link in isl_res["active_links"]:
        print(f"        * 链路 [{link['sat1_name']} <--> {link['sat2_name']}]: 距离={link['distance_km']:.1f} km, 视线净空高={link['clearance_alt_km']:.1f} km, 多普勒频移={link['doppler_shift_khz']:.2f} kHz")

    # 7. 卫星姿态动力学与四元数推演
    print(f"\n[7/7] 🛰️ 仿真卫星姿态动力学 (对地定向 Nadir-Pointing 模式)...")
    att_sim = AttitudeSimulator()
    att_res = att_sim.propagate_attitude(times_s, states_truth, mode="NADIR")
    quats = att_res["quaternions"]
    eulers = att_res["euler_angles_deg"]
    print(f"      ✓ 姿态四元数序列生成完成, 步数={len(quats)}, 初始姿态四元数: q0={np.round(quats[0], 4)}")

    # 汇总输出
    results_summary = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "mission_parameters": {
            "satellite_id": sat_id,
            "duration_hours": duration_hours,
            "dt_step": dt_step,
            "model_type": model_type,
        },
        "performance_benchmark": {
            "sgp4_time_ms": sgp4_time * 1000,
            "cowell_rkf78_time_ms": rkf78_time * 1000,
            "ml_training_time_s": train_time,
        },
        "error_evaluation": {
            "uncorrected_sgp4_pos_1sigma_m": uncorrected_1sigma,
            "corrected_hybrid_pos_1sigma_m": corrected_1sigma,
            "error_reduction_pct_1sigma": reduction_pct,
            "target_achieved": target_met,
        },
        "ground_station_passes_count": {st["station"]["name"]: st["pass_count"] for st in station_results},
        "active_isl_links_count": isl_res["total_active_links"],
    }

    out_path = os.path.join(PROJECT_ROOT, output_json)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results_summary, f, indent=2, ensure_ascii=False)

    print(f"\n💾 完整测试报告已保存至: {out_path}")
    print("=" * 80)
    print("🎉 轨道动力学预测与姿态推演全流程成功完成！")
    print("=" * 80)
    return results_summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SatProp-OrbitAttitude: End-to-End Pipeline Launcher")
    parser.add_argument("--sat", type=str, default="cartosat2", help="Satellite ID (e.g., cartosat2, iss, tiangong)")
    parser.add_argument("--hours", type=float, default=2.0, help="Propagation duration in hours")
    parser.add_argument("--step", type=float, default=30.0, help="Time step in seconds")
    parser.add_argument("--model", type=str, default="LSTM", choices=["LSTM", "TRANSFORMER"], help="ML model type")
    parser.add_argument("--epochs", type=int, default=35, help="Number of training epochs")
    parser.add_argument("--output", type=str, default="pipeline_result.json", help="Output summary JSON file")
    args = parser.parse_args()

    run_complete_pipeline(
        sat_id=args.sat,
        duration_hours=args.hours,
        dt_step=args.step,
        model_type=args.model,
        epochs=args.epochs,
        output_json=args.output,
    )
