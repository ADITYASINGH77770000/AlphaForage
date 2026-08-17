"""
api/auth.py
──────────────────────────────────────────────────────────────────────────────
Account + session store for the AlphaForge portal.

Deliberately small and dependency-light: users and sessions live in JSON files
under data/auth/, passwords are bcrypt-hashed, and session tokens are random
opaque strings stored only as SHA-256 digests — so reading the session file
does not let you impersonate anyone.

SCOPE — read this before deploying anywhere public:
  • fine for a local/self-hosted research portal
  • there is no email verification, no password reset, no HTTPS enforcement
  • the JSON store is process-local; it does not scale past one API instance
Swap in a real database and an identity provider before putting this on the
open internet.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import threading
import time
from pathlib import Path
from typing import Any

import bcrypt

ROOT = Path(__file__).resolve().parents[1]
AUTH_DIR = ROOT / "data" / "auth"
USERS_FILE = AUTH_DIR / "users.json"
SESSIONS_FILE = AUTH_DIR / "sessions.json"

SESSION_TTL = 60 * 60 * 24 * 14          # 14 days
BCRYPT_ROUNDS = 12
MAX_FAILED = 8                            # per email, before a cool-off
COOLOFF_SECONDS = 15 * 60

_LOCK = threading.RLock()
_FAILED: dict[str, list[float]] = {}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


# ── storage ──────────────────────────────────────────────────────────────────

def _read(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _write(path: Path, data: dict) -> None:
    """Atomic write — a crash mid-save must not corrupt the store."""
    AUTH_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def _users() -> dict:
    return _read(USERS_FILE)


def _sessions() -> dict:
    return _read(SESSIONS_FILE)


# ── helpers ──────────────────────────────────────────────────────────────────

def normalise_email(email: str) -> str:
    return (email or "").strip().lower()


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def validate_signup(email: str, password: str, name: str) -> str | None:
    """Return an error message, or None when the input is acceptable."""
    if not EMAIL_RE.match(normalise_email(email)):
        return "Enter a valid email address."
    if len(password or "") < 8:
        return "Password must be at least 8 characters."
    if len((password or "").strip()) == 0:
        return "Password cannot be blank."
    if not (name or "").strip():
        return "Enter your name."
    return None


def _rate_limited(email: str) -> bool:
    now = time.time()
    hits = [t for t in _FAILED.get(email, []) if now - t < COOLOFF_SECONDS]
    _FAILED[email] = hits
    return len(hits) >= MAX_FAILED


def _record_failure(email: str) -> None:
    _FAILED.setdefault(email, []).append(time.time())


def public_user(u: dict) -> dict:
    """The shape the frontend sees — never includes the hash."""
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "created_at": u["created_at"],
        "onboarded": bool(u.get("onboarded", False)),
        "last_login": u.get("last_login"),
    }


# ── accounts ─────────────────────────────────────────────────────────────────

def create_user(email: str, password: str, name: str) -> tuple[dict | None, str | None]:
    err = validate_signup(email, password, name)
    if err:
        return None, err

    email = normalise_email(email)
    with _LOCK:
        users = _users()
        if email in users:
            return None, "An account with that email already exists."

        pw_hash = bcrypt.hashpw(password.encode("utf-8"),
                                bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")
        user = {
            "id": secrets.token_hex(8),
            "email": email,
            "name": name.strip(),
            "password_hash": pw_hash,
            "created_at": time.time(),
            # New accounts have not seen the guided tour yet — this is what makes
            # the assistant run itself once and never again.
            "onboarded": False,
            "last_login": None,
        }
        users[email] = user
        _write(USERS_FILE, users)
        return public_user(user), None


def verify_credentials(email: str, password: str) -> tuple[dict | None, str | None]:
    email = normalise_email(email)
    if _rate_limited(email):
        return None, "Too many failed attempts. Try again in a few minutes."

    with _LOCK:
        user = _users().get(email)

    # Same message either way so the endpoint can't be used to enumerate emails.
    generic = "Email or password is incorrect."
    if not user:
        _record_failure(email)
        return None, generic
    try:
        ok = bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8"))
    except (ValueError, KeyError):
        ok = False
    if not ok:
        _record_failure(email)
        return None, generic

    _FAILED.pop(email, None)
    with _LOCK:
        users = _users()
        users[email]["last_login"] = time.time()
        _write(USERS_FILE, users)
        user = users[email]
    return public_user(user), None


def mark_onboarded(user_id: str) -> bool:
    """Called once the guided tour finishes — the account never auto-tours again."""
    with _LOCK:
        users = _users()
        for email, u in users.items():
            if u["id"] == user_id:
                users[email]["onboarded"] = True
                _write(USERS_FILE, users)
                return True
    return False


# ── sessions ─────────────────────────────────────────────────────────────────

def _prune_locked(sessions: dict) -> dict:
    now = time.time()
    return {k: v for k, v in sessions.items() if v.get("expires_at", 0) > now}


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    with _LOCK:
        sessions = _prune_locked(_sessions())
        sessions[_digest(token)] = {
            "user_id": user_id,
            "created_at": time.time(),
            "expires_at": time.time() + SESSION_TTL,
        }
        _write(SESSIONS_FILE, sessions)
    return token


def user_for_token(token: str | None) -> dict | None:
    if not token:
        return None
    with _LOCK:
        sessions = _sessions()
        rec = sessions.get(_digest(token))
        if not rec or rec.get("expires_at", 0) <= time.time():
            return None
        users = _users()
    for u in users.values():
        if u["id"] == rec["user_id"]:
            return public_user(u)
    return None


def revoke_session(token: str | None) -> bool:
    if not token:
        return False
    with _LOCK:
        sessions = _sessions()
        removed = sessions.pop(_digest(token), None) is not None
        if removed:
            _write(SESSIONS_FILE, sessions)
    return removed


def stats() -> dict[str, Any]:
    with _LOCK:
        return {"users": len(_users()), "sessions": len(_prune_locked(_sessions()))}
