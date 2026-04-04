"""
Assigns synthetic employees to transactions using geographic/temporal clustering.

Strategy:
- Code 3001 (shared fleet card): cluster transactions by (date × state) so no
  single driver appears in two distant states on the same day. Assign each
  (date, state) cluster to one of 18 drivers using a consistent hash so the
  same driver always works the same geographic region.
- Code 3005: directly mapped to dispatchers E019/E020 by merchant name.
- Code 3006: mapped to Finance department (E031–E035, E040).
- Code 3035: mapped to CEO E036.
- Codes 108, 137, 375, 401, 404: mapped to Finance admin (E032).
"""
import pandas as pd
import numpy as np
import hashlib
import sqlite3
import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ─── Employee table ───────────────────────────────────────────────────────────
EMPLOYEES = [
    {"id": "E001", "name": "Marcus Rivera",    "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2021-03-15", "monthly_budget": 8000},
    {"id": "E002", "name": "Tyler Kowalski",   "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2020-07-01", "monthly_budget": 8000},
    {"id": "E003", "name": "Devon Okafor",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2022-01-10", "monthly_budget": 8000},
    {"id": "E004", "name": "Jasmine Tran",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2019-11-05", "monthly_budget": 8000},
    {"id": "E005", "name": "Brett Holloway",   "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2023-02-20", "monthly_budget": 7500},
    {"id": "E006", "name": "Kenji Watanabe",   "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2021-09-14", "monthly_budget": 8000},
    {"id": "E007", "name": "Sofia Mendes",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2020-04-22", "monthly_budget": 7500},
    {"id": "E008", "name": "Curtis Webb",      "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2018-06-30", "monthly_budget": 8500},
    {"id": "E009", "name": "Priya Sharma",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2022-08-01", "monthly_budget": 7500},
    {"id": "E010", "name": "Nate Bergmann",    "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2019-03-18", "monthly_budget": 8000},
    {"id": "E011", "name": "Amara Diallo",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2023-05-09", "monthly_budget": 7000},
    {"id": "E012", "name": "Jake Sorensen",    "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2021-12-01", "monthly_budget": 8000},
    {"id": "E013", "name": "Lena Fischer",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2020-10-17", "monthly_budget": 7500},
    {"id": "E014", "name": "Carlos Reyes",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2022-06-25", "monthly_budget": 8000},
    {"id": "E015", "name": "Patrick Nguyen",   "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2017-09-12", "monthly_budget": 9000},
    {"id": "E016", "name": "Dana Korhonen",    "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2021-07-04", "monthly_budget": 7500},
    {"id": "E017", "name": "Omar Hassan",      "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2023-01-16", "monthly_budget": 7000},
    {"id": "E018", "name": "Brooke Tanaka",    "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2019-08-28", "monthly_budget": 8000},
    {"id": "E019", "name": "Rosenberg T.",     "dept": "Operations", "role": "Fleet Dispatcher",    "card": 3005, "hired": "2016-04-01", "monthly_budget": 3000},
    {"id": "E020", "name": "Sheldon Park",     "dept": "Operations", "role": "Fleet Dispatcher",    "card": 3005, "hired": "2018-11-20", "monthly_budget": 3000},
    {"id": "E021", "name": "Grace O'Neill",    "dept": "Operations", "role": "Dispatcher",           "card": 3001, "hired": "2022-03-07", "monthly_budget": 2500},
    {"id": "E022", "name": "Ivan Petrov",      "dept": "Operations", "role": "Dispatcher",           "card": 3001, "hired": "2023-09-15", "monthly_budget": 2500},
    {"id": "E023", "name": "Darrell King",     "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2015-02-14", "monthly_budget": 5000},
    {"id": "E024", "name": "Heidi Larsen",     "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2020-09-03", "monthly_budget": 4500},
    {"id": "E025", "name": "Tobias Grant",     "dept": "Maintenance","role": "Senior Mechanic",      "card": 3001, "hired": "2017-06-19", "monthly_budget": 6000},
    {"id": "E026", "name": "Mia Kovacs",       "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2021-04-12", "monthly_budget": 4500},
    {"id": "E027", "name": "Ray Nakamura",     "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2019-07-22", "monthly_budget": 5000},
    {"id": "E028", "name": "Sandra Liu",       "dept": "Maintenance","role": "Parts Manager",        "card": 3001, "hired": "2018-03-31", "monthly_budget": 7000},
    {"id": "E029", "name": "Felix Adeyemi",    "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2023-08-01", "monthly_budget": 4000},
    {"id": "E030", "name": "Courtney Marsh",   "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2022-11-10", "monthly_budget": 4000},
    {"id": "E031", "name": "Victor Chen",      "dept": "Finance",    "role": "CFO",                  "card": 3006, "hired": "2014-01-07", "monthly_budget": 5000},
    {"id": "E032", "name": "Nadia Osei",       "dept": "Finance",    "role": "Finance Manager",      "card": 3006, "hired": "2018-05-14", "monthly_budget": 3000},
    {"id": "E033", "name": "Trevor Mills",     "dept": "Finance",    "role": "Accountant",           "card": 3006, "hired": "2020-02-24", "monthly_budget": 2000},
    {"id": "E034", "name": "Hannah West",      "dept": "Finance",    "role": "Accounts Payable",     "card": 3006, "hired": "2021-10-18", "monthly_budget": 1500},
    {"id": "E035", "name": "Alan Blackwood",   "dept": "Finance",    "role": "Payroll Specialist",   "card": 3006, "hired": "2019-06-03", "monthly_budget": 1500},
    {"id": "E036", "name": "Sarah Whitfield",  "dept": "Management", "role": "CEO",                  "card": 3035, "hired": "2012-09-01", "monthly_budget": 10000},
    {"id": "E037", "name": "James Okonkwo",    "dept": "Management", "role": "COO",                  "card": 3001, "hired": "2015-03-15", "monthly_budget": 8000},
    {"id": "E038", "name": "Patricia Hunt",    "dept": "Management", "role": "VP Operations",        "card": 3001, "hired": "2017-08-07", "monthly_budget": 7000},
    {"id": "E039", "name": "Derek Soriano",    "dept": "Management", "role": "Regional Manager",     "card": 3001, "hired": "2019-01-22", "monthly_budget": 5000},
    {"id": "E040", "name": "Michelle Caron",   "dept": "Management", "role": "HR Manager",           "card": 3006, "hired": "2018-07-11", "monthly_budget": 3000},
    {"id": "E041", "name": "Brandon Leitch",   "dept": "Sales",      "role": "Sales Manager",        "card": 3001, "hired": "2019-04-29", "monthly_budget": 5000},
    {"id": "E042", "name": "Olivia Park",      "dept": "Sales",      "role": "Account Executive",    "card": 3001, "hired": "2021-11-01", "monthly_budget": 4000},
    {"id": "E043", "name": "Darius Monroe",    "dept": "Sales",      "role": "Account Executive",    "card": 3001, "hired": "2022-09-12", "monthly_budget": 4000},
    {"id": "E044", "name": "Fiona Walsh",      "dept": "Sales",      "role": "Business Dev Rep",     "card": 3001, "hired": "2023-03-20", "monthly_budget": 3500},
    {"id": "E045", "name": "Marco Esposito",   "dept": "Sales",      "role": "Account Executive",    "card": 3001, "hired": "2020-06-08", "monthly_budget": 4000},
    {"id": "E046", "name": "Kim Nakagawa",     "dept": "IT",         "role": "IT Manager",           "card": 3001, "hired": "2018-02-19", "monthly_budget": 4000},
    {"id": "E047", "name": "Leo Baptiste",     "dept": "IT",         "role": "Systems Admin",        "card": 3001, "hired": "2022-07-04", "monthly_budget": 3000},
    {"id": "E048", "name": "Chloe Dubois",     "dept": "IT",         "role": "IT Support",           "card": 3001, "hired": "2023-06-01", "monthly_budget": 2500},
    {"id": "E049", "name": "Russell Townsend", "dept": "Compliance","role": "Safety Manager",        "card": 3001, "hired": "2016-10-14", "monthly_budget": 3000},
    {"id": "E050", "name": "Yvonne Castillo",  "dept": "Compliance","role": "Compliance Officer",    "card": 3001, "hired": "2020-12-01", "monthly_budget": 2500},
]

# 18 driver IDs for card 3001 fleet assignment
DRIVER_IDS = [e["id"] for e in EMPLOYEES if e["role"] == "Long-Haul Driver"]

# Geographic region → consistent driver affinity
# Drivers tend to run the same regional corridors
REGION_DRIVERS = {
    # Canada West
    "AB": ["E006", "E007", "E016"],
    "BC": ["E006", "E016"],
    "MB": ["E010", "E012"],
    "SK": ["E010", "E016"],
    "ON": ["E001", "E004", "E015"],
    "QC": ["E004", "E013"],
    # Canada other
    "NB": ["E013"], "NS": ["E013"], "PE": ["E013"],
    # US Mountain/West
    "MT": ["E003", "E010"],
    "ND": ["E010", "E011"],
    "SD": ["E010", "E011"],
    "WY": ["E005", "E009"],
    "CO": ["E005", "E009"],
    "ID": ["E006", "E007"],
    "WA": ["E007", "E016"],
    "OR": ["E007"],
    "NV": ["E009"],
    "UT": ["E009"],
    "AZ": ["E009"],
    "CA": ["E007", "E009"],
    # US Midwest
    "MN": ["E002", "E012"],
    "WI": ["E002", "E012"],
    "IA": ["E002", "E003"],
    "NE": ["E003", "E005"],
    "KS": ["E005"],
    "MO": ["E003", "E014"],
    "IL": ["E001", "E014"],
    "IN": ["E001", "E014"],
    "OH": ["E001", "E008"],
    "MI": ["E008", "E012"],
    # US South/Southeast
    "TN": ["E014", "E015"],
    "KY": ["E014", "E015"],
    "GA": ["E015", "E018"],
    "FL": ["E018"],
    "AL": ["E018"],
    "MS": ["E015"],
    "LA": ["E017"],
    "TX": ["E017"],
    "OK": ["E017"],
    "AR": ["E015", "E017"],
    # US Northeast
    "PA": ["E008", "E001"],
    "NY": ["E008", "E004"],
    "VA": ["E008"],
    "NC": ["E018"],
    "SC": ["E018"],
    "WV": ["E008"],
    "NJ": ["E004"],
    "MD": ["E004"],
    "CT": ["E004"],
    # Other
    "NL": ["E013"], "NWT": ["E016"],
}


def driver_for_state(state: str, date_str: str) -> str:
    """Pick a consistent driver for a given state using regional affinity + date hash fallback."""
    candidates = REGION_DRIVERS.get(str(state), DRIVER_IDS)
    # Use a hash of date to consistently pick the same driver for a state on a given day
    key = f"{date_str}:{state}"
    h = int(hashlib.md5(key.encode()).hexdigest(), 16)
    return candidates[h % len(candidates)]


def assign_employees(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["employee_id"] = None
    df["employee_name"] = None
    df["department"] = None
    df["role"] = None

    emp_by_id = {e["id"]: e for e in EMPLOYEES}

    # Build lookup by card code for non-3001 codes
    direct_card_map = {
        # Code 3005 → Dispatchers by merchant name
        3005: {"default": "E019"},
        # Code 3006 → Finance team round-robin
        3006: {"default": "E031"},
        # Code 3035 → CEO
        3035: {"default": "E036"},
        # Administrative codes → Finance Manager
        108:  {"default": "E032"},
        137:  {"default": "E032"},
        375:  {"default": "E031"},
        401:  {"default": "E032"},
        404:  {"default": "E032"},
    }

    # Code 3006 finance round-robin pool
    finance_pool = ["E031", "E032", "E033", "E034", "E035", "E040"]
    finance_counter = [0]

    # Code 3005 dispatcher by merchant
    rosenberg_merchants = {"ROSENBERG TR-LI02038", "SHELDON TRAV-448273"}

    for idx, row in df.iterrows():
        code = row["Transaction Code"]
        state = row.get("Merchant State/Province", None)
        date_str = str(row["Transaction Date"])[:10] if pd.notna(row["Transaction Date"]) else "2025-01-01"

        if code == 3001:
            # Assign based on geographic region
            if pd.notna(state) and str(state).strip():
                eid = driver_for_state(str(state).strip(), date_str)
            else:
                # No state (international/NaN) — hash on date + merchant
                merchant = str(row.get("Merchant Info DBA Name", ""))
                key = f"{date_str}:{merchant}"
                h = int(hashlib.md5(key.encode()).hexdigest(), 16)
                eid = DRIVER_IDS[h % len(DRIVER_IDS)]

        elif code == 3005:
            merchant = str(row.get("Merchant Info DBA Name", ""))
            if any(m in merchant for m in rosenberg_merchants):
                eid = "E019"
            else:
                eid = "E020"

        elif code == 3006:
            eid = finance_pool[finance_counter[0] % len(finance_pool)]
            finance_counter[0] += 1

        elif code == 3035:
            eid = "E036"

        else:
            # 108, 137, 375, 401, 404 → Finance admin
            eid = direct_card_map.get(code, {}).get("default", "E032")

        emp = emp_by_id[eid]
        df.at[idx, "employee_id"] = eid
        df.at[idx, "employee_name"] = emp["name"]
        df.at[idx, "department"] = emp["dept"]
        df.at[idx, "role"] = emp["role"]

    return df


def build_sqlite(df_enriched: pd.DataFrame, db_path: str):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Employees table
    c.execute("DROP TABLE IF EXISTS employees")
    c.execute("""
        CREATE TABLE employees (
            id TEXT PRIMARY KEY,
            name TEXT,
            department TEXT,
            role TEXT,
            card_code INTEGER,
            hire_date TEXT,
            monthly_budget REAL,
            manager_id TEXT
        )
    """)
    emp_df = pd.DataFrame(EMPLOYEES)
    emp_df = emp_df.rename(columns={"id": "id", "name": "name", "dept": "department",
                                     "role": "role", "card": "card_code",
                                     "hired": "hire_date", "monthly_budget": "monthly_budget"})
    emp_df["manager_id"] = None
    emp_df[["id","name","department","role","card_code","hire_date","monthly_budget","manager_id"]].to_sql(
        "employees", conn, if_exists="replace", index=False)

    # Transactions table
    c.execute("DROP TABLE IF EXISTS transactions")
    tx = df_enriched.copy()
    tx.columns = [c.lower().replace(" ", "_").replace("/", "_") for c in tx.columns]
    # Normalize currency to CAD
    tx["conversion_rate"] = tx["conversion_rate"].fillna(0)
    tx["amount_cad"] = tx.apply(
        lambda r: r["transaction_amount"] * r["conversion_rate"]
        if r["conversion_rate"] > 0 else r["transaction_amount"],
        axis=1
    )
    # Flag administrative/payment codes
    tx["is_operational"] = tx["transaction_code"].isin([3001, 3005, 3006, 3035]).astype(int)
    tx.to_sql("transactions", conn, if_exists="replace", index=False)

    # Policy violations seed table
    c.execute("DROP TABLE IF EXISTS policy_violations")
    c.execute("""
        CREATE TABLE policy_violations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_rowid INTEGER,
            employee_id TEXT,
            violation_type TEXT,
            severity TEXT,
            description TEXT,
            amount REAL,
            detected_at TEXT
        )
    """)

    # Approvals table
    c.execute("DROP TABLE IF EXISTS approvals")
    c.execute("""
        CREATE TABLE approvals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_rowid INTEGER,
            employee_id TEXT,
            amount REAL,
            merchant TEXT,
            status TEXT DEFAULT 'pending',
            ai_recommendation TEXT,
            ai_reasoning TEXT,
            approver_id TEXT,
            requested_at TEXT,
            resolved_at TEXT
        )
    """)

    # Expense reports table
    c.execute("DROP TABLE IF EXISTS expense_reports")
    c.execute("""
        CREATE TABLE expense_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_name TEXT,
            employee_id TEXT,
            period_start TEXT,
            period_end TEXT,
            total_amount REAL,
            status TEXT DEFAULT 'draft',
            created_at TEXT,
            transaction_ids TEXT
        )
    """)

    conn.commit()
    conn.close()
    print(f"SQLite DB written to {db_path}")


if __name__ == "__main__":
    xl_path = os.path.join(BASE_DIR, "dummy_data (2).xlsx")
    db_path = os.path.join(BASE_DIR, "brim_expenses.db")

    print("Loading Excel...")
    df = pd.read_excel(xl_path)
    print(f"Loaded {len(df)} transactions")

    print("Assigning employees...")
    df_enriched = assign_employees(df)

    print("\nEmployee assignment distribution:")
    print(df_enriched.groupby(["employee_id", "employee_name"])["Transaction Amount"].agg(["count","sum"]).sort_values("count", ascending=False).head(25))

    print("\nDepartment distribution:")
    print(df_enriched.groupby("department")["Transaction Amount"].agg(["count","sum"]))

    print("\nBuilding SQLite database...")
    build_sqlite(df_enriched, db_path)

    # Save enriched CSV for reference
    csv_path = os.path.join(BASE_DIR, "data_pipeline", "enriched_transactions.csv")
    df_enriched.to_csv(csv_path, index=False)
    print(f"Enriched CSV saved to {csv_path}")
    print("\nDone.")
