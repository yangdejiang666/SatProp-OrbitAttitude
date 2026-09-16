# 真实卫星轨道遥感与遥测数据接入指南 (Real Data Integration Guide)

本文档面向后续需要将**真实卫星遥感星历数据、星载 GNSS 定位点、地面雷达测控点或 NORAD TLE 根数**接入本平台高精动力学数学预测模型的开发者。

---

## 1. 总体架构与数学预测流程

```
[ 外部真实遥感数据源 ]
   │  ├── 星载 GPS/北斗接收机高频定位点 (Lat, Lon, Alt, Speed)
   │  ├── 地面测控站雷达过境跟踪数据 (Azimuth, Elevation, Slant Range)
   │  ├── 空间态势感知笛卡尔星历 (ECI / ECEF: X, Y, Z, Vx, Vy, Vz)
   │  └── 编目 TLE 两行数 / CCSDS OEM 轨道报文
   ▼
[ 遥测数据摄取网关 (service/telemetry_interface.py) ]
   │  ├── 坐标系标准化转换 (WGS-84 / ECEF / SEZ  -->  J2000 ECI)
   │  ├── 历元时间系统统一 (UTC / Unix Timestamp  -->  Julian Date)
   │  └── 观测残差滤波与先验反演 (Least-Squares Differential Correction)
   ▼
[ 统一高精度轨道动力学预测数学模型 (UnifiedOrbitPredictor) ]
   ├── 二体中心引力 + 非球形引力摄动 ($J_2, J_3, J_4$ 阶谐项)
   ├── 大气阻力模型 + 卫星三轴姿态耦合迎风面动态调制 (Nadir / Sun)
   ├── 日月第三体引力摄动 + 太阳辐射光压 (SRP 圆柱阴影)
   ├── 高阶数值积分器 (RKF78 自适应步长 / ABM4 预估-校正多步法)
   └── LSTM / Transformer 时序残差神经网络实时补偿 (RIC 坐标系)
   ▼
[ 高精前向轨道预报星历 & 3D WebGL 态势推演平台 ]
```

---

## 2. 接口端点规范 (API Endpoints)

所有接口均运行在服务端 `http://127.0.0.1:8080`（或配置的生产域名端口）。

### 接口一：录入真实观测数据 `POST /api/telemetry/ingest_real`

将一段历史或实时的轨道观测片段批量传入系统。

#### 请求体格式 (JSON)

#### 模式 A：星载 GNSS 定位经纬高 (GEODETIC_GPS) - 最推荐

适用于星载 GPS / 北斗直接输出的 WGS84 导航电文：

```json
{
  "sat_id": "gaofen_01",
  "data_type": "GEODETIC_GPS",
  "records": [
    {
      "timestamp": "2026-03-16T12:00:00Z",
      "lat": 28.4521,
      "lon": 118.9215,
      "alt_m": 505200.0,
      "speed_ms": 7612.0,
      "heading_deg": 348.5
    },
    {
      "timestamp": "2026-03-16T12:02:00Z",
      "lat": 32.6518,
      "lon": 118.1204,
      "alt_m": 505250.0,
      "speed_ms": 7611.5,
      "heading_deg": 348.2
    }
  ],
  "metadata": {
    "satellite_name": "高分遥感一号",
    "sensor": "Dual_Frequency_GNSS_Receiver"
  }
}
```

#### 模式 B：笛卡尔状态矢量 (STATE_VECTORS)

适用于具有精密定轨能力输出的惯性系 (ECI) 或地固系 (ECEF) 坐标：

```json
{
  "sat_id": "custom_sat_02",
  "data_type": "STATE_VECTORS",
  "records": [
    {
      "timestamp": "2026-03-16T12:00:00Z",
      "frame": "ECI",
      "x": -3543527.4,
      "y": 6024117.3,
      "z": -11768.6,
      "vx": -5120.4,
      "vy": -2980.2,
      "vz": 4350.1
    }
  ]
}
```

#### 模式 C：地面站雷达测角测距 (RADAR_AZ_EL_RANGE)

适用于地面单站跟踪雷达或光学望远镜测角测距数据：

```json
{
  "sat_id": "tracking_target",
  "data_type": "RADAR_AZ_EL_RANGE",
  "records": [
    {
      "timestamp": "2026-03-16T12:05:00Z",
      "station_lat": 40.05,
      "station_lon": 116.32,
      "station_alt_m": 50.0,
      "az_deg": 124.5,
      "el_deg": 35.2,
      "range_km": 820.5
    }
  ]
}
```

#### 返回结果示例

```json
{
  "status": "success",
  "summary": {
    "sat_id": "gaofen_01",
    "data_type": "GEODETIC_GPS",
    "records_ingested": 10,
    "total_records_buffered": 10,
    "time_span_start": "2026-03-16T12:00:00+00:00",
    "time_span_end": "2026-03-16T12:18:00+00:00"
  }
}
```

---

### 接口二：基于已录入数据启动高精预测 `POST /api/telemetry/predict_from_real`

系统会自动从摄取的观测样本中提取最新历元作为初值，执行差分校正与动力学前向推演。

#### 请求体格式 (JSON)

```json
{
  "sat_id": "gaofen_01",
  "duration_hours": 3.0,
  "dt_step": 30.0,
  "model_config": {
    "integrator": "RKF78",
    "use_j2": true,
    "use_j3": true,
    "use_j4": true,
    "use_drag": true,
    "use_sun": true,
    "use_moon": true,
    "use_srp": true,
    "attitude_mode": "NADIR",
    "cd": 2.2,
    "mass_kg": 680.0
  }
}
```

#### 返回结果核心字段

- `states_eci`: 前向预测时间跨度内每隔 30s 的 J2000 惯性位置与速度 `[[x, y, z, vx, vy, vz], ...]`。
- `geodetic`: 星下点经纬高时序 `[[lat_deg, lon_deg, alt_m], ...]`。
- `perigee` / `apogee`: 预测轨道近地点与远地点的精确空间坐标和大地高。
- `coes`: 拟合校准后的开普勒六根数（长半轴、偏心率、倾角、升交点赤经等）。
- `calibration_summary`: 针对输入真实观测的校准反演结果（先验 RMS 误差、后验收敛 RMS 误差、反演等效阻力系数 $C_D$）。

---

## 3. Python 接入代码示例

系统在 `scripts/ingest_real_telemetry_example.py` 中提供了完整可运行的接入脚本。

使用标准 Python `requests` 或 `urllib` 库即可快速集成：

```python
import requests

SERVER = "http://127.0.0.1:8080"

# 1. 发送观测数据
payload = {
    "sat_id": "my_remote_sat",
    "data_type": "GEODETIC_GPS",
    "records": [
        {"timestamp": "2026-03-16T12:00:00Z", "lat": 28.45, "lon": 118.92, "alt_m": 505200.0, "speed_ms": 7612.0},
        {"timestamp": "2026-03-16T12:05:00Z", "lat": 35.10, "lon": 122.40, "alt_m": 505350.0, "speed_ms": 7610.0},
    ]
}
resp_ingest = requests.post(f"{SERVER}/api/telemetry/ingest_real", json=payload)
print("录入结果:", resp_ingest.json())

# 2. 触发高精轨道预测
pred_config = {
    "sat_id": "my_remote_sat",
    "duration_hours": 2.0,
    "dt_step": 30.0,
    "model_config": {"integrator": "RKF78", "attitude_mode": "NADIR"}
}
resp_pred = requests.post(f"{SERVER}/api/telemetry/predict_from_real", json=pred_config)
prediction = resp_pred.json()
print("预测轨道点数:", len(prediction["states_eci"]))
print("近地点高:", prediction["perigee"]["alt_km"], "km")
```

---

## 4. 命令行一键录入支持

通过主入口命令行工具可直接录入本地保存的遥测 JSON 文件：

```bash
# 录入真实遥测文件
py -3 main.py ingest --file path/to/my_telemetry.json --sat my_sat --type GEODETIC_GPS

# 启动统一高精度预测
py -3 main.py predict --sat my_sat --integrator RKF78 --hours 2.5 --step 30.0
```
