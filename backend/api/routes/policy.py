"""
Policy routes.

GET  /api/violations          — list cached violations (fast, no Claude)
POST /api/policy/scan         — trigger a fresh full scan (runs Phase 1 + Phase 2)
GET  /api/policy/summary      — aggregate counts by severity / employee
GET  /api/policy/rules        — parsed policy rules (read-only viewer)
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Query

from api.deps import get_agent
from data import db
from data.policy_loader import load_policy, FLEET_MCC_CODES, MCC_DESCRIPTIONS

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/violations")
async def list_violations(
    employee_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None, description="CRITICAL|HIGH|MEDIUM|LOW"),
    limit: int = Query(100, le=500),
):
    """Return cached policy violations. No Claude call — instant."""
    clauses = []
    params: list = []

    if employee_id:
        clauses.append("pv.employee_id = ?")
        params.append(employee_id)
    if severity:
        clauses.append("pv.severity = ?")
        params.append(severity.upper())

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    total_df = db.query_df(
        f"SELECT COUNT(*) as cnt FROM policy_violations pv {where}",
        tuple(params),
    )
    total = int(total_df.iloc[0]["cnt"]) if not total_df.empty else 0

    df = db.query_df(
        f"""SELECT pv.*, e.name as employee_name, e.department
            FROM policy_violations pv
            LEFT JOIN employees e ON pv.employee_id = e.id
            {where}
            ORDER BY CASE pv.severity
                WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1
                WHEN 'MEDIUM' THEN 2 ELSE 3 END
            LIMIT ?""",
        tuple(params + [limit]),
    )

    return {
        "violations": df.fillna("").to_dict("records") if not df.empty else [],
        "total": total,
    }


@router.get("/policy/summary")
async def policy_summary():
    """Aggregate violation counts — no scan, reads cached table."""
    by_severity = db.query_df(
        """SELECT severity, COUNT(*) as count, SUM(amount) as total_amount
           FROM policy_violations
           GROUP BY severity
           ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END"""
    )
    by_employee = db.query_df(
        """SELECT pv.employee_id, e.name as employee_name, e.department,
                  COUNT(*) as violation_count, SUM(pv.amount) as total_flagged
           FROM policy_violations pv
           LEFT JOIN employees e ON pv.employee_id = e.id
           GROUP BY pv.employee_id
           ORDER BY violation_count DESC
           LIMIT 20"""
    )
    return {
        "by_severity": by_severity.to_dict("records") if not by_severity.empty else [],
        "top_offenders": by_employee.to_dict("records") if not by_employee.empty else [],
    }


@router.get("/policy/rules")
async def get_policy_rules():
    """Return parsed policy rules for the read-only policy viewer."""
    policy = load_policy()
    return {
        "pre_auth_threshold": policy.get("pre_auth_threshold", 50.0),
        "receipt_required_above": policy.get("receipt_required_above", 50.0),
        "tip_service_max_pct": policy.get("tip_service_max_pct", 15.0),
        "tip_meal_max_pct": policy.get("tip_meal_max_pct", 20.0),
        "alcohol_customer_only": policy.get("alcohol_customer_only", True),
        "personal_card_fees_reimbursed": policy.get("personal_card_fees_reimbursed", False),
        "mcc_restricted": policy.get("mcc_restricted", []),
        "approval_thresholds": policy.get("approval_thresholds", {}),
        "source": policy.get("source", "fallback"),
        "fleet_mcc_codes": sorted(FLEET_MCC_CODES),
        "mcc_descriptions": {str(k): v for k, v in MCC_DESCRIPTIONS.items()},
        "policy_sections": policy.get("policy_sections", {}),
    }


@router.post("/policy/scan")
async def trigger_policy_scan():
    """Trigger a fresh policy compliance scan (Phase 1 + Phase 2)."""
    import asyncio
    import math
    from agent.tools.policy_check_tool import PolicyCheckTool

    def _sanitize(data: list) -> list:
        """Replace NaN/Inf floats that break JSON serialization."""
        clean = []
        for item in data:
            if isinstance(item, dict):
                clean.append({
                    k: (0.0 if isinstance(v, float) and (math.isnan(v) or math.isinf(v)) else v)
                    for k, v in item.items()
                })
            else:
                clean.append(item)
        return clean

    tool = PolicyCheckTool()
    params = tool.InputSchema(scope="all", use_cached=False)
    progress_q: asyncio.Queue = asyncio.Queue()
    tool.set_progress_queue(progress_q)

    try:
        result = await asyncio.wait_for(tool.execute(params), timeout=300.0)
        violations = _sanitize(result.data or [])
        return {
            "summary": result.text,
            "violation_count": len(violations),
            "violations": violations[:50],
            "error": result.error or None,
        }
    except asyncio.TimeoutError:
        # Phase 1 results already saved to DB — return them instead of empty
        cached = tool._get_cached_violations()
        cached_list = _sanitize(cached.fillna("").to_dict("records")) if not cached.empty else []
        return {
            "summary": f"Scan timed out but {len(cached_list)} Phase 1 violations were saved. AI enrichment may be partial.",
            "violation_count": len(cached_list),
            "violations": cached_list[:50],
            "error": None,
        }
    except Exception as exc:
        logger.exception("Policy scan failed")
        cached = tool._get_cached_violations()
        cached_list = _sanitize(cached.fillna("").to_dict("records")) if not cached.empty else []
        return {
            "summary": f"Scan error: {exc}. Returning {len(cached_list)} cached violations.",
            "violation_count": len(cached_list),
            "violations": cached_list[:50],
            "error": str(exc),
        }
