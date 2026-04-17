"""
Structured policy document routes — the live "agent-facing" policy.

GET    /api/policy/document            — current structured JSON
PATCH  /api/policy/document            — typed partial update (any subset of top-level fields)
POST   /api/policy/document/upload     — multipart PDF; parse via Claude; return diff (no write)
POST   /api/policy/document/upload/confirm — apply a previously-parsed proposal

The chat sidebar's policy_editor persona writes through PATCH; the upload modal
writes through the upload endpoints. Both emit `policy_edit` / `policy_uploaded`
activity rows.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Body, File, HTTPException, UploadFile

from data import policy_loader
from services import activity
from services.policy_pdf_extractor import extract_structured_policy

router = APIRouter()
logger = logging.getLogger(__name__)


# In-memory holder for upload proposals between /upload and /upload/confirm.
# Single-admin demo, so a process-local dict is fine; production would back this
# with Redis or a `policy_upload_proposals` table.
_PENDING_UPLOADS: dict[str, dict] = {}


@router.get("/policy/document")
async def get_document():
    doc = policy_loader.load_structured_policy()
    if doc is None:
        raise HTTPException(404, "No structured policy bootstrapped yet")
    return {"document": doc}


@router.patch("/policy/document")
async def patch_document(
    patch: dict[str, Any] = Body(..., description="Partial update of top-level fields"),
):
    """Smart-merge update of the top-level keys of the policy JSON.

    Frontend forms (ThresholdsForm, AutoApprovalRulesForm,
    SubmissionRequirementsForm, PolicyDocumentEditor) always send the full
    sub-array for fields they own — those replace wholesale.

    But the chat-driven `policy_editor_tool.apply_edit` and
    `policy_suggestions_tool.apply_suggestion` paths often send a single new
    item meant to be appended (e.g. `{"sections": [{...one new section...}]}`).
    For arrays-of-objects-with-id (sections, hidden_notes nested in sections,
    auto_approval_rules.rules, submission_requirements) we merge by id so a
    suggestion that introduces ONE new section doesn't wipe the other four.
    """
    current = policy_loader.load_structured_policy()
    if current is None:
        raise HTTPException(404, "No current policy to patch")

    merged = _smart_merge(current, patch)
    new_id = policy_loader.save_structured_policy(merged, updated_by="admin")

    activity.emit(
        "policy_edit",
        f"Policy edited: {', '.join(sorted(patch.keys()))}",
        actor="admin",
        metadata={"fields": sorted(patch.keys()), "policy_doc_id": new_id},
    )
    return {"document": merged, "id": new_id}


@router.post("/policy/document/upload")
async def upload_policy(file: UploadFile = File(...)):
    """Parse an uploaded PDF and return a proposed JSON + diff. Does NOT save."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(415, "Only PDF uploads are supported")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(400, "Empty file")

    try:
        proposed = extract_structured_policy(pdf_bytes)
    except Exception as exc:
        logger.exception("policy upload extraction crashed")
        raise HTTPException(500, f"Extraction crashed: {exc}") from exc

    if proposed is None:
        raise HTTPException(422, "Could not extract a valid policy from this PDF")

    proposed_dict = proposed.model_dump()
    current = policy_loader.load_structured_policy() or {}
    diff = _shallow_diff(current, proposed_dict)

    proposal_id = uuid.uuid4().hex
    _PENDING_UPLOADS[proposal_id] = {
        "filename": file.filename, "proposed": proposed_dict,
    }
    return {
        "proposal_id": proposal_id,
        "filename": file.filename,
        "proposed": proposed_dict,
        "diff": diff,
    }


@router.post("/policy/document/upload/confirm")
async def confirm_upload(body: dict = Body(...)):
    proposal_id = body.get("proposal_id")
    if not proposal_id or proposal_id not in _PENDING_UPLOADS:
        raise HTTPException(404, "Unknown or expired proposal_id")

    pending = _PENDING_UPLOADS.pop(proposal_id)
    new_id = policy_loader.save_structured_policy(pending["proposed"], updated_by="upload")

    activity.emit(
        "policy_uploaded",
        f"Replaced policy from upload: {pending['filename']}",
        actor="admin",
        metadata={"filename": pending["filename"], "policy_doc_id": new_id},
    )
    return {"document": pending["proposed"], "id": new_id}


# ── Helpers ──────────────────────────────────────────────────────────────────


# Top-level fields that hold arrays of objects with an `id` field. When a
# patch supplies one of these, we merge by id (incoming items overwrite
# existing items with the same id; new items append; un-mentioned items
# stay put). For everything else, the patch value replaces the current one.
_ID_KEYED_ARRAYS = {"sections", "submission_requirements"}


def _smart_merge(current: dict, patch: dict) -> dict:
    out = {**current}
    for k, new_val in patch.items():
        if k == "auto_approval_rules" and isinstance(new_val, dict) and "rules" in new_val:
            existing_rules = (current.get("auto_approval_rules") or {}).get("rules", [])
            merged_rules = _merge_by_id(existing_rules, new_val["rules"])
            out["auto_approval_rules"] = {
                **(current.get("auto_approval_rules") or {}),
                **new_val,
                "rules": merged_rules,
            }
            continue

        if k in _ID_KEYED_ARRAYS and isinstance(new_val, list):
            existing = current.get(k) or []
            out[k] = _merge_by_id(existing, new_val)
            continue

        out[k] = new_val
    return out


def _merge_by_id(existing: list[dict], incoming: list[dict]) -> list[dict]:
    """Merge two lists of objects keyed on 'id'. Incoming overrides; new appends."""
    by_id = {item.get("id"): dict(item) for item in existing if item.get("id")}
    appended: list[dict] = []
    for item in incoming:
        item_id = item.get("id")
        if item_id and item_id in by_id:
            by_id[item_id] = {**by_id[item_id], **item}
        else:
            appended.append(item)
    return list(by_id.values()) + appended


def _shallow_diff(current: dict, proposed: dict) -> dict:
    """Per-top-level-key diff. Returns {field: {before, after, changed}} for changed keys."""
    diff = {}
    keys = set(current.keys()) | set(proposed.keys())
    for k in keys:
        before = current.get(k)
        after = proposed.get(k)
        if _norm(before) != _norm(after):
            diff[k] = {"before": before, "after": after, "changed": True}
    return diff


def _norm(v):
    """JSON-normalize so {a:1, b:2} and {b:2, a:1} compare equal."""
    return json.dumps(v, sort_keys=True, default=str)
