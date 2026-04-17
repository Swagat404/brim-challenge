"""
Test 5: ApprovalTool — DB logic, merchant column fix, AI fallback.
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import seed_transactions


@pytest.fixture
def approval_db(tmp_db, policy_doc):
    """Seed one employee + one transaction over the $50 threshold.

    Depends on `policy_doc` so `load_policy()` (called inside ApprovalTool)
    has a structured policy to read from — there's no fallback any more.
    """
    import sqlite3
    conn = sqlite3.connect(str(tmp_db))
    conn.execute(
        "INSERT INTO employees (id, name, role, department, monthly_budget) VALUES (?,?,?,?,?)",
        ("E001", "Marcus Rivera", "Long-Haul Driver", "Operations", 5000.0),
    )
    conn.commit()
    conn.close()

    seed_transactions(str(tmp_db), [
        ("2024-03-10", "E001", "Marcus Rivera", "Flying J Truck Stop",
         600.0, "Debit", 5541, 5541, 1, "Operations", "Long-Haul Driver"),
    ])
    return tmp_db


def run(coro):
    return asyncio.run(coro)


def test_get_pending_auto_seeds_approvals(approval_db):
    """get_pending() auto-populates approvals table from transactions > $50."""
    import data.db as db_module
    from agent.tools.approval_tool import ApprovalTool

    tool = ApprovalTool()
    params = tool.InputSchema(action="get_pending")

    # Approvals table starts empty
    empty = db_module.query_df("SELECT COUNT(*) as n FROM approvals")
    assert int(empty.iloc[0]["n"]) == 0

    result = run(tool.execute(params))
    assert result.error == ""
    assert result.data is not None

    # Approvals table should now have rows
    seeded = db_module.query_df("SELECT COUNT(*) as n FROM approvals WHERE status='pending'")
    assert int(seeded.iloc[0]["n"]) >= 1


def test_decide_records_approved(approval_db):
    """decide(approved) writes status to approvals table."""
    import data.db as db_module
    from agent.tools.approval_tool import ApprovalTool

    tool = ApprovalTool()

    # First seed an approval row
    db_module.execute(
        """INSERT INTO approvals (transaction_rowid, employee_id, amount, merchant, status, requested_at)
           VALUES (1, 'E001', 600.0, 'Flying J', 'pending', '2024-03-10')"""
    )
    params = tool.InputSchema(
        action="decide",
        transaction_rowid=1,
        decision="approved",
        approver_id="manager01",
    )
    result = run(tool.execute(params))
    assert result.error == ""

    df = db_module.query_df("SELECT status FROM approvals WHERE transaction_rowid = 1")
    assert df.iloc[0]["status"] == "approved"


def test_decide_rejected(approval_db):
    """decide(rejected) records rejected status."""
    import data.db as db_module
    from agent.tools.approval_tool import ApprovalTool

    db_module.execute(
        """INSERT INTO approvals (transaction_rowid, employee_id, amount, merchant, status, requested_at)
           VALUES (2, 'E001', 600.0, 'TA Truck Stop', 'pending', '2024-03-10')"""
    )
    tool = ApprovalTool()
    params = tool.InputSchema(action="decide", transaction_rowid=2, decision="rejected")
    result = run(tool.execute(params))
    assert result.error == ""

    df = db_module.query_df("SELECT status FROM approvals WHERE transaction_rowid = 2")
    assert df.iloc[0]["status"] == "rejected"


def test_decide_missing_approval_returns_err(approval_db):
    """decide() on nonexistent approval returns error."""
    from agent.tools.approval_tool import ApprovalTool
    tool = ApprovalTool()
    params = tool.InputSchema(action="decide", transaction_rowid=9999, decision="approved")
    result = run(tool.execute(params))
    assert result.error != ""


def test_ai_recommend_fallback_fleet_mcc():
    """AI recommendation falls back to approve for fleet MCC when Claude fails."""
    from agent.tools.approval_tool import ApprovalTool
    from data.policy_loader import FLEET_MCC_CODES, load_policy

    tool = ApprovalTool()
    policy = {"pre_auth_threshold": 50.0}
    txn = {"amount_cad": 600.0, "merchant": "Flying J", "merchant_category_code": 5541,
           "transaction_date": "2024-03-10"}
    # No-fallback policy: when Claude raises, _ask_claude must propagate
    # AIRecommendationError rather than silently inventing a heuristic answer.
    from agent.tools import approval_tool

    context = {
        "transaction": {
            "amount_cad": 100.0, "merchant": "Flying J", "mcc": 5541,
            "is_fleet_operation": True, "date": "2024-03-10",
        },
        "employee": {"name": "Marcus Rivera", "role": "Driver"},
    }
    async def run_it():
        with patch("anthropic.AsyncAnthropic") as mock_cls:
            mock_cls.return_value.messages.create = AsyncMock(
                side_effect=RuntimeError("API down")
            )
            return await approval_tool._ask_claude(context, missing=[])

    import pytest as _pytest
    with _pytest.raises(approval_tool.AIRecommendationError):
        asyncio.run(run_it())


def test_ai_recommend_rejects_invalid_decision():
    """If Claude returns a decision string outside {approve|review|reject},
    _ask_claude raises rather than coercing to a default."""
    from agent.tools import approval_tool
    import pytest as _pytest

    context = {
        "transaction": {
            "amount_cad": 1500.0, "merchant": "Some Restaurant", "mcc": 5812,
            "is_fleet_operation": False, "date": "2024-03-10",
        },
        "employee": {"name": "Bob", "role": "Manager"},
    }
    fake_response = MagicMock()
    fake_response.content = [MagicMock(text='{"decision": "maybe", "reasoning": "huh"}')]

    async def run_it():
        with patch("anthropic.AsyncAnthropic") as mock_cls:
            mock_cls.return_value.messages.create = AsyncMock(return_value=fake_response)
            return await approval_tool._ask_claude(context, missing=[])

    with _pytest.raises(approval_tool.AIRecommendationError, match="invalid decision"):
        asyncio.run(run_it())
