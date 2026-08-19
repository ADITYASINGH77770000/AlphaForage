"""
api/auth.py
──────────────────────────────────────────────────────────────────────────────
Account + session store for the AlphaForge portal.

Passwords are bcrypt-hashed and session tokens are random opaque strings stored
only as SHA-256 digests, so reading the database does not let you impersonate
anyone.

TWO BACKENDS, ONE INTERFACE
  DATABASE_URL set   → PostgreSQL  (deployment; survives restarts)
  DATABASE_URL unset → SQLite      (local dev; zero configuration)

WHY THIS MATTERS WHEN DEPLOYING
  A database is still a file, and hosts with an ephemeral filesystem — Render's
  free tier, most serverless platforms — wipe that file on every restart,
  deploy and cold start. SQLite does not change that. Accounts only persist if
  you either

    • point DATABASE_URL at a managed Postgres (free tier available, and the
      only option that also works with more than one API instance), or
    • mount a persistent disk and set AUTH_DB_PATH=/var/data/alphaforge.db

  Local development needs neither: it falls back to SQLite at AUTH_DB_PATH,
  default data/auth/alphaforge.db.

MIGRATION
  Accounts in the legacy JSON store are imported automatically the first time
  this module runs against an empty database. The JSON files are left in place
  as a backup and are never written again.

SCOPE — read this before deploying anywhere public:
  • there is no email verification, no password reset, no HTTPS enforcement
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import bcrypt

ROOT = Path(__file__).resolve().parents[1]
AUTH_DIR = ROOT / "data" / "auth"

# Legacy JSON store — read once for migration, never written again.
USERS_FILE = AUTH_DIR / "users.json"
SESSIONS_FILE = AUTH_DIR / "sessions.json"

DB_PATH = Path(os.getenv("AUTH_DB_PATH") or (AUTH_DIR / "alphaforge.db"))

# Managed providers hand out both spellings of the scheme; psycopg accepts the
# modern one, so normalise the legacy "postgres://" form on the way through.
DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
USING_POSTGRES = DATABASE_URL.startswith(("postgres://", "postgresql://"))
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

# Placeholder style differs between drivers. Every statement below is written
# with {p} and passed through _q(), so one query string serves both engines.
_PH = "%s" if USING_POSTGRES else "?"

SESSION_TTL = 60 * 60 * 24 * 14          # 14 days
BCRYPT_ROUNDS = 12
MAX_FAILED = 8                            # per email, before a cool-off
COOLOFF_SECONDS = 15 * 60

_LOCK = threading.RLock()
_FAILED: dict[str, list[float]] = {}
_INIT_DONE = False

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


# ── storage ──────────────────────────────────────────────────────────────────

def backend() -> str:
    """Which store is live. Surfaced by stats(), and useful in deploy logs."""
    return "postgres" if USING_POSTGRES else "sqlite"


def _q(sql: str) -> str:
    """Bind the engine's placeholder style into a {p}-templated statement."""
    return sql.format(p=_PH)


@contextmanager
def _connect():
    """A fresh connection per operation — safest under uvicorn's threadpool."""
    if USING_POSTGRES:
        import psycopg          # imported lazily: local dev never needs it

        conn = psycopg.connect(DATABASE_URL)
    else:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")  # concurrent readers
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def _run(conn, sql: str, args: tuple = ()):
    """Execute and return a cursor, whichever driver is underneath."""
    cur = conn.cursor()
    cur.execute(_q(sql), args)
    return cur


def _one(conn, sql: str, args: tuple = ()) -> dict | None:
    """Fetch a single row as a plain dict, so callers never see driver types."""
    cur = _run(conn, sql, args)
    row = cur.fetchone()
    if row is None:
        return None
    cols = [d[0] for d in cur.description]
    return dict(zip(cols, row))


def _init() -> None:
    """Create the schema, then migrate any legacy JSON store exactly once."""
    global _INIT_DONE
    if _INIT_DONE:
        return
    with _LOCK:
        if _INIT_DONE:
            return
        # REAL is SQLite's float; Postgres spells the same thing DOUBLE PRECISION.
        num = "DOUBLE PRECISION" if USING_POSTGRES else "REAL"
        with _connect() as conn:
            for stmt in (
                f"""CREATE TABLE IF NOT EXISTS users (
                        id            TEXT PRIMARY KEY,
                        email         TEXT NOT NULL UNIQUE,
                        name          TEXT NOT NULL,
                        password_hash TEXT NOT NULL,
                        created_at    {num} NOT NULL,
                        onboarded     INTEGER NOT NULL DEFAULT 0,
                        last_login    {num}
                    )""",
                f"""CREATE TABLE IF NOT EXISTS sessions (
                        token_digest TEXT PRIMARY KEY,
                        user_id      TEXT NOT NULL,
                        created_at   {num} NOT NULL,
                        expires_at   {num} NOT NULL
                    )""",
                "CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)",
            ):
                conn.cursor().execute(stmt)
        _migrate_json()
        _INIT_DONE = True


def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _insert_ignore(table: str, cols: str, n: int) -> str:
    """"Insert unless it is already there" — spelled differently per engine."""
    vals = ", ".join(["{p}"] * n)
    if USING_POSTGRES:
        return f"INSERT INTO {table} ({cols}) VALUES ({vals}) ON CONFLICT DO NOTHING"
    return f"INSERT OR IGNORE INTO {table} ({cols}) VALUES ({vals})"


def _migrate_json() -> None:
    """Import the pre-database JSON store. No-op once any user exists."""
    with _connect() as conn:
        if _one(conn, "SELECT COUNT(*) AS n FROM users")["n"]:
            return

        users = _read_json(USERS_FILE)
        if not users:
            return

        user_sql = _insert_ignore(
            "users",
            "id, email, name, password_hash, created_at, onboarded, last_login", 7)
        for u in users.values():
            try:
                _run(conn, user_sql, (
                    u["id"], normalise_email(u["email"]), u.get("name", ""),
                    u["password_hash"], float(u.get("created_at") or time.time()),
                    1 if u.get("onboarded") else 0, u.get("last_login"),
                ))
            except (KeyError, ValueError, TypeError):
                continue  # skip one malformed row rather than lose the import

        session_sql = _insert_ignore(
            "sessions", "token_digest, user_id, created_at, expires_at", 4)
        now = time.time()
        for digest, rec in _read_json(SESSIONS_FILE).items():
            try:
                if float(rec.get("expires_at", 0)) <= now:
                    continue            # don't import already-dead sessions
                _run(conn, session_sql, (
                    digest, rec["user_id"], float(rec.get("created_at") or now),
                    float(rec["expires_at"]),
                ))
            except (KeyError, ValueError, TypeError):
                continue


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


def public_user(u: Any) -> dict:
    """The shape the frontend sees — never includes the hash."""
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "created_at": u["created_at"],
        "onboarded": bool(u["onboarded"]),
        "last_login": u["last_login"],
    }


# ── accounts ─────────────────────────────────────────────────────────────────

def create_user(email: str, password: str, name: str) -> tuple[dict | None, str | None]:
    err = validate_signup(email, password, name)
    if err:
        return None, err

    _init()
    email = normalise_email(email)
    pw_hash = bcrypt.hashpw(password.encode("utf-8"),
                            bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")
    row = {
        "id": secrets.token_hex(8),
        "email": email,
        "name": name.strip(),
        "password_hash": pw_hash,
        "created_at": time.time(),
        # New accounts have not seen the guided tour yet — this is what makes
        # the assistant run itself once and never again.
        "onboarded": 0,
        "last_login": None,
    }
    try:
        with _connect() as conn:
            _run(conn,
                 "INSERT INTO users"
                 " (id, email, name, password_hash, created_at, onboarded, last_login)"
                 " VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p})",
                 (row["id"], row["email"], row["name"], row["password_hash"],
                  row["created_at"], row["onboarded"], row["last_login"]))
    except Exception as e:                  # IntegrityError in either driver
        text = str(e).lower()
        if "unique" in text or "duplicate" in text:
            # The UNIQUE index on email is what makes concurrent signups safe.
            return None, "An account with that email already exists."
        raise
    return public_user(row), None


def verify_credentials(email: str, password: str) -> tuple[dict | None, str | None]:
    _init()
    email = normalise_email(email)
    if _rate_limited(email):
        return None, "Too many failed attempts. Try again in a few minutes."

    with _connect() as conn:
        user = _one(conn, "SELECT * FROM users WHERE email = {p}", (email,))

    # Same message either way so the endpoint can't be used to enumerate emails.
    generic = "Email or password is incorrect."
    if not user:
        _record_failure(email)
        return None, generic
    try:
        ok = bcrypt.checkpw(password.encode("utf-8"),
                            user["password_hash"].encode("utf-8"))
    except (ValueError, KeyError):
        ok = False
    if not ok:
        _record_failure(email)
        return None, generic

    _FAILED.pop(email, None)
    now = time.time()
    with _connect() as conn:
        _run(conn, "UPDATE users SET last_login = {p} WHERE id = {p}", (now, user["id"]))
        user = _one(conn, "SELECT * FROM users WHERE id = {p}", (user["id"],))
    return public_user(user), None


def mark_onboarded(user_id: str) -> bool:
    """Called once the guided tour finishes — the account never auto-tours again."""
    _init()
    with _connect() as conn:
        return _run(conn, "UPDATE users SET onboarded = 1 WHERE id = {p}",
                    (user_id,)).rowcount > 0


# ── sessions ─────────────────────────────────────────────────────────────────

def create_session(user_id: str) -> str:
    _init()
    token = secrets.token_urlsafe(32)
    now = time.time()
    with _connect() as conn:
        _run(conn, "DELETE FROM sessions WHERE expires_at <= {p}", (now,))
        _run(conn,
             "INSERT INTO sessions (token_digest, user_id, created_at, expires_at)"
             " VALUES ({p}, {p}, {p}, {p})",
             (_digest(token), user_id, now, now + SESSION_TTL))
    return token


def user_for_token(token: str | None) -> dict | None:
    if not token:
        return None
    _init()
    with _connect() as conn:
        row = _one(
            conn,
            "SELECT u.id, u.email, u.name, u.created_at, u.onboarded, u.last_login"
            " FROM sessions s JOIN users u ON u.id = s.user_id"
            " WHERE s.token_digest = {p} AND s.expires_at > {p}",
            (_digest(token), time.time()),
        )
    return public_user(row) if row else None


def revoke_session(token: str | None) -> bool:
    if not token:
        return False
    _init()
    with _connect() as conn:
        return _run(conn, "DELETE FROM sessions WHERE token_digest = {p}",
                    (_digest(token),)).rowcount > 0


def stats() -> dict[str, Any]:
    _init()
    with _connect() as conn:
        users = _one(conn, "SELECT COUNT(*) AS n FROM users")["n"]
        sessions = _one(conn, "SELECT COUNT(*) AS n FROM sessions"
                              " WHERE expires_at > {p}", (time.time(),))["n"]
    return {"backend": backend(), "users": users, "sessions": sessions}
