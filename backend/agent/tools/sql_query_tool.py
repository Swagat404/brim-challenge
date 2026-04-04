"""
SQLQueryTool — raw SQL queries with safety guardrails.

Gives Claude the ability to write arbitrary SELECT queries against the
expense database when the structured QueryTool isn't flexible enough.

Safety layers:
  1. Only SELECT statements allowed (keyword blocklist enforced).
  2. Read-only SQLite connection (?mode=ro URI flag).
  3. Automatic LIMIT 200 if no LIMIT clause present.
  4. 10-second execution timeout.
"""
from __future__ import annotations

import asyncio
import logging
import re
import sqlite3
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from agent.tools.base_tool import BaseTool
from agent.models import ToolResult
from data import db

logger = logging.getLogger(__name__)

MAX_ROWS = 200
TIMEOUT_SECONDS = 10

BLOCKED_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA)\b",
    re.IGNORECASE,
)

_SCHEMA_DESCRIPTION = """\
Run a read-only SQL SELECT query against the expense database.

Use this when the structured query_transactions tool is too rigid — e.g. for
JOINs, subqueries, window functions, CASE expressions, or custom aggregations.

DATABASE SCHEMA
───────────────
transactions
  transaction_code, transaction_description, transaction_date,
  merchant_info_dba_name, transaction_amount, debit_or_credit,
  merchant_category_code, merchant_city, merchant_country,
  merchant_state_province, conversion_rate, employee_id, employee_name,
  department, role, amount_cad, is_operational

employees
  id, name, department, role, card_code, hire_date, monthly_budget, manager_id

policy_violations
  id, transaction_rowid, employee_id, violation_type, severity,
  description, amount, detected_at

approvals
  id, transaction_rowid, employee_id, amount, merchant, status,
  ai_recommendation, ai_reasoning, approver_id, requested_at, resolved_at

expense_reports
  id, report_name, employee_id, period_start, period_end,
  total_amount, status, created_at, transaction_ids

NOTES
─────
- amount_cad is the canonical spend column (USD converted at stored rate).
- Filter is_operational = 1 to exclude bank/admin codes (108/137/375/401/404).
- debit_or_credit = 'Debit' for actual charges (credits are refunds).
- Only SELECT queries are allowed. No writes, DDL, or PRAGMA.
"""


class SQLQueryTool(BaseTool):
    name = "run_sql_query"
    description = _SCHEMA_DESCRIPTION

    class InputSchema(BaseModel):
        sql: str = Field(description="The SELECT query to run against the expense database.")
        chart_type: Optional[Literal["bar", "line", "pie", "table"]] = Field(
            None,
            description="Optional chart type for visualizing the results.",
        )
        chart_title: Optional[str] = Field(
            None,
            description="Optional title for the chart.",
        )

    async def execute(self, params: InputSchema) -> ToolResult:
        sql = params.sql.strip()
        await self.emit_progress(f"Running SQL query…")

        # ── Validate ──────────────────────────────────────────────────────
        error = self._validate(sql)
        if error:
            return self.err(error)

        # ── Ensure LIMIT ──────────────────────────────────────────────────
        if not re.search(r"\bLIMIT\b", sql, re.IGNORECASE):
            sql = f"{sql.rstrip().rstrip(';')} LIMIT {MAX_ROWS}"

        # ── Execute in read-only mode with timeout ────────────────────────
        db_path = db._db_path()
        try:
            rows, columns = await asyncio.wait_for(
                asyncio.to_thread(self._execute_readonly, db_path, sql),
                timeout=TIMEOUT_SECONDS,
            )
        except sqlite3.OperationalError as exc:
            return self.err(f"SQL error: {exc}\n\nQuery:\n{sql}")
        except asyncio.TimeoutError:
            return self.err(
                f"Query timed out after {TIMEOUT_SECONDS}s. "
                "Try adding stricter filters or a smaller LIMIT."
            )
        except Exception as exc:
            logger.exception("SQLQueryTool unexpected error")
            return self.err(f"Unexpected error: {exc}\n\nQuery:\n{sql}")

        if not rows:
            return self.ok("Query returned 0 rows.", data=[], chart=None)

        # ── Build response ────────────────────────────────────────────────
        data = [dict(zip(columns, row)) for row in rows[:MAX_ROWS]]
        chart = self._build_chart(data, columns, params)
        summary = self._summarize(data, columns)

        return self.ok(text=summary, data=data, chart=chart)

    # ── Validation ─────────────────────────────────────────────────────────

    @staticmethod
    def _validate(sql: str) -> str | None:
        """Return an error message if the query is unsafe, else None."""
        stripped = re.sub(r"^(\s*--[^\n]*\n|\s*/\*.*?\*/\s*)*", "", sql, flags=re.DOTALL).strip()
        if not stripped.upper().startswith("SELECT"):
            return "Only SELECT queries are allowed. Your query must start with SELECT."

        match = BLOCKED_KEYWORDS.search(sql)
        if match:
            return f"Blocked keyword '{match.group()}' detected. Only read-only SELECT queries are permitted."

        return None

    # ── Read-only execution with timeout ───────────────────────────────────

    @staticmethod
    def _execute_readonly(db_path: str, sql: str) -> tuple[list[tuple], list[str]]:
        """Run SQL on a read-only connection."""
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            cursor = conn.execute(sql)
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            rows = cursor.fetchall()
            return rows, columns
        finally:
            conn.close()

    # ── Chart builder ──────────────────────────────────────────────────────

    @staticmethod
    def _build_chart(
        data: list[dict[str, Any]],
        columns: list[str],
        params: "SQLQueryTool.InputSchema",
    ) -> dict[str, Any] | None:
        if not data:
            return None

        chart_type = params.chart_type
        if chart_type == "table" or chart_type is None and len(columns) != 2:
            return None

        if chart_type is None:
            chart_type = "bar"

        label_key = columns[0]
        value_key = columns[1] if len(columns) >= 2 else columns[0]

        chart_data = [{"name": str(row[label_key]), "value": row[value_key]} for row in data]

        return {
            "type": chart_type,
            "data": chart_data,
            "xKey": "name",
            "yKey": "value",
            "yLabel": value_key,
            "title": params.chart_title or f"{value_key} by {label_key}",
        }

    # ── Summary text ───────────────────────────────────────────────────────

    @staticmethod
    def _summarize(data: list[dict[str, Any]], columns: list[str]) -> str:
        n = len(data)
        preview_parts: list[str] = []
        for row in data[:3]:
            vals = [f"{k}={v}" for k, v in row.items()]
            preview_parts.append("{" + ", ".join(vals) + "}")
        preview = ", ".join(preview_parts)
        suffix = ", …" if n > 3 else ""
        return f"Query returned {n} row{'s' if n != 1 else ''}. {preview}{suffix}"
