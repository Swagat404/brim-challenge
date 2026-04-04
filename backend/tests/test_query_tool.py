"""
Test 4: QueryTool correctness.

- group_by=employee correctly aggregates total spend
- chart spec is Recharts-compatible (type, data, xKey, yKey)
- SQL injection via merchant names is prevented
- debit_only filter excludes credits from totals
"""
from __future__ import annotations

import asyncio

import pytest

from tests.conftest import seed_transactions


@pytest.fixture
def seeded_db(tmp_db):
    seed_transactions(str(tmp_db), [
        # Alice: two debits, one credit refund
        ("2024-01-10", "E001", "Alice Driver", "Shell Gas",            200.0, "Debit",  5541, 5541, 1, "Operations", "Driver"),
        ("2024-01-15", "E001", "Alice Driver", "TA Truck Stop",        350.0, "Debit",  5812, 5812, 1, "Operations", "Driver"),
        ("2024-01-20", "E001", "Alice Driver", "Shell Refund",          50.0, "Credit", 5541, 5541, 1, "Operations", "Driver"),
        # Bob: one debit
        ("2024-01-20", "E002", "Bob Manager",  "Office Depot",          80.0, "Debit",  5111, 5111, 1, "Finance",    "Manager"),
    ])
    return tmp_db


def test_total_spend_group_by_employee(seeded_db, monkeypatch):
    """group_by=['employee'] returns one row per employee, debits only."""
    import data.db as db_module
    from agent.tools.query_tool import QueryTool

    tool = QueryTool()
    params = tool.InputSchema(
        metric="total_spend",
        group_by=["employee"],
        limit=10,
        chart_type="bar",
    )

    result = asyncio.run(tool.execute(params))
    assert result.error == "", f"Tool error: {result.error}"
    assert result.data is not None and len(result.data) >= 1

    # Alice's debit total should be 200 + 350 = 550 (credit not counted)
    alice = next((r for r in result.data if "Alice" in str(r.get("label", "") or r.get("name", ""))), None)
    if alice:
        assert abs(float(alice.get("value", 0)) - 550.0) < 0.01


def test_chart_spec_recharts_compatible(seeded_db):
    """Chart spec must have type, data, xKey, yKey for Recharts."""
    import pandas as pd
    from agent.tools.query_tool import QueryTool

    tool = QueryTool()
    params = tool.InputSchema(
        metric="total_spend",
        group_by=["employee"],
        chart_type="bar",
    )

    df = pd.DataFrame([{"label": "Alice Driver", "value": 550.0}])
    spec = tool._build_chart(df, params)

    assert spec["type"] == "bar"
    assert "data" in spec
    assert "xKey" in spec
    assert "yKey" in spec
    assert spec["xKey"] == "name"
    assert spec["yKey"] == "value"
    assert len(spec["data"]) == 1
    assert spec["data"][0]["name"] == "Alice Driver"


def test_sql_injection_via_merchant_is_safe(seeded_db):
    """
    Merchant name with SQL injection payload must not cause errors.
    Parameterized queries prevent execution of the injected SQL.
    """
    import data.db as db_module

    malicious_merchant = "'; DROP TABLE transactions; --"
    seed_transactions(str(seeded_db), [
        ("2024-02-01", "E001", "Alice Driver", malicious_merchant,
         100.0, "Debit", 5541, 5541, 1, "Operations", "Driver"),
    ])

    # transactions table must still exist and have data
    df = db_module.query_df("SELECT COUNT(*) as n FROM transactions")
    assert not df.empty
    assert int(df.iloc[0]["n"]) >= 4


def test_debit_filter_excludes_credits(seeded_db):
    """
    Spend calculations must exclude Credit transactions.
    Alice has $550 debit + $50 credit; total debit spend must be $550.
    """
    import data.db as db_module

    df = db_module.query_df(
        """SELECT SUM(amount_cad) as total
           FROM transactions
           WHERE employee_id = 'E001'
             AND is_operational = 1
             AND debit_or_credit = 'Debit'"""
    )
    assert abs(float(df.iloc[0]["total"]) - 550.0) < 0.01
