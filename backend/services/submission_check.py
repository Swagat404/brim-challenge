"""
Submission requirements check.

Walks `policy.submission_requirements` and returns the list of fields that are
required for the given transaction but missing from its submission row.

Used by:
  - ApprovalTool — if missing fields are non-empty, the AI prompt is told to
    default to `review` and cite the rule that fired.
  - Frontend (via /api/transactions/{rowid}) — drives the "Receipt needed"
    badges next to each transaction.
"""
from __future__ import annotations

import json
from typing import Optional


REQUIREABLE_FIELDS = {"receipt", "memo", "attendees", "business_purpose"}


def missing_fields(
    *,
    amount: float,
    mcc: Optional[int],
    submission: Optional[dict],
    requirements: list[dict],
) -> list[dict]:
    """Return [{"requirement_id": ..., "missing": [...], "rationale": ...}]
    for every requirement that applies to this transaction but isn't satisfied.

    `submission` is the `transaction_submissions` row dict (or None if no
    submission yet). `requirements` is the list from
    `policy.submission_requirements`.
    """
    out: list[dict] = []
    for req in requirements or []:
        if not _applies(req.get("applies_when") or {}, amount=amount, mcc=mcc):
            continue
        require = [f for f in (req.get("require") or []) if f in REQUIREABLE_FIELDS]
        missing = [f for f in require if not _has_field(submission, f)]
        if missing:
            out.append({
                "requirement_id": req.get("id"),
                "missing": missing,
                "rationale": req.get("rationale", ""),
            })
    return out


def _applies(when: dict, *, amount: float, mcc: Optional[int]) -> bool:
    amount_over = when.get("amount_over")
    if amount_over is not None and amount <= float(amount_over):
        return False

    amount_under = when.get("amount_under")
    if amount_under is not None and amount >= float(amount_under):
        return False

    mcc_in = when.get("mcc_in")
    if mcc_in:
        if mcc is None or int(mcc) not in {int(m) for m in mcc_in}:
            return False

    return True


def _has_field(submission: Optional[dict], field: str) -> bool:
    if submission is None:
        return False

    if field == "receipt":
        return bool(submission.get("receipt_url"))

    if field == "attendees":
        raw = submission.get("attendees_json")
        if not raw:
            return False
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            return False
        return bool(parsed) and isinstance(parsed, list) and len(parsed) > 0

    # memo, business_purpose
    val = submission.get(field)
    return bool(val and str(val).strip())
