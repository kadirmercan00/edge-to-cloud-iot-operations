from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
REPORTS_DIR = BASE_DIR / "reports"

COLUMN_NAMES = [
    "Timestamp",
    "Temperature",
    "Vibration",
    "Fault",
    "MotorRun",
    "Load",
    "Wear",
]

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

LABEL_NAMES = {
    0: "Normal",
    1: "Warning",
    2: "Critical",
}


def load_data(data_dir: Path = DATA_DIR) -> pd.DataFrame:
    csv_files = sorted(data_dir.glob("*.csv"))
    if not csv_files:
        raise FileNotFoundError(f"No CSV files found in {data_dir}")

    frames: list[pd.DataFrame] = []
    for csv_file in csv_files:
        frame = pd.read_csv(csv_file, header=None, names=COLUMN_NAMES)
        frame["SourceFile"] = csv_file.name
        frames.append(frame)

    data = pd.concat(frames, ignore_index=True)
    data["Timestamp"] = pd.to_datetime(data["Timestamp"], errors="coerce")

    numeric_columns = [name for name in COLUMN_NAMES if name != "Timestamp"]
    for column in numeric_columns:
        data[column] = pd.to_numeric(data[column], errors="coerce")

    data = data.dropna(subset=COLUMN_NAMES).copy()
    data = data.sort_values(["SourceFile", "Timestamp"]).reset_index(drop=True)
    return data


def apply_labels(data: pd.DataFrame) -> pd.DataFrame:
    data = data.copy()
    conditions = [
        (data["Fault"] == 1) | (data["Wear"] >= 0.85),
        (data["Wear"] >= 0.60) & (data["Wear"] < 0.85),
    ]
    data["Label"] = np.select(conditions, [2, 1], default=0).astype(int)
    return data


def add_features(data: pd.DataFrame, window_size: int = 15) -> pd.DataFrame:
    data = data.copy()
    grouped = data.groupby("SourceFile", sort=False)

    for source, output in [
        ("Temperature", "Temp"),
        ("Vibration", "Vib"),
        ("Load", "Load"),
    ]:
        rolling = grouped[source].rolling(window=window_size, min_periods=1)
        data[f"{output}_RollMean"] = rolling.mean().reset_index(level=0, drop=True)
        data[f"{output}_RollStd"] = rolling.std().reset_index(level=0, drop=True).fillna(0.0)
        shifted = grouped[source].shift(window_size)
        data[f"{output}_Trend"] = data[source] - shifted.fillna(data[source])

    data["Temp_Vib_Ratio"] = data["Temperature"] / data["Vibration"].clip(lower=0.01)
    data["Load_When_Running"] = data["Load"] * data["MotorRun"]
    return data.replace([np.inf, -np.inf], np.nan).dropna().reset_index(drop=True)


def build_training_frame() -> pd.DataFrame:
    data = load_data()
    data = apply_labels(data)
    return add_features(data)


def write_text_report(
    report_path: Path,
    data: pd.DataFrame,
    accuracy: float,
    report: str,
    matrix: np.ndarray,
    feature_importance: pd.DataFrame,
) -> None:
    class_counts = data["Label"].value_counts().sort_index()
    lines = [
        "Edge-Ops Industrial ML v2 Training Report",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        f"Data directory: {DATA_DIR}",
        f"Rows used: {len(data)}",
        "",
        "Class distribution:",
    ]
    for label, count in class_counts.items():
        lines.append(f"  {label} ({LABEL_NAMES[int(label)]}): {int(count)}")

    lines.extend(
        [
            "",
            f"Accuracy: {accuracy:.4f}",
            "",
            "Classification report:",
            report,
            "",
            "Confusion matrix rows=true, columns=predicted [0, 1, 2]:",
            np.array2string(matrix),
            "",
            "Feature importance:",
            feature_importance.to_string(index=False),
            "",
        ]
    )
    report_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading LabVIEW CSV data...")
    data = build_training_frame()
    print(f"Rows used: {len(data)}")
    print("Class distribution:")
    print(data["Label"].value_counts().sort_index())

    x = data[FEATURE_COLUMNS]
    y = data["Label"]

    stratify = y if y.value_counts().min() >= 2 else None
    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.20,
        random_state=42,
        stratify=stratify,
    )

    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(x_train)
    x_test_scaled = scaler.transform(x_test)

    model = RandomForestClassifier(
        n_estimators=250,
        max_depth=None,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=1,
        class_weight="balanced",
    )
    model.fit(x_train_scaled, y_train)

    y_pred = model.predict(x_test_scaled)
    accuracy = accuracy_score(y_test, y_pred)
    report = classification_report(
        y_test,
        y_pred,
        labels=[0, 1, 2],
        target_names=[LABEL_NAMES[0], LABEL_NAMES[1], LABEL_NAMES[2]],
        digits=4,
        zero_division=0,
    )
    matrix = confusion_matrix(y_test, y_pred, labels=[0, 1, 2])

    feature_importance = pd.DataFrame(
        {
            "Feature": FEATURE_COLUMNS,
            "Importance": model.feature_importances_,
        }
    ).sort_values("Importance", ascending=False)

    joblib.dump(model, ARTIFACTS_DIR / "model_v2.pkl")
    joblib.dump(scaler, ARTIFACTS_DIR / "scaler_v2.pkl")
    feature_importance.to_csv(REPORTS_DIR / "feature_importance_v2.csv", index=False)

    metadata = {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "source_data_dir": str(DATA_DIR),
        "row_count": int(len(data)),
        "csv_file_count": int(data["SourceFile"].nunique()),
        "window_size": 15,
        "label_names": LABEL_NAMES,
        "feature_columns": FEATURE_COLUMNS,
        "accuracy": float(accuracy),
        "class_distribution": {
            str(label): int(count)
            for label, count in data["Label"].value_counts().sort_index().items()
        },
        "model": "RandomForestClassifier",
        "sklearn_note": "Artifacts were created with the local sklearn runtime.",
    }
    (ARTIFACTS_DIR / "metadata_v2.json").write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )

    write_text_report(
        REPORTS_DIR / "training_report_v2.txt",
        data,
        accuracy,
        report,
        matrix,
        feature_importance,
    )

    print("")
    print(report)
    print(f"Accuracy: {accuracy:.4f}")
    print(f"Saved model: {ARTIFACTS_DIR / 'model_v2.pkl'}")
    print(f"Saved scaler: {ARTIFACTS_DIR / 'scaler_v2.pkl'}")
    print(f"Saved report: {REPORTS_DIR / 'training_report_v2.txt'}")


if __name__ == "__main__":
    main()
