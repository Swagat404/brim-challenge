"""Tests for the policy upload + extraction flow."""
from __future__ import annotations

import os
import sqlite3
from io import BytesIO

from fastapi.testclient import TestClient


# Use a tiny valid PDF — `pdfplumber` accepts it. Generated with reportlab once
# for a known fixture; here we just write a minimal text-stream PDF inline.
MINIMAL_PDF = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 60 >>
stream
BT /F1 12 Tf 50 750 Td (Test policy. Pre-auth threshold $50.) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000110 00000 n
0000000220 00000 n
0000000330 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
410
%%EOF
"""


def _client():
    from api.main import app
    return TestClient(app)


def test_upload_returns_diff_then_confirm_persists(tmp_db, monkeypatch):
    # Force the deterministic test extractor — no network calls
    monkeypatch.setenv("POLICY_EXTRACTOR_STUB", "1")

    # Need a current policy to diff against
    from data import policy_loader
    policy_loader._structured_cache["doc"] = None
    policy_loader.save_structured_policy(
        {"name": "Old", "thresholds": {"pre_auth": 50},
         "restrictions": {}, "auto_approval_rules": {"enabled": False, "rules": []},
         "submission_requirements": [], "sections": []},
        updated_by="seed",
    )

    client = _client()
    files = {"file": ("policy.pdf", BytesIO(MINIMAL_PDF), "application/pdf")}
    r = client.post("/api/policy/document/upload", files=files)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["proposal_id"]
    assert body["proposed"]["name"] == "Stub Policy (test)"
    # The diff should mention `name` since we changed it
    assert "name" in body["diff"]

    # Confirm
    r2 = client.post(
        "/api/policy/document/upload/confirm",
        json={"proposal_id": body["proposal_id"]},
    )
    assert r2.status_code == 200
    assert r2.json()["document"]["name"] == "Stub Policy (test)"

    # The applied policy is now current; an activity row was emitted
    conn = sqlite3.connect(str(tmp_db))
    actions = [r[0] for r in conn.execute("SELECT action FROM agent_activity").fetchall()]
    n_current = conn.execute(
        "SELECT COUNT(*) FROM policy_documents WHERE is_current = 1"
    ).fetchone()[0]
    conn.close()
    assert "policy_uploaded" in actions
    assert n_current == 1


def test_upload_rejects_non_pdf(tmp_db):
    client = _client()
    files = {"file": ("notes.txt", BytesIO(b"hello"), "text/plain")}
    r = client.post("/api/policy/document/upload", files=files)
    assert r.status_code == 415


def test_upload_rejects_empty_file(tmp_db):
    client = _client()
    files = {"file": ("empty.pdf", BytesIO(b""), "application/pdf")}
    r = client.post("/api/policy/document/upload", files=files)
    assert r.status_code == 400


def test_confirm_rejects_unknown_proposal(tmp_db):
    client = _client()
    r = client.post(
        "/api/policy/document/upload/confirm",
        json={"proposal_id": "does-not-exist"},
    )
    assert r.status_code == 404
