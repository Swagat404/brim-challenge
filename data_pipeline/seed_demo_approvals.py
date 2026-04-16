"""
Seed narrative-driven demo approvals and expense reports.

Why this exists:
The default approvals are just "transactions over the $50 pre-auth threshold" —
big ugly numbers (MICHELIN $51K) with no AI recommendation. That makes the
Approvals page feel like a cockpit instead of an AI assistant.

This script wipes pending approvals and replaces them with hand-crafted requests
that mirror the Brim challenge use cases (Sarah's conference, Marcus's fleet
work, Fiona's solo dinner, etc.). Each request gets:
  - A real transaction_rowid from the DB so context (history, dept budget,
    violations) loads naturally on the detail page.
  - A pre-populated ai_recommendation + ai_reasoning so the card has voice.

It also seeds 3 storyline expense reports (Olivia's San Diego trip,
Sarah's exec-ed quarter, Tobias' Q1 maintenance run).

Run:
    cd backend && python ../data_pipeline/seed_demo_approvals.py
"""
from __future__ import annotations

import os
import sqlite3
import sys
from datetime import datetime, timedelta

# Resolve DB path the same way backend/data/db.py does
ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(ROOT, "..", "brim_expenses.db"))


# ── Approvals ────────────────────────────────────────────────────────────────
# Each entry references a real transaction in the DB. We pick the rowid by
# matching (employee_id, merchant, amount, date) so this is robust to reseeds.
#
# decision must be lowercase "approve" | "deny" | "review" — the frontend
# AIRecommendationCard uses substring matching on those words.

APPROVALS_DEMO: list[dict] = [
    {
        "lookup": ("E042", "SAAS CONNECT 2026", 1972.0),
        "decision": "approve",
        "reasoning": (
            "Approve. Within Sales Q1 development budget ($3,400 remaining). "
            "Olivia attended one prior conference this year (within the 2/year "
            "guideline). Vendor and amount match the pre-approved trade-show "
            "calendar. No policy issues."
        ),
        "days_ago": 6,
    },
    {
        "lookup": ("E036", "ROTMAN EXEC ED", 1250.0),
        "decision": "approve",
        "reasoning": (
            "Approve. Executive professional development is reimbursable under "
            "the Management discretionary budget ($10,000/mo). Sarah is 38% "
            "into her monthly spend. Aligns with leadership-development plan."
        ),
        "days_ago": 4,
    },
    {
        "lookup": ("E044", "HARBOUR 60", 445.0),
        "decision": "review",
        "reasoning": (
            "Review. $445 fine-dining charge at Harbour 60 has no attendee "
            "list or business purpose attached. Policy requires guest names + "
            "purpose for entertainment over $200. Fiona has 3 prior unflagged "
            "high-meal charges this quarter — request documentation before "
            "reimbursing."
        ),
        "days_ago": 3,
    },
    {
        "lookup": ("E028", "MICHELIN CANADA", 51182.84),
        "decision": "approve",
        "reasoning": (
            "Approve with CFO sign-off. Bulk Michelin order is part of the "
            "Q2 fleet tire-replacement plan filed by Sandra (Parts Manager). "
            "Vendor verified, MCC 5532 (Tires) is fleet-exempt, and unit "
            "pricing matches the 2025 annual contract. Recommend routing to "
            "Victor Chen (CFO) for signature."
        ),
        "days_ago": 12,
    },
    {
        "lookup": ("E028", "MICHELIN CANADA", 28638.71),
        "decision": "approve",
        "reasoning": (
            "Approve. Second tranche of the Q2 Michelin order, same vendor "
            "and contract as the $51,182 charge from 4 days earlier. Total "
            "stays within the $90K Q2 tire-replacement allocation."
        ),
        "days_ago": 8,
    },
    {
        "lookup": ("E001", "FLYING J #784", 1450.0),
        "decision": "approve",
        "reasoning": (
            "Approve. Single fuel + DEF refill at Flying J during a long-haul "
            "run — MCC 5541 (Fuel) is fleet-exempt from the $50 pre-auth gate. "
            "Marcus averages $1,200/wk on fuel; this fill is consistent."
        ),
        "days_ago": 2,
    },
    {
        "lookup": ("E025", "SNAP-ON TOOLS", 895.0),
        "decision": "approve",
        "reasoning": (
            "Approve. Senior Mechanic role explicitly authorizes shop-tool "
            "purchases. Tobias is 12% into his $6,000 monthly Maintenance "
            "budget. No similar charges in the past 30 days — not duplicative."
        ),
        "days_ago": 5,
    },
    {
        "lookup": ("E042", "EXHIBITOR SOURCE", 799.5),
        "decision": "approve",
        "reasoning": (
            "Approve. Booth backdrop + collateral for the SaaS Connect trade "
            "show on Olivia's calendar. Within the pre-approved event budget. "
            "Receipt attached, vendor verified."
        ),
        "days_ago": 7,
    },
    {
        "lookup": ("E006", "SHOPPERS DRUG MART", 758.0),
        "decision": "deny",
        "reasoning": (
            "Deny + request repayment. $758 at Shoppers Drug Mart (MCC 5912) "
            "is a restricted personal-expense category — no legitimate fleet "
            "or business use. Kenji has one prior flag in the past 60 days. "
            "Auto-create a deduction line on the next pay cycle."
        ),
        "days_ago": 1,
    },
    {
        "lookup": ("E007", "SKEANS PNEUMATIC", 311.05),
        "decision": "review",
        "reasoning": (
            "Review. This $311.05 charge at Skeans Pneumatic was billed twice "
            "in 6 days for the same employee. Likely vendor duplicate. Hold "
            "the second charge and ask Sofia to confirm with the supplier "
            "before approving."
        ),
        "days_ago": 9,
    },
]


# ── Expense reports ──────────────────────────────────────────────────────────
# Each report bundles real transaction rowids by (employee_id, date_range)
# so the Reports page renders a real category breakdown + per-row list.

REPORTS_DEMO: list[dict] = [
    {
        "report_name": "Olivia Park — SaaS Connect 2026, San Diego",
        "employee_id": "E042",
        "period_start": "2026-01-15",
        "period_end": "2026-01-17",
        "summary": (
            "Three-day trip to San Diego for SaaS Connect 2026. Includes "
            "registration, 3 nights at Hilton, ground transport, and 5 "
            "client/prospect meals. All charges within Sales travel policy; "
            "guest names captured for entertainment over $100."
        ),
        "txn_filter": {
            "employee_id": "E042",
            "date_start": "2026-01-15",
            "date_end": "2026-01-17",
        },
    },
    {
        "report_name": "Sarah Whitfield — Q1 Executive Development",
        "employee_id": "E036",
        "period_start": "2026-01-01",
        "period_end": "2026-03-31",
        "summary": (
            "CEO professional development and leadership-team activities for "
            "Q1: Rotman Executive Education program, January team off-site "
            "retreat, and rental car for the off-site. Within Management "
            "discretionary budget. One $520 dinner at Miku flagged for "
            "guest-list documentation — receipts attached."
        ),
        "txn_filter": {
            "employee_id": "E036",
            "date_start": "2026-01-01",
            "date_end": "2026-03-31",
        },
    },
    {
        "report_name": "Tobias Grant — Q1 Maintenance Operations",
        "employee_id": "E025",
        "period_start": "2026-01-01",
        "period_end": "2026-03-31",
        "summary": (
            "Senior Mechanic operating expenses for Q1: tool purchases "
            "(Snap-On), parts orders, and routine fuel fills. All MCC codes "
            "fall under the fleet-operations exemption. No policy flags."
        ),
        "txn_filter": {
            "employee_id": "E025",
            "date_start": "2026-01-01",
            "date_end": "2026-03-31",
        },
    },
]


# ── Helpers ──────────────────────────────────────────────────────────────────


def _find_rowid(conn: sqlite3.Connection, emp_id: str, merchant_substr: str, amount: float) -> int | None:
    """Find the rowid of a transaction matching emp + merchant substring + amount.

    We don't require an exact merchant match because the seed data sometimes
    appends suffixes (e.g. 'FLYING J #784' vs 'FLYING J 784'). Amount within
    $0.50 is good enough.
    """
    cur = conn.execute(
        """SELECT rowid, merchant_info_dba_name, amount_cad
             FROM transactions
            WHERE employee_id = ?
              AND UPPER(merchant_info_dba_name) LIKE UPPER(?)
              AND ABS(amount_cad - ?) < 1.0
            ORDER BY ABS(amount_cad - ?) ASC
            LIMIT 1""",
        (emp_id, f"%{merchant_substr}%", amount, amount),
    )
    row = cur.fetchone()
    return row[0] if row else None


def _ensure_synthetic_txn(
    conn: sqlite3.Connection,
    emp_id: str,
    merchant: str,
    amount: float,
    days_ago: int,
    mcc: int = 5541,
) -> int:
    """Insert a synthetic transaction for approvals that don't have a real one."""
    cur = conn.execute("SELECT name, department, role FROM employees WHERE id = ?", (emp_id,))
    emp = cur.fetchone()
    if not emp:
        raise RuntimeError(f"Employee {emp_id} not found")
    name, dept, role = emp

    txn_date = (datetime.utcnow() - timedelta(days=days_ago)).strftime("%Y-%m-%d 00:00:00")
    conn.execute(
        """INSERT INTO transactions
           (transaction_code, transaction_description, transaction_date,
            posting_date_of_transaction, merchant_info_dba_name,
            transaction_amount, debit_or_credit, merchant_category_code,
            merchant_city, merchant_country, conversion_rate,
            employee_id, employee_name, department, role,
            amount_cad, is_operational)
           VALUES (?, ?, ?, ?, ?, ?, 'Debit', ?, 'Toronto', 'CA', 1.0,
                   ?, ?, ?, ?, ?, 1)""",
        (
            500, "Synthetic demo charge", txn_date, txn_date, merchant,
            amount, mcc, emp_id, name, dept, role, amount,
        ),
    )
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def seed_approvals(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    print("Wiping pending approvals…")
    cur.execute("DELETE FROM approvals WHERE status = 'pending'")

    seeded = 0
    for spec in APPROVALS_DEMO:
        emp_id, merchant, amount = spec["lookup"]
        rowid = _find_rowid(conn, emp_id, merchant, amount)
        if rowid is None:
            print(f"  · synth txn → {emp_id} / {merchant} / ${amount}")
            rowid = _ensure_synthetic_txn(conn, emp_id, merchant, amount, spec["days_ago"])

        # Get the canonical merchant name and date for the approval row
        txn = cur.execute(
            "SELECT merchant_info_dba_name, transaction_date, merchant_category_code FROM transactions WHERE rowid = ?",
            (rowid,),
        ).fetchone()
        merchant_name = txn[0]
        requested_at = (datetime.utcnow() - timedelta(days=spec["days_ago"])).isoformat()

        cur.execute(
            """INSERT INTO approvals
               (transaction_rowid, employee_id, amount, merchant, status,
                ai_recommendation, ai_reasoning, requested_at)
               VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)""",
            (rowid, emp_id, amount, merchant_name,
             spec["decision"], spec["reasoning"], requested_at),
        )
        seeded += 1
    print(f"Seeded {seeded} pending approvals with AI recommendations.")


def seed_reports(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    print("Wiping existing demo reports…")
    cur.execute("DELETE FROM expense_reports WHERE report_name LIKE '% — %'")

    for spec in REPORTS_DEMO:
        f = spec["txn_filter"]
        rows = cur.execute(
            """SELECT rowid, amount_cad
                 FROM transactions
                WHERE employee_id = ?
                  AND transaction_date >= ?
                  AND transaction_date <= ?
                  AND debit_or_credit = 'Debit'
                  AND is_operational = 1
                ORDER BY transaction_date""",
            (f["employee_id"], f["date_start"], f["date_end"]),
        ).fetchall()
        if not rows:
            print(f"  · no txns for {spec['report_name']} — skipping")
            continue

        rowids = ",".join(str(r[0]) for r in rows)
        total = round(sum(float(r[1] or 0) for r in rows), 2)

        cur.execute(
            """INSERT INTO expense_reports
               (report_name, employee_id, period_start, period_end,
                total_amount, status, created_at, transaction_ids)
               VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)""",
            (spec["report_name"], spec["employee_id"], spec["period_start"],
             spec["period_end"], total, datetime.utcnow().isoformat(), rowids),
        )
        # store summary in report_name_extra by appending? schema has no field — patch
        print(f"  + {spec['report_name']}: {len(rows)} txns, ${total:,.2f}")

    # Add a `summary` column if it doesn't exist (idempotent)
    cur.execute("PRAGMA table_info(expense_reports)")
    cols = [r[1] for r in cur.fetchall()]
    if "summary" not in cols:
        print("Adding `summary` column to expense_reports…")
        cur.execute("ALTER TABLE expense_reports ADD COLUMN summary TEXT")

    # Now backfill summaries
    for spec in REPORTS_DEMO:
        cur.execute(
            "UPDATE expense_reports SET summary = ? WHERE report_name = ?",
            (spec["summary"], spec["report_name"]),
        )


def main() -> None:
    if not os.path.exists(DB_PATH):
        print(f"DB not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    try:
        seed_approvals(conn)
        seed_reports(conn)
        conn.commit()
        print("Done.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
