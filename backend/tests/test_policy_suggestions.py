"""Tests for the policy_suggestions tool."""
from __future__ import annotations

import asyncio
import json
import sqlite3


def test_list_open_returns_only_open(policy_doc, tmp_db):
    conn = sqlite3.connect(str(tmp_db))
    conn.executemany(
        """INSERT INTO policy_suggestions (category, title, body, status, created_at)
           VALUES (?, ?, ?, ?, '2026-04-01')""",
        [
            ("needs_detail", "T1", "B1", "open"),
            ("conflicting", "T2", "B2", "applied"),
            ("missing_coverage", "T3", "B3", "dismissed"),
        ],
    )
    conn.commit()
    conn.close()

    from agent.tools.policy_suggestions_tool import list_open_suggestions, list_all_suggestions
    open_ones = list_open_suggestions()
    assert len(open_ones) == 1
    assert open_ones[0]["category"] == "needs_detail"

    everything = list_all_suggestions()
    assert len(everything) == 3
    # Open first per the ORDER BY
    assert everything[0]["status"] == "open"


def test_dismiss_marks_status(policy_doc, tmp_db):
    conn = sqlite3.connect(str(tmp_db))
    conn.execute(
        "INSERT INTO policy_suggestions (category, title, body, status, created_at) "
        "VALUES ('needs_detail', 'T', 'B', 'open', '2026-04-01')"
    )
    sid = conn.execute("SELECT MAX(id) FROM policy_suggestions").fetchone()[0]
    conn.commit()
    conn.close()

    from agent.tools.policy_suggestions_tool import dismiss_suggestion
    assert dismiss_suggestion(sid) is True
    # Second call returns False (already resolved)
    assert dismiss_suggestion(sid) is False

    conn = sqlite3.connect(str(tmp_db))
    status = conn.execute("SELECT status FROM policy_suggestions WHERE id = ?", (sid,)).fetchone()[0]
    conn.close()
    assert status == "dismissed"


def test_apply_with_edit_mutates_policy(policy_doc, tmp_db):
    conn = sqlite3.connect(str(tmp_db))
    edit = {"thresholds": {**policy_doc["thresholds"], "pre_auth": 100.0}}
    conn.execute(
        "INSERT INTO policy_suggestions (category, title, body, suggested_edit_json, status, created_at) "
        "VALUES ('needs_detail', 'Raise pre-auth', 'lift to $100', ?, 'open', '2026-04-01')",
        (json.dumps(edit),),
    )
    sid = conn.execute("SELECT MAX(id) FROM policy_suggestions").fetchone()[0]
    conn.commit()
    conn.close()

    from agent.tools.policy_suggestions_tool import apply_suggestion
    from data import policy_loader
    result = apply_suggestion(sid)
    assert result is not None
    assert result["status"] == "applied"

    policy_loader._structured_cache["doc"] = None
    updated = policy_loader.load_structured_policy()
    assert updated["thresholds"]["pre_auth"] == 100.0

    conn = sqlite3.connect(str(tmp_db))
    actions = [r[0] for r in conn.execute("SELECT action FROM agent_activity").fetchall()]
    conn.close()
    assert "suggestion_applied" in actions


def test_apply_without_edit_marks_applied_no_policy_change(policy_doc, tmp_db):
    conn = sqlite3.connect(str(tmp_db))
    conn.execute(
        "INSERT INTO policy_suggestions (category, title, body, status, created_at) "
        "VALUES ('needs_detail', 'No-op', 'text', 'open', '2026-04-01')"
    )
    sid = conn.execute("SELECT MAX(id) FROM policy_suggestions").fetchone()[0]
    conn.commit()
    conn.close()

    from agent.tools.policy_suggestions_tool import apply_suggestion
    res = apply_suggestion(sid)
    assert res is not None

    conn = sqlite3.connect(str(tmp_db))
    status = conn.execute("SELECT status FROM policy_suggestions WHERE id = ?", (sid,)).fetchone()[0]
    conn.close()
    assert status == "applied"


def test_generate_persists_returned_items(policy_doc, tmp_db, monkeypatch):
    """Mock the Claude call to return a known list and verify rows land."""
    from agent.tools import policy_suggestions_tool as mod

    fake_payload = json.dumps([
        {"category": "needs_detail", "title": "T1", "body": "B1"},
        {"category": "conflicting", "title": "T2", "body": "B2",
         "suggested_edit": {"thresholds": {"pre_auth": 75}}},
        # Bad item: unknown category, must be filtered
        {"category": "totally_invalid", "title": "T3", "body": "B3"},
        # Bad item: missing fields, must be filtered
        {"category": "needs_detail", "title": "", "body": "B4"},
    ])

    async def fake_call(_prompt):
        return fake_payload
    monkeypatch.setattr(mod, "_call_claude", fake_call)

    rows = asyncio.run(mod.generate_suggestions())
    assert len(rows) == 2

    conn = sqlite3.connect(str(tmp_db))
    persisted = conn.execute(
        "SELECT category, title FROM policy_suggestions ORDER BY id"
    ).fetchall()
    conn.close()
    assert persisted == [("needs_detail", "T1"), ("conflicting", "T2")]
