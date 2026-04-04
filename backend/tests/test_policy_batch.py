"""
Test 3: Policy batch size.

N violations → exactly ceil(N / batch_size) calls to Claude.
Default batch_size = 15.

We mock anthropic.AsyncAnthropic.messages.create to count invocations.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_claude_response(batch: list[dict]) -> MagicMock:
    """Return a mock Anthropic response with a valid JSON array for the batch."""
    results = [
        {"idx": i, "severity": "MEDIUM", "reasoning": "Test violation."}
        for i in range(len(batch))
    ]
    mock_resp = MagicMock()
    mock_resp.content = [MagicMock(text=json.dumps(results))]
    return mock_resp


def _make_violations(n: int) -> list[dict]:
    return [
        {
            "employee_id": f"E{i:03d}",
            "employee_name": f"Driver {i}",
            "merchant": "Some Merchant",
            "transaction_date": "2024-01-15",
            "amount_cad": 250.0,
            "mcc": 5812,
            "violation_type": "OVER_THRESHOLD_NO_AUTH",
            "severity": "MEDIUM",
            "description": "Test",
            "needs_context_enrichment": True,
            "ai_reasoning": "",
        }
        for i in range(n)
    ]


@pytest.mark.asyncio
async def test_batch_call_count_default():
    """
    31 violations with default batch_size=15 → ceil(31/15)=3 Claude calls.
    """
    n = 31
    batch_size = 15
    expected_calls = math.ceil(n / batch_size)

    violations = _make_violations(n)
    call_count = 0

    async def mock_create(**kwargs):
        nonlocal call_count
        call_count += 1
        # Extract the batch size from the prompt
        messages = kwargs.get("messages", [])
        content = messages[0]["content"] if messages else ""
        # Count items in the violations JSON in the prompt
        import re
        match = re.search(r'\[\s*\{.*?"idx"', content, re.DOTALL)
        batch_data = json.loads(content[content.rfind("["):content.rfind("]")+1])
        size = len(batch_data)
        results = [{"idx": i, "severity": "MEDIUM", "reasoning": "ok"} for i in range(size)]
        resp = MagicMock()
        resp.content = [MagicMock(text=json.dumps(results))]
        return resp

    with patch.dict(os.environ, {"POLICY_BATCH_SIZE": str(batch_size)}):
        from agent.tools.policy_check_tool import PolicyCheckTool
        tool = PolicyCheckTool()

        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(side_effect=mock_create)

        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            # Call _enrich_batch indirectly via _phase2_enrich
            from data.policy_loader import load_policy
            policy = {"pre_auth_threshold": 50.0, "tip_meal_max_pct": 20.0}
            await tool._phase2_enrich(violations, violations, policy)

    assert call_count == expected_calls, (
        f"Expected {expected_calls} Claude calls for {n} violations "
        f"(batch_size={batch_size}), got {call_count}"
    )


@pytest.mark.asyncio
async def test_batch_call_count_exact_multiple():
    """30 violations at batch_size=15 → exactly 2 calls."""
    n = 30
    batch_size = 15
    expected_calls = math.ceil(n / batch_size)

    violations = _make_violations(n)
    call_count = 0

    async def mock_create(**kwargs):
        nonlocal call_count
        call_count += 1
        messages = kwargs.get("messages", [])
        content = messages[0]["content"] if messages else ""
        batch_data = json.loads(content[content.rfind("["):content.rfind("]")+1])
        size = len(batch_data)
        results = [{"idx": i, "severity": "LOW", "reasoning": "ok"} for i in range(size)]
        resp = MagicMock()
        resp.content = [MagicMock(text=json.dumps(results))]
        return resp

    with patch.dict(os.environ, {"POLICY_BATCH_SIZE": str(batch_size)}):
        from agent.tools.policy_check_tool import PolicyCheckTool
        tool = PolicyCheckTool()
        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(side_effect=mock_create)

        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            policy = {"pre_auth_threshold": 50.0, "tip_meal_max_pct": 20.0}
            await tool._phase2_enrich(violations, violations, policy)

    assert call_count == expected_calls


@pytest.mark.asyncio
async def test_batch_timeout_continues(monkeypatch):
    """
    If one batch times out, the remaining batches still run.
    The tool should not raise — it logs and keeps rule-based severity.
    """
    import asyncio
    n = 16  # 2 batches with size 15
    violations = _make_violations(n)
    batch_num = 0

    async def mock_create(**kwargs):
        nonlocal batch_num
        batch_num += 1
        if batch_num == 1:
            # First batch times out
            raise asyncio.TimeoutError()
        messages = kwargs.get("messages", [])
        content = messages[0]["content"] if messages else ""
        batch_data = json.loads(content[content.rfind("["):content.rfind("]")+1])
        size = len(batch_data)
        results = [{"idx": i, "severity": "HIGH", "reasoning": "ok"} for i in range(size)]
        resp = MagicMock()
        resp.content = [MagicMock(text=json.dumps(results))]
        return resp

    with patch.dict(os.environ, {"POLICY_BATCH_SIZE": "15"}):
        from agent.tools.policy_check_tool import PolicyCheckTool
        tool = PolicyCheckTool()
        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(side_effect=mock_create)

        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            policy = {"pre_auth_threshold": 50.0, "tip_meal_max_pct": 20.0}
            # Must not raise even with a timed-out batch
            result = await tool._phase2_enrich(violations, violations, policy)

    # Violations from the timed-out batch keep their rule-based severity
    assert result is not None
    assert len(result) == n
