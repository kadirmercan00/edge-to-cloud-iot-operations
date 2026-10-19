// ═══════════════════════════════════════════════════════════════════════════
// edge-to-cloud-iot-operations — BLE ToF Gateway Firmware
// BLE Sensor Aggregator & AWS IoT Core MQTT Bridge (ESP32)
// ═══════════════════════════════════════════════════════════════════════════

#include <Arduino.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <time.h>

// Configuration & Placeholders
const char* WIFI_SSID     = "YOUR_FIELD_WIFI_SSID";
const char* WIFI_PASS     = "YOUR_FIELD_WIFI_PASSWORD";
const char* AWS_ENDPOINT  = "YOUR_AWS_IOT_ENDPOINT.iot.eu-central-1.amazonaws.com";
const int   AWS_PORT      = 8883;
const char* DEVICE_ID     = "gateway-unit-01";

// MQTT Topics
#define TOPIC_TELEMETRY   "iot/field/gateway-01/telemetry"
#define TOPIC_STATUS      "iot/field/gateway-01/status"
#define TOPIC_COMMAND     "iot/field/gateway-01/command"

// Dummy Certificates for compile/demo
static const char AWS_CERT_CA[] PROGMEM = 
"-----BEGIN CERTIFICATE-----\n"
"MIIE0zCCA7ugAwIBAgIQGNrRniLQdHgvLiJFUtQHITANBgkqhkiG9w0BAQsFADBh\n"
"MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3\n"
"d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBD\n"
"QTAeFw0xMjAzMDgxMjAwMDBaFw0zMTAzMDgxMjAwMDBaMGExCzAJBgNVBAYTAlVT\n"
"MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j\n"
"b20xIDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IENBMIIBIjANBgkqhkiG\n"
"9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4jvhEXUGq+79Y3er22vJStxZDUauFVPuxAgq\n"
"-----END CERTIFICATE-----\n";

static const char AWS_CERT_CRT[] PROGMEM = 
"-----BEGIN CERTIFICATE-----\n"
"MIIDWTCCAkGgAwIBAgIUZK2r5z3YnF3x...[PLACEHOLDER]...\n"
"-----END CERTIFICATE-----\n";

static const char AWS_CERT_PRIVATE[] PROGMEM = 
"-----BEGIN RSA PRIVATE KEY-----\n"
"MIIEowIBAAKCAQEA0Y...[PLACEHOLDER]...\n"
"-----END RSA PRIVATE KEY-----\n";

WiFiClientSecure netClient;
PubSubClient mqttClient(netClient);
Preferences prefs;

// Sensor calibration structure
struct SensorProfile {
    char id[16];
    char label[32];
    uint16_t distFull;
    uint16_t distEmpty;
    uint8_t  refillThreshold;
    uint8_t  emptyConfirmNeeded;
    uint8_t  emptyCounter;
    uint8_t  lastLevel;
};

#define MAX_SENSORS 4
SensorProfile sensors[MAX_SENSORS] = {
    {"sensor_01", "Material Bin A", 40, 150, 60, 3, 0, 100},
    {"sensor_02", "Fluid Reservoir B", 50, 200, 50, 3, 0, 100},
    {"sensor_03", "Dispenser Unit C", 30, 120, 65, 3, 0, 100},
    {"sensor_04", "Aux Supply D",     45, 180, 55, 3, 0, 100}
};

bool continuousMode = false;
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 60000;

// Function declarations
void connectWiFi();
void connectMQTT();
void processCommand(char* topic, byte* payload, unsigned int length);
void publishTelemetry(const char* sensorId, int distanceMm, int batteryPct);
void checkOTA(const char* url);

class BLEAdvertisedDeviceCallbacksImpl : public NimBLEAdvertisedDeviceCallbacks {
    void onResult(NimBLEAdvertisedDevice* advertisedDevice) {
        if (!advertisedDevice->haveManufacturerData()) return;
        
        std::string mfgData = advertisedDevice->getManufacturerData();
        if (mfgData.length() < 6) return;

        // Custom BLE beacon packet parsing
        uint16_t companyId = (uint8_t)mfgData[0] | ((uint8_t)mfgData[1] << 8);
        if (companyId != 0xFFFF) return; // Proprietary telemetry beacon

        uint8_t sensorIndex = (uint8_t)mfgData[2];
        if (sensorIndex >= MAX_SENSORS) return;

        int rawDistance = (uint8_t)mfgData[3] | ((uint8_t)mfgData[4] << 8);
        int battery = (uint8_t)mfgData[5];

        publishTelemetry(sensors[sensorIndex].id, rawDistance, battery);
    }
};

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println(F("[GW] Booting Industrial BLE Gateway..."));

    prefs.begin("gateway", false);
    continuousMode = prefs.getBool("cont_mode", false);

    connectWiFi();

    netClient.setCACert(AWS_CERT_CA);
    netClient.setCertificate(AWS_CERT_CRT);
    netClient.setPrivateKey(AWS_CERT_PRIVATE);

    mqttClient.setServer(AWS_ENDPOINT, AWS_PORT);
    mqttClient.setCallback(processCommand);
    mqttClient.setBufferSize(1024);

    connectMQTT();

    // NimBLE setup for continuous low-power scanning
    NimBLEDevice::init("Industrial-Gateway");
    NimBLEScan* pScan = NimBLEDevice::getScan();
    pScan->setAdvertisedDeviceCallbacks(new BLEAdvertisedDeviceCallbacksImpl());
    pScan->setActiveScan(true);
    pScan->setInterval(100);
    pScan->setWindow(99);
    pScan->start(0, nullptr, false);

    Serial.println(F("[GW] BLE Scanner & MQTT Bridge initialized."));
}

void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        connectWiFi();
    }

    if (!mqttClient.connected()) {
        connectMQTT();
    }
    mqttClient.loop();

    if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
        lastHeartbeat = millis();
        StaticJsonDocument<256> doc;
        doc["device_id"] = DEVICE_ID;
        doc["status"] = "HEALTHY";
        doc["uptime_s"] = millis() / 1000;
        doc["wifi_rssi"] = WiFi.RSSI();
        doc["free_heap"] = ESP.getFreeHeap();

        char buf[256];
        serializeJson(doc, buf);
        mqttClient.publish(TOPIC_STATUS, buf);
    }

    delay(10);
}

void connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) return;
    Serial.print(F("[WiFi] Connecting to "));
    Serial.println(WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    uint8_t retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < 20) {
        delay(500);
        Serial.print(F("."));
        retries++;
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print(F("[WiFi] Connected, IP: "));
        Serial.println(WiFi.localIP());
    }
}

void connectMQTT() {
    uint8_t retries = 0;
    while (!mqttClient.connected() && retries < 5) {
        Serial.print(F("[MQTT] Connecting to AWS IoT Core... "));
        if (mqttClient.connect(DEVICE_ID)) {
            Serial.println(F("Connected!"));
            mqttClient.subscribe(TOPIC_COMMAND);
        } else {
            Serial.printf("Failed, rc=%d. Retrying in 2s...\n", mqttClient.state());
            delay(2000);
            retries++;
        }
    }
}

void publishTelemetry(const char* sensorId, int distanceMm, int batteryPct) {
    if (!mqttClient.connected()) return;

    StaticJsonDocument<384> doc;
    doc["device_id"] = DEVICE_ID;
    doc["sensor_id"] = sensorId;
    doc["distance_mm"] = distanceMm;
    doc["battery_pct"] = batteryPct;
    doc["timestamp"] = time(nullptr);

    char payload[384];
    serializeJson(doc, payload);
    mqttClient.publish(TOPIC_TELEMETRY, payload);
    Serial.printf("[TELEMETRY] %s -> %d mm (Bat: %d%%)\n", sensorId, distanceMm, batteryPct);
}

void processCommand(char* topic, byte* payload, unsigned int length) {
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) return;

    const char* cmd = doc["cmd"] | "";
    if (strcmp(cmd, "set_publish_mode") == 0) {
        const char* mode = doc["mode"] | "normal";
        continuousMode = (strcmp(mode, "continuous") == 0);
        prefs.putBool("cont_mode", continuousMode);
        Serial.printf("[CMD] Continuous mode updated: %d\n", continuousMode);
    } else if (strcmp(cmd, "ota_update") == 0) {
        const char* url = doc["url"] | "";
        if (strlen(url) > 0) {
            checkOTA(url);
        }
    }
}

void checkOTA(const char* url) {
    Serial.printf("[OTA] Initiating firmware update from: %s\n", url);
    WiFiClientSecure otaClient;
    otaClient.setInsecure(); // Or inject CA for production
    t_httpUpdate_return ret = httpUpdate.update(otaClient, url);

    switch (ret) {
        case HTTP_UPDATE_FAILED:
            Serial.printf("[OTA] Update failed! Error (%d): %s\n", 
                httpUpdate.getLastError(), httpUpdate.getLastErrorString().c_str());
            break;
        case HTTP_UPDATE_NO_UPDATES:
            Serial.println(F("[OTA] No updates available."));
            break;
        case HTTP_UPDATE_OK:
            Serial.println(F("[OTA] Update successful. Rebooting..."));
            ESP.restart();
            break;
    }
}
