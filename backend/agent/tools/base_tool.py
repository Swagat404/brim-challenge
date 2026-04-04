"""
Abstract BaseTool — all expense tools inherit from this.
Pattern borrowed from agent_core/Tools/base_tool.py, stripped of tensorstax deps.
"""
from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from agent.models import ToolResult

logger = logging.getLogger(__name__)


class BaseTool(ABC):
    """
    Base class for all expense agent tools.

    Subclasses must define:
        name        str   — matches the tool name Claude will call
        description str   — shown to Claude in the tools schema
        InputSchema       — Pydantic model Claude fills in

    And implement:
        execute(params: InputSchema) -> ToolResult
    """

    name: str
    description: str

    class InputSchema(BaseModel):
        """Override in subclass with actual fields."""
        pass

    # ── Tool schema for Anthropic API ────────────────────────────────────────

    def to_claude_schema(self) -> dict[str, Any]:
        """Return the tool definition dict Anthropic's API expects."""
        schema = self.InputSchema.model_json_schema()
        # Anthropic wants input_schema without the title field at top level
        schema.pop("title", None)
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": schema,
        }

    # ── Progress reporting ────────────────────────────────────────────────────

    _progress_queue: Optional[asyncio.Queue] = None

    def set_progress_queue(self, queue: asyncio.Queue) -> None:
        self._progress_queue = queue

    async def emit_progress(self, message: str) -> None:
        if self._progress_queue:
            await self._progress_queue.put({"type": "progress", "tool": self.name, "message": message})

    # ── Response helpers ──────────────────────────────────────────────────────

    def ok(self, text: str, data: Optional[List] = None, chart: Optional[Dict] = None) -> ToolResult:
        return ToolResult(text=text, data=data or [], chart=chart)

    def err(self, message: str) -> ToolResult:
        logger.warning("[%s] error: %s", self.name, message)
        return ToolResult(text=message, error=message)

    # ── Execute ───────────────────────────────────────────────────────────────

    @abstractmethod
    async def execute(self, params: BaseModel) -> ToolResult:
        """Run the tool. Never raises — return err() on failure."""
        raise NotImplementedError
