"""Tests for the auto-approval workflow.

Critical guarantees:
  1. When a rule matches, the approval is created/updated as 'approved' and a
     real `auto_approved` activity row is emitted — WITHOUT calling Claude.
  2. When no rule matches, the flow falls through to the AI recommendation.
  3. Toggle off → never auto-approves.

The "no Claude call" guarantee is asserted by patching anthropic.AsyncAnthropic
to raise — if it gets called, the test fails.
"""
from __future__ import annotations

import asyncio
import json
import sqlite3

import pytest


def test_find_matching_rule_simple():
    from services.auto_approval import find_matching_rule

    cfg = {
        "enabled": True,
        "rules": [
            {"id": "fleet_small", "max_amount": 500, "mcc_in": [5541, 5542]},
        ],
    }
    # Matches: small fleet fuel
    assert find_matching_rule(amount=120, mcc=5541, role=None, auto_approval_config=cfg) is not None
    # No match: amount too high
    assert find_matching_rule(amount=600, mcc=5541, role=None, auto_approval_config=cfg) is None
    # No match: wrong MCC
    assert find_matching_rule(amount=120, mcc=5812, role=None, auto_approval_config=cfg) is None


def test_find_matching_rule_disabled():
    from services.auto_approval import find_matching_rule
    cfg = {"enabled": False, "rules": [{"id": "x", "max_amount": 1000}]}
    assert find_matching_rule(amount=10, mcc=5541, role=None, auto_approval_config=cfg) is None


def test_find_matching_rule_role_filter():
    from services.auto_approval import find_matching_rule
    cfg = {"enabled": True, "rules": [
        {"id": "drivers_only", "max_amount": 1000, "role_in": ["Long-Haul Driver"]}
    ]}
    assert find_matching_rule(amount=100, mcc=None, role="Long-Haul Driver", auto_approval_config=cfg) is not None
    assert find_matching_rule(amount=100, mcc=None, role="CFO", auto_approval_config=cfg) is None


def test_find_matching_rule_no_conditions_never_matches():
    """Defensive: a rule with no conditions should not match anything,
    otherwise it would auto-approve everything."""
    from services.auto_approval import find_matching_rule
    cfg = {"enabled": True, "rules": [{"id": "loose", "rationale": "should never match"}]}
    assert find_matching_rule(amount=10, mcc=5541, role=None, auto_approval_config=cfg) is None


def _seed_txn_and_approval(db_path, *, mcc, amount, role="Long-Haul Driver"):
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "INSERT INTO employees (id, name, role, department, monthly_budget) "
        "VALUES ('E001', 'Marcus Rivera', ?, 'Operations', 8000)", (role,),
    )
    conn.execute(
        """INSERT INTO transactions
           (transaction_date, employee_id, employee_name, merchant_info_dba_name,
            amount_cad, debit_or_credit, merchant_category_code, is_operational, department, role)
           VALUES ('2026-04-01', 'E001', 'Marcus Rivera', 'Flying J',
                   ?, 'Debit', ?, 1, 'Operations', ?)""",
        (amount, mcc, role),
    )
    txn_rowid = conn.execute("SELECT MAX(rowid) FROM transactions").fetchone()[0]
    conn.execute(
        """INSERT INTO approvals
           (transaction_rowid, employee_id, amount, merchant, status, requested_at)
           VALUES (?, 'E001', ?, 'Flying J', 'pending', '2026-04-01T00:00:00')""",
        (txn_rowid, amount),
    )
    approval_id = conn.execute("SELECT MAX(id) FROM approvals").fetchone()[0]
    conn.commit()
    conn.close()
    return txn_rowid, approval_id


def test_auto_approval_skips_claude(policy_doc, tmp_db, monkeypatch):
    """Matching rule path must not instantiate AsyncAnthropic."""
    txn_rowid, approval_id = _seed_txn_and_approval(tmp_db, mcc=5541, amount=120.50)

    # Make any Claude call blow up so we know it never happened
    import anthropic
    def _explode(*a, **kw):
        raise AssertionError("Claude must NOT be called when an auto-approval rule matches")
    monkeypatch.setattr(anthropic, "AsyncAnthropic", _explode)

    from agent.tools.approval_tool import recommend_for_transaction
    from data import db
    txn = db.query_df("SELECT rowid, * FROM transactions WHERE rowid = ?", (txn_rowid,)).iloc[0].to_dict()
    txn["merchant"] = txn["merchant_info_dba_name"]
    emp = db.get_employee("E001")

    result = asyncio.run(recommend_for_transaction(
        txn=txn, employee=emp, approval_id=approval_id, actor="agent",
    ))
    assert result["auto_approved"] is True
    assert result["decision"] == "approve"
    assert "fleet_small" in result["cited_section_id"]

    # Approval should now be 'approved' and an auto_approved activity row exists
    conn = sqlite3.connect(str(tmp_db))
    status = conn.execute(
        "SELECT status, ai_decision FROM approvals WHERE id = ?", (approval_id,)
    ).fetchone()
    assert status == ("approved", "approve")

    activity_rows = conn.execute(
        "SELECT action, transaction_rowid, approval_id FROM agent_activity ORDER BY id"
    ).fetchall()
    conn.close()

    assert len(activity_rows) == 1
    assert activity_rows[0] == ("auto_approved", txn_rowid, approval_id)


def test_non_matching_falls_through_to_claude(policy_doc, tmp_db, monkeypatch):
    """If no rule matches we must fall through to the AI recommendation path.

    We mock _ask_claude directly to avoid hitting the network.
    """
    txn_rowid, approval_id = _seed_txn_and_approval(tmp_db, mcc=5812, amount=445.0)  # restaurant, no rule

    from agent.tools import approval_tool
    called = {"count": 0}

    async def fake_ask(_context, *, missing):
        called["count"] += 1
        return {
            "decision": "review", "reasoning": "Mock review reason",
            "policy_citation": "Mock cited rule", "cited_section_id": "general",
        }
    monkeypatch.setattr(approval_tool, "_ask_claude", fake_ask)

    from data import db
    txn = db.query_df("SELECT rowid, * FROM transactions WHERE rowid = ?", (txn_rowid,)).iloc[0].to_dict()
    txn["merchant"] = txn["merchant_info_dba_name"]
    emp = db.get_employee("E001")
    result = asyncio.run(approval_tool.recommend_for_transaction(
        txn=txn, employee=emp, approval_id=approval_id, actor="agent",
    ))

    assert called["count"] == 1
    assert result["auto_approved"] is False
    assert result["decision"] == "review"

    conn = sqlite3.connect(str(tmp_db))
    actions = [r[0] for r in conn.execute("SELECT action FROM agent_activity").fetchall()]
    conn.close()
    assert "recommended" in actions
    assert "auto_approved" not in actions
