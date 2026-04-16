"""
PolicyEditorTool — exposed to the policy_editor chat persona.

Actions:
    read                                  — return current structured policy
    propose_edit                          — return a diff for review (no write)
    apply_edit                            — persist a previously-proposed edit
    transactions_affected_by_last_edit    — list approvals re-evaluated since
                                            the most recent policy_edit event

Edits are shallow merges of the top-level policy keys (sections, thresholds,
restrictions, auto_approval_rules, submission_requirements, etc.) — same
contract as PATCH /api/policy/document.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from agent.models import ToolResult
from agent.tools.base_tool import BaseTool
from data import db, policy_loader
from services import activity

logger = logging.getLogger(__name__)


class PolicyEditorTool(BaseTool):
    name = "manage_policy_document"
    description = (
        "Read, propose edits to, apply edits to, or inspect the impact of recent "
        "edits on the company's structured expense policy. Use 'read' to see the "
        "current document, 'propose_edit' to draft a change for the user's review, "
        "'apply_edit' to persist a confirmed change, and "
        "'transactions_affected_by_last_edit' to list approvals re-evaluated since "
        "the most recent policy edit."
    )

    class InputSchema(BaseModel):
        action: Literal[
            "read", "propose_edit", "apply_edit", "transactions_affected_by_last_edit"
        ]
        edit: Optional[dict[str, Any]] = Field(
            None,
            description=(
                "For propose_edit and apply_edit: an object with the top-level "
                "policy fields you want to change. The new values fully replace "
                "the existing values for those keys."
            ),
        )
        rationale: Optional[str] = Field(
            None, description="Optional human-readable explanation of the edit."
        )

    async def execute(self, params: InputSchema) -> ToolResult:
        if params.action == "read":
            return self._read()
        if params.action == "propose_edit":
            return self._propose(params)
        if params.action == "apply_edit":
            return self._apply(params)
        if params.action == "transactions_affected_by_last_edit":
            return self._affected()
        return self.err(f"Unknown action: {params.action}")

    # ── Actions ─────────────────────────────────────────────────────────────

    def _read(self) -> ToolResult:
        doc = policy_loader.load_structured_policy()
        if doc is None:
            return self.err("No structured policy bootstrapped yet")
        return self.ok(
            f"Policy '{doc.get('name', 'Unnamed')}' with {len(doc.get('sections', []))} sections.",
            data=[doc],
        )

    def _propose(self, params: InputSchema) -> ToolResult:
        if not params.edit:
            return self.err("propose_edit requires an `edit` object")
        current = policy_loader.load_structured_policy() or {}
        diff = _diff(current, params.edit)
        merged = {**current, **params.edit}
        return self.ok(
            f"Proposed edit touches {len(diff)} top-level field(s): {sorted(diff.keys())}. "
            "Confirm by calling apply_edit with the same `edit` object.",
            data=[{"current": current, "proposed": merged, "diff": diff,
                   "edit": params.edit, "rationale": params.rationale}],
        )

    def _apply(self, params: InputSchema) -> ToolResult:
        if not params.edit:
            return self.err("apply_edit requires an `edit` object")
        current = policy_loader.load_structured_policy() or {}
        merged = {**current, **params.edit}
        new_id = policy_loader.save_structured_policy(merged, updated_by="chat")
        activity.emit(
            "policy_edit",
            f"Policy edited via chat: {', '.join(sorted(params.edit.keys()))}"
            + (f" — {params.rationale}" if params.rationale else ""),
            actor="admin",
            metadata={
                "fields": sorted(params.edit.keys()),
                "policy_doc_id": new_id,
                "rationale": params.rationale,
            },
        )
        return self.ok(
            f"Policy updated. New version id {new_id}.",
            data=[{"id": new_id, "document": merged}],
        )

    def _affected(self) -> ToolResult:
        # Find the most recent policy_edit event
        last = db.query_df(
            """SELECT id, occurred_at FROM agent_activity
                WHERE action = 'policy_edit'
                ORDER BY occurred_at DESC LIMIT 1"""
        )
        if last.empty:
            return self.ok("No policy edits recorded yet.", data=[])
        last_at = last.iloc[0]["occurred_at"]

        # Approvals whose recommendation was emitted after the last edit
        df = db.query_df(
            """SELECT DISTINCT a.id AS approval_id,
                      a.merchant, a.amount, a.status, a.ai_decision,
                      a.policy_citation, ag.message, ag.occurred_at
                 FROM agent_activity ag
                 JOIN approvals a ON a.id = ag.approval_id
                WHERE ag.action IN ('recommended', 'auto_approved')
                  AND ag.occurred_at >= ?
                ORDER BY ag.occurred_at DESC LIMIT 100""",
            (last_at,),
        )
        rows = df.to_dict("records") if not df.empty else []
        return self.ok(
            f"{len(rows)} approval(s) re-evaluated since the most recent policy edit ({last_at}).",
            data=rows,
        )


# ── Helpers ──────────────────────────────────────────────────────────────────


def _diff(current: dict, edit: dict) -> dict:
    out = {}
    for k, after in edit.items():
        before = current.get(k)
        if json.dumps(before, sort_keys=True, default=str) != json.dumps(after, sort_keys=True, default=str):
            out[k] = {"before": before, "after": after}
    return out
