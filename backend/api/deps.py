"""
FastAPI dependency injection.

The ExpenseAgent is a singleton — one instance, shared across all requests.
Session history is NOT on the agent. It lives here, keyed by session_id.
"""
from __future__ import annotations

import logging
from collections import defaultdict

from agent.base_agent import ExpenseAgent
from agent.models import Message
from agent.tools.approval_tool import ApprovalTool
from agent.tools.policy_check_tool import PolicyCheckTool
from agent.tools.query_tool import QueryTool
from agent.tools.report_tool import ReportTool
from agent.tools.sql_query_tool import SQLQueryTool

logger = logging.getLogger(__name__)

# ── Singleton agent ───────────────────────────────────────────────────────────

_agent: ExpenseAgent | None = None


def get_agent() -> ExpenseAgent:
    global _agent
    if _agent is None:
        _agent = ExpenseAgent(tools=[
            QueryTool(),
            SQLQueryTool(),
            PolicyCheckTool(),
            ApprovalTool(),
            ReportTool(),
        ])
    return _agent


# ── Session history store (in-memory, keyed by session_id) ───────────────────
# For a production system this would be Redis. For the hackathon, in-memory is fine.

_sessions: dict[str, list[Message]] = defaultdict(list)
_MAX_HISTORY_MESSAGES = 20  # Keep last 20 messages to stay within context limits


def get_session_history(session_id: str) -> list[Message]:
    return _sessions[session_id]


def trim_session_history(session_id: str) -> None:
    """
    Keep only the last N messages to prevent context overflow.

    Critical: tool call pairs are [assistant: tool_use] + [user: tool_result].
    Trimming through the middle of a pair causes Anthropic API 400 errors
    ("tool_result without matching tool_use"). Always trim to a USER message
    boundary so we never keep a dangling tool_result without its tool_use.
    """
    history = _sessions[session_id]
    if len(history) <= _MAX_HISTORY_MESSAGES:
        return

    # Trim to last N messages, then scan forward to find a safe USER message start
    trimmed = history[-_MAX_HISTORY_MESSAGES:]
    for i, msg in enumerate(trimmed):
        if msg.role.value == "user":
            _sessions[session_id] = trimmed[i:]
            return
    # Fallback: keep all trimmed messages if no user message found
    _sessions[session_id] = trimmed


def clear_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


def list_sessions() -> list[str]:
    return list(_sessions.keys())
