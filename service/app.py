"""
Flask RESTful Backend Application & Static Server
Provides APIs for Orbit Propagation, ML Error Correction, Attitude Simulation,
Ground Station Visibility, ISL Topology, and Telemetry Ingestion.
"""

import os
import sys
from typing import Dict, Any
import numpy as np
from flask import Flask, request, jsonify, send_from_directory

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.time_systems import datetime_to_jd
from propagators.cowell_propagator import CowellPropagator
from propagators.sgp4_propagator import SGP4Propagator
from propagators.hybrid_propagator import HybridOrbitPropagator
from ml.residual_dataset import build_residual_sequences
from ml.trainer import train_residual_model, evaluate_residual_correction
from attitude.dynamics import AttitudeSimulator
from analysis.benchmark import run_integrator_benchmark
from analysis.visibility import compute_all_station_windows
from analysis.isl_topology import analyze_constellation_isl_topology
from service.data_manager import SatelliteDataManager

WEB3D_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web3d"))

app = Flask(__name__, static_folder=WEB3D_DIR, static_url_path="")
data_manager = SatelliteDataManager()

# In-memory cache for trained ML residual models per satellite
ml_cache: Dict[str, Dict[str, Any]] = {}


@app.route("/")
def index():
    return send_from_directory(WEB3D_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(WEB3D_DIR, path)


@app.route("/api/satellites", methods=["GET"])
def get_satellites():
    return jsonify(data_manager.get_satellite_list())


@app.route("/api/telemetry/ingest", methods=["POST"])
def ingest_telemetry():
    payload = request.get_json(force=True)
    record = data_manager.ingest_telemetry_frame(payload)
    return jsonify({"status": "success", "record": record})


@app.route("/api/propagate", methods=["POST"])
def propagate_orbit():
    data = request.get_json(force=True)
    sat_id = data.get("sat_id", "cartosat2")
    duration_hours = float(data.get("duration_hours", 2.0))
    dt_step = float(data.get("dt_step", 30.0))
    propagator_type = data.get("propagator", "HYBRID_ML").upper()

    if sat_id not in data_manager.satellites:
        return jsonify({"error": f"Satellite {sat_id} not found"}), 404

    sat_entry = data_manager.satellites[sat_id]
    sgp4_prop: SGP4Propagator = sat_entry["propagator"]
    t_span = duration_hours * 3600.0
    epoch_jd = sgp4_prop.epoch_jd
    y0_eci = sgp4_prop.get_initial_state_eci()

    # 1. 始终生成 SGP4 基线外推
    sgp4_res = sgp4_prop.propagate(t_span, dt_step, epoch_jd)

    # 2. 始终生成 Cowell RKF78 高保真参考真轨 (用于 3D 场景对比与残差基准)
    cowell_truth = CowellPropagator(integrator="RKF78", tol=1e-8, use_j2=True, use_drag=True)
    truth_res = cowell_truth.propagate(t_span, dt_step, epoch_jd, initial_state_eci=y0_eci)

    ml_metrics = None
    ric_residuals = []

    if propagator_type == "SGP4":
        res = sgp4_res
    elif propagator_type in ["COWELL_RKF78", "COWELL_RK4", "COWELL_ABM4"]:
        if propagator_type == "COWELL_RKF78":
            res = truth_res
        else:
            method = "RK4" if "RK4" in propagator_type else "ABM4"
            cowell = CowellPropagator(
                integrator=method,
                use_j2=data.get("use_j2", True),
                use_j3=data.get("use_j3", True),
                use_j4=data.get("use_j4", True),
                use_drag=data.get("use_drag", True),
                use_sun=data.get("use_sun", True),
                use_moon=data.get("use_moon", True),
                use_srp=data.get("use_srp", True),
            )
            res = cowell.propagate(t_span, dt_step, epoch_jd, initial_state_eci=y0_eci)
    elif propagator_type == "HYBRID_ML":
        # 缓存或训练该卫星的 LSTM 残差模型
        if sat_id not in ml_cache:
            seq_dict = build_residual_sequences(
                states_sgp4=sgp4_res["states_eci"][:min(len(sgp4_res["times_s"]), 180)],
                states_truth=truth_res["states_eci"][:min(len(truth_res["times_s"]), 180)],
                times_s=sgp4_res["times_s"][:min(len(sgp4_res["times_s"]), 180)],
                seq_length=12,
            )
            model, hist, scalers = train_residual_model(
                features=seq_dict["features"],
                targets=seq_dict["targets"],
                model_type="LSTM",
                epochs=35,
                batch_size=16,
            )
            eval_metrics = evaluate_residual_correction(
                model, seq_dict["features"], seq_dict["targets"], scalers
            )
            ml_cache[sat_id] = {
                "model": model,
                "scalers": scalers,
                "eval_metrics": eval_metrics,
            }

        cached = ml_cache[sat_id]
        hybrid_prop = HybridOrbitPropagator(
            sgp4_prop=sgp4_prop,
            ml_model=cached["model"],
            scalers=cached["scalers"],
            seq_length=12,
        )
        res = hybrid_prop.propagate(t_span, dt_step, epoch_jd)
        ml_metrics = cached["eval_metrics"]
    else:
        return jsonify({"error": f"Unknown propagator {propagator_type}"}), 400

    # 3. 计算 SGP4 与真轨之间的 RIC 误差时序
    from core.coordinates import compute_ric_errors
    n_pts = len(res["times_s"])
    for i in range(n_pts):
        ric = compute_ric_errors(
            sgp4_res["states_eci"][i, 0:3], sgp4_res["states_eci"][i, 3:6],
            truth_res["states_eci"][i, 0:3], truth_res["states_eci"][i, 3:6]
        )
        ric_residuals.append([ric["dr_radial"], ric["dr_in_track"], ric["dr_cross_track"]])

    # 4. 计算近地点与远地点信息点
    r_norms = np.linalg.norm(res["states_eci"][:, 0:3], axis=1)
    peri_idx = int(np.argmin(r_norms))
    apog_idx = int(np.argmax(r_norms))

    perigee_info = {
        "alt_km": float((r_norms[peri_idx] - 6378137.0) / 1000.0),
        "pos_eci": res["states_eci"][peri_idx, 0:3].tolist(),
        "time_s": float(res["times_s"][peri_idx]),
    }
    apogee_info = {
        "alt_km": float((r_norms[apog_idx] - 6378137.0) / 1000.0),
        "pos_eci": res["states_eci"][apog_idx, 0:3].tolist(),
        "time_s": float(res["times_s"][apog_idx]),
    }

    # 5. 格式化返回结果
    response_payload = {
        "satellite": sat_entry["name"],
        "propagator": propagator_type,
        "times_s": res["times_s"].tolist(),
        "jds": res["jds"].tolist(),
        "states_eci": res["states_eci"].tolist(),
        "states_ecef": res["states_ecef"].tolist(),
        "geodetic": res["geodetic"].tolist(),
        "coes": res.get("coes", []),
        "stats": res.get("stats", {}),
        "baseline_sgp4_eci": sgp4_res["states_eci"].tolist(),
        "truth_eci": truth_res["states_eci"].tolist(),
        "predicted_ric_residuals": ric_residuals,
        "perigee": perigee_info,
        "apogee": apogee_info,
    }
    if ml_metrics:
        response_payload["ml_metrics"] = {
            k: v for k, v in ml_metrics.items()
            if k not in ["predicted_residuals", "corrected_residuals"]
        }

    return jsonify(response_payload)


@app.route("/api/benchmark", methods=["GET"])
def run_benchmark():
    sat_id = request.args.get("sat_id", "cartosat2")
    hours = float(request.args.get("hours", 3.0))
    dt = float(request.args.get("dt", 30.0))

    if sat_id not in data_manager.satellites:
        return jsonify({"error": "Satellite not found"}), 404

    prop = data_manager.satellites[sat_id]["propagator"]
    y0_eci = prop.get_initial_state_eci()
    epoch_jd = prop.epoch_jd

    results = run_integrator_benchmark(y0_eci, epoch_jd, arc_duration_hours=hours, dt_step=dt)
    return jsonify(results)


@app.route("/api/attitude/simulate", methods=["POST"])
def simulate_attitude():
    data = request.get_json(force=True)
    sat_id = data.get("sat_id", "cartosat2")
    mode = data.get("mode", "NADIR").upper()  # NADIR or SUN
    duration_s = float(data.get("duration_s", 600.0))
    dt = float(data.get("dt", 1.0))

    if sat_id not in data_manager.satellites:
        return jsonify({"error": "Satellite not found"}), 404

    sgp4_prop = data_manager.satellites[sat_id]["propagator"]
    orbit_res = sgp4_prop.propagate(duration_s, dt, sgp4_prop.epoch_jd)

    sim = AttitudeSimulator(
        kp=float(data.get("kp", 2.5)),
        kd=float(data.get("kd", 8.0)),
        max_torque_nm=float(data.get("max_torque", 0.5)),
    )
    att_res = sim.propagate_attitude(
        times_s=orbit_res["times_s"],
        orbit_states_eci=orbit_res["states_eci"],
        mode=mode,
    )

    return jsonify({
        "sat_id": sat_id,
        "mode": mode,
        "times_s": att_res["times_s"].tolist(),
        "quaternions": att_res["quaternions"].tolist(),
        "angular_velocities": att_res["angular_velocities"].tolist(),
        "euler_angles_deg": att_res["euler_angles_deg"].tolist(),
        "control_torques": att_res["control_torques"].tolist(),
    })


@app.route("/api/visibility", methods=["GET"])
def get_visibility():
    sat_id = request.args.get("sat_id", "cartosat2")
    hours = float(request.args.get("hours", 6.0))

    if sat_id not in data_manager.satellites:
        return jsonify({"error": "Satellite not found"}), 404

    prop = data_manager.satellites[sat_id]["propagator"]
    res = prop.propagate(hours * 3600.0, 30.0, prop.epoch_jd)

    visibility_data = compute_all_station_windows(
        states_ecef=res["states_ecef"],
        times_s=res["times_s"],
        jds=res["jds"],
    )
    return jsonify({"sat_id": sat_id, "stations": visibility_data})


@app.route("/api/isl", methods=["GET"])
def get_isl():
    # Gather trajectories of all registered satellites
    trajectories = []
    for s_id, s_data in data_manager.satellites.items():
        prop = s_data["propagator"]
        res = prop.propagate(3600.0, 60.0, prop.epoch_jd)
        trajectories.append({
            "name": s_data["name"],
            "states_eci": res["states_eci"],
        })

    isl_res = analyze_constellation_isl_topology(trajectories, time_idx=0)
    return jsonify(isl_res)


@app.route("/api/station_keeping/maneuver", methods=["POST"])
def station_keeping():
    data = request.get_json(force=True)
    sat_id = data.get("sat_id", "cartosat2")
    nominal_sma_km = float(data.get("nominal_sma_km", 7000.0))

    if sat_id not in data_manager.satellites:
        return jsonify({"error": "Satellite not found"}), 404

    prop = data_manager.satellites[sat_id]["propagator"]
    y0_eci = prop.get_initial_state_eci()

    # Simulate slight atmospheric drag decay
    decayed_state = y0_eci.copy()
    decayed_state[3:6] *= 0.998  # Orbital speed reduction

    plan = data_manager.plan_station_keeping_maneuver(
        decayed_state,
        nominal_semi_major_axis=nominal_sma_km * 1000.0,
    )
    return jsonify(plan)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"Starting SatProp-OrbitAttitude Server on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
