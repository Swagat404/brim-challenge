"""
Core dataclasses for the expense agent.
Intentionally minimal — no external deps beyond stdlib.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ─── Message types (match Anthropic API shapes) ───────────────────────────────

class Role(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


@dataclass
class ToolUseBlock:
    id: str
    name: str
    input: dict[str, Any]
    type: str = "tool_use"


@dataclass
class ToolResultBlock:
    tool_use_id: str
    content: str
    type: str = "tool_result"


@dataclass
class TextBlock:
    text: str
    type: str = "text"


@dataclass
class Message:
    role: Role
    # content is str for simple messages, list[block] for tool interactions
    content: str | list[ToolUseBlock | ToolResultBlock | TextBlock]


# ─── Agent streaming events ───────────────────────────────────────────────────

class EventType(str, Enum):
    TEXT_DELTA = "text_delta"
    TOOL_START = "tool_start"
    TOOL_RESULT = "tool_result"
    CHART = "chart"
    DONE = "done"
    ERROR = "error"


@dataclass
class AgentEvent:
    type: EventType
    # Populated depending on type:
    text: str = ""                         # TEXT_DELTA
    tool_name: str = ""                    # TOOL_START, TOOL_RESULT
    tool_input: dict[str, Any] = field(default_factory=dict)   # TOOL_START
    tool_output: str = ""                  # TOOL_RESULT
    chart: dict[str, Any] | None = None    # CHART
    error: str = ""                        # ERROR


# ─── Tool response ────────────────────────────────────────────────────────────

@dataclass
class ToolResult:
    """Returned by BaseTool.execute(). Carries structured data + optional chart."""
    text: str                              # always: human-readable summary
    data: list[dict[str, Any]] = field(default_factory=list)  # tabular rows
    chart: dict[str, Any] | None = None   # Recharts-compatible spec
    error: str = ""                        # non-empty = failure
