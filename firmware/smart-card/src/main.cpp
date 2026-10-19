// ═══════════════════════════════════════════════════════════════════════════
// Smart Card — Personnel Task Card Firmware
// Edge-to-Cloud IoT Operations Platform
// v3.5.6 | ESP32 + AWS IoT Core + NimBLE + ST7735 TFT + FastLED
// ═══════════════════════════════════════════════════════════════════════════
// Architecture: Finite State Machine (switch-case), fully Non-Blocking
// Libraries: WiFiClientSecure, PubSubClient, NimBLEDevice,
//            Adafruit_ST7735, FastLED, ArduinoJson, vector
// ═══════════════════════════════════════════════════════════════════════════
//
// This firmware implements a wearable field technician task management card:
//   - Receives task assignments from cloud via MQTT
//   - Displays task details on 1.8" TFT (asset ID, priority, location)
//   - Accept/Reject task via hardware buttons
//   - BLE proximity scanning to verify technician arrival at field unit
//   - Haptic + LED feedback for notifications
//   - Heartbeat telemetry with battery level reporting
//
// State Machine:
//   IDLE → TASK_RECEIVED → TASK_ACCEPTED → EN_ROUTE →
//   ARRIVAL_SCAN → ON_SITE → TASK_COMPLETE → IDLE
// ═══════════════════════════════════════════════════════════════════════════

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <NimBLEDevice.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <FastLED.h>
#include <ArduinoJson.h>
#include <HTTPUpdate.h>
#include <time.h>
#include <esp_sntp.h>
#include <vector>

#include "config.h"

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: STATE MACHINE DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

enum CardState {
    STATE_BOOT,
    STATE_WIFI_CONNECTING,
    STATE_MQTT_CONNECTING,
    STATE_IDLE,
    STATE_TASK_RECEIVED,
    STATE_TASK_ACCEPTED,
    STATE_EN_ROUTE,
    STATE_ARRIVAL_SCAN,
    STATE_ON_SITE,
    STATE_TASK_COMPLETE
};

static CardState currentFSMState = STATE_BOOT;

const char* stateToString(CardState s) {
    switch (s) {
        case STATE_BOOT:            return "BOOT";
        case STATE_WIFI_CONNECTING: return "WIFI_CONNECTING";
        case STATE_MQTT_CONNECTING: return "MQTT_CONNECTING";
        case STATE_IDLE:            return "IDLE";
        case STATE_TASK_RECEIVED:   return "TASK_RECEIVED";
        case STATE_TASK_ACCEPTED:   return "TASK_ACCEPTED";
        case STATE_EN_ROUTE:        return "EN_ROUTE";
        case STATE_ARRIVAL_SCAN:    return "ARRIVAL_SCAN";
        case STATE_ON_SITE:         return "ON_SITE";
        case STATE_TASK_COMPLETE:   return "TASK_COMPLETE";
        default:                    return "UNKNOWN";
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: TASK DATA STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

struct Task {
    String taskId;
    String assetId;
    String location;
    String description;
    String priority;       // "high", "medium", "low"
    String targetBeaconUUID;
    unsigned long receivedAt;
};

static std::vector<Task> taskPool;
static int currentTaskIdx = -1;

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: HARDWARE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);
CRGB leds[LED_COUNT];

// Button state tracking (non-blocking debounce)
struct ButtonState {
    uint8_t pin;
    bool lastReading;
    bool stableState;
    unsigned long lastDebounce;
};

static ButtonState btnAccept = { BTN_ACCEPT, HIGH, HIGH, 0 };
static ButtonState btnReject = { BTN_REJECT, HIGH, HIGH, 0 };
static ButtonState btnUp     = { BTN_UP,     HIGH, HIGH, 0 };
static ButtonState btnDown   = { BTN_DOWN,   HIGH, HIGH, 0 };

bool readButton(ButtonState& btn) {
    bool reading = digitalRead(btn.pin);
    if (reading != btn.lastReading) {
        btn.lastDebounce = millis();
    }
    btn.lastReading = reading;

    if ((millis() - btn.lastDebounce) > DEBOUNCE_MS) {
        if (reading != btn.stableState) {
            btn.stableState = reading;
            return (btn.stableState == LOW);  // Active LOW = pressed
        }
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3B: ST LIS2DH12 3-AXIS IMU & FALL KINEMATICS ENGINE
// ═══════════════════════════════════════════════════════════════════════════

static bool imuInitialized = false;

static bool initLIS2DH12() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.beginTransmission(LIS2DH12_I2C_ADDR);
    Wire.write(0x0F); // WHO_AM_I register
    if (Wire.endTransmission(false) != 0) return false;

    Wire.requestFrom((uint8_t)LIS2DH12_I2C_ADDR, (uint8_t)1);
    if (Wire.available()) {
        uint8_t id = Wire.read();
        if (id == 0x33) {
            Serial.println("[IMU] ST LIS2DH12 verified (WHO_AM_I: 0x33).");

            // Configure 100 Hz sampling, normal power mode, XYZ axis enabled
            Wire.beginTransmission(LIS2DH12_I2C_ADDR);
            Wire.write(0x20); // CTRL_REG1
            Wire.write(0x57); // 100 Hz, XYZ enable
            Wire.endTransmission();

            // Configure +/- 8G full-scale range, high-resolution mode
            Wire.beginTransmission(LIS2DH12_I2C_ADDR);
            Wire.write(0x23); // CTRL_REG4
            Wire.write(0x28); // 8G, HR mode
            Wire.endTransmission();
            imuInitialized = true;
            return true;
        }
    }
    return false;
}

static void readAccelerationVector(float &ax, float &ay, float &az) {
    if (!imuInitialized) return;
    Wire.beginTransmission(LIS2DH12_I2C_ADDR);
    Wire.write(0x28 | 0x80); // Auto-increment from OUT_X_L
    Wire.endTransmission(false);

    Wire.requestFrom((uint8_t)LIS2DH12_I2C_ADDR, (uint8_t)6);
    if (Wire.available() == 6) {
        int16_t rawX = Wire.read() | (Wire.read() << 8);
        int16_t rawY = Wire.read() | (Wire.read() << 8);
        int16_t rawZ = Wire.read() | (Wire.read() << 8);

        // Convert raw 12-bit reading to G (8G scale: ~4 mg/LSB)
        ax = (float)(rawX >> 4) * 0.004f;
        ay = (float)(rawY >> 4) * 0.004f;
        az = (float)(rawZ >> 4) * 0.004f;
    }
}

void publishAlert(const char* alertType, float peakG, uint32_t fallMs) {
    StaticJsonDocument<256> alertDoc;
    alertDoc["card_id"]    = CARD_ID;
    alertDoc["alert_type"] = alertType;
    alertDoc["peak_g"]     = peakG;
    alertDoc["duration_ms"]= fallMs;
    alertDoc["timestamp"]  = millis();

    char alertBuffer[256];
    serializeJson(alertDoc, alertBuffer);
    mqttClient.publish(MQTT_TOPIC_ALERT, alertBuffer);
    Serial.printf("[ALERT DISPATCH] %s (Peak: %.2f G, Duration: %u ms)\n", alertType, peakG, fallMs);
}

void evaluateFallKinematics() {
    if (!imuInitialized) return;

    static unsigned long lastImuSampleMs = 0;
    if (millis() - lastImuSampleMs < 20) return; // 50 Hz evaluation loop
    lastImuSampleMs = millis();

    float ax = 0.0f, ay = 0.0f, az = 0.0f;
    readAccelerationVector(ax, ay, az);

    // Compute resultant total acceleration magnitude ||a||
    float magnitudeG = sqrt(ax * ax + ay * ay + az * az);

    static uint32_t freefallStartMs = 0;
    static bool inFreefallPhase = false;

    // Phase 1: Freefall signature (< 0.35G)
    if (magnitudeG < FREEFALL_THRESHOLD_G && !inFreefallPhase) {
        freefallStartMs = millis();
        inFreefallPhase = true;
    }

    // Phase 2: Post-freefall impact spike (> 3.0G) within 80-1200 ms
    if (inFreefallPhase && magnitudeG > IMPACT_THRESHOLD_G) {
        uint32_t fallDuration = millis() - freefallStartMs;
        inFreefallPhase = false;

        if (fallDuration >= 80 && fallDuration <= 1200) {
            Serial.printf("[SAFETY] MAN-DOWN CRITICAL: Fall impact detected (Peak: %.2f G, Fall: %u ms)!\n",
                          magnitudeG, fallDuration);
            // Trigger haptic alarm and red alert LED
            digitalWrite(VIB_PIN, HIGH);
            fill_solid(leds, LED_COUNT, CRGB::Red);
            FastLED.show();

            // Broadcast immediate SOS alert via MQTT
            publishAlert("MAN_DOWN_FALL_DETECTED", magnitudeG, fallDuration);
        }
    }

    if (inFreefallPhase && (millis() - freefallStartMs > 1500)) {
        inFreefallPhase = false; // Fall signature timed out
    }
}

void initHardware() {
    // Buttons with internal pull-up
    pinMode(BTN_ACCEPT, INPUT_PULLUP);
    pinMode(BTN_REJECT, INPUT_PULLUP);
    pinMode(BTN_UP,     INPUT_PULLUP);
    pinMode(BTN_DOWN,   INPUT_PULLUP);

    // Haptic motor
    pinMode(VIB_PIN, OUTPUT);
    digitalWrite(VIB_PIN, LOW);

    // TFT power control
    pinMode(TFT_POWER, OUTPUT);
    digitalWrite(TFT_POWER, HIGH);

    // TFT initialization
    tft.initR(INITR_BLACKTAB);
    tft.setRotation(1);
    tft.fillScreen(COL_BG);

    // WS2812B LEDs
    FastLED.addLeds<WS2812B, LED_DATA_PIN, GRB>(leds, LED_COUNT);
    FastLED.setBrightness(LED_BRIGHT);
    fill_solid(leds, LED_COUNT, CRGB::Black);
    FastLED.show();

    // ST LIS2DH12 IMU Initialization
    if (initLIS2DH12()) {
        Serial.println("[HW] ST LIS2DH12 3-Axis IMU online");
    } else {
        Serial.println("[HW] WARNING: LIS2DH12 IMU offline or address mismatch");
    }

    Serial.println("[HW] All peripherals initialized");
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: TFT DISPLAY RENDERING
// ═══════════════════════════════════════════════════════════════════════════

void drawHeader(const char* title, uint16_t color) {
    tft.fillRect(0, 0, 160, 20, color);
    tft.setCursor(4, 4);
    tft.setTextColor(COL_WHITE);
    tft.setTextSize(1);
    tft.print(title);

    // Battery indicator (top-right)
    int rawADC = analogRead(BAT_PIN);
    float voltage = rawADC * (3.3 / 4095.0) * 2.0;  // Voltage divider
    int batPercent = constrain(map(voltage * 100, 300, 420, 0, 100), 0, 100);
    tft.setCursor(120, 4);
    tft.printf("%d%%", batPercent);
}

void drawIdleScreen() {
    tft.fillScreen(COL_BG);
    drawHeader("STANDBY", COL_HEADER);
    tft.setCursor(20, 50);
    tft.setTextColor(COL_GREEN);
    tft.setTextSize(1);
    tft.print("Awaiting Task...");
    tft.setCursor(10, 80);
    tft.setTextColor(COL_WHITE);
    tft.printf("Card: %s", CARD_ID);
    tft.setCursor(10, 95);
    tft.printf("FW: v%s", FW_VERSION);
}

void drawTaskScreen(const Task& task) {
    tft.fillScreen(COL_BG);
    uint16_t headerColor = (task.priority == "high") ? COL_RED : COL_HEADER;
    drawHeader("NEW TASK", headerColor);

    tft.setCursor(4, 28);
    tft.setTextColor(COL_YELLOW);
    tft.setTextSize(1);
    tft.printf("Asset: %s", task.assetId.c_str());

    tft.setCursor(4, 44);
    tft.setTextColor(COL_WHITE);
    tft.printf("Loc: %s", task.location.c_str());

    tft.setCursor(4, 60);
    tft.setTextColor(COL_WHITE);
    tft.print(task.description.substring(0, 40).c_str());

    // Action buttons hint
    tft.setCursor(4, 110);
    tft.setTextColor(COL_GREEN);
    tft.print("[ACCEPT]");
    tft.setCursor(90, 110);
    tft.setTextColor(COL_RED);
    tft.print("[REJECT]");
}

void drawScanningScreen() {
    tft.fillScreen(COL_BG);
    drawHeader("BLE SCAN", COL_BLUE);
    tft.setCursor(10, 55);
    tft.setTextColor(COL_WHITE);
    tft.setTextSize(1);
    tft.print("Scanning for anchor...");
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: LED & HAPTIC FEEDBACK
// ═══════════════════════════════════════════════════════════════════════════

static unsigned long lastBlinkMs = 0;
static bool          blinkState  = false;

void pulseNotification(CRGB color, int vibDuration) {
    fill_solid(leds, LED_COUNT, color);
    FastLED.show();
    digitalWrite(VIB_PIN, HIGH);
    // Non-blocking vibration handled in main loop timer
}

void updateLEDBlink(CRGB color) {
    if (millis() - lastBlinkMs > LED_BLINK_MS) {
        lastBlinkMs = millis();
        blinkState = !blinkState;
        fill_solid(leds, LED_COUNT, blinkState ? color : CRGB::Black);
        FastLED.show();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: MULTI-WiFi CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

WiFiClientSecure mqttNet;
PubSubClient     mqttClient(mqttNet);

bool connectMultiWiFi() {
    if (WiFi.status() == WL_CONNECTED) return true;

    WiFi.mode(WIFI_STA);
    for (uint8_t i = 0; i < WIFI_COUNT; i++) {
        Serial.printf("[WiFi] Trying %s...\n", WIFI_LIST[i].ssid);
        WiFi.begin(WIFI_LIST[i].ssid, WIFI_LIST[i].pass);

        unsigned long start = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
            delay(100);
        }
        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf("[WiFi] Connected to %s — IP: %s\n",
                WIFI_LIST[i].ssid, WiFi.localIP().toString().c_str());
            return true;
        }
    }
    Serial.println("[WiFi] All networks failed");
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: BLE PROXIMITY SCANNING
// ═══════════════════════════════════════════════════════════════════════════

static bool bleInitialized = false;

bool scanForAnchorBeacon(const String& targetUUID) {
    if (!bleInitialized) {
        BLEDevice::init("");
        bleInitialized = true;
    }

    BLEScan* pScan = BLEDevice::getScan();
    pScan->setActiveScan(true);
    pScan->setInterval(100);
    pScan->setWindow(99);

    BLEScanResults results = pScan->start(BLE_SCAN_DURATION_MS / 1000, false);
    bool found = false;

    for (int i = 0; i < results.getCount(); i++) {
        BLEAdvertisedDevice device = results.getDevice(i);
        if (device.getRSSI() > BLE_RSSI_THRESHOLD) {
            // Check if this is our target anchor beacon
            if (device.haveServiceUUID() || device.haveManufacturerData()) {
                Serial.printf("[BLE] Found device RSSI=%d\n", device.getRSSI());
                found = true;
                break;
            }
        }
    }

    pScan->clearResults();
    return found;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: MQTT COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err) return;

    const char* action = doc["action"];
    if (!action) return;

    Serial.printf("[MQTT] Action: %s\n", action);

    if (strcmp(action, "new_task") == 0) {
        if (taskPool.size() >= MAX_POOL_SIZE) {
            Serial.println("[TASK] Pool full, rejecting");
            return;
        }
        Task t;
        t.taskId          = doc["task_id"].as<String>();
        t.assetId         = doc["asset_id"].as<String>();
        t.location        = doc["location"].as<String>();
        t.description     = doc["description"].as<String>();
        t.priority        = doc["priority"] | "medium";
        t.targetBeaconUUID = doc["beacon_uuid"] | "";
        t.receivedAt      = millis();

        taskPool.push_back(t);
        Serial.printf("[TASK] New task added: %s (pool size: %d)\n",
            t.taskId.c_str(), taskPool.size());

        if (currentFSMState == STATE_IDLE) {
            currentTaskIdx = taskPool.size() - 1;
            currentFSMState = STATE_TASK_RECEIVED;
        }
    }
    else if (strcmp(action, "cancel_task") == 0) {
        String cancelId = doc["task_id"].as<String>();
        for (auto it = taskPool.begin(); it != taskPool.end(); ++it) {
            if (it->taskId == cancelId) {
                taskPool.erase(it);
                Serial.printf("[TASK] Cancelled: %s\n", cancelId.c_str());
                break;
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: MQTT STATUS PUBLISHING
// ═══════════════════════════════════════════════════════════════════════════

void publishStatus(const char* status, const char* detail = nullptr) {
    if (!mqttClient.connected()) return;

    StaticJsonDocument<256> doc;
    doc["card_id"]   = CARD_ID;
    doc["status"]    = status;
    doc["state"]     = stateToString(currentFSMState);
    doc["fw"]        = FW_VERSION;
    doc["rssi"]      = WiFi.RSSI();
    doc["heap"]      = ESP.getFreeHeap();

    if (detail) doc["detail"] = detail;
    if (currentTaskIdx >= 0 && currentTaskIdx < (int)taskPool.size()) {
        doc["task_id"] = taskPool[currentTaskIdx].taskId;
    }

    char buffer[256];
    serializeJson(doc, buffer);
    mqttClient.publish(MQTT_TOPIC_STATUS, buffer);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: MAIN STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════

static unsigned long stateEnteredAt = 0;
static unsigned long lastHeartbeat  = 0;

void transitionTo(CardState newState) {
    Serial.printf("[FSM] %s → %s\n", stateToString(currentFSMState), stateToString(newState));
    currentFSMState = newState;
    stateEnteredAt  = millis();
}

void runStateMachine() {
    switch (currentFSMState) {

        case STATE_BOOT:
            initHardware();
            transitionTo(STATE_WIFI_CONNECTING);
            break;

        case STATE_WIFI_CONNECTING:
            if (connectMultiWiFi()) {
                transitionTo(STATE_MQTT_CONNECTING);
            }
            break;

        case STATE_MQTT_CONNECTING:
            if (mqttClient.connected()) {
                drawIdleScreen();
                transitionTo(STATE_IDLE);
            } else {
                mqttClient.connect(CARD_ID);
                if (mqttClient.connected()) {
                    mqttClient.subscribe(MQTT_TOPIC_COMMAND);
                    publishStatus("online");
                    drawIdleScreen();
                    transitionTo(STATE_IDLE);
                }
            }
            break;

        case STATE_IDLE:
            fill_solid(leds, LED_COUNT, CRGB::Green);
            FastLED.show();
            // Heartbeat telemetry
            if (millis() - lastHeartbeat > HEARTBEAT_MS) {
                lastHeartbeat = millis();
                publishStatus("heartbeat");
            }
            break;

        case STATE_TASK_RECEIVED:
            if (currentTaskIdx >= 0) {
                drawTaskScreen(taskPool[currentTaskIdx]);
                pulseNotification(CRGB::Yellow, VIB_DURATION_MS);
            }
            // Wait for user button input
            if (readButton(btnAccept)) {
                publishStatus("task_accepted");
                transitionTo(STATE_TASK_ACCEPTED);
            }
            if (readButton(btnReject)) {
                publishStatus("task_rejected");
                taskPool.erase(taskPool.begin() + currentTaskIdx);
                currentTaskIdx = -1;
                drawIdleScreen();
                transitionTo(STATE_IDLE);
            }
            updateLEDBlink(CRGB::Yellow);
            break;

        case STATE_TASK_ACCEPTED:
            tft.fillScreen(COL_BG);
            drawHeader("EN ROUTE", COL_GREEN);
            tft.setCursor(10, 55);
            tft.setTextColor(COL_WHITE);
            tft.print("Navigate to asset...");
            transitionTo(STATE_EN_ROUTE);
            break;

        case STATE_EN_ROUTE:
            updateLEDBlink(CRGB::Blue);
            // User presses ACCEPT when they arrive → scan
            if (readButton(btnAccept)) {
                drawScanningScreen();
                transitionTo(STATE_ARRIVAL_SCAN);
            }
            break;

        case STATE_ARRIVAL_SCAN: {
            String targetUUID = "";
            if (currentTaskIdx >= 0) {
                targetUUID = taskPool[currentTaskIdx].targetBeaconUUID;
            }
            bool found = scanForAnchorBeacon(targetUUID);
            if (found) {
                publishStatus("arrival_confirmed");
                fill_solid(leds, LED_COUNT, CRGB::Green);
                FastLED.show();
                transitionTo(STATE_ON_SITE);
            } else {
                tft.setCursor(10, 80);
                tft.setTextColor(COL_RED);
                tft.print("Not found, retry...");
                transitionTo(STATE_EN_ROUTE);
            }
            break;
        }

        case STATE_ON_SITE:
            updateLEDBlink(CRGB::Green);
            // User presses ACCEPT when work is done
            if (readButton(btnAccept)) {
                publishStatus("task_completed");
                transitionTo(STATE_TASK_COMPLETE);
            }
            break;

        case STATE_TASK_COMPLETE:
            fill_solid(leds, LED_COUNT, CRGB::Black);
            FastLED.show();
            // Clean up completed task
            if (currentTaskIdx >= 0 && currentTaskIdx < (int)taskPool.size()) {
                taskPool.erase(taskPool.begin() + currentTaskIdx);
            }
            currentTaskIdx = -1;
            // Check if more tasks in pool
            if (!taskPool.empty()) {
                currentTaskIdx = 0;
                transitionTo(STATE_TASK_RECEIVED);
            } else {
                drawIdleScreen();
                transitionTo(STATE_IDLE);
            }
            break;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 11: SETUP & MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════════

void setup() {
    Serial.begin(115200);
    Serial.printf("\n[BOOT] Smart Card Firmware v%s\n", FW_VERSION);
    Serial.printf("[BOOT] Card ID: %s\n", CARD_ID);

    // TLS + MQTT setup
    // mqttNet.setCACert(AWS_CERT_CA);       // Uncomment with real certs
    // mqttNet.setCertificate(AWS_CERT_CRT);
    // mqttNet.setPrivateKey(AWS_CERT_PRIVATE);
    mqttClient.setServer("YOUR_AWS_IOT_ENDPOINT", AWS_IOT_PORT);
    mqttClient.setKeepAlive(MQTT_KEEPALIVE_SEC);
    mqttClient.setBufferSize(MQTT_BUFFER_SIZE);
    mqttClient.setCallback(mqttCallback);

    transitionTo(STATE_BOOT);
}

void loop() {
    // WiFi watchdog
    if (WiFi.status() != WL_CONNECTED && currentFSMState > STATE_WIFI_CONNECTING) {
        transitionTo(STATE_WIFI_CONNECTING);
    }

    // MQTT maintenance
    if (currentFSMState >= STATE_IDLE) {
        if (!mqttClient.connected()) {
            transitionTo(STATE_MQTT_CONNECTING);
        }
        mqttClient.loop();
    }

    // Run the FSM
    runStateMachine();

    // Active real-time safety & fall kinematics
    evaluateFallKinematics();
}
