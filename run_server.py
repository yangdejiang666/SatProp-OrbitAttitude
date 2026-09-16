"""
SatProp-OrbitAttitude: One-Click Mission Platform Launcher
Starts the REST API server and serves the 3D WebGL Visualization Dashboard.
"""

import sys
import os

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from service.app import app

def main():
    port = int(os.environ.get("PORT", 8080))
    host = "127.0.0.1"
    url = f"http://{host}:{port}"
    print("=" * 70)
    print("🚀 SatProp-OrbitAttitude: 卫星轨道动力学预测与姿态推演平台")
    print(f"📡 服务启动中: {url}")
    print("✨ 按 Ctrl+C 停止服务")
    print("=" * 70)

    try:
        from waitress import serve
        print("Using production WSGI server (waitress)...")
        serve(app, host=host, port=port, threads=6)
    except ImportError:
        app.run(host=host, port=port, debug=False)

if __name__ == "__main__":
    main()
