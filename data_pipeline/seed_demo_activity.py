"""
Seed `auto_approved` activity rows by running the REAL auto-approval workflow
over historical transactions.

This is the only way the dashboard's "971 transactions auto-approved by Sift"
banner shows truthful numbers. Same code path as the live recommend flow:
both call services.auto_approval.find_matching_rule and write the same
activity row shape.

For each historical transaction with no existing approval:
  - Run find_matching_rule against the live policy.auto_approval_rules
  - If a rule matches: insert an approvals row with status='approved' +
    ai_decision='approve', and emit one `auto_approved` activity row.
  - If no rule matches: skip — those would need a Claude recommendation
    which we don't run at backfill time (too expensive, also not the point
    of the rollup banner).

Idempotent: skips transactions that already have an approval. Pass --reset
to wipe ALL `auto_approved` rows + their approvals first.

Usage:
    cd "<repo>"
    python data_pipeline/seed_demo_activity.py
    python data_pipeline/seed_demo_activity.py --reset
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(ROOT, "..", "brim_expenses.db"))

sys.path.insert(0, os.path.abspath(os.path.join(ROOT, "..", "backend")))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true",
                        help="Wipe existing auto_approved approvals + activity first")
    parser.add_argument("--limit", type=int, default=2000,
                        help="Max historical transactions to scan")
    args = parser.parse_args()

    if not os.path.exists(DB_PATH):
        print(f"DB not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    from data import policy_loader
    from services import auto_approval

    structured = policy_loader.load_structured_policy()
    if not structured:
        print("No structured policy bootstrapped — run bootstrap_policy_doc.py first.", file=sys.stderr)
        sys.exit(2)

    auto_cfg = structured.get("auto_approval_rules", {})
    if not auto_cfg.get("enabled"):
        print("Auto-approval is disabled in policy.auto_approval_rules.")
        sys.exit(0)

    conn = sqlite3.connect(DB_PATH)
    try:
        if args.reset:
            print("Resetting prior auto-approved seed data…")
            # Delete activity rows + the approvals they pointed at
            conn.execute(
                """DELETE FROM approvals WHERE id IN (
                   SELECT approval_id FROM agent_activity
                    WHERE action = 'auto_approved' AND approval_id IS NOT NULL)"""
            )
            conn.execute("DELETE FROM agent_activity WHERE action = 'auto_approved'")

        # Pull historical transactions that don't have an approval yet
        cur = conn.execute(
            f"""SELECT t.rowid, t.amount_cad, t.merchant_category_code,
                       t.merchant_info_dba_name, t.employee_id, t.transaction_date,
                       e.role
                  FROM transactions t
             LEFT JOIN employees e ON e.id = t.employee_id
                 WHERE t.is_operational = 1
                   AND t.debit_or_credit = 'Debit'
                   AND t.rowid NOT IN (
                         SELECT transaction_rowid FROM approvals
                          WHERE transaction_rowid IS NOT NULL)
              ORDER BY t.transaction_date DESC
                 LIMIT {args.limit}"""
        )
        rows = cur.fetchall()
        print(f"Scanning {len(rows)} historical transactions…")

        matched = 0
        for rowid, amount, mcc_raw, merchant, emp_id, txn_date, role in rows:
            amount = float(amount or 0)
            mcc = int(mcc_raw) if mcc_raw is not None else None
            rule = auto_approval.find_matching_rule(
                amount=amount, mcc=mcc, role=role,
                auto_approval_config=auto_cfg,
            )
            if rule is None:
                continue

            citation = rule.get("rationale") or f"Auto-approval rule '{rule.get('id')}'"
            reasoning = (
                f"Auto-approved under rule '{rule.get('id')}': {citation}"
            )
            now_iso = _txn_iso(txn_date)

            cur2 = conn.execute(
                """INSERT INTO approvals
                   (transaction_rowid, employee_id, amount, merchant, status,
                    ai_decision, ai_reasoning, policy_citation, cited_section_id,
                    approver_id, requested_at, resolved_at)
                   VALUES (?, ?, ?, ?, 'approved',
                           'approve', ?, ?, ?, 'agent', ?, ?)""",
                (rowid, emp_id, amount, merchant,
                 reasoning, citation, f"auto:{rule.get('id')}",
                 now_iso, now_iso),
            )
            approval_id = cur2.lastrowid

            conn.execute(
                """INSERT INTO agent_activity
                   (occurred_at, actor, action, transaction_rowid, approval_id,
                    message, metadata_json)
                   VALUES (?, 'agent', 'auto_approved', ?, ?, ?, ?)""",
                (now_iso, rowid, approval_id,
                 f"Auto-approved via rule '{rule.get('id')}'",
                 json.dumps({"rule_id": rule.get("id"), "amount": amount})),
            )
            matched += 1

        conn.commit()
        print(f"Auto-approved {matched} historical transactions.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _txn_iso(raw: str | None) -> str:
    """Use the txn date if available; fall back to now. Always ISO."""
    if not raw:
        return datetime.utcnow().isoformat()
    try:
        # Common format: "2026-01-15 00:00:00"
        return datetime.strptime(raw[:19], "%Y-%m-%d %H:%M:%S").isoformat()
    except ValueError:
        return datetime.utcnow().isoformat()


if __name__ == "__main__":
    main()
