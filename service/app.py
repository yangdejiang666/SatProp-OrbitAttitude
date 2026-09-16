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

    if propagator_type == "SGP4":
        res = sgp4_prop.propagate(t_span, dt_step, epoch_jd)
    elif propagator_type in ["COWELL_RKF78", "COWELL_RK4", "COWELL_ABM4"]:
        method = "RKF78" if "RKF78" in propagator_type else ("RK4" if "RK4" in propagator_type else "ABM4")
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
        # Check or train ML model for this satellite
        if sat_id not in ml_cache:
            # Generate truth using Cowell RKF78 over 1 orbit
            cowell_truth = CowellPropagator(integrator="RKF78", tol=1e-9)
            truth_res = cowell_truth.propagate(3600.0 * 2.0, 30.0, epoch_jd, initial_state_eci=y0_eci)
            sgp4_base = sgp4_prop.propagate(3600.0 * 2.0, 30.0, epoch_jd)

            seq_dict = build_residual_sequences(
                states_sgp4=sgp4_base["states_eci"],
                states_truth=truth_res["states_eci"],
                times_s=sgp4_base["times_s"],
                seq_length=12,
            )
            model, hist, scalers = train_residual_model(
                features=seq_dict["features"],
                targets=seq_dict["targets"],
                model_type="LSTM",
                epochs=40,
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
        res["ml_metrics"] = cached["eval_metrics"]
    else:
        return jsonify({"error": f"Unknown propagator {propagator_type}"}), 400

    # Format JSON response (truncate coordinates to clean precision)
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
    }
    if "predicted_ric_residuals" in res:
        response_payload["predicted_ric_residuals"] = res["predicted_ric_residuals"].tolist()
    if "baseline_sgp4_eci" in res:
        response_payload["baseline_sgp4_eci"] = res["baseline_sgp4_eci"].tolist()
    if "ml_metrics" in res:
        response_payload["ml_metrics"] = {
            k: v for k, v in res["ml_metrics"].items()
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
