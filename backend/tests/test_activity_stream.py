"""Tests for the activity stream service."""
from __future__ import annotations

import sqlite3


def test_emit_writes_row(tmp_db):
    from services import activity
    aid = activity.emit("policy_edit", "Test edit", actor="admin",
                        metadata={"fields": ["thresholds"]})
    assert aid > 0

    conn = sqlite3.connect(str(tmp_db))
    row = conn.execute(
        "SELECT actor, action, message, metadata_json FROM agent_activity"
    ).fetchone()
    conn.close()
    assert row[0] == "admin"
    assert row[1] == "policy_edit"
    assert row[2] == "Test edit"
    assert "thresholds" in row[3]


def test_emit_drops_invalid_action(tmp_db):
    from services import activity
    aid = activity.emit("totally_made_up", "should not write")  # type: ignore[arg-type]
    assert aid == 0

    conn = sqlite3.connect(str(tmp_db))
    count = conn.execute("SELECT COUNT(*) FROM agent_activity").fetchone()[0]
    conn.close()
    assert count == 0


def test_recent_filters_by_transaction(tmp_db):
    from services import activity
    activity.emit("recommended", "txn 1 rec", transaction_rowid=1)
    activity.emit("recommended", "txn 2 rec", transaction_rowid=2)
    activity.emit("recommended", "txn 1 again", transaction_rowid=1)

    rows = activity.recent(transaction_rowid=1)
    assert len(rows) == 2
    assert all(r["transaction_rowid"] == 1 for r in rows)


def test_recent_parses_metadata(tmp_db):
    from services import activity
    activity.emit("budget_edited", "Sales cap set", metadata={"department": "Sales", "monthly_cap": 80000})
    rows = activity.recent()
    assert rows[0]["metadata"] == {"department": "Sales", "monthly_cap": 80000}


def test_rollup_sums_auto_approved(tmp_db):
    from services import activity
    # Create matching approvals so the JOIN finds amounts
    conn = sqlite3.connect(str(tmp_db))
    conn.executemany(
        "INSERT INTO approvals (transaction_rowid, employee_id, amount, merchant, status) "
        "VALUES (?, ?, ?, ?, 'approved')",
        [(1, "E001", 100.0, "M1"), (2, "E001", 250.0, "M2"), (3, "E001", 50.0, "M3")],
    )
    aids = [r[0] for r in conn.execute("SELECT id FROM approvals ORDER BY id").fetchall()]
    conn.commit()
    conn.close()

    activity.emit("auto_approved", "ok", transaction_rowid=1, approval_id=aids[0])
    activity.emit("auto_approved", "ok", transaction_rowid=2, approval_id=aids[1])
    activity.emit("auto_approved", "ok", transaction_rowid=3, approval_id=aids[2])
    activity.emit("recommended", "ignore me", transaction_rowid=1, approval_id=aids[0])

    rollup = activity.rollup(window_days=90)
    assert rollup["count"] == 3
    assert rollup["total_amount"] == 400.0


def test_rollup_empty(tmp_db):
    from services import activity
    rollup = activity.rollup()
    assert rollup["count"] == 0
    assert rollup["total_amount"] == 0.0
    assert rollup["last_at"] is None
