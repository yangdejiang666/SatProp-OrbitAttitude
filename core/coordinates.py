"""
Coordinate Frame Transformations for Space Surveillance and Orbit Propagation
Supported frames:
- GCRF / J2000 (Earth-Centered Inertial - ECI)
- TEME (True Equator Mean Equinox - SGP4 native frame)
- ITRF / WGS84 (Earth-Centered Earth-Fixed - ECEF)
- Geodetic (WGS-84 Latitude, Longitude, Altitude)
- Topocentric SEZ / AER (Azimuth, Elevation, Range for ground tracking)
- RIC (Radial, In-track, Cross-track orbital error frame)
Reference: Vallado (2013), Chapters 3 & 4.
"""

import math
import numpy as np
from core.constants import (
    R_EARTH,
    F_EARTH,
    B_EARTH,
    E_EARTH_SQ,
    OMEGA_EARTH,
)
from core.time_systems import gmst_rad, jd_to_j2000_centuries


def teme_to_j2000(r_teme: np.ndarray, v_teme: np.ndarray, jd: float):
    """
    Convert state vector from TEME (SGP4 native frame) to J2000/GCRF ECI frame.
    Applies the equinox-of-date and precession/nutation correction (Vallado Eq. 3-88 to 3-90).
    """
    T = jd_to_j2000_centuries(jd)
    # Mean obliquity of ecliptic (arcsec)
    eps_bar_sec = 84381.448 - 46.8150 * T - 0.00059 * (T**2) + 0.001813 * (T**3)
    eps_bar_rad = math.radians(eps_bar_sec / 3600.0)

    # Approximate nutation in longitude (arcsec)
    # Dominant term with lunar ascending node Omega
    omega_node_deg = 125.04455501 - 6962890.2665 * T / 3600.0
    omega_node_rad = math.radians(omega_node_deg % 360.0)
    delta_psi_sec = -17.200 * math.sin(omega_node_rad)
    delta_psi_rad = math.radians(delta_psi_sec / 3600.0)

    # Equinox correction angle around Z axis
    eq_eq = delta_psi_rad * math.cos(eps_bar_rad)

    # Rotation matrix around Z-axis by -eq_eq
    c = math.cos(eq_eq)
    s = math.sin(eq_eq)
    R_z = np.array([
        [c, -s, 0.0],
        [s,  c, 0.0],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)

    r_j2000 = R_z @ r_teme
    v_j2000 = R_z @ v_teme
    return r_j2000, v_j2000


def j2000_to_teme(r_j2000: np.ndarray, v_j2000: np.ndarray, jd: float):
    """Convert state vector from J2000/GCRF ECI frame to TEME."""
    r_teme, v_teme = teme_to_j2000(r_j2000, v_j2000, jd)
    # Inverse rotation is transpose
    T = jd_to_j2000_centuries(jd)
    eps_bar_sec = 84381.448 - 46.8150 * T - 0.00059 * (T**2) + 0.001813 * (T**3)
    eps_bar_rad = math.radians(eps_bar_sec / 3600.0)
    omega_node_rad = math.radians((125.04455501 - 6962890.2665 * T / 3600.0) % 360.0)
    delta_psi_rad = math.radians((-17.200 * math.sin(omega_node_rad)) / 3600.0)
    eq_eq = delta_psi_rad * math.cos(eps_bar_rad)

    c = math.cos(eq_eq)
    s = math.sin(eq_eq)
    R_z_inv = np.array([
        [ c, s, 0.0],
        [-s, c, 0.0],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)

    return R_z_inv @ r_j2000, R_z_inv @ v_j2000


def eci_to_ecef(r_eci: np.ndarray, v_eci: np.ndarray, jd: float):
    """
    Convert ECI (GCRF/J2000) position [m] and velocity [m/s] to ECEF (ITRF/WGS84).
    Includes kinematic Coriolis velocity term.
    """
    theta = gmst_rad(jd)
    c = math.cos(theta)
    s = math.sin(theta)

    R_z = np.array([
        [ c,  s, 0.0],
        [-s,  c, 0.0],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)

    r_ecef = R_z @ r_eci

    # Velocity in ECEF: v_ecef = R_z * v_eci - omega x r_ecef
    omega_vec = np.array([0.0, 0.0, OMEGA_EARTH], dtype=np.float64)
    v_ecef = (R_z @ v_eci) - np.cross(omega_vec, r_ecef)
    return r_ecef, v_ecef


def ecef_to_eci(r_ecef: np.ndarray, v_ecef: np.ndarray, jd: float):
    """
    Convert ECEF position [m] and velocity [m/s] to ECI (GCRF/J2000).
    """
    theta = gmst_rad(jd)
    c = math.cos(theta)
    s = math.sin(theta)

    R_z_inv = np.array([
        [c, -s, 0.0],
        [s,  c, 0.0],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)

    r_eci = R_z_inv @ r_ecef
    omega_vec = np.array([0.0, 0.0, OMEGA_EARTH], dtype=np.float64)
    v_eci = R_z_inv @ (v_ecef + np.cross(omega_vec, r_ecef))
    return r_eci, v_eci


def ecef_to_geodetic(r_ecef: np.ndarray):
    """
    Convert ECEF position (x, y, z) in meters to geodetic coordinates
    (latitude [deg], longitude [deg], altitude [meters]) using Bowring's algorithm.
    """
    x, y, z = r_ecef[0], r_ecef[1], r_ecef[2]
    p = math.sqrt(x**2 + y**2)
    lon_rad = math.atan2(y, x)

    # Handle pole singularity
    if p < 1e-6:
        lat_rad = math.pi / 2.0 if z > 0 else -math.pi / 2.0
        alt = abs(z) - B_EARTH
        return math.degrees(lat_rad), math.degrees(lon_rad), alt

    # Bowring's closed formula
    e_prime_sq = (R_EARTH**2 - B_EARTH**2) / (B_EARTH**2)
    theta = math.atan2(z * R_EARTH, p * B_EARTH)
    lat_rad = math.atan2(
        z + e_prime_sq * B_EARTH * (math.sin(theta)**3),
        p - E_EARTH_SQ * R_EARTH * (math.cos(theta)**3)
    )

    N = R_EARTH / math.sqrt(1.0 - E_EARTH_SQ * (math.sin(lat_rad)**2))
    alt = p / math.cos(lat_rad) - N

    return math.degrees(lat_rad), math.degrees(lon_rad), alt


def geodetic_to_ecef(lat_deg: float, lon_deg: float, alt_m: float) -> np.ndarray:
    """
    Convert geodetic coordinates (lat [deg], lon [deg], alt [m]) on WGS-84 ellipsoid to ECEF [m].
    """
    phi = math.radians(lat_deg)
    lam = math.radians(lon_deg)
    sin_phi = math.sin(phi)
    cos_phi = math.cos(phi)

    N = R_EARTH / math.sqrt(1.0 - E_EARTH_SQ * (sin_phi**2))
    x = (N + alt_m) * cos_phi * math.cos(lam)
    y = (N + alt_m) * cos_phi * math.sin(lam)
    z = (N * (1.0 - E_EARTH_SQ) + alt_m) * sin_phi

    return np.array([x, y, z], dtype=np.float64)


def ecef_to_topocentric_sez(r_sat_ecef: np.ndarray, site_lat_deg: float, site_lon_deg: float, site_alt_m: float):
    """
    Calculate topocentric South-East-Zenith (SEZ) position vector of satellite relative to a ground station site.
    """
    r_site_ecef = geodetic_to_ecef(site_lat_deg, site_lon_deg, site_alt_m)
    rho_ecef = r_sat_ecef - r_site_ecef

    phi = math.radians(site_lat_deg)
    lam = math.radians(site_lon_deg)
    sin_phi = math.sin(phi)
    cos_phi = math.cos(phi)
    sin_lam = math.sin(lam)
    cos_lam = math.cos(lam)

    # Rotation matrix from ECEF to SEZ
    R_ecef_to_sez = np.array([
        [ sin_phi * cos_lam,  sin_phi * sin_lam, -cos_phi],
        [-sin_lam,            cos_lam,            0.0    ],
        [ cos_phi * cos_lam,  cos_phi * sin_lam,  sin_phi]
    ], dtype=np.float64)

    return R_ecef_to_sez @ rho_ecef


def sez_to_aer(rho_sez: np.ndarray):
    """
    Convert topocentric SEZ vector to Azimuth [deg], Elevation [deg], and Range [m].
    Azimuth is measured clockwise from North [0, 360 deg].
    Elevation is angle above horizon [-90, 90 deg].
    """
    s, e, z = rho_sez[0], rho_sez[1], rho_sez[2]
    range_m = float(np.linalg.norm(rho_sez))
    if range_m < 1e-6:
        return 0.0, 0.0, 0.0

    el_rad = math.asin(np.clip(z / range_m, -1.0, 1.0))
    # Azimuth from North (North = -S, East = E)
    az_rad = math.atan2(e, -s)
    if az_rad < 0:
        az_rad += 2.0 * math.pi

    return math.degrees(az_rad), math.degrees(el_rad), range_m


def eci_to_ric_matrix(r_ref_eci: np.ndarray, v_ref_eci: np.ndarray) -> np.ndarray:
    """
    Construct the rotation matrix from ECI to Radial-InTrack-CrossTrack (RIC) frame
    relative to a reference trajectory state (r_ref, v_ref).
    R_RIC = [u_R; u_I; u_C]
    Delta_r_RIC = R_RIC @ (r_test - r_ref)
    """
    r_norm = np.linalg.norm(r_ref_eci)
    if r_norm < 1e-6:
        return np.eye(3)

    u_R = r_ref_eci / r_norm
    h_vec = np.cross(r_ref_eci, v_ref_eci)
    h_norm = np.linalg.norm(h_vec)
    if h_norm < 1e-6:
        u_C = np.array([0.0, 0.0, 1.0], dtype=np.float64)
    else:
        u_C = h_vec / h_norm
    u_I = np.cross(u_C, u_R)

    return np.vstack([u_R, u_I, u_C])


def compute_ric_errors(r_test: np.ndarray, v_test: np.ndarray, r_true: np.ndarray, v_true: np.ndarray):
    """
    Calculate Radial, In-Track, and Cross-Track error components (in meters and m/s).
    """
    M_ric = eci_to_ric_matrix(r_true, v_true)
    dr_eci = r_test - r_true
    dv_eci = v_test - v_true

    dr_ric = M_ric @ dr_eci
    dv_ric = M_ric @ dv_eci
    total_pos_error = float(np.linalg.norm(dr_eci))
    total_vel_error = float(np.linalg.norm(dv_eci))

    return {
        "dr_radial": float(dr_ric[0]),
        "dr_in_track": float(dr_ric[1]),
        "dr_cross_track": float(dr_ric[2]),
        "total_pos_error": total_pos_error,
        "dv_radial": float(dv_ric[0]),
        "dv_in_track": float(dv_ric[1]),
        "dv_cross_track": float(dv_ric[2]),
        "total_vel_error": total_vel_error
    }


def ric_to_eci(dr_ric: np.ndarray, r_ref_eci: np.ndarray, v_ref_eci: np.ndarray) -> np.ndarray:
    """
    Transform vector from RIC frame back to ECI frame:
    dr_eci = (R_RIC)^T @ dr_ric
    """
    M_ric = eci_to_ric_matrix(r_ref_eci, v_ref_eci)
    return M_ric.T @ dr_ric

