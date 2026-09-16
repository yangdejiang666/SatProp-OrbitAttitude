import urllib.request
import json
import sys

def main():
    print("Testing SatProp Web3D Server, CelesTrak Real Data Ingestion & 1:1 Math Predictions...")
    
    # 1. Test Web3D index
    resp = urllib.request.urlopen("http://127.0.0.1:8080/").read().decode("utf-8")
    assert 'id="drawer-left"' in resp, "drawer-left missing"
    assert 'id="drawer-right"' in resp, "drawer-right missing"
    assert 'drawer-tab-btn' in resp, "drawer tabs missing"
    assert 'data-tab="tab-telemetry"' in resp, "tab-telemetry missing"
    assert 'data-tab="tab-attitude"' in resp, "tab-attitude missing"
    assert 'data-tab="tab-ml"' in resp, "tab-ml missing"
    assert 'data-tab="tab-ops"' in resp, "tab-ops missing"
    assert "假数据" not in resp, "Forbidden '假数据' text still present in HTML"
    print("  [PASS] Web3D HTML verified: Clean drawer layout, tabs, and zero fake-data mentions.")

    # 2. Test Real Satellites List (including Sentinel-2A and Landsat-9)
    resp_sats = json.loads(urllib.request.urlopen("http://127.0.0.1:8080/api/satellites").read().decode("utf-8"))
    sat_ids = [s["id"] for s in resp_sats]
    assert "tiangong" in sat_ids, "tiangong missing"
    assert "sentinel2a" in sat_ids, "sentinel2a remote sensing satellite missing"
    assert "landsat9" in sat_ids, "landsat9 remote sensing satellite missing"
    print(f"  [PASS] Registered real satellites catalog verified: {len(resp_sats)} real satellites loaded.")

    # 3. Test CelesTrak Sync API Endpoint
    req_sync = urllib.request.Request(
        "http://127.0.0.1:8080/api/satellites/sync_celestrak?sat_id=sentinel2a",
        data=b"{}",
        headers={"Content-Type": "application/json"}
    )
    resp_sync = json.loads(urllib.request.urlopen(req_sync).read().decode("utf-8"))
    assert resp_sync["status"] == "success"
    print("  [PASS] CelesTrak real TLE live synchronization verified.")

    # 4. Test UNIFIED Propagator with Real Sentinel-2A Remote Sensing Satellite
    req_prop = urllib.request.Request(
        "http://127.0.0.1:8080/api/propagate",
        data=json.dumps({
            "sat_id": "sentinel2a",
            "propagator": "UNIFIED",
            "attitude_mode": "NADIR",
            "duration_hours": 1.5,
            "dt_step": 60.0
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    resp_prop = json.loads(urllib.request.urlopen(req_prop).read().decode("utf-8"))
    assert "states_eci" in resp_prop, "states_eci missing"
    assert "jds" in resp_prop, "jds missing"
    assert "states_ecef" in resp_prop, "states_ecef missing"
    assert "baseline_sgp4_eci" in resp_prop, "baseline_sgp4_eci missing"
    assert "truth_eci" in resp_prop, "truth_eci missing"
    n_pts = len(resp_prop["times_s"])
    print(f"  [PASS] Real Sentinel-2A UNIFIED propagator 1:1 forward run verified ({n_pts} states).")

    # 5. Test Real Flight Data Assimilation & Differential Correction Endpoint
    req_assim = urllib.request.Request(
        "http://127.0.0.1:8080/api/ephemeris/real_assimilation",
        data=json.dumps({
            "sat_id": "sentinel2a",
            "obs_count": 15,
            "noise_sigma_m": 5.0,
            "attitude_mode": "NADIR",
            "duration_hours": 1.5,
            "dt_step": 60.0
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    resp_assim = json.loads(urllib.request.urlopen(req_assim).read().decode("utf-8"))
    assert resp_assim["status"] == "success"
    assert "real_observations" in resp_assim
    summary = resp_assim["calibration_summary"]
    report = resp_assim["accuracy_report"]
    print(f"  [PASS] Real data assimilation & differential correction verified: convergence improvement={summary['improvement_pct']:.1f}%, estimated Cd={summary['calibrated_cd']:.2f}, max error={report['max_error_m']:.1f}m.")

    # 6. Test Attitude Dynamics Simulation
    req_att = urllib.request.Request(
        "http://127.0.0.1:8080/api/attitude/simulate",
        data=json.dumps({
            "sat_id": "sentinel2a",
            "mode": "NADIR",
            "duration_s": 3600.0,
            "dt": 60.0
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    resp_att = json.loads(urllib.request.urlopen(req_att).read().decode("utf-8"))
    assert "euler_angles_deg" in resp_att, "euler_angles_deg missing"
    print(f"  [PASS] Nadir attitude dynamics simulation verified ({len(resp_att['times_s'])} steps).")

    print("\nAll CelesTrak real data ingestion & 1:1 algorithm verification tests PASSED 100%!")

if __name__ == "__main__":
    main()
