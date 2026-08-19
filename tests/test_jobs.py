"""
Tests for the generic background-job runner in api/jobs.py.

The runner exists so slow endpoints never hold an HTTP connection open. The
behaviour that matters is: a job is pollable the instant it is created, a
failure is reported rather than lost, and the table does not grow without bound.
"""

import time

import pytest

import api.jobs as jobs


@pytest.fixture(autouse=True)
def clean_registry():
    """Each test starts from an empty job table."""
    with jobs._LOCK:
        jobs._JOBS.clear()
    yield
    with jobs._LOCK:
        jobs._JOBS.clear()


def _wait_for(job_id, status, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = jobs.get(job_id)
        if job and job["status"] == status:
            return job
        time.sleep(0.02)
    return jobs.get(job_id)


def test_created_job_is_immediately_pollable():
    """The whole point: the client gets an id back before the work is done."""
    job_id = jobs.create("demo", {"ticker": "AAPL"})
    job = jobs.get(job_id)
    assert job["status"] == "queued"
    assert job["params"] == {"ticker": "AAPL"}
    assert job["result"] is None


def test_successful_run_carries_its_result():
    job_id = jobs.start("demo", lambda: {"answer": 42})
    job = _wait_for(job_id, "done")
    assert job["status"] == "done"
    assert job["result"] == {"answer": 42}
    assert job["error"] is None
    assert job["elapsed_seconds"] is not None


def test_failure_is_recorded_not_swallowed():
    """A job that dies must still be pollable, or the client waits forever."""
    def boom():
        raise ValueError("optimiser did not converge")

    job_id = jobs.start("demo", boom)
    job = _wait_for(job_id, "error")
    assert job["status"] == "error"
    assert "optimiser did not converge" in job["error"]
    assert job["result"] is None


def test_traceback_is_not_shipped_to_the_client():
    def boom():
        raise RuntimeError("internal detail")

    job_id = jobs.start("demo", boom)
    _wait_for(job_id, "error")
    assert "traceback" not in jobs.get(job_id)
    # …but it is retained server-side for logs.
    with jobs._LOCK:
        assert "traceback" in jobs._JOBS[job_id]


def test_unknown_job_id_returns_none():
    assert jobs.get("does-not-exist") is None


def test_delete_removes_a_job():
    job_id = jobs.create("demo")
    assert jobs.delete(job_id) is True
    assert jobs.get(job_id) is None
    assert jobs.delete(job_id) is False


def test_listing_omits_results_and_is_newest_first():
    first = jobs.start("demo", lambda: {"big": "payload"})
    _wait_for(first, "done")
    time.sleep(0.01)
    second = jobs.create("demo")

    listed = jobs.list_jobs()
    assert [j["id"] for j in listed][:2] == [second, first]
    assert all("result" not in j for j in listed), "listing must stay small"


def test_finished_jobs_are_pruned_once_the_table_is_full():
    for _ in range(jobs._MAX_JOBS + 5):
        job_id = jobs.start("demo", lambda: {"ok": True})
        _wait_for(job_id, "done")
    assert len(jobs.list_jobs()) <= jobs._MAX_JOBS + 1


def test_concurrent_jobs_do_not_collide():
    ids = [jobs.start("demo", (lambda n=n: {"n": n})) for n in range(6)]
    results = []
    for job_id in ids:
        job = _wait_for(job_id, "done")
        results.append(job["result"]["n"])
    assert sorted(results) == list(range(6))
    assert len(set(ids)) == 6, "job ids must be unique"
