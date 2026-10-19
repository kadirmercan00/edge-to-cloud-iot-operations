"""
Read-only export helper for recurring IoT Fleet Telemetry & CloudWatch analysis.
Collects DynamoDB records and recent Lambda logs into timestamped JSONL/CSV files.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import decimal
import json
import os
import pathlib
import re
import sys
from typing import Any

try:
    import boto3
except ImportError:
    boto3 = None

DEFAULT_PREFIXES = (
    "ASSET#",
    "TECH#",
    "TASK#",
    "SENSOR#",
    "READING#",
    "COMMAND#",
)

SENSITIVE_KEY_RE = re.compile(
    r"(api[_-]?key|password|passwd|secret|token|private[_-]?key|certificate|cert[_-]?pem|signed[_-]?url)",
    re.IGNORECASE,
)

def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)

def json_default(value: Any) -> Any:
    if isinstance(value, decimal.Decimal):
        as_int = int(value)
        return as_int if value == as_int else float(value)
    if isinstance(value, (dt.datetime, dt.date)):
        return value.isoformat()
    return str(value)

def redact(value: Any) -> Any:
    if isinstance(value, dict):
        redacted = {}
        for key, item in value.items():
            if SENSITIVE_KEY_RE.search(str(key)):
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = redact(item)
        return redacted
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value

def export_dynamo_records(table_name: str, out_dir: pathlib.Path, region: str = "eu-central-1"):
    if boto3 is None:
        print("[!] boto3 is not installed. Install boto3 to enable AWS extraction.")
        return

    session = boto3.Session(region_name=region)
    dynamodb = session.resource("dynamodb")
    table = dynamodb.Table(table_name)

    out_file = out_dir / f"telemetry_{utc_now().strftime('%Y%m%d_%H%M%S')}.jsonl"
    print(f"[*] Scanning DynamoDB table {table_name}...")

    response = table.scan()
    items = response.get("Items", [])
    
    with open(out_file, "w", encoding="utf-8") as f:
        for item in items:
            cleaned = redact(item)
            f.write(json.dumps(cleaned, default=json_default) + "\n")

    print(f"[+] Successfully exported {len(items)} records to {out_file}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Export IoT analytics data from AWS DynamoDB")
    parser.add_argument("--table", default="iot-asset-telemetry", help="Target DynamoDB table")
    parser.add_argument("--out-dir", default="./analysis_exports", help="Output directory")
    parser.add_argument("--region", default="eu-central-1", help="AWS Region")
    args = parser.parse_args()

    out_path = pathlib.Path(args.out_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    export_dynamo_records(args.table, out_path, args.region)
