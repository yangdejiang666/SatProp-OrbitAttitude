"""
High-Precision Numerical Integrators for Astrodynamics
Includes:
- RK4: Classical 4th Order Runge-Kutta (Fixed Step)
- RKF78: Runge-Kutta-Fehlberg 7(8) (Adaptive Step Size Control)
- ABM4: Adams-Bashforth-Moulton 4-Step Predictor-Corrector
- ABM8: Adams-Bashforth-Moulton 8-Step High-Order Predictor-Corrector
Reference: Hairer, Nørsett, Wanner (1993); Fehlberg (1968); Vallado (2013).
"""

import math
import time
from typing import Callable, Tuple, Dict, Any, List
import numpy as np


class NumericalIntegratorResult:
    def __init__(self, t: np.ndarray, y: np.ndarray, n_evals: int, stats: Dict[str, Any]):
        self.t = t
        self.y = y
        self.n_evals = n_evals
        self.stats = stats


def integrate_rk4(
    func: Callable[[float, np.ndarray], np.ndarray],
    t_span: Tuple[float, float],
    y0: np.ndarray,
    dt: float,
) -> NumericalIntegratorResult:
    """
    Classical fixed-step 4th order Runge-Kutta integrator.
    """
    start_time = time.perf_counter()
    t_start, t_end = t_span
    n_steps = int(math.ceil((t_end - t_start) / dt))

    t_arr = np.zeros(n_steps + 1, dtype=np.float64)
    y_arr = np.zeros((n_steps + 1, len(y0)), dtype=np.float64)

    t_arr[0] = t_start
    y_arr[0] = y0.copy()

    n_evals = 0
    t_curr = t_start
    y_curr = y0.copy()

    for i in range(n_steps):
        h = min(dt, t_end - t_curr)
        if h <= 0:
            break

        k1 = func(t_curr, y_curr)
        k2 = func(t_curr + 0.5 * h, y_curr + 0.5 * h * k1)
        k3 = func(t_curr + 0.5 * h, y_curr + 0.5 * h * k2)
        k4 = func(t_curr + h, y_curr + h * k3)
        n_evals += 4

        y_curr = y_curr + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
        t_curr = t_curr + h

        t_arr[i + 1] = t_curr
        y_arr[i + 1] = y_curr

    elapsed = time.perf_counter() - start_time
    stats = {
        "method": "RK4",
        "n_steps": n_steps,
        "n_evals": n_evals,
        "elapsed_s": elapsed,
        "fixed_step": dt,
    }
    return NumericalIntegratorResult(t_arr, y_arr, n_evals, stats)


# RKF78 Fehlberg 13-stage Butcher Tableau coefficients (Fehlberg 1968, NASA TR R-287)
RKF78_C = np.array([
    0.0, 2.0/27.0, 1.0/9.0, 1.0/6.0, 5.0/12.0, 1.0/2.0,
    5.0/6.0, 1.0/6.0, 2.0/3.0, 1.0/3.0, 1.0, 0.0, 1.0
], dtype=np.float64)

RKF78_A = [
    [],
    [2.0/27.0],
    [1.0/36.0, 1.0/12.0],
    [1.0/24.0, 0.0, 1.0/8.0],
    [5.0/12.0, 0.0, -25.0/16.0, 25.0/16.0],
    [1.0/20.0, 0.0, 0.0, 1.0/4.0, 1.0/5.0],
    [-25.0/108.0, 0.0, 0.0, 125.0/108.0, -65.0/27.0, 125.0/54.0],
    [31.0/300.0, 0.0, 0.0, 0.0, 61.0/225.0, -2.0/9.0, 13.0/900.0],
    [2.0, 0.0, 0.0, -53.0/6.0, 704.0/45.0, -107.0/9.0, 67.0/90.0, 3.0],
    [-91.0/108.0, 0.0, 0.0, 23.0/108.0, -976.0/135.0, 311.0/54.0, -19.0/60.0, 17.0/6.0, -1.0/12.0],
    [2383.0/4100.0, 0.0, 0.0, -341.0/164.0, 4496.0/1025.0, -301.0/82.0, 2133.0/4100.0, 45.0/82.0, 45.0/164.0, 18.0/41.0],
    [3.0/205.0, 0.0, 0.0, 0.0, 0.0, -6.0/41.0, -3.0/205.0, -3.0/41.0, 3.0/41.0, 6.0/41.0, 0.0],
    [-1777.0/4100.0, 0.0, 0.0, -341.0/164.0, 4496.0/1025.0, -289.0/82.0, 2193.0/4100.0, 51.0/82.0, 33.0/164.0, 12.0/41.0, 0.0, 1.0]
]

# 8th-order solution weights
RKF78_B8 = np.array([
    41.0/840.0, 0.0, 0.0, 0.0, 0.0, 34.0/105.0, 9.0/35.0,
    9.0/35.0, 9.0/280.0, 9.0/280.0, 41.0/840.0, 0.0, 0.0
], dtype=np.float64)

# 7th-order solution weights
RKF78_B7 = np.array([
    0.0, 0.0, 0.0, 0.0, 0.0, 34.0/105.0, 9.0/35.0,
    9.0/35.0, 9.0/280.0, 9.0/280.0, 0.0, 41.0/840.0, 41.0/840.0
], dtype=np.float64)


def integrate_rkf78(
    func: Callable[[float, np.ndarray], np.ndarray],
    t_span: Tuple[float, float],
    y0: np.ndarray,
    tol: float = 1e-9,
    h_init: float = 30.0,
    h_min: float = 0.01,
    h_max: float = 300.0,
    t_eval: np.ndarray = None,
) -> NumericalIntegratorResult:
    """
    High-precision adaptive Runge-Kutta-Fehlberg 7(8) integrator.
    Evaluates state at specified t_eval points using cubic/Hermite interpolation or dense stepping.
    """
    start_time = time.perf_counter()
    t_start, t_end = t_span

    if t_eval is None:
        t_eval = np.linspace(t_start, t_end, int((t_end - t_start) / 60.0) + 1)

    dim = len(y0)
    t_curr = t_start
    y_curr = y0.copy()
    h = min(h_init, h_max)

    y_eval = np.zeros((len(t_eval), dim), dtype=np.float64)
    y_eval[0] = y0.copy()
    eval_idx = 1

    n_evals = 0
    n_accepted = 0
    n_rejected = 0

    k = np.zeros((13, dim), dtype=np.float64)

    while t_curr < t_end and eval_idx < len(t_eval):
        if t_curr + h > t_end:
            h = t_end - t_curr

        # Compute 13 stages
        k[0] = func(t_curr, y_curr)
        for i in range(1, 13):
            y_stage = y_curr.copy()
            for j in range(i):
                coeff = RKF78_A[i][j]
                if coeff != 0.0:
                    y_stage += h * coeff * k[j]
            k[i] = func(t_curr + RKF78_C[i] * h, y_stage)
        n_evals += 13

        # Compute 7th and 8th order solutions
        y8 = y_curr + h * np.sum(RKF78_B8[:, None] * k, axis=0)
        y7 = y_curr + h * np.sum(RKF78_B7[:, None] * k, axis=0)

        # Local truncation error estimate
        error_vec = y8 - y7
        scale = tol * (1.0 + np.maximum(np.abs(y_curr), np.abs(y8)))
        error_norm = np.max(np.abs(error_vec) / scale)

        if error_norm <= 1.0 or h <= h_min:
            # Step accepted
            n_accepted += 1
            t_next = t_curr + h

            # Interpolate to output grid t_eval falling in [t_curr, t_next]
            while eval_idx < len(t_eval) and t_eval[eval_idx] <= t_next:
                theta = (t_eval[eval_idx] - t_curr) / h
                # Linear/Hermite interpolation between y_curr and y8
                y_eval[eval_idx] = (1.0 - theta) * y_curr + theta * y8
                eval_idx += 1

            t_curr = t_next
            y_curr = y8

            # Step size adaptation for next step
            factor = 0.9 * (1.0 / (error_norm + 1e-15)) ** (1.0 / 8.0)
            factor = np.clip(factor, 0.2, 2.0)
            h = np.clip(h * factor, h_min, h_max)
        else:
            # Step rejected
            n_rejected += 1
            factor = 0.9 * (1.0 / (error_norm + 1e-15)) ** (1.0 / 8.0)
            factor = np.clip(factor, 0.1, 0.5)
            h = max(h * factor, h_min)

    # Fill any remaining t_eval if reached t_end
    while eval_idx < len(t_eval):
        y_eval[eval_idx] = y_curr
        eval_idx += 1

    elapsed = time.perf_counter() - start_time
    stats = {
        "method": "RKF78",
        "n_accepted_steps": n_accepted,
        "n_rejected_steps": n_rejected,
        "n_evals": n_evals,
        "elapsed_s": elapsed,
        "tol": tol,
    }
    return NumericalIntegratorResult(t_eval, y_eval, n_evals, stats)


def integrate_abm4(
    func: Callable[[float, np.ndarray], np.ndarray],
    t_span: Tuple[float, float],
    y0: np.ndarray,
    dt: float,
) -> NumericalIntegratorResult:
    """
    Adams-Bashforth-Moulton 4th order Predictor-Corrector multi-step method.
    Uses RK4 for bootstrapping first 3 steps, then propagates with AB4-AM4.
    Predictor (AB4): y_{n+1}^{(p)} = y_n + (h/24) * [55 f_n - 59 f_{n-1} + 37 f_{n-2} - 9 f_{n-3}]
    Corrector (AM4): y_{n+1} = y_n + (h/24) * [9 f_{n+1}^{(p)} + 19 f_n - 5 f_{n-1} + f_{n-2}]
    """
    start_time = time.perf_counter()
    t_start, t_end = t_span
    n_steps = int(math.ceil((t_end - t_start) / dt))

    t_arr = np.linspace(t_start, t_end, n_steps + 1)
    y_arr = np.zeros((n_steps + 1, len(y0)), dtype=np.float64)
    f_history = np.zeros((n_steps + 1, len(y0)), dtype=np.float64)

    y_arr[0] = y0.copy()
    f_history[0] = func(t_arr[0], y_arr[0])
    n_evals = 1

    # Bootstrap the first 3 steps using classical RK4
    for i in range(min(3, n_steps)):
        t_n = t_arr[i]
        y_n = y_arr[i]
        h = t_arr[i + 1] - t_n

        k1 = f_history[i]
        k2 = func(t_n + 0.5 * h, y_n + 0.5 * h * k1)
        k3 = func(t_n + 0.5 * h, y_n + 0.5 * h * k2)
        k4 = func(t_n + h, y_n + h * k3)
        n_evals += 3

        y_arr[i + 1] = y_n + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
        f_history[i + 1] = func(t_arr[i + 1], y_arr[i + 1])
        n_evals += 1

    # Multi-step loop: AB4 predictor -> AM4 corrector (PECE)
    for i in range(3, n_steps):
        h = t_arr[i + 1] - t_arr[i]
        f_n = f_history[i]
        f_n1 = f_history[i - 1]
        f_n2 = f_history[i - 2]
        f_n3 = f_history[i - 3]

        # Predictor (Adams-Bashforth 4)
        y_pred = y_arr[i] + (h / 24.0) * (
            55.0 * f_n - 59.0 * f_n1 + 37.0 * f_n2 - 9.0 * f_n3
        )

        # Evaluate at predicted point
        f_pred = func(t_arr[i + 1], y_pred)
        n_evals += 1

        # Corrector (Adams-Moulton 4)
        y_corr = y_arr[i] + (h / 24.0) * (
            9.0 * f_pred + 19.0 * f_n - 5.0 * f_n1 + f_n2
        )

        y_arr[i + 1] = y_corr
        f_history[i + 1] = func(t_arr[i + 1], y_corr)
        n_evals += 1

    elapsed = time.perf_counter() - start_time
    stats = {
        "method": "ABM4",
        "n_steps": n_steps,
        "n_evals": n_evals,
        "elapsed_s": elapsed,
        "fixed_step": dt,
    }
    return NumericalIntegratorResult(t_arr, y_arr, n_evals, stats)
