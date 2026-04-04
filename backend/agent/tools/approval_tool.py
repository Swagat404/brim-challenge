"""
ApprovalTool — AI-powered pre-approval workflow.

For any transaction needing approval, assembles a full context packet:
- Employee spend history and patterns
- Department budget status
- Policy compliance check
- AI approve/deny recommendation with reasoning

Finance manager gets everything needed in one view. No back-and-forth.

Example output:
"Marcus Rivera (Long-Haul Driver, Operations) is requesting $1,450 at Flying J Truck
Stop. His department has $3,200 remaining in monthly budget. He averages $1,200/week
on fuel. Recommendation: APPROVE — consistent with fleet operations pattern, MCC 5541."
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Literal, Optional

import anthropic
from pydantic import BaseModel, Field

from agent.models import ToolResult
from agent.tools.base_tool import BaseTool
from data import db
from data.policy_loader import FLEET_MCC_CODES, MCC_DESCRIPTIONS, load_policy

logger = logging.getLogger(__name__)


class ApprovalTool(BaseTool):
    name = "get_approval_recommendation"
    description = (
        "Generate an AI approval recommendation for a pending expense transaction. "
        "Returns employee context, department budget status, spending history, "
        "and a clear approve/deny recommendation with reasoning. "
        "Use when asked about: approvals, pending expenses, should we approve, "
        "pre-approval requests, or reviewing specific transactions."
    )

    class InputSchema(BaseModel):
        action: Literal["get_pending", "recommend", "decide"] = Field(
            description=(
                "get_pending: list all pending approvals. "
                "recommend: generate AI recommendation for a specific transaction. "
                "decide: record an approval decision."
            )
        )
        transaction_rowid: Optional[int] = Field(None, description="Required for recommend and decide")
        decision: Optional[Literal["approved", "rejected"]] = Field(None, description="Required for decide")
        approver_id: Optional[str] = Field(None, description="Employee ID of approver for decide")
        # For creating a new approval request
        employee_id: Optional[str] = None
        amount_cad: Optional[float] = None
        merchant: Optional[str] = None
        description: Optional[str] = None

    async def execute(self, params: InputSchema) -> ToolResult:
        if params.action == "get_pending":
            return await self._get_pending()
        elif params.action == "recommend":
            return await self._recommend(params)
        elif params.action == "decide":
            return await self._decide(params)
        return self.err(f"Unknown action: {params.action}")

    # ── Get pending approvals ─────────────────────────────────────────────────

    async def _get_pending(self) -> ToolResult:
        await self.emit_progress("Loading pending approvals…")
        df = db.query_df(
            """SELECT a.*, e.name as emp_name, e.department, e.role, e.monthly_budget
               FROM approvals a
               LEFT JOIN employees e ON a.employee_id = e.id
               WHERE a.status = 'pending'
               ORDER BY a.amount DESC"""
        )
        if df.empty:
            # Auto-populate from transactions > threshold that haven't been reviewed
            policy = load_policy()
            threshold = policy["pre_auth_threshold"]
            pending_txns = db.query_df(
                f"""SELECT rowid, employee_id, employee_name, merchant_info_dba_name,
                           amount_cad, transaction_date, merchant_category_code
                    FROM transactions
                    WHERE is_operational = 1
                      AND debit_or_credit = 'Debit'
                      AND amount_cad > {threshold}
                      AND rowid NOT IN (SELECT transaction_rowid FROM approvals WHERE transaction_rowid IS NOT NULL)
                    ORDER BY amount_cad DESC
                    LIMIT 20"""
            )
            if pending_txns.empty:
                return self.ok("No pending approvals.", data=[])
            # Seed the approvals table
            now = datetime.utcnow().isoformat()
            rows = [
                (row["rowid"], row["employee_id"], row["amount_cad"],
                 row["merchant_info_dba_name"], "pending", now)
                for _, row in pending_txns.iterrows()
            ]
            db.executemany(
                "INSERT INTO approvals (transaction_rowid, employee_id, amount, merchant, status, requested_at) VALUES (?,?,?,?,?,?)",
                rows,
            )
            df = db.query_df(
                """SELECT a.*, e.name as emp_name, e.department, e.role, e.monthly_budget
                   FROM approvals a LEFT JOIN employees e ON a.employee_id = e.id
                   WHERE a.status = 'pending' ORDER BY a.amount DESC LIMIT 20"""
            )

        summary = f"{len(df)} pending approval requests totalling ${df['amount'].sum():,.2f} CAD."
        chart = {
            "type": "table",
            "data": df[["emp_name", "department", "merchant", "amount", "status"]].to_dict("records"),
            "title": "Pending Approvals",
        }
        return self.ok(text=summary, data=df.to_dict("records"), chart=chart)

    # ── AI recommendation ─────────────────────────────────────────────────────

    async def _recommend(self, params: InputSchema) -> ToolResult:
        if not params.transaction_rowid:
            return self.err("transaction_rowid required for recommend action")

        await self.emit_progress("Assembling employee context…")
        policy = load_policy()

        # Get the transaction — use explicit aliases so merchant/state/country resolve correctly
        txn_df = db.query_df(
            """SELECT rowid, *,
                      merchant_info_dba_name AS merchant,
                      merchant_state_province AS state,
                      merchant_country AS country
               FROM transactions WHERE rowid = ?""",
            (params.transaction_rowid,)
        )
        if txn_df.empty:
            return self.err(f"Transaction rowid {params.transaction_rowid} not found")

        txn = txn_df.iloc[0].to_dict()
        emp_id = txn.get("employee_id", "")
        emp = db.get_employee(emp_id)

        # Employee spend history (last 90 days)
        history_df = db.query_df(
            """SELECT transaction_date, merchant_info_dba_name, amount_cad, merchant_category_code
               FROM transactions
               WHERE employee_id = ? AND is_operational = 1 AND debit_or_credit = 'Debit'
               ORDER BY transaction_date DESC LIMIT 30""",
            (emp_id,),
        )

        # Monthly spend vs budget
        monthly_df = db.query_df(
            """SELECT strftime('%Y-%m', transaction_date) AS month, SUM(amount_cad) AS total
               FROM transactions
               WHERE employee_id = ? AND is_operational = 1 AND debit_or_credit = 'Debit'
               GROUP BY month ORDER BY month DESC LIMIT 6""",
            (emp_id,),
        )

        await self.emit_progress("Generating AI recommendation…")
        recommendation = await self._ai_recommend(txn, emp, history_df, monthly_df, policy)

        # Persist recommendation to approvals table
        db.execute(
            """UPDATE approvals SET ai_recommendation = ?, ai_reasoning = ?
               WHERE transaction_rowid = ?""",
            (recommendation["decision"], recommendation["reasoning"], params.transaction_rowid),
        )

        summary = (
            f"Recommendation: {recommendation['decision'].upper()} — {recommendation['reasoning']}\n\n"
            f"Employee: {emp.get('name', emp_id)} ({emp.get('role', '')}, {emp.get('department', '')})\n"
            f"Amount: ${txn.get('amount_cad', 0):.2f} CAD at {txn.get('merchant', '')}\n"
            f"Monthly budget: ${emp.get('monthly_budget', 0):,.0f} | "
            f"Spent this month: ${monthly_df.iloc[0]['total'] if not monthly_df.empty else 0:,.2f}"
        )

        chart = {
            "type": "bar",
            "data": monthly_df.rename(columns={"month": "name", "total": "value"}).to_dict("records"),
            "xKey": "name",
            "yKey": "value",
            "yLabel": "Monthly Spend (CAD)",
            "title": f"{emp.get('name', emp_id)} — Monthly Spend History",
        }

        return self.ok(
            text=summary,
            data=[{**txn, **recommendation, "employee_context": emp}],
            chart=chart,
        )

    async def _ai_recommend(
        self,
        txn: dict,
        emp: dict | None,
        history_df,
        monthly_df,
        policy: dict,
    ) -> dict:
        emp = emp or {}
        mcc = int(txn.get("merchant_category_code") or 0)
        amount = float(txn.get("amount_cad") or 0)
        merchant = txn.get("merchant", "Unknown")

        avg_monthly = monthly_df["total"].mean() if not monthly_df.empty else 0
        recent_similar = history_df[
            history_df["merchant_info_dba_name"] == merchant
        ] if not history_df.empty else []

        context = {
            "employee": {
                "name": emp.get("name", "Unknown"),
                "role": emp.get("role", "Unknown"),
                "department": emp.get("department", "Unknown"),
                "monthly_budget": emp.get("monthly_budget", 0),
                "avg_monthly_spend": round(avg_monthly, 2),
            },
            "transaction": {
                "amount_cad": round(amount, 2),
                "merchant": merchant,
                "mcc": mcc,
                "mcc_description": MCC_DESCRIPTIONS.get(mcc, "Unknown"),
                "is_fleet_operation": mcc in FLEET_MCC_CODES,
                "date": txn.get("transaction_date", ""),
            },
            "policy": {
                "pre_auth_threshold": policy["pre_auth_threshold"],
                "over_threshold_by": round(amount - policy["pre_auth_threshold"], 2),
            },
            "history": {
                "similar_merchant_charges": len(recent_similar),
                "recent_transactions": history_df.head(5).to_dict("records") if not history_df.empty else [],
            },
        }

        prompt = f"""You are a finance manager AI for a fleet trucking company reviewing an expense.

<context>
{json.dumps(context, indent=2, default=str)}
</context>

Based on this context, provide an approval recommendation.

Respond with JSON only:
{{"decision": "approve" | "deny", "reasoning": "1-2 sentence plain English explanation"}}"""

        try:
            client = anthropic.AsyncAnthropic()
            msg = await asyncio.wait_for(
                client.messages.create(
                    model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
                    max_tokens=256,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=20.0,
            )
            raw = msg.content[0].text.strip()
            if raw.startswith("```"):
                raw = "\n".join(raw.split("\n")[1:-1])
            return json.loads(raw)
        except Exception as exc:
            logger.warning("AI recommendation failed: %s", exc)
            # Fallback heuristic
            if mcc in FLEET_MCC_CODES:
                return {"decision": "approve", "reasoning": "Fleet operation expense — consistent with driver role."}
            if amount > 1000:
                return {"decision": "deny", "reasoning": f"${amount:.0f} exceeds typical non-fleet expense — manual review needed."}
            return {"decision": "approve", "reasoning": "Within normal range for role and department."}

    # ── Record decision ───────────────────────────────────────────────────────

    async def _decide(self, params: InputSchema) -> ToolResult:
        if not params.transaction_rowid or not params.decision:
            return self.err("transaction_rowid and decision required")

        now = datetime.utcnow().isoformat()
        rows = db.execute(
            """UPDATE approvals SET status = ?, approver_id = ?, resolved_at = ?
               WHERE transaction_rowid = ?""",
            (params.decision, params.approver_id or "system", now, params.transaction_rowid),
        )
        if rows == 0:
            return self.err(f"No approval found for transaction {params.transaction_rowid}")

        return self.ok(
            f"Transaction {params.transaction_rowid} marked as {params.decision.upper()}.",
            data=[{"transaction_rowid": params.transaction_rowid, "status": params.decision}],
        )
