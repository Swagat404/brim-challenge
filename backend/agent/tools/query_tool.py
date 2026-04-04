"""
QueryTool — natural language data queries.

Claude fills in a structured schema (never raw SQL). This tool translates
the schema to a parameterized SQL query, runs it, and returns data + a
Recharts-compatible chart spec.

Security: structured params → parameterized SQL. User input never touches SQL directly.
"""
from __future__ import annotations

import logging
from typing import Any, List, Literal, Optional

import pandas as pd
from pydantic import BaseModel, Field

from agent.tools.base_tool import BaseTool
from agent.models import ToolResult
from data import db

logger = logging.getLogger(__name__)

# MCC code → readable label map (top categories in this dataset)
MCC_LABELS: dict[int, str] = {
    5541: "Fuel",
    5542: "Fuel (auto-dispenser)",
    9399: "Gov. Permits",
    5532: "Tires / Parts",
    7538: "Auto Service",
    7542: "Car Wash",
    5085: "Industrial Supplies",
    4816: "Telecom",
    5045: "Technology",
    5533: "Auto Accessories",
    7549: "Towing",
    7399: "Business Services",
    8999: "Misc Services",
    5817: "Digital Goods",
    5046: "Equipment",
}


class FilterSpec(BaseModel):
    employee_id: Optional[str] = None
    department: Optional[str] = None
    start_date: Optional[str] = Field(None, description="ISO date YYYY-MM-DD")
    end_date: Optional[str] = Field(None, description="ISO date YYYY-MM-DD")
    mcc_code: Optional[int] = Field(None, description="Merchant Category Code filter")
    country: Optional[str] = Field(None, description="CAN or USA")
    debit_only: bool = True


class QueryTool(BaseTool):
    name = "query_transactions"
    description = (
        "Query expense transaction data and return aggregated results with a chart. "
        "Use for: spend totals by category/department/employee/month/merchant, "
        "trend analysis, top spenders, fuel costs, permit costs, anomalies. "
        "Always use this tool before answering any question about spending data."
    )

    class InputSchema(BaseModel):
        metric: Literal["total_spend", "count", "avg_spend"] = Field(
            description="What to measure"
        )
        group_by: List[Literal["employee", "department", "month", "mcc_category", "merchant", "country", "state"]] = Field(
            description="How to group results. Use ['month'] for trends, ['employee'] for per-person breakdown."
        )
        filters: FilterSpec = Field(default_factory=FilterSpec)
        limit: int = Field(default=20, ge=1, le=100, description="Max rows to return")
        chart_type: Optional[Literal["bar", "line", "pie", "table"]] = Field(
            None,
            description="Preferred chart type. Leave null to auto-select."
        )

    async def execute(self, params: InputSchema) -> ToolResult:
        await self.emit_progress(f"Querying transactions (group_by={params.group_by}, metric={params.metric})…")

        try:
            df = self._run_query(params)
        except Exception as exc:
            logger.exception("QueryTool SQL error: %s", exc)
            return self.err(f"Query failed: {exc}")

        if df.empty:
            return self.ok(
                "No transactions found matching those filters.",
                data=[],
                chart=None,
            )

        df = self._label_columns(df, params)
        chart = self._build_chart(df, params)
        summary = self._summarize(df, params)

        return self.ok(text=summary, data=df.to_dict("records"), chart=chart)

    # ── SQL builder ───────────────────────────────────────────────────────────

    def _run_query(self, params: InputSchema) -> pd.DataFrame:
        select_parts = []
        group_parts = []
        sql_params: list[Any] = []

        f = params.filters

        # GROUP BY columns — each key gets a unique alias (label_0, label_1, ...)
        # so multi-key groupby (e.g. ['employee', 'month']) doesn't collide on AS label
        for idx, g in enumerate(params.group_by):
            alias = f"label_{idx}"
            if g == "employee":
                select_parts.append(f"employee_name AS {alias}")
                group_parts.append("employee_name")
            elif g == "department":
                select_parts.append(f"department AS {alias}")
                group_parts.append("department")
            elif g == "month":
                select_parts.append(f"strftime('%Y-%m', transaction_date) AS {alias}")
                group_parts.append("strftime('%Y-%m', transaction_date)")
            elif g == "mcc_category":
                select_parts.append(f"CAST(merchant_category_code AS INTEGER) AS {alias}")
                group_parts.append("CAST(merchant_category_code AS INTEGER)")
            elif g == "merchant":
                select_parts.append(f"merchant_info_dba_name AS {alias}")
                group_parts.append("merchant_info_dba_name")
            elif g == "country":
                select_parts.append(f"merchant_country AS {alias}")
                group_parts.append("merchant_country")
            elif g == "state":
                select_parts.append(f"merchant_state_province AS {alias}")
                group_parts.append("merchant_state_province")

        # Metric
        if params.metric == "total_spend":
            select_parts.append("ROUND(SUM(amount_cad), 2) AS value")
        elif params.metric == "count":
            select_parts.append("COUNT(*) AS value")
        elif params.metric == "avg_spend":
            select_parts.append("ROUND(AVG(amount_cad), 2) AS value")

        # WHERE clauses
        where_clauses = ["is_operational = 1"]
        if f.debit_only:
            where_clauses.append("debit_or_credit = 'Debit'")
        if f.employee_id:
            where_clauses.append("employee_id = ?")
            sql_params.append(f.employee_id)
        if f.department:
            where_clauses.append("department = ?")
            sql_params.append(f.department)
        if f.start_date:
            where_clauses.append("transaction_date >= ?")
            sql_params.append(f.start_date)
        if f.end_date:
            where_clauses.append("transaction_date <= ?")
            sql_params.append(f.end_date)
        if f.mcc_code:
            where_clauses.append("CAST(merchant_category_code AS INTEGER) = ?")
            sql_params.append(f.mcc_code)
        if f.country:
            where_clauses.append("merchant_country = ?")
            sql_params.append(f.country)

        if not select_parts or not group_parts:
            # Fallback: total spend, no grouping
            return db.query_df(
                "SELECT ROUND(SUM(amount_cad),2) AS value FROM transactions WHERE is_operational=1 AND debit_or_credit='Debit'",
                ()
            )

        sql = f"""
            SELECT {', '.join(select_parts)}
            FROM transactions
            WHERE {' AND '.join(where_clauses)}
            GROUP BY {', '.join(group_parts)}
            ORDER BY value DESC
            LIMIT ?
        """
        sql_params.append(params.limit)
        return db.query_df(sql, tuple(sql_params))

    # ── Chart builder ─────────────────────────────────────────────────────────

    def _build_chart(self, df: pd.DataFrame, params: InputSchema) -> dict:
        chart_type = params.chart_type
        if chart_type is None:
            # Auto-select: line for month trends, pie for small categoricals, bar otherwise
            if "month" in params.group_by:
                chart_type = "line"
            elif len(df) <= 6:
                chart_type = "pie"
            else:
                chart_type = "bar"

        # With multi-key groupby, label_0, label_1, ... are the group columns.
        # Concatenate them into a single name column for the chart.
        label_cols = [c for c in df.columns if c.startswith("label_") or c == "label"]
        value_col = "value" if "value" in df.columns else df.columns[-1]

        if len(label_cols) > 1:
            df = df.copy()
            df["name"] = df[label_cols].apply(lambda r: " / ".join(str(v) for v in r if v), axis=1)
        elif label_cols:
            df = df.copy()
            df["name"] = df[label_cols[0]].astype(str)
        else:
            df = df.copy()
            df["name"] = df.index.astype(str)

        label_col = "name"

        metric_label = {
            "total_spend": "Total Spend (CAD)",
            "count": "Transaction Count",
            "avg_spend": "Avg Spend (CAD)",
        }.get(params.metric, "Value")

        return {
            "type": chart_type,
            "data": df[[label_col, value_col]].rename(
                columns={label_col: "name", value_col: "value"}
            ).to_dict("records"),
            "xKey": "name",
            "yKey": "value",
            "yLabel": metric_label,
            "title": self._chart_title(params),
        }

    def _chart_title(self, params: InputSchema) -> str:
        metric_names = {"total_spend": "Spend", "count": "Transactions", "avg_spend": "Avg Spend"}
        group_names = {"month": "by Month", "department": "by Department",
                       "employee": "by Employee", "mcc_category": "by Category",
                       "merchant": "by Merchant", "country": "by Country", "state": "by State"}
        m = metric_names.get(params.metric, params.metric)
        g = " & ".join(group_names.get(g, g) for g in params.group_by)
        return f"{m} {g}"

    # ── Label enrichment ──────────────────────────────────────────────────────

    def _label_columns(self, df: pd.DataFrame, params: InputSchema) -> pd.DataFrame:
        if "mcc_category" in params.group_by:
            # mcc_category is at index params.group_by.index("mcc_category")
            mcc_idx = params.group_by.index("mcc_category")
            col = f"label_{mcc_idx}"
            if col in df.columns:
                df = df.copy()
                df[col] = df[col].apply(
                    lambda x: MCC_LABELS.get(int(x), f"MCC {x}") if pd.notna(x) else "Unknown"
                )
        return df

    # ── Summary text ──────────────────────────────────────────────────────────

    def _summarize(self, df: pd.DataFrame, params: InputSchema) -> str:
        if df.empty:
            return "No data found."
        val_col = "value" if "value" in df.columns else df.columns[-1]
        total = df[val_col].sum()
        top = df.iloc[0]
        label_col = "label" if "label" in df.columns else df.columns[0]
        top_label = top[label_col] if label_col in top else "N/A"
        top_val = top[val_col] if val_col in top else 0

        if params.metric == "total_spend":
            return (
                f"Found {len(df)} groups. Total: ${total:,.2f} CAD. "
                f"Top: {top_label} at ${top_val:,.2f} CAD."
            )
        elif params.metric == "count":
            return (
                f"Found {len(df)} groups. Total transactions: {int(total):,}. "
                f"Most: {top_label} with {int(top_val):,} transactions."
            )
        else:
            return (
                f"Found {len(df)} groups. Highest avg: {top_label} at ${top_val:,.2f} CAD."
            )
