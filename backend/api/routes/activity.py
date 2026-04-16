"""
GET /api/activity         — recent agent activity, optionally per transaction
GET /api/activity/rollup  — auto-approval rollup numbers for the dashboard banner
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from services import activity

router = APIRouter()


@router.get("/activity")
async def list_activity(
    transaction_rowid: Optional[int] = Query(None),
    limit: int = Query(50, le=500),
):
    rows = activity.recent(limit=limit, transaction_rowid=transaction_rowid)
    return {"events": rows, "total": len(rows)}


@router.get("/activity/rollup")
async def activity_rollup(window_days: int = Query(90, ge=1, le=365)):
    return activity.rollup(window_days=window_days)
