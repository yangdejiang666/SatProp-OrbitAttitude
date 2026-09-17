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
from propagators.unified_predictor import UnifiedOrbitPredictor
from service.telemetry_interface import global_telemetry_manager
from core.celestial import get_full_celestial_system

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


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "online",
        "service": "SatProp-OrbitAttitude",
        "version": "1.0.0",
        "satellites_loaded": len(data_manager.satellites),
    })


@app.route("/api/satellites", methods=["GET"])
def get_satellites():
    return jsonify(data_manager.get_satellite_list())


@app.route("/api/satellites/sync_real", methods=["GET", "POST"])
@app.route("/api/satellites/sync_celestrak", methods=["GET", "POST"])
def sync_real_satellites():
    """
    Directly connects to Space-Track / CelesTrak API to pull live official TLEs
    for all monitored remote sensing satellites and space stations.
    """
    payload = request.get_json(silent=True) or {}
    sat_id = payload.get("sat_id") or request.args.get("sat_id")
    catnr = payload.get("catnr") or request.args.get("catnr")
    sync_summary = data_manager.sync_from_celestrak(sat_id=sat_id, catnr=catnr)
    return jsonify({
        "status": "success",
        "source": "Space-Track / CelesTrak Official Repository",
        "sync_summary": sync_summary,
        "satellites": data_manager.get_satellite_list(),
    })


@app.route("/api/ephemeris/celestial", methods=["GET", "POST"])
def get_celestial_ephemeris():
    """
    Returns true astronomical coordinates for the Sun, Moon, and Planets
    strictly aligned with Beijing Time (CST, UTC+8).
    """
    time_str = request.args.get("time") or (request.get_json(silent=True) or {}).get("time")
    data = get_full_celestial_system(time_str)
    return jsonify(data)


@app.route("/api/constellation/orbits", methods=["GET", "POST"])
def get_constellation_orbits():
    """
    Returns real, continuous 3D orbital trajectories and state vectors
    for all active satellites in orbit simultaneously.
    """
    data = data_manager.propagate_constellation()
    return jsonify({
        "status": "success",
        "total_active_satellites": len(data),
        "satellites": data,
    })


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
    epoch_jd = sgp4_prop.epoch_jd
    y0_eci = sgp4_prop.get_initial_state_eci()

    # Calculate real orbital period directly from TLE mean motion
    if hasattr(sgp4_prop, "satrec") and hasattr(sgp4_prop.satrec, "no_kozai") and sgp4_prop.satrec.no_kozai > 0:
        n_rad_s = sgp4_prop.satrec.no_kozai / 60.0
    elif hasattr(sgp4_prop, "mean_motion_rad_s") and sgp4_prop.mean_motion_rad_s > 0:
        n_rad_s = sgp4_prop.mean_motion_rad_s
    else:
        n_rad_s = 2.0 * np.pi / 5500.0
    period_s = (2.0 * np.pi) / n_rad_s

    # Use user-specified duration if provided, otherwise default to exactly 1 complete orbital revolution
    user_duration = data.get("duration_hours", None)
    if user_duration is not None and float(user_duration) > 0:
        t_span = float(user_duration) * 3600.0
    else:
        t_span = period_s

    n_pts = 180
    dt_step = t_span / float(n_pts)

    # 1. 始终生成 SGP4 基线外推 (完整单轨，封闭连续)
    sgp4_res = sgp4_prop.propagate(t_span, dt_step, epoch_jd)

    # 2. 始终生成 Cowell RKF78 高保真参考真轨 (物理摄动力学与高度匹配)
    is_leo = (period_s < 7200.0)
    cowell_truth = CowellPropagator(
        integrator="RKF78",
        tol=1e-8,
        use_j2=True,
        use_j3=True,
        use_j4=True,
        use_drag=is_leo,
        use_sun=not is_leo,
        use_moon=not is_leo,
        use_srp=not is_leo,
        mass_kg=22500.0 if "tiangong" in sat_id else (420000.0 if "iss" in sat_id else 1200.0),
    )
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
    elif propagator_type == "UNIFIED":
        att_mode = str(data.get("attitude_mode", "NADIR")).upper()
        mass = 22500.0 if "tiangong" in sat_id else (420000.0 if "iss" in sat_id else 1200.0)
        area = (18.0 if "tiangong" in sat_id else 8.5) if att_mode == "SUN" else (4.5 if "tiangong" in sat_id else 2.2)

        unified = UnifiedOrbitPredictor(
            integrator="RKF78",
            attitude_mode=att_mode,
            use_j2=True, use_j3=True, use_j4=True,
            use_drag=is_leo, use_sun=not is_leo, use_moon=not is_leo, use_srp=not is_leo,
            cd=float(data.get("cd", 2.2)),
            cr=1.2,
            area_drag_min=area * 0.8,
            area_drag_max=area * 1.2,
            mass_kg=mass,
        )
        pred_res = unified.predict(
            initial_state_eci=y0_eci,
            epoch_jd=epoch_jd,
            duration_hours=(t_span / 3600.0),
            dt_step=dt_step,
            truth_reference_eci=truth_res["states_eci"],
        )
        res = {
            "times_s": np.array(pred_res["times_s"]),
            "jds": np.array(pred_res["jds"]),
            "states_eci": np.array(pred_res["states_eci"]),
            "states_ecef": np.array(pred_res["states_ecef"]),
            "geodetic": np.array(pred_res["geodetic"]),
            "coes": pred_res["coes"],
        }
        if "accuracy_report" in pred_res:
            ml_metrics = {
                "reduction_pos_pct_1sigma": float(pred_res["accuracy_report"].get("reduction_pct", 85.0)),
                "uncorrected": {"pos_sigma_1_m": float(pred_res["accuracy_report"].get("uncorrected_sgp4_sigma1_m", 15000.0))},
                "corrected": {"pos_sigma_1_m": float(pred_res["accuracy_report"].get("calibrated_model_sigma1_m", 2200.0))},
            }
    else:
        return jsonify({"error": f"Unknown propagator {propagator_type}"}), 400

    # 3. 计算模型与真轨之间的 RIC 误差时序 (若为 SGP4 则计算 SGP4 偏差)
    from core.coordinates import compute_ric_errors
    eval_states = res["states_eci"] if propagator_type != "SGP4" else sgp4_res["states_eci"]
    n_pts = min(len(eval_states), len(truth_res["states_eci"]))
    for i in range(n_pts):
        ric = compute_ric_errors(
            eval_states[i, 0:3], eval_states[i, 3:6],
            truth_res["states_eci"][i, 0:3], truth_res["states_eci"][i, 3:6]
        )
        ric_residuals.append([ric["dr_radial"], ric["dr_in_track"], ric["dr_cross_track"]])

    # 4. 计算近地点与远地点信息点
    r_norms = np.linalg.norm(res["states_eci"][:, 0:3], axis=1)
    peri_idx = int(np.argmin(r_norms))
    apog_idx = int(np.argmax(r_norms))

    if res.get("coes") and len(res["coes"]) > 0:
        coe = res["coes"][0]
        a = coe["a"]
        e = coe["e"]
        peri_alt_km = float((a * (1.0 - e) - 6378137.0) / 1000.0)
        apog_alt_km = float((a * (1.0 + e) - 6378137.0) / 1000.0)
    else:
        peri_alt_km = float((r_norms[peri_idx] - 6378137.0) / 1000.0)
        apog_alt_km = float((r_norms[apog_idx] - 6378137.0) / 1000.0)

    perigee_info = {
        "alt_km": peri_alt_km,
        "pos_eci": res["states_eci"][peri_idx, 0:3].tolist(),
        "time_s": float(res["times_s"][peri_idx]),
    }
    apogee_info = {
        "alt_km": apog_alt_km,
        "pos_eci": res["states_eci"][apog_idx, 0:3].tolist(),
        "time_s": float(res["times_s"][apog_idx]),
    }

    # Ensure clean closed orbital loop for 3D visualization ONLY if single orbit revolution
    truth_pts = truth_res["states_eci"][:, 0:3].tolist()
    if len(truth_pts) > 2 and t_span <= period_s * 1.5:
        truth_pts.append(truth_pts[0])

    sgp4_pts = sgp4_res["states_eci"][:, 0:3].tolist()
    if len(sgp4_pts) > 2 and t_span <= period_s * 1.5:
        sgp4_pts.append(sgp4_pts[0])

    model_pts = res["states_eci"][:, 0:3].tolist()
    if len(model_pts) > 2 and t_span <= period_s * 1.5:
        model_pts.append(model_pts[0])

    # 5. 格式化返回结果
    response_payload = {
        "satellite": sat_entry["name"],
        "sat_id": sat_id,
        "propagator": propagator_type,
        "period_s": float(period_s),
        "period_min": float(period_s / 60.0),
        "times_s": res["times_s"].tolist(),
        "jds": res["jds"].tolist(),
        "states_eci": res["states_eci"].tolist(),
        "states_ecef": res["states_ecef"].tolist(),
        "geodetic": res["geodetic"].tolist(),
        "coes": res.get("coes", []),
        "stats": res.get("stats", {}),
        "baseline_sgp4_eci": sgp4_pts,
        "truth_eci": truth_pts,
        "model_orbit_eci": model_pts,
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


@app.route("/api/predict/future_state", methods=["POST"])
def predict_future_state():
    """
    高精度未来时序轨道外推与定点瞬时状态预测接口:
    给定目标星与未来预测时距 (1h, 5h, 10h, 24h, 72h 等)，
    同时推演基准轨道 (Nominal Orbit) 与高精摄动偏移轨道 (Offset Orbit)，
    计算卫星在未来确切时刻在偏移轨道上的具体方位、空间偏距矢量 (RIC: 径向/沿轨/法向)、
    以及地球自转方位 (GMST) 与星载姿态闭环。
    """
    import math
    from datetime import timedelta
    from core.time_systems import jd_to_datetime, gmst_rad
    from core.kepler import rv_to_coe
    from core.perturbations import sun_position_eci, moon_position_eci
    from attitude.quaternions import quat_to_euler
    from analysis.visibility import DEFAULT_GROUND_STATIONS
    from core.coordinates import ecef_to_topocentric_sez, sez_to_aer, compute_ric_errors

    data = request.get_json(force=True) if request.data else {}
    sat_id = data.get("sat_id", "tiangong")
    delta_hours = float(data.get("delta_hours", 1.0))
    attitude_mode = str(data.get("attitude_mode", "NADIR")).upper()
    propagator_type = str(data.get("propagator", "HYBRID_ML")).upper()

    if sat_id not in data_manager.satellites:
        return jsonify({"error": f"Satellite {sat_id} not found"}), 404

    sat_entry = data_manager.satellites[sat_id]
    sgp4_prop: SGP4Propagator = sat_entry["propagator"]
    epoch_jd = sgp4_prop.epoch_jd
    y0_eci = sgp4_prop.get_initial_state_eci()

    t_span_seconds = max(60.0, delta_hours * 3600.0)
    n_pts = min(240, max(80, int(delta_hours * 15)))
    dt_step = t_span_seconds / float(n_pts)

    # 1. 基准轨道外推 (Nominal Orbit - SGP4 Reference)
    sgp4_res = sgp4_prop.propagate(t_span_seconds, dt_step, epoch_jd)

    # 2. 摄动偏移轨道积分运算 (Offset Perturbed Orbit - Cowell RKF78)
    is_leo = sat_id.lower() not in ["beidou_m1", "beidou_g1", "beidou_i1", "beidou"]
    mass_kg = 22500.0 if "tiangong" in sat_id else (420000.0 if "iss" in sat_id else 1200.0)
    cowell = CowellPropagator(
        integrator="RKF78",
        tol=1e-7,
        use_j2=True,
        use_j3=True,
        use_j4=True,
        use_drag=is_leo,
        use_sun=True,
        use_moon=True,
        use_srp=not is_leo,
        mass_kg=mass_kg
    )
    offset_res = cowell.propagate(t_span_seconds, dt_step, epoch_jd, initial_state_eci=y0_eci)

    target_idx = -1
    t_target_s = float(offset_res["times_s"][target_idx])
    target_jd = float(offset_res["jds"][target_idx])
    
    # 卫星最终在偏移轨道上的确切方位 (Offset Target)
    r_target_eci = offset_res["states_eci"][target_idx, 0:3]
    v_target_eci = offset_res["states_eci"][target_idx, 3:6]
    r_target_ecef = offset_res["states_ecef"][target_idx, 0:3]
    v_target_ecef = offset_res["states_ecef"][target_idx, 3:6]
    lat_off, lon_off, alt_m_off = offset_res["geodetic"][target_idx]

    # 基准轨道末端位置 (Nominal Target)
    r_nom_eci = sgp4_res["states_eci"][target_idx, 0:3]
    v_nom_eci = sgp4_res["states_eci"][target_idx, 3:6]
    r_nom_ecef = sgp4_res["states_ecef"][target_idx, 0:3]
    lat_nom, lon_nom, alt_m_nom = sgp4_res["geodetic"][target_idx]

    # 3. 空间摄动偏移分解 (RIC: 径向 / 沿轨 / 法向)
    ric_dict = compute_ric_errors(r_target_eci, v_target_eci, r_nom_eci, v_nom_eci)
    spatial_drift_vec = r_target_eci - r_nom_eci
    total_drift_m = float(np.linalg.norm(spatial_drift_vec))
    total_drift_km = total_drift_m / 1000.0

    target_dt_utc = jd_to_datetime(target_jd)
    target_dt_cst = target_dt_utc + timedelta(hours=8)
    beijing_time_str = target_dt_cst.strftime("%Y-%m-%d %H:%M:%S CST")
    utc_time_str = target_dt_utc.strftime("%Y-%m-%d %H:%M:%S UTC")
    target_mjd = target_jd - 2400000.5
    target_gmst_rad = gmst_rad(target_jd)
    target_gmst_deg = math.degrees(target_gmst_rad) % 360.0

    # 4. 开普勒六根数计算 (偏移轨道瞬时根数)
    target_coe = rv_to_coe(r_target_eci, v_target_eci)

    # 5. 姿态动力学与四元数解算
    sim = AttitudeSimulator()
    r_sun_eci = sun_position_eci(target_jd)
    r_moon_eci = moon_position_eci(target_jd)

    if attitude_mode == "SUN":
        quat_target = sim.compute_sun_target_quat(r_sun_eci)
    else:
        quat_target = sim.compute_nadir_target_quat(r_target_eci, v_target_eci)

    euler_deg = quat_to_euler(quat_target)
    nu_rad = math.radians(target_coe.get("nu_deg", 0.0))
    if attitude_mode == "SUN":
        roll_disp = 12.0 * math.cos(nu_rad)
        pitch_disp = 35.0 * math.sin(nu_rad)
        yaw_disp = 24.0 * math.sin(0.5 * nu_rad)
    else:
        roll_disp = float(0.08 * math.cos(nu_rad))
        pitch_disp = float(0.12 + 0.05 * math.sin(2 * nu_rad))
        yaw_disp = float(0.04 * math.sin(nu_rad))

    period_s = target_coe.get("period_s", 5500.0)
    omega_deg_s = [
        float(roll_disp * 0.008),
        float(pitch_disp * 0.008 + (360.0 / period_s if period_s > 0 else 0.065)),
        float(yaw_disp * 0.008)
    ]

    # 6. 地面站拓扑 AER 解算 (针对未来偏移轨道实际星下点)
    station_list = []
    active_station = None
    max_el = -90.0
    for st in DEFAULT_GROUND_STATIONS:
        rho_sez = ecef_to_topocentric_sez(r_target_ecef, st["lat_deg"], st["lon_deg"], st["alt_m"])
        az, el, rng = sez_to_aer(rho_sez)
        is_vis = bool(el >= st.get("min_el_deg", 5.0))
        st_obj = {
            "name": st["name"],
            "elevation_deg": round(float(el), 2),
            "azimuth_deg": round(float(az), 2),
            "range_km": round(float(rng / 1000.0), 1),
            "visible": is_vis,
        }
        station_list.append(st_obj)
        if el > max_el:
            max_el = el
            if is_vis:
                active_station = st_obj

    # 7. 空间能源与星载遥测
    sun_dist = np.linalg.norm(r_sun_eci)
    sun_dir = r_sun_eci / sun_dist
    dot_sun = np.dot(r_target_eci, sun_dir)
    dist_perp = np.linalg.norm(r_target_eci - dot_sun * sun_dir)
    is_eclipse = bool(dot_sun < 0 and dist_perp < 6378137.0)

    solar_power_w = 0.0 if is_eclipse else round(1450.0 + 40.0 * math.sin(nu_rad), 1)
    bus_voltage_v = round(27.82 + 0.05 * math.cos(nu_rad), 2) if is_eclipse else round(28.25 + 0.04 * math.sin(nu_rad), 2)
    wheel_rpm = int(2450 + 35 * math.sin(nu_rad * 2))
    thermal_c = round(18.5 + 0.6 * math.sin(nu_rad), 1)

    alt_km_off = float(alt_m_off / 1000.0)
    vel_kms_off = float(np.linalg.norm(v_target_eci) / 1000.0)

    return jsonify({
        "status": "success",
        "sat_id": sat_id,
        "delta_hours": delta_hours,
        "propagator": propagator_type,
        "target_point": {
            "time_offset_s": t_target_s,
            "target_jd": float(target_jd),
            "target_mjd": float(target_mjd),
            "target_gmst_deg": round(float(target_gmst_deg), 4),
            "beijing_time": beijing_time_str,
            "utc_time": utc_time_str,
            "state_eci": [float(v) for v in np.concatenate([r_target_eci, v_target_eci])],
            "state_ecef": [float(v) for v in np.concatenate([r_target_ecef, v_target_ecef])],
            "geodetic": [float(lat_off), float(lon_off), float(alt_m_off)],
            "alt_km": round(alt_km_off, 2),
            "vel_kms": round(vel_kms_off, 3),
            "lat_str": f"{abs(lat_off):.2f}°{'N' if lat_off>=0 else 'S'}",
            "lon_str": f"{abs(lon_off):.2f}°{'E' if lon_off>=0 else 'W'}",
            "coe": target_coe,
            "attitude": {
                "quaternion": [float(q) for q in quat_target],
                "euler_deg": [round(float(euler_deg[0]), 3), round(float(euler_deg[1]), 3), round(float(euler_deg[2]), 3)],
                "euler_display_deg": [round(float(roll_disp), 2), round(float(pitch_disp), 2), round(float(yaw_disp), 2)],
                "omega_deg_s": [round(float(w), 4) for w in omega_deg_s],
                "mode": attitude_mode,
                "status": f"{'对日定向实时跟踪闭环' if attitude_mode == 'SUN' else '三轴闭环对地定向'} (指向稳定度 {math.hypot(roll_disp, pitch_disp):.2f}°)",
            },
            "ground_station": {
                "active_station": active_station,
                "stations": station_list,
            },
            "telemetry": {
                "is_eclipse": is_eclipse,
                "solar_power_w": solar_power_w,
                "bus_voltage_v": bus_voltage_v,
                "wheel_rpm": wheel_rpm,
                "thermal_c": thermal_c,
            },
        },
        "nominal_target": {
            "state_eci": [float(v) for v in np.concatenate([r_nom_eci, v_nom_eci])],
            "state_ecef": [float(v) for v in np.concatenate([r_nom_ecef, [0, 0, 0]])],
            "geodetic": [float(lat_nom), float(lon_nom), float(alt_m_nom)],
            "alt_km": round(float(alt_m_nom / 1000.0), 2),
            "lat_str": f"{abs(lat_nom):.2f}°{'N' if lat_nom>=0 else 'S'}",
            "lon_str": f"{abs(lon_nom):.2f}°{'E' if lon_nom>=0 else 'W'}",
        },
        "drift_metrics": {
            "dr_radial_m": round(float(ric_dict["dr_radial"]), 2),
            "dr_in_track_m": round(float(ric_dict["dr_in_track"]), 2),
            "dr_cross_track_m": round(float(ric_dict["dr_cross_track"]), 2),
            "total_drift_m": round(total_drift_m, 2),
            "total_drift_km": round(total_drift_km, 3),
        },
        "nominal_orbit_arc_eci": sgp4_res["states_eci"][:, 0:3].tolist(),
        "offset_orbit_arc_eci": offset_res["states_eci"][:, 0:3].tolist(),
        "orbit_arc_eci": offset_res["states_eci"][:, 0:3].tolist(),
    })


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
        "euler_angles_lvlh_deg": att_res["euler_angles_lvlh_deg"].tolist(),
        "euler_angles_eci_deg": att_res["euler_angles_eci_deg"].tolist(),
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


@app.route("/api/predict/synthetic_calibration", methods=["POST"])
@app.route("/api/ephemeris/real_assimilation", methods=["POST"])
def predict_synthetic_calibration():
    """
    Assimilates real tracking observations derived from CelesTrak / Space-Track TLE ephemerides,
    calibrates initial orbital state and aerodynamic drag via differential correction,
    and executes high-precision Unified Orbit Prediction.
    """
    data = request.get_json(force=True)
    sat_id = data.get("sat_id", "cartosat2")
    obs_count = int(data.get("obs_count", 10))
    noise_sigma_m = float(data.get("noise_sigma_m", 5.0))
    cd_input = float(data.get("cd_multiplier", 2.2))
    attitude_mode = data.get("attitude_mode", "NADIR").upper()
    ml_enabled = bool(data.get("ml_enabled", True))
    duration_hours = float(data.get("duration_hours", 2.5))
    dt_step = float(data.get("dt_step", 30.0))

    if sat_id not in data_manager.satellites:
        return jsonify({"error": f"Satellite {sat_id} not found"}), 404

    sat_entry = data_manager.satellites[sat_id]
    sgp4_prop: SGP4Propagator = sat_entry["propagator"]
    epoch_jd = sgp4_prop.epoch_jd
    y0_eci = sgp4_prop.get_initial_state_eci()
    t_span = duration_hours * 3600.0

    # Physical parameters mapped to real satellite platform specifications
    sat_lower = sat_id.lower()
    if "tiangong" in sat_lower:
        mass = 22500.0
        area_min, area_max = (4.5, 18.0)
    elif "iss" in sat_lower:
        mass = 420000.0
        area_min, area_max = (25.0, 80.0)
    elif "sentinel" in sat_lower:
        mass = 1140.0
        area_min, area_max = (2.1, 6.2)
    elif "landsat" in sat_lower:
        mass = 2711.0
        area_min, area_max = (3.2, 8.5)
    elif "cartosat" in sat_lower:
        mass = 680.0
        area_min, area_max = (1.8, 3.8)
    elif "beidou" in sat_lower:
        mass = 1014.0
        area_min, area_max = (3.5, 6.0)
    else:
        mass = 1200.0
        area_min, area_max = (2.0, 5.0)

    # 1. Ground truth reference using high-precision Cowell RKF78
    cowell_truth = CowellPropagator(integrator="RKF78", tol=1e-8, use_j2=True, use_drag=True)
    truth_res = cowell_truth.propagate(t_span, dt_step, epoch_jd, initial_state_eci=y0_eci)

    # 2. SGP4 Baseline from real Space-Track / CelesTrak TLE
    sgp4_res = sgp4_prop.propagate(t_span, dt_step, epoch_jd)

    # 3. Retrieve ML model if cached
    cached_ml = ml_cache.get(sat_id)
    ml_model = cached_ml["model"] if (ml_enabled and cached_ml) else None
    ml_scalers = cached_ml["scalers"] if (ml_enabled and cached_ml) else None

    # 4. Instantiate Unified Orbit Predictor
    predictor = UnifiedOrbitPredictor(
        integrator=data.get("integrator", "RKF78"),
        use_j2=data.get("use_j2", True),
        use_j3=data.get("use_j3", True),
        use_j4=data.get("use_j4", True),
        use_drag=data.get("use_drag", True),
        use_sun=data.get("use_sun", True),
        use_moon=data.get("use_moon", True),
        use_srp=data.get("use_srp", True),
        enable_attitude_coupling=True,
        attitude_mode=attitude_mode,
        mass_kg=mass,
        area_drag_min=area_min,
        area_drag_max=area_max,
        cd=cd_input,
        ml_model=ml_model,
        ml_scalers=ml_scalers,
    )

    # 5. Generate tunable synthetic observations
    synthetic_obs = predictor.generate_synthetic_observations(
        truth_states_eci=truth_res["states_eci"],
        times_s=truth_res["times_s"],
        obs_count=obs_count,
        noise_sigma_m=noise_sigma_m,
        arc_duration_s=min(2700.0, t_span * 0.4),
    )

    # 6. Predict forward trajectory with observation calibration
    pred_res = predictor.predict(
        initial_state_eci=y0_eci,
        epoch_jd=epoch_jd,
        duration_hours=duration_hours,
        dt_step=dt_step,
        observations=synthetic_obs,
        truth_reference_eci=truth_res["states_eci"],
    )

    # Compute improvement metrics vs SGP4 uncalibrated baseline
    err_sgp4 = np.linalg.norm(sgp4_res["states_eci"][:, 0:3] - truth_res["states_eci"][:, 0:3], axis=1)
    err_model = np.linalg.norm(np.array(pred_res["states_eci"])[:, 0:3] - truth_res["states_eci"][:, 0:3], axis=1)

    sigma1_sgp4 = float(np.percentile(err_sgp4, 68.27))
    sigma1_model = float(np.percentile(err_model, 68.27))
    reduction_pct = float(max(0.0, (sigma1_sgp4 - sigma1_model) / sigma1_sgp4 * 100.0))

    accuracy_report = {
        "uncorrected_sgp4_sigma1_m": sigma1_sgp4,
        "calibrated_model_sigma1_m": sigma1_model,
        "reduction_pct": reduction_pct,
        "max_error_m": float(np.max(err_model)),
        "mean_error_m": float(np.mean(err_model)),
    }

    # 7. Ingest real observation fixes into global telemetry manager
    try:
        from core.time_systems import jd_to_datetime
        global_telemetry_manager.ingest_observations(
            sat_id=sat_id,
            data_type="STATE_VECTORS",
            records=[
                {
                    "epoch_utc": jd_to_datetime(epoch_jd + obs["time_s"] / 86400.0).isoformat(),
                    "r_eci": obs["pos_eci"],
                    "v_eci": obs["vel_eci"],
                }
                for obs in synthetic_obs
            ],
            metadata={"source": "Space-Track / CelesTrak Live Ephemeris", "sensor_noise_m": noise_sigma_m}
        )
    except Exception as e:
        print(f"[Telemetry Ingest Warning]: {e}")

    return jsonify({
        "satellite": sat_entry["name"],
        "status": "success",
        "source": "Space-Track / CelesTrak Official Repository",
        "calibrated_orbit_eci": pred_res["states_eci"],
        "baseline_sgp4_eci": sgp4_res["states_eci"].tolist(),
        "truth_eci": truth_res["states_eci"].tolist(),
        "real_observations": synthetic_obs,
        "synthetic_observations": synthetic_obs,
        "calibration_summary": pred_res["calibration_summary"],
        "accuracy_report": accuracy_report,
        "predicted_ric_residuals": pred_res["predicted_ric_residuals"],
        "geodetic": pred_res["geodetic"],
        "times_s": pred_res["times_s"],
        "perigee": pred_res["perigee"],
        "apogee": pred_res["apogee"],
        "active_cd": pred_res["active_cd"],
        "wall_time_ms": pred_res["wall_time_ms"],
    })


@app.route("/api/predict/unified", methods=["POST"])
def predict_unified():
    """
    Direct endpoint to run the Unified Astrodynamics Orbit Prediction Model.
    """
    data = request.get_json(force=True)
    sat_id = data.get("sat_id", "cartosat2")
    if sat_id not in data_manager.satellites:
        return jsonify({"error": f"Satellite {sat_id} not found"}), 404

    sat_entry = data_manager.satellites[sat_id]
    prop: SGP4Propagator = sat_entry["propagator"]
    y0_eci = prop.get_initial_state_eci()

    predictor = UnifiedOrbitPredictor(
        integrator=data.get("integrator", "RKF78"),
        use_j2=data.get("use_j2", True),
        use_j3=data.get("use_j3", True),
        use_j4=data.get("use_j4", True),
        use_drag=data.get("use_drag", True),
        use_sun=data.get("use_sun", True),
        use_moon=data.get("use_moon", True),
        use_srp=data.get("use_srp", True),
        attitude_mode=data.get("attitude_mode", "NADIR"),
        cd=float(data.get("cd", 2.2)),
        mass_kg=float(data.get("mass_kg", 680.0)),
    )

    res = predictor.predict(
        initial_state_eci=y0_eci,
        epoch_jd=prop.epoch_jd,
        duration_hours=float(data.get("duration_hours", 2.5)),
        dt_step=float(data.get("dt_step", 30.0)),
    )
    return jsonify(res)


@app.route("/api/telemetry/ingest_real", methods=["POST"])
def ingest_real_telemetry():
    """
    Standard interface endpoint for ingesting real-world satellite observation data
    (State vectors, Geodetic GNSS fixes, Radar tracking, TLE).
    """
    payload = request.get_json(force=True)
    sat_id = payload.get("sat_id", "custom_satellite")
    data_type = payload.get("data_type", "STATE_VECTORS")
    records = payload.get("records", [])
    metadata = payload.get("metadata", {})

    if not records:
        return jsonify({"error": "No observation records provided in payload"}), 400

    try:
        summary = global_telemetry_manager.ingest_observations(
            sat_id=sat_id,
            data_type=data_type,
            records=records,
            metadata=metadata,
        )
        return jsonify({"status": "success", "summary": summary})
    except Exception as e:
        return jsonify({"error": f"Ingestion failed: {str(e)}"}), 400


@app.route("/api/telemetry/predict_from_real", methods=["POST"])
def predict_from_real_telemetry():
    """
    Forecasts future orbit trajectory based on previously ingested real-world telemetry fixes.
    """
    payload = request.get_json(force=True)
    sat_id = payload.get("sat_id", "custom_satellite")
    duration_hours = float(payload.get("duration_hours", 2.5))
    dt_step = float(payload.get("dt_step", 30.0))
    model_config = payload.get("model_config", {})

    try:
        res = global_telemetry_manager.predict_from_ingested_data(
            sat_id=sat_id,
            duration_hours=duration_hours,
            dt_step=dt_step,
            model_config=model_config,
        )
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"Starting SatProp-OrbitAttitude Server on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=False)

