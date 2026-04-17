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
    """Total operational debit spend and transaction count per department.

    Uses the canonical `is_operational=1 AND debit_or_credit='Debit'` filter
    that every other spend metric in the app uses. The audit caught us
    using a looser `transaction_code != 108` here that included credits
    and inflated each department's total by ~$29K total.
    """
    df = db.query_df(
        """SELECT e.department,
                  SUM(t.amount_cad) as total_spend,
                  COUNT(*) as txn_count
           FROM transactions t
           JOIN employees e ON t.employee_id = e.id
           WHERE t.is_operational = 1
             AND t.debit_or_credit = 'Debit'
           GROUP BY e.department
           ORDER BY total_spend DESC"""
    )
    return {
        "departments": df.to_dict("records") if not df.empty else [],
    }


@router.get("/analytics/agent-stats")
async def agent_stats():
    """Overview stats for dashboard: total spend, time window, txn counts,
    violation/approval summaries.

    Returns:
      total_spend         — all-time spend (over data_window).
                            Uses `is_operational=1 AND debit_or_credit='Debit'`
                            — same canonical filter every other spend metric uses.
      spend_90_days       — last 90 days only (for the trend tile),
                            anchored to the latest transaction date in the
                            dataset (NOT wall-clock today).
      data_window         — {"start": ISO, "end": ISO} so the UI can label
                            the time window of total_spend honestly.
    """
    totals = db.query_df(
        """SELECT COUNT(*) as total_txns,
                  SUM(CASE WHEN is_operational = 1 AND debit_or_credit = 'Debit'
                           THEN amount_cad ELSE 0 END) as total_spend,
                  COUNT(DISTINCT employee_id) as employee_count,
                  MIN(transaction_date) as window_start,
                  MAX(transaction_date) as window_end
           FROM transactions
           WHERE is_operational = 1"""
    )
    spend_90 = db.query_df(
        """SELECT COALESCE(SUM(amount_cad), 0) AS spend_90
             FROM transactions
            WHERE is_operational = 1
              AND debit_or_credit = 'Debit'
              AND transaction_date >= date(
                    (SELECT MAX(transaction_date) FROM transactions
                      WHERE is_operational = 1),
                    '-90 days'
                )"""
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
        "spend_90_days": float(spend_90.iloc[0]["spend_90"]) if not spend_90.empty else 0.0,
        "employee_count": int(t.get("employee_count", 0)),
        "in_policy_count": in_policy,
        "violation_count": v_count,
        "pending_approvals": int(pending_approvals.iloc[0]["cnt"]) if not pending_approvals.empty else 0,
        "draft_reports": int(draft_reports.iloc[0]["cnt"]) if not draft_reports.empty else 0,
        "compliance_rate": round(in_policy / total_txns * 100, 1) if total_txns > 0 else 100.0,
        "data_window": {
            "start": str(t.get("window_start") or ""),
            "end":   str(t.get("window_end") or ""),
        },
    }
