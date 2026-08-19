"""
Tests for the SQLite-backed account store in api/auth.py.

Every test runs against a throwaway database: AUTH_DB_PATH is pointed at a
tmp_path and the module is reloaded so it picks the new location up at import
time. Nothing here touches data/auth/.
"""

import importlib
import json
import time

import pytest


@pytest.fixture()
def auth(tmp_path, monkeypatch):
    """A freshly-imported auth module bound to an empty temp database."""
    monkeypatch.setenv("AUTH_DB_PATH", str(tmp_path / "test.db"))
    import api.auth as auth_module
    module = importlib.reload(auth_module)
    # No legacy JSON in the temp location, so nothing migrates by default.
    monkeypatch.setattr(module, "USERS_FILE", tmp_path / "users.json")
    monkeypatch.setattr(module, "SESSIONS_FILE", tmp_path / "sessions.json")
    yield module


# ── validation ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("email,password,name,expected", [
    ("not-an-email", "longenough1", "A", "valid email"),
    ("a@b.co", "short", "A", "at least 8"),
    ("a@b.co", "longenough1", "  ", "your name"),
    ("a@b.co", "longenough1", "Aditya", None),
])
def test_validate_signup(auth, email, password, name, expected):
    err = auth.validate_signup(email, password, name)
    if expected is None:
        assert err is None
    else:
        assert err and expected in err


def test_normalise_email_lowercases_and_trims(auth):
    assert auth.normalise_email("  MiXeD@Case.COM ") == "mixed@case.com"


# ── accounts ─────────────────────────────────────────────────────────────────

def test_create_user_returns_public_shape_without_hash(auth):
    user, err = auth.create_user("a@b.co", "longenough1", "Aditya")
    assert err is None
    assert user["email"] == "a@b.co"
    assert user["onboarded"] is False
    # The hash must never cross this boundary.
    assert "password_hash" not in user


def test_duplicate_email_is_rejected(auth):
    auth.create_user("dupe@b.co", "longenough1", "First")
    user, err = auth.create_user("DUPE@b.co", "longenough1", "Second")
    assert user is None
    assert "already exists" in err


def test_password_is_hashed_not_stored_plain(auth):
    auth.create_user("hash@b.co", "supersecret1", "H")
    import sqlite3
    conn = sqlite3.connect(auth.DB_PATH)
    stored = conn.execute("SELECT password_hash FROM users").fetchone()[0]
    conn.close()
    assert "supersecret1" not in stored
    assert stored.startswith("$2")           # bcrypt marker


def test_verify_credentials_roundtrip(auth):
    auth.create_user("login@b.co", "longenough1", "L")

    bad, err = auth.verify_credentials("login@b.co", "wrongpassword")
    assert bad is None and err

    good, err = auth.verify_credentials("login@b.co", "longenough1")
    assert err is None and good["email"] == "login@b.co"
    assert good["last_login"] is not None


def test_unknown_email_and_wrong_password_give_the_same_error(auth):
    """Otherwise the endpoint becomes an email-enumeration oracle."""
    auth.create_user("known@b.co", "longenough1", "K")
    _, err_unknown = auth.verify_credentials("nobody@b.co", "longenough1")
    _, err_wrong = auth.verify_credentials("known@b.co", "notthepassword")
    assert err_unknown == err_wrong


def test_rate_limit_kicks_in_after_repeated_failures(auth):
    auth.create_user("slow@b.co", "longenough1", "S")
    for _ in range(auth.MAX_FAILED):
        auth.verify_credentials("slow@b.co", "wrongpassword")
    # Even the correct password is refused once the cool-off engages.
    user, err = auth.verify_credentials("slow@b.co", "longenough1")
    assert user is None
    assert "Too many failed attempts" in err


def test_mark_onboarded(auth):
    user, _ = auth.create_user("tour@b.co", "longenough1", "T")
    assert user["onboarded"] is False
    assert auth.mark_onboarded(user["id"]) is True
    assert auth.mark_onboarded("no-such-id") is False

    token = auth.create_session(user["id"])
    assert auth.user_for_token(token)["onboarded"] is True


# ── sessions ─────────────────────────────────────────────────────────────────

def test_session_resolves_to_its_user(auth):
    user, _ = auth.create_user("sess@b.co", "longenough1", "S")
    token = auth.create_session(user["id"])
    assert auth.user_for_token(token)["id"] == user["id"]


def test_token_is_not_stored_in_the_clear(auth):
    user, _ = auth.create_user("tok@b.co", "longenough1", "T")
    token = auth.create_session(user["id"])
    import sqlite3
    conn = sqlite3.connect(auth.DB_PATH)
    digests = [r[0] for r in conn.execute("SELECT token_digest FROM sessions")]
    conn.close()
    assert token not in digests              # only the SHA-256 digest is kept
    assert len(digests[0]) == 64


@pytest.mark.parametrize("bad", [None, "", "not-a-real-token"])
def test_bad_tokens_resolve_to_nobody(auth, bad):
    assert auth.user_for_token(bad) is None


def test_revoke_session(auth):
    user, _ = auth.create_user("bye@b.co", "longenough1", "B")
    token = auth.create_session(user["id"])
    assert auth.revoke_session(token) is True
    assert auth.user_for_token(token) is None
    assert auth.revoke_session(token) is False   # already gone


def test_expired_sessions_are_not_accepted(auth):
    user, _ = auth.create_user("old@b.co", "longenough1", "O")
    token = auth.create_session(user["id"])
    import sqlite3
    conn = sqlite3.connect(auth.DB_PATH)
    conn.execute("UPDATE sessions SET expires_at = ?", (time.time() - 1,))
    conn.commit()
    conn.close()
    assert auth.user_for_token(token) is None


# ── durability + migration ───────────────────────────────────────────────────

def test_accounts_survive_a_module_reload(auth):
    """The point of moving off in-process JSON: a restart must not lose accounts."""
    auth.create_user("persist@b.co", "longenough1", "P")
    reloaded = importlib.reload(auth)
    user, err = reloaded.verify_credentials("persist@b.co", "longenough1")
    assert err is None and user["email"] == "persist@b.co"


def test_legacy_json_store_is_migrated_once(tmp_path, monkeypatch):
    """Accounts written by the old JSON store must carry over intact."""
    import bcrypt

    monkeypatch.setenv("AUTH_DB_PATH", str(tmp_path / "migrated.db"))
    import api.auth as auth_module
    module = importlib.reload(auth_module)

    pw_hash = bcrypt.hashpw(b"legacypass1", bcrypt.gensalt(rounds=4)).decode()
    users_file = tmp_path / "users.json"
    users_file.write_text(json.dumps({
        "legacy@b.co": {
            "id": "abc123", "email": "legacy@b.co", "name": "Legacy",
            "password_hash": pw_hash, "created_at": 1700000000.0,
            "onboarded": True, "last_login": None,
        }
    }), encoding="utf-8")
    monkeypatch.setattr(module, "USERS_FILE", users_file)
    monkeypatch.setattr(module, "SESSIONS_FILE", tmp_path / "sessions.json")
    monkeypatch.setattr(module, "_INIT_DONE", False)

    stats = module.stats()
    assert stats["users"] == 1

    user, err = module.verify_credentials("legacy@b.co", "legacypass1")
    assert err is None, "the migrated bcrypt hash must still validate"
    assert user["onboarded"] is True

    # Running again must not duplicate the row.
    monkeypatch.setattr(module, "_INIT_DONE", False)
    assert module.stats()["users"] == 1


def test_stats_counts_only_live_sessions(auth):
    user, _ = auth.create_user("stat@b.co", "longenough1", "S")
    auth.create_session(user["id"])
    assert auth.stats() == {"backend": "sqlite", "users": 1, "sessions": 1}


# ── dual-backend wiring ──────────────────────────────────────────────────────

def test_defaults_to_sqlite_without_a_database_url(auth):
    assert auth.backend() == "sqlite"
    assert auth.USING_POSTGRES is False


def test_postgres_is_selected_and_its_url_normalised(tmp_path, monkeypatch):
    """DATABASE_URL flips the backend; the legacy postgres:// spelling is fixed.

    No server is contacted — this checks the wiring that decides placeholder
    style and SQL dialect, which is what breaks silently if it regresses.
    """
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pw@example.com:5432/afdb")
    monkeypatch.setenv("AUTH_DB_PATH", str(tmp_path / "unused.db"))
    import api.auth as auth_module
    module = importlib.reload(auth_module)
    try:
        assert module.USING_POSTGRES is True
        assert module.backend() == "postgres"
        # psycopg rejects the legacy scheme, so it must be rewritten.
        assert module.DATABASE_URL.startswith("postgresql://")
        assert module._PH == "%s"
        assert module._q("SELECT 1 WHERE x = {p}") == "SELECT 1 WHERE x = %s"
        assert "ON CONFLICT DO NOTHING" in module._insert_ignore("users", "id", 1)
    finally:
        monkeypatch.delenv("DATABASE_URL", raising=False)
        importlib.reload(auth_module)


def test_sqlite_dialect_details(auth):
    assert auth._PH == "?"
    assert auth._q("SELECT 1 WHERE x = {p}") == "SELECT 1 WHERE x = ?"
    assert auth._insert_ignore("users", "id", 1).startswith("INSERT OR IGNORE")
