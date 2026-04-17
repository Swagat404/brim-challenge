"""
policy_loader: structured-policy load + the legacy flat-view adapter.

There is intentionally no fallback dict and no PDF re-parsing here — the
single source of truth is the `policy_documents` table populated by
`data_pipeline/bootstrap_policy_doc.py`. If nothing's bootstrapped, both
loaders behave deterministically (one returns None, the other raises).
"""
from __future__ import annotations

import json
import sqlite3

import pytest


def test_load_structured_policy_returns_none_when_empty(tmp_db):
    from data import policy_loader
    policy_loader._structured_cache["doc"] = None
    assert policy_loader.load_structured_policy() is None


def test_load_policy_raises_when_no_document(tmp_db):
    from data import policy_loader
    policy_loader._structured_cache["doc"] = None
    with pytest.raises(policy_loader.PolicyNotBootstrappedError):
        policy_loader.load_policy()


def test_load_policy_flattens_thresholds(policy_doc, tmp_db):
    from data import policy_loader
    flat = policy_loader.load_policy()
    # Thresholds come straight from the structured doc
    assert flat["pre_auth_threshold"] == 50.0
    assert flat["receipt_required_above"] == 50.0
    assert flat["tip_meal_max_pct"] == 20.0
    assert flat["tip_service_max_pct"] == 15.0
    # Restricted MCCs forwarded
    assert 7993 in flat["mcc_restricted"]
    # Sections exposed by id
    assert "general" in flat["policy_sections"]
    assert flat["source"] == "structured_policy"


def test_load_policy_alcohol_heuristic_defaults_true(policy_doc, tmp_db):
    """Sections that don't mention alcohol leave alcohol_customer_only at True
    (the actual Brim policy stance)."""
    from data import policy_loader
    flat = policy_loader.load_policy()
    assert flat["alcohol_customer_only"] is True


def test_fleet_mcc_codes_reads_from_structured_policy(policy_doc, tmp_db):
    from data import policy_loader
    # Fleet exempt set was seeded with the canonical fleet MCCs
    assert 5541 in policy_loader.FLEET_MCC_CODES
    assert 9399 in policy_loader.FLEET_MCC_CODES
    # Iteration works (the consumer code uses both)
    assert 5541 in list(policy_loader.FLEET_MCC_CODES)


def test_fleet_mcc_codes_empty_when_no_policy(tmp_db):
    """Without a bootstrapped policy, no MCC is treated as fleet — the safe
    default. (Better than crashing every consumer that does `mcc in
    FLEET_MCC_CODES`.)"""
    from data import policy_loader
    policy_loader._structured_cache["doc"] = None
    assert 5541 not in policy_loader.FLEET_MCC_CODES
    assert len(policy_loader.FLEET_MCC_CODES) == 0


def test_save_then_load_round_trip(policy_doc, tmp_db):
    from data import policy_loader
    doc = policy_loader.load_structured_policy()
    doc["thresholds"]["pre_auth"] = 75.0
    policy_loader.save_structured_policy(doc, updated_by="test")
    policy_loader._structured_cache["doc"] = None

    flat = policy_loader.load_policy()
    assert flat["pre_auth_threshold"] == 75.0
