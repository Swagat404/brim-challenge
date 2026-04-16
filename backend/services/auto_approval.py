"""
Auto-approval rule matcher.

The structured policy may include a list of `auto_approval_rules`. When a
new approval request comes in, ApprovalTool checks these rules first; if any
rule matches the transaction (amount, MCC, role conditions), the request is
auto-approved without ever calling Claude.

This module is intentionally tiny and pure-Python so the same code path is
used by:
  - the live recommend flow (`backend/agent/tools/approval_tool.py`)
  - the historical backfill (`data_pipeline/seed_demo_activity.py`)
  - the unit tests

Rule shape (from PolicyDocument.auto_approval_rules.rules):
    {
      "id": str,
      "max_amount": float | null,
      "mcc_in": list[int] | null,
      "mcc_not_in": list[int] | null,
      "role_in": list[str] | null,
      "rationale": str
    }

A rule matches if ALL of its non-null conditions match the transaction.
A rule with no conditions never matches (defensive — would auto-approve
everything otherwise).
"""
from __future__ import annotations

from typing import Optional


def find_matching_rule(
    *,
    amount: float,
    mcc: Optional[int],
    role: Optional[str],
    auto_approval_config: dict,
) -> Optional[dict]:
    """Return the first matching rule, or None.

    `auto_approval_config` is the `policy.auto_approval_rules` sub-dict:
        {"enabled": bool, "rules": [...]}
    """
    if not auto_approval_config or not auto_approval_config.get("enabled"):
        return None

    for rule in auto_approval_config.get("rules", []):
        if _rule_matches(rule, amount=amount, mcc=mcc, role=role):
            return rule
    return None


def _rule_matches(
    rule: dict,
    *,
    amount: float,
    mcc: Optional[int],
    role: Optional[str],
) -> bool:
    has_any_condition = False

    max_amount = rule.get("max_amount")
    if max_amount is not None:
        has_any_condition = True
        if amount > float(max_amount):
            return False

    mcc_in = rule.get("mcc_in")
    if mcc_in:
        has_any_condition = True
        if mcc is None or int(mcc) not in {int(m) for m in mcc_in}:
            return False

    mcc_not_in = rule.get("mcc_not_in")
    if mcc_not_in:
        has_any_condition = True
        if mcc is not None and int(mcc) in {int(m) for m in mcc_not_in}:
            return False

    role_in = rule.get("role_in")
    if role_in:
        has_any_condition = True
        if not role or role not in role_in:
            return False

    return has_any_condition
