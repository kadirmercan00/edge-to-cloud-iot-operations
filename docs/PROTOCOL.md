# 📡 IoT Protocol Specification & Message Schemas

Standardized MQTT topics, QoS levels, and JSON payload definitions for edge devices and cloud ingestion.

---

## 1. Topic Hierarchy

```
iot/
├── field/
│   ├── {device_id}/
│   │   ├── telemetry    (QoS 1) - Sensor metrics & diagnostic state
│   │   ├── status       (QoS 1) - Heartbeats, WiFi RSSI, battery, uptime
│   │   └── command      (QoS 1) - Downlink commands (OTA, config update)
└── alerts/
    └── {severity}       (QoS 1) - Instant threshold violations (CRITICAL, WARN)
```

---

## 2. Payload Schemas

### Telemetry Message (`iot/field/{device_id}/telemetry`)

```json
{
  "device_id": "anchor-node-01",
  "timestamp": 1727467200,
  "metrics": {
    "temperature_c": 24.8,
    "humidity_pct": 52.1,
    "vibration_rms": 0.042,
    "current_draw_ma": 185
  },
  "status": "OPERATIONAL"
}
```

### Heartbeat Status (`iot/field/{device_id}/status`)

```json
{
  "device_id": "card-node-04",
  "uptime_s": 86400,
  "wifi_rssi": -68,
  "battery_pct": 89,
  "free_heap": 184200,
  "firmware_version": "v2.4.1"
}
```

### Downlink Command (`iot/field/{device_id}/command`)

```json
{
  "action": "ota_update",
  "target": "anchor-node-01",
  "url": "https://firmware-repo.example.com/builds/v2.5.0.bin",
  "md5": "e9b5f5a9b8f2c8d1e3a4b5c6d7e8f9a0"
}
```
