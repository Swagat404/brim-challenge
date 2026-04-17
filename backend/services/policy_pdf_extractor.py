"""
PDF policy extractor — used by both the bootstrap script and the
`POST /api/policy/document/upload` route.

Single code path: pdfplumber pulls text from the PDF, Claude extracts a
strict-schema JSON document. No fallbacks, no stubs — if extraction fails the
caller gets `None` and surfaces the error to the user.

Tests should monkeypatch `_ask_claude` to avoid hitting the API.
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

    `None` when the text can't be extracted, Claude returns an unparseable
    response, or the response fails Pydantic validation. Caller decides what
    to do (the upload route returns 422 to the user).
    """
    text = extract_pdf_text(pdf_bytes)
    if not text.strip():
        return None

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
- Extract values directly from the policy text. Do NOT invent thresholds the policy doesn't state.
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
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Claude policy extraction failed: %s", exc)
        return None
