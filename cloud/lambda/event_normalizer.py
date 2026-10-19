"""
═══════════════════════════════════════════════════════════════════════════
Event Normalizer — Serverless IoT Event Processing Engine
Edge-to-Cloud IoT Operations Platform

AWS Lambda function that:
  1. Ingests raw IoT telemetry from AWS IoT Core MQTT topics
  2. Normalizes events into a canonical schema
  3. Persists state to DynamoDB
  4. Calculates nearest available technician (distance matrix)
  5. Dispatches task assignments back to field Smart Cards via MQTT
═══════════════════════════════════════════════════════════════════════════
"""

import json
import os
import time
import math
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ─── AWS Resource Initialization ────────────────────────────────────────────
dynamodb = boto3.resource("dynamodb")
iot_client = boto3.client("iot-data")

# Table references (from environment variables)
EVENTS_TABLE = os.environ.get("EVENTS_TABLE", "iot-events")
ASSETS_TABLE = os.environ.get("ASSETS_TABLE", "iot-assets")
PERSONNEL_TABLE = os.environ.get("PERSONNEL_TABLE", "iot-personnel")
TASKS_TABLE = os.environ.get("TASKS_TABLE", "iot-tasks")

events_table = dynamodb.Table(EVENTS_TABLE)
assets_table = dynamodb.Table(ASSETS_TABLE)
personnel_table = dynamodb.Table(PERSONNEL_TABLE)
tasks_table = dynamodb.Table(TASKS_TABLE)

# ─── Schema Definitions ────────────────────────────────────────────────────

SUPPORTED_SCHEMAS = {
    "fleet.asset.status.v1",
    "fleet.card.status.v1",
    "fleet.gateway.occupancy.v1",
}


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1: EVENT NORMALIZATION
# ═══════════════════════════════════════════════════════════════════════════

def normalize_event(raw_event: dict) -> Optional[dict]:
    """Transform raw IoT telemetry into canonical event format."""
    schema = raw_event.get("schema")
    if schema not in SUPPORTED_SCHEMAS:
        logger.warning(f"Unknown schema: {schema}")
        return None

    normalized = {
        "event_id": f"{raw_event.get('device_id', 'unknown')}_{int(time.time() * 1000)}",
        "device_id": raw_event.get("device_id", "unknown"),
        "device_type": raw_event.get("type", "unknown"),
        "schema": schema,
        "status": raw_event.get("status", "unknown"),
        "timestamp": raw_event.get("timestamp", datetime.now(timezone.utc).isoformat()),
        "firmware_version": raw_event.get("fw", "unknown"),
        "rssi": raw_event.get("rssi", 0),
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "ttl": int(time.time()) + 86400 * 30,  # 30-day TTL for DynamoDB
    }

    # Schema-specific enrichment
    if schema == "fleet.asset.status.v1":
        normalized["previous_status"] = raw_event.get("previous_status")
        normalized["event_category"] = "asset_telemetry"
    elif schema == "fleet.card.status.v1":
        normalized["card_id"] = raw_event.get("card_id")
        normalized["task_id"] = raw_event.get("task_id")
        normalized["event_category"] = "personnel_telemetry"
    elif schema == "fleet.gateway.occupancy.v1":
        normalized["zone_id"] = raw_event.get("zone_id")
        normalized["occupancy"] = raw_event.get("occupancy", 0)
        normalized["event_category"] = "occupancy_telemetry"

    return normalized


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2: ASSET STATE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

def update_asset_status(device_id: str, status: str, metadata: dict = None):
    """Update the current operational status of a field asset in DynamoDB."""
    update_expr = "SET #s = :status, updated_at = :ts"
    expr_values = {
        ":status": status,
        ":ts": datetime.now(timezone.utc).isoformat(),
    }
    expr_names = {"#s": "status"}

    if metadata:
        update_expr += ", metadata = :meta"
        expr_values[":meta"] = metadata

    assets_table.update_item(
        Key={"device_id": device_id},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )
    logger.info(f"Asset {device_id} status updated to: {status}")


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3: NEAREST TECHNICIAN CALCULATION (DISTANCE MATRIX)
# ═══════════════════════════════════════════════════════════════════════════

def calculate_distance(loc_a: dict, loc_b: dict) -> float:
    """Euclidean distance between two {x, y, floor} locations."""
    dx = loc_a.get("x", 0) - loc_b.get("x", 0)
    dy = loc_a.get("y", 0) - loc_b.get("y", 0)
    df = (loc_a.get("floor", 0) - loc_b.get("floor", 0)) * 50  # Floor penalty
    return math.sqrt(dx * dx + dy * dy + df * df)


def find_nearest_available_technician(asset_location: dict) -> Optional[dict]:
    """Query available personnel and return the nearest one."""
    response = personnel_table.scan(
        FilterExpression=Attr("availability").eq("available")
    )
    available = response.get("Items", [])

    if not available:
        logger.warning("No available technicians found")
        return None

    # Sort by distance to asset
    for tech in available:
        tech_loc = tech.get("location", {"x": 0, "y": 0, "floor": 0})
        tech["_distance"] = calculate_distance(asset_location, tech_loc)

    available.sort(key=lambda t: t["_distance"])
    nearest = available[0]

    logger.info(
        f"Nearest technician: {nearest['card_id']} "
        f"(distance: {nearest['_distance']:.1f})"
    )
    return nearest


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 4: TASK DISPATCH (MQTT → Smart Card)
# ═══════════════════════════════════════════════════════════════════════════

def dispatch_task(technician: dict, asset: dict, event: dict):
    """Create a task record and publish assignment to the technician's Smart Card."""
    task_id = f"TASK_{int(time.time() * 1000)}"
    card_id = technician["card_id"]

    # Persist task to DynamoDB
    task_record = {
        "task_id": task_id,
        "card_id": card_id,
        "asset_id": event.get("device_id"),
        "status": "dispatched",
        "priority": "high" if event.get("status") == "fault" else "medium",
        "location": asset.get("location_name", "Unknown"),
        "description": f"Asset {event.get('device_id')} reported: {event.get('status')}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "beacon_uuid": asset.get("beacon_uuid", ""),
    }
    tasks_table.put_item(Item=task_record)

    # Update technician availability
    personnel_table.update_item(
        Key={"card_id": card_id},
        UpdateExpression="SET availability = :a, current_task = :t",
        ExpressionAttributeValues={":a": "busy", ":t": task_id},
    )

    # Publish task to Smart Card via MQTT
    topic = f"iot/prod/site01/fleet/{card_id}/command"
    payload = json.dumps({
        "action": "new_task",
        "task_id": task_id,
        "asset_id": event.get("device_id"),
        "location": task_record["location"],
        "description": task_record["description"],
        "priority": task_record["priority"],
        "beacon_uuid": task_record["beacon_uuid"],
    })

    iot_client.publish(topic=topic, qos=1, payload=payload)
    logger.info(f"Task {task_id} dispatched to {card_id} via MQTT")
    return task_record


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 5: PERSONNEL STATUS HANDLER
# ═══════════════════════════════════════════════════════════════════════════

def handle_personnel_event(event: dict):
    """Process status updates from Smart Cards."""
    card_id = event.get("card_id")
    status = event.get("status")
    task_id = event.get("task_id")

    if status == "task_accepted":
        tasks_table.update_item(
            Key={"task_id": task_id},
            UpdateExpression="SET #s = :s, accepted_at = :ts",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s": "accepted",
                ":ts": datetime.now(timezone.utc).isoformat(),
            },
        )
    elif status == "arrival_confirmed":
        tasks_table.update_item(
            Key={"task_id": task_id},
            UpdateExpression="SET #s = :s, arrived_at = :ts",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s": "on_site",
                ":ts": datetime.now(timezone.utc).isoformat(),
            },
        )
    elif status == "task_completed":
        tasks_table.update_item(
            Key={"task_id": task_id},
            UpdateExpression="SET #s = :s, completed_at = :ts",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":s": "completed",
                ":ts": datetime.now(timezone.utc).isoformat(),
            },
        )
        # Free up technician
        personnel_table.update_item(
            Key={"card_id": card_id},
            UpdateExpression="SET availability = :a REMOVE current_task",
            ExpressionAttributeValues={":a": "available"},
        )
    elif status == "task_rejected":
        # Re-dispatch to next nearest technician
        logger.info(f"Task {task_id} rejected by {card_id}, seeking next technician")
        personnel_table.update_item(
            Key={"card_id": card_id},
            UpdateExpression="SET availability = :a REMOVE current_task",
            ExpressionAttributeValues={":a": "available"},
        )


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 6: LAMBDA HANDLER (ENTRY POINT)
# ═══════════════════════════════════════════════════════════════════════════

def lambda_handler(event: dict, context: Any) -> dict:
    """
    AWS Lambda entry point. Triggered by AWS IoT Core Rules.

    Event sources:
      - Anchor units:  iot/+/+/fleet/ANCHOR_+/event
      - Smart Cards:   iot/+/+/fleet/CARD_+/status
      - BLE Gateways:  iot/+/+/fleet/GW_+/occupancy
    """
    logger.info(f"Received event: {json.dumps(event)[:500]}")

    # Normalize the incoming event
    normalized = normalize_event(event)
    if not normalized:
        return {"statusCode": 400, "body": "Unknown schema"}

    # Persist to events table
    events_table.put_item(Item=normalized)

    # Route based on event category
    category = normalized.get("event_category")

    if category == "asset_telemetry":
        device_id = normalized["device_id"]
        status = normalized["status"]

        # Update asset status
        update_asset_status(device_id, status)

        # If fault detected → dispatch technician
        if status == "fault":
            asset = assets_table.get_item(Key={"device_id": device_id}).get("Item", {})
            asset_location = asset.get("location", {"x": 0, "y": 0, "floor": 0})

            technician = find_nearest_available_technician(asset_location)
            if technician:
                dispatch_task(technician, asset, normalized)

    elif category == "personnel_telemetry":
        handle_personnel_event(normalized)

    elif category == "occupancy_telemetry":
        logger.info(f"Occupancy update: zone={normalized.get('zone_id')} count={normalized.get('occupancy')}")

    return {"statusCode": 200, "body": f"Processed: {normalized['event_id']}"}
