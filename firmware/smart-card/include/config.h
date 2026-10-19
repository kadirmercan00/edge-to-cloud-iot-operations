// ═══════════════════════════════════════════════════════════════════════════
// config.h — Smart Card Configuration (Sanitized for Portfolio Showcase)
// Mapped to Custom Altium PCB: hardware/wearable-smart-badge/HARDWARE_DESIGN.md
// ═══════════════════════════════════════════════════════════════════════════
#pragma once

// ─── Device Identity ───────────────────────────────────────────────────────
#define FW_VERSION        "3.5.6"
#define CARD_ID           "CARD_001"

// ─── Multi-WiFi Configuration ──────────────────────────────────────────────
struct WifiCredential { const char* ssid; const char* pass; };
static const WifiCredential WIFI_LIST[] = {
    { "YOUR_PRIMARY_SSID",   "YOUR_PRIMARY_PASS"   },
    { "YOUR_SECONDARY_SSID", "YOUR_SECONDARY_PASS" },
};
static const uint8_t WIFI_COUNT = sizeof(WIFI_LIST) / sizeof(WIFI_LIST[0]);

// ─── AWS IoT MQTT ──────────────────────────────────────────────────────────
#define AWS_IOT_PORT          8883
#define MQTT_KEEPALIVE_SEC    60
#define MQTT_BUFFER_SIZE      1024

// Topic format: <ns>/<env>/<site>/<module>/<card_id>/<channel>
#define MQTT_TOPIC_COMMAND    "iot/prod/site01/fleet/" CARD_ID "/command"
#define MQTT_TOPIC_STATUS     "iot/prod/site01/fleet/" CARD_ID "/status"

// ─── Hardware Pin Mapping ──────────────────────────────────────────────────
// TFT Display (ST7735 1.8" SPI)
#define TFT_CS        5
#define TFT_RST       16
#define TFT_DC        4
#define TFT_MOSI      23
#define TFT_SCLK      18
#define TFT_POWER     17

// WS2812B RGB LED Strip
#define LED_DATA_PIN  25
#define LED_COUNT     2
#define LED_BRIGHT    40

// Navigation Buttons (active LOW, internal pull-up)
#define BTN_ACCEPT    35
#define BTN_REJECT    36
#define BTN_UP        34
#define BTN_DOWN      39

// Haptic Feedback Motor
#define VIB_PIN       26

// Battery ADC (voltage divider)
#define BAT_PIN       33

// ─── STMicroelectronics LIS2DH12 3-Axis IMU (I2C) ─────────────────────────
#define PIN_I2C_SDA             21
#define PIN_I2C_SCL             22
#define PIN_IMU_INT             32
#define LIS2DH12_I2C_ADDR       0x18

// ─── Safety & Man-Down Kinematics Thresholds ──────────────────────────────
#define FREEFALL_THRESHOLD_G    0.35f   // Free-fall resultant drops below 0.35G
#define IMPACT_THRESHOLD_G      3.0f    // Impact spike exceeds 3.0G
#define INACTIVITY_TIMEOUT_SEC  60      // Inactivity post-fall trigger
#define MQTT_TOPIC_ALERT        "iot/prod/site01/fleet/" CARD_ID "/alert"

// ─── Timing Constants (ms) ─────────────────────────────────────────────────
#define WIFI_TIMEOUT_MS       15000
#define MQTT_RECONNECT_MS     5000
#define DEBOUNCE_MS           250
#define BLE_SCAN_DURATION_MS  3000
#define BLE_RSSI_THRESHOLD    -85
#define BG_BLE_SCAN_MS        10000
#define BG_BLE_DURATION_MS    2000
#define SCREEN_TIMEOUT_MS     30000
#define LED_BLINK_MS          400
#define VIB_DURATION_MS       500
#define HEARTBEAT_MS          60000
#define MAX_POOL_SIZE         10

// ─── TFT Color Palette ────────────────────────────────────────────────────
#define COL_BG        0x0000   // Black
#define COL_HEADER    0x1A3F   // Dark blue header
#define COL_WHITE     0xFFFF
#define COL_GREEN     0x07E0
#define COL_RED       0xF800
#define COL_BLUE      0x001F
#define COL_YELLOW    0xFFE0
