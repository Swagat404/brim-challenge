"""
Chat route — SSE streaming.

POST /api/chat  →  EventSourceResponse
Each agent event is streamed as a JSON-encoded SSE message.

Frontend event types:
  text_delta    — append text to current message bubble
  tool_start    — show "Querying transactions…" indicator
  tool_result   — hide indicator, show tool output
  chart         — render Recharts chart with the spec
  done          — finalize the message bubble
  error         — show error toast
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agent.models import EventType, Message, Role
from api.deps import (
    get_agent,
    get_session_history,
    trim_session_history,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


@router.post("/chat")
async def chat(request: Request, body: ChatRequest):
    """Stream agent responses as Server-Sent Events."""
    session_id = body.session_id or str(uuid.uuid4())
    history = get_session_history(session_id)
    agent = get_agent()

    # Append user message to history
    history.append(Message(role=Role.USER, content=body.message))

    async def event_stream() -> AsyncGenerator[dict, None]:
        # Send session_id first so frontend can store it
        yield {
            "event": "session",
            "data": json.dumps({"session_id": session_id}),
        }

        try:
            async for event in agent.run(body.message, history):
                if await request.is_disconnected():
                    logger.info("Client disconnected, stopping stream session=%s", session_id)
                    break

                payload: dict = {"type": event.type.value}

                if event.type == EventType.TEXT_DELTA:
                    payload["text"] = event.text
                elif event.type == EventType.TOOL_START:
                    payload["tool_name"] = event.tool_name
                    payload["tool_input"] = event.tool_input
                elif event.type == EventType.TOOL_RESULT:
                    payload["tool_name"] = event.tool_name
                    payload["output"] = event.tool_output
                elif event.type == EventType.CHART:
                    payload["chart"] = event.chart
                    payload["tool_name"] = event.tool_name
                elif event.type == EventType.ERROR:
                    payload["error"] = event.error
                elif event.type == EventType.DONE:
                    trim_session_history(session_id)

                yield {
                    "event": "message",
                    "data": json.dumps(payload),
                }

        except Exception as exc:
            logger.exception("Stream error session=%s: %s", session_id, exc)
            yield {
                "event": "message",
                "data": json.dumps({"type": "error", "error": str(exc)}),
            }

    return EventSourceResponse(event_stream())


@router.delete("/chat/{session_id}")
async def clear_session(session_id: str):
    """Clear session history for a given session."""
    from api.deps import clear_session as _clear
    _clear(session_id)
    return {"cleared": session_id}


@router.get("/chat/sessions")
async def get_sessions():
    """List active session IDs (for debugging)."""
    from api.deps import list_sessions
    return {"sessions": list_sessions()}
