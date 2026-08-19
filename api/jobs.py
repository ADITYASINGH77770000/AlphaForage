"""
api/jobs.py
──────────────────────────────────────────────────────────────────────────────
A small generic background-job runner for endpoints whose work outlives an HTTP
request.

Why this exists: `/api/portfolio/full` takes ~5s on a development machine and
~75s on a free-tier cloud instance. A request that long is at the mercy of every
proxy between the browser and the engine, and it gives the user no feedback
while it runs. Submitting a job and polling for it keeps every single request
fast, whatever the hardware underneath.

`api/prediction_jobs.py` does the same thing for the Prediction Studio, but it
is welded to model training — it holds trained Keras/Torch models per job so a
forecast can be refreshed without retraining. This module is the plain version:
run a callable, keep its result, hand it over when asked.

Jobs live in process memory. A restart clears them, which is fine — the client
treats a missing job as "just run it again".
"""

from __future__ import annotations

import threading
import time
import traceback
import uuid
from typing import Any, Callable

_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()

# Results here are plain JSON-ready dicts rather than models, so this can be
# generous compared with the Prediction Studio's cap.
_MAX_JOBS = 32


def _prune_locked() -> None:
    """Drop the oldest finished jobs once the table is full."""
    if len(_JOBS) <= _MAX_JOBS:
        return
    finished = sorted(
        ((jid, j) for jid, j in _JOBS.items() if j["status"] in ("done", "error")),
        key=lambda kv: kv[1]["created_at"],
    )
    for jid, _ in finished[: len(_JOBS) - _MAX_JOBS]:
        _JOBS.pop(jid, None)


def create(kind: str, params: dict | None = None) -> str:
    """Register a queued job and return its id."""
    job_id = uuid.uuid4().hex[:12]
    with _LOCK:
        _prune_locked()
        _JOBS[job_id] = {
            "id": job_id,
            "kind": kind,
            "status": "queued",
            "stage": "queued",
            "params": params or {},
            "created_at": time.time(),
            "elapsed_seconds": None,
            "error": None,
            "result": None,
        }
    return job_id


def _set(job_id: str, **fields) -> None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is not None:
            job.update(fields)


def run(job_id: str, fn: Callable[[], Any], stage: str = "working") -> None:
    """Execute fn() and record its outcome against job_id.

    Intended as a thread target. Any exception is captured onto the job rather
    than killing the thread silently — a job that fails must still be pollable,
    otherwise the client waits forever on something that is already dead.
    """
    started = time.time()
    _set(job_id, status="running", stage=stage)
    try:
        result = fn()
        _set(job_id, status="done", stage="done", result=result,
             elapsed_seconds=round(time.time() - started, 2))
    except Exception as e:                       # noqa: BLE001 — reported, not swallowed
        _set(job_id, status="error", stage="failed",
             error=str(e) or e.__class__.__name__,
             traceback=traceback.format_exc(limit=6),
             elapsed_seconds=round(time.time() - started, 2))


def start(kind: str, fn: Callable[[], Any], params: dict | None = None) -> str:
    """create() + launch the worker thread. Returns the job id to poll."""
    job_id = create(kind, params)
    threading.Thread(target=run, args=(job_id, fn), daemon=True).start()
    return job_id


def get(job_id: str) -> dict | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is None:
            return None
        # Copy so a caller serialising this can't race the worker thread.
        out = dict(job)
    out.pop("traceback", None)      # kept server-side for logs, not shipped out
    return out


def list_jobs() -> list[dict]:
    with _LOCK:
        jobs = [
            {k: v for k, v in j.items() if k not in ("result", "traceback")}
            for j in _JOBS.values()
        ]
    return sorted(jobs, key=lambda j: j["created_at"], reverse=True)


def delete(job_id: str) -> bool:
    with _LOCK:
        return _JOBS.pop(job_id, None) is not None
