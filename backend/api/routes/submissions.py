"""
Transaction submission routes — receipts, memos, attendees, GL coding.

GET    /api/transactions/{rowid}             — full txn + submission + linked approval
POST   /api/transactions/{rowid}/receipt     — multipart upload; OCRs via Claude vision
DELETE /api/transactions/{rowid}/receipt     — remove receipt + clear OCR text
PATCH  /api/transactions/{rowid}/submission  — upsert memo/attendees/business_purpose/gl_code

Side effect on submission change: re-runs ApprovalTool.recommend_for_transaction
for the linked approval (if any), so the demo flow "add attendees → AI flips
to approve" actually works end-to-end.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from agent.tools.approval_tool import recommend_for_transaction, _approval_id_for_txn
from data import db
from services import activity, receipt_ocr, submission_check
from data.policy_loader import load_structured_policy

router = APIRouter()
logger = logging.getLogger(__name__)

UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent / "uploads" / "receipts"
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)


# ── Read ─────────────────────────────────────────────────────────────────────


@router.get("/transactions/{rowid}")
async def get_transaction(rowid: int):
    txn_df = db.query_df("SELECT rowid, * FROM transactions WHERE rowid = ?", (rowid,))
    if txn_df.empty:
        raise HTTPException(404, f"Transaction {rowid} not found")
    txn = txn_df.iloc[0].to_dict()

    sub_df = db.query_df(
        "SELECT * FROM transaction_submissions WHERE transaction_rowid = ?", (rowid,)
    )
    submission = sub_df.iloc[0].to_dict() if not sub_df.empty else None
    if submission and submission.get("attendees_json"):
        try:
            submission["attendees"] = json.loads(submission["attendees_json"])
        except (TypeError, ValueError):
            submission["attendees"] = []
    elif submission:
        submission["attendees"] = []

    approval_df = db.query_df(
        "SELECT * FROM approvals WHERE transaction_rowid = ? LIMIT 1", (rowid,)
    )
    approval = approval_df.iloc[0].to_dict() if not approval_df.empty else None

    # Include missing-required-fields for the badge UI
    policy = load_structured_policy() or {}
    missing = submission_check.missing_fields(
        amount=float(txn.get("amount_cad") or 0),
        mcc=int(txn.get("merchant_category_code") or 0) or None,
        submission=submission,
        requirements=policy.get("submission_requirements", []),
    )

    return {
        "transaction": txn,
        "submission": submission,
        "approval": approval,
        "missing_required_fields": missing,
    }


# ── Submission upsert ────────────────────────────────────────────────────────


class SubmissionPatch(BaseModel):
    memo: Optional[str] = None
    business_purpose: Optional[str] = None
    attendees: Optional[list[str]] = None
    gl_code: Optional[str] = None
    submitted_by: str = "admin"
    rerun_recommendation: bool = Field(
        True,
        description=(
            "Re-run the AI recommendation for the linked approval after this "
            "patch (so missing-fields → review can flip to approve once filled)."
        ),
    )


@router.patch("/transactions/{rowid}/submission")
async def patch_submission(rowid: int, body: SubmissionPatch):
    if not _txn_exists(rowid):
        raise HTTPException(404, f"Transaction {rowid} not found")

    now = datetime.utcnow().isoformat()
    existing = db.query_df(
        "SELECT * FROM transaction_submissions WHERE transaction_rowid = ?", (rowid,)
    )
    has_row = not existing.empty

    fields = {
        "memo": body.memo,
        "business_purpose": body.business_purpose,
        "attendees_json": json.dumps(body.attendees) if body.attendees is not None else None,
        "gl_code": body.gl_code,
    }
    set_fields = {k: v for k, v in fields.items() if v is not None}

    with db.get_conn() as conn:
        if has_row:
            if set_fields:
                cols = ", ".join(f"{k} = ?" for k in set_fields)
                params = list(set_fields.values()) + [rowid]
                conn.execute(
                    f"UPDATE transaction_submissions SET {cols} WHERE transaction_rowid = ?",
                    params,
                )
        else:
            conn.execute(
                """INSERT INTO transaction_submissions
                   (transaction_rowid, memo, business_purpose, attendees_json, gl_code,
                    submitted_at, submitted_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    rowid, set_fields.get("memo"), set_fields.get("business_purpose"),
                    set_fields.get("attendees_json"), set_fields.get("gl_code"),
                    now, body.submitted_by,
                ),
            )

    activity.emit(
        "submission_updated",
        f"Submission updated: {', '.join(sorted(set_fields.keys())) or 'no-op'}",
        actor=body.submitted_by,
        transaction_rowid=rowid,
        approval_id=_approval_id_for_txn(rowid),
        metadata={"fields": sorted(set_fields.keys())},
    )

    if body.rerun_recommendation:
        await _maybe_rerun_recommendation(rowid)

    return await get_transaction(rowid)


# ── Receipt upload ──────────────────────────────────────────────────────────


@router.post("/transactions/{rowid}/receipt")
async def upload_receipt(
    rowid: int,
    file: UploadFile = File(...),
    submitted_by: str = Form("admin"),
    rerun_recommendation: bool = Form(True),
):
    if not _txn_exists(rowid):
        raise HTTPException(404, f"Transaction {rowid} not found")

    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")

    txn_dir = UPLOAD_ROOT / str(rowid)
    txn_dir.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}_{Path(file.filename or 'receipt').name}"
    target = txn_dir / safe_name
    target.write_bytes(raw)

    ocr_text = receipt_ocr.ocr_receipt(target)
    receipt_url = f"/uploads/receipts/{rowid}/{safe_name}"
    now = datetime.utcnow().isoformat()

    existing = db.query_df(
        "SELECT 1 FROM transaction_submissions WHERE transaction_rowid = ?", (rowid,)
    )
    with db.get_conn() as conn:
        if existing.empty:
            conn.execute(
                """INSERT INTO transaction_submissions
                   (transaction_rowid, receipt_url, receipt_ocr_text, submitted_at, submitted_by)
                   VALUES (?, ?, ?, ?, ?)""",
                (rowid, receipt_url, ocr_text, now, submitted_by),
            )
        else:
            conn.execute(
                """UPDATE transaction_submissions
                      SET receipt_url = ?, receipt_ocr_text = ?
                    WHERE transaction_rowid = ?""",
                (receipt_url, ocr_text, rowid),
            )

    activity.emit(
        "receipt_uploaded",
        f"Receipt uploaded ({file.filename})",
        actor=submitted_by,
        transaction_rowid=rowid,
        approval_id=_approval_id_for_txn(rowid),
        metadata={"filename": file.filename, "ocr_chars": len(ocr_text)},
    )

    if rerun_recommendation:
        await _maybe_rerun_recommendation(rowid)

    return await get_transaction(rowid)


@router.delete("/transactions/{rowid}/receipt")
async def remove_receipt(rowid: int):
    df = db.query_df(
        "SELECT receipt_url FROM transaction_submissions WHERE transaction_rowid = ?",
        (rowid,),
    )
    if df.empty or not df.iloc[0]["receipt_url"]:
        raise HTTPException(404, "No receipt on file")

    receipt_url = df.iloc[0]["receipt_url"]
    db.execute(
        """UPDATE transaction_submissions
              SET receipt_url = NULL, receipt_ocr_text = NULL
            WHERE transaction_rowid = ?""",
        (rowid,),
    )

    # Best-effort delete of the file on disk
    try:
        local = Path(__file__).resolve().parent.parent.parent / receipt_url.lstrip("/")
        if local.exists():
            local.unlink()
    except Exception:
        logger.exception("Failed to delete receipt file %s", receipt_url)

    activity.emit(
        "submission_updated",
        "Receipt removed",
        actor="admin",
        transaction_rowid=rowid,
        approval_id=_approval_id_for_txn(rowid),
    )
    return {"removed": True, "transaction_rowid": rowid}


# ── Helpers ──────────────────────────────────────────────────────────────────


def _txn_exists(rowid: int) -> bool:
    df = db.query_df("SELECT 1 FROM transactions WHERE rowid = ? LIMIT 1", (rowid,))
    return not df.empty


async def _maybe_rerun_recommendation(rowid: int) -> None:
    """If this transaction has a pending approval, re-run the recommendation."""
    approval_id = _approval_id_for_txn(rowid)
    if approval_id is None:
        return
    status_df = db.query_df(
        "SELECT status, employee_id FROM approvals WHERE id = ?", (approval_id,)
    )
    if status_df.empty or status_df.iloc[0]["status"] != "pending":
        return

    txn_df = db.query_df(
        """SELECT rowid, *,
                  merchant_info_dba_name AS merchant
             FROM transactions WHERE rowid = ?""",
        (rowid,),
    )
    if txn_df.empty:
        return
    txn = txn_df.iloc[0].to_dict()
    emp = db.get_employee(str(status_df.iloc[0]["employee_id"]))
    try:
        await recommend_for_transaction(
            txn=txn, employee=emp, approval_id=approval_id, actor="agent",
        )
    except Exception as exc:
        logger.warning("re-run recommendation failed for txn %s: %s", rowid, exc)
