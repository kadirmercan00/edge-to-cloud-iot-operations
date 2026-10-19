from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODEL_PATH = ARTIFACTS_DIR / "model_v2.pkl"
SCALER_PATH = ARTIFACTS_DIR / "scaler_v2.pkl"

FEATURE_COLUMNS = [
    "Temperature",
    "Vibration",
    "MotorRun",
    "Load",
    "Temp_RollMean",
    "Vib_RollMean",
    "Load_RollMean",
    "Temp_RollStd",
    "Vib_RollStd",
    "Load_RollStd",
    "Temp_Trend",
    "Vib_Trend",
    "Load_Trend",
    "Temp_Vib_Ratio",
    "Load_When_Running",
]

_model = None
_scaler = None


def _load_artifacts():
    global _model, _scaler
    if _model is None:
        _model = joblib.load(MODEL_PATH)
    if _scaler is None:
        _scaler = joblib.load(SCALER_PATH)
    return _model, _scaler


def _to_float_array(values) -> np.ndarray:
    array = np.asarray(values, dtype=float)
    return array[~np.isnan(array)]


def _latest_or_default(values: np.ndarray, default: float = 0.0) -> float:
    if len(values) == 0:
        return default
    return float(values[-1])


def predict(temp_list, vib_list, motorrun_list, load_list):
    """
    LabVIEW Python Node entry point.

    Returns:
        tuple[int, float]: health class and confidence.
        0=Normal, 1=Warning, 2=Critical.
    """
    model, scaler = _load_artifacts()

    temp = _to_float_array(temp_list)
    vib = _to_float_array(vib_list)
    motorrun = _to_float_array(motorrun_list)
    load = _to_float_array(load_list)

    if len(temp) == 0 or len(vib) == 0:
        return 0, 1.0

    temp_current = _latest_or_default(temp)
    vib_current = _latest_or_default(vib)
    motorrun_current = _latest_or_default(motorrun)
    load_current = _latest_or_default(load, default=0.52)

    temp_rollmean = float(np.mean(temp))
    vib_rollmean = float(np.mean(vib))
    load_rollmean = float(np.mean(load)) if len(load) else load_current

    temp_rollstd = float(np.std(temp))
    vib_rollstd = float(np.std(vib))
    load_rollstd = float(np.std(load)) if len(load) else 0.0

    temp_trend = float(temp[-1] - temp[0])
    vib_trend = float(vib[-1] - vib[0])
    load_trend = float(load[-1] - load[0]) if len(load) else 0.0

    temp_vib_ratio = float(temp_current / max(vib_current, 0.01))
    load_when_running = float(load_current * motorrun_current)

    feature_vector = pd.DataFrame(
        [[
            temp_current,
            vib_current,
            motorrun_current,
            load_current,
            temp_rollmean,
            vib_rollmean,
            load_rollmean,
            temp_rollstd,
            vib_rollstd,
            load_rollstd,
            temp_trend,
            vib_trend,
            load_trend,
            temp_vib_ratio,
            load_when_running,
        ]],
        columns=FEATURE_COLUMNS,
    )

    scaled = scaler.transform(feature_vector)
    prediction = int(model.predict(scaled)[0])
    probabilities = model.predict_proba(scaled)[0]
    confidence = float(np.max(probabilities))
    return prediction, confidence


if __name__ == "__main__":
    normal = predict(
        [24.12, 24.18, 24.26, 24.34, 24.45, 24.58, 24.71],
        [1.35, 1.43, 1.37, 1.28, 1.23, 1.22, 1.24],
        [1, 1, 1, 1, 1, 1, 1],
        [0.62, 0.64, 0.66, 0.67, 0.67, 0.68, 0.69],
    )
    print(f"Sample prediction: class={normal[0]} confidence={normal[1]:.3f}")
