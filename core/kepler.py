"""
Keplerian Orbit Mechanics and Two-Body Problem Solver
Handles bidirectional conversions between Cartesian state vectors (r, v)
and classical Keplerian orbital elements (a, e, i, Omega, omega, nu, M).
Reference: Vallado (2013) Chapter 2; Bate, Mueller, White (1971).
"""

import math
import numpy as np
from core.constants import MU_EARTH


def solve_kepler(M_rad: float, e: float, tol: float = 1e-12, max_iter: int = 100) -> float:
    """
    Solve Kepler's Equation for eccentric anomaly E:
        M = E - e * sin(E)
    using Danby's initial guess and Newton-Raphson iteration with cubic convergence.
    """
    M_rad = M_rad % (2.0 * math.pi)

    # Initial guess (Danby 1988)
    if e < 0.8:
        E = M_rad
    else:
        E = math.pi if M_rad > math.pi else M_rad + 0.85 * e

    for _ in range(max_iter):
        f = E - e * math.sin(E) - M_rad
        f_prime = 1.0 - e * math.cos(E)
        f_double_prime = e * math.sin(E)
        f_triple_prime = e * math.cos(E)

        # Halley's / Danby correction
        delta_1 = -f / f_prime
        delta_2 = -f / (f_prime + 0.5 * delta_1 * f_double_prime)
        delta_3 = -f / (
            f_prime
            + 0.5 * delta_2 * f_double_prime
            + (1.0 / 6.0) * (delta_2**2) * f_triple_prime
        )

        E += delta_3
        if abs(delta_3) < tol:
            break

    return E % (2.0 * math.pi)


def true_anomaly_to_eccentric(nu_rad: float, e: float) -> float:
    """Convert true anomaly nu to eccentric anomaly E."""
    sin_E = math.sqrt(1.0 - e**2) * math.sin(nu_rad) / (1.0 + e * math.cos(nu_rad))
    cos_E = (e + math.cos(nu_rad)) / (1.0 + e * math.cos(nu_rad))
    return math.atan2(sin_E, cos_E) % (2.0 * math.pi)


def eccentric_anomaly_to_true(E_rad: float, e: float) -> float:
    """Convert eccentric anomaly E to true anomaly nu."""
    sin_nu = math.sqrt(1.0 - e**2) * math.sin(E_rad) / (1.0 - e * math.cos(E_rad))
    cos_nu = (math.cos(E_rad) - e) / (1.0 - e * math.cos(E_rad))
    return math.atan2(sin_nu, cos_nu) % (2.0 * math.pi)


def rv_to_coe(r_vec: np.ndarray, v_vec: np.ndarray, mu: float = MU_EARTH):
    """
    Convert Cartesian position r [m] and velocity v [m/s] to Classical Orbital Elements:
    Returns dict:
      a: semi-major axis [m]
      e: eccentricity [-]
      i_deg: inclination [deg]
      raan_deg: right ascension of ascending node [deg]
      argp_deg: argument of perigee [deg]
      nu_deg: true anomaly [deg]
      M_deg: mean anomaly [deg]
      period_s: orbital period [seconds]
    """
    r = float(np.linalg.norm(r_vec))
    v = float(np.linalg.norm(v_vec))

    # Specific angular momentum
    h_vec = np.cross(r_vec, v_vec)
    h = float(np.linalg.norm(h_vec))

    # Node vector n = k x h
    k_unit = np.array([0.0, 0.0, 1.0], dtype=np.float64)
    n_vec = np.cross(k_unit, h_vec)
    n = float(np.linalg.norm(n_vec))

    # Eccentricity vector
    e_vec = (1.0 / mu) * ((v**2 - mu / r) * r_vec - np.dot(r_vec, v_vec) * v_vec)
    e = float(np.linalg.norm(e_vec))

    # Specific mechanical energy
    energy = (v**2) / 2.0 - mu / r

    if abs(1.0 - e) > 1e-7:
        a = -mu / (2.0 * energy)
    else:
        a = float("inf")  # Parabolic

    # Inclination
    i_rad = math.acos(np.clip(h_vec[2] / h, -1.0, 1.0))

    # RAAN (Omega)
    if n > 1e-9:
        raan_rad = math.acos(np.clip(n_vec[0] / n, -1.0, 1.0))
        if n_vec[1] < 0:
            raan_rad = 2.0 * math.pi - raan_rad
    else:
        raan_rad = 0.0  # Equatorial orbit

    # Argument of perigee (omega)
    if n > 1e-9 and e > 1e-7:
        argp_rad = math.acos(np.clip(np.dot(n_vec, e_vec) / (n * e), -1.0, 1.0))
        if e_vec[2] < 0:
            argp_rad = 2.0 * math.pi - argp_rad
    elif e > 1e-7:
        # Equatorial eccentric
        argp_rad = math.atan2(e_vec[1], e_vec[0])
        if argp_rad < 0:
            argp_rad += 2.0 * math.pi
    else:
        argp_rad = 0.0

    # True anomaly (nu)
    if e > 1e-7:
        nu_rad = math.acos(np.clip(np.dot(e_vec, r_vec) / (e * r), -1.0, 1.0))
        if np.dot(r_vec, v_vec) < 0:
            nu_rad = 2.0 * math.pi - nu_rad
    else:
        # Circular orbit: argument of latitude u = argp + nu
        if n > 1e-9:
            u_rad = math.acos(np.clip(np.dot(n_vec, r_vec) / (n * r), -1.0, 1.0))
            if r_vec[2] < 0:
                u_rad = 2.0 * math.pi - u_rad
            nu_rad = u_rad - argp_rad
        else:
            nu_rad = math.atan2(r_vec[1], r_vec[0])
        nu_rad = nu_rad % (2.0 * math.pi)

    # Eccentric and Mean Anomaly
    if e < 1.0:
        E_rad = true_anomaly_to_eccentric(nu_rad, e)
        M_rad = (E_rad - e * math.sin(E_rad)) % (2.0 * math.pi)
        period_s = 2.0 * math.pi * math.sqrt((a**3) / mu) if a > 0 else 0.0
    else:
        M_rad = 0.0
        period_s = float("inf")

    return {
        "a": a,
        "e": e,
        "i_deg": math.degrees(i_rad),
        "raan_deg": math.degrees(raan_rad),
        "argp_deg": math.degrees(argp_rad),
        "nu_deg": math.degrees(nu_rad),
        "M_deg": math.degrees(M_rad),
        "period_s": period_s,
    }


def coe_to_rv(
    a: float,
    e: float,
    i_deg: float,
    raan_deg: float,
    argp_deg: float,
    nu_deg: float,
    mu: float = MU_EARTH,
):
    """
    Convert Classical Orbital Elements to Cartesian position [m] and velocity [m/s] in ECI frame.
    """
    i_rad = math.radians(i_deg)
    raan_rad = math.radians(raan_deg)
    argp_rad = math.radians(argp_deg)
    nu_rad = math.radians(nu_deg)

    # Semi-latus rectum
    p = a * (1.0 - e**2)
    r = p / (1.0 + e * math.cos(nu_rad))

    # Position in perifocal frame (P, Q, W)
    r_pqw = np.array([
        r * math.cos(nu_rad),
        r * math.sin(nu_rad),
        0.0
    ], dtype=np.float64)

    # Velocity in perifocal frame
    sqrt_mu_p = math.sqrt(mu / p)
    v_pqw = np.array([
        -sqrt_mu_p * math.sin(nu_rad),
        sqrt_mu_p * (e + math.cos(nu_rad)),
        0.0
    ], dtype=np.float64)

    # Transformation matrix from Perifocal to ECI: R = Rz(-raan) * Rx(-i) * Rz(-argp)
    c_O = math.cos(raan_rad)
    s_O = math.sin(raan_rad)
    c_i = math.cos(i_rad)
    s_i = math.sin(i_rad)
    c_w = math.cos(argp_rad)
    s_w = math.sin(argp_rad)

    R_pqw_to_eci = np.array([
        [
            c_O * c_w - s_O * s_w * c_i,
            -c_O * s_w - s_O * c_w * c_i,
            s_O * s_i,
        ],
        [
            s_O * c_w + c_O * s_w * c_i,
            -s_O * s_w + c_O * c_w * c_i,
            -c_O * s_i,
        ],
        [
            s_w * s_i,
            c_w * s_i,
            c_i,
        ],
    ], dtype=np.float64)

    r_eci = R_pqw_to_eci @ r_pqw
    v_eci = R_pqw_to_eci @ v_pqw

    return r_eci, v_eci
