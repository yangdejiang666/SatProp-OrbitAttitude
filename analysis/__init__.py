"""
Analysis and Mission Extension Module: Benchmarks, Error Metrics, Visibility, and ISL Topology.
"""

from analysis.benchmark import run_integrator_benchmark, compute_orbital_energy
from analysis.error_metrics import calculate_error_statistics, analyze_trajectory_errors
from analysis.visibility import (
    calculate_station_aer_series,
    find_visibility_passes,
    compute_all_station_windows,
    DEFAULT_GROUND_STATIONS,
)
from analysis.isl_topology import (
    check_isl_visibility,
    calculate_isl_doppler,
    analyze_constellation_isl_topology,
)
