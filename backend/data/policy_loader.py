"""
Policy loader — single source of truth is the `policy_documents` table row
(`is_current = 1`), populated by `data_pipeline/bootstrap_policy_doc.py` from
the source PDF via Claude.

Two read paths:
  - load_structured_policy()  — full structured JSON (sections, hidden notes,
                                auto_approval_rules, submission_requirements,
                                etc.). Used by the new Sift Policy Agent code.
  - load_policy()             — flattened legacy view (pre_auth_threshold,
                                tip caps, mcc_restricted, etc.) for older
                                tools (policy_check_tool, report_tool) that
                                were written against the old shape.

Neither loader has a fallback dict. If no structured policy has been
bootstrapped, both raise. Run:

    python data_pipeline/bootstrap_policy_doc.py

to populate the table from `Brim Expense Policy.pdf`.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ── Structured policy (DB-backed, AI-edited) ────────────────────────────────
#
# Lightweight in-process cache so repeated reads don't hit SQLite each call.
# Cleared whenever the policy is mutated via PATCH /api/policy/document or the
# upload flow.

_structured_cache: dict = {"doc": None}


def load_structured_policy() -> Optional[dict]:
    """Return the current structured policy JSON, or None if none exists.

    Reads from `policy_documents` where `is_current = 1`. Cached in-process.
    """
    if _structured_cache["doc"] is not None:
        return _structured_cache["doc"]

    from data import db
    df = db.query_df(
        "SELECT content_json FROM policy_documents WHERE is_current = 1 LIMIT 1"
    )
    if df.empty:
        return None
    try:
        doc = json.loads(df.iloc[0]["content_json"])
    except (ValueError, KeyError):
        logger.exception("policy_documents row has invalid JSON")
        return None
    _structured_cache["doc"] = doc
    return doc


def save_structured_policy(content: dict, *, updated_by: str = "system") -> int:
    """Replace the current policy document. Returns the new row id.

    Atomic: clears any existing `is_current=1` row and inserts a fresh one.
    """
    from datetime import datetime
    from data import db
    now = datetime.utcnow().isoformat()
    with db.get_conn() as conn:
        conn.execute("UPDATE policy_documents SET is_current = 0 WHERE is_current = 1")
        cur = conn.execute(
            """INSERT INTO policy_documents (content_json, is_current, updated_at, updated_by)
               VALUES (?, 1, ?, ?)""",
            (json.dumps(content), now, updated_by),
        )
        new_id = cur.lastrowid
    _structured_cache["doc"] = content
    return new_id or 0


def clear_cache() -> None:
    _structured_cache["doc"] = None


# ── Legacy flattened view ────────────────────────────────────────────────────


class PolicyNotBootstrappedError(RuntimeError):
    """Raised when something asks for the policy but no document is loaded."""

    def __init__(self) -> None:
        super().__init__(
            "No policy document loaded. Run "
            "`python data_pipeline/bootstrap_policy_doc.py` to extract the "
            "Sift Policy Agent's knowledge base from the source PDF."
        )


def load_policy() -> dict:
    """Flatten the structured policy into the legacy-shape rules dict.

    Used by tools written against the pre-Sift schema (policy_check_tool,
    report_tool, etc.). Always reads through `load_structured_policy()` —
    no separate cache, no fallback values, no PDF re-parsing here.
    """
    doc = load_structured_policy()
    if doc is None:
        raise PolicyNotBootstrappedError()

    thresholds = doc.get("thresholds", {}) or {}
    restrictions = doc.get("restrictions", {}) or {}
    sections = doc.get("sections", []) or []

    return {
        "pre_auth_threshold": float(thresholds.get("pre_auth", 0)),
        "receipt_required_above": float(thresholds.get("receipt_required", 0)),
        "tip_meal_max_pct": float(thresholds.get("tip_meal_max_pct", 0)),
        "tip_service_max_pct": float(thresholds.get("tip_service_max_pct", 0)),
        # The Brim policy permits alcohol only when dining with a customer.
        # Older tools query these flags directly; we keep the keys but
        # derive the values from the structured policy text where possible.
        "alcohol_allowed": True,
        "alcohol_customer_only": _alcohol_customer_only(sections),
        "personal_card_fees_reimbursed": False,
        "mcc_restricted": list(restrictions.get("mcc_blocked", []) or []),
        "approval_thresholds": dict(doc.get("approval_thresholds_by_role", {}) or {}),
        "source": "structured_policy",
        "policy_sections": {s["id"]: s.get("body", "") for s in sections},
    }


def _alcohol_customer_only(sections: list[dict]) -> bool:
    """Best-effort heuristic on the bootstrapped section text. Defaults to
    the Brim policy's actual rule (True) if we can't tell."""
    haystack = " ".join((s.get("body") or "").lower() for s in sections)
    if "alcohol" not in haystack:
        return True
    return ("customer" in haystack) or ("client" in haystack)


# ── Fleet MCC + descriptions ────────────────────────────────────────────────
#
# Fleet MCC codes come from the structured policy's
# `restrictions.mcc_fleet_exempt` list. We expose them via a function for
# correctness, and a class instance for the legacy `from .policy_loader
# import FLEET_MCC_CODES` import pattern that's used in many tools.


def get_fleet_mcc_codes() -> set[int]:
    """The current fleet-exempt MCC set from the live policy.

    Returns an empty set if no policy is loaded so callers don't crash —
    `mcc in FLEET_MCC_CODES` then trivially returns False, which is the
    safe behaviour (no MCC is considered fleet-exempt without a policy).
    """
    doc = load_structured_policy()
    if doc is None:
        return set()
    return {int(m) for m in doc.get("restrictions", {}).get("mcc_fleet_exempt", []) or []}


class _FleetMCCSet:
    """A lazy, dynamic stand-in for the legacy `FLEET_MCC_CODES` constant.

    Behaves like a set: supports `in`, iteration, len, intersection. Re-reads
    the live policy on every access so an admin's mid-session policy edit
    immediately changes downstream behaviour.
    """

    def __contains__(self, item) -> bool:
        try:
            return int(item) in get_fleet_mcc_codes()
        except (TypeError, ValueError):
            return False

    def __iter__(self):
        return iter(get_fleet_mcc_codes())

    def __len__(self) -> int:
        return len(get_fleet_mcc_codes())

    def __or__(self, other):
        return get_fleet_mcc_codes() | set(other)

    def __and__(self, other):
        return get_fleet_mcc_codes() & set(other)

    def __repr__(self) -> str:
        return f"FLEET_MCC_CODES({sorted(get_fleet_mcc_codes())})"


FLEET_MCC_CODES = _FleetMCCSet()


# Static MCC labels — pure display lookup, never policy logic. Lives here
# because every consumer that needs to render a category name uses these.
MCC_DESCRIPTIONS: dict[int, str] = {
    5541: "Gas stations / service stations",
    5542: "Automated fuel dispensers",
    5532: "Auto parts stores (tires, parts)",
    7538: "Auto service shops",
    7542: "Car washes",
    7549: "Towing services",
    9399: "Government services (permits, fees)",
    5045: "Computers and peripherals",
    5085: "Industrial supplies",
    4816: "Telecommunications",
    5533: "Auto accessories",
    5561: "Recreational vehicle dealers",
    5817: "Digital goods",
    5046: "Commercial equipment",
    5921: "Liquor stores (alcohol)",
    5812: "Eating places / restaurants",
    5813: "Bars / drinking places",
    7011: "Hotels / motels",
    4111: "Transportation",
    4131: "Bus lines",
    4411: "Steamship lines",
    7399: "Business services",
    8999: "Services NEC",
    5912: "Drug stores / pharmacies",
    5411: "Grocery stores",
    7993: "Video game arcades",
    7995: "Gambling",
}
