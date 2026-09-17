"""
High-Precision Celestial Ephemeris & Astronomical Motion Engine
Calculates true positions and trajectories of the Sun, Moon, and Planets
(Venus, Mars, Jupiter) in the J2000 ECI frame based on real astronomical models
(Meeus, Astronomical Almanac, NASA JPL).
Strictly aligns with real-world Beijing Time (CST, UTC+8).
"""

import math
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
import numpy as np

from core.constants import AU, SECONDS_PER_DAY
from core.time_systems import datetime_to_jd, jd_to_mjd, gmst_rad, jd_to_j2000_centuries
from core.perturbations import sun_position_eci, moon_position_eci

# Beijing Timezone (UTC+8)
CST = timezone(timedelta(hours=8))


def get_current_beijing_time() -> datetime:
    """Returns the current system time in Beijing Time (CST, UTC+8)."""
    return datetime.now(timezone.utc).astimezone(CST)


def parse_beijing_time(time_str: str) -> datetime:
    """
    Parses an ISO format or 'YYYY-MM-DD HH:MM:SS' string as Beijing Time.
    """
    cleaned = time_str.replace("T", " ").replace("Z", "").replace("CST", "").strip()
    try:
        dt = datetime.strptime(cleaned, "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=CST)
    except ValueError:
        # Fallback to current Beijing time
        return get_current_beijing_time()


def compute_sun_ephemeris(jd: float) -> Dict[str, Any]:
    """
    Computes true Solar position vector, distance, and sub-solar ground coordinates
    at the given Julian Date.
    """
    r_sun_m = sun_position_eci(jd)
    dist_m = float(np.linalg.norm(r_sun_m))
    dist_au = dist_m / AU
    sun_dir = r_sun_m / dist_m

    # Right Ascension & Declination in J2000 ECI
    ra_rad = math.atan2(sun_dir[1], sun_dir[0])
    dec_rad = math.asin(np.clip(sun_dir[2], -1.0, 1.0))

    # Greenwich Mean Sidereal Time (GMST)
    theta_gmst = gmst_rad(jd)

    # Sub-solar geographic latitude & longitude
    sub_lat_deg = math.degrees(dec_rad)
    sub_lon_rad = ra_rad - theta_gmst
    # Normalize to [-pi, pi]
    sub_lon_rad = (sub_lon_rad + math.pi) % (2.0 * math.pi) - math.pi
    sub_lon_deg = math.degrees(sub_lon_rad)

    return {
        "pos_eci_m": r_sun_m.tolist(),
        "direction_unit": sun_dir.tolist(),
        "distance_au": dist_au,
        "distance_km": dist_m / 1000.0,
        "ra_deg": float(math.degrees(ra_rad) % 360.0),
        "dec_deg": float(sub_lat_deg),
        "subsolar_lat_deg": float(sub_lat_deg),
        "subsolar_lon_deg": float(sub_lon_deg),
    }


def compute_moon_ephemeris(jd: float) -> Dict[str, Any]:
    """
    Computes true Lunar position vector, distance, and sub-lunar ground coordinates
    at the given Julian Date using Meeus / Montenbruck analytical lunar ephemeris.
    """
    r_moon_m = moon_position_eci(jd)
    dist_m = float(np.linalg.norm(r_moon_m))
    moon_dir = r_moon_m / dist_m

    ra_rad = math.atan2(moon_dir[1], moon_dir[0])
    dec_rad = math.asin(np.clip(moon_dir[2], -1.0, 1.0))
    theta_gmst = gmst_rad(jd)

    sub_lat_deg = math.degrees(dec_rad)
    sub_lon_rad = ra_rad - theta_gmst
    sub_lon_rad = (sub_lon_rad + math.pi) % (2.0 * math.pi) - math.pi
    sub_lon_deg = math.degrees(sub_lon_rad)

    # Compute lunar phase angle relative to Sun
    r_sun_m = sun_position_eci(jd)
    sun_dir = r_sun_m / np.linalg.norm(r_sun_m)
    cos_phase = float(np.dot(moon_dir, sun_dir))
    illum_frac = 0.5 * (1.0 - cos_phase)

    return {
        "pos_eci_m": r_moon_m.tolist(),
        "direction_unit": moon_dir.tolist(),
        "distance_km": dist_m / 1000.0,
        "ra_deg": float(math.degrees(ra_rad) % 360.0),
        "dec_deg": float(sub_lat_deg),
        "sublunar_lat_deg": float(sub_lat_deg),
        "sublunar_lon_deg": float(sub_lon_deg),
        "illumination_fraction": float(illum_frac),
    }


def compute_planetary_ephemerides(jd: float) -> Dict[str, Dict[str, Any]]:
    """
    Computes geocentric positions and directions of major planets (Venus, Mars, Jupiter)
    in the J2000 Earth-Centered Inertial (ECI) frame using Keplerian orbital elements
    and secular rates from NASA JPL / Astronomical Almanac.
    """
    T = jd_to_j2000_centuries(jd)
    eps_deg = 23.439291 - 0.0130042 * T
    eps_rad = math.radians(eps_deg)

    # Planetary orbital elements [a (AU), e, I (deg), L (deg), long_peri (deg), long_node (deg)]
    # and their rates per century from JPL Table of Planetary Elements.
    planet_params = {
        "earth": {
            "a": 1.00000261 + 0.00000562 * T,
            "e": 0.01671123 - 0.00004392 * T,
            "I": -0.00001531 - 0.01294668 * T,
            "L": 100.46457166 + 35999.37244981 * T,
            "w_bar": 102.93768193 + 0.32327364 * T,
            "node": 0.0,
        },
        "venus": {
            "a": 0.72333566 + 0.00000390 * T,
            "e": 0.00677672 - 0.00004107 * T,
            "I": 3.39467605 - 0.00078890 * T,
            "L": 181.97909950 + 58517.81538729 * T,
            "w_bar": 131.60246718 + 0.00268329 * T,
            "node": 76.67984255 - 0.27769418 * T,
        },
        "mars": {
            "a": 1.52371034 + 0.00001847 * T,
            "e": 0.09339410 + 0.00007882 * T,
            "I": 1.84969142 - 0.00813131 * T,
            "L": -4.55343205 + 19140.30268499 * T,
            "w_bar": -23.94362959 + 0.44441088 * T,
            "node": 49.55953891 - 0.29257343 * T,
        },
        "jupiter": {
            "a": 5.20288700 - 0.00011607 * T,
            "e": 0.04838624 - 0.00013253 * T,
            "I": 1.30439695 - 0.00183714 * T,
            "L": 34.39644051 + 3034.74612775 * T,
            "w_bar": 14.72847983 + 0.21252668 * T,
            "node": 100.51797059 + 0.26385090 * T,
        },
    }

    # Solve Keplerian heliocentric position for each body
    helio_pos = {}
    for name, p in planet_params.items():
        a = p["a"]
        e = p["e"]
        I = math.radians(p["I"])
        L = math.radians(p["L"] % 360.0)
        w_bar = math.radians(p["w_bar"] % 360.0)
        node = math.radians(p["node"] % 360.0)
        w = w_bar - node  # Argument of perihelion
        M = L - w_bar     # Mean anomaly
        M = (M + math.pi) % (2.0 * math.pi) - math.pi

        # Solve Kepler's equation for eccentric anomaly E
        E = M + e * math.sin(M)
        for _ in range(5):
            dE = (M - (E - e * math.sin(E))) / (1.0 - e * math.cos(E))
            E += dE
            if abs(dE) < 1e-7:
                break

        # Orbital plane coordinates
        x_orb = a * (math.cos(E) - e)
        y_orb = a * math.sqrt(max(0.0, 1.0 - e**2)) * math.sin(E)

        # Heliocentric ecliptic coordinates
        x_ecl = (math.cos(w) * math.cos(node) - math.sin(w) * math.sin(node) * math.cos(I)) * x_orb + \
                (-math.sin(w) * math.cos(node) - math.cos(w) * math.sin(node) * math.cos(I)) * y_orb
        y_ecl = (math.cos(w) * math.sin(node) + math.sin(w) * math.cos(node) * math.cos(I)) * x_orb + \
                (-math.sin(w) * math.sin(node) + math.cos(w) * math.cos(node) * math.cos(I)) * y_orb
        z_ecl = (math.sin(w) * math.sin(I)) * x_orb + (math.cos(w) * math.sin(I)) * y_orb

        helio_pos[name] = np.array([x_ecl, y_ecl, z_ecl])

    # Geocentric coordinates = Planet(helio) - Earth(helio)
    r_earth_helio = helio_pos["earth"]
    results = {}

    for name in ["venus", "mars", "jupiter"]:
        r_geo_ecl = helio_pos[name] - r_earth_helio  # in AU
        dist_au = float(np.linalg.norm(r_geo_ecl))

        # Rotate from Ecliptic to Equatorial J2000 (ECI)
        x_eq = r_geo_ecl[0]
        y_eq = r_geo_ecl[1] * math.cos(eps_rad) - r_geo_ecl[2] * math.sin(eps_rad)
        z_eq = r_geo_ecl[1] * math.sin(eps_rad) + r_geo_ecl[2] * math.cos(eps_rad)

        r_geo_eci = np.array([x_eq, y_eq, z_eq]) * AU  # in meters
        unit_dir = r_geo_eci / np.linalg.norm(r_geo_eci)

        ra_deg = math.degrees(math.atan2(unit_dir[1], unit_dir[0])) % 360.0
        dec_deg = math.degrees(math.asin(np.clip(unit_dir[2], -1.0, 1.0)))

        results[name] = {
            "pos_eci_m": r_geo_eci.tolist(),
            "direction_unit": unit_dir.tolist(),
            "distance_au": dist_au,
            "distance_km": (dist_au * AU) / 1000.0,
            "ra_deg": float(ra_deg),
            "dec_deg": float(dec_deg),
        }

    return results


def get_full_celestial_system(beijing_time_str: str = None) -> Dict[str, Any]:
    """
    Master celestial query function:
    Resolves the exact astronomical state of Sun, Moon, and Planets for the given
    Beijing Time (CST, UTC+8).
    """
    if beijing_time_str:
        dt_cst = parse_beijing_time(beijing_time_str)
    else:
        dt_cst = get_current_beijing_time()

    dt_utc = dt_cst.astimezone(timezone.utc)
    jd = datetime_to_jd(dt_utc)
    mjd = jd_to_mjd(jd)
    gmst = gmst_rad(jd)

    sun_info = compute_sun_ephemeris(jd)
    moon_info = compute_moon_ephemeris(jd)
    planets_info = compute_planetary_ephemerides(jd)

    return {
        "status": "success",
        "beijing_time": dt_cst.strftime("%Y-%m-%d %H:%M:%S CST (UTC+8)"),
        "utc_time": dt_utc.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "timestamp_ms": int(dt_utc.timestamp() * 1000),
        "julian_date": float(jd),
        "mjd": float(mjd),
        "gmst_deg": float(math.degrees(gmst) % 360.0),
        "sun": sun_info,
        "moon": moon_info,
        "planets": planets_info,
    }
