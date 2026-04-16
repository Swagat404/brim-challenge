"""
FastAPI application entry point.

Lifespan:
  - Startup: verify DB connection, warm up policy cache, log employee/transaction counts.
  - Shutdown: nothing needed (SQLite, in-memory sessions — no cleanup required).

CORS: wide open in dev (frontend runs on :3000, backend on :8000).
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import (
    activity,
    analytics,
    approvals,
    budgets,
    chat,
    policy,
    policy_doc,
    reports,
    submissions,
    suggestions,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    try:
        from data import db
        from data.policy_loader import load_policy

        # Warm up policy cache (reads PDF or falls back to hardcoded rules)
        policy = load_policy()
        logger.info("Policy loaded — source=%s, pre_auth_threshold=$%.0f",
                    policy.get("source", "unknown"), policy.get("pre_auth_threshold", 0))

        # Sanity-check DB
        emp_count = db.query_df("SELECT COUNT(*) as n FROM employees").iloc[0]["n"]
        txn_count = db.query_df("SELECT COUNT(*) as n FROM transactions").iloc[0]["n"]
        op_count = db.query_df(
            "SELECT COUNT(*) as n FROM transactions WHERE is_operational=1"
        ).iloc[0]["n"]
        logger.info("DB ready — %d employees, %d transactions (%d operational)",
                    emp_count, txn_count, op_count)

    except Exception as exc:
        # Don't crash on startup — log and let the app boot anyway
        logger.error("Startup check failed (non-fatal): %s", exc)

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("Shutting down.")


app = FastAPI(
    title="Sift Expense Intelligence API",
    version="2.0.0",
    description=(
        "Sift Policy Agent — AI-powered expense intelligence platform. "
        "Three-state recommendations, policy editor with chat assistant, "
        "proactive policy suggestions, per-transaction submission flow, "
        "department + employee budget controls, and a unified activity feed."
    ),
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Frontend (Next.js) runs on :3000 in dev; in prod set CORS_ORIGINS env var.
_origins_env = os.environ.get("CORS_ORIGINS", "")
origins = (
    [o.strip() for o in _origins_env.split(",") if o.strip()]
    if _origins_env
    else ["http://localhost:3000", "http://127.0.0.1:3000"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(policy.router, prefix="/api", tags=["policy"])
app.include_router(policy_doc.router, prefix="/api", tags=["policy_doc"])
app.include_router(suggestions.router, prefix="/api", tags=["suggestions"])
app.include_router(approvals.router, prefix="/api", tags=["approvals"])
app.include_router(reports.router, prefix="/api", tags=["reports"])
app.include_router(analytics.router, prefix="/api", tags=["analytics"])
app.include_router(activity.router, prefix="/api", tags=["activity"])
app.include_router(budgets.router, prefix="/api", tags=["budgets"])
app.include_router(submissions.router, prefix="/api", tags=["submissions"])

# ── Static uploads (receipts) ────────────────────────────────────────────────
_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")


@app.get("/health")
async def health():
    """Lightweight health check — used by Docker/load-balancer."""
    from data import db
    txn_count = db.query_df("SELECT COUNT(*) as n FROM transactions").iloc[0]["n"]
    return {"status": "ok", "transactions": int(txn_count)}
