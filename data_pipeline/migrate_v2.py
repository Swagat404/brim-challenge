"""
Schema migration v2 — Sift Policy Agent.

Idempotent: safe to run multiple times. Each step checks state before mutating.

Adds:
  - policy_documents          single-row holder for the structured JSON policy
  - policy_suggestions        proactive AI-generated suggestions
  - agent_activity            unified audit/activity stream
  - department_budgets        per-department monthly spend caps
  - transaction_submissions   employee-submitted memo / attendees / receipt / GL

Modifies `approvals`:
  - adds ai_decision (enum: approve|review|reject), policy_citation, cited_section_id
  - backfills ai_decision from existing free-text ai_recommendation (deny -> reject)
  - drops the old ai_recommendation column

Run:
    python data_pipeline/migrate_v2.py
"""
from __future__ import annotations

import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(ROOT, "..", "brim_expenses.db"))


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?", (table,)
    )
    return cur.fetchone() is not None


# ── Step functions ──────────────────────────────────────────────────────────


def create_policy_documents(conn: sqlite3.Connection) -> bool:
    if _table_exists(conn, "policy_documents"):
        return False
    conn.executescript(
        """
        CREATE TABLE policy_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_json TEXT NOT NULL,
            is_current INTEGER NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT
        );
        CREATE UNIQUE INDEX idx_policy_documents_current
            ON policy_documents(is_current) WHERE is_current = 1;
        """
    )
    return True


def create_policy_suggestions(conn: sqlite3.Connection) -> bool:
    if _table_exists(conn, "policy_suggestions"):
        return False
    conn.executescript(
        """
        CREATE TABLE policy_suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL CHECK (category IN (
                'needs_detail','conflicting','unintended_manual','missing_coverage'
            )),
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            suggested_edit_json TEXT,
            status TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','applied','dismissed')),
            created_at TEXT NOT NULL
        );
        CREATE INDEX idx_policy_suggestions_status ON policy_suggestions(status);
        """
    )
    return True


def create_agent_activity(conn: sqlite3.Connection) -> bool:
    if _table_exists(conn, "agent_activity"):
        return False
    conn.executescript(
        """
        CREATE TABLE agent_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            occurred_at TEXT NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN (
                'recommended','auto_approved','flagged',
                'human_decision','policy_edit','suggestion_applied',
                'policy_uploaded','budget_edited',
                'receipt_uploaded','submission_updated'
            )),
            transaction_rowid INTEGER,
            approval_id INTEGER,
            message TEXT NOT NULL,
            metadata_json TEXT
        );
        CREATE INDEX idx_activity_txn ON agent_activity(transaction_rowid);
        CREATE INDEX idx_activity_time ON agent_activity(occurred_at DESC);
        CREATE INDEX idx_activity_action ON agent_activity(action);
        """
    )
    return True


def create_department_budgets(conn: sqlite3.Connection) -> bool:
    if _table_exists(conn, "department_budgets"):
        return False
    conn.execute(
        """
        CREATE TABLE department_budgets (
            department TEXT PRIMARY KEY,
            monthly_cap REAL NOT NULL,
            updated_at TEXT NOT NULL,
            updated_by TEXT
        )
        """
    )
    return True


def create_transaction_submissions(conn: sqlite3.Connection) -> bool:
    if _table_exists(conn, "transaction_submissions"):
        return False
    conn.execute(
        """
        CREATE TABLE transaction_submissions (
            transaction_rowid INTEGER PRIMARY KEY,
            receipt_url TEXT,
            receipt_ocr_text TEXT,
            memo TEXT,
            business_purpose TEXT,
            attendees_json TEXT,
            gl_code TEXT,
            submitted_at TEXT NOT NULL,
            submitted_by TEXT
        )
        """
    )
    return True


def add_approval_columns(conn: sqlite3.Connection) -> list[str]:
    """Add ai_decision, policy_citation, cited_section_id to approvals.

    SQLite cannot enforce CHECK on ALTER ADD COLUMN, so we validate at write time.
    """
    cols = _columns(conn, "approvals")
    added: list[str] = []
    if "ai_decision" not in cols:
        conn.execute("ALTER TABLE approvals ADD COLUMN ai_decision TEXT")
        added.append("ai_decision")
    if "policy_citation" not in cols:
        conn.execute("ALTER TABLE approvals ADD COLUMN policy_citation TEXT")
        added.append("policy_citation")
    if "cited_section_id" not in cols:
        conn.execute("ALTER TABLE approvals ADD COLUMN cited_section_id TEXT")
        added.append("cited_section_id")
    return added


def backfill_ai_decision(conn: sqlite3.Connection) -> int:
    """Map existing free-text ai_recommendation to the new enum.

    Mapping: 'approve|accept' -> approve, 'deny|reject|repay' -> reject,
    everything else with content -> review.
    """
    cols = _columns(conn, "approvals")
    if "ai_recommendation" not in cols or "ai_decision" not in cols:
        return 0  # nothing to backfill

    cur = conn.execute(
        """
        SELECT id, ai_recommendation FROM approvals
         WHERE ai_recommendation IS NOT NULL
           AND ai_recommendation != ''
           AND (ai_decision IS NULL OR ai_decision = '')
        """
    )
    rows = cur.fetchall()
    updated = 0
    for approval_id, rec in rows:
        decision = _classify(rec)
        conn.execute(
            "UPDATE approvals SET ai_decision = ? WHERE id = ?",
            (decision, approval_id),
        )
        updated += 1
    return updated


def _classify(rec: str) -> str:
    r = rec.lower()
    if "approve" in r or "accept" in r:
        return "approve"
    if "deny" in r or "reject" in r or "repay" in r:
        return "reject"
    return "review"


def drop_old_ai_recommendation(conn: sqlite3.Connection) -> bool:
    """Drop the legacy free-text column. Requires SQLite >= 3.35."""
    cols = _columns(conn, "approvals")
    if "ai_recommendation" not in cols:
        return False
    # Sanity: don't drop if backfill left rows untouched
    leftover = conn.execute(
        """SELECT COUNT(*) FROM approvals
            WHERE ai_recommendation IS NOT NULL AND ai_recommendation != ''
              AND (ai_decision IS NULL OR ai_decision = '')"""
    ).fetchone()[0]
    if leftover:
        raise RuntimeError(
            f"{leftover} rows have ai_recommendation but no ai_decision; backfill first"
        )
    conn.execute("ALTER TABLE approvals DROP COLUMN ai_recommendation")
    return True


# ── Driver ──────────────────────────────────────────────────────────────────


def migrate(db_path: str = DB_PATH, *, drop_legacy: bool = True) -> dict:
    """Run all idempotent migration steps. Returns a summary dict."""
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"DB not found at {db_path}")

    conn = sqlite3.connect(db_path)
    try:
        # Make CHECK constraints actually enforced for new tables
        conn.execute("PRAGMA foreign_keys = ON")

        summary = {
            "policy_documents": create_policy_documents(conn),
            "policy_suggestions": create_policy_suggestions(conn),
            "agent_activity": create_agent_activity(conn),
            "department_budgets": create_department_budgets(conn),
            "transaction_submissions": create_transaction_submissions(conn),
            "approval_columns_added": add_approval_columns(conn),
            "ai_decision_backfilled": backfill_ai_decision(conn),
        }
        if drop_legacy:
            summary["dropped_ai_recommendation"] = drop_old_ai_recommendation(conn)
        conn.commit()
        return summary
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main() -> None:
    try:
        summary = migrate()
    except Exception as exc:
        print(f"Migration failed: {exc}", file=sys.stderr)
        sys.exit(1)

    print("Migration complete:")
    for key, val in summary.items():
        print(f"  {key}: {val}")


if __name__ == "__main__":
    main()
