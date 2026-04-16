"""
PDF policy extractor — used by both the bootstrap script and the
`POST /api/policy/document/upload` route.

Single code path, one Pydantic schema, one Claude prompt. If anything fails
(missing PDF, empty text, model error, schema validation) we return None and
let the caller decide whether to keep the current policy or use a fallback.

Test isolation:
    POLICY_EXTRACTOR_STUB=1   -> bypass Claude; deterministically construct a
                                 minimal valid PolicyDocument from the text length.
                                 Tests use this to avoid flaky API calls.
"""
from __future__ import annotations

import json
import logging
import os
from io import BytesIO
from typing import Optional

from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)


# ── Pydantic schema for the structured policy ───────────────────────────────


class HiddenNote(BaseModel):
    id: str
    body: str
    applies_to: dict = Field(default_factory=dict)


class PolicySection(BaseModel):
    id: str
    title: str
    body: str
    hidden_notes: list[HiddenNote] = Field(default_factory=list)


class SubmissionRequirement(BaseModel):
    id: str
    applies_when: dict = Field(default_factory=dict)
    require: list[str]
    rationale: str = ""


class AutoApprovalRule(BaseModel):
    id: str
    max_amount: Optional[float] = None
    mcc_in: Optional[list[int]] = None
    mcc_not_in: Optional[list[int]] = None
    role_in: Optional[list[str]] = None
    rationale: str = ""


class AutoApprovalConfig(BaseModel):
    enabled: bool = True
    rules: list[AutoApprovalRule] = Field(default_factory=list)


class PolicyDocument(BaseModel):
    name: str
    effective_date: str = ""
    thresholds: dict
    restrictions: dict
    approval_thresholds_by_role: dict[str, float] = Field(default_factory=dict)
    auto_approval_rules: AutoApprovalConfig = Field(default_factory=AutoApprovalConfig)
    submission_requirements: list[SubmissionRequirement] = Field(default_factory=list)
    sections: list[PolicySection] = Field(default_factory=list)


# ── Public API ──────────────────────────────────────────────────────────────


def extract_pdf_text(pdf_bytes: bytes) -> str:
    """Pull plain text out of a PDF. Returns empty string on failure."""
    try:
        import pdfplumber
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as exc:
        logger.warning("pdfplumber failed: %s", exc)
        return ""


def extract_structured_policy(pdf_bytes: bytes) -> Optional[PolicyDocument]:
    """Top-level entry: PDF bytes -> validated PolicyDocument or None.

    Uses Claude unless POLICY_EXTRACTOR_STUB=1 is set (test mode).
    """
    text = extract_pdf_text(pdf_bytes)
    if not text.strip():
        return None

    if os.environ.get("POLICY_EXTRACTOR_STUB") == "1":
        return _stub_policy_from_text(text)

    raw = _ask_claude(text)
    if not raw:
        return None
    try:
        return PolicyDocument.model_validate(raw)
    except ValidationError as exc:
        logger.warning("Claude returned invalid policy JSON: %s", exc)
        return None


# ── Implementation ──────────────────────────────────────────────────────────


_PROMPT = """You are extracting a corporate expense policy into a structured JSON document.

Read the policy text below and produce a JSON object that matches this schema EXACTLY (no extra fields, no missing required fields):

{{
  "name": "<policy title>",
  "effective_date": "<date string or empty>",
  "thresholds": {{
    "pre_auth": <number, dollars over which pre-authorization is required>,
    "receipt_required": <number, dollars over which a receipt is required>,
    "tip_meal_max_pct": <number 0-100>,
    "tip_service_max_pct": <number 0-100>
  }},
  "restrictions": {{
    "mcc_blocked": [<list of integer MCC codes never reimbursable>],
    "mcc_fleet_exempt": [<list of integer MCC codes exempt from pre-auth, e.g. fuel, tires, towing>]
  }},
  "approval_thresholds_by_role": {{
    "<role name>": <dollar threshold above which that role needs sign-off>
  }},
  "auto_approval_rules": {{
    "enabled": true,
    "rules": [
      {{ "id": "<short id>", "max_amount": <number>, "mcc_in": [<ints>],
         "rationale": "<short reason>" }}
    ]
  }},
  "submission_requirements": [
    {{ "id": "<short id>",
       "applies_when": {{ "amount_over": <number, optional>, "mcc_in": [<ints, optional>] }},
       "require": [<strings from: "receipt", "memo", "attendees", "business_purpose">],
       "rationale": "<one sentence>" }}
  ],
  "sections": [
    {{ "id": "<slug>", "title": "<title>", "body": "<full prose>",
       "hidden_notes": [] }}
  ]
}}

Rules:
- If the policy doesn't state a value, use a sensible default (pre_auth: 50, tip_meal_max_pct: 20, tip_service_max_pct: 15).
- Always include at least one auto_approval_rule for fleet operations under $500 (MCC 5541, 5542, 5532, 7538, 7542, 7549, 9399).
- Always include a submission_requirements entry that requires a receipt for any expense over the receipt_required threshold.
- Sections should preserve the policy's actual structure (Travel, Meals, Tips, Cards, etc.) with the original prose in `body`.
- Output ONLY the JSON object. No prose before or after. No markdown code fences.

POLICY TEXT:
<<<
{text}
>>>
"""


def _ask_claude(text: str) -> Optional[dict]:
    try:
        import anthropic
    except ImportError:
        logger.error("anthropic package not installed")
        return None

    try:
        client = anthropic.Anthropic()
        msg = client.messages.create(
            model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
            max_tokens=4096,
            messages=[{"role": "user", "content": _PROMPT.format(text=text[:24000])}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            # Strip ``` fences if the model added them despite instructions
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Claude policy extraction failed: %s", exc)
        return None


def _stub_policy_from_text(text: str) -> PolicyDocument:
    """Deterministic minimal policy used by tests (POLICY_EXTRACTOR_STUB=1)."""
    return PolicyDocument(
        name="Stub Policy (test)",
        effective_date="2026-01-01",
        thresholds={
            "pre_auth": 50.0,
            "receipt_required": 50.0,
            "tip_meal_max_pct": 20.0,
            "tip_service_max_pct": 15.0,
        },
        restrictions={"mcc_blocked": [7993, 7995], "mcc_fleet_exempt": [5541, 5542]},
        approval_thresholds_by_role={},
        auto_approval_rules=AutoApprovalConfig(
            enabled=True,
            rules=[
                AutoApprovalRule(
                    id="fleet_small",
                    max_amount=500.0,
                    mcc_in=[5541, 5542],
                    rationale="Routine fleet expense",
                )
            ],
        ),
        submission_requirements=[
            SubmissionRequirement(
                id="receipt_above_threshold",
                applies_when={"amount_over": 50},
                require=["receipt"],
                rationale="Receipt required above pre-auth threshold",
            )
        ],
        sections=[
            PolicySection(id="general", title="General", body=text[:500])
        ],
    )
