"""
PolicyCheckTool — two-phase expense policy compliance engine.

Phase 1 (deterministic, ~1ms/transaction):
    Six targeted rule types replace the old catch-all threshold rule.
    Pre-filters ~4,400 transactions down to ~100-150 meaningful violations.

Phase 2 (Claude, batched + concurrent):
    Context enrichment — Claude re-ranks severity and adds plain-English reasoning.
    "A $520 dinner at STK Toronto → HIGH (sales entertained 6 clients, verify guest list)."
    "Same $311 charge at Skeans Pneumatic 6 days apart → HIGH (likely duplicate billing)."

Rule types (Phase 1):
    SPLIT_TRANSACTION   — multiple charges same merchant/day ducking the approval threshold
    PERSONAL_EXPENSE    — grocery, pharmacy, hobby MCCs on a corporate card
    HIGH_MEAL_EXPENSE   — restaurant charges over $200, Phase 2 checks team vs solo
    ALCOHOL_NO_CONTEXT  — alcohol MCC without customer entertainment evidence
    DUPLICATE_CHARGE    — same employee, same merchant, same amount within 7 days
    LUXURY_HOTEL        — hotel night > $400 (pre-approval required per policy)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Literal, Optional

import anthropic
import pandas as pd
from pydantic import BaseModel, Field

from agent.models import ToolResult
from agent.tools.base_tool import BaseTool
from data import db
from data.policy_loader import FLEET_MCC_CODES, MCC_DESCRIPTIONS, load_policy

logger = logging.getLogger(__name__)

SEVERITY = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]

VIOLATION_TYPES = {
    "SPLIT_TRANSACTION": "Potential split transaction to avoid approval threshold",
    "PERSONAL_EXPENSE": "Personal expense category on corporate card",
    "HIGH_MEAL_EXPENSE": "High restaurant charge — verify business purpose and attendees",
    "ALCOHOL_NO_CONTEXT": "Alcohol purchase without customer entertainment context",
    "DUPLICATE_CHARGE": "Possible duplicate charge at same merchant within 7 days",
    "LUXURY_HOTEL": "Hotel charge exceeds per-night policy limit — requires pre-approval",
}

# Personal-use MCCs: grocery, pharmacy, hobby, discount retail
PERSONAL_MCC_CODES: set[int] = {5411, 5912, 5945, 7922, 5999, 5310}

# Hotel MCCs
HOTEL_MCC_CODES: set[int] = {7011, 3500, 3501, 3502, 3503, 3504}

# Alcohol MCCs
ALCOHOL_MCC_CODES: set[int] = {5921, 5813}

# Restaurant MCCs
RESTAURANT_MCC_CODES: set[int] = {5812}

TOLL_MERCHANT_PREFIXES = (
    "DTOPS", "NDHP", "TXDMV", "WSDOT", "VCN*KANSAS",
    "PZG**MT DEPT", "SD DEPT OF TRANS", "AB TRANSP",
    "MI SUPERLOAD", "OKC SIZE",
)

MAX_ENRICHMENT_ITEMS = 75
CONCURRENT_BATCHES = 3


class PolicyCheckTool(BaseTool):
    name = "check_policy_compliance"
    description = (
        "Scan expense transactions against the company policy and return violations. "
        "Use when asked to: audit expenses, find policy violations, check compliance, "
        "identify suspicious transactions, or find repeat offenders. "
        "Returns violations ranked by severity with AI reasoning."
    )

    class InputSchema(BaseModel):
        scope: Literal["all", "employee", "department", "recent"] = Field(
            default="all",
            description="Which transactions to scan"
        )
        employee_id: Optional[str] = None
        department: Optional[str] = None
        start_date: Optional[str] = Field(None, description="ISO date YYYY-MM-DD")
        end_date: Optional[str] = Field(None, description="ISO date YYYY-MM-DD")
        use_cached: bool = Field(
            default=True,
            description="Return cached violations from last scan if available"
        )

    async def execute(self, params: InputSchema) -> ToolResult:
        policy = load_policy()

        if params.use_cached and params.scope == "all":
            cached = self._get_cached_violations()
            if not cached.empty:
                await self.emit_progress(f"Returning {len(cached)} cached violations…")
                return self._format_result(cached, policy, from_cache=True)

        await self.emit_progress("Phase 1: running rule-based checks…")
        transactions = db.get_transactions(
            employee_id=params.employee_id,
            department=params.department,
            start_date=params.start_date,
            end_date=params.end_date,
            operational_only=True,
            limit=5000,
        )

        if transactions.empty:
            return self.ok("No transactions found for the given scope.")

        violations = self._phase1_rules(transactions, policy)
        splits = db.find_split_candidates(threshold=policy["approval_thresholds"]["manager"])

        for _, row in splits.iterrows():
            merchant = str(row.get("merchant", ""))
            if any(merchant.startswith(prefix) for prefix in TOLL_MERCHANT_PREFIXES):
                continue
            violations.append({
                "employee_id": row["employee_id"],
                "employee_name": row["employee_name"],
                "merchant": row["merchant"],
                "transaction_date": row["transaction_date"],
                "amount_cad": row["total_cad"],
                "violation_type": "SPLIT_TRANSACTION",
                "severity": "CRITICAL",
                "description": (
                    f"Potential split: {row['txn_count']} charges of "
                    f"{row['amounts']} at {row['merchant']} totalling "
                    f"${row['total_cad']:.2f} CAD on {row['transaction_date']}."
                ),
                "needs_context_enrichment": False,
                "ai_reasoning": "Multiple charges at same merchant on same day sum above approval threshold.",
            })

        if not violations:
            self._save_violations([])
            return self.ok(
                "No policy violations detected.",
                data=[],
            )

        severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
        violations.sort(key=lambda v: severity_order.get(v["severity"], 9))

        self._save_violations(violations)
        phase1_count = len(violations)

        await self.emit_progress(f"Phase 1 complete: {phase1_count} violations saved. Running AI context analysis…")

        # Phase 2: Claude context enrichment for non-split violations
        to_enrich = [v for v in violations if v.get("needs_context_enrichment", False)]
        if to_enrich:
            # Prioritize HIGH/CRITICAL first, then cap to avoid timeout
            to_enrich.sort(key=lambda v: severity_order.get(v["severity"], 9))
            if len(to_enrich) > MAX_ENRICHMENT_ITEMS:
                await self.emit_progress(
                    f"Enriching top {MAX_ENRICHMENT_ITEMS} of {len(to_enrich)} violations (prioritized by severity)…"
                )
                to_enrich = to_enrich[:MAX_ENRICHMENT_ITEMS]

            try:
                violations = await asyncio.wait_for(
                    self._phase2_enrich(violations, to_enrich, policy),
                    timeout=180.0,
                )
                violations.sort(key=lambda v: severity_order.get(v["severity"], 9))
                self._save_violations(violations)
                enriched_count = sum(1 for v in violations if v.get("ai_reasoning"))
                await self.emit_progress(
                    f"Phase 2 complete: {enriched_count} violations enriched with AI context."
                )
            except asyncio.TimeoutError:
                logger.warning("Phase 2 enrichment timed out — Phase 1 results already saved")
                await self.emit_progress(f"Phase 2 timed out. Returning {phase1_count} Phase 1 results.")
            except Exception as exc:
                logger.warning("Phase 2 enrichment failed: %s — Phase 1 results already saved", exc)
                await self.emit_progress(f"Phase 2 error: {exc}. Returning Phase 1 results.")

        vdf = pd.DataFrame(violations)
        return self._format_result(vdf, policy, from_cache=False)

    # ── Phase 1: deterministic rules ─────────────────────────────────────────

    def _phase1_rules(self, txns: pd.DataFrame, policy: dict) -> list[dict]:
        violations: list[dict] = []

        # ── Rule 1: Personal expense MCCs on a corporate card ─────────────────
        # Grocery, pharmacy, hobby stores — never legitimate fleet expenses.
        for _, row in txns.iterrows():
            amount = float(row.get("amount_cad", 0) or 0)
            mcc = int(float(row.get("mcc", 0) or 0))
            merchant = str(row.get("merchant", "") or "")
            emp_id = str(row.get("employee_id", "") or "")
            emp_name = str(row.get("employee_name", "") or "")
            date_str = str(row.get("transaction_date", "") or "")[:10]

            if mcc in PERSONAL_MCC_CODES and amount > 25:
                mcc_label = MCC_DESCRIPTIONS.get(mcc, f"MCC {mcc}")
                violations.append({
                    "employee_id": emp_id,
                    "employee_name": emp_name,
                    "merchant": merchant,
                    "transaction_date": date_str,
                    "amount_cad": round(amount, 2),
                    "mcc": mcc,
                    "violation_type": "PERSONAL_EXPENSE",
                    "severity": "HIGH" if amount > 100 else "MEDIUM",
                    "description": (
                        f"${amount:.2f} CAD at {merchant} ({mcc_label}) — "
                        f"personal-category merchant on corporate card. "
                        f"Policy prohibits personal expenses on corporate accounts."
                    ),
                    "needs_context_enrichment": True,
                    "ai_reasoning": "",
                })

        # ── Rule 2: High restaurant / dining charges ───────────────────────────
        # Charges over $200 at restaurants need business justification.
        # Phase 2 will distinguish team dinner (reasonable) from solo dining (violation).
        for _, row in txns.iterrows():
            amount = float(row.get("amount_cad", 0) or 0)
            mcc = int(float(row.get("mcc", 0) or 0))
            merchant = str(row.get("merchant", "") or "")
            emp_id = str(row.get("employee_id", "") or "")
            emp_name = str(row.get("employee_name", "") or "")
            date_str = str(row.get("transaction_date", "") or "")[:10]

            if mcc in RESTAURANT_MCC_CODES and amount > 200:
                violations.append({
                    "employee_id": emp_id,
                    "employee_name": emp_name,
                    "merchant": merchant,
                    "transaction_date": date_str,
                    "amount_cad": round(amount, 2),
                    "mcc": mcc,
                    "violation_type": "HIGH_MEAL_EXPENSE",
                    "severity": "HIGH" if amount > 400 else "MEDIUM",
                    "description": (
                        f"${amount:.2f} CAD at {merchant} — high meal expense, "
                        f"requires documented business purpose, attendee names, and manager approval."
                    ),
                    "needs_context_enrichment": True,
                    "ai_reasoning": "",
                })

        # ── Rule 3: Alcohol purchases without customer context ─────────────────
        for _, row in txns.iterrows():
            amount = float(row.get("amount_cad", 0) or 0)
            mcc = int(float(row.get("mcc", 0) or 0))
            merchant = str(row.get("merchant", "") or "")
            emp_id = str(row.get("employee_id", "") or "")
            emp_name = str(row.get("employee_name", "") or "")
            date_str = str(row.get("transaction_date", "") or "")[:10]

            if mcc in ALCOHOL_MCC_CODES and amount > 20:
                violations.append({
                    "employee_id": emp_id,
                    "employee_name": emp_name,
                    "merchant": merchant,
                    "transaction_date": date_str,
                    "amount_cad": round(amount, 2),
                    "mcc": mcc,
                    "violation_type": "ALCOHOL_NO_CONTEXT",
                    "severity": "MEDIUM",
                    "description": (
                        f"${amount:.2f} CAD at {merchant} — alcohol purchase. "
                        f"Policy permits alcohol only when dining with a customer; "
                        f"guest names and business purpose required."
                    ),
                    "needs_context_enrichment": True,
                    "ai_reasoning": "",
                })

        # ── Rule 4: Luxury hotel charges (> $400/night) ────────────────────────
        for _, row in txns.iterrows():
            amount = float(row.get("amount_cad", 0) or 0)
            mcc = int(float(row.get("mcc", 0) or 0))
            merchant = str(row.get("merchant", "") or "")
            emp_id = str(row.get("employee_id", "") or "")
            emp_name = str(row.get("employee_name", "") or "")
            date_str = str(row.get("transaction_date", "") or "")[:10]

            if mcc in HOTEL_MCC_CODES and amount > 400:
                violations.append({
                    "employee_id": emp_id,
                    "employee_name": emp_name,
                    "merchant": merchant,
                    "transaction_date": date_str,
                    "amount_cad": round(amount, 2),
                    "mcc": mcc,
                    "violation_type": "LUXURY_HOTEL",
                    "severity": "HIGH" if amount > 1000 else "MEDIUM",
                    "description": (
                        f"${amount:.2f} CAD at {merchant} — hotel charge exceeds "
                        f"$400/night policy guideline. Pre-approval and business justification required."
                    ),
                    "needs_context_enrichment": True,
                    "ai_reasoning": "",
                })

        # ── Rule 5: Duplicate charges (same emp + merchant + amount, 1–7 days) ─
        violations.extend(self._detect_duplicates(txns))

        return violations

    def _detect_duplicates(self, txns: pd.DataFrame) -> list[dict]:
        """Flag same employee / same merchant / same amount (±$2) within 7 days."""
        violations: list[dict] = []
        if txns.empty:
            return violations

        df = txns.copy()
        df["_date"] = pd.to_datetime(df["transaction_date"], errors="coerce")
        df["_mcc"] = df["mcc"].fillna(0).astype(float).astype(int)
        df["_amount_bucket"] = (df["amount_cad"].fillna(0) / 2).round(0) * 2  # bucket to nearest $2
        df = df[df["amount_cad"] > 30].copy()  # ignore tiny charges
        df = df.sort_values(["employee_id", "merchant", "_amount_bucket", "_date"])

        seen: dict[tuple, str] = {}  # (emp, merchant, bucket) → first_date
        seen_row: dict[tuple, dict] = {}

        for _, row in df.iterrows():
            amount = float(row.get("amount_cad", 0) or 0)
            mcc = int(float(row.get("mcc", 0) or 0))
            # Skip fleet and hotel MCCs (scale tickets repeat legitimately; tolls repeat)
            if mcc in FLEET_MCC_CODES or mcc in HOTEL_MCC_CODES:
                continue
            merchant = str(row.get("merchant", "") or "")
            emp_id = str(row.get("employee_id", "") or "")
            emp_name = str(row.get("employee_name", "") or "")
            date_dt = row["_date"]
            bucket = row["_amount_bucket"]
            key = (emp_id, merchant, bucket)

            if key in seen and pd.notna(date_dt) and pd.notna(seen[key]):
                diff = (date_dt - seen[key]).days
                if 1 <= diff <= 7:
                    first_row = seen_row[key]
                    violations.append({
                        "employee_id": emp_id,
                        "employee_name": emp_name,
                        "merchant": merchant,
                        "transaction_date": str(date_dt)[:10],
                        "amount_cad": round(amount, 2),
                        "mcc": mcc,
                        "violation_type": "DUPLICATE_CHARGE",
                        "severity": "HIGH",
                        "description": (
                            f"${amount:.2f} CAD at {merchant} charged twice: "
                            f"{str(first_row['_date'])[:10]} and {str(date_dt)[:10]} "
                            f"({diff} day{'s' if diff > 1 else ''} apart). "
                            f"Possible double-billing or duplicate submission."
                        ),
                        "needs_context_enrichment": True,
                        "ai_reasoning": "",
                    })
                    continue  # don't update seen — only flag first duplicate pair

            seen[key] = date_dt
            seen_row[key] = row

        return violations

    # ── Phase 2: Claude context enrichment ───────────────────────────────────

    async def _phase2_enrich(
        self, all_violations: list[dict], to_enrich: list[dict], policy: dict
    ) -> list[dict]:
        batch_size = int(os.environ.get("POLICY_BATCH_SIZE", "15"))
        client = anthropic.AsyncAnthropic()

        enriched_map: dict[int, dict] = {}
        batches = []
        for i in range(0, len(to_enrich), batch_size):
            batches.append((i, to_enrich[i : i + batch_size]))

        total_batches = len(batches)
        await self.emit_progress(f"AI analysis: {total_batches} batches, {CONCURRENT_BATCHES} concurrent…")

        # Run batches with limited concurrency via semaphore
        sem = asyncio.Semaphore(CONCURRENT_BATCHES)

        async def run_batch(batch_idx: int, start: int, batch: list[dict]) -> None:
            async with sem:
                try:
                    results = await asyncio.wait_for(
                        self._enrich_batch(client, batch, policy),
                        timeout=60.0,
                    )
                    for offset, result in enumerate(results):
                        enriched_map[start + offset] = result
                    await self.emit_progress(
                        f"AI batch {batch_idx + 1}/{total_batches} done ({len(results)} enriched)"
                    )
                except asyncio.TimeoutError:
                    logger.warning("Policy enrichment batch %d timed out", batch_idx)
                except Exception as exc:
                    logger.warning("Policy enrichment batch %d failed: %s", batch_idx, exc)

        tasks = [
            run_batch(idx, start, batch)
            for idx, (start, batch) in enumerate(batches)
        ]
        await asyncio.gather(*tasks)

        # Merge enriched results back
        enrich_idx = 0
        for v in all_violations:
            if v.get("needs_context_enrichment"):
                enriched = enriched_map.get(enrich_idx)
                if enriched:
                    v["severity"] = enriched.get("severity", v["severity"])
                    v["ai_reasoning"] = enriched.get("reasoning", "")
                enrich_idx += 1

        return all_violations

    async def _enrich_batch(
        self, client: anthropic.AsyncAnthropic, batch: list[dict], policy: dict
    ) -> list[dict]:
        violations_text = json.dumps(
            [
                {
                    "idx": i,
                    "employee": v["employee_name"],
                    "merchant": v["merchant"],
                    "amount_cad": v["amount_cad"],
                    "mcc": v.get("mcc", 0),
                    "mcc_description": MCC_DESCRIPTIONS.get(v.get("mcc", 0), "Unknown"),
                    "date": v["transaction_date"],
                    "violation_type": v["violation_type"],
                    "current_severity": v["severity"],
                }
                for i, v in enumerate(batch)
            ],
            indent=2,
        )

        prompt = f"""You are a senior finance auditor reviewing expense violations for a fleet trucking company.
The company runs long-haul trucks across the USA and Canada. Drivers log multi-day trips;
hotels, restaurants, and supplies on-the-road are legitimate. Office staff and management
have stricter guidelines.

Policy context:
- Alcohol only when dining with a customer (names of guests required)
- Meal tip max {policy['tip_meal_max_pct']:.0f}%
- Hotel nights above $400 require pre-approval
- Personal expenses (grocery, pharmacy, hobby stores) on corporate cards are prohibited
- HIGH restaurant charges: a $250 team dinner for 5 drivers on a long-haul stop ≠ solo dining
- DUPLICATE charges: same merchant same amount within 7 days is suspicious (double billing)

For each violation, decide:
1. severity: CRITICAL | HIGH | MEDIUM | LOW
2. reasoning: 1-2 sharp sentences. Mention role context (driver on route vs office staff),
   whether the charge pattern is suspicious, and what action is needed.

Examples of good reasoning:
- "STK Toronto is a luxury steakhouse; $520 for a solo Sales director dinner far exceeds policy. Flag for itemized receipt and guest list."
- "Shoppers Drug Mart is a pharmacy chain; $758 on a corporate card suggests personal purchases. Request itemized receipt."
- "Same $311 charge at Skeans Pneumatic 6 days apart may indicate a vendor double-billing issue. Verify with AP."

<violations>
{violations_text}
</violations>

Respond with a JSON array of exactly {len(batch)} objects:
[{{"idx": 0, "severity": "...", "reasoning": "..."}}, ...]
No other text."""

        msg = await client.messages.create(
            model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)

    # ── Persistence ───────────────────────────────────────────────────────────

    def _save_violations(self, violations: list[dict]) -> None:
        now = datetime.utcnow().isoformat()
        rows = [
            (
                v.get("employee_id", ""),
                v.get("violation_type", ""),
                v.get("severity", "MEDIUM"),
                v.get("description", "") + " " + v.get("ai_reasoning", ""),
                v.get("amount_cad", 0),
                now,
            )
            for v in violations
        ]
        with db.get_conn() as conn:
            conn.execute("DELETE FROM policy_violations WHERE 1=1")
            conn.executemany(
                """INSERT INTO policy_violations
                   (employee_id, violation_type, severity, description, amount, detected_at)
                   VALUES (?,?,?,?,?,?)""",
                rows,
            )

    def _get_cached_violations(self) -> pd.DataFrame:
        return db.query_df(
            """SELECT pv.*, e.name as employee_name, e.department
               FROM policy_violations pv
               LEFT JOIN employees e ON pv.employee_id = e.id
               ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END"""
        )

    # ── Result formatting ─────────────────────────────────────────────────────

    def _format_result(self, vdf: pd.DataFrame, policy: dict, from_cache: bool) -> ToolResult:
        counts = vdf["severity"].value_counts().to_dict() if "severity" in vdf.columns else {}
        critical = counts.get("CRITICAL", 0)
        high = counts.get("HIGH", 0)
        medium = counts.get("MEDIUM", 0)

        cache_note = " (from cache)" if from_cache else ""
        summary = (
            f"Found {len(vdf)} policy violations{cache_note}: "
            f"{critical} CRITICAL, {high} HIGH, {medium} MEDIUM. "
        )
        if critical > 0:
            summary += "Critical violations require immediate review."

        chart = {
            "type": "bar",
            "data": [
                {"name": sev, "value": cnt}
                for sev, cnt in sorted(counts.items(), key=lambda x: ["CRITICAL","HIGH","MEDIUM","LOW"].index(x[0]) if x[0] in ["CRITICAL","HIGH","MEDIUM","LOW"] else 9)
            ],
            "xKey": "name",
            "yKey": "value",
            "yLabel": "Violation Count",
            "title": "Policy Violations by Severity",
        }

        records = vdf.fillna("").to_dict("records")
        return self.ok(
            text=summary,
            data=records,
            chart=chart,
        )
