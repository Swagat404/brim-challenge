"""
agent_activity event service — single write path used by every component
that emits an event into the unified activity stream.

Why one helper: every emitter (ApprovalTool, PolicyCheckTool, suggestions
tool, policy editor tool, budget routes, submissions routes) writes the
same shape, so funneling them through one function keeps timestamps,
metadata serialization, and CHECK-constraint compliance consistent.

The action set is locked to the values the migration's CHECK constraint
allows; anything else raises before the SQL hits.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Literal, Optional

from data import db

logger = logging.getLogger(__name__)

ActivityAction = Literal[
    "recommended",
    "auto_approved",
    "flagged",
    "human_decision",
    "policy_edit",
    "suggestion_applied",
    "policy_uploaded",
    "budget_edited",
    "receipt_uploaded",
    "submission_updated",
]

_ALLOWED: set[str] = {
    "recommended", "auto_approved", "flagged", "human_decision",
    "policy_edit", "suggestion_applied", "policy_uploaded",
    "budget_edited", "receipt_uploaded", "submission_updated",
}


def emit(
    action: ActivityAction,
    message: str,
    *,
    actor: str = "agent",
    transaction_rowid: Optional[int] = None,
    approval_id: Optional[int] = None,
    metadata: Optional[dict] = None,
) -> int:
    """Write a single activity row. Returns the new row id.

    Never raises on bad input from agent code: if the action isn't allowed
    we log loudly and return 0 so the caller's flow continues.
    """
    if action not in _ALLOWED:
        logger.error("activity.emit: bad action %r (dropped)", action)
        return 0

    now = datetime.utcnow().isoformat()
    meta_json = json.dumps(metadata) if metadata else None
    with db.get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO agent_activity
               (occurred_at, actor, action, transaction_rowid, approval_id, message, metadata_json)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (now, actor, action, transaction_rowid, approval_id, message, meta_json),
        )
        return cur.lastrowid or 0


def recent(limit: int = 50, *, transaction_rowid: Optional[int] = None) -> list[dict]:
    """Read recent activity, optionally filtered to one transaction.

    Returned rows include parsed metadata; metadata_json column is preserved
    for any caller that wants the raw form.
    """
    if transaction_rowid is not None:
        df = db.query_df(
            """SELECT id, occurred_at, actor, action, transaction_rowid,
                      approval_id, message, metadata_json
                 FROM agent_activity
                WHERE transaction_rowid = ?
                ORDER BY occurred_at DESC, id DESC
                LIMIT ?""",
            (transaction_rowid, limit),
        )
    else:
        df = db.query_df(
            """SELECT id, occurred_at, actor, action, transaction_rowid,
                      approval_id, message, metadata_json
                 FROM agent_activity
                ORDER BY occurred_at DESC, id DESC
                LIMIT ?""",
            (limit,),
        )
    import math
    rows = df.to_dict("records") if not df.empty else []
    for r in rows:
        # pandas converts NULL ints/strings to NaN; coerce them back so the
        # response is JSON-serializable and the frontend types are correct.
        for key in ("transaction_rowid", "approval_id"):
            v = r.get(key)
            if v is None or (isinstance(v, float) and math.isnan(v)):
                r[key] = None
            else:
                try:
                    r[key] = int(v)
                except (TypeError, ValueError):
                    r[key] = None
        raw = r.get("metadata_json")
        if isinstance(raw, float) and math.isnan(raw):
            raw = None
        try:
            r["metadata"] = json.loads(raw) if raw else None
        except (TypeError, ValueError):
            r["metadata"] = None
    return rows


def rollup(window_days: int = 90) -> dict:
    """Auto-approval rollup numbers for the dashboard banner.

    Returns count + total $ of `auto_approved` events in the window, plus
    the most recent timestamp.
    """
    df = db.query_df(
        """SELECT a.id, a.occurred_at, a.approval_id, a.metadata_json,
                  ap.amount
             FROM agent_activity a
        LEFT JOIN approvals ap ON ap.id = a.approval_id
            WHERE a.action = 'auto_approved'
              AND a.occurred_at >= date('now', ?)""",
        (f"-{int(window_days)} days",),
    )
    if df.empty:
        return {"count": 0, "total_amount": 0.0, "last_at": None, "window_days": window_days}

    total = float(df["amount"].fillna(0).sum())
    last_at = df["occurred_at"].max()
    return {
        "count": int(len(df)),
        "total_amount": round(total, 2),
        "last_at": last_at,
        "window_days": window_days,
    }
