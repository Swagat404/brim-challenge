"""
Test 3: Split transaction detection.

2x$300 same merchant/employee/day → flagged as SPLIT_TRANSACTION (CRITICAL).
Each individual charge ($300) is below the $500 threshold, but the total ($600)
exceeds it — classic split-to-avoid-approval pattern.
"""
from __future__ import annotations

import pytest

from tests.conftest import seed_transactions


def test_split_detection_two_charges(tmp_db):
    """2 × $300 at the same merchant on the same day → detected as split candidate."""
    import data.db as db_module

    seed_transactions(str(tmp_db), [
        ("2024-03-10", "E005", "Marcus Rivera", "Flying J Truck Stop", 300.0, "Debit", 5812, 5812, 1, "Ops", "Driver"),
        ("2024-03-10", "E005", "Marcus Rivera", "Flying J Truck Stop", 300.0, "Debit", 5812, 5812, 1, "Ops", "Driver"),
    ])

    candidates = db_module.find_split_candidates(threshold=500.0)
    assert not candidates.empty, "Expected split candidate, got none"

    row = candidates.iloc[0]
    assert row["employee_id"] == "E005"
    assert row["merchant"] == "Flying J Truck Stop"
    assert abs(float(row["total_cad"]) - 600.0) < 0.01
    assert int(row["txn_count"]) == 2


def test_split_detection_not_triggered_single_charge(tmp_db):
    """Single $600 charge does NOT trigger split detection."""
    import data.db as db_module

    seed_transactions(str(tmp_db), [
        ("2024-03-11", "E006", "Nate Bergmann", "Petro Canada", 600.0, "Debit", 5541, 5541, 1, "Ops", "Driver"),
    ])

    candidates = db_module.find_split_candidates(threshold=500.0)
    e006 = [r for _, r in candidates.iterrows() if r["employee_id"] == "E006"]
    assert len(e006) == 0, "Single charge should not be flagged as split"


def test_split_detection_different_days_not_flagged(tmp_db):
    """Two $300 charges at the same merchant on DIFFERENT days are not a split."""
    import data.db as db_module

    seed_transactions(str(tmp_db), [
        ("2024-03-10", "E007", "Omar Hassan", "TA Truck Stop", 300.0, "Debit", 5812, 5812, 1, "Ops", "Driver"),
        ("2024-03-12", "E007", "Omar Hassan", "TA Truck Stop", 300.0, "Debit", 5812, 5812, 1, "Ops", "Driver"),
    ])

    candidates = db_module.find_split_candidates(threshold=500.0)
    e007 = [r for _, r in candidates.iterrows() if r["employee_id"] == "E007"]
    assert len(e007) == 0, "Different-day charges should not be flagged as split"


def test_split_detection_multiple_employees_same_merchant(tmp_db):
    """
    Two employees each charging $300 at the same merchant/day is NOT a split
    (splits require the same employee_id).
    """
    import data.db as db_module

    seed_transactions(str(tmp_db), [
        ("2024-03-15", "E008", "Sandra Lee",    "Loves Truck Stop", 300.0, "Debit", 5812, 5812, 1, "Ops", "Driver"),
        ("2024-03-15", "E009", "Carlos Rivera", "Loves Truck Stop", 300.0, "Debit", 5812, 5812, 1, "Ops", "Driver"),
    ])

    candidates = db_module.find_split_candidates(threshold=500.0)
    # Neither employee should appear as a split — different employees
    for emp_id in ["E008", "E009"]:
        emp_rows = [r for _, r in candidates.iterrows() if r["employee_id"] == emp_id]
        assert len(emp_rows) == 0, f"{emp_id} should not appear as split candidate"
