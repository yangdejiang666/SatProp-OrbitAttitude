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


def cmd_predict(args):
    """Run Unified Orbit Prediction Mathematical Model."""
    import json
    from service.data_manager import SatelliteDataManager
    from propagators.unified_predictor import UnifiedOrbitPredictor

    dm = SatelliteDataManager()
    if args.sat not in dm.satellites:
        print(f"⚠️ 卫星 {args.sat} 未在数据库中找到。")
        return

    sat_entry = dm.satellites[args.sat]
    prop = sat_entry["propagator"]
    y0 = prop.get_initial_state_eci()

    print("=" * 75)
    print(f"🛰️  高保真统一轨道动力学预测数学模型: {sat_entry['name']}")
    print(f"⚙️  配置: 积分器={args.integrator} | 姿态模式={args.mode} | 时长={args.hours}h | 步长={args.step}s | Cd={args.cd}")
    print("=" * 75)

    predictor = UnifiedOrbitPredictor(
        integrator=args.integrator,
        attitude_mode=args.mode,
        cd=args.cd,
    )
    res = predictor.predict(
        initial_state_eci=y0,
        epoch_jd=prop.epoch_jd,
        duration_hours=args.hours,
        dt_step=args.step,
    )
    out_file = os.path.join(PROJECT_ROOT, "data", "results", args.out)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=2)

    print(f"✓ 预测计算成功 (耗时: {res['wall_time_ms']:.2f} ms):")
    print(f"  - 轨道状态点数: {len(res['states_eci'])}")
    print(f"  - 近地点高度: {res['perigee']['alt_km']:.2f} km")
    print(f"  - 远地点高度: {res['apogee']['alt_km']:.2f} km")
    print(f"  - 预测星历已保存至: {out_file}\n")


def cmd_ingest(args):
    """Ingest Real Satellite Telemetry / Remote Sensing Data."""
    import json
    from service.telemetry_interface import global_telemetry_manager

    if not os.path.exists(args.file):
        print(f"❌ 找不到遥测数据文件: {args.file}")
        return

    with open(args.file, "r", encoding="utf-8") as f:
        data = json.load(f)

    sat_id = data.get("sat_id", args.sat)
    data_type = data.get("data_type", args.type)
    records = data.get("records", [])

    print(f"📥 正在录入遥测观测数据: {args.file} (卫星: {sat_id}, 类型: {data_type})...")
    res = global_telemetry_manager.ingest_observations(
        sat_id=sat_id,
        data_type=data_type,
        records=records,
        metadata=data.get("metadata", {}),
    )
    print("✓ 遥测数据成功录入统一预测引擎:")
    print(json.dumps(res, indent=2, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(
        description="SatProp-OrbitAttitude: 统一航天任务控制命令行主入口",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", help="子命令")

    # 1. server
    subparsers.add_parser("server", help="启动 3D WebGL 可视化推演平台与 RESTful API 后端服务")

    # 2. pipeline
    p_pipe = subparsers.add_parser("pipeline", help="运行端到端轨道推演与全流程管道")
    p_pipe.add_argument("--sat", type=str, default="cartosat2", help="卫星ID")
    p_pipe.add_argument("--hours", type=float, default=2.0, help="推演时长 (小时)")
    p_pipe.add_argument("--step", type=float, default=30.0, help="步长 (秒)")
    p_pipe.add_argument("--model", type=str, default="LSTM", choices=["LSTM", "TRANSFORMER"], help="神经网络残差模型")
    p_pipe.add_argument("--epochs", type=int, default=40, help="训练轮数")
    p_pipe.add_argument("--output", type=str, default="pipeline_result.json", help="输出文件名")

    # 3. predict (Unified Model)
    p_pred = subparsers.add_parser("predict", help="执行高保真统一轨道预测数学模型 (UnifiedOrbitPredictor)")
    p_pred.add_argument("--sat", type=str, default="cartosat2", help="卫星ID")
    p_pred.add_argument("--integrator", type=str, default="RKF78", choices=["RKF78", "RK4", "ABM4"], help="数值积分器")
    p_pred.add_argument("--mode", type=str, default="NADIR", choices=["NADIR", "SUN"], help="姿态指向模式")
    p_pred.add_argument("--hours", type=float, default=2.5, help="预测时长 (小时)")
    p_pred.add_argument("--step", type=float, default=30.0, help="时间步长 (秒)")
    p_pred.add_argument("--cd", type=float, default=2.2, help="大气阻力系数")
    p_pred.add_argument("--out", type=str, default="unified_prediction.json", help="输出文件名")

    # 4. ingest (Real Telemetry)
    p_ing = subparsers.add_parser("ingest", help="录入真实卫星轨道遥感/GPS/雷达观测数据文件")
    p_ing.add_argument("--file", type=str, required=True, help="输入数据 JSON 文件路径")
    p_ing.add_argument("--sat", type=str, default="custom_sat", help="卫星ID")
    p_ing.add_argument("--type", type=str, default="STATE_VECTORS", choices=["STATE_VECTORS", "GEODETIC_GPS", "RADAR_AZ_EL_RANGE"], help="数据格式")

    # 5. benchmark
    p_bench = subparsers.add_parser("benchmark", help="运行数值积分方法横向性能评测")
    p_bench.add_argument("--sat", type=str, default="cartosat2", help="卫星ID")
    p_bench.add_argument("--hours", type=float, default=6.0, help="评测时长 (小时)")
    p_bench.add_argument("--step", type=float, default=30.0, help="步长 (秒)")
    p_bench.add_argument("--out", type=str, default="benchmark_results.json", help="输出文件名")

    # 6. train
    p_train = subparsers.add_parser("train", help="离线训练轨道残差修正神经网络")
    p_train.add_argument("--sat", type=str, default="cartosat2", help="卫星ID")
    p_train.add_argument("--model", type=str, default="LSTM", choices=["LSTM", "TRANSFORMER"], help="模型结构")
    p_train.add_argument("--hours", type=float, default=3.0, help="时长 (小时)")
    p_train.add_argument("--step", type=float, default=30.0, help="步长 (秒)")
    p_train.add_argument("--seq_len", type=int, default=12, help="时序窗口")
    p_train.add_argument("--epochs", type=int, default=45, help="轮数")
    p_train.add_argument("--batch_size", type=int, default=16, help="批量大小")
    p_train.add_argument("--lr", type=float, default=2e-3, help="学习率")
    p_train.add_argument("--save", type=str, default=None, help="模型权重保存路径")

    # 7. ops
    p_ops = subparsers.add_parser("ops", help="解算地面测控过境窗口与星座通信链路拓扑")
    p_ops.add_argument("--sat", type=str, default="cartosat2", help="卫星ID")
    p_ops.add_argument("--hours", type=float, default=12.0, help="分析时长 (小时)")
    p_ops.add_argument("--step", type=float, default=30.0, help="步长 (秒)")
    p_ops.add_argument("--min_el", type=float, default=5.0, help="最小截止仰角 (度)")
    p_ops.add_argument("--isl_range_km", type=float, default=5000.0, help="最大星间链路距离 (km)")
    p_ops.add_argument("--out", type=str, default="mission_ops_results.json", help="输出文件名")

    # 8. attitude
    p_att = subparsers.add_parser("attitude", help="仿真卫星三轴姿态动力学与反作用飞轮控制")
    p_att.add_argument("--sat", type=str, default="cartosat2", help="卫星ID")
    p_att.add_argument("--mode", type=str, default="NADIR", choices=["NADIR", "SUN"], help="指向模式")
    p_att.add_argument("--hours", type=float, default=1.5, help="时长 (小时)")
    p_att.add_argument("--step", type=float, default=10.0, help="步长 (秒)")
    p_att.add_argument("--out", type=str, default="attitude_simulation.json", help="输出文件名")

    # 9. test
    subparsers.add_parser("test", help="执行自动化单元测试套件")

    args = parser.parse_args()
    if not args.command:
        print("\n" + "=" * 75)
        print("🛰️  SatProp-OrbitAttitude: 航天器高精轨道动力学预测与姿态推演平台")
        print("===========================================================================")
        print("💡 欢迎使用！检测到直接运行 main.py (无参数)，系统默认一键启动 3D WebGL 测控平台")
        print("🌐 本地服务访问地址: http://127.0.0.1:8080")
        print("✨ 提示: 若需使用其他科研计算功能，可传入相应子命令:")
        print("   - python main.py server      : 启动 3D WebGL 仿真平台与后端 API")
        print("   - python main.py pipeline    : 执行全流程轨道外推与 LSTM 残差修正")
        print("   - python main.py benchmark   : 运行 RK4 vs RKF78 vs ABM4 数值积分器对比评测")
        print("   - python main.py train       : 离线训练 ML 轨道残差时序网络")
        print("   - python main.py ops         : 解算地面站过境可见窗口与星间激光链路拓扑")
        print("   - python main.py attitude    : 仿真三轴卫星姿态动力学与飞轮控制")
        print("   - python main.py test        : 运行全套自动化单元测试与算法验证")
        print("===========================================================================\n")
        cmd_server(args)
        return

    handlers = {
        "server": cmd_server,
        "pipeline": cmd_pipeline,
        "predict": cmd_predict,
        "ingest": cmd_ingest,
        "benchmark": cmd_benchmark,
        "train": cmd_train,
        "ops": cmd_ops,
        "attitude": cmd_attitude,
        "test": cmd_test,
    }
    handlers[args.command](args)


if __name__ == "__main__":
    main()
