"""
GET    /api/policy/suggestions          — list (open by default; ?include_resolved=1 for all)
POST   /api/policy/suggestions/generate — run the LLM scan and persist new ones
PATCH  /api/policy/suggestions/{id}     — body: {"action": "apply" | "dismiss"}
"""
from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, Body, HTTPException, Query
from pydantic import BaseModel

from agent.tools import policy_suggestions_tool as suggestions_mod

router = APIRouter()


@router.get("/policy/suggestions")
async def list_suggestions(include_resolved: bool = Query(False)):
    if include_resolved:
        rows = suggestions_mod.list_all_suggestions()
    else:
        rows = suggestions_mod.list_open_suggestions()
    return {"suggestions": rows, "total": len(rows)}


@router.post("/policy/suggestions/generate")
async def generate(focus: str | None = Query(None)):
    try:
        rows = await asyncio.wait_for(
            suggestions_mod.generate_suggestions(focus=focus),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(504, "Generation timed out")
    return {"suggestions": rows, "total": len(rows)}


class SuggestionAction(BaseModel):
    action: Literal["apply", "dismiss"]


@router.patch("/policy/suggestions/{suggestion_id}")
async def update_suggestion(suggestion_id: int, body: SuggestionAction):
    if body.action == "apply":
        applied = suggestions_mod.apply_suggestion(suggestion_id)
        if applied is None:
            raise HTTPException(404, "Suggestion not found or already resolved")
        return {"status": "applied", "suggestion": applied}
    if body.action == "dismiss":
        ok = suggestions_mod.dismiss_suggestion(suggestion_id)
        if not ok:
            raise HTTPException(404, "Suggestion not found or already resolved")
        return {"status": "dismissed", "suggestion_id": suggestion_id}
    raise HTTPException(400, f"Unknown action: {body.action}")
