"""Tests for the submission_check service + the missing-fields path through
recommend_for_transaction (forces 'review' on missing required fields)."""
from __future__ import annotations

import asyncio
import json
import sqlite3


def test_missing_returns_empty_when_no_requirements_apply(policy_doc):
    from services import submission_check
    # Fleet MCC, $40 — no submission requirement applies
    missing = submission_check.missing_fields(
        amount=40, mcc=5541, submission=None,
        requirements=policy_doc["submission_requirements"],
    )
    assert missing == []


def test_missing_returns_fields_for_high_meal_no_submission(policy_doc):
    from services import submission_check
    # Restaurant > $200 — meals_high rule applies; no submission at all
    missing = submission_check.missing_fields(
        amount=445, mcc=5812, submission=None,
        requirements=policy_doc["submission_requirements"],
    )
    assert len(missing) == 1
    assert missing[0]["requirement_id"] == "meals_high"
    assert set(missing[0]["missing"]) == {"receipt", "attendees", "business_purpose"}


def test_missing_recognizes_provided_attendees(policy_doc):
    from services import submission_check
    sub = {
        "receipt_url": "/uploads/receipts/123/r.png",
        "memo": "Client dinner",
        "business_purpose": "Pipeline review",
        "attendees_json": json.dumps(["Alex Park", "Jane Liu"]),
    }
    missing = submission_check.missing_fields(
        amount=445, mcc=5812, submission=sub,
        requirements=policy_doc["submission_requirements"],
    )
    assert missing == []


def test_missing_handles_empty_attendee_array(policy_doc):
    from services import submission_check
    sub = {
        "receipt_url": "/uploads/receipts/123/r.png",
        "business_purpose": "Pipeline review",
        "attendees_json": json.dumps([]),  # empty array == missing
    }
    missing = submission_check.missing_fields(
        amount=445, mcc=5812, submission=sub,
        requirements=policy_doc["submission_requirements"],
    )
    assert len(missing) == 1
    assert "attendees" in missing[0]["missing"]


def _seed_meal_approval(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "INSERT INTO employees (id, name, role, department, monthly_budget) "
        "VALUES ('E044', 'Fiona Walsh', 'Business Dev Rep', 'Sales', 4000)"
    )
    conn.execute(
        """INSERT INTO transactions
           (transaction_date, employee_id, employee_name, merchant_info_dba_name,
            amount_cad, debit_or_credit, merchant_category_code, is_operational, department, role)
           VALUES ('2026-04-10', 'E044', 'Fiona Walsh', 'Harbour 60',
                   445.00, 'Debit', 5812, 1, 'Sales', 'Business Dev Rep')"""
    )
    txn_rowid = conn.execute("SELECT MAX(rowid) FROM transactions").fetchone()[0]
    conn.execute(
        "INSERT INTO approvals (transaction_rowid, employee_id, amount, merchant, status, requested_at) "
        "VALUES (?, 'E044', 445.00, 'Harbour 60', 'pending', '2026-04-10T00:00:00')",
        (txn_rowid,),
    )
    approval_id = conn.execute("SELECT MAX(id) FROM approvals").fetchone()[0]
    conn.commit()
    conn.close()
    return txn_rowid, approval_id


def _patch_claude_passthrough(monkeypatch):
    """Make _ask_claude reflect the missing-fields hint back as the decision —
    matches the real prompt's instruction to default to 'review' on missing
    required fields. This way the test asserts on real backend wiring without
    actually calling the API."""
    from agent.tools import approval_tool

    async def fake(_context, *, missing):
        if missing:
            m = missing[0]
            return {
                "decision": "review",
                "reasoning": f"Missing required: {', '.join(m['missing'])}",
                "policy_citation": m["rationale"],
                "cited_section_id": "general",
            }
        return {
            "decision": "approve", "reasoning": "All requirements met",
            "policy_citation": "Within standard pattern", "cited_section_id": "general",
        }
    monkeypatch.setattr(approval_tool, "_ask_claude", fake)


def test_missing_attendees_flips_to_review(policy_doc, tmp_db, monkeypatch):
    txn_rowid, approval_id = _seed_meal_approval(tmp_db)
    _patch_claude_passthrough(monkeypatch)

    from agent.tools.approval_tool import recommend_for_transaction
    from data import db as data_db
    txn = data_db.query_df("SELECT rowid, * FROM transactions WHERE rowid = ?", (txn_rowid,)).iloc[0].to_dict()
    txn["merchant"] = txn["merchant_info_dba_name"]
    emp = data_db.get_employee("E044")

    # No submission row yet -> all required fields missing
    result = asyncio.run(recommend_for_transaction(
        txn=txn, employee=emp, approval_id=approval_id,
    ))
    assert result["decision"] == "review"
    assert "Missing required" in result["reasoning"]


def test_filling_attendees_flips_to_approve(policy_doc, tmp_db, monkeypatch):
    txn_rowid, approval_id = _seed_meal_approval(tmp_db)
    _patch_claude_passthrough(monkeypatch)

    # Insert a complete submission row
    conn = sqlite3.connect(str(tmp_db))
    conn.execute(
        """INSERT INTO transaction_submissions
           (transaction_rowid, receipt_url, memo, business_purpose, attendees_json,
            submitted_at, submitted_by)
           VALUES (?, '/uploads/r.png', 'Client dinner', 'Pipeline review',
                   ?, '2026-04-10T00:00:00', 'admin')""",
        (txn_rowid, json.dumps(["Alex Park", "Jane Liu"])),
    )
    conn.commit()
    conn.close()

    from agent.tools.approval_tool import recommend_for_transaction
    from data import db as data_db
    txn = data_db.query_df("SELECT rowid, * FROM transactions WHERE rowid = ?", (txn_rowid,)).iloc[0].to_dict()
    txn["merchant"] = txn["merchant_info_dba_name"]
    emp = data_db.get_employee("E044")
    result = asyncio.run(recommend_for_transaction(
        txn=txn, employee=emp, approval_id=approval_id,
    ))
    assert result["decision"] == "approve"


def test_gl_code_excluded_from_prompt_context(policy_doc, tmp_db, monkeypatch):
    """Regression: GL code must NOT be passed into the AI prompt (per Ramp doc)."""
    txn_rowid, approval_id = _seed_meal_approval(tmp_db)

    # Submission with everything, including GL code
    conn = sqlite3.connect(str(tmp_db))
    conn.execute(
        """INSERT INTO transaction_submissions
           (transaction_rowid, receipt_url, memo, business_purpose, attendees_json,
            gl_code, submitted_at, submitted_by)
           VALUES (?, '/uploads/r.png', 'memo', 'purpose',
                   ?, 'TOPSECRET-GL-9999', '2026-04-10', 'admin')""",
        (txn_rowid, json.dumps(["Alex"])),
    )
    conn.commit()
    conn.close()

    captured: dict = {}
    from agent.tools import approval_tool

    async def fake(context, *, missing):
        captured["context"] = context
        return {"decision": "approve", "reasoning": "ok",
                "policy_citation": "ok", "cited_section_id": "general"}
    monkeypatch.setattr(approval_tool, "_ask_claude", fake)

    from data import db as data_db
    txn = data_db.query_df("SELECT rowid, * FROM transactions WHERE rowid = ?", (txn_rowid,)).iloc[0].to_dict()
    txn["merchant"] = txn["merchant_info_dba_name"]
    asyncio.run(approval_tool.recommend_for_transaction(
        txn=txn, employee=data_db.get_employee("E044"), approval_id=approval_id,
    ))

    assert "context" in captured
    serialized = json.dumps(captured["context"], default=str)
    assert "TOPSECRET-GL-9999" not in serialized
    assert "gl_code" not in serialized
