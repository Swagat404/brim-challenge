"""
Shared pytest fixtures.

Uses a temp-file SQLite DB so tests are fully isolated from brim_expenses.db.
Strategy: patch data.db._db_path to return a temp file path.
"""
from __future__ import annotations

import sqlite3
import os

import pytest


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
            ai_recommendation TEXT,
            ai_reasoning TEXT,
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
            transaction_ids TEXT
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
