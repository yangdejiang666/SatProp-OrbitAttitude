"""
Spacecraft Attitude Kinematics, Dynamics, and Control Simulation.
"""

from attitude.quaternions import (
    quat_normalize,
    quat_multiply,
    quat_conjugate,
    quat_to_dcm,
    dcm_to_quat,
    quat_to_euler,
    euler_to_quat,
    quat_derivative,
)
from attitude.dynamics import AttitudeSimulator
