"""
High-Precision Orbital Perturbation Models
Includes:
- Two-body Keplerian central gravity
- Non-spherical geopotential zonal harmonics: J2, J3, J4
- Atmospheric drag with exponential density profile and Earth atmospheric rotation
- Third-body gravitational perturbations from Sun and Moon (analytical ephemerides)
- Solar Radiation Pressure (SRP) with Earth cylindrical shadow model
Reference: Vallado (2013) Chapter 8; Montenbruck & Gill (2000).
"""

import math
import numpy as np
from core.constants import (
    MU_EARTH,
    R_EARTH,
    J2,
    J3,
    J4,
    MU_SUN,
    MU_MOON,
    AU,
    P_SUN_1AU,
    OMEGA_EARTH,
)
from core.time_systems import jd_to_j2000_centuries


# Standard US Atmospheric scale height table (altitude [km], rho_0 [kg/m^3], H [km])
ATMOSPHERE_TABLE = [
    (0.0, 1.225, 7.249),
    (25.0, 3.899e-2, 6.349),
    (50.0, 1.027e-3, 6.482),
    (75.0, 3.992e-5, 6.002),
    (100.0, 5.297e-7, 5.877),
    (150.0, 2.076e-9, 26.885),
    (200.0, 2.541e-10, 37.105),
    (250.0, 6.073e-11, 45.546),
    (300.0, 1.916e-11, 53.628),
    (350.0, 7.014e-12, 53.298),
    (400.0, 2.801e-12, 58.515),
    (450.0, 1.184e-12, 60.828),
    (500.0, 5.215e-13, 63.822),
    (600.0, 1.137e-13, 71.835),
    (700.0, 3.070e-14, 88.667),
    (800.0, 1.136e-14, 124.64),
    (900.0, 5.759e-15, 181.05),
    (1000.0, 3.561e-15, 268.00),
]


def atmospheric_density(alt_m: float) -> float:
    """
    Compute atmospheric density [kg/m^3] at given altitude [m]
    using piecewise exponential atmospheric model.
    """
    alt_km = alt_m / 1000.0
    if alt_km < 0:
        return ATMOSPHERE_TABLE[0][1]
    if alt_km >= 1000.0:
        # Above 1000 km, density decays exponentially with H = 268 km
        h0, rho0, H = ATMOSPHERE_TABLE[-1]
        return rho0 * math.exp(-(alt_km - h0) / H)

    for i in range(len(ATMOSPHERE_TABLE) - 1):
        h_low, rho_low, H_low = ATMOSPHERE_TABLE[i]
        h_high, _, _ = ATMOSPHERE_TABLE[i + 1]
        if h_low <= alt_km < h_high:
            return rho_low * math.exp(-(alt_km - h_low) / H_low)

    return 0.0


def accel_two_body(r_eci: np.ndarray, mu: float = MU_EARTH) -> np.ndarray:
    """Two-body central point mass gravitational acceleration [m/s^2]."""
    r = np.linalg.norm(r_eci)
    if r < 1e-6:
        return np.zeros(3)
    return -mu * r_eci / (r**3)


def accel_j2(r_eci: np.ndarray, mu: float = MU_EARTH, R_eq: float = R_EARTH) -> np.ndarray:
    """
    Gravitational perturbation acceleration caused by Earth's J2 oblateness [m/s^2].
    Vallado Eq. (8-13).
    """
    x, y, z = r_eci[0], r_eci[1], r_eci[2]
    r = math.sqrt(x**2 + y**2 + z**2)
    if r < 1e-6:
        return np.zeros(3)

    factor = (1.5 * J2 * mu * (R_eq**2)) / (r**5)
    z_over_r_sq = (z / r) ** 2

    ax = -factor * x * (1.0 - 5.0 * z_over_r_sq)
    ay = -factor * y * (1.0 - 5.0 * z_over_r_sq)
    az = -factor * z * (3.0 - 5.0 * z_over_r_sq)

    return np.array([ax, ay, az], dtype=np.float64)


def accel_j3(r_eci: np.ndarray, mu: float = MU_EARTH, R_eq: float = R_EARTH) -> np.ndarray:
    """
    Gravitational perturbation acceleration caused by Earth's J3 pear-shape [m/s^2].
    Vallado Eq. (8-14).
    """
    x, y, z = r_eci[0], r_eci[1], r_eci[2]
    r = math.sqrt(x**2 + y**2 + z**2)
    if r < 1e-6:
        return np.zeros(3)

    factor = (2.5 * J3 * mu * (R_eq**3)) / (r**7)
    z_sq = z**2
    r_sq = r**2

    ax = -factor * x * (3.0 * z * r_sq - 7.0 * (z**3)) / (r_sq)
    ay = -factor * y * (3.0 * z * r_sq - 7.0 * (z**3)) / (r_sq)
    az = -0.5 * J3 * mu * (R_eq**3) / (r**7) * (35.0 * (z**4) - 30.0 * z_sq * r_sq + 3.0 * (r_sq**2)) / (r_sq)

    return np.array([ax, ay, az], dtype=np.float64)


def accel_j4(r_eci: np.ndarray, mu: float = MU_EARTH, R_eq: float = R_EARTH) -> np.ndarray:
    """
    Gravitational perturbation acceleration caused by Earth's J4 octupole [m/s^2].
    Vallado Eq. (8-15).
    """
    x, y, z = r_eci[0], r_eci[1], r_eci[2]
    r = math.sqrt(x**2 + y**2 + z**2)
    if r < 1e-6:
        return np.zeros(3)

    factor = (1.875 * J4 * mu * (R_eq**4)) / (r**7)  # 15/8 = 1.875
    z_over_r = z / r
    z_over_r_sq = z_over_r**2

    # ax, ay term: x * (1 - 14(z/r)^2 + 21(z/r)^4)
    common_xy = 1.0 - 14.0 * z_over_r_sq + 21.0 * (z_over_r_sq**2)
    ax = -factor * x * common_xy
    ay = -factor * y * common_xy
    az = -factor * z * (5.0 - (70.0 / 3.0) * z_over_r_sq + 21.0 * (z_over_r_sq**2))

    return np.array([ax, ay, az], dtype=np.float64)


def accel_atmospheric_drag(
    r_eci: np.ndarray,
    v_eci: np.ndarray,
    cd: float = 2.2,
    area_m2: float = 2.0,
    mass_kg: float = 500.0,
) -> np.ndarray:
    """
    Atmospheric drag acceleration [m/s^2] considering rotating atmosphere:
    a_drag = -0.5 * rho * Cd * (A/m) * v_rel * v_rel_vec
    """
    r_norm = float(np.linalg.norm(r_eci))
    altitude = r_norm - R_EARTH
    if altitude > 1000000.0:  # Negligible drag above 1000 km
        return np.zeros(3)

    rho = atmospheric_density(altitude)
    if rho <= 0:
        return np.zeros(3)

    # Co-rotating atmosphere velocity: v_rel = v_eci - omega x r_eci
    omega_vec = np.array([0.0, 0.0, OMEGA_EARTH], dtype=np.float64)
    v_rel = v_eci - np.cross(omega_vec, r_eci)
    v_rel_norm = float(np.linalg.norm(v_rel))

    if v_rel_norm < 1e-6:
        return np.zeros(3)

    # Ballistic coefficient B = Cd * A / m
    b_coeff = cd * area_m2 / mass_kg
    return -0.5 * rho * b_coeff * v_rel_norm * v_rel


def sun_position_eci(jd: float) -> np.ndarray:
    """
    Low-precision analytical solar position vector [m] in ECI J2000.
    Accuracy: ~0.01 deg, suitable for orbit third-body and SRP computation.
    Meeus (1998) / Vallado Algorithm 29.
    """
    T = jd_to_j2000_centuries(jd)
    # Mean longitude of Sun
    L0 = 280.46646 + 36000.76983 * T
    # Mean anomaly of Sun
    M_deg = 357.52911 + 35999.05029 * T - 0.0001537 * (T**2)
    M_rad = math.radians(M_deg % 360.0)

    # Ecliptic longitude of Sun
    lam_deg = (
        L0
        + (1.914602 - 0.004817 * T - 0.000014 * (T**2)) * math.sin(M_rad)
        + (0.019993 - 0.000101 * T) * math.sin(2.0 * M_rad)
        + 0.000289 * math.sin(3.0 * M_rad)
    )
    lam_rad = math.radians(lam_deg % 360.0)

    # Distance to Sun in AU
    r_au = (
        1.00014061
        - 0.01670862 * math.cos(M_rad)
        - 0.000139589 * math.cos(2.0 * M_rad)
    )
    r_m = r_au * AU

    # Obliquity of ecliptic
    eps_deg = 23.439291 - 0.0130042 * T
    eps_rad = math.radians(eps_deg)

    # Position in ECI
    r_sun = np.array([
        r_m * math.cos(lam_rad),
        r_m * math.sin(lam_rad) * math.cos(eps_rad),
        r_m * math.sin(lam_rad) * math.sin(eps_rad),
    ], dtype=np.float64)

    return r_sun


def moon_position_eci(jd: float) -> np.ndarray:
    """
    Low-precision analytical lunar position vector [m] in ECI J2000.
    Accuracy: ~0.1 - 0.3 deg, suitable for Cowell numerical orbit propagation.
    Meeus / Montenbruck & Gill.
    """
    T = jd_to_j2000_centuries(jd)

    # Fundamental lunar arguments (degrees)
    L_prime = 218.3164477 + 481267.88128 * T  # Moon mean longitude
    D = 297.8501921 + 445267.11140 * T        # Mean elongation of Moon
    M = 357.5291092 + 35999.05029 * T         # Sun mean anomaly
    M_prime = 134.9633964 + 477198.86750 * T  # Moon mean anomaly
    F = 93.2720950 + 483202.01752 * T         # Moon argument of latitude

    # Radians
    L_prime = math.radians(L_prime % 360.0)
    D = math.radians(D % 360.0)
    M = math.radians(M % 360.0)
    M_prime = math.radians(M_prime % 360.0)
    F = math.radians(F % 360.0)

    # Ecliptic longitude perturbing terms (arcsec)
    lon_deg = math.degrees(L_prime) + (
        22640.0 * math.sin(M_prime)
        - 4586.0 * math.sin(M_prime - 2 * D)
        + 2370.0 * math.sin(2 * D)
        + 769.0 * math.sin(2 * M_prime)
        - 668.0 * math.sin(M)
        - 412.0 * math.sin(2 * F)
        - 212.0 * math.sin(2 * M_prime - 2 * D)
        - 206.0 * math.sin(M_prime + M - 2 * D)
        + 192.0 * math.sin(M_prime + 2 * D)
        - 165.0 * math.sin(M - 2 * D)
    ) / 3600.0

    # Ecliptic latitude (degrees)
    lat_deg = (
        18520.0 * math.sin(F + math.radians(lon_deg - math.degrees(L_prime)))
        - 526.0 * math.sin(F - 2 * D)
        + 44.0 * math.sin(M_prime + F - 2 * D)
        - 31.0 * math.sin(-M_prime + F - 2 * D)
    ) / 3600.0

    # Lunar distance (km)
    dist_km = (
        385000.0
        - 20905.0 * math.cos(M_prime)
        - 3699.0 * math.cos(2 * D - M_prime)
        - 2956.0 * math.cos(2 * D)
        - 570.0 * math.cos(2 * M_prime)
    )
    dist_m = dist_km * 1000.0

    # Obliquity of ecliptic
    eps_deg = 23.439291 - 0.0130042 * T
    eps_rad = math.radians(eps_deg)
    lon_rad = math.radians(lon_deg % 360.0)
    lat_rad = math.radians(lat_deg)

    # Ecliptic to Equatorial ECI conversion
    x = dist_m * math.cos(lat_rad) * math.cos(lon_rad)
    y = dist_m * (
        math.cos(lat_rad) * math.sin(lon_rad) * math.cos(eps_rad)
        - math.sin(lat_rad) * math.sin(eps_rad)
    )
    z = dist_m * (
        math.cos(lat_rad) * math.sin(lon_rad) * math.sin(eps_rad)
        + math.sin(lat_rad) * math.cos(eps_rad)
    )

    return np.array([x, y, z], dtype=np.float64)


def accel_third_body(r_sat: np.ndarray, r_body: np.ndarray, mu_body: float) -> np.ndarray:
    """
    Third-body point mass gravitational perturbation:
    a = mu_body * [ (r_body - r_sat) / ||r_body - r_sat||^3 - r_body / ||r_body||^3 ]
    """
    delta_r = r_body - r_sat
    d_norm = np.linalg.norm(delta_r)
    r_body_norm = np.linalg.norm(r_body)

    if d_norm < 1e-3 or r_body_norm < 1e-3:
        return np.zeros(3)

    return mu_body * (delta_r / (d_norm**3) - r_body / (r_body_norm**3))


def is_in_earth_shadow(r_sat: np.ndarray, r_sun: np.ndarray) -> float:
    """
    Calculate solar eclipse illumination factor nu in [0, 1] using cylindrical shadow model:
    Returns 0.0 (in shadow / eclipse) or 1.0 (sunlight).
    """
    # Projection of satellite position onto Earth-Sun vector
    sun_dir = r_sun / np.linalg.norm(r_sun)
    proj = float(np.dot(r_sat, sun_dir))

    # If satellite is in the sunward hemisphere, it is fully lit
    if proj > 0:
        return 1.0

    # Perpendicular distance from satellite to Earth-Sun line
    perp_dist = float(np.linalg.norm(r_sat - proj * sun_dir))

    # In cylindrical shadow if perpendicular distance is less than Earth radius
    if perp_dist < R_EARTH:
        return 0.0  # Total eclipse
    return 1.0  # Fully illuminated


def accel_srp(
    r_sat: np.ndarray,
    r_sun: np.ndarray,
    cr: float = 1.8,
    area_m2: float = 2.0,
    mass_kg: float = 500.0,
) -> np.ndarray:
    """
    Solar Radiation Pressure acceleration [m/s^2] considering Earth shadow:
    a_srp = -nu * P_sun * (AU / d_sun)^2 * Cr * (A / m) * (r_sun_sat / ||r_sun_sat||)
    """
    nu = is_in_earth_shadow(r_sat, r_sun)
    if nu <= 0:
        return np.zeros(3)

    d_sun_vec = r_sat - r_sun
    d_sun = float(np.linalg.norm(d_sun_vec))
    if d_sun < 1e-6:
        return np.zeros(3)

    flux_factor = (AU / d_sun) ** 2
    p_eff = P_SUN_1AU * flux_factor
    force_magnitude = nu * p_eff * cr * (area_m2 / mass_kg)

    return force_magnitude * (d_sun_vec / d_sun)


def total_perturbation_acceleration(
    r_eci: np.ndarray,
    v_eci: np.ndarray,
    jd: float,
    use_j2: bool = True,
    use_j3: bool = True,
    use_j4: bool = True,
    use_drag: bool = True,
    use_sun: bool = True,
    use_moon: bool = True,
    use_srp: bool = True,
    cd: float = 2.2,
    cr: float = 1.8,
    area_m2: float = 2.0,
    mass_kg: float = 500.0,
) -> np.ndarray:
    """
    Compute total acceleration vector [m/s^2] including central gravity and all active perturbations.
    """
    # 1. Central Two-Body gravity
    acc = accel_two_body(r_eci)

    # 2. Zonal geopotential harmonics
    if use_j2:
        acc += accel_j2(r_eci)
    if use_j3:
        acc += accel_j3(r_eci)
    if use_j4:
        acc += accel_j4(r_eci)

    # 3. Atmospheric drag
    if use_drag:
        acc += accel_atmospheric_drag(r_eci, v_eci, cd=cd, area_m2=area_m2, mass_kg=mass_kg)

    # 4. Third-body solar gravity & SRP
    if use_sun or use_srp:
        r_sun = sun_position_eci(jd)
        if use_sun:
            acc += accel_third_body(r_eci, r_sun, MU_SUN)
        if use_srp:
            acc += accel_srp(r_eci, r_sun, cr=cr, area_m2=area_m2, mass_kg=mass_kg)

    # 5. Third-body lunar gravity
    if use_moon:
        r_moon = moon_position_eci(jd)
        acc += accel_third_body(r_eci, r_moon, MU_MOON)

    return acc
