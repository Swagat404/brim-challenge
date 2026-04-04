"""
Test 1: PDF fallback.

policy_loader.load_policy() must return a usable dict even when:
  - the PDF file doesn't exist
  - the PDF is corrupt / empty
  - pdfplumber raises an exception

The fallback dict must contain pre_auth_threshold and tip_meal_max_pct.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import patch, MagicMock


def _fresh_load_policy():
    """Import policy_loader with a cleared lru_cache."""
    from data import policy_loader
    policy_loader.load_policy.cache_clear()
    return policy_loader


def test_fallback_when_pdf_missing(tmp_path, monkeypatch):
    """load_policy() returns fallback dict when PDF path doesn't exist."""
    monkeypatch.setenv("POLICY_PDF_PATH", str(tmp_path / "nonexistent.pdf"))
    loader = _fresh_load_policy()
    policy = loader.load_policy()

    assert "pre_auth_threshold" in policy
    assert "tip_meal_max_pct" in policy
    assert isinstance(policy["pre_auth_threshold"], (int, float))
    assert policy["pre_auth_threshold"] > 0
    assert policy.get("source") == "fallback"


def test_fallback_when_pdf_corrupt(tmp_path, monkeypatch):
    """load_policy() returns fallback dict when PDF is corrupt bytes."""
    corrupt_pdf = tmp_path / "bad.pdf"
    corrupt_pdf.write_bytes(b"\x00\x01NOTAPDF\xff\xfe")

    monkeypatch.setenv("POLICY_PDF_PATH", str(corrupt_pdf))
    loader = _fresh_load_policy()
    policy = loader.load_policy()

    assert "pre_auth_threshold" in policy
    assert policy.get("source") == "fallback"


def test_fallback_when_pdfplumber_raises(tmp_path, monkeypatch):
    """load_policy() returns fallback dict when pdfplumber itself throws."""
    dummy_pdf = tmp_path / "dummy.pdf"
    dummy_pdf.write_bytes(b"%PDF-1.4 fake")

    monkeypatch.setenv("POLICY_PDF_PATH", str(dummy_pdf))
    loader = _fresh_load_policy()

    with patch("pdfplumber.open", side_effect=RuntimeError("pdfplumber exploded")):
        policy = loader.load_policy()

    assert "pre_auth_threshold" in policy
    assert policy.get("source") == "fallback"


def test_fallback_values_are_sensible(tmp_path, monkeypatch):
    """The hardcoded fallback rules are within reasonable business ranges."""
    monkeypatch.setenv("POLICY_PDF_PATH", str(tmp_path / "no.pdf"))
    loader = _fresh_load_policy()
    policy = loader.load_policy()

    # Pre-auth threshold: Brim default is $50
    assert 10 <= policy["pre_auth_threshold"] <= 1000
    # Tip max: 0–50% is a reasonable policy range
    assert 0 < policy["tip_meal_max_pct"] <= 50


def test_fleet_mcc_codes_populated():
    """FLEET_MCC_CODES must include common fleet codes (fuel, permits)."""
    from data import policy_loader
    # 5541 = Gas Station, 9399 = Government Services (permits)
    assert 5541 in policy_loader.FLEET_MCC_CODES
    assert 9399 in policy_loader.FLEET_MCC_CODES
