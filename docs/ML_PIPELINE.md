# 🧠 Predictive Maintenance & Condition Monitoring Pipeline

This document details the Machine Learning pipeline designed for early failure detection and anomaly scoring on industrial telemetry.

---

## 1. Overview & Objective

Industrial equipment experiences gradual mechanical wear before operational failure occurs. This pipeline transforms raw time-series sensor data (temperature, tri-axial vibration, current draw) into condition health classes:
- **State 0: NORMAL** — Equipment operating within standard tolerances.
- **State 1: WARNING** — Early signs of mechanical wear or abnormal thermal elevation.
- **State 2: CRITICAL** — High-amplitude vibration or exceeding safe limits requiring immediate maintenance.

---

## 2. Feature Engineering

Raw sensor readings alone are insufficient for robust anomaly detection due to noise and transient spikes. The feature extraction layer computes 15 statistical features over sliding time windows:

| Feature Name | Description | Rationale |
|---|---|---|
| `vibration_rolling_mean` | Moving average of vibration RMS | Smooths transient shock events |
| `vibration_rolling_std` | Moving standard deviation | Captures mechanical instability & chatter |
| `vibration_delta` | Step-by-step differential | Detects sudden load transitions |
| `temp_rolling_mean` | Thermal trend average | Identifies gradual heat build-up |
| `temp_gradient` | First derivative of temperature curve | Differentiates normal heating from runaway |
| `vibration_temp_ratio` | Cross-sensor coupling ratio | Disproportionate vibration vs heat indicators |

---

## 3. Model Architecture

- **Classifier:** `RandomForestClassifier` (Scikit-Learn)
- **Hyperparameters:**
  - `n_estimators`: 250
  - `max_depth`: 12
  - `class_weight`: `'balanced'` (compensates for rare failure states)
  - `min_samples_split`: 4
- **Evaluation:** Evaluated on multi-class F1-score and confusion matrices with strict time-series train/test separation to avoid data leakage.

---

## 4. Usage & Execution

### Training:
```bash
python ml/train_model.py --data ml/data/sample_telemetry.csv --out-dir ml/reports/
```

### Real-time Inference:
```bash
python ml/predict_health.py --sample '{"temperature": 45.2, "vibration_rms": 0.22}'
```
