"""
SatProp-OrbitAttitude: Unified Master Mission Control CLI
=========================================================
Single entrypoint to run all subsystems, simulation pipelines,
benchmarks, machine learning trainers, and the 3D WebGL platform.

Commands:
  server      Launch RESTful API backend & 3D WebGL Digital Twin Dashboard
  pipeline    Execute end-to-end mission pipeline (SGP4 + Cowell + ML + Ops)
  benchmark   Run numerical integrators benchmark (RK4 vs RKF78 vs ABM4)
  train       Train LSTM / Transformer residual correction neural network
  ops         Compute Ground Station passes (AOS/LOS) & ISL constellation topology
  attitude    Simulate 3-axis spacecraft attitude dynamics & quaternion tracking
  test        Run full automated unit & integration test suite
"""

import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import argparse

PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def cmd_server(args):
    """Launch 3D WebGL Visualization & API Server."""
    from run_server import main as server_main
    server_main()


def cmd_pipeline(args):
    """Run End-to-End Mission Pipeline."""
    from scripts.run_pipeline import run_complete_pipeline
    out_file = os.path.join(PROJECT_ROOT, "data", "results", args.output)
    run_complete_pipeline(
        sat_id=args.sat,
        duration_hours=args.hours,
        dt_step=args.step,
        model_type=args.model,
        epochs=args.epochs,
        output_json=out_file,
    )


def cmd_benchmark(args):
    """Run Numerical Integrator Benchmark."""
    from scripts.benchmark_integrators import run_benchmark_cli
    out_file = os.path.join(PROJECT_ROOT, "data", "results", args.out)
    run_benchmark_cli(
        sat_id=args.sat,
        hours=args.hours,
        step=args.step,
        out_path=out_file,
    )


def cmd_train(args):
    """Train ML Residual Correction Network."""
    from scripts.train_ml_residual import run_train_cli
    run_train_cli(
        sat_id=args.sat,
        model_type=args.model,
        hours=args.hours,
        step=args.step,
        seq_len=args.seq_len,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        save_path=args.save,
    )


def cmd_ops(args):
    """Compute Ground Station Passes and ISL Network Topology."""
    from scripts.compute_mission_ops import run_ops_cli
    out_file = os.path.join(PROJECT_ROOT, "data", "results", args.out)
    run_ops_cli(
        sat_id=args.sat,
        hours=args.hours,
        step=args.step,
        min_el=args.min_el,
        isl_range_km=args.isl_range_km,
        out_path=out_file,
    )


def cmd_attitude(args):
    """Simulate 3-Axis Spacecraft Attitude Dynamics."""
    from scripts.simulate_attitude import run_attitude_cli
    out_file = os.path.join(PROJECT_ROOT, "data", "results", args.out)
    run_attitude_cli(
        sat_id=args.sat,
        mode=args.mode,
        hours=args.hours,
        step=args.step,
        out_path=out_file,
    )


def cmd_test(args):
    """Run Test Suite."""
    import unittest
    loader = unittest.TestLoader()
    suite = loader.discover(os.path.join(PROJECT_ROOT, "tests"))
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)


def main():
    parser = argparse.ArgumentParser(
        prog="SatProp-OrbitAttitude",
        description="SatProp-OrbitAttitude: Satellite Ephemeris Prediction & Attitude Simulation Platform",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # 1. server
    p_server = subparsers.add_parser("server", help="Launch 3D WebGL Dashboard & API Server")
    p_server.add_argument("--port", type=int, default=8080, help="Server port (default: 8080)")

    # 2. pipeline
    p_pipe = subparsers.add_parser("pipeline", help="Run end-to-end orbit prediction & validation pipeline")
    p_pipe.add_argument("--sat", type=str, default="cartosat2", help="Satellite ID (cartosat2, iss, tiangong)")
    p_pipe.add_argument("--hours", type=float, default=2.0, help="Simulation duration in hours")
    p_pipe.add_argument("--step", type=float, default=30.0, help="Time step in seconds")
    p_pipe.add_argument("--model", type=str, default="LSTM", choices=["LSTM", "TRANSFORMER"], help="ML model type")
    p_pipe.add_argument("--epochs", type=int, default=35, help="Training epochs")
    p_pipe.add_argument("--output", type=str, default="pipeline_result.json", help="Result JSON filename")

    # 3. benchmark
    p_bench = subparsers.add_parser("benchmark", help="Run numerical integrators benchmark (RK4 vs RKF78 vs ABM4)")
    p_bench.add_argument("--sat", type=str, default="cartosat2", help="Satellite ID")
    p_bench.add_argument("--hours", type=float, default=6.0, help="Benchmark arc duration in hours")
    p_bench.add_argument("--step", type=float, default=30.0, help="Integration step in seconds")
    p_bench.add_argument("--out", type=str, default="benchmark_results.json", help="Output JSON filename")

    # 4. train
    p_train = subparsers.add_parser("train", help="Train LSTM or Transformer residual model")
    p_train.add_argument("--sat", type=str, default="cartosat2", help="Satellite ID")
    p_train.add_argument("--model", type=str, default="LSTM", choices=["LSTM", "TRANSFORMER"], help="Model type")
    p_train.add_argument("--hours", type=float, default=3.0, help="Dataset duration in hours")
    p_train.add_argument("--step", type=float, default=30.0, help="Time step in seconds")
    p_train.add_argument("--seq_len", type=int, default=12, help="Sequence window length")
    p_train.add_argument("--epochs", type=int, default=45, help="Training epochs")
    p_train.add_argument("--batch_size", type=int, default=16, help="Batch size")
    p_train.add_argument("--lr", type=float, default=2e-3, help="Learning rate")
    p_train.add_argument("--save", type=str, default=None, help="Checkpoint save path")

    # 5. ops
    p_ops = subparsers.add_parser("ops", help="Compute ground station passes and constellation ISL topology")
    p_ops.add_argument("--sat", type=str, default="cartosat2", help="Satellite ID")
    p_ops.add_argument("--hours", type=float, default=12.0, help="Analysis duration in hours")
    p_ops.add_argument("--step", type=float, default=30.0, help="Time step in seconds")
    p_ops.add_argument("--min_el", type=float, default=5.0, help="Min elevation mask in degrees")
    p_ops.add_argument("--isl_range_km", type=float, default=5000.0, help="Max ISL range in km")
    p_ops.add_argument("--out", type=str, default="mission_ops_results.json", help="Output JSON filename")

    # 6. attitude
    p_att = subparsers.add_parser("attitude", help="Simulate satellite 3-axis attitude dynamics")
    p_att.add_argument("--sat", type=str, default="cartosat2", help="Satellite ID")
    p_att.add_argument("--mode", type=str, default="NADIR", choices=["NADIR", "SUN"], help="Attitude mode")
    p_att.add_argument("--hours", type=float, default=1.5, help="Simulation duration in hours")
    p_att.add_argument("--step", type=float, default=10.0, help="Time step in seconds")
    p_att.add_argument("--out", type=str, default="attitude_simulation.json", help="Output JSON filename")

    # 7. test
    subparsers.add_parser("test", help="Run automated test suite")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    handlers = {
        "server": cmd_server,
        "pipeline": cmd_pipeline,
        "benchmark": cmd_benchmark,
        "train": cmd_train,
        "ops": cmd_ops,
        "attitude": cmd_attitude,
        "test": cmd_test,
    }
    handlers[args.command](args)


if __name__ == "__main__":
    main()
