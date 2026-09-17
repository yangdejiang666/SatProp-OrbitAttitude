"""
Research-Grade Astrodynamics & Space Mission Verification Workbench
===================================================================
Provides authoritative reference verification and mission analysis matching
NASA GMAT, ESA Orekit, NAIF SPICE, Skyfield, Astropy, and AGI STK / Cesium platforms.

Modules:
- verification_engine: Compares homegrown models with authoritative IAU/NASA baselines.
- czml_exporter: Exports 4D dynamic time-tagged ephemeris & attitude to STK / Cesium CZML.
- gmat_bridge: Synthesizes valid NASA GMAT mission scripts (.script) for independent trajectory audit.
"""

from .verification_engine import AuthoritativeVerificationEngine, get_verification_engine
from .czml_exporter import CZMLExporter, generate_mission_czml
from .gmat_bridge import GMATMissionBridge, generate_gmat_script

__all__ = [
    "AuthoritativeVerificationEngine",
    "get_verification_engine",
    "CZMLExporter",
    "generate_mission_czml",
    "GMATMissionBridge",
    "generate_gmat_script",
]
