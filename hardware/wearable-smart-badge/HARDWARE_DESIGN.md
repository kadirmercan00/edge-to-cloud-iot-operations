# 📟 Wearable Smart Badge — Hardware Design & PCB Architecture

This document details the schematic architecture, PCB layout rules, and component selection for the **Wearable Industrial Smart Badge**, engineered in **Altium Designer**.

<div align="center">
  <img src="images/smart_badge_3d_render.jpg" alt="Wearable Smart Badge 3D PCB Render" width="620" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);" />
  <p><em>Custom Wearable PCB: ESP32-WROOM-32E + 1.8" ST7735 SPI TFT + ST LIS2DH12 IMU + WS2812B + USB-C Li-Po Management</em></p>
</div>

---

## 1. Electrical Architecture & Schematic Blocks

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            POWER & BATTERY BLOCK                             │
│  [USB-C In] ──► [ESD Diodes] ──► [TP4056 Charger] ──► [3.7V Li-Po Battery]   │
│                                           │                                  │
│                                           ▼                                  │
│                         [ME6211 3.3V LDO (500mA, Low Iq)]                    │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ VCC_3V3
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           COMPUTE & WIRELESS CORE                            │
│                         [ESP32-WROOM-32E 16MB Flash]                         │
│                    Dual-Core Xtensa @ 240MHz / 2.4GHz Wi-Fi + BLE            │
└──────────────┬───────────────────────┬───────────────────────────────┬───────┘
               │ I2C Bus               │ SPI Bus                       │ GPIO
               ▼                       ▼                               ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌──────────────────────┐
│       SENSORS           │ │      OPERATOR HMI       │ │  TACTILE & FEEDBACK  │
│ • ST LIS2DH12 3-Axis IMU│ │ • 1.8" ST7735 SPI TFT   │ │ • 4x Tactical Push   │
│   (Free-Fall Interrupts)│ │   (128x160, 16-bit RGB) │ │   Buttons (Debounced)│
│ • NimBLE Beacon RSSI    │ │ • 2x WS2812B RGB LEDs   │ │ • ERM Haptic Motor   │
│   (Indoor Micro-Loc)    │ │   (Status Signatures)   │ │ • Piezo Alert Buzzer │
└─────────────────────────┘ └─────────────────────────┘ └──────────────────────┘
```

---

## 2. Subsystem Engineering

### A. Power & Battery Management
- **Primary Source:** Rechargeable 3.7V 850mAh Lithium-Polymer (Li-Po) battery with internal PCM protection.
- **Charging IC:** TP4056 linear charger programmed with a $450\,\text{mA}$ charge rate ($R_{\text{PROG}} = 2.4\,\text{k}\Omega$) and auto-termination.
- **System Voltage Regulation:** ME6211 ultra-low dropout (LDO) regulator supplying $3.3\,\text{V} \pm 1\%$ with $40\,\mu\text{A}$ quiescent current ($I_q$), ensuring long operational life during low-power deep sleep cycles.
- **Battery Fuel Gauge:** Discrete high-impedance resistor voltage divider ($100\,\text{k}\Omega / 100\,\text{k}\Omega$) fed directly into ESP32 ADC pin (`GPIO36 / ADC1_CH0`) to monitor cell discharge curve.

### B. Motion & Fall Detection Kinematics
- **IMU:** STMicroelectronics **LIS2DH12** ultra-low-power 3-axis accelerometer.
- **Interface:** I2C bus operating at $400\,\text{kHz}$ (Fast Mode) on `GPIO21` (SDA) and `GPIO22` (SCL).
- **Interrupts:**
  - `INT1` (`GPIO34`): Configured as hardware Free-Fall interrupt ($< 350\,\text{mg}$ for $> 120\,\text{ms}$).
  - `INT2` (`GPIO35`): Configured as high-G impact trigger ($> 3.0\,\text{G}$) and motion wake-up from light sleep.

### C. Display & Operator Controls (ST7735 SPI)
- **Display:** 1.8" TFT Color LCD (ST7735 controller, $128 \times 160$ pixels).
- **Bus Speed:** Hardware SPI up to $27\,\text{MHz}$ for instant dispatch screen refresh.
- **Pin Map:**
  - `TFT_CS`: GPIO5
  - `TFT_DC`: GPIO4
  - `TFT_RST`: GPIO16
  - `TFT_MOSI`: GPIO23
  - `TFT_SCLK`: GPIO18
  - `TFT_BL`: GPIO17 (PWM brightness regulation)
- **Input Buttons:** 4 tactical momentary push buttons with hardware pull-ups and software RC debounce (`UP: GPIO13`, `DOWN: GPIO14`, `ENTER: GPIO27`, `CANCEL: GPIO26`).

---

## 3. PCB Layout & Manufacturing Guidelines (DFM/DFA)

- **Form Factor:** Compact wearable form factor ($72\,\text{mm} \times 48\,\text{mm} \times 1.6\,\text{mm}$) engineered to clip onto industrial hardhats or safety harnesses.
- **RF Antenna Keep-Out:** Dedicated $15\,\text{mm} \times 8\,\text{mm}$ ground clearance area beneath the ESP32 on-board PCB trace antenna across all copper layers.
- **Decoupling Strategy:** $100\,\text{nF}$ ceramic X7R capacitors placed within $1.5\,\text{mm}$ of every active VCC pin, complemented by $10\,\mu\text{F}$ bulk tantalums on main $3.3\,\text{V}$ rail.
- **Trace Geometry:** Minimum $0.2\,\text{mm}$ trace width / $0.2\,\text{mm}$ clearance. Power rails sized at $0.6 - 1.0\,\text{mm}$ to prevent voltage sag during 2.4GHz RF TX bursts.
- **Standards:** IPC-7351B compliant footprints, RoHS certified surface finish (ENIG).
