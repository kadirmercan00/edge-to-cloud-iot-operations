# 🏛️ System Architecture & Data Flow

This document details the multi-tier engineering architecture of the **Edge-to-Cloud IoT Operations Platform**.

---

## 1. End-to-End Topology

```mermaid
graph TD
    subgraph Edge Layer [Field Edge Devices]
        A[BLE Beacons & ToF Nodes] -->|BLE Advertisements| B[ESP32 Gateway Node]
        C[Field Asset Unit] -->|Sensors / UART| C
        D[Staff Smart Card] -->|BLE Proximity & RSSI| C
    end

    subgraph Transport Layer [Network & Security]
        B -->|MQTTS / TLS 1.2 Port 8883| E[AWS IoT Core Broker]
        C -->|MQTTS / TLS 1.2 X.509 Auth| E
    end

    subgraph Cloud Layer [Serverless Processing]
        E -->|IoT SQL Rules| F[Event Normalizer Lambda]
        F -->|Time-Series Ingestion| G[(Amazon DynamoDB)]
        F -->|State Notifications| H[Amazon SNS / SQS]
        F -->|Critical Thresholds| I[Predictive Engine Service]
    end

    subgraph Analytics & Web [Operations Interface]
        G -->|REST / WebSocket API| J[API Gateway]
        J -->|JSON Feeds| K[Operations Dashboard]
        I -->|Health State Scoring| K
    end
```

---

## 2. Component Breakdown

### A. Edge Layer (C++ / ESP32)
- **Anchor Units:** Fixed field monitoring modules equipped with ambient, vibration, and proximity telemetry. Employs non-blocking state machines and FreeRTOS task scheduling.
- **Smart Cards:** Mobile personnel and asset tracking tags with onboard low-power TFT displays, dual-core task segregation (Display vs BLE/WiFi stack), and deep sleep optimization.
- **BLE Gateways:** High-throughput NimBLE scanners filtering proprietary manufacturer payloads and packaging frames into compact MQTT JSON bursts.

### B. Transport & Authentication
- **Mutual TLS (mTLS):** Hardware-unique X.509 client certificates stored in non-volatile flash.
- **Exponential Backoff Reconnects:** Network failure resiliency ensuring no dropped sensor frames during field connectivity drops.

### C. Serverless Cloud Pipeline (Python / AWS)
- **AWS IoT Rules Engine:** Topic-based query filtration directing raw telemetry directly to execution containers.
- **Normalizer Lambda:** Validates, cleanses, deduplicates, and enriches edge telemetry before persistence.
- **DynamoDB Single-Table Design:** Partitioned by `asset_id` with composite sort keys (`timestamp`) for sub-millisecond retrieval.

### D. Machine Learning Inference Pipeline
- **Predictive Health Model:** Analyzes multi-sensor telemetry (temperature, vibration, load cycles) using a tuned RandomForest classifier to flag degradation patterns before catastrophic failure.
