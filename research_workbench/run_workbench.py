"""
Research Workbench Command-Line Cross-Verification Launcher
===========================================================
Usage:
    py -3 research_workbench/run_workbench.py --sat tiangong --hours 1.5
"""

import os
import sys
import argparse
import json
from datetime import datetime, timezone

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from service.data_manager import SatelliteDataManager
from research_workbench.verification_engine import get_verification_engine
from research_workbench.czml_exporter import generate_mission_czml
from research_workbench.gmat_bridge import generate_gmat_script


def run_benchmark(sat_id: str = "tiangong", duration_hours: float = 1.5, step_s: float = 60.0):
    print("=" * 70)
    print(f"🚀 启动航天科研级交叉核验系统 (Research-Grade Astrodynamics Audit)")
    print(f"🛰️ 目标卫星: {sat_id.upper()} | 推演时长: {duration_hours}h | 积分步长: {step_s}s")
    print("=" * 70)

    dm = SatelliteDataManager()
    if sat_id not in dm.satellites:
        print(f"❌ 错误: 卫星 {sat_id} 不在数据库中")
        return

    sat_entry = dm.satellites[sat_id]
    prop = sat_entry["propagator"]

    from core.time_systems import jd_to_datetime

    duration_s = duration_hours * 3600.0
    start_utc = jd_to_datetime(prop.epoch_jd)

    # 1. Generate Model Trajectory (Cowell RKF78)
    print("\n[1/4] 正在运行自研高精多摄动动力学模型 (Cowell RKF78)...")
    res_model = prop.propagate(t_span_seconds=duration_s, dt_step=step_s)
    times_s = res_model["times_s"].tolist() if hasattr(res_model["times_s"], "tolist") else list(res_model["times_s"])
    states_model = res_model["states_eci"].tolist() if hasattr(res_model["states_eci"], "tolist") else list(res_model["states_eci"])
    print(f"      生成推演点数: {len(times_s)} 个")

    # 2. Authoritative Verification against USNO Skyfield / Astropy
    print("\n[2/4] 正在连接 USNO / Skyfield IAU-2006 GCRS 权威科研基准...")
    engine = get_verification_engine()
    audit_report = engine.verify_orbit_model(
        line1=sat_entry["line1"],
        line2=sat_entry["line2"],
        sat_id=sat_id,
        start_utc=start_utc,
        times_s=times_s,
        model_states_eci=states_model,
        model_name="SatProp-Cowell/RKF78"
    )

    m = audit_report["metrics"]
    e = audit_report["evaluation"]
    print(f"      ✅ 权威核验完成!")
    print(f"      - 空间位置绝对 RMS 偏差: {m['rms_position_m']:.2f} 米")
    print(f"      - 径向偏差 (Radial ΔR): {m['radial_rms_m']:.2f} 米")
    print(f"      - 沿轨偏差 (In-Track ΔI): {m['in_track_rms_m']:.2f} 米")
    print(f"      - 法向偏差 (Cross-Track ΔC): {m['cross_track_rms_m']:.2f} 米")
    print(f"      - 3-σ 空间误差包络: {m['sigma3_position_m']:.2f} 米")
    print(f"      - 权威模型科学符合率: {e['scientific_parity_pct']:.2f}%")
    print(f"      - 综合科研评级: {e['conformity_grade']}")

    # 3. Export AGI STK / Cesium CZML
    print("\n[3/4] 正在生成 AGI STK / Cesium 4D 动态任务可视化包 (CZML)...")
    czml_str = generate_mission_czml(
        sat_id=sat_id,
        sat_name=sat_entry["name"],
        start_time_iso=start_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        times_s=times_s,
        model_states_eci=states_model,
        auth_states_eci=audit_report["authoritative_states_eci"],
        period_s=5500.0,
    )
    czml_path = os.path.join(os.path.dirname(__file__), "cesium_station", f"{sat_id}_mission.czml")
    with open(czml_path, "w", encoding="utf-8") as f:
        f.write(czml_str)
    print(f"      已保存 CZML: {czml_path} ({len(czml_str)} 字节)")

    # 4. Generate NASA GMAT Script
    print("\n[4/4] 正在生成 NASA GMAT 任务定义与多摄动审计脚本 (.script)...")
    gmat_script = generate_gmat_script(
        sat_name=sat_id.upper(),
        epoch_str=start_utc.strftime("%d %b %Y %H:%M:%S.000"),
        state_eci=states_model[0],
        duration_days=duration_hours / 24.0,
        step_size_s=step_s,
    )
    gmat_path = os.path.join(os.path.dirname(__file__), f"nasa_gmat_{sat_id}_verification.script")
    with open(gmat_path, "w", encoding="utf-8") as f:
        f.write(gmat_script)
    print(f"      已保存 GMAT 脚本: {gmat_path} ({len(gmat_script.splitlines())} 行)")

    print("\n" + "=" * 70)
    print("🎯 科研级核验与复现系统就绪!")
    print(f"🌐 可视化平台地址: http://127.0.0.1:8080/research/")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SatProp Research Workbench Audit")
    parser.add_argument("--sat", type=str, default="tiangong", help="Satellite ID")
    parser.add_argument("--hours", type=float, default=1.5, help="Propagation duration in hours")
    parser.add_argument("--step", type=float, default=60.0, help="Step in seconds")
    args = parser.parse_args()

    run_benchmark(sat_id=args.sat, duration_hours=args.hours, step_s=args.step)
