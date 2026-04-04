"""
ReportTool — intelligent expense report generation.

Groups transactions by employee + time period into expense reports.
Each report includes:
- Categorized line items with MCC labels
- Policy compliance flags
- Total by category
- Status tracking (draft → submitted → approved)

Also detects "trip clusters" — transactions that form a natural trip
(same driver, consecutive dates, consistent geographic corridor).
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
from data.policy_loader import MCC_DESCRIPTIONS, load_policy

logger = logging.getLogger(__name__)


class ReportTool(BaseTool):
    name = "manage_expense_reports"
    description = (
        "Generate, list, or view expense reports. Groups transactions into reports "
        "by employee and time period. Can auto-detect trip clusters (hotel stays, "
        "restaurants, and transport in same city within 3 days). "
        "Use for: generating expense reports, viewing reports, summarizing spend for a period, "
        "grouping transactions for a trip or month."
    )

    class InputSchema(BaseModel):
        action: Literal["list", "generate", "view"] = Field(
            description=(
                "list: show existing reports. "
                "generate: create a new expense report. "
                "view: view a specific report's transactions."
            )
        )
        employee_id: Optional[str] = Field(None, description="Required for generate")
        period_start: Optional[str] = Field(None, description="ISO date YYYY-MM-DD")
        period_end: Optional[str] = Field(None, description="ISO date YYYY-MM-DD")
        report_id: Optional[int] = Field(None, description="Required for view action")
        department: Optional[str] = None

    async def execute(self, params: InputSchema) -> ToolResult:
        if params.action == "list":
            return await self._list_reports(params)
        elif params.action == "generate":
            return await self._generate_report(params)
        elif params.action == "view":
            return await self._view_report(params)
        return self.err(f"Unknown action: {params.action}")

    # ── List reports ──────────────────────────────────────────────────────────

    async def _list_reports(self, params: InputSchema) -> ToolResult:
        clauses = []
        sql_params = []
        if params.employee_id:
            clauses.append("r.employee_id = ?")
            sql_params.append(params.employee_id)
        if params.department:
            clauses.append("e.department = ?")
            sql_params.append(params.department)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        df = db.query_df(
            f"""SELECT r.id, r.report_name, r.period_start, r.period_end,
                       r.total_amount, r.status, r.created_at,
                       e.name as employee_name, e.department
                FROM expense_reports r
                LEFT JOIN employees e ON r.employee_id = e.id
                {where}
                ORDER BY r.created_at DESC LIMIT 50""",
            tuple(sql_params),
        )

        if df.empty:
            return self.ok("No expense reports found. Use action='generate' to create one.", data=[])

        total = df["total_amount"].sum()
        summary = f"{len(df)} expense reports. Total: ${total:,.2f} CAD."

        chart = {
            "type": "bar",
            "data": df[["employee_name", "total_amount"]].rename(
                columns={"employee_name": "name", "total_amount": "value"}
            ).to_dict("records"),
            "xKey": "name",
            "yKey": "value",
            "yLabel": "Report Total (CAD)",
            "title": "Expense Reports by Employee",
        }
        return self.ok(text=summary, data=df.to_dict("records"), chart=chart)

    # ── Generate report ───────────────────────────────────────────────────────

    async def _generate_report(self, params: InputSchema) -> ToolResult:
        if not params.employee_id:
            return self.err("employee_id required for generate action")

        emp = db.get_employee(params.employee_id)
        if not emp:
            return self.err(f"Employee {params.employee_id} not found")

        await self.emit_progress(f"Fetching transactions for {emp['name']}…")

        txns = db.get_transactions(
            employee_id=params.employee_id,
            start_date=params.period_start,
            end_date=params.period_end,
            operational_only=True,
            limit=500,
        )

        if txns.empty:
            return self.ok(f"No transactions found for {emp['name']} in that period.", data=[])

        policy = load_policy()
        debits = txns[txns["debit_or_credit"] == "Debit"].copy()
        total = float(debits["amount_cad"].sum())

        # Categorize by MCC
        debits = debits.copy()
        debits["category"] = debits["mcc"].apply(
            lambda x: MCC_DESCRIPTIONS.get(int(x), "Other") if pd.notna(x) else "Other"
        )

        # Policy flags per line
        debits["policy_flag"] = debits.apply(
            lambda row: self._flag_line(row, policy), axis=1
        )

        await self.emit_progress("Generating AI report summary…")
        ai_summary = await self._ai_summary(emp, debits, total, params)

        # Persist report
        period_start = params.period_start or str(debits["transaction_date"].min())[:10]
        period_end = params.period_end or str(debits["transaction_date"].max())[:10]
        report_name = f"{emp['name']} — {period_start} to {period_end}"
        txn_ids = ",".join(str(int(r)) for r in debits["rowid"].tolist() if pd.notna(r)) if "rowid" in debits.columns else ""

        db.execute(
            """INSERT INTO expense_reports
               (report_name, employee_id, period_start, period_end, total_amount, status, created_at, transaction_ids)
               VALUES (?,?,?,?,?,'draft',?,?)""",
            (report_name, params.employee_id, period_start, period_end,
             round(total, 2), datetime.utcnow().isoformat(), txn_ids),
        )

        # Category breakdown chart
        cat_totals = (
            debits.groupby("category")["amount_cad"]
            .sum()
            .reset_index()
            .sort_values("amount_cad", ascending=False)
        )
        chart = {
            "type": "pie",
            "data": cat_totals.rename(
                columns={"category": "name", "amount_cad": "value"}
            ).assign(value=lambda d: d["value"].round(2)).to_dict("records"),
            "xKey": "name",
            "yKey": "value",
            "title": f"{emp['name']} — Expense Breakdown",
        }

        trips = self._detect_trip_clusters(debits)
        trip_summary = ""
        if trips:
            trip_lines = [f"\n**Trip Clusters Detected:**"]
            for t in trips:
                trip_lines.append(
                    f"- {t['city']} ({t['start']} → {t['end']}): "
                    f"{t['txn_count']} transactions, ${t['total']:,.2f} CAD"
                )
            trip_summary = "\n".join(trip_lines)

        flagged = int(debits["policy_flag"].ne("").sum())
        summary = (
            f"Report generated: {report_name}\n"
            f"{len(debits)} transactions | Total: ${total:,.2f} CAD | {flagged} policy flags"
            f"{trip_summary}\n\n"
            f"{ai_summary}"
        )

        return self.ok(
            text=summary,
            data=debits.to_dict("records"),
            chart=chart,
        )

    # ── View report ───────────────────────────────────────────────────────────

    async def _view_report(self, params: InputSchema) -> ToolResult:
        if not params.report_id:
            return self.err("report_id required for view action")

        report_df = db.query_df(
            """SELECT r.*, e.name as employee_name, e.department, e.role
               FROM expense_reports r LEFT JOIN employees e ON r.employee_id = e.id
               WHERE r.id = ?""",
            (params.report_id,),
        )
        if report_df.empty:
            return self.err(f"Report {params.report_id} not found")

        report = report_df.iloc[0].to_dict()
        txn_ids = report.get("transaction_ids", "")
        txns = pd.DataFrame()

        if txn_ids:
            id_list = ",".join(txn_ids.split(",")[:200])
            txns = db.query_df(
                f"SELECT *, rowid FROM transactions WHERE rowid IN ({id_list})"
            )

        return self.ok(
            text=f"Report: {report['report_name']} | Status: {report['status']} | Total: ${report['total_amount']:,.2f} CAD",
            data=txns.to_dict("records") if not txns.empty else [report],
        )

    # ── Trip Clustering ─────────────────────────────────────────────────────

    @staticmethod
    def _detect_trip_clusters(txns: pd.DataFrame, window_days: int = 3) -> list[dict]:
        """Group transactions into trip clusters by city extracted from merchant name."""
        if txns.empty:
            return []

        txns = txns.copy()
        txns["date"] = pd.to_datetime(txns["transaction_date"], errors="coerce")
        txns = txns.dropna(subset=["date"]).sort_values("date")

        CITY_KEYWORDS = [
            "SAN DIEGO", "LOS ANGELES", "CHICAGO", "TORONTO", "VANCOUVER",
            "NEW YORK", "HOUSTON", "DALLAS", "ATLANTA", "SEATTLE",
            "DENVER", "MIAMI", "BOSTON", "PHOENIX", "MONTREAL",
            "CALGARY", "EDMONTON", "WINNIPEG", "OTTAWA", "PORTLAND",
        ]

        def extract_city(merchant: str) -> str:
            merchant_upper = (merchant or "").upper()
            for city in CITY_KEYWORDS:
                if city in merchant_upper:
                    return city.title()
            return ""

        txns["city"] = txns["merchant"].apply(extract_city)
        city_txns = txns[txns["city"] != ""]
        if city_txns.empty:
            return []

        clusters = []
        for city, group in city_txns.groupby("city"):
            group = group.sort_values("date")
            current_cluster: list[int] = []
            cluster_start = None

            for _, row in group.iterrows():
                if cluster_start is None:
                    cluster_start = row["date"]
                    current_cluster = [row.name]
                elif (row["date"] - cluster_start).days <= window_days:
                    current_cluster.append(row.name)
                else:
                    if len(current_cluster) >= 3:
                        cluster_data = group.loc[current_cluster]
                        clusters.append({
                            "city": city,
                            "start": str(cluster_data["date"].min().date()),
                            "end": str(cluster_data["date"].max().date()),
                            "txn_count": len(cluster_data),
                            "total": round(float(cluster_data["amount_cad"].sum()), 2),
                            "merchants": cluster_data["merchant"].unique().tolist(),
                        })
                    cluster_start = row["date"]
                    current_cluster = [row.name]

            if len(current_cluster) >= 3:
                cluster_data = group.loc[current_cluster]
                clusters.append({
                    "city": city,
                    "start": str(cluster_data["date"].min().date()),
                    "end": str(cluster_data["date"].max().date()),
                    "txn_count": len(cluster_data),
                    "total": round(float(cluster_data["amount_cad"].sum()), 2),
                    "merchants": cluster_data["merchant"].unique().tolist(),
                })

        return sorted(clusters, key=lambda c: c["total"], reverse=True)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _flag_line(self, row: pd.Series, policy: dict) -> str:
        amount = float(row.get("amount_cad", 0) or 0)
        if amount > policy["pre_auth_threshold"]:
            return f"Requires pre-auth (>${policy['pre_auth_threshold']:.0f})"
        return ""

    async def _ai_summary(self, emp: dict, debits: pd.DataFrame, total: float, params) -> str:
        category_breakdown = (
            debits.groupby("category")["amount_cad"]
            .sum()
            .sort_values(ascending=False)
            .head(5)
            .to_dict()
        )
        try:
            client = anthropic.AsyncAnthropic()
            period = f"{params.period_start or 'start'} to {params.period_end or 'end'}"
            prompt = (
                f"Summarize this expense report for {emp['name']} ({emp['role']}, {emp['department']}) "
                f"covering {period}. Total: ${total:,.2f} CAD. "
                f"Top categories: {json.dumps({k: round(v,2) for k,v in category_breakdown.items()})}. "
                f"Write 2-3 sentences for a finance manager. Be specific about patterns."
            )
            msg = await asyncio.wait_for(
                client.messages.create(
                    model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
                    max_tokens=200,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=15.0,
            )
            return msg.content[0].text.strip()
        except Exception as exc:
            logger.warning("AI report summary failed: %s", exc)
            top_cat = max(category_breakdown, key=category_breakdown.get) if category_breakdown else "N/A"
            return f"Top category: {top_cat} (${category_breakdown.get(top_cat, 0):,.2f} CAD)."
