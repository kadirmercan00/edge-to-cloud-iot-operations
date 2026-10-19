#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# flash_firmware.sh — OTA / USB Firmware Flash Script
# Edge-to-Cloud IoT Operations Platform
# ═══════════════════════════════════════════════════════════════
# Usage: ./scripts/flash_firmware.sh <target> [port]
# Targets: anchor-unit, smart-card, ble-tof-gateway
# Example: ./scripts/flash_firmware.sh smart-card /dev/ttyUSB0

set -euo pipefail

TARGET="${1:-}"
PORT="${2:-/dev/ttyUSB0}"

if [ -z "$TARGET" ]; then
    echo "Usage: $0 <target> [port]"
    echo "Targets: anchor-unit | smart-card | ble-tof-gateway"
    exit 1
fi

FIRMWARE_DIR="firmware/$TARGET"

if [ ! -d "$FIRMWARE_DIR" ]; then
    echo "Error: Target directory '$FIRMWARE_DIR' not found"
    exit 1
fi

echo "═══════════════════════════════════════════════"
echo "  Flashing: $TARGET"
echo "  Port:     $PORT"
echo "  Dir:      $FIRMWARE_DIR"
echo "═══════════════════════════════════════════════"

# Build
echo "[1/3] Building firmware..."
pio run -d "$FIRMWARE_DIR"

# Upload
echo "[2/3] Uploading to $PORT..."
pio run -d "$FIRMWARE_DIR" --target upload --upload-port "$PORT"

# Monitor
echo "[3/3] Opening serial monitor..."
pio device monitor -d "$FIRMWARE_DIR" --port "$PORT" --baud 115200
