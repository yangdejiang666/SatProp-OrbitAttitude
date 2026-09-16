"""
SatProp-OrbitAttitude: Spacecraft Attitude Dynamics Simulator CLI
=================================================================
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
import json
import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from propagators.sgp4_propagator import SGP4Propagator
from attitude.dynamics import AttitudeSimulator
from service.data_manager import SatelliteDataManager


def run_attitude_cli(sat_id="cartosat2", mode="NADIR", hours=1.5, step=10.0, out_path=None):
    data_mgr = SatelliteDataManager()
    if sat_id not in data_mgr.satellites:
        sat_id = "cartosat2"

    sat_info = data_mgr.satellites[sat_id]
    sgp4_prop: SGP4Propagator = sat_info["propagator"]
    epoch_jd = sgp4_prop.epoch_jd

    print("=" * 80)
    print(f"🛰️  卫星三轴姿态动力学与控制律仿真器 ({mode} 模式)")
    print(f"📡 目标星体: {sat_info['name']} | 仿真时长: {hours}h | 积分步长: {step}s")
    print("=" * 80)

    t_span = hours * 3600.0
    res_orbit = sgp4_prop.propagate(t_span, step, epoch_jd)
    times_s = res_orbit["times_s"]
    states_eci = res_orbit["states_eci"]

    sim = AttitudeSimulator()
    att_res = sim.propagate_attitude(times_s=times_s, orbit_states_eci=states_eci, mode=mode)

    quats = att_res["quaternions"]
    eulers = att_res["euler_angles_deg"]
    torques = att_res["control_torques"]

    if out_path is None:
        out_path = os.path.join(PROJECT_ROOT, "data", "results", "attitude_simulation.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "times_s": times_s.tolist(),
            "quaternions": quats.tolist(),
            "euler_angles_deg": eulers.tolist(),
            "control_torques": torques.tolist(),
            "mode": mode,
        }, f, indent=2)

    print(f"💾 姿态数据已导出至: {out_path}\n")
    return att_res


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulate Attitude Dynamics")
    parser.add_argument("--sat", type=str, default="cartosat2")
    parser.add_argument("--mode", type=str, default="NADIR", choices=["NADIR", "SUN"])
    parser.add_argument("--hours", type=float, default=1.5)
    parser.add_argument("--step", type=float, default=10.0)
    parser.add_argument("--out", type=str, default=None)
    args = parser.parse_args()
    run_attitude_cli(sat_id=args.sat, mode=args.mode, hours=args.hours, step=args.step, out_path=args.out)
