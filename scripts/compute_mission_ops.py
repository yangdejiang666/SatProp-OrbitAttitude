"""
SatProp-OrbitAttitude: Mission Operations CLI (Ground Station & ISL Topology)
=============================================================================
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

from core.coordinates import eci_to_ecef
from propagators.sgp4_propagator import SGP4Propagator
from analysis.visibility import compute_all_station_windows, DEFAULT_GROUND_STATIONS
from analysis.isl_topology import analyze_constellation_isl_topology
from service.data_manager import SatelliteDataManager


def run_ops_cli(sat_id="cartosat2", hours=12.0, step=30.0, min_el=5.0, isl_range_km=5000.0, out_path=None):
    data_mgr = SatelliteDataManager()
    if sat_id not in data_mgr.satellites:
        sat_id = "cartosat2"

    sat_info = data_mgr.satellites[sat_id]
    sgp4_prop: SGP4Propagator = sat_info["propagator"]
    epoch_jd = sgp4_prop.epoch_jd

    print("=" * 85)
    print(f"📡 卫星测控与星座互联仿真分析 (Ground Passes & ISL Topology)")
    print(f"🛰️  主星: {sat_info['name']} | 分析时长: {hours}h | 仰角门限: {min_el}°")
    print("=" * 85)

    t_span = hours * 3600.0
    res = sgp4_prop.propagate(t_span, step, epoch_jd)
    times_s = res["times_s"]
    states_eci = res["states_eci"]
    jds = epoch_jd + times_s / 86400.0

    states_ecef = np.zeros_like(states_eci)
    for i in range(len(times_s)):
        r_ecef, v_ecef = eci_to_ecef(states_eci[i, 0:3], states_eci[i, 3:6], jds[i])
        states_ecef[i, 0:3] = r_ecef
        states_ecef[i, 3:6] = v_ecef

    station_results = compute_all_station_windows(states_ecef, times_s, jds)
    constellation = [
        {"name": sat_id.upper(), "states_eci": states_eci},
        {"name": f"{sat_id.upper()}_LEAD", "states_eci": states_eci + np.array([40000.0, 10000.0, 0.0, 0.0, 0.0, 0.0])},
        {"name": f"{sat_id.upper()}_TRAIL", "states_eci": states_eci - np.array([35000.0, 15000.0, 0.0, 0.0, 0.0, 0.0])},
    ]
    isl_res = analyze_constellation_isl_topology(
        constellation,
        time_idx=0,
        max_range_m=isl_range_km * 1000.0,
    )

    if out_path is None:
        out_path = os.path.join(PROJECT_ROOT, "data", "results", "mission_ops_results.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "station_results": station_results,
            "isl_topology": isl_res,
        }, f, indent=2, ensure_ascii=False)

    print(f"💾 任务分析结果已导出至: {out_path}\n")
    return {"station_results": station_results, "isl_topology": isl_res}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compute Mission Operations")
    parser.add_argument("--sat", type=str, default="cartosat2")
    parser.add_argument("--hours", type=float, default=12.0)
    parser.add_argument("--step", type=float, default=30.0)
    parser.add_argument("--min_el", type=float, default=5.0)
    parser.add_argument("--isl_range_km", type=float, default=5000.0)
    parser.add_argument("--out", type=str, default=None)
    args = parser.parse_args()
    run_ops_cli(
        sat_id=args.sat,
        hours=args.hours,
        step=args.step,
        min_el=args.min_el,
        isl_range_km=args.isl_range_km,
        out_path=args.out,
    )
