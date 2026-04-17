"""
Shared pytest fixtures.

Uses a temp-file SQLite DB so tests are fully isolated from brim_expenses.db.
Strategy: patch data.db._db_path to return a temp file path.
"""
from __future__ import annotations

import sqlite3
import os
import sys

import pytest

# Make `data_pipeline` importable from tests
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)


@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    """
    Create a temp SQLite DB with the project schema, patch data.db._db_path
    to point at it, and yield the path. Tests insert their own seed data.
    """
    db_file = tmp_path / "test.db"

    # Build schema
    conn = sqlite3.connect(str(db_file))
    _create_schema(conn)
    conn.close()

    # Redirect data.db to the temp file
    import data.db as db_module
    monkeypatch.setattr(db_module, "_db_path", lambda: str(db_file))

    yield db_file


def _create_schema(conn: sqlite3.Connection) -> None:
    """Build the post-migrate_v2 schema for tests.

    Tests that exercise the migration run it on their own temp DB; this
    function gives every other test a clean, fully-migrated schema directly
    so they don't have to wait for the migration step.
    """
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY,
            name TEXT,
            role TEXT,
            department TEXT,
            monthly_budget REAL DEFAULT 5000
        );

        CREATE TABLE IF NOT EXISTS transactions (
            transaction_code TEXT,
            transaction_date TEXT,
            employee_id TEXT,
            employee_name TEXT,
            merchant_info_dba_name TEXT,
            amount_cad REAL,
            debit_or_credit TEXT DEFAULT 'Debit',
            merchant_category_code INTEGER,
            mcc INTEGER,
            is_operational INTEGER DEFAULT 1,
            merchant TEXT,
            merchant_city TEXT,
            merchant_state_province TEXT,
            merchant_country TEXT,
            transaction_amount REAL,
            department TEXT,
            role TEXT
        );

        CREATE TABLE IF NOT EXISTS policy_violations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id TEXT,
            violation_type TEXT,
            severity TEXT,
            description TEXT,
            amount REAL,
            detected_at TEXT
        );

        CREATE TABLE IF NOT EXISTS approvals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_rowid INTEGER,
            employee_id TEXT,
            amount REAL,
            merchant TEXT,
            status TEXT DEFAULT 'pending',
            ai_decision TEXT,
            ai_reasoning TEXT,
            policy_citation TEXT,
            cited_section_id TEXT,
            approver_id TEXT,
            requested_at TEXT,
            resolved_at TEXT
        );

        CREATE TABLE IF NOT EXISTS expense_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_name TEXT,
            employee_id TEXT,
            period_start TEXT,
            period_end TEXT,
            total_amount REAL,
            status TEXT DEFAULT 'draft',
            created_at TEXT,
            transaction_ids TEXT,
            summary TEXT
        );

        CREATE TABLE IF NOT EXISTS policy_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_json TEXT NOT NULL,
            is_current INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT
        );

        CREATE TABLE IF NOT EXISTS policy_suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            suggested_edit_json TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            occurred_at TEXT NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            transaction_rowid INTEGER,
            approval_id INTEGER,
            message TEXT NOT NULL,
            metadata_json TEXT
        );

        CREATE TABLE IF NOT EXISTS department_budgets (
            department TEXT PRIMARY KEY,
            monthly_cap REAL NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT
        );

        CREATE TABLE IF NOT EXISTS transaction_submissions (
            transaction_rowid INTEGER PRIMARY KEY,
            receipt_url TEXT,
            receipt_ocr_text TEXT,
            memo TEXT,
            business_purpose TEXT,
            attendees_json TEXT,
            gl_code TEXT,
            submitted_at TEXT NOT NULL,
            submitted_by TEXT
        );
    """)
    conn.commit()


def seed_transactions(db_path: str, rows: list[tuple]) -> None:
    """Helper: INSERT multiple transactions into a temp DB."""
    conn = sqlite3.connect(db_path)
    conn.executemany(
        """INSERT INTO transactions
           (transaction_date, employee_id, employee_name, merchant_info_dba_name,
            amount_cad, debit_or_credit, merchant_category_code, mcc, is_operational,
            department, role)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        rows,
    )
    conn.commit()
    conn.close()


# ── Sift policy fixture ─────────────────────────────────────────────────────


import json as _json


@pytest.fixture
def policy_doc(tmp_db):
    """Insert a minimal but realistic structured policy as the current doc."""
    doc = {
        "name": "Test Policy",
        "effective_date": "2026-01-01",
        "thresholds": {
            "pre_auth": 50.0, "receipt_required": 50.0,
            "tip_meal_max_pct": 20.0, "tip_service_max_pct": 15.0,
        },
        "restrictions": {
            "mcc_blocked": [7993, 7995],
            "mcc_fleet_exempt": [5541, 5542, 5532, 7538, 7542, 7549, 9399],
        },
        "approval_thresholds_by_role": {"Long-Haul Driver": 2000.0},
        "auto_approval_rules": {
            "enabled": True,
            "rules": [
                {"id": "fleet_small", "max_amount": 500.0,
                 "mcc_in": [5541, 5542, 5532, 7538, 7542, 7549, 9399],
                 "rationale": "Fleet ops under $500 auto-approve"},
            ],
        },
        "submission_requirements": [
            {"id": "meals_high",
             "applies_when": {"mcc_in": [5812, 5813], "amount_over": 200},
             "require": ["receipt", "attendees", "business_purpose"],
             "rationale": "Meals over $200 require attendee list and purpose"},
        ],
        "sections": [
            {"id": "general", "title": "General", "body": "All expenses must be business-related.",
             "hidden_notes": []},
        ],
    }
    conn = sqlite3.connect(str(tmp_db))
    conn.execute(
        """INSERT INTO policy_documents (content_json, is_current, updated_at, updated_by)
           VALUES (?, 1, '2026-01-01T00:00:00', 'test')""",
        (_json.dumps(doc),),
    )
    conn.commit()
    conn.close()

    # The structured-policy loader caches in-process; clear it so each test
    # sees the freshly-seeded doc.
    from data import policy_loader
    policy_loader._structured_cache["doc"] = None
    return doc
