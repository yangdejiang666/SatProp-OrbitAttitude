"""
Example Script: Ingesting Real Satellite Remote Sensing & Telemetry Data
=======================================================================
Demonstrates how external users can feed raw satellite observations
(GNSS geodetic fixes, radar passes, or Cartesian state vectors) into
SatProp-OrbitAttitude to perform high-precision forward orbit prediction.
"""

import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import json
import urllib.request
from datetime import datetime, timezone, timedelta

SERVER_URL = "http://127.0.0.1:8080"


def generate_sample_remote_sensing_telemetry():
    """
    Creates a sample 30-minute tracking pass from a low-Earth optical remote sensing satellite.
    Format: WGS84 Geodetic GPS fixes (Lat, Lon, Alt, Speed).
    """
    base_time = datetime(2026, 3, 16, 12, 0, 0, tzinfo=timezone.utc)
    records = []

    # Nominal sun-synchronous orbit points (inclination ~97.5 deg, altitude ~505 km)
    lat_start = -15.0
    lon_start = 110.0

    for i in range(10):
        t = base_time + timedelta(seconds=i * 120)  # Every 2 minutes
        # Satellite moving north-northwest
        lat = lat_start + i * 4.2
        lon = lon_start - i * 0.8
        alt_m = 505200.0 + (i % 3) * 45.0  # ~505.2 km with slight GPS noise
        speed_ms = 7612.0 - (i % 2) * 1.5

        records.append({
            "timestamp": t.isoformat(),
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "alt_m": round(alt_m, 1),
            "speed_ms": round(speed_ms, 2),
            "heading_deg": 348.5,
        })

    return records


def main():
    print("=" * 80)
    print("🛰️  SatProp-OrbitAttitude: 真实遥感卫星星历与遥测数据接入示例")
    print(f"📡 目标服务地址: {SERVER_URL}")
    print("=" * 80)

    sat_id = "user_remote_sensing_sat_01"
    telemetry_records = generate_sample_remote_sensing_telemetry()

    print(f"\n[1/3] 准备录入 {len(telemetry_records)} 条观测历元记录:")
    for r in telemetry_records[:3]:
        print(f"      - 时间: {r['timestamp']} | 纬度: {r['lat']}° | 经度: {r['lon']}° | 高度: {r['alt_m']/1000:.1f} km")
    print("      ... (共 10 条)")

    # 1. 发送录入请求
    ingest_payload = {
        "sat_id": sat_id,
        "data_type": "GEODETIC_GPS",
        "records": telemetry_records,
        "metadata": {
            "satellite_name": "GAOFEN-CUSTOM-01",
            "sensor": "Onboard_Multi_Constellation_GNSS",
            "organization": "Satellite Remote Sensing Center",
        }
    }

    req = urllib.request.Request(
        f"{SERVER_URL}/api/telemetry/ingest_real",
        data=json.dumps(ingest_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req) as resp:
            ingest_res = json.loads(resp.read().decode("utf-8"))
            print(f"\n[2/3] ✓ 数据录入成功!")
            print(f"      - 卫星标识: {ingest_res['summary']['sat_id']}")
            print(f"      - 录入点数: {ingest_res['summary']['records_ingested']}")
            print(f"      - 历元跨度: {ingest_res['summary']['time_span_start']} -> {ingest_res['summary']['time_span_end']}")
    except Exception as e:
        print(f"❌ 录入请求失败: {e}")
        return

    # 2. 触发基于录入数据的统一高精数学模型预测
    print(f"\n[3/3] 启动统一高精度数学模型进行未来轨道推演预测...")
    predict_payload = {
        "sat_id": sat_id,
        "duration_hours": 2.5,  # 预测未来 2.5 小时
        "dt_step": 30.0,
        "model_config": {
            "integrator": "RKF78",
            "use_j2": True,
            "use_j3": True,
            "use_j4": True,
            "use_drag": True,
            "attitude_mode": "NADIR",
            "cd": 2.2,
            "mass_kg": 720.0,
        }
    }

    req_pred = urllib.request.Request(
        f"{SERVER_URL}/api/telemetry/predict_from_real",
        data=json.dumps(predict_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req_pred) as resp:
            pred_res = json.loads(resp.read().decode("utf-8"))
            print(f"✓ 真实数据驱动的轨道预测解算完成!")
            print(f"  - 积分耗时: {pred_res.get('wall_time_ms', 0):.2f} ms")
            print(f"  - 生成外推轨道点: {len(pred_res['states_eci'])} 个")
            print(f"  - 预报近地点 (Perigee): {pred_res['perigee']['alt_km']:.2f} km")
            print(f"  - 预报远地点 (Apogee): {pred_res['apogee']['alt_km']:.2f} km")
            if pred_res.get("coes"):
                c = pred_res["coes"][0]
                print(f"  - 轨道半长轴 a: {c['a']/1000:.2f} km | 偏心率 e: {c['e']:.5f} | 倾角 i: {c['i_deg']:.2f}°")

            print("\n🎉 真实卫星遥测数据接入与高精数学预测全流程验证成功！")
    except Exception as e:
        print(f"❌ 预测请求失败: {e}")


if __name__ == "__main__":
    main()
