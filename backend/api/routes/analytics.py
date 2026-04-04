"""
Analytics routes — lightweight aggregate queries for dashboard widgets.

GET /api/analytics/department-spend — spend by department
GET /api/analytics/agent-stats     — overview stats for dashboard
"""
from __future__ import annotations

from fastapi import APIRouter

from data import db

router = APIRouter()


@router.get("/analytics/department-spend")
async def department_spend():
    """Total spend and transaction count per department (excludes bank payments)."""
    df = db.query_df(
        """SELECT e.department,
                  SUM(t.amount_cad) as total_spend,
                  COUNT(*) as txn_count
           FROM transactions t
           JOIN employees e ON t.employee_id = e.id
           WHERE t.transaction_code != 108
           GROUP BY e.department
           ORDER BY total_spend DESC"""
    )
    return {
        "departments": df.to_dict("records") if not df.empty else [],
    }


@router.get("/analytics/agent-stats")
async def agent_stats():
    """Overview stats for dashboard: total spend, txn counts, violation/approval summaries."""
    totals = db.query_df(
        """SELECT COUNT(*) as total_txns,
                  SUM(CASE WHEN debit_or_credit='Debit' AND transaction_code != 108 THEN amount_cad ELSE 0 END) as total_spend,
                  COUNT(DISTINCT employee_id) as employee_count
           FROM transactions"""
    )
    violation_count = db.query_df("SELECT COUNT(*) as cnt FROM policy_violations")
    pending_approvals = db.query_df(
        "SELECT COUNT(*) as cnt FROM approvals WHERE status = 'pending'"
    )
    draft_reports = db.query_df(
        "SELECT COUNT(*) as cnt FROM expense_reports WHERE status = 'draft'"
    )

    t = totals.iloc[0] if not totals.empty else {}
    total_txns = int(t.get("total_txns", 0))
    v_count = int(violation_count.iloc[0]["cnt"]) if not violation_count.empty else 0
    in_policy = max(0, total_txns - v_count)

    return {
        "total_transactions": total_txns,
        "total_spend": float(t.get("total_spend", 0)),
        "employee_count": int(t.get("employee_count", 0)),
        "in_policy_count": in_policy,
        "violation_count": v_count,
        "pending_approvals": int(pending_approvals.iloc[0]["cnt"]) if not pending_approvals.empty else 0,
        "draft_reports": int(draft_reports.iloc[0]["cnt"]) if not draft_reports.empty else 0,
        "compliance_rate": round(in_policy / total_txns * 100, 1) if total_txns > 0 else 100.0,
    }
