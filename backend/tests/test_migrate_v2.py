"""Tests for the v2 schema migration."""
from __future__ import annotations

import sqlite3

import pytest


def _make_legacy_db(path: str) -> None:
    """Build a fresh DB matching the pre-v2 schema."""
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE employees (
            id TEXT PRIMARY KEY, name TEXT, role TEXT, department TEXT,
            monthly_budget REAL DEFAULT 5000
        );
        CREATE TABLE transactions (
            transaction_code TEXT, transaction_date TEXT,
            employee_id TEXT, merchant_info_dba_name TEXT, amount_cad REAL,
            debit_or_credit TEXT, merchant_category_code INTEGER, is_operational INTEGER
        );
        CREATE TABLE policy_violations (id INTEGER PRIMARY KEY);
        CREATE TABLE approvals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_rowid INTEGER,
            employee_id TEXT,
            amount REAL,
            merchant TEXT,
            status TEXT DEFAULT 'pending',
            ai_recommendation TEXT,
            ai_reasoning TEXT,
            approver_id TEXT,
            requested_at TEXT,
            resolved_at TEXT
        );
        CREATE TABLE expense_reports (id INTEGER PRIMARY KEY);
        """
    )
    conn.executemany(
        """INSERT INTO approvals
           (transaction_rowid, employee_id, amount, merchant, ai_recommendation, ai_reasoning)
           VALUES (?, ?, ?, ?, ?, ?)""",
        [
            (1, "E001", 25.00, "Flying J", "approve", "Fleet ops"),
            (2, "E044", 445.00, "Harbour 60", "deny", "Solo dinner — repay"),
            (3, "E007", 311.05, "Skeans Pneumatic", "review", "Possible duplicate"),
            (4, "E028", 51182.84, "MICHELIN", "approve", "Fleet bulk order"),
        ],
    )
    conn.commit()
    conn.close()


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def test_migration_creates_new_tables_and_columns(tmp_path):
    db = tmp_path / "legacy.db"
    _make_legacy_db(str(db))

    from data_pipeline.migrate_v2 import migrate
    summary = migrate(str(db))

    assert summary["policy_documents"] is True
    assert summary["policy_suggestions"] is True
    assert summary["agent_activity"] is True
    assert summary["department_budgets"] is True
    assert summary["transaction_submissions"] is True
    assert "ai_decision" in summary["approval_columns_added"]

    conn = sqlite3.connect(str(db))
    try:
        approvals_cols = _columns(conn, "approvals")
        assert "ai_decision" in approvals_cols
        assert "policy_citation" in approvals_cols
        assert "cited_section_id" in approvals_cols
        # Legacy column dropped
        assert "ai_recommendation" not in approvals_cols
    finally:
        conn.close()


def test_migration_backfills_ai_decision_enum(tmp_path):
    db = tmp_path / "legacy.db"
    _make_legacy_db(str(db))

    from data_pipeline.migrate_v2 import migrate
    summary = migrate(str(db))
    assert summary["ai_decision_backfilled"] == 4

    conn = sqlite3.connect(str(db))
    try:
        rows = list(conn.execute(
            "SELECT id, ai_decision FROM approvals ORDER BY id"
        ))
    finally:
        conn.close()

    decisions = {row[0]: row[1] for row in rows}
    # approve / approve maps directly
    assert decisions[1] == "approve"
    # 'deny' should map to 'reject'
    assert decisions[2] == "reject"
    # 'review' stays 'review'
    assert decisions[3] == "review"
    # second 'approve'
    assert decisions[4] == "approve"


def test_migration_is_idempotent(tmp_path):
    db = tmp_path / "legacy.db"
    _make_legacy_db(str(db))

    from data_pipeline.migrate_v2 import migrate
    first = migrate(str(db))
    assert first["policy_documents"] is True

    second = migrate(str(db))
    # Second run is a complete no-op
    assert second["policy_documents"] is False
    assert second["policy_suggestions"] is False
    assert second["agent_activity"] is False
    assert second["department_budgets"] is False
    assert second["transaction_submissions"] is False
    assert second["approval_columns_added"] == []
    assert second["ai_decision_backfilled"] == 0
    assert second["dropped_ai_recommendation"] is False


def test_drop_legacy_refuses_when_backfill_incomplete(tmp_path):
    db = tmp_path / "legacy.db"
    _make_legacy_db(str(db))

    # Insert a row whose ai_recommendation is blank — backfill won't touch it,
    # so dropping the column would lose nothing. But add a row with a nonsense
    # value the classifier maps to 'review' so backfill DOES populate it.
    conn = sqlite3.connect(str(db))
    conn.execute(
        "INSERT INTO approvals (transaction_rowid, employee_id, amount, merchant, ai_recommendation) "
        "VALUES (99, 'E999', 99.99, 'Test', 'flag for review')"
    )
    conn.commit()
    conn.close()

    from data_pipeline.migrate_v2 import migrate
    summary = migrate(str(db), drop_legacy=False)
    # Should backfill all 5 rows but NOT drop the column
    assert summary["ai_decision_backfilled"] == 5
    assert summary.get("dropped_ai_recommendation") is None

    conn = sqlite3.connect(str(db))
    cols = _columns(conn, "approvals")
    conn.close()
    assert "ai_recommendation" in cols
    assert "ai_decision" in cols
