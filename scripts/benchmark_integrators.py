"""
SatProp-OrbitAttitude: Numerical Integrators Benchmark CLI
=========================================================
Compares Runge-Kutta 4th Order (RK4), Runge-Kutta-Fehlberg 7(8) (RKF78),
and Adams-Bashforth-Moulton (ABM4) Predictor-Corrector against SGP4.
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
import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from propagators.cowell_propagator import CowellPropagator
from propagators.sgp4_propagator import SGP4Propagator
from analysis.benchmark import run_integrator_benchmark
from service.data_manager import SatelliteDataManager


def run_benchmark_cli(sat_id="cartosat2", hours=6.0, step=30.0, out_path=None):
    data_mgr = SatelliteDataManager()
    if sat_id not in data_mgr.satellites:
        sat_id = "cartosat2"

    sat_info = data_mgr.satellites[sat_id]
    sgp4_prop: SGP4Propagator = sat_info["propagator"]
    y0_eci = sgp4_prop.get_initial_state_eci()
    epoch_jd = sgp4_prop.epoch_jd

    print("=" * 85)
    print(f"🔬 数值积分器高精度性能基准测评 (RK4 vs RKF78 vs ABM4)")
    print(f"🛰️  目标卫星: {sat_info['name']} | 仿真弧长: {hours} 小时 | 步长: {step} 秒")
    print("=" * 85)

    results = run_integrator_benchmark(
        initial_state_eci=y0_eci,
        epoch_jd=epoch_jd,
        arc_duration_hours=hours,
        dt_step=step,
    )

    print("\n" + "=" * 85)
    print(f"{'积分算法名称':<26} | {'耗时(ms)':<10} | {'力评估次数':<10} | {'RMSE位置误差(m)':<16} | {'最大能量偏差':<14}")
    print("-" * 85)

    for label, m_data in results["methods"].items():
        elapsed_ms = m_data["elapsed_s"] * 1000.0
        n_evals = m_data["n_evals"]
        rmse_err = m_data["rmse_pos_error_m"]
        max_energy = m_data["max_energy_error"]
        print(f"{label:<26} | {elapsed_ms:<10.2f} | {n_evals:<10} | {rmse_err:<16.2f} | {max_energy:<14.2e}")

    print("=" * 85)

    if out_path is None:
        out_path = os.path.join(PROJECT_ROOT, "data", "results", "benchmark_results.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"💾 详细基准测试数据已导出至: {out_path}\n")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Numerical Integrator Benchmark")
    parser.add_argument("--sat", type=str, default="cartosat2")
    parser.add_argument("--hours", type=float, default=6.0)
    parser.add_argument("--step", type=float, default=30.0)
    parser.add_argument("--out", type=str, default=None)
    args = parser.parse_args()
    run_benchmark_cli(sat_id=args.sat, hours=args.hours, step=args.step, out_path=args.out)
