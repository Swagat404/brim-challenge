"""
GET   /api/budgets/departments              — caps + computed MTD spend per dept
PUT   /api/budgets/departments/{department} — set / update a cap
DELETE /api/budgets/departments/{department} — remove a cap
GET   /api/budgets/employees                — list with per-employee monthly_budget
PATCH /api/budgets/employees/{employee_id}  — update a single employee's budget
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from data import db
from services import activity

router = APIRouter()


# ── Department budgets ──────────────────────────────────────────────────────


@router.get("/budgets/departments")
async def list_department_budgets():
    """All departments (from employees table) joined with caps and MTD spend."""
    df = db.query_df(
        """SELECT d.department,
                  COALESCE(b.monthly_cap, 0) AS monthly_cap,
                  b.updated_at,
                  b.updated_by,
                  COALESCE(s.mtd_spend, 0)   AS mtd_spend,
                  COALESCE(s.active_employees, 0) AS active_employees
             FROM (SELECT DISTINCT department FROM employees WHERE department IS NOT NULL) d
        LEFT JOIN department_budgets b ON b.department = d.department
        LEFT JOIN (
              SELECT department,
                     SUM(amount_cad) AS mtd_spend,
                     COUNT(DISTINCT employee_id) AS active_employees
                FROM transactions
               WHERE is_operational = 1
                 AND debit_or_credit = 'Debit'
                 AND transaction_date >= date('now', 'start of month')
            GROUP BY department
        ) s ON s.department = d.department
            ORDER BY d.department"""
    )
    import math

    def _f(v) -> float:
        if v is None:
            return 0.0
        try:
            f = float(v)
            return 0.0 if math.isnan(f) else f
        except (TypeError, ValueError):
            return 0.0

    rows = df.to_dict("records") if not df.empty else []
    for r in rows:
        cap = _f(r.get("monthly_cap"))
        spent = _f(r.get("mtd_spend"))
        emp_count = _f(r.get("active_employees"))
        r["monthly_cap"] = cap
        r["mtd_spend"] = spent
        r["active_employees"] = int(emp_count)
        r["pct_used"] = round(100 * spent / cap, 1) if cap else None
        r["has_cap"] = cap > 0
        # Drop NaN updated_at if no cap row exists
        if r.get("updated_at") is None or (
            isinstance(r.get("updated_at"), float) and math.isnan(r["updated_at"])
        ):
            r["updated_at"] = None
        if r.get("updated_by") is None or (
            isinstance(r.get("updated_by"), float) and math.isnan(r["updated_by"])
        ):
            r["updated_by"] = None
    return {"departments": rows, "total": len(rows)}


class DepartmentBudgetUpdate(BaseModel):
    monthly_cap: float = Field(..., ge=0)
    updated_by: str = "admin"


@router.put("/budgets/departments/{department}")
async def set_department_budget(department: str, body: DepartmentBudgetUpdate):
    now = datetime.utcnow().isoformat()
    with db.get_conn() as conn:
        conn.execute(
            """INSERT INTO department_budgets (department, monthly_cap, updated_at, updated_by)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(department) DO UPDATE SET
                 monthly_cap = excluded.monthly_cap,
                 updated_at = excluded.updated_at,
                 updated_by = excluded.updated_by""",
            (department, body.monthly_cap, now, body.updated_by),
        )
    activity.emit(
        "budget_edited",
        f"Department {department} cap set to ${body.monthly_cap:,.0f}/mo",
        actor=body.updated_by,
        metadata={"department": department, "monthly_cap": body.monthly_cap},
    )
    return {"department": department, "monthly_cap": body.monthly_cap}


@router.delete("/budgets/departments/{department}")
async def remove_department_budget(department: str):
    rows = db.execute(
        "DELETE FROM department_budgets WHERE department = ?", (department,)
    )
    if rows == 0:
        raise HTTPException(404, "No cap set for that department")
    activity.emit(
        "budget_edited",
        f"Department {department} cap removed",
        actor="admin",
        metadata={"department": department, "removed": True},
    )
    return {"department": department, "removed": True}


# ── Employee budgets ────────────────────────────────────────────────────────


@router.get("/budgets/employees")
async def list_employee_budgets(department: Optional[str] = Query(None)):
    if department:
        df = db.query_df(
            """SELECT id, name, department, role, monthly_budget
                 FROM employees WHERE department = ? ORDER BY name""",
            (department,),
        )
    else:
        df = db.query_df(
            """SELECT id, name, department, role, monthly_budget
                 FROM employees ORDER BY department, name"""
        )
    rows = df.to_dict("records") if not df.empty else []
    return {"employees": rows, "total": len(rows)}


class EmployeeBudgetUpdate(BaseModel):
    monthly_budget: float = Field(..., ge=0)
    updated_by: str = "admin"


@router.patch("/budgets/employees/{employee_id}")
async def set_employee_budget(employee_id: str, body: EmployeeBudgetUpdate):
    rows = db.execute(
        "UPDATE employees SET monthly_budget = ? WHERE id = ?",
        (body.monthly_budget, employee_id),
    )
    if rows == 0:
        raise HTTPException(404, "Employee not found")
    activity.emit(
        "budget_edited",
        f"Employee {employee_id} budget set to ${body.monthly_budget:,.0f}/mo",
        actor=body.updated_by,
        metadata={"employee_id": employee_id, "monthly_budget": body.monthly_budget},
    )
    return {"employee_id": employee_id, "monthly_budget": body.monthly_budget}
