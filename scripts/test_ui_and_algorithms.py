import urllib.request
import json
import sys

def main():
    print("Testing SatProp Web3D Server & 1:1 Math Predictions...")
    
    # 1. Test Web3D index
    resp = urllib.request.urlopen("http://127.0.0.1:8080/").read().decode("utf-8")
    assert 'id="drawer-left"' in resp, "drawer-left missing"
    assert 'id="drawer-right"' in resp, "drawer-right missing"
    assert 'drawer-tab-btn' in resp, "drawer tabs missing"
    assert 'data-tab="tab-telemetry"' in resp, "tab-telemetry missing"
    assert 'data-tab="tab-attitude"' in resp, "tab-attitude missing"
    assert 'data-tab="tab-ml"' in resp, "tab-ml missing"
    assert 'data-tab="tab-ops"' in resp, "tab-ops missing"
    print("  [PASS] Web3D HTML drawer & internal tab layout verified.")

    # 2. Test UNIFIED Propagator via /api/propagate
    req = urllib.request.Request(
        "http://127.0.0.1:8080/api/propagate",
        data=json.dumps({
            "sat_id": "tiangong",
            "propagator": "UNIFIED",
            "attitude_mode": "SUN",
            "duration_hours": 1.0,
            "dt_step": 60.0
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    resp_unified = json.loads(urllib.request.urlopen(req).read().decode("utf-8"))
    assert "states_eci" in resp_unified, "states_eci missing"
    assert "jds" in resp_unified, "jds missing"
    assert "states_ecef" in resp_unified, "states_ecef missing"
    assert "baseline_sgp4_eci" in resp_unified, "baseline_sgp4_eci missing"
    assert "truth_eci" in resp_unified, "truth_eci missing"
    n_pts = len(resp_unified["times_s"])
    print(f"  [PASS] UNIFIED propagator 1:1 forward dynamic run verified ({n_pts} states).")

    # 3. Test Synthetic Calibration endpoint
    req_calib = urllib.request.Request(
        "http://127.0.0.1:8080/api/predict/synthetic_calibration",
        data=json.dumps({
            "sat_id": "tiangong",
            "obs_count": 10,
            "noise_sigma_m": 5.0,
            "attitude_mode": "NADIR",
            "duration_hours": 1.0,
            "dt_step": 60.0
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    resp_calib = json.loads(urllib.request.urlopen(req_calib).read().decode("utf-8"))
    assert resp_calib["status"] == "success"
    summary = resp_calib["calibration_summary"]
    report = resp_calib["accuracy_report"]
    print(f"  [PASS] Synthetic calibration verified: improvement={summary['improvement_pct']:.1f}%, Cd={summary['calibrated_cd']:.2f}, error reduction={report['reduction_pct']:.1f}%.")

    # 4. Test Attitude Simulation endpoint
    req_att = urllib.request.Request(
        "http://127.0.0.1:8080/api/attitude/simulate",
        data=json.dumps({
            "sat_id": "tiangong",
            "mode": "NADIR",
            "duration_s": 3600.0,
            "dt": 60.0
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    resp_att = json.loads(urllib.request.urlopen(req_att).read().decode("utf-8"))
    assert "euler_angles_deg" in resp_att, "euler_angles_deg missing"
    print(f"  [PASS] Attitude dynamics simulation verified ({len(resp_att['times_s'])} steps).")

    print("\nAll integration & model verification tests PASSED successfully!")

if __name__ == "__main__":
    main()
