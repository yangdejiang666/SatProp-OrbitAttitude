"""
MATLAB / Simulink Aerospace Co-Simulation and Dynamics Bridge Package
====================================================================
Provides unified interfaces for:
1. MATLAB Engine API and CLI batch execution for astrodynamics and orbit propagation.
2. Simulink 6-DOF spacecraft attitude and orbit control block diagram execution.
3. Native MATLAB Aerospace Toolbox emulator (SGP4, Cowell, RV2COE, ECI/ECEF, Quaternions).
4. Bi-directional .mat workspace data exchange and co-simulation pipelines.
"""

from .matlab_engine import (
    MatlabEngineWrapper,
    MatlabAerospaceToolbox,
    get_matlab_engine,
)
from .simulink_bridge import (
    SimulinkModelBridge,
    SimulinkSpacecraftDynamics,
    get_simulink_bridge,
)

__all__ = [
    "MatlabEngineWrapper",
    "MatlabAerospaceToolbox",
    "get_matlab_engine",
    "SimulinkModelBridge",
    "SimulinkSpacecraftDynamics",
    "get_simulink_bridge",
]
