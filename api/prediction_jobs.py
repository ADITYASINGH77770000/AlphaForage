"""
api/prediction_jobs.py
──────────────────────────────────────────────────────────────────────────────
Background job runner + serialisation for the multi-model Prediction Studio.

Why jobs rather than a plain endpoint: `core.prediction.run_multi_model_prediction`
trains XGBoost, an LSTM (TensorFlow) and a Transformer (PyTorch). A full run on
~2,200 rows takes ~380s — far past any HTTP proxy timeout. So training runs in a
background thread and the client polls for the result.

Trained models are kept in memory per job so "Refresh Forecast" can re-run
inference against fresh data without retraining — the same thing the Streamlit
page does with st.session_state.

The danger-flag checks are replicated from `app/pages/04_🤖_Prediction.py`
(they live inline in that Streamlit script, not in core/). The forecasting maths
is entirely core's; nothing here recomputes it.
"""

from __future__ import annotations

import math
import threading
import time
import uuid
from typing import Any

import numpy as np
import pandas as pd

# Jobs are held in-process. A restart clears them, which is fine: the client
# treats a missing job as "train again".
_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()

# Keep memory bounded — trained Keras/Torch models are not small.
_MAX_JOBS = 8

MODEL_ORDER = ["XGBoost", "LSTM", "Transformer"]


# ── serialisation helpers ────────────────────────────────────────────────────

def _num(value: Any) -> float | None:
    """JSON-safe float: NaN/inf become null."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _frame_records(frame: pd.DataFrame, date_key: str = "date") -> list[dict]:
    """DatetimeIndex frame → [{date, col: value, …}] with NaN as null."""
    if frame is None or frame.empty:
        return []
    out = []
    for idx, row in frame.iterrows():
        rec: dict[str, Any] = {
            date_key: idx.strftime("%Y-%m-%d") if isinstance(idx, pd.Timestamp) else str(idx)
        }
        for col, val in row.items():
            rec[str(col)] = _num(val)
        out.append(rec)
    return out


def _metric_value(frame: pd.DataFrame, model_name: str, column: str):
    if frame is None or frame.empty or model_name not in frame.index or column not in frame.columns:
        return None
    value = frame.loc[model_name, column]
    return None if pd.isna(value) else value


# ── danger flags (replicated from the Streamlit page) ────────────────────────

def compute_prediction_danger_flags(result: dict, data_source: str = "unknown") -> list[dict]:
    """
    Deterministic pre-flight checks for the prediction output.

    Thresholds (verbatim from the Streamlit page):
      Confidence < 0.50           DANGER   models disagree significantly
      Confidence 0.50–0.65        WARNING  low model agreement
      Any model unavailable       WARNING  ensemble running on fewer models
      Forecast delta < -10%       WARNING  bearish ensemble forecast
      Forecast delta > +30%       WARNING  potentially overfit / unrealistic upside
      MAE  > 5% of last close     WARNING  high absolute error
      RMSE > 8% of last close     WARNING  high root-mean-square error
      history < 252 days          WARNING  under a year of data
      pipeline warnings           INFO
      demo data                   INFO
    """
    flags: list[dict] = []

    ticker = result.get("ticker", "UNKNOWN")
    history = result.get("history", pd.DataFrame())
    model_metrics = result.get("model_metrics", {}) or {}
    metrics_frame = result.get("metrics", pd.DataFrame())
    confidence = result.get("confidence_score")
    final_pred = result.get("final_prediction")
    pipeline_warns = result.get("warnings", []) or []
    last_close = float(history["Close"].iloc[-1]) if not history.empty else None

    if data_source in ("demo", ""):
        flags.append({
            "severity": "INFO", "code": "DEMO_DATA",
            "message": (
                f"Prediction for {ticker} is running on SYNTHETIC demo data, not real "
                "market prices. All forecast figures — ensemble price, MAE, RMSE — are "
                "illustrative only. Do not make trading decisions based on this output."
            ),
        })

    n_days = len(history)
    if n_days < 252:
        flags.append({
            "severity": "WARNING", "code": "SHORT_HISTORY",
            "message": (
                f"Only {n_days} trading days of history available — less than one full year. "
                "Time-series models (especially LSTM) typically need 252+ days to capture "
                "meaningful seasonal and trend patterns. The forecast may be unreliable."
            ),
        })

    if confidence is not None:
        if confidence < 0.50:
            flags.append({
                "severity": "DANGER", "code": "LOW_CONFIDENCE",
                "message": (
                    f"Ensemble confidence score is {confidence:.2%} — critically low. "
                    "The three models are pointing in significantly different directions. "
                    "The ensemble average may be meaningless noise. Do not rely on this "
                    "forecast for directional decision-making."
                ),
            })
        elif confidence < 0.65:
            flags.append({
                "severity": "WARNING", "code": "MODERATE_CONFIDENCE",
                "message": (
                    f"Ensemble confidence score is {confidence:.2%} — below the reliable "
                    "threshold of 65%. Models have meaningful disagreement. Treat the "
                    "forecast as directional indication only, not a price target."
                ),
            })

    unavailable = [
        name for name, mm in model_metrics.items()
        if str(mm.get("status", "")).lower() not in ("ok", "success", "trained", "fitted")
    ]
    if unavailable:
        flags.append({
            "severity": "WARNING", "code": "MODELS_UNAVAILABLE",
            "message": (
                f"The following model(s) did not produce a valid forecast: "
                f"{', '.join(unavailable)}. "
                "The ensemble is running on fewer models than configured, which reduces "
                "robustness and may bias the ensemble toward the available model(s)."
            ),
        })

    if last_close and final_pred:
        delta = (final_pred / last_close) - 1.0
        if delta < -0.10:
            flags.append({
                "severity": "WARNING", "code": "BEARISH_FORECAST",
                "message": (
                    f"The ensemble forecasts a decline of {delta:.2%} from the last close "
                    f"(${last_close:,.2f} → ${final_pred:,.2f}). "
                    "This is a meaningfully bearish signal. Verify against the individual "
                    "model tabs — if only one model is driving the decline, discount accordingly."
                ),
            })
        elif delta > 0.30:
            flags.append({
                "severity": "WARNING", "code": "AGGRESSIVE_UPSIDE",
                "message": (
                    f"The ensemble forecasts a gain of {delta:.2%} — unusually large upside. "
                    "This level of predicted appreciation over the forecast horizon may indicate "
                    "an overfit model or a data leakage issue. Review model MAE/RMSE carefully."
                ),
            })

    if last_close and metrics_frame is not None and not metrics_frame.empty:
        for model_name in metrics_frame.index:
            mae_val = _metric_value(metrics_frame, model_name, "mae")
            rmse_val = _metric_value(metrics_frame, model_name, "rmse")
            if mae_val is not None and float(mae_val) > last_close * 0.05:
                flags.append({
                    "severity": "WARNING", "code": f"HIGH_MAE_{str(model_name).upper()}",
                    "message": (
                        f"{model_name} MAE is {float(mae_val):.4f} — exceeds 5% of the last "
                        f"close price (${last_close:,.2f}). The model's average error is large "
                        "relative to the price level. Treat its forecast with caution."
                    ),
                })
            if rmse_val is not None and float(rmse_val) > last_close * 0.08:
                flags.append({
                    "severity": "WARNING", "code": f"HIGH_RMSE_{str(model_name).upper()}",
                    "message": (
                        f"{model_name} RMSE is {float(rmse_val):.4f} — exceeds 8% of the "
                        f"last close (${last_close:,.2f}). High RMSE means the model has "
                        "significant large-error events in its validation period."
                    ),
                })

    for warn in pipeline_warns:
        if warn:
            flags.append({
                "severity": "INFO", "code": "PIPELINE_WARNING",
                "message": f"Pipeline: {warn}",
            })

    return flags


# ── payload serialisation ────────────────────────────────────────────────────

def serialise_result(result: dict, *, history_tail: int = 120,
                     data_source: str = "unknown") -> dict:
    """Turn a core.prediction payload into the JSON the frontend renders."""
    history: pd.DataFrame = result["history"]
    forecast_frame: pd.DataFrame = result["forecast_frame"]
    metrics: pd.DataFrame = result.get("metrics", pd.DataFrame())
    model_metrics: dict = result.get("model_metrics", {}) or {}

    last_close = _num(history["Close"].iloc[-1]) if not history.empty else None
    final_pred = _num(result.get("final_prediction"))
    delta = None
    if last_close not in (None, 0) and final_pred is not None:
        delta = (final_pred / last_close) - 1.0

    available = [m for m in MODEL_ORDER if m in forecast_frame.columns]

    metric_rows = []
    if metrics is not None and not metrics.empty:
        for model_name in metrics.index:
            row = metrics.loc[model_name]
            metric_rows.append({
                "model": str(model_name),
                "backend": None if pd.isna(row.get("backend")) else str(row.get("backend")),
                "status": None if pd.isna(row.get("status")) else str(row.get("status")),
                "mse": _num(row.get("mse")),
                "mae": _num(row.get("mae")),
                "rmse": _num(row.get("rmse")),
                "warning": None if pd.isna(row.get("warning")) else str(row.get("warning")),
            })

    return {
        "ticker": result.get("ticker"),
        "data_source": data_source,
        "ensemble_method": result.get("ensemble_method"),
        "ensemble_column": ("Weighted Ensemble"
                            if result.get("ensemble_method") == "weighted" else "Simple Average"),
        "models": available,
        "feature_columns": result.get("feature_columns", []),

        "last_close": last_close,
        "final_prediction": final_pred,
        "forecast_delta": _num(delta),
        "confidence_score": _num(result.get("confidence_score")),
        "next_step_predictions": {k: _num(v) for k, v in (result.get("next_step_predictions") or {}).items()},

        # 90 rows is what the Streamlit chart shows; send a little more so the
        # client can choose its own window.
        "history": _frame_records(history.tail(history_tail)[["Close"]]),
        "forecast_frame": _frame_records(forecast_frame),
        "forecasts": {
            name: _frame_records(frame)
            for name, frame in (result.get("forecasts") or {}).items()
        },

        "metrics": metric_rows,
        "model_metrics": {
            str(k): {kk: (_num(vv) if kk in ("mse", "mae", "rmse") else
                          (None if vv is None else str(vv)))
                     for kk, vv in v.items()}
            for k, v in model_metrics.items()
        },
        "ensemble_weights": {k: _num(v) for k, v in (result.get("ensemble_weights") or {}).items()},
        "warnings": [str(w) for w in (result.get("warnings") or []) if w],
        "danger_flags": compute_prediction_danger_flags(result, data_source=data_source),
    }


# ── job lifecycle ────────────────────────────────────────────────────────────

def _prune_locked() -> None:
    """Drop the oldest finished jobs once the registry grows past the cap."""
    if len(_JOBS) <= _MAX_JOBS:
        return
    finished = sorted(
        ((jid, j) for jid, j in _JOBS.items() if j["status"] in ("done", "error")),
        key=lambda kv: kv[1].get("finished_at") or 0,
    )
    while len(_JOBS) > _MAX_JOBS and finished:
        jid, _ = finished.pop(0)
        _JOBS.pop(jid, None)


def create_job(kind: str, params: dict) -> str:
    job_id = uuid.uuid4().hex[:12]
    with _LOCK:
        _JOBS[job_id] = {
            "id": job_id,
            "kind": kind,
            "status": "queued",
            "stage": "queued",
            "params": params,
            "created_at": time.time(),
            "started_at": None,
            "finished_at": None,
            "result": None,
            "error": None,
            "raw": None,          # core payload, kept for Refresh Forecast
        }
        _prune_locked()
    return job_id


def _set(job_id: str, **fields) -> None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is not None:
            job.update(fields)


def get_job(job_id: str) -> dict | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            return None
        elapsed = None
        if job["started_at"]:
            end = job["finished_at"] or time.time()
            elapsed = round(end - job["started_at"], 1)
        return {
            "id": job["id"],
            "kind": job["kind"],
            "status": job["status"],
            "stage": job["stage"],
            "params": job["params"],
            "elapsed_seconds": elapsed,
            "error": job["error"],
            "result": job["result"],
            "has_models": job.get("raw") is not None,
        }


def list_jobs() -> list[dict]:
    with _LOCK:
        ids = list(_JOBS.keys())
    out = []
    for jid in ids:
        j = get_job(jid)
        if j:
            # Listings stay light — the full result is fetched per job.
            j.pop("result", None)
            out.append(j)
    return out


def delete_job(job_id: str) -> bool:
    with _LOCK:
        return _JOBS.pop(job_id, None) is not None


def get_raw(job_id: str) -> dict | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        return job.get("raw") if job else None


def run_training_job(job_id: str, df: pd.DataFrame, params: dict, data_source: str) -> None:
    """Train the stack in a background thread. Never raises — errors land on the job."""
    from core.prediction import run_multi_model_prediction

    _set(job_id, status="running", stage="training", started_at=time.time())
    try:
        result = run_multi_model_prediction(
            df,
            ticker=params["ticker"],
            steps=int(params["steps"]),
            look_back=int(params["look_back"]),
            epochs=int(params["epochs"]),
            include_transformer=bool(params["include_transformer"]),
            ensemble_method=params["ensemble_method"],
        )
        _set(job_id, stage="serialising")
        payload = serialise_result(result, data_source=data_source)
        _set(job_id, status="done", stage="done", result=payload,
             raw=result, finished_at=time.time())
    except Exception as exc:  # noqa: BLE001 — surface any failure to the client
        _set(job_id, status="error", stage="error", error=str(exc),
             finished_at=time.time())


def run_refresh_job(job_id: str, source_job_id: str, df: pd.DataFrame,
                    params: dict, data_source: str) -> None:
    """Re-run inference with already-trained models — the Refresh Forecast path."""
    from core.prediction import rerun_prediction_inference

    _set(job_id, status="running", stage="inference", started_at=time.time())
    try:
        previous = get_raw(source_job_id)
        if previous is None:
            raise ValueError("The trained models for that run are no longer available. Train again.")

        result = rerun_prediction_inference(
            df,
            ticker=params["ticker"],
            trained_models=previous["trained_models"],
            model_metrics=previous["model_metrics"],
            steps=int(params["steps"]),
            ensemble_method=params["ensemble_method"],
            warnings=previous.get("warnings"),
        )
        payload = serialise_result(result, data_source=data_source)
        _set(job_id, status="done", stage="done", result=payload,
             raw=result, finished_at=time.time())
    except Exception as exc:  # noqa: BLE001
        _set(job_id, status="error", stage="error", error=str(exc),
             finished_at=time.time())
