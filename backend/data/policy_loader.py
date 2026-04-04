"""
Loads and parses the Brim expense policy PDF into a structured rules dict.

Critical gap fix: if pdfplumber fails (scanned PDF, no text layer, missing file),
falls back to hardcoded rules extracted from the policy document at review time.
This ensures the compliance engine never crashes at startup.

Rules dict schema:
{
    "pre_auth_threshold": float,        # expenses over this need manager pre-auth
    "receipt_required_above": float,    # receipts required above this
    "tip_service_max_pct": float,       # max tip % for services/porterage
    "tip_meal_max_pct": float,          # max tip % for meals
    "alcohol_allowed": bool,            # alcohol reimbursable?
    "alcohol_customer_only": bool,      # only when dining with customer
    "personal_card_fees_reimbursed": bool,
    "mcc_restricted": list[int],        # MCC codes never reimbursable
    "approval_thresholds": {
        "manager": float,               # needs manager approval above this
    },
    "source": "pdf" | "fallback",
    "raw_text_snippet": str,            # first 500 chars of parsed PDF text
}
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache

logger = logging.getLogger(__name__)

# Hardcoded fallback — extracted from the policy PDF during review.
# Update this if the policy changes.
_FALLBACK_RULES: dict = {
    "pre_auth_threshold": 50.0,
    "receipt_required_above": 50.0,
    "tip_service_max_pct": 15.0,
    "tip_meal_max_pct": 20.0,
    "alcohol_allowed": True,
    "alcohol_customer_only": True,       # only reimbursable when dining with customer
    "personal_card_fees_reimbursed": False,
    "mcc_restricted": [
        7993,   # Video game arcades / gambling
        7995,   # Gambling
    ],
    "approval_thresholds": {
        "manager": 50.0,
    },
    "source": "fallback",
    "raw_text_snippet": (
        "Brim expense policy: all expenses over $50 must be pre-authorized. "
        "Receipts required above $50. Tips: max 15% services, max 20% meals. "
        "Alcohol only when dining with customer. Personal credit card fees not reimbursed."
    ),
    "policy_sections": {
        "business_travel": (
            "Supplier Entertainment: Reasonable entertainment of customers is acceptable. "
            "Names of guests and purpose must be listed. Unless dining with a customer, "
            "expensing alcoholic beverages is not permitted."
        ),
        "tips": (
            "Tips may be expensed up to 15% for services and porterage. "
            "Meal tips included with meal claims, not reimbursed above 20%."
        ),
        "transportation": (
            "Use most efficient and cost-effective transportation. Tolls reimbursed. "
            "Personal vehicle travel reimbursed at CRA rates. Brim does not pay for "
            "traffic or parking tickets."
        ),
        "car_rental": (
            "Company reimburses car rental when deemed necessary. Multiple team members "
            "at same location may be required to share. Receipts required."
        ),
        "corporate_cards": (
            "Corporate cards issued to select team members. Only the named individual may use. "
            "Personal expenses on corporate cards prohibited. Consistent abuse may result in "
            "card revocation."
        ),
    },
}


@lru_cache(maxsize=1)
def load_policy() -> dict:
    """
    Load policy rules. Tries PDF first, falls back to hardcoded rules.
    Cached after first call — call clear_cache() if you need to reload.
    """
    pdf_path = os.environ.get("POLICY_PDF_PATH", "../Brim Expense Policy.pdf")
    pdf_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", pdf_path))

    if not os.path.exists(pdf_path):
        logger.warning("Policy PDF not found at %s — using fallback rules", pdf_path)
        return _FALLBACK_RULES.copy()

    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            text = "\n".join(
                page.extract_text() or "" for page in pdf.pages
            )

        if not text.strip():
            logger.warning("Policy PDF has no extractable text — using fallback rules")
            return _FALLBACK_RULES.copy()

        rules = _parse_policy_text(text)
        rules["source"] = "pdf"
        rules["raw_text_snippet"] = text[:500]
        logger.info("Policy loaded from PDF (%d chars)", len(text))
        return rules

    except Exception as exc:
        logger.warning("Policy PDF parse failed (%s) — using fallback rules", exc)
        return _FALLBACK_RULES.copy()


def _parse_policy_text(text: str) -> dict:
    """
    Extract key thresholds from policy text using pattern matching.
    Falls back to hardcoded defaults for anything we can't parse.
    """
    import re

    rules = _FALLBACK_RULES.copy()
    rules["source"] = "pdf"

    # $50.00 pre-auth threshold
    m = re.search(r"expenses over \$([0-9,]+\.?[0-9]*)", text, re.IGNORECASE)
    if m:
        try:
            rules["pre_auth_threshold"] = float(m.group(1).replace(",", ""))
            rules["receipt_required_above"] = rules["pre_auth_threshold"]
        except ValueError:
            pass

    # Tip percentages
    m_service = re.search(r"([0-9]+)\s*%.*?services and porterage", text, re.IGNORECASE)
    if m_service:
        try:
            rules["tip_service_max_pct"] = float(m_service.group(1))
        except ValueError:
            pass

    m_meal = re.search(r"not be reimbursed above\s+([0-9]+)\s*%", text, re.IGNORECASE)
    if m_meal:
        try:
            rules["tip_meal_max_pct"] = float(m_meal.group(1))
        except ValueError:
            pass

    # Alcohol restriction
    if "unless dining with a customer" in text.lower():
        rules["alcohol_allowed"] = True
        rules["alcohol_customer_only"] = True

    return rules


def clear_cache() -> None:
    load_policy.cache_clear()


# MCC category descriptions (used for policy context enrichment)
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
}

# MCC codes considered "fleet operations" — high amounts are expected/normal
FLEET_MCC_CODES: set[int] = {
    5541,   # gas stations
    5542,   # automated fuel dispensers
    9399,   # government permit fees
    5532,   # auto parts / tires
    7538,   # auto service
    7542,   # car wash (truck wash)
    7549,   # towing
    5046,   # commercial equipment
    5085,   # industrial supplies
}
