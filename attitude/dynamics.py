"""
Spacecraft Attitude Dynamics, Environmental Perturbation Torques, and Control Modes
Includes:
- Euler's rotational equations of motion
- Gravity gradient torque
- Closed-loop quaternion feedback attitude control (PD / Lyapunov)
- Earth Nadir Pointing (Remote Sensing payload mode)
- Sun Pointing (Power generation mode)
- Orbit station-keeping thruster maneuver simulation
Reference: Sidi (1997) Spacecraft Dynamics and Control; Markley & Crassidis (2014).
"""

from typing import Dict, Any, List, Tuple
import numpy as np
from core.constants import MU_EARTH
from attitude.quaternions import (
    quat_normalize,
    quat_multiply,
    quat_conjugate,
    quat_to_dcm,
    dcm_to_quat,
    quat_to_euler,
    quat_derivative,
)


class AttitudeSimulator:
    """
    Spacecraft Attitude Propagator and Control Law Simulator.
    """

    def __init__(
        self,
        inertia_diag: Tuple[float, float, float] = (150.0, 180.0, 100.0),
        kp: float = 2.5,
        kd: float = 8.0,
        max_torque_nm: float = 0.5,
    ):
        # Principal moments of inertia [kg * m^2]
        self.I = np.diag(inertia_diag).astype(np.float64)
        self.I_inv = np.linalg.inv(self.I)
        self.kp = kp
        self.kd = kd
        self.max_torque = max_torque_nm

    def gravity_gradient_torque(self, r_eci: np.ndarray, q_bi: np.ndarray) -> np.ndarray:
        """
        Compute gravity gradient torque in spacecraft body frame [N * m]:
        tau_gg = 3 * mu / r^5 * (r_body x (I * r_body))
        """
        r_norm = float(np.linalg.norm(r_eci))
        if r_norm < 1e-3:
            return np.zeros(3)

        # Transform r_eci to body frame: r_b = R_bi @ r_eci
        R_bi = quat_to_dcm(q_bi)
        r_b = R_bi @ r_eci

        factor = 3.0 * MU_EARTH / (r_norm**5)
        return factor * np.cross(r_b, self.I @ r_b)

    def compute_nadir_target_quat(self, r_eci: np.ndarray, v_eci: np.ndarray) -> np.ndarray:
        """
        Compute desired quaternion for Earth Nadir Pointing (Remote Sensing payload):
        - Body +Z axis points to Earth center (-r_eci)
        - Body +Y axis points normal to orbit plane (- (r x v))
        - Body +X axis completes right-handed system (along velocity direction)
        """
        r_norm = np.linalg.norm(r_eci)
        h_vec = np.cross(r_eci, v_eci)
        h_norm = np.linalg.norm(h_vec)

        if r_norm < 1e-3 or h_norm < 1e-3:
            return np.array([1.0, 0.0, 0.0, 0.0])

        z_b = -r_eci / r_norm  # Nadir
        y_b = -h_vec / h_norm  # Opposite to angular momentum
        x_b = np.cross(y_b, z_b)  # In direction of flight

        R_des = np.vstack([x_b, y_b, z_b])
        return dcm_to_quat(R_des)

    def compute_sun_target_quat(self, r_sun_eci: np.ndarray) -> np.ndarray:
        """
        Compute desired quaternion for Sun Pointing (Solar Array illumination):
        - Body +Z points towards Sun
        """
        sun_dir = r_sun_eci / np.linalg.norm(r_sun_eci)
        # Arbitrary perpendicular reference
        ref = np.array([0.0, 0.0, 1.0]) if abs(sun_dir[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
        y_b = np.cross(sun_dir, ref)
        y_b /= np.linalg.norm(y_b)
        x_b = np.cross(y_b, sun_dir)
        z_b = sun_dir

        R_des = np.vstack([x_b, y_b, z_b])
        return dcm_to_quat(R_des)

    def control_torque(
        self,
        q_curr: np.ndarray,
        omega_curr: np.ndarray,
        q_target: np.ndarray,
        omega_target: np.ndarray = None,
    ) -> np.ndarray:
        """
        Quaternion feedback PD control law:
        tau_c = -Kp * q_error_vector - Kd * (omega_curr - omega_target)
        """
        if omega_target is None:
            omega_target = np.zeros(3)

        # Error quaternion: q_err = q_target* (x) q_curr
        q_err = quat_multiply(quat_conjugate(q_target), q_curr)
        if q_err[0] < 0:
            q_err = -q_err  # Shortest rotation path

        q_err_v = q_err[1:4]  # Vector part
        d_omega = omega_curr - omega_target

        torque = -self.kp * q_err_v - self.kd * d_omega
        # Actuator saturation
        torque_norm = np.linalg.norm(torque)
        if torque_norm > self.max_torque:
            torque = torque * (self.max_torque / torque_norm)

        return torque

    def propagate_attitude(
        self,
        times_s: np.ndarray,
        orbit_states_eci: np.ndarray,
        mode: str = "NADIR",
        q0: np.ndarray = None,
        omega0: np.ndarray = None,
        r_sun_eci: np.ndarray = None,
    ) -> Dict[str, Any]:
        """
        Propagate spacecraft attitude and angular velocity over time trajectory.
        Supports RK4 integration of rigid-body dynamics and environmental torques.
        """
        n_steps = len(times_s)
        if q0 is None:
            q0 = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float64)
        if omega0 is None:
            omega0 = np.array([0.001, -0.002, 0.001], dtype=np.float64)

        q_arr = np.zeros((n_steps, 4), dtype=np.float64)
        omega_arr = np.zeros((n_steps, 3), dtype=np.float64)
        euler_arr = np.zeros((n_steps, 3), dtype=np.float64)
        torques_arr = np.zeros((n_steps, 3), dtype=np.float64)

        q_curr = quat_normalize(q0.copy())
        omega_curr = omega0.copy()

        for i in range(n_steps):
            q_arr[i] = q_curr
            omega_arr[i] = omega_curr
            euler_arr[i] = quat_to_euler(q_curr)

            if i == n_steps - 1:
                break

            dt = times_s[i + 1] - times_s[i]
            r_eci = orbit_states_eci[i, 0:3]
            v_eci = orbit_states_eci[i, 3:6]

            # Determine desired target quaternion
            if mode.upper() == "NADIR":
                q_des = self.compute_nadir_target_quat(r_eci, v_eci)
            elif mode.upper() == "SUN" and r_sun_eci is not None:
                q_des = self.compute_sun_target_quat(r_sun_eci)
            else:
                q_des = np.array([1.0, 0.0, 0.0, 0.0])

            # Environmental torque
            tau_gg = self.gravity_gradient_torque(r_eci, q_curr)
            # Control torque
            tau_ctrl = self.control_torque(q_curr, omega_curr, q_des)
            tau_total = tau_gg + tau_ctrl
            torques_arr[i] = tau_total

            # Euler rotational equations: I * dw/dt + w x (I * w) = tau
            # dw/dt = I_inv * (tau - w x (I * w))
            def attitude_deriv(q, w):
                dq = quat_derivative(q, w)
                dw = self.I_inv @ (tau_total - np.cross(w, self.I @ w))
                return dq, dw

            # RK4 step
            dq1, dw1 = attitude_deriv(q_curr, omega_curr)
            dq2, dw2 = attitude_deriv(
                quat_normalize(q_curr + 0.5 * dt * dq1), omega_curr + 0.5 * dt * dw1
            )
            dq3, dw3 = attitude_deriv(
                quat_normalize(q_curr + 0.5 * dt * dq2), omega_curr + 0.5 * dt * dw2
            )
            dq4, dw4 = attitude_deriv(
                quat_normalize(q_curr + dt * dq3), omega_curr + dt * dw3
            )

            q_curr = quat_normalize(
                q_curr + (dt / 6.0) * (dq1 + 2.0 * dq2 + 2.0 * dq3 + dq4)
            )
            omega_curr = (
                omega_curr + (dt / 6.0) * (dw1 + 2.0 * dw1 + 2.0 * dw3 + dw4)
            )

        return {
            "times_s": times_s,
            "quaternions": q_arr,
            "angular_velocities": omega_arr,
            "euler_angles_deg": euler_arr,
            "control_torques": torques_arr,
            "mode": mode,
        }
