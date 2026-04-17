"""
ApprovalTool — AI-powered pre-approval workflow.

Pipeline:
    1. `_get_pending`     list pending approvals
    2. `_recommend`       for one pending approval:
                            a. check structured-policy auto_approval_rules first
                               → if a rule matches, mark `approved` and emit
                                 `auto_approved` activity (no Claude call)
                            b. otherwise assemble full context (employee,
                               department budgets, spend history, submission,
                               missing-requirements check) and ask Claude for a
                               three-state {approve|review|reject} decision +
                               cited policy section. Persist + emit `recommended`.
    3. `_decide`          record a human approve/reject; emit `human_decision`.

This file is intentionally the only place that writes to `approvals` for
recommendations — keeps the activity stream consistent.
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
from data.policy_loader import (
    FLEET_MCC_CODES,
    MCC_DESCRIPTIONS,
    load_policy,
    load_structured_policy,
)
from services import activity, auto_approval, submission_check

logger = logging.getLogger(__name__)


class ApprovalTool(BaseTool):
    name = "get_approval_recommendation"
    description = (
        "Generate an AI approval recommendation for a pending expense transaction. "
        "Returns employee context, department budget status, spending history, "
        "and a clear approve / review / reject recommendation with reasoning. "
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

        approval_id = _approval_id_for_txn(params.transaction_rowid)

        result = await recommend_for_transaction(
            txn=txn,
            employee=emp,
            approval_id=approval_id,
            actor="agent",
        )

        # Build a chart of the employee's monthly spend for the chat reply
        monthly_df = db.query_df(
            """SELECT strftime('%Y-%m', transaction_date) AS month, SUM(amount_cad) AS total
               FROM transactions
               WHERE employee_id = ? AND is_operational = 1 AND debit_or_credit = 'Debit'
               GROUP BY month ORDER BY month DESC LIMIT 6""",
            (emp_id,),
        )
        chart = {
            "type": "bar",
            "data": monthly_df.rename(columns={"month": "name", "total": "value"}).to_dict("records"),
            "xKey": "name",
            "yKey": "value",
            "yLabel": "Monthly Spend (CAD)",
            "title": f"{(emp or {}).get('name', emp_id)} — Monthly Spend History",
        }

        summary = (
            f"Recommendation: {result['decision'].upper()} — {result['reasoning']}\n\n"
            f"Employee: {(emp or {}).get('name', emp_id)} "
            f"({(emp or {}).get('role', '')}, {(emp or {}).get('department', '')})\n"
            f"Amount: ${float(txn.get('amount_cad') or 0):.2f} CAD at {txn.get('merchant', '')}\n"
        )
        if result.get("policy_citation"):
            summary += f"Policy: {result['policy_citation']}\n"

        return self.ok(text=summary, data=[result], chart=chart)

    # ── Record human decision ────────────────────────────────────────────────

    async def _decide(self, params: InputSchema) -> ToolResult:
        if not params.transaction_rowid or not params.decision:
            return self.err("transaction_rowid and decision required")

        now = datetime.utcnow().isoformat()
        approval_id = _approval_id_for_txn(params.transaction_rowid)

        rows = db.execute(
            """UPDATE approvals SET status = ?, approver_id = ?, resolved_at = ?
               WHERE transaction_rowid = ?""",
            (params.decision, params.approver_id or "system", now, params.transaction_rowid),
        )
        if rows == 0:
            return self.err(f"No approval found for transaction {params.transaction_rowid}")

        activity.emit(
            "human_decision",
            f"{params.decision.upper()} by {params.approver_id or 'system'}",
            actor=params.approver_id or "system",
            transaction_rowid=params.transaction_rowid,
            approval_id=approval_id,
            metadata={"decision": params.decision},
        )

        return self.ok(
            f"Transaction {params.transaction_rowid} marked as {params.decision.upper()}.",
            data=[{"transaction_rowid": params.transaction_rowid, "status": params.decision}],
        )


# ── Public helpers (importable by routes / seeders / tests) ──────────────────


async def recommend_for_transaction(
    *,
    txn: dict,
    employee: Optional[dict],
    approval_id: Optional[int],
    actor: str = "agent",
) -> dict:
    """Run the full recommendation pipeline for one transaction.

    1. Try auto-approval rules (no Claude call when matched).
    2. Otherwise call Claude with structured policy + budgets + submission
       context; persist three-state result; emit `recommended` activity.

    Returns: {
        "decision": "approve"|"review"|"reject",
        "reasoning": str,
        "policy_citation": str,
        "cited_section_id": str,
        "auto_approved": bool,
    }
    """
    structured = load_structured_policy()
    legacy = load_policy()
    amount = float(txn.get("amount_cad") or 0)
    mcc = int(txn.get("merchant_category_code") or 0) or None
    role = (employee or {}).get("role")

    # 1. Hard-block check — restricted MCCs reject without calling Claude.
    # These are policy-defined "never reimburse" categories (gambling,
    # personal-use retailers like pharmacies and grocery on a corporate card,
    # etc.). The MCC test trumps everything else: even a complete submission
    # can't unblock a personal expense category.
    blocked = set(
        (structured or {}).get("restrictions", {}).get("mcc_blocked", []) or []
    )
    if mcc is not None and int(mcc) in {int(m) for m in blocked}:
        return _apply_blocked_reject(
            txn=txn, approval_id=approval_id, mcc=int(mcc), actor=actor,
        )

    # 2. Auto-approval check
    auto_cfg = (structured or {}).get("auto_approval_rules", {}) if structured else {}
    matched_rule = auto_approval.find_matching_rule(
        amount=amount, mcc=mcc, role=role,
        auto_approval_config=auto_cfg,
    )
    if matched_rule:
        return _apply_auto_approval(
            txn=txn, approval_id=approval_id, rule=matched_rule, actor=actor,
        )

    # 2. Submission requirements check (informs the prompt and may force `review`)
    sub_row = _load_submission(int(txn["rowid"]))
    requirements = (structured or {}).get("submission_requirements", []) if structured else []
    missing = submission_check.missing_fields(
        amount=amount, mcc=mcc, submission=sub_row, requirements=requirements,
    )

    # 3. Build prompt context
    history_df = db.query_df(
        """SELECT transaction_date, merchant_info_dba_name, amount_cad, merchant_category_code
             FROM transactions
            WHERE employee_id = ? AND is_operational = 1 AND debit_or_credit = 'Debit'
            ORDER BY transaction_date DESC LIMIT 10""",
        ((employee or {}).get("id", ""),),
    )
    monthly_df = db.query_df(
        """SELECT strftime('%Y-%m', transaction_date) AS month, SUM(amount_cad) AS total
             FROM transactions
            WHERE employee_id = ? AND is_operational = 1 AND debit_or_credit = 'Debit'
            GROUP BY month ORDER BY month DESC LIMIT 6""",
        ((employee or {}).get("id", ""),),
    )
    dept_budget = _load_department_budget((employee or {}).get("department", ""))

    context = _build_context(
        txn=txn, employee=employee, history_df=history_df, monthly_df=monthly_df,
        dept_budget=dept_budget, structured_policy=structured,
        legacy_policy=legacy, submission=sub_row, missing=missing,
    )

    # 4. Ask Claude
    result = await _ask_claude(context, missing=missing)

    # 5. Persist + emit
    if approval_id is not None:
        db.execute(
            """UPDATE approvals
                  SET ai_decision = ?, ai_reasoning = ?,
                      policy_citation = ?, cited_section_id = ?
                WHERE id = ?""",
            (result["decision"], result["reasoning"],
             result.get("policy_citation"), result.get("cited_section_id"),
             approval_id),
        )

    activity.emit(
        "recommended",
        f"AI recommended {result['decision'].upper()}: {result['reasoning'][:140]}",
        actor=actor,
        transaction_rowid=int(txn["rowid"]),
        approval_id=approval_id,
        metadata={
            "decision": result["decision"],
            "cited_section_id": result.get("cited_section_id"),
            "missing_fields": [m["missing"] for m in missing] if missing else [],
        },
    )

    result["auto_approved"] = False
    return result


def _apply_blocked_reject(
    *,
    txn: dict,
    approval_id: Optional[int],
    mcc: int,
    actor: str,
) -> dict:
    """Mark an approval as REJECT because the MCC is in policy.mcc_blocked.
    Deterministic — no Claude call. The blocked-MCC test always wins over
    any other rule because the policy decision was already made when the
    admin added the MCC to the blocked list.
    """
    citation = (
        f"Merchant category {mcc} is on the policy's restricted list "
        "(personal-use category prohibited on the corporate card)."
    )
    decision = "reject"
    reasoning = (
        f"Reject. Merchant category {mcc} is in the policy's "
        "blocked-MCC list, which is a hard-line restriction on the "
        "corporate card. Recommend processing as a personal-card charge "
        "or requesting repayment from the employee."
    )

    if approval_id is not None:
        db.execute(
            """UPDATE approvals
                  SET ai_decision = ?,
                      ai_reasoning = ?,
                      policy_citation = ?,
                      cited_section_id = ?
                WHERE id = ?""",
            (decision, reasoning, citation, "blocked_mcc", approval_id),
        )

    activity.emit(
        "recommended",
        f"AI rejected: MCC {mcc} is policy-restricted",
        actor=actor,
        transaction_rowid=int(txn["rowid"]),
        approval_id=approval_id,
        metadata={"decision": decision, "blocked_mcc": mcc},
    )

    return {
        "decision": decision,
        "reasoning": reasoning,
        "policy_citation": citation,
        "cited_section_id": "blocked_mcc",
        "auto_approved": False,
    }


def _apply_auto_approval(
    *,
    txn: dict,
    approval_id: Optional[int],
    rule: dict,
    actor: str,
) -> dict:
    """Mark an approval as auto-approved per a matched rule. No Claude call."""
    citation = rule.get("rationale") or f"Auto-approval rule '{rule.get('id')}'"
    decision = "approve"
    reasoning = (
        f"Auto-approved under rule '{rule.get('id')}': {citation}"
    )

    if approval_id is not None:
        db.execute(
            """UPDATE approvals
                  SET status = 'approved',
                      ai_decision = ?,
                      ai_reasoning = ?,
                      policy_citation = ?,
                      cited_section_id = ?,
                      approver_id = ?,
                      resolved_at = ?
                WHERE id = ?""",
            (decision, reasoning, citation, f"auto:{rule.get('id')}",
             "agent", datetime.utcnow().isoformat(), approval_id),
        )

    activity.emit(
        "auto_approved",
        f"Auto-approved via rule '{rule.get('id')}'",
        actor=actor,
        transaction_rowid=int(txn["rowid"]),
        approval_id=approval_id,
        metadata={"rule_id": rule.get("id"), "amount": float(txn.get("amount_cad") or 0)},
    )

    return {
        "decision": decision,
        "reasoning": reasoning,
        "policy_citation": citation,
        "cited_section_id": f"auto:{rule.get('id')}",
        "auto_approved": True,
    }


def _build_context(
    *,
    txn: dict,
    employee: Optional[dict],
    history_df,
    monthly_df,
    dept_budget: Optional[dict],
    structured_policy: Optional[dict],
    legacy_policy: dict,
    submission: Optional[dict],
    missing: list[dict],
) -> dict:
    emp = employee or {}
    mcc = int(txn.get("merchant_category_code") or 0)
    amount = float(txn.get("amount_cad") or 0)
    avg_monthly = float(monthly_df["total"].mean()) if not monthly_df.empty else 0
    spent_this_month = float(monthly_df["total"].iloc[0]) if not monthly_df.empty else 0

    context = {
        "employee": {
            "name": emp.get("name", "Unknown"),
            "role": emp.get("role", "Unknown"),
            "department": emp.get("department", "Unknown"),
            "monthly_budget": emp.get("monthly_budget", 0),
            "avg_monthly_spend": round(avg_monthly, 2),
            "spent_this_month": round(spent_this_month, 2),
        },
        "transaction": {
            "amount_cad": round(amount, 2),
            "merchant": txn.get("merchant", "Unknown"),
            "mcc": mcc,
            "mcc_description": MCC_DESCRIPTIONS.get(mcc, "Unknown"),
            "is_fleet_operation": mcc in FLEET_MCC_CODES,
            "date": str(txn.get("transaction_date", "")),
        },
        "department_budget": (
            {
                "monthly_cap": dept_budget["monthly_cap"],
                "mtd_spend": dept_budget["mtd_spend"],
                "pct_used": (
                    round(100 * dept_budget["mtd_spend"] / dept_budget["monthly_cap"], 1)
                    if dept_budget["monthly_cap"] else None
                ),
            }
            if dept_budget else None
        ),
        "submission": _summarize_submission(submission),
        "missing_required_fields": missing,
        "policy": {
            "pre_auth_threshold": legacy_policy["pre_auth_threshold"],
            "over_threshold_by": round(amount - legacy_policy["pre_auth_threshold"], 2),
            "sections": [
                {"id": s["id"], "title": s["title"], "body": s["body"][:600],
                 "hidden_notes": s.get("hidden_notes", [])}
                for s in (structured_policy or {}).get("sections", [])
            ] if structured_policy else [],
        },
        "history": {
            "recent_transactions": history_df.head(5).to_dict("records") if not history_df.empty else [],
        },
    }
    return context


def _summarize_submission(submission: Optional[dict]) -> Optional[dict]:
    if not submission:
        return None
    attendees = []
    raw = submission.get("attendees_json")
    if raw:
        try:
            attendees = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            attendees = []
    return {
        "has_receipt": bool(submission.get("receipt_url")),
        "receipt_ocr_text": (submission.get("receipt_ocr_text") or "")[:1500] or None,
        "memo": submission.get("memo") or None,
        "business_purpose": submission.get("business_purpose") or None,
        "attendees": attendees,
        # GL code is intentionally NOT included in the prompt context
        # (per the Sift Policy Agent spec — accounting codes don't drive
        # policy decisions, matching Ramp's documented behaviour).
    }


def _approval_id_for_txn(transaction_rowid: int) -> Optional[int]:
    df = db.query_df(
        "SELECT id FROM approvals WHERE transaction_rowid = ? LIMIT 1",
        (transaction_rowid,),
    )
    return int(df.iloc[0]["id"]) if not df.empty else None


def _load_submission(transaction_rowid: int) -> Optional[dict]:
    df = db.query_df(
        "SELECT * FROM transaction_submissions WHERE transaction_rowid = ? LIMIT 1",
        (transaction_rowid,),
    )
    return df.iloc[0].to_dict() if not df.empty else None


def _load_department_budget(department: str) -> Optional[dict]:
    if not department:
        return None
    df = db.query_df(
        "SELECT monthly_cap FROM department_budgets WHERE department = ? LIMIT 1",
        (department,),
    )
    if df.empty:
        return None
    cap = float(df.iloc[0]["monthly_cap"])
    # Rolling 30 days from the latest transaction date (same anchor as
    # /api/budgets/departments) so the AI sees real numbers even when
    # the dataset doesn't extend to wall-clock today.
    mtd_df = db.query_df(
        """WITH latest AS (
              SELECT COALESCE(MAX(transaction_date), date('now')) AS d
                FROM transactions
               WHERE is_operational = 1 AND debit_or_credit = 'Debit'
           )
           SELECT COALESCE(SUM(amount_cad), 0) AS spent
             FROM transactions, latest
            WHERE department = ?
              AND is_operational = 1
              AND debit_or_credit = 'Debit'
              AND transaction_date >= date(latest.d, '-30 days')
              AND transaction_date <= latest.d""",
        (department,),
    )
    spent = float(mtd_df.iloc[0]["spent"] or 0)
    return {"monthly_cap": cap, "mtd_spend": spent}


# ── Claude prompt ────────────────────────────────────────────────────────────


_PROMPT_TEMPLATE = """You are Sift, the policy compliance reviewer for a fleet trucking company's expense system.

This request IS the pre-authorization step. You decide whether to grant it
based on the policy + the employee's submission. Don't fault the request for
"missing prior pre-authorization" — that's what we are doing right now.

Read the structured context and produce a single JSON object:

{{
  "decision": "approve" | "review" | "reject",
  "reasoning": "<two short sentences a finance manager would read>",
  "policy_citation": "<short snippet of the policy text or rule that drove your decision>",
  "cited_section_id": "<the matching policy.sections[].id, or empty string>"
}}

Decision rules:

REJECT  — clear policy violation. Examples: the merchant's MCC is in
          policy.restrictions.mcc_blocked; the transaction is on a personal
          card when corporate is required; restricted entertainment category
          on a corporate card without business context.

REVIEW  — required submission fields are missing OR the spend pattern is
          unusual for the role/budget OR the transaction sits in a grey area
          the policy doesn't clearly cover. If `missing_required_fields` is
          non-empty you MUST decide REVIEW and name the missing field(s).

APPROVE — the submission is complete (receipt + memo + any policy-required
          fields like attendees), the merchant fits the employee's role and
          spending pattern, the amount is within the employee's monthly
          budget, and there is no MCC restriction or other red flag. Fleet
          operations (fuel, tires, towing, parts) are explicitly exempt from
          the pre-auth threshold per policy.restrictions.mcc_fleet_exempt.

Important:
- Receipts that are demo placeholders are still receipts — treat
  `submission.has_receipt = true` as the receipt being present.
- Cite a real section id from policy.sections whenever the rule fired
  comes from a section.
- Output ONLY the JSON object. No prose before or after.

<context>
{context}
</context>
"""


class AIRecommendationError(RuntimeError):
    """Raised when the AI recommendation can't be obtained.

    Surfaced to the caller (FastAPI route or seed script) — never silently
    masked with a heuristic answer. The caller decides how to inform the
    user (e.g. the approvals UI shows a 'recommendation pending' state).
    """


async def _ask_claude(context: dict, *, missing: list[dict]) -> dict:
    prompt = _PROMPT_TEMPLATE.format(context=json.dumps(context, indent=2, default=str))
    try:
        client = anthropic.AsyncAnthropic()
        msg = await asyncio.wait_for(
            client.messages.create(
                model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
                max_tokens=512,
                messages=[{"role": "user", "content": prompt}],
            ),
            timeout=25.0,
        )
    except asyncio.TimeoutError as exc:
        raise AIRecommendationError("AI recommendation timed out") from exc
    except Exception as exc:
        raise AIRecommendationError(f"AI recommendation call failed: {exc}") from exc

    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])

    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError) as exc:
        raise AIRecommendationError(f"AI returned non-JSON output: {raw[:200]}") from exc

    decision = (parsed.get("decision") or "").lower()
    if decision not in {"approve", "review", "reject"}:
        raise AIRecommendationError(
            f"AI returned invalid decision {decision!r} — expected approve|review|reject"
        )
    reasoning = (parsed.get("reasoning") or "").strip()
    if not reasoning:
        raise AIRecommendationError("AI returned an empty reasoning field")

    return {
        "decision": decision,
        "reasoning": reasoning,
        "policy_citation": (parsed.get("policy_citation") or "").strip(),
        "cited_section_id": (parsed.get("cited_section_id") or "").strip(),
    }
