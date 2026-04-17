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
        from data.policy_loader import (
            PolicyNotBootstrappedError,
            load_structured_policy,
        )

        # Warm up the structured-policy cache. If nothing's bootstrapped yet
        # we DON'T crash the app — the admin needs to be able to use the
        # /policy upload flow to populate it.
        doc = load_structured_policy()
        if doc is None:
            logger.warning(
                "No policy document loaded. Run "
                "`python data_pipeline/bootstrap_policy_doc.py` or upload a "
                "policy PDF via the /policy editor before the AI tools will work."
            )
        else:
            thresholds = doc.get("thresholds", {}) or {}
            logger.info(
                "Policy loaded: '%s' | pre_auth=$%s | sections=%d",
                doc.get("name"),
                thresholds.get("pre_auth"),
                len(doc.get("sections", [])),
            )

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
# Frontend (Next.js) runs on :3000 in dev; in prod set CORS_ORIGINS to the public
# frontend origin(s), comma-separated, e.g. https://my-app.up.railway.app
# Trailing slashes are stripped so they match the browser Origin header.
_cors_raw = os.environ.get("CORS_ORIGINS", "").strip()
if _cors_raw:
    origins = [
        o.strip().rstrip("/")
        for o in _cors_raw.split(",")
        if o.strip()
    ]
else:
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

logger.info("CORS allow_origins: %s", origins)

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
    """Lightweight health check — used by Docker/load-balancer.

    Always returns HTTP 200 if the process is up so Railway/Nixpacks health
    checks pass even when DB_PATH is misconfigured (empty sqlite, wrong path).
    """
    try:
        from data import db
        txn_count = db.query_df("SELECT COUNT(*) as n FROM transactions").iloc[0]["n"]
        return {"status": "ok", "transactions": int(txn_count)}
    except Exception as exc:
        logger.warning("Health DB probe failed (process still alive): %s", exc)
        return {
            "status": "ok",
            "db": "unavailable",
            "hint": "Unset DB_PATH in Railway or use an absolute path to backend/brim_expenses.db",
        }
