"""
Quaternion Algebra and Kinematics for Satellite Attitude Dynamics
Standard Hamilton convention: q = [q0, q1, q2, q3] where q0 is scalar, [q1, q2, q3] is vector.
Reference: Markley & Crassidis (2014) Fundamentals of Spacecraft Attitude Determination and Control.
"""

import math
from typing import Tuple
import numpy as np


def quat_normalize(q: np.ndarray) -> np.ndarray:
    """Normalize quaternion to unit length."""
    norm = float(np.linalg.norm(q))
    if norm < 1e-12:
        return np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float64)
    return q / norm


def quat_multiply(q: np.ndarray, p: np.ndarray) -> np.ndarray:
    """
    Quaternion product q (x) p (Hamilton product).
    """
    q0, q1, q2, q3 = q[0], q[1], q[2], q[3]
    p0, p1, p2, p3 = p[0], p[1], p[2], p[3]

    return np.array([
        q0 * p0 - q1 * p1 - q2 * p2 - q3 * p3,
        q0 * p1 + q1 * p0 + q2 * p3 - q3 * p2,
        q0 * p2 - q1 * p3 + q2 * p0 + q3 * p1,
        q0 * p3 + q1 * p2 - q2 * p1 + q3 * p0,
    ], dtype=np.float64)


def quat_conjugate(q: np.ndarray) -> np.ndarray:
    """Quaternion conjugate q* = [q0, -q1, -q2, -q3]."""
    return np.array([q[0], -q[1], -q[2], -q[3]], dtype=np.float64)


def quat_to_dcm(q: np.ndarray) -> np.ndarray:
    """
    Direction Cosine Matrix (Rotation matrix R) from inertial to body frame:
    v_body = R @ v_inertial
    """
    q = quat_normalize(q)
    q0, q1, q2, q3 = q[0], q[1], q[2], q[3]

    return np.array([
        [
            q0**2 + q1**2 - q2**2 - q3**2,
            2.0 * (q1 * q2 + q0 * q3),
            2.0 * (q1 * q3 - q0 * q2),
        ],
        [
            2.0 * (q1 * q2 - q0 * q3),
            q0**2 - q1**2 + q2**2 - q3**2,
            2.0 * (q2 * q3 + q0 * q1),
        ],
        [
            2.0 * (q1 * q3 + q0 * q2),
            2.0 * (q2 * q3 - q0 * q1),
            q0**2 - q1**2 - q2**2 + q3**2,
        ],
    ], dtype=np.float64)


def dcm_to_quat(R: np.ndarray) -> np.ndarray:
    """Shepperd's algorithm to convert DCM to unit quaternion."""
    tr = np.trace(R)
    if tr > 0.0:
        s = math.sqrt(tr + 1.0) * 2.0
        q0 = 0.25 * s
        q1 = (R[1, 2] - R[2, 1]) / s
        q2 = (R[2, 0] - R[0, 2]) / s
        q3 = (R[0, 1] - R[1, 0]) / s
    elif (R[0, 0] > R[1, 1]) and (R[0, 0] > R[2, 2]):
        s = math.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2]) * 2.0
        q0 = (R[1, 2] - R[2, 1]) / s
        q1 = 0.25 * s
        q2 = (R[0, 1] + R[1, 0]) / s
        q3 = (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = math.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2]) * 2.0
        q0 = (R[2, 0] - R[0, 2]) / s
        q1 = (R[0, 1] + R[1, 0]) / s
        q2 = 0.25 * s
        q3 = (R[1, 2] + R[2, 1]) / s
    else:
        s = math.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1]) * 2.0
        q0 = (R[0, 1] - R[1, 0]) / s
        q1 = (R[0, 2] + R[2, 0]) / s
        q2 = (R[1, 2] + R[2, 1]) / s
        q3 = 0.25 * s

    return quat_normalize(np.array([q0, q1, q2, q3], dtype=np.float64))


def quat_to_euler(q: np.ndarray) -> Tuple[float, float, float]:
    """
    Convert quaternion to Euler 3-2-1 angles (Roll, Pitch, Yaw) in degrees.
    """
    R = quat_to_dcm(q)
    # Roll around X: atan2(R[1,2], R[2,2])
    roll_rad = math.atan2(R[1, 2], R[2, 2])
    # Pitch around Y: -asin(R[0,2])
    pitch_rad = math.asin(-np.clip(R[0, 2], -1.0, 1.0))
    # Yaw around Z: atan2(R[0,1], R[0,0])
    yaw_rad = math.atan2(R[0, 1], R[0, 0])

    return (
        math.degrees(roll_rad),
        math.degrees(pitch_rad),
        math.degrees(yaw_rad),
    )


def euler_to_quat(roll_deg: float, pitch_deg: float, yaw_deg: float) -> np.ndarray:
    """
    Convert Euler 3-2-1 angles (Roll, Pitch, Yaw) in degrees to quaternion.
    """
    r = math.radians(roll_deg) * 0.5
    p = math.radians(pitch_deg) * 0.5
    y = math.radians(yaw_deg) * 0.5

    cr = math.cos(r)
    sr = math.sin(r)
    cp = math.cos(p)
    sp = math.sin(p)
    cy = math.cos(y)
    sy = math.sin(y)

    q0 = cr * cp * cy + sr * sp * sy
    q1 = sr * cp * cy - cr * sp * sy
    q2 = cr * sp * cy + sr * cp * sy
    q3 = cr * cp * sy - sr * sp * cy

    return quat_normalize(np.array([q0, q1, q2, q3], dtype=np.float64))


def quat_derivative(q: np.ndarray, omega_body: np.ndarray) -> np.ndarray:
    """
    Kinematic differential equation dq/dt = 0.5 * Omega(omega) * q
    where omega_body is angular velocity vector [wx, wy, wz] in body frame [rad/s].
    """
    wx, wy, wz = omega_body[0], omega_body[1], omega_body[2]
    Omega = np.array([
        [0.0, -wx, -wy, -wz],
        [ wx, 0.0,  wz, -wy],
        [ wy, -wz, 0.0,  wx],
        [ wz,  wy, -wx, 0.0],
    ], dtype=np.float64)

    return 0.5 * (Omega @ q)
