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

from api.routes import analytics, approvals, chat, policy, reports

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
    title="Brim Expense Intelligence API",
    version="1.0.0",
    description=(
        "AI-powered expense intelligence platform. "
        "NL queries, policy compliance engine, pre-approval workflow, "
        "and automated expense report generation."
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
app.include_router(approvals.router, prefix="/api", tags=["approvals"])
app.include_router(reports.router, prefix="/api", tags=["reports"])
app.include_router(analytics.router, prefix="/api", tags=["analytics"])


@app.get("/health")
async def health():
    """Lightweight health check — used by Docker/load-balancer."""
    from data import db
    txn_count = db.query_df("SELECT COUNT(*) as n FROM transactions").iloc[0]["n"]
    return {"status": "ok", "transactions": int(txn_count)}
