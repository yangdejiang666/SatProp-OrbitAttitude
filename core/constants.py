"""
Astrodynamics and Geodetic Physical Constants
Standard references: WGS-84, EGM96, IERS Conventions, Vallado (2013).
"""

import math

# Earth Gravitational Parameter [m^3 / s^2] (WGS-84 / EGM96)
MU_EARTH = 3.986004418e14  # m^3 / s^2
MU_EARTH_KM = 398600.4418   # km^3 / s^2

# Earth Ellipsoid (WGS-84)
R_EARTH = 6378137.0         # Earth equatorial radius [m]
R_EARTH_KM = 6378.137       # Earth equatorial radius [km]
F_EARTH = 1.0 / 298.257223563  # Flattening factor
B_EARTH = R_EARTH * (1.0 - F_EARTH)  # Polar radius [m]
E_EARTH_SQ = 2.0 * F_EARTH - F_EARTH**2  # First eccentricity squared

# Earth Rotation Angular Velocity [rad/s]
OMEGA_EARTH = 7.2921151467e-5  # rad/s (nominal WGS-84 rate)

# Earth Zonal Harmonic Coefficients (unnormalized J coefficients)
J2 = 1.08262668e-3          # Earth oblateness quadrupole
J3 = -2.53265649e-6         # Earth pear-shape octupole
J4 = -1.61962159e-6         # Earth hexadecapole

# Celestial & Third-Body Constants
MU_SUN = 1.32712440018e20   # Sun gravitational parameter [m^3 / s^2]
MU_MOON = 4.9048695e12      # Moon gravitational parameter [m^3 / s^2]
AU = 1.495978707e11         # Astronomical Unit [m]
AU_KM = 1.495978707e8       # Astronomical Unit [km]

# Solar Radiation Pressure
P_SUN_1AU = 4.56e-6         # Solar radiation pressure at 1 AU [N / m^2]
SPEED_OF_LIGHT = 299792458.0  # Speed of light [m/s]

# Time Constants
SECONDS_PER_DAY = 86400.0
JULIAN_DAY_J2000 = 2451545.0  # JD of J2000.0 epoch (2000-01-01 12:00:00 TT)
MJD_OFFSET = 2400000.5        # Offset between JD and MJD
