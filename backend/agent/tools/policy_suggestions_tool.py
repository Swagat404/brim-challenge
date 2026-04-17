"""
PolicySuggestionsTool — proactive suggestions surfaced in the /policy left rail
and via the policy_editor chat persona.

Categories (matching Ramp's Policy Suggestions):
    needs_detail        — vague language that the agent can't enforce
    conflicting         — two parts of the policy disagree
    unintended_manual   — wording sends a high volume of expenses to "review"
    missing_coverage    — common spending scenarios the policy doesn't address

Generation is real (Claude). It scans:
    1. The current structured policy JSON
    2. Recent agent_activity (which decisions are being escalated to "review"?)
    3. Recent policy_violations (what keeps tripping the rules?)

Apply / dismiss are simple state transitions on the policy_suggestions row.
Apply also patches the structured policy and emits a `suggestion_applied`
activity row.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Literal, Optional

import anthropic
from pydantic import BaseModel, Field

from agent.models import ToolResult
from agent.tools.base_tool import BaseTool
from data import db, policy_loader
from services import activity

logger = logging.getLogger(__name__)


CATEGORIES = ("needs_detail", "conflicting", "unintended_manual", "missing_coverage")


class PolicySuggestionsTool(BaseTool):
    name = "manage_policy_suggestions"
    description = (
        "Proactive AI suggestions for improving the expense policy. "
        "Use to: list current suggestions, generate a new batch (scans the "
        "current policy + recent activity for ambiguities and gaps), apply a "
        "suggestion (patches the policy), or dismiss one."
    )

    class InputSchema(BaseModel):
        action: Literal["list", "generate", "apply", "dismiss"]
        suggestion_id: Optional[int] = Field(None, description="Required for apply/dismiss")
        focus: Optional[str] = Field(
            None,
            description="Optional generation focus, e.g. 'ambiguity' to bias toward needs_detail.",
        )

    async def execute(self, params: InputSchema) -> ToolResult:
        if params.action == "list":
            return self._list()
        if params.action == "generate":
            return await self._generate(focus=params.focus)
        if params.action == "apply":
            return self._apply(params.suggestion_id)
        if params.action == "dismiss":
            return self._dismiss(params.suggestion_id)
        return self.err(f"Unknown action: {params.action}")

    # ── Read ────────────────────────────────────────────────────────────────

    def _list(self) -> ToolResult:
        rows = list_open_suggestions()
        return self.ok(
            f"{len(rows)} open policy suggestions.",
            data=rows,
        )

    # ── Generate ────────────────────────────────────────────────────────────

    async def _generate(self, *, focus: Optional[str]) -> ToolResult:
        await self.emit_progress("Scanning policy for gaps and ambiguities…")
        new_rows = await generate_suggestions(focus=focus)
        return self.ok(
            f"Generated {len(new_rows)} new suggestions.",
            data=new_rows,
        )

    # ── Apply / Dismiss ─────────────────────────────────────────────────────

    def _apply(self, suggestion_id: Optional[int]) -> ToolResult:
        if suggestion_id is None:
            return self.err("suggestion_id required for apply")
        applied = apply_suggestion(suggestion_id)
        if applied is None:
            return self.err(f"Suggestion {suggestion_id} not found or already resolved")
        return self.ok(f"Applied suggestion {suggestion_id}.", data=[applied])

    def _dismiss(self, suggestion_id: Optional[int]) -> ToolResult:
        if suggestion_id is None:
            return self.err("suggestion_id required for dismiss")
        ok = dismiss_suggestion(suggestion_id)
        if not ok:
            return self.err(f"Suggestion {suggestion_id} not found or already resolved")
        return self.ok(f"Dismissed suggestion {suggestion_id}.")


# ── Pure functions (importable by routes / seeders / tests) ─────────────────


def list_open_suggestions(limit: int = 20) -> list[dict]:
    df = db.query_df(
        """SELECT id, category, title, body, suggested_edit_json, status, created_at
             FROM policy_suggestions
            WHERE status = 'open'
            ORDER BY created_at DESC
            LIMIT ?""",
        (limit,),
    )
    rows = df.to_dict("records") if not df.empty else []
    for r in rows:
        raw = r.pop("suggested_edit_json", None)
        try:
            r["suggested_edit"] = json.loads(raw) if raw else None
        except (TypeError, ValueError):
            r["suggested_edit"] = None
    return rows


def list_all_suggestions(limit: int = 50) -> list[dict]:
    df = db.query_df(
        """SELECT id, category, title, body, suggested_edit_json, status, created_at
             FROM policy_suggestions
            ORDER BY (status = 'open') DESC, created_at DESC
            LIMIT ?""",
        (limit,),
    )
    rows = df.to_dict("records") if not df.empty else []
    for r in rows:
        raw = r.pop("suggested_edit_json", None)
        try:
            r["suggested_edit"] = json.loads(raw) if raw else None
        except (TypeError, ValueError):
            r["suggested_edit"] = None
    return rows


async def generate_suggestions(*, focus: Optional[str] = None) -> list[dict]:
    """Real LLM scan over the live policy + recent activity. Persists rows."""
    policy = policy_loader.load_structured_policy()
    if not policy:
        return []

    # Recent activity context (what's getting escalated to review?)
    recent_review_df = db.query_df(
        """SELECT message, metadata_json FROM agent_activity
            WHERE action = 'recommended'
              AND occurred_at >= date('now','-30 days')
            ORDER BY occurred_at DESC LIMIT 30"""
    )
    recent_violations_df = db.query_df(
        """SELECT violation_type, severity, description FROM policy_violations
            WHERE detected_at >= date('now','-90 days')
            ORDER BY detected_at DESC LIMIT 30"""
    )

    context = {
        "policy": policy,
        "recent_recommendations": recent_review_df.to_dict("records") if not recent_review_df.empty else [],
        "recent_violations": recent_violations_df.to_dict("records") if not recent_violations_df.empty else [],
        "focus": focus or "balanced",
    }

    prompt = _PROMPT.format(context=json.dumps(context, indent=2, default=str))
    raw = await _call_claude(prompt)
    items = _parse_suggestions(raw)

    inserted: list[dict] = []
    now = datetime.utcnow().isoformat()
    with db.get_conn() as conn:
        for item in items:
            cur = conn.execute(
                """INSERT INTO policy_suggestions
                   (category, title, body, suggested_edit_json, status, created_at)
                   VALUES (?, ?, ?, ?, 'open', ?)""",
                (
                    item["category"], item["title"], item["body"],
                    json.dumps(item.get("suggested_edit")) if item.get("suggested_edit") else None,
                    now,
                ),
            )
            inserted.append({**item, "id": cur.lastrowid, "status": "open", "created_at": now})
    return inserted


def apply_suggestion(suggestion_id: int) -> Optional[dict]:
    df = db.query_df(
        "SELECT * FROM policy_suggestions WHERE id = ? LIMIT 1",
        (suggestion_id,),
    )
    if df.empty or df.iloc[0]["status"] != "open":
        return None
    row = df.iloc[0].to_dict()
    edit = json.loads(row["suggested_edit_json"]) if row.get("suggested_edit_json") else None
    if not edit:
        # Mark applied but don't mutate policy if no edit attached
        db.execute(
            "UPDATE policy_suggestions SET status = 'applied' WHERE id = ?",
            (suggestion_id,),
        )
        return row

    current = policy_loader.load_structured_policy() or {}
    from api.routes.policy_doc import _smart_merge
    merged = _smart_merge(current, edit)
    new_id = policy_loader.save_structured_policy(merged, updated_by=f"suggestion:{suggestion_id}")
    db.execute(
        "UPDATE policy_suggestions SET status = 'applied' WHERE id = ?",
        (suggestion_id,),
    )
    activity.emit(
        "suggestion_applied",
        f"Applied suggestion: {row['title']}",
        actor="admin",
        metadata={"suggestion_id": suggestion_id, "policy_doc_id": new_id, "fields": list(edit.keys())},
    )
    return {**row, "status": "applied"}


def dismiss_suggestion(suggestion_id: int) -> bool:
    rows = db.execute(
        "UPDATE policy_suggestions SET status = 'dismissed' WHERE id = ? AND status = 'open'",
        (suggestion_id,),
    )
    return rows > 0


# ── Claude call ─────────────────────────────────────────────────────────────


_PROMPT = """You audit corporate expense policies for AI-enforcement quality.

Read the structured policy + recent agent activity below and produce a JSON array
of 0-6 suggestions for improvement. Each suggestion must point at a real gap or
ambiguity — do not fabricate concerns.

Each item:
{{
  "category": "needs_detail" | "conflicting" | "unintended_manual" | "missing_coverage",
  "title": "<short headline, 4-8 words>",
  "body": "<2-4 sentences explaining the gap, citing what you observed>",
  "suggested_edit": <optional JSON patch on top-level policy fields, or null>
}}

Categories:
- needs_detail: vague language the agent can't enforce ("reasonable amounts", "after hours")
- conflicting: two parts of the policy disagree
- unintended_manual: wording is sending many transactions to "review" unnecessarily
- missing_coverage: common spending scenario the policy doesn't address

If `focus` is set, bias toward that category but include others when warranted.
If you can't find any genuine gaps, return [].

Output ONLY the JSON array. No prose. No markdown fences.

<context>
{context}
</context>
"""


async def _call_claude(prompt: str) -> str:
    try:
        client = anthropic.AsyncAnthropic()
        msg = await asyncio.wait_for(
            client.messages.create(
                model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            ),
            timeout=30.0,
        )
        return msg.content[0].text.strip()
    except Exception as exc:
        logger.warning("policy_suggestions Claude call failed: %s", exc)
        return "[]"


def _parse_suggestions(raw: str) -> list[dict]:
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
    try:
        items = json.loads(raw)
    except (TypeError, ValueError):
        logger.warning("policy_suggestions: could not parse Claude output")
        return []
    if not isinstance(items, list):
        return []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        cat = it.get("category")
        if cat not in CATEGORIES:
            continue
        title = (it.get("title") or "").strip()
        body = (it.get("body") or "").strip()
        if not title or not body:
            continue
        out.append({
            "category": cat,
            "title": title,
            "body": body,
            "suggested_edit": it.get("suggested_edit"),
        })
    return out
