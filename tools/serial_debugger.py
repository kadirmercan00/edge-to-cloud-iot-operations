#!/usr/bin/env python3
"""
Industrial Serial Debugger & Telemetry Streamer
Listens to ESP32 UART output, parses JSON logs, and validates packet formatting.
"""

import sys
import time
import json
import argparse
try:
    import serial
except ImportError:
    serial = None

def parse_args():
    parser = argparse.ArgumentParser(description="ESP32 Telemetry Serial Debugger")
    parser.add_argument("--port", default="COM3", help="Serial port (e.g. COM3 or /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--dump-json", action="store_true", help="Dump parsed JSON telemetry")
    return parser.parse_args()

def run_debugger(port, baud, dump_json):
    if serial is None:
        print("[!] pyserial not installed. Running in mock demonstration mode.")
        mock_stream()
        return

    try:
        ser = serial.Serial(port, baud, timeout=1)
        print(f"[*] Connected to {port} at {baud} baud. Listening for frames...")
        while True:
            line = ser.readline().decode('utf-8', errors='replace').strip()
            if not line:
                continue

            if line.startswith("{") and line.endswith("}"):
                try:
                    payload = json.loads(line)
                    print(f"[JSON EVENT] Device: {payload.get('device_id')} | Status: {payload.get('status')}")
                    if dump_json:
                        print(json.dumps(payload, indent=2))
                except json.JSONDecodeError:
                    print(f"[RAW LOG] {line}")
            else:
                print(f"[SERIAL] {line}")
    except KeyboardInterrupt:
        print("\n[*] Exiting debugger.")
    except Exception as e:
        print(f"[ERROR] {e}")

def mock_stream():
    """Generates synthetic test logs for offline evaluation."""
    for i in range(5):
        sample = {
            "device_id": "anchor-node-01",
            "uptime_s": 120 + i * 10,
            "vibration_rms": round(0.045 + i * 0.005, 3),
            "temp_c": 26.4,
            "status": "HEALTHY"
        }
        print(f"[MOCK SERIAL] {json.dumps(sample)}")
        time.sleep(0.5)

if __name__ == '__main__':
    args = parse_args()
    run_debugger(args.port, args.baud, args.dump_json)
