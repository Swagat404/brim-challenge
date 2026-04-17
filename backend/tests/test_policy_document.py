"""Tests for the structured policy document load/save roundtrip."""
from __future__ import annotations

import json
import sqlite3


def test_load_structured_policy_returns_seeded_doc(policy_doc, tmp_db):
    from data import policy_loader
    loaded = policy_loader.load_structured_policy()
    assert loaded is not None
    assert loaded["name"] == "Test Policy"
    assert len(loaded["sections"]) == 1
    assert loaded["auto_approval_rules"]["enabled"] is True


def test_load_structured_policy_returns_none_when_absent(tmp_db):
    from data import policy_loader
    policy_loader._structured_cache["doc"] = None
    assert policy_loader.load_structured_policy() is None


def test_save_structured_policy_round_trips(policy_doc, tmp_db):
    from data import policy_loader

    current = policy_loader.load_structured_policy()
    current["thresholds"]["pre_auth"] = 75.0
    current["sections"].append({
        "id": "remote_work", "title": "Remote Work",
        "body": "Home office stipend up to $75/mo.", "hidden_notes": [],
    })
    new_id = policy_loader.save_structured_policy(current, updated_by="test")
    assert new_id > 0

    # Re-read from DB (clear cache first)
    policy_loader._structured_cache["doc"] = None
    reloaded = policy_loader.load_structured_policy()
    assert reloaded["thresholds"]["pre_auth"] == 75.0
    assert any(s["id"] == "remote_work" for s in reloaded["sections"])

    # Only one current row at a time
    conn = sqlite3.connect(str(tmp_db))
    count = conn.execute(
        "SELECT COUNT(*) FROM policy_documents WHERE is_current = 1"
    ).fetchone()[0]
    conn.close()
    assert count == 1


def test_save_preserves_hidden_notes(policy_doc, tmp_db):
    from data import policy_loader

    doc = policy_loader.load_structured_policy()
    doc["sections"][0]["hidden_notes"] = [
        {"id": "hn_test", "body": "Sales may expense alcohol.", "applies_to": {"department": "Sales"}}
    ]
    policy_loader.save_structured_policy(doc, updated_by="test")
    policy_loader._structured_cache["doc"] = None

    reloaded = policy_loader.load_structured_policy()
    notes = reloaded["sections"][0]["hidden_notes"]
    assert len(notes) == 1
    assert notes[0]["id"] == "hn_test"
    assert notes[0]["applies_to"] == {"department": "Sales"}


def test_invalid_json_in_db_returns_none(tmp_db):
    from data import policy_loader
    conn = sqlite3.connect(str(tmp_db))
    conn.execute(
        "INSERT INTO policy_documents (content_json, is_current, updated_at) "
        "VALUES ('not valid json', 1, '2026-01-01')"
    )
    conn.commit()
    conn.close()
    policy_loader._structured_cache["doc"] = None
    assert policy_loader.load_structured_policy() is None
