# SatProp-OrbitAttitude RESTful API 接口规范手册

平台后端提供生产级标准 RESTful JSON 接口，支持卫星编目查询、多模型轨道推演、机器学习残差预测、姿态动力学仿真、地面站可见性窗口计算、星间链路（ISL）拓扑分析与遥测帧写入。

基础服务地址：`http://127.0.0.1:8080`

---

## 1. 卫星编目与基础信息

### `GET /api/satellites`
获取系统当前加载的全部真实卫星列表及其基础轨道参数。

#### 响应示例 (JSON):
```json
[
  {
    "id": "cartosat2",
    "name": "CARTOSAT2",
    "satnum": 29710,
    "epoch_utc": "2026-03-16T11:40:00+00:00",
    "inclination_deg": 97.912,
    "bstar": 0.0004821,
    "has_telemetry": false
  }
]
```

---

## 2. 多动力学模型轨道推演与 ML 残差修正

### `POST /api/propagate`
执行轨道高精度推演，支持 SGP4、高精度 Cowell 数值积分（RKF78、RK4、ABM4）以及物理+机器学习混合模型（HYBRID_ML）。

#### 请求参数 (JSON Body):
| 字段 | 类型 | 说明 | 默认值 |
| :--- | :--- | :--- | :--- |
| `sat_id` | string | 卫星唯一标识符 (`cartosat2`, `iss`, `tiangong`, `starlink`, `beidou`) | `cartosat2` |
| `propagator` | string | 预测器选择：`HYBRID_ML`, `SGP4`, `COWELL_RKF78`, `COWELL_RK4`, `COWELL_ABM4` | `HYBRID_ML` |
| `duration_hours` | float | 推演时长（小时） | `2.0` |
| `dt_step` | float | 输出时间采样步长（秒） | `30.0` |
| `use_j2` | bool | 是否启用 J2 地球扁率摄动 | `true` |
| `use_drag` | bool | 是否启用大气阻力摄动 | `true` |
| `use_sun` | bool | 是否启用太阳第三体引力摄动 | `true` |
| `use_moon` | bool | 是否启用月球第三体引力摄动 | `true` |
| `use_srp` | bool | 是否启用太阳光压与地影摄动 | `true` |

#### 响应示例 (JSON):
```json
{
  "satellite": "CARTOSAT2",
  "propagator": "HYBRID_ML",
  "times_s": [0.0, 30.0, 60.0, ...],
  "jds": [2461115.5, ...],
  "states_eci": [
    [-6795066.9, -21897.8, -2543.5, 22.9, -4753.1, 6010.4],
    ...
  ],
  "states_ecef": [...],
  "geodetic": [
    [28.45, 118.92, 505230.1],
    ...
  ],
  "predicted_ric_residuals": [...],
  "ml_metrics": {
    "reduction_pos_pct_1sigma": 85.52,
    "target_achieved": true,
    "uncorrected": { "pos_sigma_1_m": 14640.8 },
    "corrected": { "pos_sigma_1_m": 2119.7 }
  }
}
```

---

## 3. 数值积分方法横向基准对比

### `GET /api/benchmark`
对指定卫星同时运行 RK4、RKF78、ABM4 积分器，输出耗时、求值次数、能量守恒与各分量误差曲线。

#### 查询参数:
- `sat_id`: 卫星 ID (默认 `cartosat2`)
- `hours`: 弧段长度 (默认 `3.0`)
- `dt`: 采样步长 (默认 `30.0`)

---

## 4. 卫星姿态动力学推演与控制仿真

### `POST /api/attitude/simulate`
对卫星进行刚体欧拉动力学与四元数反馈姿态闭环推演。

#### 请求参数 (JSON Body):
```json
{
  "sat_id": "cartosat2",
  "mode": "NADIR",       // 或 "SUN"
  "duration_s": 600.0,
  "dt": 1.0,
  "kp": 2.5,
  "kd": 8.0,
  "max_torque": 0.5
}
```

#### 响应字段:
- `quaternions`: (N, 4) 瞬时姿态四元数序列 $[q_0, q_1, q_2, q_3]$
- `euler_angles_deg`: (N, 3) 瞬时欧拉角序列 $[Roll, Pitch, Yaw]$ (度)
- `angular_velocities`: (N, 3) 卫星本体角速度矢量 $[\omega_x, \omega_y, \omega_z]$ (rad/s)
- `control_torques`: (N, 3) 反作用飞轮/推力器输出控制力矩 (N·m)

---

## 5. 地面站过境可见性窗口计算

### `GET /api/visibility`
输入卫星 ID 及预报弧段，计算全球主要测控站（北京、喀什、三亚、斯瓦尔巴、马林迪等）的接触弧段（AOS/TCA/LOS）与仰角剖面。

---

## 6. 星间链路（ISL）星座拓扑分析

### `GET /api/isl`
基于地心视距穿透与地表遮蔽几何算法，计算当前星座中任意两星之间的可视性判定、距离、多普勒频移及邻接矩阵。

---

## 7. 轨道维持与矫正机动（"回归正轨"）

### `POST /api/station_keeping/maneuver`
计算因稀薄大气阻力导致轨道衰减漂移后的恢复标称轨道切向脉冲机动。

#### 请求示例:
```json
{
  "sat_id": "cartosat2",
  "nominal_sma_km": 7000.0
}
```

#### 响应示例:
```json
{
  "target_semi_major_axis_km": 7000.0,
  "delta_a_km": 14.82,
  "delta_v_magnitude_ms": 21.66,
  "burn_type": "Prograde",
  "initial_coe": { "a": 6985180.0, "e": 0.0018 },
  "corrected_coe": { "a": 7000000.0, "e": 0.0011 }
}
```

---

## 8. 实时遥测数据流接入

### `POST /api/telemetry/ingest`
提供外部真实遥感卫星遥测数据的接收与注入接口。

#### 请求示例:
```json
{
  "sat_id": "cartosat2",
  "timestamp_utc": "2026-03-16T12:00:00Z",
  "r_ecef": [-2189000.0, 4820000.0, 4120000.0],
  "v_ecef": [1500.0, -3200.0, 6800.0],
  "quaternion": [0.999, 0.01, 0.02, -0.01],
  "omega_body": [0.001, -0.001, 0.0002]
}
```
