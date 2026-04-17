"""Tests for the transaction submission routes."""
from __future__ import annotations

import json
import os
import sqlite3
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _stub_ocr(monkeypatch):
    """Mock receipt OCR at the function level so tests don't hit Claude vision.

    Production has no env-flag escape hatch — `services.receipt_ocr.ocr_receipt`
    always calls the real model. Tests patch the function with a deterministic
    return value.
    """
    from services import receipt_ocr
    monkeypatch.setattr(
        receipt_ocr,
        "ocr_receipt",
        lambda path: f"[mock OCR for {Path(path).name}] line items would appear here",
    )


def _client():
    from api.main import app
    return TestClient(app)


def _seed_simple_txn(db_path):
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "INSERT INTO employees (id, name, role, department, monthly_budget) "
        "VALUES ('E044', 'Fiona', 'BDR', 'Sales', 4000)"
    )
    conn.execute(
        """INSERT INTO transactions
           (transaction_date, employee_id, employee_name, merchant_info_dba_name,
            amount_cad, debit_or_credit, merchant_category_code, is_operational, department, role)
           VALUES ('2026-04-10', 'E044', 'Fiona', 'Harbour 60',
                   445, 'Debit', 5812, 1, 'Sales', 'BDR')"""
    )
    txn_rowid = conn.execute("SELECT MAX(rowid) FROM transactions").fetchone()[0]
    conn.commit()
    conn.close()
    return txn_rowid


def test_get_transaction_returns_txn_and_missing(policy_doc, tmp_db):
    txn_rowid = _seed_simple_txn(tmp_db)
    client = _client()
    r = client.get(f"/api/transactions/{txn_rowid}")
    assert r.status_code == 200
    body = r.json()
    assert body["transaction"]["rowid"] == txn_rowid
    assert body["submission"] is None
    # Meal > $200 with no submission must trip the meals_high requirement
    missing_ids = {m["requirement_id"] for m in body["missing_required_fields"]}
    assert "meals_high" in missing_ids


def test_patch_submission_upserts(policy_doc, tmp_db):
    txn_rowid = _seed_simple_txn(tmp_db)
    client = _client()

    r = client.patch(
        f"/api/transactions/{txn_rowid}/submission",
        json={"memo": "Client dinner", "attendees": ["Alex Park"], "rerun_recommendation": False},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["submission"]["memo"] == "Client dinner"
    assert body["submission"]["attendees"] == ["Alex Park"]

    # Second PATCH updates the existing row, doesn't duplicate
    r2 = client.patch(
        f"/api/transactions/{txn_rowid}/submission",
        json={"business_purpose": "Pipeline review", "rerun_recommendation": False},
    )
    assert r2.status_code == 200
    sub = r2.json()["submission"]
    assert sub["memo"] == "Client dinner"  # preserved
    assert sub["business_purpose"] == "Pipeline review"

    conn = sqlite3.connect(str(tmp_db))
    n = conn.execute(
        "SELECT COUNT(*) FROM transaction_submissions WHERE transaction_rowid = ?",
        (txn_rowid,),
    ).fetchone()[0]
    actions = [r[0] for r in conn.execute("SELECT action FROM agent_activity").fetchall()]
    conn.close()
    assert n == 1
    assert "submission_updated" in actions


def test_upload_receipt_stores_file_and_ocr(policy_doc, tmp_db):
    txn_rowid = _seed_simple_txn(tmp_db)
    client = _client()

    files = {"file": ("rcpt.png", BytesIO(b"\x89PNG\r\n\x1a\nfake"), "image/png")}
    r = client.post(
        f"/api/transactions/{txn_rowid}/receipt",
        files=files,
        data={"submitted_by": "test", "rerun_recommendation": "false"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["submission"]["receipt_url"].startswith(f"/uploads/receipts/{txn_rowid}/")
    # The mocked OCR (see _stub_ocr fixture) returns a known-shape string
    assert "[mock OCR" in (body["submission"]["receipt_ocr_text"] or "")

    # Activity row emitted
    conn = sqlite3.connect(str(tmp_db))
    actions = [r[0] for r in conn.execute(
        "SELECT action FROM agent_activity WHERE transaction_rowid = ?",
        (txn_rowid,),
    ).fetchall()]
    conn.close()
    assert "receipt_uploaded" in actions


def test_upload_receipt_rejects_empty(policy_doc, tmp_db):
    txn_rowid = _seed_simple_txn(tmp_db)
    client = _client()
    files = {"file": ("empty.png", BytesIO(b""), "image/png")}
    r = client.post(
        f"/api/transactions/{txn_rowid}/receipt",
        files=files,
        data={"submitted_by": "test"},
    )
    assert r.status_code == 400
