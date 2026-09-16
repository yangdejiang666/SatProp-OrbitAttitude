"""
SatProp-OrbitAttitude: End-to-End Mission Pipeline Launcher
==========================================================
Unified entrypoint invoking the modular pipeline engine in scripts/run_pipeline.py.
Executes analytical SGP4 baseline, high-order Cowell numerical integration,
machine learning RTN residual compensation, ground station passes, and 3-axis attitude.
"""

import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from scripts.run_pipeline import main

if __name__ == "__main__":
    main()
