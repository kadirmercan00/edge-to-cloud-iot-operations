// ═══════════════════════════════════════════════════════════════════════════
// config.h — Anchor Unit Configuration (Sanitized for Portfolio Showcase)
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

// ─── Device Identity ───────────────────────────────────────────────────────
#define FW_VERSION          "3.5.6"
#define DEVICE_TYPE         "ANCHOR"
#define DEVICE_ID           "ANCHOR_001"

// ─── WiFi Configuration ────────────────────────────────────────────────────
// Replace with your WiFi credentials before flashing.
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ─── AWS IoT Core ──────────────────────────────────────────────────────────
// Replace with your AWS IoT endpoint.
// Format: <prefix>.iot.<region>.amazonaws.com
const char* AWS_IOT_ENDPOINT = "YOUR_AWS_IOT_ENDPOINT";
static const uint16_t AWS_MQTT_PORT         = 8883;
static const uint16_t AWS_HANDSHAKE_TIMEOUT = 35;
static const uint16_t AWS_KEEPALIVE_SEC     = 60;

// ─── MQTT Topic Structure ──────────────────────────────────────────────────
// Namespace:  <vendor>/<env>/<site>/<module>/<device_id>/<channel>
// Example:    iot/prod/site01/fleet/anchor_001/event
#define MQTT_NS           "iot"
#define MQTT_ENV          "prod"
#define MQTT_SITE         "site01"
#define MQTT_MODULE       "fleet"

// ─── BLE Beacon Configuration ──────────────────────────────────────────────
#define BEACON_UUID       "00000000-0000-0000-0000-000000010101"

// ─── Hardware Pin Mapping ──────────────────────────────────────────────────
// Relay contact input (fail-safe wiring: NO contact to GND via internal pullup)
// - LOW  = relay energized = normal operation
// - HIGH = relay de-energized = fault condition
#define RELAY_PIN         32
#define DEBOUNCE_DELAY_MS 50

// ─── Timing Constants ──────────────────────────────────────────────────────
#define WIFI_TIMEOUT_MS       15000
#define NTP_TIMEOUT_MS        10000
#define WIFI_RETRY_MS         30000
#define HEARTBEAT_INTERVAL_MS 60000

// ─── Schema Identifiers ───────────────────────────────────────────────────
static const char* SCHEMA_STATUS = "fleet.asset.status.v1";
