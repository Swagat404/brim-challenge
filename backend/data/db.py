"""
SQLite helpers for the Brim expense platform.

Critical design decisions:
- check_same_thread=False: SQLite default blocks cross-thread use; we need this
  for FastAPI's async thread pool.
- One connection per request (via get_conn context manager), not a shared singleton,
  to avoid SQLITE_BUSY under concurrent writes.
- All queries use parameterized placeholders — never f-string SQL.
- amount_cad is the canonical spend field (USD converted at stored rate).
  Transaction codes 108/137/375/401/404 are bank/admin operations, excluded
  from spend analysis via is_operational=1 filter.
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import date
from typing import Any, Generator

import pandas as pd


def _db_path() -> str:
    # 1) Explicit DB_PATH env var wins (use absolute paths in production).
    explicit = os.environ.get("DB_PATH")
    if explicit:
        return os.path.abspath(explicit)

    # 2) Walk a small set of likely locations so the same code works in:
    #    - local dev (DB at project root, run from backend/)
    #    - Docker / Railway with backend/ as the deploy root
    #    - tests pointing at a temp DB
    here = os.path.dirname(__file__)
    candidates = [
        os.path.join(here, "..", "..", "brim_expenses.db"),  # project root (local dev)
        os.path.join(here, "..", "brim_expenses.db"),        # backend/ (containerized)
    ]
    for c in candidates:
        abs_c = os.path.abspath(c)
        if os.path.exists(abs_c):
            return abs_c
    # 3) Fall back to the project-root expectation so first-run errors are
    #    obvious instead of silently writing a new empty DB somewhere weird.
    return os.path.abspath(candidates[0])


@contextmanager
def get_conn() -> Generator[sqlite3.Connection, None, None]:
    """Yield a fresh connection. Commits on clean exit, rolls back on error."""
    conn = sqlite3.connect(_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def query_df(sql: str, params: tuple = ()) -> pd.DataFrame:
    """Run a SELECT and return a DataFrame. Read-only — no commit needed."""
    with sqlite3.connect(_db_path(), check_same_thread=False) as conn:
        return pd.read_sql_query(sql, conn, params=params)


def execute(sql: str, params: tuple = ()) -> int:
    """Run an INSERT/UPDATE/DELETE. Returns rowcount."""
    with get_conn() as conn:
        cur = conn.execute(sql, params)
        return cur.rowcount


def executemany(sql: str, rows: list[tuple]) -> int:
    """Bulk INSERT/UPDATE. Returns rowcount."""
    with get_conn() as conn:
        cur = conn.executemany(sql, rows)
        return cur.rowcount


# ── Convenience query helpers ─────────────────────────────────────────────────

def get_employees() -> list[dict]:
    df = query_df("SELECT * FROM employees ORDER BY department, name")
    return df.to_dict("records")


def get_employee(employee_id: str) -> dict | None:
    df = query_df("SELECT * FROM employees WHERE id = ?", (employee_id,))
    if df.empty:
        return None
    return df.iloc[0].to_dict()


def get_transactions(
    employee_id: str | None = None,
    department: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    operational_only: bool = True,
    limit: int = 500,
) -> pd.DataFrame:
    """
    Flexible transaction fetch with common filters.
    All amounts returned as amount_cad (normalized currency).
    """
    clauses = []
    params: list[Any] = []

    if operational_only:
        clauses.append("is_operational = 1")
    if employee_id:
        clauses.append("employee_id = ?")
        params.append(employee_id)
    if department:
        clauses.append("department = ?")
        params.append(department)
    if start_date:
        clauses.append("transaction_date >= ?")
        params.append(start_date)
    if end_date:
        clauses.append("transaction_date <= ?")
        params.append(end_date)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
        SELECT
            rowid,
            transaction_code,
            transaction_date,
            merchant_info_dba_name  AS merchant,
            merchant_category_code  AS mcc,
            merchant_city,
            merchant_state_province AS state,
            merchant_country        AS country,
            transaction_amount,
            amount_cad,
            debit_or_credit,
            employee_id,
            employee_name,
            department,
            role,
            is_operational
        FROM transactions
        {where}
        ORDER BY transaction_date DESC
        LIMIT ?
    """
    params.append(limit)
    return query_df(sql, tuple(params))


def find_split_candidates(threshold: float = 500.0) -> pd.DataFrame:
    """
    Detect potential split transactions: same employee + merchant + date where
    individual amounts are each below threshold but combined >= threshold.
    This is the classic expense-splitting trick to duck approval gates.
    Fleet MCCs (fuel, permits, washes, towing) are excluded — repeat charges there are normal.
    """
    # Fleet MCC codes — legitimate to have multiple charges same day (fuel, permits, washes, etc.)
    fleet_mcc_list = ",".join(str(m) for m in (
        5541, 5542, 9399, 5532, 7538, 7542, 7549, 5046, 5085
    ))
    sql = f"""
        WITH grouped AS (
            SELECT
                employee_id,
                employee_name,
                merchant_info_dba_name AS merchant,
                transaction_date,
                COUNT(*)               AS txn_count,
                SUM(amount_cad)        AS total_cad,
                GROUP_CONCAT(rowid)    AS rowids,
                GROUP_CONCAT(ROUND(amount_cad, 2)) AS amounts
            FROM transactions
            WHERE is_operational = 1
              AND debit_or_credit = 'Debit'
              AND (merchant_category_code IS NULL
                   OR CAST(merchant_category_code AS INTEGER) NOT IN ({fleet_mcc_list}))
            GROUP BY employee_id, merchant_info_dba_name, transaction_date
            HAVING COUNT(*) > 1
               AND MAX(amount_cad) < ?
               AND SUM(amount_cad) >= ?
        )
        SELECT * FROM grouped ORDER BY total_cad DESC
    """
    return query_df(sql, (threshold, threshold))


def get_monthly_spend(
    department: str | None = None,
    mcc: int | None = None,
) -> pd.DataFrame:
    """Monthly spend totals, optionally filtered by dept or MCC."""
    clauses = ["is_operational = 1", "debit_or_credit = 'Debit'"]
    params: list[Any] = []
    if department:
        clauses.append("department = ?")
        params.append(department)
    if mcc:
        clauses.append("CAST(merchant_category_code AS INTEGER) = ?")
        params.append(mcc)
    where = "WHERE " + " AND ".join(clauses)
    sql = f"""
        SELECT
            strftime('%Y-%m', transaction_date) AS month,
            ROUND(SUM(amount_cad), 2)           AS total_cad,
            COUNT(*)                            AS txn_count
        FROM transactions
        {where}
        GROUP BY month
        ORDER BY month
    """
    return query_df(sql, tuple(params))


def get_employee_spend_summary() -> pd.DataFrame:
    """Per-employee spend totals with budget remaining."""
    sql = """
        SELECT
            e.id,
            e.name,
            e.department,
            e.role,
            e.monthly_budget,
            ROUND(SUM(t.amount_cad), 2)  AS total_spend,
            COUNT(*)                     AS txn_count
        FROM employees e
        LEFT JOIN transactions t
            ON e.id = t.employee_id
            AND t.is_operational = 1
            AND t.debit_or_credit = 'Debit'
        GROUP BY e.id
        ORDER BY total_spend DESC
    """
    return query_df(sql)
