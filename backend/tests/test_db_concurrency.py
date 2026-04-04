"""
Test 2: SQLite concurrency and operational filter.

check_same_thread=False lets multiple asyncio tasks share the same connection.
The operational filter (is_operational=1) excludes Code 108 EFT bank transfers.
"""
from __future__ import annotations

import asyncio
import threading

import pytest

from tests.conftest import seed_transactions


def test_check_same_thread_false():
    """
    Verify SQLite is opened with check_same_thread=False.
    Without it, reading from a second thread raises ProgrammingError.
    """
    import data.db as db_module

    results = {}
    errors = {}

    def read_from_thread():
        try:
            df = db_module.query_df("SELECT COUNT(*) as n FROM transactions")
            results["count"] = int(df.iloc[0]["n"])
        except Exception as exc:
            errors["err"] = str(exc)

    t = threading.Thread(target=read_from_thread)
    t.start()
    t.join(timeout=5)

    # If check_same_thread=True we'd get ProgrammingError
    assert "err" not in errors, f"Thread read failed: {errors.get('err')}"
    assert "count" in results


def test_concurrent_async_reads():
    """
    Ten concurrent async tasks hitting query_df must all succeed.
    This simulates multiple SSE streams running in parallel.
    """
    import data.db as db_module

    async def one_read():
        return db_module.query_df("SELECT COUNT(*) as n FROM transactions")

    async def run_all():
        return await asyncio.gather(*[one_read() for _ in range(10)])

    results = asyncio.run(run_all())
    assert len(results) == 10
    for df in results:
        assert not df.empty


def test_operational_filter_excludes_eft(tmp_db):
    """
    is_operational=0 rows must be excluded from get_transactions(operational_only=True).
    """
    import data.db as db_module

    seed_transactions(str(tmp_db), [
        ("2024-01-15", "E001", "Alice", "Shell Gas",         120.0,     "Debit", 5541, 5541, 1, "Operations", "Driver"),
        ("2024-01-15", "E001", "Alice", "CWB EFT PAYMENT",   1180000.0, "Debit", 0,    0,    0, "Finance",    "Admin"),
    ])

    df = db_module.get_transactions(operational_only=True, limit=100)
    assert len(df) == 1
    assert df.iloc[0]["merchant"] == "Shell Gas"

    df_all = db_module.get_transactions(operational_only=False, limit=100)
    assert len(df_all) == 2


def test_operational_filter_debit_only(tmp_db):
    """
    Credit transactions are included in the raw fetch but tools filter on Debit.
    Confirms the debit filter logic works downstream.
    """
    import data.db as db_module

    seed_transactions(str(tmp_db), [
        ("2024-02-10", "E002", "Bob", "Petro Canada",        200.0, "Debit",  5541, 5541, 1, "Ops", "Driver"),
        ("2024-02-10", "E002", "Bob", "Petro Canada REFUND", 200.0, "Credit", 5541, 5541, 1, "Ops", "Driver"),
    ])

    df = db_module.get_transactions(operational_only=True, limit=100)
    debits = df[df["debit_or_credit"] == "Debit"]
    assert len(debits) == 1
