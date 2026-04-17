"""
Bootstrap the structured policy_documents row from the source PDF.

Idempotent — safe to re-run. If a current policy already exists you must pass
--force to overwrite it.

Path: same code path the user-facing PDF upload route uses
(`backend/services/policy_pdf_extractor.extract_structured_policy`). One source
of truth for "PDF -> structured JSON". Always calls Claude — no fallback.

Run:
    cd "/path/to/repo"
    python data_pipeline/bootstrap_policy_doc.py            # skip if current exists
    python data_pipeline/bootstrap_policy_doc.py --force    # replace
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(ROOT, "..", "brim_expenses.db"))
PDF_PATH = os.path.abspath(os.path.join(ROOT, "..", "Brim Expense Policy.pdf"))

# Make backend imports work
sys.path.insert(0, os.path.abspath(os.path.join(ROOT, "..", "backend")))


def _has_current(conn: sqlite3.Connection) -> bool:
    cur = conn.execute("SELECT 1 FROM policy_documents WHERE is_current = 1 LIMIT 1")
    return cur.fetchone() is not None


def _save(conn: sqlite3.Connection, content: dict, updated_by: str) -> int:
    now = datetime.utcnow().isoformat()
    conn.execute("UPDATE policy_documents SET is_current = 0 WHERE is_current = 1")
    cur = conn.execute(
        """INSERT INTO policy_documents (content_json, is_current, updated_at, updated_by)
           VALUES (?, 1, ?, ?)""",
        (json.dumps(content), now, updated_by),
    )
    return cur.lastrowid or 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap the structured policy document")
    parser.add_argument("--force", action="store_true",
                        help="Overwrite the current policy if one exists")
    parser.add_argument("--pdf", default=PDF_PATH, help="Path to the source PDF")
    args = parser.parse_args()

    if not os.path.exists(DB_PATH):
        print(f"DB not found at {DB_PATH}. Run migrate_v2.py first.", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(args.pdf):
        print(f"PDF not found at {args.pdf}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    try:
        if _has_current(conn) and not args.force:
            print("A current policy already exists. Pass --force to overwrite.")
            return

        from services.policy_pdf_extractor import extract_structured_policy

        with open(args.pdf, "rb") as f:
            pdf_bytes = f.read()

        print(f"Extracting policy from {args.pdf} ({len(pdf_bytes)} bytes) via Claude...")
        doc = extract_structured_policy(pdf_bytes)
        if doc is None:
            print("Extraction failed. No policy bootstrapped.", file=sys.stderr)
            sys.exit(2)

        new_id = _save(conn, doc.model_dump(), updated_by="bootstrap")
        conn.commit()
        print(f"Policy {new_id} saved.")
        print(f"  name: {doc.name}")
        print(f"  thresholds: {doc.thresholds}")
        print(f"  sections: {len(doc.sections)}")
        print(f"  auto_approval_rules: {len(doc.auto_approval_rules.rules)}")
        print(f"  submission_requirements: {len(doc.submission_requirements)}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
