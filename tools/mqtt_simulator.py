"""
MQTT Simulator — End-to-End Testing Tool
Edge-to-Cloud IoT Operations Platform

Simulates field devices (anchors, smart cards, gateways) publishing
telemetry to an MQTT broker for testing the full pipeline without
physical hardware.

Usage:
    python mqtt_simulator.py --broker <host> --port 1883 --scenario fault
"""

import argparse
import json
import time
import random
import threading
from datetime import datetime, timezone

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Install paho-mqtt: pip install paho-mqtt")
    exit(1)


# ═══════════════════════════════════════════════════════════════════════════
# DEVICE SIMULATORS
# ═══════════════════════════════════════════════════════════════════════════

class AnchorSimulator:
    """Simulates a field anchor unit sending status telemetry."""

    def __init__(self, client: mqtt.Client, device_id: str = "ANCHOR_001"):
        self.client = client
        self.device_id = device_id
        self.topic = f"iot/prod/site01/fleet/{device_id}/event"
        self.status = "operational"

    def publish_heartbeat(self):
        payload = {
            "schema": "fleet.asset.status.v1",
            "device_id": self.device_id,
            "type": "ANCHOR",
            "status": self.status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "fw": "3.5.6",
            "rssi": random.randint(-80, -40),
            "uptime_s": int(time.time()) % 86400,
            "heap_free": random.randint(100000, 200000),
        }
        self.client.publish(self.topic, json.dumps(payload), qos=1)
        print(f"[ANCHOR] {self.device_id} → {self.status}")

    def simulate_fault(self):
        self.status = "fault"
        self.publish_heartbeat()
        print(f"[ANCHOR] ⚠️  FAULT triggered on {self.device_id}")

    def simulate_recovery(self):
        self.status = "operational"
        self.publish_heartbeat()
        print(f"[ANCHOR] ✅ {self.device_id} recovered")


class CardSimulator:
    """Simulates a personnel smart card."""

    def __init__(self, client: mqtt.Client, card_id: str = "CARD_001"):
        self.client = client
        self.card_id = card_id
        self.topic = f"iot/prod/site01/fleet/{card_id}/status"
        self.cmd_topic = f"iot/prod/site01/fleet/{card_id}/command"

    def publish_status(self, status: str, task_id: str = None):
        payload = {
            "schema": "fleet.card.status.v1",
            "card_id": self.card_id,
            "status": status,
            "state": "IDLE",
            "fw": "3.5.6",
            "rssi": random.randint(-70, -30),
            "heap": random.randint(80000, 150000),
        }
        if task_id:
            payload["task_id"] = task_id
        self.client.publish(self.topic, json.dumps(payload), qos=1)
        print(f"[CARD] {self.card_id} → {status}")

    def subscribe_commands(self):
        def on_command(client, userdata, msg):
            data = json.loads(msg.payload)
            print(f"[CARD] 📩 Command received: {data.get('action')}")
            if data.get("action") == "new_task":
                print(f"       Task: {data.get('task_id')}")
                print(f"       Asset: {data.get('asset_id')}")
                print(f"       Location: {data.get('location')}")

        self.client.subscribe(self.cmd_topic)
        self.client.message_callback_add(self.cmd_topic, on_command)


# ═══════════════════════════════════════════════════════════════════════════
# SCENARIO RUNNERS
# ═══════════════════════════════════════════════════════════════════════════

def run_normal_scenario(client, duration=60):
    """Simulate normal operation with periodic heartbeats."""
    anchor = AnchorSimulator(client)
    card = CardSimulator(client)
    card.subscribe_commands()

    print(f"\n{'═' * 50}")
    print(f"  SCENARIO: Normal Operations ({duration}s)")
    print(f"{'═' * 50}\n")

    start = time.time()
    while time.time() - start < duration:
        anchor.publish_heartbeat()
        card.publish_status("heartbeat")
        time.sleep(5)


def run_fault_scenario(client):
    """Simulate a fault → dispatch → accept → complete cycle."""
    anchor = AnchorSimulator(client)
    card = CardSimulator(client)
    card.subscribe_commands()

    print(f"\n{'═' * 50}")
    print(f"  SCENARIO: Fault → Dispatch → Resolution")
    print(f"{'═' * 50}\n")

    # Phase 1: Normal operation
    print("\n── Phase 1: Normal operation ──")
    for _ in range(3):
        anchor.publish_heartbeat()
        time.sleep(2)

    # Phase 2: Fault detected
    print("\n── Phase 2: Fault detected ──")
    anchor.simulate_fault()
    time.sleep(3)

    # Phase 3: Technician accepts task
    print("\n── Phase 3: Task accepted ──")
    card.publish_status("task_accepted", "TASK_DEMO_001")
    time.sleep(2)

    # Phase 4: Arrival confirmed
    print("\n── Phase 4: Arrival confirmed ──")
    card.publish_status("arrival_confirmed", "TASK_DEMO_001")
    time.sleep(2)

    # Phase 5: Task completed
    print("\n── Phase 5: Task completed ──")
    card.publish_status("task_completed", "TASK_DEMO_001")
    time.sleep(2)

    # Phase 6: Recovery
    print("\n── Phase 6: Asset recovered ──")
    anchor.simulate_recovery()

    print(f"\n{'═' * 50}")
    print("  SCENARIO COMPLETE ✅")
    print(f"{'═' * 50}\n")


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="MQTT Device Simulator")
    parser.add_argument("--broker", default="localhost", help="MQTT broker host")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    parser.add_argument("--scenario", choices=["normal", "fault"], default="fault",
                        help="Simulation scenario to run")
    parser.add_argument("--duration", type=int, default=60,
                        help="Duration for normal scenario (seconds)")
    args = parser.parse_args()

    client = mqtt.Client(client_id="simulator-001")
    client.on_connect = lambda c, u, f, rc: print(f"[MQTT] Connected (rc={rc})")

    print(f"[MQTT] Connecting to {args.broker}:{args.port}...")
    client.connect(args.broker, args.port, 60)
    client.loop_start()
    time.sleep(1)

    if args.scenario == "normal":
        run_normal_scenario(client, args.duration)
    elif args.scenario == "fault":
        run_fault_scenario(client)

    client.loop_stop()
    client.disconnect()


if __name__ == "__main__":
    main()
