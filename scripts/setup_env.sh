#!/usr/bin/env bash
# ==============================================================================
# Development Environment Setup Script
# Configures PlatformIO CLI, Python virtual environment, and tool dependencies
# ==============================================================================

set -e

echo "=== [1/4] Checking Python & PlatformIO ==="
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required but not installed. Aborting."
    exit 1
fi

echo "=== [2/4] Setting up Python virtual environment ==="
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r ml/requirements.txt
pip install -r cloud/lambda/requirements.txt

echo "=== [3/4] Installing PlatformIO CLI ==="
pip install platformio

echo "=== [4/4] Verifying Environment ==="
pio --version
python3 -c "import sklearn; print(f'scikit-learn version: {sklearn.__version__}')"

echo "=== Setup complete! Activate environment using: source .venv/bin/activate ==="
