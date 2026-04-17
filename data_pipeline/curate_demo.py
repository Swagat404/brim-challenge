"""
Curate demo data for a clean, story-driven Sift demo.

The raw seed gives ~95 violations and ~10 pending approvals. That's noisy and
the dashboard looks like a forest fire. This script trims down to a tight,
realistic-feeling slice:

- 5 pending approvals — each one a distinct policy story (clear approve,
  fleet routine, missing-fields review, conference review-then-approve,
  personal-expense reject).
- 15 violations across ~5 employees — enough to show pattern clustering
  ("top offenders") without overwhelming the viewer.
- After trimming, every kept approval gets its AI recommendation re-run so
  the cited reasoning matches the actual submission state (no more
  "Approval recommended" alongside "Receipt needed" badges).

The auto-approval activity rows are NOT touched — those are a real workflow
artifact and the rollup numbers should reflect actual auto-approvals.

Run:
    python data_pipeline/curate_demo.py
"""
from __future__ import annotations

import asyncio
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(ROOT, "..", "brim_expenses.db"))

sys.path.insert(0, os.path.abspath(os.path.join(ROOT, "..", "backend")))


# Curated pending approvals — each is identified by (employee_id, merchant
# substring, amount within $1). Only these survive after curation; everything
# else pending is removed.
KEEP_APPROVALS = [
    ("E001", "FLYING J", 1450.00),       # Marcus Rivera — fleet, approve
    ("E036", "ROTMAN EXEC", 1250.00),    # Sarah Whitfield — exec dev, approve
    ("E042", "SAAS CONNECT", 1972.00),   # Olivia Park — conference, review-or-approve
    ("E044", "HARBOUR 60", 445.00),      # Fiona Walsh — meal missing fields, review
    ("E006", "SHOPPERS DRUG", 758.00),   # Kenji Watanabe — personal expense, reject
]


# Violation curation: keep at most this many per employee (top by amount).
# Caps total visible violations at ~15-20 across the named offenders below.
TOP_OFFENDERS = {
    "E044": 4,  # Fiona Walsh — meals/alcohol
    "E036": 3,  # Sarah Whitfield — exec discretionary
    "E001": 3,  # Marcus Rivera — splits
    "E042": 2,  # Olivia Park — meal context
    "E006": 1,  # Kenji Watanabe — personal expense
    "E041": 2,  # Brandon Leitch — sales entertainment
}


def trim_pending_approvals(conn: sqlite3.Connection) -> tuple[int, int]:
    """Remove pending approvals not in KEEP_APPROVALS. Returns (kept, removed)."""
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT id, employee_id, merchant, amount FROM approvals WHERE status = 'pending'"
    ).fetchall()

    keep_ids: set[int] = set()
    for app_id, emp_id, merchant, amount in rows:
        merchant_upper = (merchant or "").upper()
        for k_emp, k_substr, k_amount in KEEP_APPROVALS:
            if (
                emp_id == k_emp
                and k_substr.upper() in merchant_upper
                and abs(float(amount or 0) - k_amount) < 1.0
            ):
                keep_ids.add(app_id)
                break

    to_drop = [r[0] for r in rows if r[0] not in keep_ids]
    if to_drop:
        placeholders = ",".join("?" for _ in to_drop)
        cur.execute(f"DELETE FROM approvals WHERE id IN ({placeholders})", to_drop)
    return len(keep_ids), len(to_drop)


def trim_violations(conn: sqlite3.Connection) -> tuple[int, int]:
    """Keep at most N violations per top offender (top N by amount).
    Drop everything for employees not in TOP_OFFENDERS."""
    cur = conn.cursor()
    before = cur.execute("SELECT COUNT(*) FROM policy_violations").fetchone()[0]

    keep_ids: set[int] = set()
    for emp_id, max_n in TOP_OFFENDERS.items():
        ids = [
            r[0]
            for r in cur.execute(
                """SELECT id FROM policy_violations
                    WHERE employee_id = ?
                    ORDER BY amount DESC
                    LIMIT ?""",
                (emp_id, max_n),
            ).fetchall()
        ]
        keep_ids.update(ids)

    if keep_ids:
        placeholders = ",".join("?" for _ in keep_ids)
        cur.execute(
            f"DELETE FROM policy_violations WHERE id NOT IN ({placeholders})",
            list(keep_ids),
        )
    else:
        cur.execute("DELETE FROM policy_violations")

    after = cur.execute("SELECT COUNT(*) FROM policy_violations").fetchone()[0]
    return after, before - after


async def rerun_recommendations(conn: sqlite3.Connection) -> int:
    """Re-run the AI recommendation for every kept pending approval so the
    decision matches the current submission state."""
    from agent.tools.approval_tool import recommend_for_transaction
    from data import db as data_db

    pending = conn.execute(
        "SELECT id, transaction_rowid, employee_id FROM approvals WHERE status = 'pending'"
    ).fetchall()

    rerun = 0
    for approval_id, txn_rowid, emp_id in pending:
        if txn_rowid is None:
            continue
        txn_df = data_db.query_df(
            """SELECT rowid, *,
                      merchant_info_dba_name AS merchant
                 FROM transactions WHERE rowid = ?""",
            (int(txn_rowid),),
        )
        if txn_df.empty:
            continue
        txn = txn_df.iloc[0].to_dict()
        emp = data_db.get_employee(str(emp_id))
        try:
            result = await recommend_for_transaction(
                txn=txn, employee=emp, approval_id=int(approval_id), actor="agent"
            )
            print(f"  · approval {approval_id} ({emp.get('name') if emp else emp_id}, "
                  f"{txn.get('merchant')}): {result['decision']}")
            rerun += 1
        except Exception as exc:
            print(f"  · approval {approval_id}: rerun failed ({exc})", file=sys.stderr)
    return rerun


def patch_blocked_mccs(conn: sqlite3.Connection) -> None:
    """Make sure pharmacies + groceries + gambling are in mcc_blocked.

    The Brim PDF prohibits personal expenses on the corporate card but the
    Claude-extracted policy starts with an empty mcc_blocked list. Adding the
    obvious offenders here means the AI can confidently reject the SHOPPERS
    DRUG MART personal-expense demo case.
    """
    from data import policy_loader

    doc = policy_loader.load_structured_policy()
    if doc is None:
        return
    blocked = set(doc.get("restrictions", {}).get("mcc_blocked", []) or [])
    for mcc in (5912, 5411, 7993, 7995):  # pharmacy, grocery, arcade, gambling
        blocked.add(mcc)
    doc.setdefault("restrictions", {})["mcc_blocked"] = sorted(blocked)
    policy_loader.save_structured_policy(doc, updated_by="curate_demo")
    print(f"Policy mcc_blocked: {sorted(blocked)}")


def main() -> None:
    if not os.path.exists(DB_PATH):
        print(f"DB not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    try:
        patch_blocked_mccs(conn)

        kept, removed = trim_pending_approvals(conn)
        print(f"Approvals: kept {kept}, removed {removed}")

        kept_v, removed_v = trim_violations(conn)
        print(f"Violations: kept {kept_v}, removed {removed_v}")

        conn.commit()

        print("Re-running AI recommendation on kept approvals so decisions "
              "match current submission state…")
        rerun = asyncio.run(rerun_recommendations(conn))
        print(f"Re-ran {rerun} recommendations.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
