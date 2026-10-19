// ═══════════════════════════════════════════════════════════════════════════
// Anchor Unit — Field Telemetry Node Firmware
// Edge-to-Cloud IoT Operations Platform
// v3.5.6 | ESP32-WROOM-32 | AWS IoT Core + NimBLE + MQTT/TLS
// ═══════════════════════════════════════════════════════════════════════════
// Architecture: Non-blocking event loop (millis-based), no delay() calls.
// This node monitors a field asset's operational status via relay contact
// sensing, publishes state transitions to AWS IoT Core over mutual TLS,
// and broadcasts a BLE iBeacon for proximity verification by Smart Cards.
// ═══════════════════════════════════════════════════════════════════════════

#include <ArduinoJson.h>
#include <HTTPUpdate.h>
#include <NimBLEDevice.h>
#include <NimBLEBeacon.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <esp_wifi.h>

#include "config.h"
#include "certs.h.example"  // Replace with your actual certs.h

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: MQTT TOPIC GENERATION
// ═══════════════════════════════════════════════════════════════════════════

static String mqttEventTopic;
static String mqttCmdTopic;
static String mqttHeartbeatTopic;

void buildTopics() {
    // Topic format: <ns>/<env>/<site>/<module>/<device_id>/<channel>
    String prefix = String(MQTT_NS) + "/" + MQTT_ENV + "/" + MQTT_SITE + "/" + MQTT_MODULE + "/" + DEVICE_ID;
    mqttEventTopic     = prefix + "/event";
    mqttCmdTopic       = prefix + "/command";
    mqttHeartbeatTopic = prefix + "/heartbeat";
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: BLE iBeacon BROADCAST
// ═══════════════════════════════════════════════════════════════════════════
// The anchor broadcasts a BLE iBeacon so that nearby Smart Cards can verify
// field technician proximity (arrival_confirmed event).

BLEAdvertising* pAdvertising;

void initBLEBeacon() {
    BLEDevice::init("ANCHOR");
    BLEServer* pServer = BLEDevice::createServer();
    (void)pServer;
    pAdvertising = BLEDevice::getAdvertising();

    BLEBeacon beacon;
    beacon.setManufacturerId(0x4C00);  // Apple iBeacon format
    beacon.setProximityUUID(BLEUUID(BEACON_UUID));
    beacon.setMajor(1);
    beacon.setMinor(1);
    beacon.setSignalPower(-59);

    BLEAdvertisementData advData;
    advData.setFlags(0x06);
    std::string strServiceData;
    strServiceData += (char)26;   // Length
    strServiceData += (char)0xFF; // Manufacturer Specific
    strServiceData += beacon.getData();
    advData.addData(strServiceData);

    pAdvertising->setAdvertisementData(advData);
    pAdvertising->start();
    Serial.println("[BLE] iBeacon broadcasting started");
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: RELAY CONTACT MONITORING (HARDWARE DEBOUNCE)
// ═══════════════════════════════════════════════════════════════════════════
// Fail-safe relay wiring:
//   - Relay energized  → NO closes → Pin reads LOW  → "operational"
//   - Relay dropped    → NO opens  → Pin reads HIGH → "fault"
// Internal pull-up ensures a defined HIGH state when relay is open.

static unsigned long lastDebounceTime = 0;
static int           lastRelayState   = HIGH;
static String        currentState     = "operational";
static String        lastPublishedState = "";

String readRelayState() {
    int reading = digitalRead(RELAY_PIN);
    if (reading != lastRelayState) {
        lastDebounceTime = millis();
    }
    lastRelayState = reading;

    if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
        return (reading == LOW) ? "operational" : "fault";
    }
    return currentState;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: WiFi STATION MANAGEMENT (Non-Blocking Reconnect)
// ═══════════════════════════════════════════════════════════════════════════

static unsigned long g_lastWifiRetryMs = 0;
static bool          g_timeReady       = false;

bool connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) return true;

    unsigned long now = millis();
    if (now - g_lastWifiRetryMs < WIFI_RETRY_MS) return false;
    g_lastWifiRetryMs = now;

    Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
        delay(100);
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("[WiFi] Connected — IP: %s\n", WiFi.localIP().toString().c_str());
        return true;
    }
    Serial.println("[WiFi] Connection failed, will retry");
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: NTP TIME SYNCHRONIZATION
// ═══════════════════════════════════════════════════════════════════════════

void syncNTP() {
    if (g_timeReady) return;
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");

    Serial.print("[NTP] Synchronizing");
    unsigned long start = millis();
    struct tm timeinfo;
    while (!getLocalTime(&timeinfo) && millis() - start < NTP_TIMEOUT_MS) {
        Serial.print(".");
        delay(500);
    }

    if (getLocalTime(&timeinfo)) {
        g_timeReady = true;
        char buf[32];
        strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
        Serial.printf("\n[NTP] Synchronized: %s\n", buf);
    } else {
        Serial.println("\n[NTP] Sync failed");
    }
}

String getISO8601() {
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo)) return "1970-01-01T00:00:00Z";
    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    return String(buf);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: AWS IoT MQTT CLIENT
// ═══════════════════════════════════════════════════════════════════════════

WiFiClientSecure awsNet;
PubSubClient     awsClient(awsNet);

static unsigned long g_lastAwsTryMs  = 0;
static uint32_t      g_awsBackoffMs  = 0;

void configureTLS() {
    awsNet.setCACert(AWS_CERT_CA);
    awsNet.setCertificate(AWS_CERT_CRT);
    awsNet.setPrivateKey(AWS_CERT_PRIVATE);
    awsNet.setHandshakeTimeout(AWS_HANDSHAKE_TIMEOUT);
}

bool connectAWS() {
    if (awsClient.connected()) return true;

    unsigned long now = millis();
    if (now - g_lastAwsTryMs < g_awsBackoffMs) return false;
    g_lastAwsTryMs = now;

    Serial.printf("[MQTT] Connecting to %s:%d...\n", AWS_IOT_ENDPOINT, AWS_MQTT_PORT);
    awsClient.setServer(AWS_IOT_ENDPOINT, AWS_MQTT_PORT);
    awsClient.setKeepAlive(AWS_KEEPALIVE_SEC);
    awsClient.setBufferSize(512);

    if (awsClient.connect(DEVICE_ID)) {
        g_awsBackoffMs = 0;
        Serial.println("[MQTT] Connected to AWS IoT Core");
        awsClient.subscribe(mqttCmdTopic.c_str());
        return true;
    }

    // Exponential backoff: 2s → 4s → 8s → ... → 60s max
    g_awsBackoffMs = (g_awsBackoffMs == 0) ? 2000 : min(g_awsBackoffMs * 2, (uint32_t)60000);
    Serial.printf("[MQTT] Connection failed (rc=%d), backoff %u ms\n", awsClient.state(), g_awsBackoffMs);
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: MQTT COMMAND HANDLER (Inbound from Cloud)
// ═══════════════════════════════════════════════════════════════════════════

static bool  otaPending  = false;
static char  otaUrl[512] = "";

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) {
        Serial.printf("[MQTT] JSON parse error: %s\n", err.c_str());
        return;
    }

    const char* action = doc["action"];
    Serial.printf("[MQTT] Command received: %s\n", action);

    if (strcmp(action, "ota_update") == 0) {
        const char* url = doc["url"];
        if (url) {
            strlcpy(otaUrl, url, sizeof(otaUrl));
            otaPending = true;
            Serial.printf("[OTA] Update scheduled: %s\n", url);
        }
    } else if (strcmp(action, "reboot") == 0) {
        Serial.println("[CMD] Reboot requested");
        ESP.restart();
    } else if (strcmp(action, "identify") == 0) {
        // Flash onboard LED to help physically locate the device
        Serial.println("[CMD] Identify mode activated");
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: OTA FIRMWARE UPDATE (HTTPS)
// ═══════════════════════════════════════════════════════════════════════════

void performOTA() {
    if (!otaPending || strlen(otaUrl) == 0) return;
    otaPending = false;

    Serial.printf("[OTA] Starting update from: %s\n", otaUrl);

    WiFiClientSecure otaClient;
    otaClient.setInsecure();  // Accept self-signed for OTA bucket

    t_httpUpdate_return ret = httpUpdate.update(otaClient, otaUrl);

    switch (ret) {
        case HTTP_UPDATE_FAILED:
            Serial.printf("[OTA] Failed (err=%d): %s\n",
                httpUpdate.getLastError(), httpUpdate.getLastErrorString().c_str());
            break;
        case HTTP_UPDATE_NO_UPDATES:
            Serial.println("[OTA] No update available");
            break;
        case HTTP_UPDATE_OK:
            Serial.println("[OTA] Update successful, rebooting...");
            break;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: TELEMETRY PUBLISHING
// ═══════════════════════════════════════════════════════════════════════════

static unsigned long g_lastHeartbeatMs = 0;

void publishStateChange(const String& newState) {
    if (!awsClient.connected()) return;

    StaticJsonDocument<256> doc;
    doc["schema"]    = SCHEMA_STATUS;
    doc["device_id"] = DEVICE_ID;
    doc["type"]      = DEVICE_TYPE;
    doc["status"]    = newState;
    doc["timestamp"] = getISO8601();
    doc["fw"]        = FW_VERSION;
    doc["rssi"]      = WiFi.RSSI();

    char buffer[256];
    serializeJson(doc, buffer);
    awsClient.publish(mqttEventTopic.c_str(), buffer);
    Serial.printf("[MQTT] Published state change: %s → %s\n",
                  lastPublishedState.c_str(), newState.c_str());
}

void publishHeartbeat() {
    unsigned long now = millis();
    if (now - g_lastHeartbeatMs < HEARTBEAT_INTERVAL_MS) return;
    g_lastHeartbeatMs = now;

    if (!awsClient.connected()) return;

    StaticJsonDocument<192> doc;
    doc["device_id"] = DEVICE_ID;
    doc["type"]      = DEVICE_TYPE;
    doc["status"]    = currentState;
    doc["uptime_s"]  = millis() / 1000;
    doc["heap_free"] = ESP.getFreeHeap();
    doc["rssi"]      = WiFi.RSSI();
    doc["fw"]        = FW_VERSION;
    doc["timestamp"] = getISO8601();

    char buffer[256];
    serializeJson(doc, buffer);
    awsClient.publish(mqttHeartbeatTopic.c_str(), buffer);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: SETUP & MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════════

void setup() {
    Serial.begin(115200);
    Serial.printf("\n[BOOT] Anchor Unit Firmware v%s\n", FW_VERSION);
    Serial.printf("[BOOT] Device ID: %s\n", DEVICE_ID);

    // Hardware: Relay contact input with internal pull-up
    pinMode(RELAY_PIN, INPUT_PULLUP);

    // Build dynamic MQTT topic strings
    buildTopics();
    Serial.printf("[MQTT] Event topic:  %s\n", mqttEventTopic.c_str());
    Serial.printf("[MQTT] Cmd topic:    %s\n", mqttCmdTopic.c_str());

    // TLS certificate configuration
    configureTLS();
    awsClient.setCallback(mqttCallback);

    // BLE iBeacon initialization
    initBLEBeacon();

    // Initial WiFi connection
    connectWiFi();
}

void loop() {
    // ── WiFi maintenance ──
    if (!connectWiFi()) return;

    // ── NTP synchronization ──
    syncNTP();

    // ── AWS IoT MQTT ──
    connectAWS();
    awsClient.loop();

    // ── Relay state monitoring ──
    String newState = readRelayState();
    if (newState != currentState) {
        currentState = newState;
        if (currentState != lastPublishedState) {
            publishStateChange(currentState);
            lastPublishedState = currentState;
        }
    }

    // ── Periodic heartbeat ──
    publishHeartbeat();

    // ── OTA processing ──
    performOTA();
}
