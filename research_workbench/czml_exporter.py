"""
AGI STK / Cesium CZML Research-Grade Space Mission Telemetry Exporter
====================================================================
Transforms 4D continuous orbit propagation and 6-DOF attitude quaternions
into standard CZML (Cesium Language) packets compliant with:
- AGI Systems Tool Kit (STK) CZML Specification v1.0
- CesiumJS 4D Spacecraft Mission Visualization Standards
- Dual-trajectory comparative visualization (User Model vs. Authoritative Benchmark)
"""

import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Union
import numpy as np


class CZMLExporter:
    """
    Synthesizes standard CZML packets for research-grade 4D visualization in Cesium.
    """

    @staticmethod
    def _to_iso(dt: datetime) -> str:
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    @classmethod
    def export_mission_czml(
        cls,
        sat_id: str,
        sat_name: str,
        start_time_iso: str,
        times_s: List[float],
        model_states_eci: List[List[float]],
        auth_states_eci: Optional[List[List[float]]] = None,
        quaternions: Optional[List[List[float]]] = None,
        period_s: float = 5500.0,
    ) -> List[Dict[str, Any]]:
        """
        Builds a complete, multi-packet CZML array.
        Includes user model trajectory and optional authoritative comparison trajectory.
        """
        start_dt = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
        end_dt = start_dt + timedelta(seconds=float(times_s[-1]))

        avail_interval = f"{cls._to_iso(start_dt)}/{cls._to_iso(end_dt)}"

        # 1. CZML Document Header with Clock
        czml = [
            {
                "id": "document",
                "name": f"SatProp-OrbitAttitude: {sat_name} Flight Dynamics",
                "version": "1.0",
                "clock": {
                    "interval": avail_interval,
                    "currentTime": cls._to_iso(start_dt),
                    "multiplier": 60,
                    "range": "LOOP_STOP",
                    "step": "SYSTEM_CLOCK_MULTIPLIER",
                },
            }
        ]

        # 2. Pack User Model Trajectory into Cartesian Time-Series
        # Cesium format: [epoch_iso_or_seconds_offset, x, y, z, ...]
        cartesian_samples = []
        for i, t_offset in enumerate(times_s):
            m_state = model_states_eci[i]
            cartesian_samples.extend([
                round(float(t_offset), 2),
                round(float(m_state[0]), 3),
                round(float(m_state[1]), 3),
                round(float(m_state[2]), 3),
            ])

        user_sat_packet = {
            "id": f"Spacecraft/{sat_id}_Model",
            "name": f"{sat_name} (SatProp 模型推演轨)",
            "availability": avail_interval,
            "description": f"<h3>{sat_name}</h3><p>SatProp-OrbitAttitude 高精摄动与ML残差补偿模型推演轨道</p>",
            "position": {
                "epoch": cls._to_iso(start_dt),
                "referenceFrame": "INERTIAL",
                "interpolationAlgorithm": "LAGRANGE",
                "interpolationDegree": 5,
                "cartesian": cartesian_samples,
            },
            "point": {
                "color": {"rgba": [6, 182, 212, 255]},
                "pixelSize": 10,
                "outlineColor": {"rgba": [255, 255, 255, 255]},
                "outlineWidth": 2,
            },
            "path": {
                "show": True,
                "leadTime": float(period_s),
                "trailTime": float(period_s),
                "width": 2.5,
                "resolution": 30,
                "material": {
                    "polylineGlow": {
                        "color": {"rgba": [6, 182, 212, 220]},
                        "glowPower": 0.25,
                    }
                },
            },
            "label": {
                "text": f"🛰️ {sat_name}",
                "font": "12pt JetBrains Mono, sans-serif",
                "style": "FILL_AND_OUTLINE",
                "fillColor": {"rgba": [255, 255, 255, 255]},
                "outlineColor": {"rgba": [0, 0, 0, 200]},
                "outlineWidth": 3,
                "horizontalOrigin": "LEFT",
                "verticalOrigin": "BOTTOM",
                "pixelOffset": {"cartesian2": [14, -8]},
            },
        }

        # Pack Quaternions if provided
        # Cesium orientation quaternion format: [qx, qy, qz, qw] (scalar last)
        if quaternions and len(quaternions) == len(times_s):
            quat_samples = []
            for i, t_offset in enumerate(times_s):
                q = quaternions[i]
                # q in our system: [q0, q1, q2, q3] where q0 is scalar
                # Cesium expects: [x, y, z, w] -> [q1, q2, q3, q0]
                quat_samples.extend([
                    round(float(t_offset), 2),
                    round(float(q[1]), 5),
                    round(float(q[2]), 5),
                    round(float(q[3]), 5),
                    round(float(q[0]), 5),
                ])
            user_sat_packet["orientation"] = {
                "epoch": cls._to_iso(start_dt),
                "unitQuaternion": quat_samples,
                "interpolationAlgorithm": "LINEAR",
            }

        czml.append(user_sat_packet)

        # 3. Add Authoritative Benchmark Comparison Trajectory Packet if available
        if auth_states_eci and len(auth_states_eci) == len(times_s):
            auth_cartesian = []
            for i, t_offset in enumerate(times_s):
                a_state = auth_states_eci[i]
                auth_cartesian.extend([
                    round(float(t_offset), 2),
                    round(float(a_state[0]), 3),
                    round(float(a_state[1]), 3),
                    round(float(a_state[2]), 3),
                ])

            auth_packet = {
                "id": f"Spacecraft/{sat_id}_Authoritative",
                "name": f"{sat_name} (NASA/Skyfield 权威基准真轨)",
                "availability": avail_interval,
                "description": f"<h3>{sat_name} 权威科研基准</h3><p>USNO / Skyfield IAU-2006 GCRS 权威历元数据，用于对齐与验证</p>",
                "position": {
                    "epoch": cls._to_iso(start_dt),
                    "referenceFrame": "INERTIAL",
                    "interpolationAlgorithm": "LAGRANGE",
                    "interpolationDegree": 5,
                    "cartesian": auth_cartesian,
                },
                "point": {
                    "color": {"rgba": [16, 185, 129, 255]},
                    "pixelSize": 8,
                    "outlineColor": {"rgba": [255, 255, 255, 255]},
                    "outlineWidth": 1.5,
                },
                "path": {
                    "show": True,
                    "leadTime": float(period_s),
                    "trailTime": float(period_s),
                    "width": 2.0,
                    "resolution": 30,
                    "material": {
                        "polylineGlow": {
                            "color": {"rgba": [16, 185, 129, 200]},
                            "glowPower": 0.2,
                        }
                    },
                },
                "label": {
                    "text": "🎯 权威真轨基准",
                    "font": "10pt JetBrains Mono, sans-serif",
                    "fillColor": {"rgba": [16, 185, 129, 255]},
                    "outlineColor": {"rgba": [0, 0, 0, 200]},
                    "outlineWidth": 2,
                    "horizontalOrigin": "LEFT",
                    "verticalOrigin": "TOP",
                    "pixelOffset": {"cartesian2": [14, 8]},
                },
            }
            czml.append(auth_packet)

        return czml


def generate_mission_czml(
    sat_id: str,
    sat_name: str,
    start_time_iso: str,
    times_s: List[float],
    model_states_eci: List[List[float]],
    auth_states_eci: Optional[List[List[float]]] = None,
    quaternions: Optional[List[List[float]]] = None,
    period_s: float = 5500.0,
) -> str:
    """Convenience helper returning formatted CZML JSON string."""
    data = CZMLExporter.export_mission_czml(
        sat_id=sat_id,
        sat_name=sat_name,
        start_time_iso=start_time_iso,
        times_s=times_s,
        model_states_eci=model_states_eci,
        auth_states_eci=auth_states_eci,
        quaternions=quaternions,
        period_s=period_s,
    )
    return json.dumps(data, indent=2)
