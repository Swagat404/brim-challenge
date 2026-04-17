"""
Seed Sift policy suggestions by running the REAL LLM generator.

No hand-authored content — calls policy_suggestions_tool.generate_suggestions
against the bootstrapped policy + recent activity. If the LLM finds no gaps
(unlikely), the panel stays empty and that's honest.

Usage:
    python data_pipeline/seed_demo_suggestions.py
"""
from __future__ import annotations

import asyncio
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(ROOT, "..", "brim_expenses.db"))
sys.path.insert(0, os.path.abspath(os.path.join(ROOT, "..", "backend")))


async def main() -> None:
    from agent.tools.policy_suggestions_tool import generate_suggestions

    conn = sqlite3.connect(DB_PATH)
    try:
        # Wipe any prior suggestions so this seed is reproducible
        conn.execute("DELETE FROM policy_suggestions")
        conn.commit()
    finally:
        conn.close()

    print("Calling Sift to scan the policy + recent activity for suggestions…")
    rows = await generate_suggestions()
    print(f"Generated {len(rows)} suggestions.")
    for r in rows:
        print(f"  · [{r['category']}] {r['title']}")


if __name__ == "__main__":
    asyncio.run(main())
