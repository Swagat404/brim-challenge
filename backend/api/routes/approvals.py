"""
Approval routes.

GET  /api/approvals           — list approvals (filter by status)
GET  /api/approvals/{id}      — single approval detail
PATCH /api/approvals/{id}     — record a manual decision (approved/rejected)
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from data import db

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/approvals")
async def list_approvals(
    status: Optional[str] = Query(None, description="pending|approved|rejected"),
    employee_id: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    """List approvals with employee context."""
    clauses = []
    params: list = []

    if status:
        clauses.append("a.status = ?")
        params.append(status.lower())
    if employee_id:
        clauses.append("a.employee_id = ?")
        params.append(employee_id)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    df = db.query_df(
        f"""SELECT a.*, e.name as employee_name, e.department, e.role, e.monthly_budget
            FROM approvals a
            LEFT JOIN employees e ON a.employee_id = e.id
            {where}
            ORDER BY a.amount DESC
            LIMIT ?""",
        tuple(params + [limit]),
    )

    return {
        "approvals": _sanitize_rows(df),
        "total": int(len(df)),
    }


def _sanitize_rows(df) -> list[dict]:
    """Drop NaN/Inf floats and turn NaN ints back into None so the response
    is JSON-serializable. pandas-from-LEFT-JOIN is the usual culprit."""
    import math
    if df.empty:
        return []
    rows = df.to_dict("records")
    for r in rows:
        for k, v in list(r.items()):
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                r[k] = None
    return rows


@router.get("/approvals/{approval_id}")
async def get_approval(approval_id: int):
    """Single approval with transaction detail, spend history, and budget context."""
    df = db.query_df(
        """SELECT a.*, e.name as employee_name, e.department, e.role, e.monthly_budget
           FROM approvals a
           LEFT JOIN employees e ON a.employee_id = e.id
           WHERE a.id = ?""",
        (approval_id,),
    )
    if df.empty:
        raise HTTPException(status_code=404, detail=f"Approval {approval_id} not found")

    row = df.iloc[0].to_dict()
    emp_id = row.get("employee_id", "")

    # Attach transaction if linked
    txn = {}
    if row.get("transaction_rowid"):
        txn_df = db.query_df(
            "SELECT * FROM transactions WHERE rowid = ?", (row["transaction_rowid"],)
        )
        if not txn_df.empty:
            txn = txn_df.iloc[0].to_dict()

    # Employee spend history (last 6 months)
    monthly_spend = db.query_df(
        """SELECT strftime('%Y-%m', transaction_date) AS month,
                  SUM(amount_cad) AS total
           FROM transactions
           WHERE employee_id = ? AND is_operational = 1 AND debit_or_credit = 'Debit'
           GROUP BY month ORDER BY month DESC LIMIT 6""",
        (emp_id,),
    )

    # Recent transactions from same employee (last 10)
    recent_txns = db.query_df(
        """SELECT transaction_date, merchant_info_dba_name AS merchant,
                  amount_cad, merchant_category_code AS mcc
           FROM transactions
           WHERE employee_id = ? AND is_operational = 1 AND debit_or_credit = 'Debit'
           ORDER BY transaction_date DESC LIMIT 10""",
        (emp_id,),
    )

    # Department budget: total spend by all employees in same dept this month
    dept = row.get("department", "")
    dept_spend = db.query_df(
        """SELECT SUM(t.amount_cad) AS dept_total, COUNT(DISTINCT t.employee_id) AS emp_count
           FROM transactions t
           JOIN employees e ON t.employee_id = e.id
           WHERE e.department = ?
             AND t.is_operational = 1
             AND t.debit_or_credit = 'Debit'
             AND t.transaction_date >= date('now', 'start of month')""",
        (dept,),
    )

    # Past violations for this employee
    violations_df = db.query_df(
        """SELECT violation_type, severity, description, amount, detected_at
           FROM policy_violations
           WHERE employee_id = ?
           ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END
           LIMIT 20""",
        (emp_id,),
    )

    return {
        "approval": row,
        "transaction": txn,
        "spend_history": monthly_spend.to_dict("records") if not monthly_spend.empty else [],
        "recent_transactions": recent_txns.to_dict("records") if not recent_txns.empty else [],
        "department_budget": {
            "department": dept,
            "dept_spend_this_month": float(dept_spend.iloc[0]["dept_total"] or 0) if not dept_spend.empty else 0,
            "active_employees": int(dept_spend.iloc[0]["emp_count"] or 0) if not dept_spend.empty else 0,
            "employee_monthly_budget": float(row.get("monthly_budget") or 0),
        },
        "violation_count": len(violations_df),
        "violations": violations_df.to_dict("records") if not violations_df.empty else [],
    }


class DecisionRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    approver_id: Optional[str] = None
    note: Optional[str] = None


@router.patch("/approvals/{approval_id}")
async def record_decision(approval_id: int, body: DecisionRequest):
    """Record a manual approve/reject decision."""
    from datetime import datetime

    now = datetime.utcnow().isoformat()
    rows = db.execute(
        """UPDATE approvals
           SET status = ?, approver_id = ?, resolved_at = ?
           WHERE id = ?""",
        (body.decision, body.approver_id or "manual", now, approval_id),
    )
    if rows == 0:
        raise HTTPException(status_code=404, detail=f"Approval {approval_id} not found")

    return {"approval_id": approval_id, "status": body.decision, "resolved_at": now}
