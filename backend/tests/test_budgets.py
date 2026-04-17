"""Tests for the budgets routes + ApprovalTool reading dept caps into context."""
from __future__ import annotations

import asyncio
import json
import sqlite3

from fastapi.testclient import TestClient


def _make_client():
    from api.main import app
    return TestClient(app)


def test_set_and_list_department_budgets(tmp_db):
    """End-to-end via the FastAPI route (uses tmp_db via the global db patch)."""
    # Seed two employees in two departments
    conn = sqlite3.connect(str(tmp_db))
    conn.executemany(
        "INSERT INTO employees (id, name, role, department) VALUES (?, ?, ?, ?)",
        [
            ("E001", "Marcus", "Driver", "Operations"),
            ("E041", "Brandon", "Sales Mgr", "Sales"),
        ],
    )
    conn.commit()
    conn.close()

    client = _make_client()
    r = client.put("/api/budgets/departments/Sales", json={"monthly_cap": 80000.0})
    assert r.status_code == 200
    assert r.json()["monthly_cap"] == 80000.0

    r = client.get("/api/budgets/departments")
    assert r.status_code == 200
    rows = {row["department"]: row for row in r.json()["departments"]}
    assert rows["Sales"]["has_cap"] is True
    assert rows["Sales"]["monthly_cap"] == 80000.0
    assert rows["Operations"]["has_cap"] is False

    # An activity row was emitted
    conn = sqlite3.connect(str(tmp_db))
    actions = [r[0] for r in conn.execute("SELECT action FROM agent_activity").fetchall()]
    conn.close()
    assert "budget_edited" in actions


def test_remove_department_budget(tmp_db):
    conn = sqlite3.connect(str(tmp_db))
    conn.execute("INSERT INTO employees (id, name, department) VALUES ('E1', 'X', 'Ops')")
    conn.commit()
    conn.close()

    client = _make_client()
    client.put("/api/budgets/departments/Ops", json={"monthly_cap": 5000})
    r = client.delete("/api/budgets/departments/Ops")
    assert r.status_code == 200

    r = client.get("/api/budgets/departments")
    assert r.json()["departments"][0]["has_cap"] is False


def test_set_employee_budget(tmp_db):
    conn = sqlite3.connect(str(tmp_db))
    conn.execute("INSERT INTO employees (id, name, department, monthly_budget) VALUES ('E1', 'X', 'Ops', 1000)")
    conn.commit()
    conn.close()

    client = _make_client()
    r = client.patch("/api/budgets/employees/E1", json={"monthly_budget": 2500.0})
    assert r.status_code == 200

    r = client.get("/api/budgets/employees")
    e = r.json()["employees"][0]
    assert e["monthly_budget"] == 2500.0


def test_approval_tool_reads_department_cap_into_context(policy_doc, tmp_db, monkeypatch):
    """ApprovalTool prompt context must include `monthly_cap` for the dept."""
    conn = sqlite3.connect(str(tmp_db))
    conn.execute(
        "INSERT INTO employees (id, name, role, department, monthly_budget) "
        "VALUES ('E041', 'Brandon', 'Sales Mgr', 'Sales', 4000)"
    )
    conn.execute(
        "INSERT INTO department_budgets (department, monthly_cap, updated_at) "
        "VALUES ('Sales', 80000.0, '2026-01-01')"
    )
    conn.execute(
        """INSERT INTO transactions
           (transaction_date, employee_id, employee_name, merchant_info_dba_name,
            amount_cad, debit_or_credit, merchant_category_code, is_operational, department, role)
           VALUES ('2026-04-10', 'E041', 'Brandon', 'Eventbrite',
                   1500, 'Debit', 8398, 1, 'Sales', 'Sales Mgr')"""
    )
    txn_rowid = conn.execute("SELECT MAX(rowid) FROM transactions").fetchone()[0]
    conn.execute(
        "INSERT INTO approvals (transaction_rowid, employee_id, amount, merchant, status, requested_at) "
        "VALUES (?, 'E041', 1500, 'Eventbrite', 'pending', '2026-04-10')",
        (txn_rowid,),
    )
    aid = conn.execute("SELECT MAX(id) FROM approvals").fetchone()[0]
    conn.commit()
    conn.close()

    captured: dict = {}
    from agent.tools import approval_tool

    async def fake(context, *, missing):
        captured["ctx"] = context
        return {"decision": "approve", "reasoning": "ok",
                "policy_citation": "ok", "cited_section_id": "general"}
    monkeypatch.setattr(approval_tool, "_ask_claude", fake)

    from data import db
    txn = db.query_df("SELECT rowid, * FROM transactions WHERE rowid = ?", (txn_rowid,)).iloc[0].to_dict()
    txn["merchant"] = txn["merchant_info_dba_name"]
    asyncio.run(approval_tool.recommend_for_transaction(
        txn=txn, employee=db.get_employee("E041"), approval_id=aid,
    ))

    ctx = captured["ctx"]
    assert ctx["department_budget"] is not None
    assert ctx["department_budget"]["monthly_cap"] == 80000.0
    # MTD spend = $1500 (only this transaction so far)
    # pct_used should be set to the right approximate value
    assert ctx["department_budget"]["pct_used"] is not None
