"""
Test 6: ReportTool — list, generate, view, AI summary fallback.
"""
from __future__ import annotations

import asyncio
import sqlite3
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import seed_transactions


@pytest.fixture
def report_db(tmp_db):
    """Seed one employee + several transactions."""
    conn = sqlite3.connect(str(tmp_db))
    conn.execute(
        "INSERT INTO employees (id, name, role, department, monthly_budget) VALUES (?,?,?,?,?)",
        ("E001", "Alice Driver", "Long-Haul Driver", "Operations", 5000.0),
    )
    conn.commit()
    conn.close()

    seed_transactions(str(tmp_db), [
        ("2024-02-05", "E001", "Alice Driver", "Shell Gas", 220.0, "Debit", 5541, 5541, 1, "Operations", "Long-Haul Driver"),
        ("2024-02-10", "E001", "Alice Driver", "TA Truck Stop", 85.0, "Debit", 5812, 5812, 1, "Operations", "Long-Haul Driver"),
        ("2024-02-15", "E001", "Alice Driver", "Michelin Tires", 650.0, "Debit", 5532, 5532, 1, "Operations", "Long-Haul Driver"),
    ])
    return tmp_db


def test_list_reports_empty(report_db):
    """list returns empty data when no reports have been generated."""
    from agent.tools.report_tool import ReportTool
    tool = ReportTool()
    params = tool.InputSchema(action="list")
    result = asyncio.run(tool.execute(params))
    assert result.error == ""
    assert result.data == []


def test_generate_report_creates_db_row(report_db):
    """generate creates an expense_reports row with correct total."""
    import data.db as db_module
    from agent.tools.report_tool import ReportTool

    tool = ReportTool()

    async def run_it():
        # Mock Claude AI summary so we don't need API key
        with patch("anthropic.AsyncAnthropic") as mock_cls:
            mock_msg = MagicMock()
            mock_msg.content = [MagicMock(text="Summary: Alice spent on fuel and tires.")]
            mock_cls.return_value.messages.create = AsyncMock(return_value=mock_msg)
            return await tool.execute(
                tool.InputSchema(
                    action="generate",
                    employee_id="E001",
                    period_start="2024-02-01",
                    period_end="2024-02-28",
                )
            )

    result = asyncio.run(run_it())
    assert result.error == ""
    assert "955" in result.text or "Alice" in result.text  # 220+85+650=955

    df = db_module.query_df("SELECT * FROM expense_reports WHERE employee_id = 'E001'")
    assert not df.empty
    assert abs(float(df.iloc[0]["total_amount"]) - 955.0) < 0.01
    assert df.iloc[0]["status"] == "draft"


def test_generate_report_ai_summary_fallback(report_db):
    """generate report works when Claude AI summary fails."""
    from agent.tools.report_tool import ReportTool
    tool = ReportTool()

    async def run_it():
        with patch("anthropic.AsyncAnthropic") as mock_cls:
            mock_cls.return_value.messages.create = AsyncMock(
                side_effect=RuntimeError("Claude offline")
            )
            return await tool.execute(
                tool.InputSchema(
                    action="generate",
                    employee_id="E001",
                    period_start="2024-02-01",
                    period_end="2024-02-28",
                )
            )

    result = asyncio.run(run_it())
    # Should still succeed — AI summary failure is non-fatal
    assert result.error == ""
    assert "Alice" in result.text or "955" in result.text or "Top category" in result.text


def test_view_report(report_db):
    """view returns report data after generate."""
    import data.db as db_module
    from agent.tools.report_tool import ReportTool

    tool = ReportTool()

    # First generate a report
    async def gen():
        with patch("anthropic.AsyncAnthropic") as mock_cls:
            mock_msg = MagicMock()
            mock_msg.content = [MagicMock(text="Report summary.")]
            mock_cls.return_value.messages.create = AsyncMock(return_value=mock_msg)
            return await tool.execute(
                tool.InputSchema(action="generate", employee_id="E001")
            )

    asyncio.run(gen())

    # Get the report id
    df = db_module.query_df("SELECT id FROM expense_reports WHERE employee_id='E001'")
    report_id = int(df.iloc[0]["id"])

    # Now view it
    result = asyncio.run(tool.execute(tool.InputSchema(action="view", report_id=report_id)))
    assert result.error == ""
    assert result.data is not None


def test_list_reports_after_generate(report_db):
    """list returns generated reports."""
    from agent.tools.report_tool import ReportTool
    tool = ReportTool()

    async def gen():
        with patch("anthropic.AsyncAnthropic") as mock_cls:
            mock_msg = MagicMock()
            mock_msg.content = [MagicMock(text="Summary.")]
            mock_cls.return_value.messages.create = AsyncMock(return_value=mock_msg)
            return await tool.execute(
                tool.InputSchema(action="generate", employee_id="E001")
            )

    asyncio.run(gen())

    result = asyncio.run(tool.execute(tool.InputSchema(action="list")))
    assert result.error == ""
    assert len(result.data) >= 1
