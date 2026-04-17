"""
Seed transaction submissions for the 10 demo approvals.

For each, sets memo / business_purpose / attendees / GL code that mirror what
a real employee would submit. One entry — Fiona Walsh's $445 Harbour 60
dinner — is intentionally left without attendees so the AI re-recommendation
flips to 'review' citing the missing-attendees submission requirement.

Receipts: writes a synthetic placeholder image into backend/uploads/receipts/
for two of the approvals so the receipt-thumbnail UI has something to render.
We do NOT call real Claude vision OCR at seed time (it would burn API cost
on placeholder images that aren't real receipts) — receipt_ocr_text gets a
clear stub note so the UI shows the disclosure but no fake content.

Usage:
    python data_pipeline/seed_demo_submissions.py
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(ROOT, "..", "brim_expenses.db"))
UPLOAD_DIR = Path(os.path.join(ROOT, "..", "backend", "uploads", "receipts")).resolve()


# Tied to the approvals seeded by seed_demo_approvals.py.
# Lookup is by (employee_id, merchant substring, amount within $1).
SUBMISSIONS: list[dict] = [
    # APPROVE story — receipt + purpose attached, fleet routine fuel
    {
        "lookup": ("E001", "FLYING J", 1450.0),
        "memo": "DEF refill + diesel, Edmonton run",
        "business_purpose": "Long-haul fuel for shipment SH-2218",
        "attendees": [],
        "gl_code": "5520.OPS",
        "receipt": "flying_j_receipt.png",
    },
    # APPROVE story — exec professional development, full submission
    {
        "lookup": ("E036", "ROTMAN EXEC", 1250.0),
        "memo": "Rotman Executive Education — Strategic Leadership module",
        "business_purpose": "Q2 leadership development per board recommendation",
        "attendees": ["Sarah Whitfield"],
        "gl_code": "6700.MGT",
        "receipt": "rotman_invoice.png",
    },
    # APPROVE story — conference, full submission with attendees
    {
        "lookup": ("E042", "SAAS CONNECT", 1972.0),
        "memo": "SaaS Connect 2026 conference registration",
        "business_purpose": "Pipeline development with target Series-B accounts (Acme, Initech, Globex)",
        "attendees": ["Olivia Park", "Catherine Liu — Acme", "Jake Park — Acme"],
        "gl_code": "6420.SLS",
        "receipt": "saas_connect_registration.png",
    },
    # REVIEW story — meal at fine-dining without attendees / purpose / receipt.
    # Demo flip: when the finance manager fills these in, the AI should
    # re-decide to approve.
    {
        "lookup": ("E044", "HARBOUR 60", 445.0),
        "memo": "Dinner at Harbour 60",
        "business_purpose": "",
        "attendees": [],
        "gl_code": "6450.SLS",
        "receipt": None,
    },
    # REJECT story — pharmacy on a corporate card; MCC 5912 is in the
    # blocked list. Submission has nothing — there is no business purpose.
    {
        "lookup": ("E006", "SHOPPERS DRUG", 758.0),
        "memo": "",
        "business_purpose": "",
        "attendees": [],
        "gl_code": "",
        "receipt": None,
    },
]


def main() -> None:
    if not os.path.exists(DB_PATH):
        print(f"DB not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        # Wipe submissions for the demo approvals only — leaves any user-created
        # submissions alone.
        cur.execute(
            """DELETE FROM transaction_submissions
                WHERE transaction_rowid IN (
                    SELECT transaction_rowid FROM approvals WHERE status = 'pending')"""
        )

        seeded = 0
        for spec in SUBMISSIONS:
            emp_id, merchant_substr, amount = spec["lookup"]
            txn = cur.execute(
                """SELECT t.rowid FROM transactions t
                    JOIN approvals a ON a.transaction_rowid = t.rowid
                   WHERE t.employee_id = ?
                     AND UPPER(t.merchant_info_dba_name) LIKE UPPER(?)
                     AND ABS(t.amount_cad - ?) < 1.0
                     AND a.status = 'pending'
                   LIMIT 1""",
                (emp_id, f"%{merchant_substr}%", amount),
            ).fetchone()
            if not txn:
                print(f"  · skip: no pending approval for {emp_id} / {merchant_substr}")
                continue
            rowid = txn[0]

            receipt_url, ocr_text = (None, None)
            if spec["receipt"]:
                receipt_url, ocr_text = _seed_receipt(rowid, spec["receipt"])

            now = datetime.utcnow().isoformat()
            cur.execute(
                """INSERT INTO transaction_submissions
                   (transaction_rowid, receipt_url, receipt_ocr_text,
                    memo, business_purpose, attendees_json, gl_code,
                    submitted_at, submitted_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    rowid, receipt_url, ocr_text,
                    spec["memo"] or None,
                    spec["business_purpose"] or None,
                    json.dumps(spec["attendees"]) if spec["attendees"] else None,
                    spec["gl_code"] or None,
                    now, "demo-seed",
                ),
            )
            seeded += 1
            print(f"  + seeded submission for txn {rowid} ({emp_id} / {merchant_substr})")

        conn.commit()
        print(f"Done. Seeded {seeded} submissions.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _seed_receipt(rowid: int, filename: str) -> tuple[str, str]:
    """Drop a 1x1 placeholder PNG into the uploads dir so the UI thumbnail
    has something to render. The OCR text explicitly notes this is a demo
    placeholder so the UI doesn't pretend Claude vision read a real receipt.
    """
    txn_dir = UPLOAD_DIR / str(rowid)
    txn_dir.mkdir(parents=True, exist_ok=True)
    target = txn_dir / filename

    # Tiny valid PNG (1x1 pixel, white) — keeps the file binary so any
    # MIME sniff still calls it image/png. Source: standard pHYs/IDAT example.
    if not target.exists():
        png_bytes = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452"
            "0000000100000001080600000000"
            "1f15c4890000000d49444154789c"
            "636060606060000000050001ad57"
            "afad0000000049454e44ae426082"
        )
        target.write_bytes(png_bytes)

    receipt_url = f"/uploads/receipts/{rowid}/{filename}"
    ocr_text = (
        f"[demo seed placeholder for {filename}] "
        "Receipt thumbnail rendered for demo; live uploads go through the "
        "real Claude vision OCR path in services/receipt_ocr.py."
    )
    return receipt_url, ocr_text


if __name__ == "__main__":
    main()
