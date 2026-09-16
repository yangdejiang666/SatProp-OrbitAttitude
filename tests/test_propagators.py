"""
Unit and Integration Tests for SGP4, Cowell (RK4, RKF78, ABM4), and Hybrid ML Propagator.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import numpy as np
from core.time_systems import datetime_to_jd
from datetime import datetime, timezone
from propagators.sgp4_propagator import SGP4Propagator
from propagators.cowell_propagator import CowellPropagator
from propagators.hybrid_propagator import HybridOrbitPropagator
from ml.residual_dataset import build_residual_sequences
from ml.trainer import train_residual_model, evaluate_residual_correction

# Real TLE for ISS (ZARYA)
ISS_TLE_L1 = "1 25544U 98067A   26075.51736111  .00016717  00000-0  10270-3 0  9002"
ISS_TLE_L2 = "2 25544  51.6420 180.2000 0004500  70.1200 290.0000 15.49815300 10008"


def test_propagators_and_ml():
    print("Testing SGP4 Propagator...")
    sgp4 = SGP4Propagator(ISS_TLE_L1, ISS_TLE_L2)
    y0_eci = sgp4.get_initial_state_eci()
    epoch_jd = sgp4.epoch_jd
    print(f"ISS initial state ECI: r={y0_eci[0:3]/1000} km, v={y0_eci[3:6]/1000} km/s")

    # 1 hour propagation (3600s), step = 30s
    t_span = 3600.0
    dt_step = 30.0

    print("Running SGP4 propagation (1h)...")
    res_sgp4 = sgp4.propagate(t_span, dt_step, epoch_jd)
    print(f"SGP4 produced {len(res_sgp4['times_s'])} points.")

    print("Running Cowell RKF78 High-Precision Reference...")
    cowell_rkf78 = CowellPropagator(
        integrator="RKF78",
        use_j2=True,
        use_j3=True,
        use_j4=True,
        use_drag=True,
        use_sun=True,
        use_moon=True,
        use_srp=True,
    )
    res_rkf78 = cowell_rkf78.propagate(t_span, dt_step, epoch_jd, initial_state_eci=y0_eci)
    print(f"Cowell RKF78 completed in {res_rkf78['stats']['elapsed_s']:.3f}s with {res_rkf78['stats']['n_evals']} evals.")

    print("Running Cowell RK4 Integrator...")
    cowell_rk4 = CowellPropagator(integrator="RK4", use_j2=True, use_drag=True)
    res_rk4 = cowell_rk4.propagate(t_span, dt_step, epoch_jd, initial_state_eci=y0_eci)
    print(f"Cowell RK4 completed in {res_rk4['stats']['elapsed_s']:.3f}s.")

    print("Running Cowell ABM4 Predictor-Corrector Integrator...")
    cowell_abm = CowellPropagator(integrator="ABM4", use_j2=True, use_drag=True)
    res_abm = cowell_abm.propagate(t_span, dt_step, epoch_jd, initial_state_eci=y0_eci)
    print(f"Cowell ABM4 completed in {res_abm['stats']['elapsed_s']:.3f}s.")

    # Build ML Dataset between Cowell truth and SGP4
    print("Building residual dataset...")
    data_dict = build_residual_sequences(
        states_sgp4=res_sgp4["states_eci"],
        states_truth=res_rkf78["states_eci"],
        times_s=res_sgp4["times_s"],
        seq_length=12,
    )
    features = data_dict["features"]
    targets = data_dict["targets"]
    print(f"Dataset samples: {len(features)}, features shape: {features.shape}, targets shape: {targets.shape}")

    # Train LSTM Residual Model
    print("Training Residual LSTM Model...")
    model, history, scalers = train_residual_model(
        features=features,
        targets=targets,
        model_type="LSTM",
        epochs=45,
        batch_size=16,
        lr=2e-3,
    )

    # Evaluate ML error correction
    eval_res = evaluate_residual_correction(model, features, targets, scalers)
    print("--- EVALUATION RESULTS ---")
    print(f"Uncorrected SGP4 1-sigma Position Error: {eval_res['uncorrected']['pos_sigma_1_m']:.2f} m")
    print(f"Corrected Hybrid 1-sigma Position Error:   {eval_res['corrected']['pos_sigma_1_m']:.2f} m")
    print(f"Error Reduction @ 1-sigma:               {eval_res['reduction_pos_pct_1sigma']:.2f}%")
    print(f"Target Achieved (>=10%):                 {eval_res['target_achieved']}")

    assert eval_res["reduction_pos_pct_1sigma"] > 0, "ML did not reduce error"
    print("All propagator and ML tests PASSED successfully!")


if __name__ == "__main__":
    test_propagators_and_ml()
