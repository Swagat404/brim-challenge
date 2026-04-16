"""
FastAPI dependency injection.

Two ExpenseAgent personas live here as singletons:
  - 'analytics'     — the existing /chat page (transaction queries, reports, etc.)
  - 'policy_editor' — the right-sidebar chat on /policy (drafts policy edits,
                      generates suggestions, finds affected approvals)

Session history is keyed by (session_id, persona) so the two chats don't bleed
into each other if a user has both open.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Literal

from agent.base_agent import (
    ANALYTICS_SYSTEM_PROMPT,
    POLICY_EDITOR_SYSTEM_PROMPT,
    ExpenseAgent,
)
from agent.models import Message
from agent.tools.approval_tool import ApprovalTool
from agent.tools.policy_check_tool import PolicyCheckTool
from agent.tools.policy_editor_tool import PolicyEditorTool
from agent.tools.policy_suggestions_tool import PolicySuggestionsTool
from agent.tools.query_tool import QueryTool
from agent.tools.report_tool import ReportTool
from agent.tools.sql_query_tool import SQLQueryTool

logger = logging.getLogger(__name__)

Persona = Literal["analytics", "policy_editor"]

# ── Singleton agents (one per persona) ────────────────────────────────────────

_agents: dict[str, ExpenseAgent] = {}


def get_agent(persona: Persona = "analytics") -> ExpenseAgent:
    if persona in _agents:
        return _agents[persona]

    if persona == "analytics":
        _agents[persona] = ExpenseAgent(
            tools=[
                QueryTool(),
                SQLQueryTool(),
                PolicyCheckTool(),
                ApprovalTool(),
                ReportTool(),
            ],
            system_prompt=ANALYTICS_SYSTEM_PROMPT,
            persona="analytics",
        )
    elif persona == "policy_editor":
        _agents[persona] = ExpenseAgent(
            tools=[
                PolicyEditorTool(),
                PolicySuggestionsTool(),
                PolicyCheckTool(),  # for "find recurring violations"
            ],
            system_prompt=POLICY_EDITOR_SYSTEM_PROMPT,
            persona="policy_editor",
        )
    else:
        raise ValueError(f"Unknown persona: {persona!r}")
    return _agents[persona]


# ── Session history (keyed by session_id + persona) ──────────────────────────

_sessions: dict[str, list[Message]] = defaultdict(list)
_MAX_HISTORY_MESSAGES = 20


def _key(session_id: str, persona: Persona) -> str:
    return f"{persona}:{session_id}"


def get_session_history(session_id: str, persona: Persona = "analytics") -> list[Message]:
    return _sessions[_key(session_id, persona)]


def trim_session_history(session_id: str, persona: Persona = "analytics") -> None:
    """Keep only the last N messages; trim to a USER message boundary so we
    never split a tool_use/tool_result pair (which would 400 the API)."""
    key = _key(session_id, persona)
    history = _sessions[key]
    if len(history) <= _MAX_HISTORY_MESSAGES:
        return
    trimmed = history[-_MAX_HISTORY_MESSAGES:]
    for i, msg in enumerate(trimmed):
        if msg.role.value == "user":
            _sessions[key] = trimmed[i:]
            return
    _sessions[key] = trimmed


def clear_session(session_id: str, persona: Persona = "analytics") -> None:
    _sessions.pop(_key(session_id, persona), None)


def list_sessions() -> list[str]:
    return list(_sessions.keys())
