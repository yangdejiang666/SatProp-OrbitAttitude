"""
Time Systems and Epoch Conversions
Supports UTC, TT (Terrestrial Time), Julian Date (JD), MJD, and GMST (Greenwich Mean Sidereal Time).
Reference: Vallado, D. A. (2013). Fundamentals of Astrodynamics and Applications.
"""

import math
from datetime import datetime, timezone
from core.constants import JULIAN_DAY_J2000, MJD_OFFSET, SECONDS_PER_DAY


def datetime_to_jd(dt: datetime) -> float:
    """
    Convert a UTC datetime object to Julian Date (JD).
    Algorithm from Vallado / Meeus.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)

    year = dt.year
    month = dt.month
    day = dt.day

    if month <= 2:
        year -= 1
        month += 12

    A = math.floor(year / 100)
    B = 2 - A + math.floor(A / 4)

    fractional_day = (
        dt.hour + dt.minute / 60.0 + (dt.second + dt.microsecond * 1e-6) / 3600.0
    ) / 24.0

    jd = (
        math.floor(365.25 * (year + 4716))
        + math.floor(30.6001 * (month + 1))
        + day
        + B
        - 1524.5
        + fractional_day
    )
    return jd


def jd_to_datetime(jd: float) -> datetime:
    """
    Convert Julian Date (JD) back to UTC datetime.
    """
    jd_adjusted = jd + 0.5
    Z = math.floor(jd_adjusted)
    F = jd_adjusted - Z

    if Z < 2299161:
        A = Z
    else:
        alpha = math.floor((Z - 1867216.25) / 36524.25)
        A = Z + 1 + alpha - math.floor(alpha / 4)

    B = A + 1524
    C = math.floor((B - 122.1) / 365.25)
    D = math.floor(365.25 * C)
    E = math.floor((B - D) / 30.6001)

    day = B - D - math.floor(30.6001 * E) + F
    month = E - 1 if E < 14 else E - 13
    year = C - 4716 if month > 2 else C - 4715

    day_int = int(math.floor(day))
    day_frac = day - day_int
    total_seconds = day_frac * SECONDS_PER_DAY
    hour = int(total_seconds // 3600)
    total_seconds %= 3600
    minute = int(total_seconds // 60)
    second = total_seconds % 60
    sec_int = int(second)
    microsecond = int(round((second - sec_int) * 1e6))
    if microsecond >= 1000000:
        microsecond = 999999

    return datetime(
        year, month, day_int, hour, minute, sec_int, microsecond, tzinfo=timezone.utc
    )


def jd_to_mjd(jd: float) -> float:
    """Convert Julian Date to Modified Julian Date (MJD)."""
    return jd - MJD_OFFSET


def mjd_to_jd(mjd: float) -> float:
    """Convert Modified Julian Date to Julian Date."""
    return mjd + MJD_OFFSET


def jd_to_j2000_centuries(jd: float) -> float:
    """Number of Julian centuries elapsed since J2000.0 epoch."""
    return (jd - JULIAN_DAY_J2000) / 36525.0


def gmst_rad(jd: float) -> float:
    """
    Calculate Greenwich Mean Sidereal Time (GMST) in radians for a given Julian Date.
    IAU 1982 model as documented in Vallado (Eq 3-47).
    Returns angle normalized to [0, 2*pi).
    """
    T_UT1 = jd_to_j2000_centuries(jd)
    # GMST in seconds of time at 0h UT1
    # Standard formula for GMST in degrees:
    theta_deg = (
        280.46061837
        + 360.98564736629 * (jd - JULIAN_DAY_J2000)
        + 0.000387933 * (T_UT1**2)
        - (T_UT1**3) / 38710000.0
    )
    theta_rad = math.radians(theta_deg % 360.0)
    return theta_rad % (2.0 * math.pi)


def jd_to_tt(jd_utc: float, delta_t_sec: float = 69.184) -> float:
    """
    Convert UTC Julian Date to TT (Terrestrial Time) Julian Date.
    Approximate Delta T = TAI - UTC + 32.184s = 37s + 32.184s = 69.184s (current epoch).
    """
    return jd_utc + delta_t_sec / SECONDS_PER_DAY
