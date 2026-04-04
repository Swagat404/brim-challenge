"""
Expense report routes.

GET  /api/reports             — list reports (filter by employee, department)
GET  /api/reports/{id}        — view a single report with transactions
DELETE /api/reports/{id}      — delete a draft report
PATCH /api/reports/{id}/status — advance status: draft → submitted → approved
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from data import db
from data.policy_loader import MCC_DESCRIPTIONS, FLEET_MCC_CODES, load_policy

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/reports")
async def list_reports(
    employee_id: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="draft|submitted|approved"),
    limit: int = Query(50, le=200),
):
    """List expense reports with employee metadata."""
    clauses = []
    params: list = []

    if employee_id:
        clauses.append("r.employee_id = ?")
        params.append(employee_id)
    if department:
        clauses.append("e.department = ?")
        params.append(department)
    if status:
        clauses.append("r.status = ?")
        params.append(status.lower())

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    df = db.query_df(
        f"""SELECT r.id, r.report_name, r.period_start, r.period_end,
                   r.total_amount, r.status, r.created_at,
                   e.name as employee_name, e.department, e.role
            FROM expense_reports r
            LEFT JOIN employees e ON r.employee_id = e.id
            {where}
            ORDER BY r.created_at DESC
            LIMIT ?""",
        tuple(params + [limit]),
    )

    return {
        "reports": df.to_dict("records") if not df.empty else [],
        "total": len(df),
    }


@router.get("/reports/{report_id}")
async def get_report(report_id: int):
    """Single report with linked transactions."""
    report_df = db.query_df(
        """SELECT r.*, e.name as employee_name, e.department, e.role
           FROM expense_reports r
           LEFT JOIN employees e ON r.employee_id = e.id
           WHERE r.id = ?""",
        (report_id,),
    )
    if report_df.empty:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")

    report = report_df.iloc[0].to_dict()
    txn_ids = report.get("transaction_ids", "") or ""
    transactions = []

    category_breakdown = []
    policy_flags = []

    if txn_ids.strip():
        id_list = ",".join(txn_ids.split(",")[:200])
        txn_df = db.query_df(
            f"SELECT rowid, * FROM transactions WHERE rowid IN ({id_list})"
        )
        if not txn_df.empty:
            policy = load_policy()
            threshold = policy["pre_auth_threshold"]

            for _, row in txn_df.iterrows():
                txn = row.to_dict()
                mcc = int(txn.get("merchant_category_code") or txn.get("mcc") or 0)
                txn["category_label"] = MCC_DESCRIPTIONS.get(mcc, f"MCC {mcc}" if mcc else "Other")
                txn["is_fleet"] = mcc in FLEET_MCC_CODES

                amount = float(txn.get("amount_cad") or 0)
                flags = []
                if amount > threshold and mcc not in FLEET_MCC_CODES:
                    flags.append(f"Over ${threshold:.0f} pre-auth threshold")
                if mcc in (5813, 5921):
                    flags.append("Alcohol purchase — requires customer context")
                txn["policy_flags"] = flags

                if flags:
                    policy_flags.append({
                        "merchant": txn.get("merchant_info_dba_name", ""),
                        "amount": amount,
                        "flags": flags,
                    })

                transactions.append(txn)

            import pandas as pd
            cat_df = pd.DataFrame([
                {"category": MCC_DESCRIPTIONS.get(int(r.get("merchant_category_code") or 0), "Other"),
                 "amount": float(r.get("amount_cad") or 0)}
                for r in transactions
            ])
            if not cat_df.empty:
                category_breakdown = (
                    cat_df.groupby("category")["amount"]
                    .agg(["sum", "count"])
                    .reset_index()
                    .rename(columns={"sum": "total", "count": "txn_count"})
                    .sort_values("total", ascending=False)
                    .to_dict("records")
                )

    return {
        "report": report,
        "transactions": transactions,
        "category_breakdown": category_breakdown,
        "policy_flags": policy_flags,
    }


class StatusUpdate(BaseModel):
    status: Literal["submitted", "approved", "rejected"]


@router.patch("/reports/{report_id}/status")
async def update_report_status(report_id: int, body: StatusUpdate):
    """Advance report through draft → submitted → approved workflow."""
    rows = db.execute(
        "UPDATE expense_reports SET status = ? WHERE id = ?",
        (body.status, report_id),
    )
    if rows == 0:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")

    return {"report_id": report_id, "status": body.status}


@router.delete("/reports/{report_id}")
async def delete_report(report_id: int):
    """Delete a draft report."""
    # Only allow deleting draft reports
    df = db.query_df("SELECT status FROM expense_reports WHERE id = ?", (report_id,))
    if df.empty:
        raise HTTPException(status_code=404, detail=f"Report {report_id} not found")

    if df.iloc[0]["status"] != "draft":
        raise HTTPException(
            status_code=409,
            detail="Only draft reports can be deleted.",
        )

    db.execute("DELETE FROM expense_reports WHERE id = ?", (report_id,))
    return {"deleted": report_id}
