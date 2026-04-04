#!/usr/bin/env python3
"""Insert 200+ synthetic transactions into the BRIM expenses database.

Idempotent: deletes any rows with transaction_description = 'SYNTHETIC'
before inserting fresh data.
"""

import sqlite3
from collections import defaultdict

DB_PATH = "/Users/swagatbhowmik/CS projects/BRIM challenge/brim_expenses.db"
MARKER = "SYNTHETIC"


def txn(eid, name, dept, role, merchant, amount, mcc,
        city, country, state, postal, date_str):
    """Build a transaction dict.

    ``amount`` is in local currency (CAD for CAN, USD for USA).
    """
    if country == "CAN":
        txn_amount = amount
        amount_cad = amount
        conv = 1.0
    else:
        txn_amount = amount
        amount_cad = round(amount * 1.36, 2)
        conv = 1.36

    return (
        3001, MARKER, 1,
        date_str + " 00:00:00",
        date_str + " 00:00:00",
        merchant, txn_amount, "Debit",
        mcc, city, country, postal, state,
        conv, eid, name, dept, role,
        amount_cad, 1,
    )


# ── Employee shorthand helpers ────────────────────────────────────────
def _it(eid, name, role):
    return lambda m, a, mcc, ci, co, st, pc, d: txn(
        eid, name, "IT", role, m, a, mcc, ci, co, st, pc, d)

def _sales(eid, name, role):
    return lambda m, a, mcc, ci, co, st, pc, d: txn(
        eid, name, "Sales", role, m, a, mcc, ci, co, st, pc, d)

def _maint(eid, name, role):
    return lambda m, a, mcc, ci, co, st, pc, d: txn(
        eid, name, "Maintenance", role, m, a, mcc, ci, co, st, pc, d)

def _mgmt(eid, name, role):
    return lambda m, a, mcc, ci, co, st, pc, d: txn(
        eid, name, "Management", role, m, a, mcc, ci, co, st, pc, d)

def _comp(eid, name, role):
    return lambda m, a, mcc, ci, co, st, pc, d: txn(
        eid, name, "Compliance", role, m, a, mcc, ci, co, st, pc, d)

def _fin(eid, name, role):
    return lambda m, a, mcc, ci, co, st, pc, d: txn(
        eid, name, "Finance", role, m, a, mcc, ci, co, st, pc, d)


def build_transactions():
    rows = []

    # ═══════════════════════════════════════════════════════════════════
    #  IT DEPARTMENT  (~30 txns)
    # ═══════════════════════════════════════════════════════════════════
    kim = _it("E046", "Kim Nakagawa", "IT Manager")
    leo = _it("E047", "Leo Baptiste", "Systems Admin")
    chloe = _it("E048", "Chloe Dubois", "IT Support")

    # Kim Nakagawa — AWS (monthly, varying)
    rows.append(kim("AMAZON WEB SERVICES",    487.23, 4816, "SEATTLE",     "USA", "WA", "98109", "2025-09-05"))
    rows.append(kim("AMAZON WEB SERVICES",    512.67, 4816, "SEATTLE",     "USA", "WA", "98109", "2025-10-05"))
    rows.append(kim("AMAZON WEB SERVICES",    623.41, 4816, "SEATTLE",     "USA", "WA", "98109", "2025-11-05"))
    rows.append(kim("AMAZON WEB SERVICES",    558.92, 4816, "SEATTLE",     "USA", "WA", "98109", "2025-12-05"))
    rows.append(kim("AMAZON WEB SERVICES",    701.33, 4816, "SEATTLE",     "USA", "WA", "98109", "2026-01-05"))
    rows.append(kim("AMAZON WEB SERVICES",    689.15, 4816, "SEATTLE",     "USA", "WA", "98109", "2026-02-05"))
    rows.append(kim("AMAZON WEB SERVICES",    745.88, 4816, "SEATTLE",     "USA", "WA", "98109", "2026-03-05"))
    # Kim — GitHub Enterprise (quarterly-ish billing)
    rows.append(kim("GITHUB INC",             189.00, 5734, "SAN FRANCISCO", "USA", "CA", "94107", "2025-09-01"))
    rows.append(kim("GITHUB INC",             189.00, 5734, "SAN FRANCISCO", "USA", "CA", "94107", "2025-11-01"))
    rows.append(kim("GITHUB INC",             189.00, 5734, "SAN FRANCISCO", "USA", "CA", "94107", "2026-01-01"))
    rows.append(kim("GITHUB INC",             189.00, 5734, "SAN FRANCISCO", "USA", "CA", "94107", "2026-03-01"))
    # Kim — Dell laptop
    rows.append(kim("DELL TECHNOLOGIES",     1899.99, 5045, "TORONTO",     "CAN", "ON", "M5V 2T3", "2025-10-18"))

    # EDGE CASE: Weekend spending — Kim buys at Best Buy on Saturday
    rows.append(kim("BEST BUY #934",          312.00, 5732, "TORONTO",     "CAN", "ON", "M5V 3A5", "2025-11-15"))

    # Leo Baptiste — Jira
    rows.append(leo("ATLASSIAN JIRA",         230.00, 5734, "SAN FRANCISCO", "USA", "CA", "94105", "2025-10-01"))
    rows.append(leo("ATLASSIAN JIRA",         230.00, 5734, "SAN FRANCISCO", "USA", "CA", "94105", "2025-12-01"))
    rows.append(leo("ATLASSIAN JIRA",         230.00, 5734, "SAN FRANCISCO", "USA", "CA", "94105", "2026-02-01"))
    # Leo — Cloud hosting
    rows.append(leo("DIGITALOCEAN",           347.52, 4816, "NEW YORK",    "USA", "NY", "10003",  "2025-11-10"))
    rows.append(leo("DIGITALOCEAN",           489.00, 4816, "NEW YORK",    "USA", "NY", "10003",  "2026-01-10"))
    rows.append(leo("CLOUDFLARE INC",         312.80, 4816, "SAN FRANCISCO", "USA", "CA", "94107", "2026-03-15"))
    # Leo — Networking equipment
    rows.append(leo("CDW CANADA",            1199.99, 5045, "MISSISSAUGA", "CAN", "ON", "L5B 2C9", "2025-12-12"))
    # Leo — Domain renewals
    rows.append(leo("GODADDY.COM",             14.99, 4816, "SCOTTSDALE",  "USA", "AZ", "85260",  "2025-09-20"))
    rows.append(leo("NAMECHEAP INC",           79.99, 4816, "LOS ANGELES", "USA", "CA", "90014",  "2026-02-18"))

    # Chloe Dubois — Slack
    rows.append(chloe("SLACK TECHNOLOGIES",   165.00, 5734, "SAN FRANCISCO", "USA", "CA", "94105", "2025-09-01"))
    rows.append(chloe("SLACK TECHNOLOGIES",   165.00, 5734, "SAN FRANCISCO", "USA", "CA", "94105", "2025-11-01"))
    rows.append(chloe("SLACK TECHNOLOGIES",   165.00, 5734, "SAN FRANCISCO", "USA", "CA", "94105", "2026-01-01"))
    rows.append(chloe("SLACK TECHNOLOGIES",   165.00, 5734, "SAN FRANCISCO", "USA", "CA", "94105", "2026-03-01"))
    # Chloe — Zoom
    rows.append(chloe("ZOOM VIDEO COMM",      199.00, 5734, "SAN JOSE",    "USA", "CA", "95113",  "2025-10-01"))
    rows.append(chloe("ZOOM VIDEO COMM",      199.00, 5734, "SAN JOSE",    "USA", "CA", "95113",  "2025-12-01"))
    rows.append(chloe("ZOOM VIDEO COMM",      199.00, 5734, "SAN JOSE",    "USA", "CA", "95113",  "2026-02-01"))
    # Chloe — Monitors
    rows.append(chloe("DELL TECHNOLOGIES",    649.99, 5045, "TORONTO",     "CAN", "ON", "M5V 2T3", "2026-01-15"))
    # Chloe — Peripherals
    rows.append(chloe("LOGITECH CANADA",       89.99, 5045, "TORONTO",     "CAN", "ON", "M5G 1Z8", "2025-11-22"))
    rows.append(chloe("AMAZON.CA",             67.49, 5045, "TORONTO",     "CAN", "ON", "M5V 2T3", "2026-03-10"))

    # ═══════════════════════════════════════════════════════════════════
    #  SALES DEPARTMENT  (~60 txns)
    # ═══════════════════════════════════════════════════════════════════
    brandon = _sales("E041", "Brandon Leitch", "Sales Manager")
    olivia  = _sales("E042", "Olivia Park", "Account Executive")
    darius  = _sales("E043", "Darius Monroe", "Account Executive")
    fiona   = _sales("E044", "Fiona Walsh", "Business Dev Rep")
    marco   = _sales("E045", "Marco Esposito", "Account Executive")

    # ── Brandon Leitch ────────────────────────────────────────────
    rows.append(brandon("BATON ROUGE",        275.40, 5812, "TORONTO", "CAN", "ON", "M5H 1T1", "2025-09-10"))
    rows.append(brandon("KING STREET FOOD CO", 345.00, 5812, "TORONTO", "CAN", "ON", "M5V 1K4", "2025-10-03"))
    rows.append(brandon("SHERATON CENTRE",     289.00, 7011, "TORONTO", "CAN", "ON", "M5H 2M9", "2025-10-15"))
    rows.append(brandon("UBER TRIP",            42.50, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-10-15"))
    rows.append(brandon("RISTORANTE SOTTO",    310.75, 5812, "TORONTO", "CAN", "ON", "M5V 3C6", "2025-12-05"))
    rows.append(brandon("CANADIAN SALES SUMMIT", 1850.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2026-01-20"))
    rows.append(brandon("CHELSEA HOTEL",       425.00, 7011, "TORONTO", "CAN", "ON", "M5G 1Z8", "2026-01-20"))
    rows.append(brandon("NOTA BENE",           285.00, 5812, "TORONTO", "CAN", "ON", "M5V 1K4", "2026-02-12"))
    rows.append(brandon("UBER TRIP",            55.30, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-02-12"))
    rows.append(brandon("CACTUS CLUB CAFE",    195.00, 5812, "TORONTO", "CAN", "ON", "M5H 1T1", "2026-03-06"))

    # EDGE CASE: Alcohol without client — bar tab
    rows.append(brandon("THE LOOSE MOOSE TAP",  85.00, 5813, "TORONTO", "CAN", "ON", "M5H 1T1", "2025-11-08"))

    # ── Olivia Park ───────────────────────────────────────────────
    rows.append(olivia("JOEY RESTAURANTS",     180.50, 5812, "TORONTO", "CAN", "ON", "M5J 2G8", "2025-09-08"))
    rows.append(olivia("DELTA HOTELS",         310.00, 7011, "TORONTO", "CAN", "ON", "M5V 1K4", "2025-09-18"))
    rows.append(olivia("UBER TRIP",             28.75, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-09-18"))
    rows.append(olivia("ARDO RESTAURANT",      265.30, 5812, "TORONTO", "CAN", "ON", "M5V 3C6", "2025-11-06"))
    rows.append(olivia("CDN TECH CONFERENCE",  1250.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2025-11-12"))
    rows.append(olivia("STK TORONTO",          195.80, 5812, "TORONTO", "CAN", "ON", "M5V 1K4", "2025-12-03"))
    rows.append(olivia("UBER TRIP",             34.20, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-12-03"))

    # CRITICAL: San Diego conference trip cluster — Jan 15-18, 2026
    rows.append(olivia("HILTON SAN DIEGO",     389.00, 7011, "SAN DIEGO", "USA", "CA", "92101", "2026-01-15"))
    rows.append(olivia("HILTON SAN DIEGO",     389.00, 7011, "SAN DIEGO", "USA", "CA", "92101", "2026-01-16"))
    rows.append(olivia("HILTON SAN DIEGO",     389.00, 7011, "SAN DIEGO", "USA", "CA", "92101", "2026-01-17"))
    rows.append(olivia("SAAS CONNECT 2026",   1450.00, 8699, "SAN DIEGO", "USA", "CA", "92101", "2026-01-15"))
    rows.append(olivia("PUESTO RESTAURANT",     42.50, 5812, "SAN DIEGO", "USA", "CA", "92101", "2026-01-15"))
    rows.append(olivia("THE OCEANAIRE",         78.30, 5812, "SAN DIEGO", "USA", "CA", "92101", "2026-01-16"))
    rows.append(olivia("CAFE 21 GASLAMP",       35.00, 5814, "SAN DIEGO", "USA", "CA", "92101", "2026-01-16"))
    rows.append(olivia("SEARSUCKER SD",         56.80, 5812, "SAN DIEGO", "USA", "CA", "92101", "2026-01-17"))
    rows.append(olivia("UBER TRIP",             24.00, 4121, "SAN DIEGO", "USA", "CA", "92101", "2026-01-15"))
    rows.append(olivia("UBER TRIP",             31.00, 4121, "SAN DIEGO", "USA", "CA", "92101", "2026-01-17"))

    rows.append(olivia("MOXIES RESTAURANT",    215.40, 5812, "TORONTO", "CAN", "ON", "M5V 3C6", "2026-02-06"))
    rows.append(olivia("EXHIBITOR SOURCE",     799.50, 7311, "TORONTO", "CAN", "ON", "M5H 1T1", "2026-02-20"))

    # EDGE CASE: Split purchase fraud — 2 × $295 at Best Buy same day
    rows.append(olivia("BESTBUY.COM",          295.00, 5734, "TORONTO", "CAN", "ON", "M5V 3A5", "2026-02-10"))
    rows.append(olivia("BESTBUY.COM",          295.00, 5734, "TORONTO", "CAN", "ON", "M5V 3A5", "2026-02-10"))

    # ── Darius Monroe ─────────────────────────────────────────────
    rows.append(darius("CANOE RESTAURANT",     230.00, 5812, "TORONTO", "CAN", "ON", "M5J 2G8", "2025-09-15"))
    rows.append(darius("UBER TRIP",             35.50, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-09-15"))
    rows.append(darius("HILTON GARDEN INN",    340.00, 7011, "TORONTO", "CAN", "ON", "M5G 1Z8", "2025-10-22"))
    rows.append(darius("EARLS KITCHEN",        310.25, 5812, "TORONTO", "CAN", "ON", "M5V 1K4", "2025-11-10"))
    rows.append(darius("UBER TRIP",             48.75, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-11-10"))
    rows.append(darius("HARBOUR 60",           275.00, 5812, "TORONTO", "CAN", "ON", "M5J 2G8", "2026-01-08"))
    rows.append(darius("NOVOTEL TORONTO",      385.00, 7011, "TORONTO", "CAN", "ON", "M5V 2H1", "2026-01-14"))
    rows.append(darius("NOTA BENE",            190.50, 5812, "TORONTO", "CAN", "ON", "M5V 1K4", "2026-02-05"))
    rows.append(darius("B2B SALES SUMMIT",    1800.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2026-02-18"))
    rows.append(darius("MILESTONE'S GRILL",    255.30, 5812, "TORONTO", "CAN", "ON", "M5V 3C6", "2026-03-11"))

    # EDGE CASE: Personal expense — spa visit
    rows.append(darius("SERENITY SPA & WELLNESS", 180.00, 7297, "TORONTO", "CAN", "ON", "M5R 1B2", "2025-12-15"))

    # ── Fiona Walsh (EDGE CASE: budget overrun — $3,500 budget) ───
    # Target ~$4,100–$4,500/month to demonstrate consistent overrun
    # Sep (~$4,050)
    rows.append(fiona("SALES INNOVATION SUMMIT", 2200.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2025-09-22"))
    rows.append(fiona("HILTON GARDEN INN",      1145.00, 7011, "TORONTO", "CAN", "ON", "M5G 1Z8", "2025-09-22"))
    rows.append(fiona("BATON ROUGE",             355.00, 5812, "TORONTO", "CAN", "ON", "M5H 1T1", "2025-09-12"))
    rows.append(fiona("UBER TRIP",                42.30, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-09-12"))
    rows.append(fiona("UBER TRIP",                57.70, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-09-22"))
    # Oct (~$4,500)
    rows.append(fiona("SUPPLY CHAIN EXPO",      2800.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2025-10-15"))
    rows.append(fiona("DELTA HOTELS",            985.00, 7011, "TORONTO", "CAN", "ON", "M5V 1K4", "2025-10-15"))
    rows.append(fiona("EARLS KITCHEN BAR",       195.75, 5812, "TORONTO", "CAN", "ON", "M5V 1K4", "2025-10-05"))
    rows.append(fiona("JACK ASTORS",             310.00, 5812, "TORONTO", "CAN", "ON", "M5H 1T1", "2025-10-22"))
    rows.append(fiona("VISTAPRINT CANADA",       209.25, 7311, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-10-28"))
    # Nov (~$4,200)
    rows.append(fiona("SHOPIFY SUMMIT 2025",    1850.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2025-11-15"))
    rows.append(fiona("COURTYARD MARRIOTT",     1280.00, 7011, "TORONTO", "CAN", "ON", "M5H 2M9", "2025-11-12"))
    rows.append(fiona("LINKEDIN SALES NAV",      399.95, 5734, "SAN FRANCISCO", "USA", "CA", "94105", "2025-11-01"))
    rows.append(fiona("KINKA IZAKAYA",           315.20, 5812, "TORONTO", "CAN", "ON", "M5T 1R7", "2025-11-19"))
    rows.append(fiona("UBER TRIP",                62.50, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-11-12"))
    rows.append(fiona("UBER TRIP",                38.00, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-11-19"))
    # Dec (~$4,100)
    rows.append(fiona("BDC NETWORKING EVENT",   1250.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2025-12-08"))
    rows.append(fiona("FAIRMONT ROYAL YORK",    1350.00, 7011, "TORONTO", "CAN", "ON", "M5J 1E3", "2025-12-10"))
    rows.append(fiona("CLIENT HOLIDAY GIFTS",    985.50, 5947, "TORONTO", "CAN", "ON", "M5H 1T1", "2025-12-05"))
    rows.append(fiona("HARBOUR 60",              445.00, 5812, "TORONTO", "CAN", "ON", "M5J 2G8", "2025-12-15"))
    rows.append(fiona("UBER TRIP",                48.75, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-12-10"))
    # Jan (~$4,400)
    rows.append(fiona("SALES KICKOFF 2026",     2350.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2026-01-14"))
    rows.append(fiona("WESTIN HARBOUR CASTLE",  1190.00, 7011, "TORONTO", "CAN", "ON", "M5J 1B8", "2026-01-14"))
    rows.append(fiona("CANOE RESTAURANT",        385.00, 5812, "TORONTO", "CAN", "ON", "M5J 2G8", "2026-01-08"))
    rows.append(fiona("UBER TRIP",                55.30, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-01-14"))
    rows.append(fiona("UBER TRIP",                31.50, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-01-08"))
    # Feb (~$4,600)
    rows.append(fiona("TECH SALES SUMMIT",      1950.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2026-02-18"))
    rows.append(fiona("MARRIOTT EATON CTR",     1450.00, 7011, "TORONTO", "CAN", "ON", "M5G 1Z8", "2026-02-17"))
    rows.append(fiona("STK TORONTO",             520.00, 5812, "TORONTO", "CAN", "ON", "M5V 1K4", "2026-02-18"))
    rows.append(fiona("LINKEDIN SALES NAV",      399.95, 5734, "SAN FRANCISCO", "USA", "CA", "94105", "2026-02-01"))
    rows.append(fiona("UBER TRIP",                67.80, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-02-17"))
    rows.append(fiona("UBER TRIP",                44.25, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-02-18"))
    # Mar (~$4,050)
    rows.append(fiona("SAAS NORTH 2026",        2750.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2026-03-12"))
    rows.append(fiona("DELTA HOTELS",            875.00, 7011, "TORONTO", "CAN", "ON", "M5V 1K4", "2026-03-12"))
    rows.append(fiona("ARDO RESTAURANT",         295.00, 5812, "TORONTO", "CAN", "ON", "M5V 3C6", "2026-03-05"))
    rows.append(fiona("UBER TRIP",                52.40, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-03-12"))
    rows.append(fiona("UBER TRIP",                39.60, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-03-05"))

    # ── Marco Esposito ────────────────────────────────────────────
    rows.append(marco("SCARAMOUCHE",           285.00, 5812, "TORONTO", "CAN", "ON", "M5R 1B2", "2025-09-25"))
    rows.append(marco("HYATT REGENCY",         410.00, 7011, "TORONTO", "CAN", "ON", "M5G 1Z8", "2025-10-16"))
    rows.append(marco("UBER TRIP",              38.90, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-10-16"))
    rows.append(marco("LEE RESTAURANT",        195.50, 5812, "TORONTO", "CAN", "ON", "M5V 1K4", "2025-11-20"))
    rows.append(marco("TECH CRUNCH DISRUPT",  2150.00, 8699, "SAN FRANCISCO", "USA", "CA", "94105", "2025-12-08"))
    rows.append(marco("PAI NORTHERN THAI",     165.30, 5812, "TORONTO", "CAN", "ON", "M5T 1R7", "2026-02-03"))
    rows.append(marco("COURTYARD MARRIOTT",    375.00, 7011, "TORONTO", "CAN", "ON", "M5H 2M9", "2026-03-18"))
    rows.append(marco("UBER TRIP",              29.50, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-03-18"))

    # EDGE CASE: Excessive tip — $100 dinner + separate $35 at same merchant same day
    rows.append(marco("CANOE RESTAURANT",      100.00, 5812, "TORONTO", "CAN", "ON", "M5J 2G8", "2026-01-22"))
    rows.append(marco("CANOE RESTAURANT",       35.00, 5812, "TORONTO", "CAN", "ON", "M5J 2G8", "2026-01-22"))

    # ═══════════════════════════════════════════════════════════════════
    #  MAINTENANCE DEPARTMENT  (~45 txns)
    # ═══════════════════════════════════════════════════════════════════
    darrell  = _maint("E023", "Darrell King", "Fleet Mechanic")
    heidi    = _maint("E024", "Heidi Larsen", "Fleet Mechanic")
    tobias   = _maint("E025", "Tobias Grant", "Senior Mechanic")
    mia_k    = _maint("E026", "Mia Kovacs", "Fleet Mechanic")
    ray      = _maint("E027", "Ray Nakamura", "Fleet Mechanic")
    sandra   = _maint("E028", "Sandra Liu", "Parts Manager")
    felix    = _maint("E029", "Felix Adeyemi", "Fleet Mechanic")
    courtney = _maint("E030", "Courtney Marsh", "Fleet Mechanic")

    # Darrell King
    rows.append(darrell("NAPA AUTO PARTS",         247.53, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-09-08"))
    rows.append(darrell("CANADIAN TIRE #0437",     189.99, 5251, "TORONTO", "CAN", "ON", "M5V 3A5", "2025-10-12"))
    rows.append(darrell("PRINCESS AUTO",           425.00, 5251, "TORONTO", "CAN", "ON", "L4W 5K6", "2025-12-03"))
    rows.append(darrell("MARKS WORK WEARHOUSE",    89.95, 5699, "TORONTO", "CAN", "ON", "M5H 1T1", "2026-01-18"))
    rows.append(darrell("NAPA AUTO PARTS",         312.40, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2026-02-22"))
    rows.append(darrell("FASTENAL COMPANY",        178.50, 5085, "MISSISSAUGA", "CAN", "ON", "L5B 2C9", "2026-03-10"))

    # Heidi Larsen
    rows.append(heidi("LORDCO AUTO PARTS",        345.75, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-09-22"))
    rows.append(heidi("SNAP-ON TOOLS",            895.00, 5251, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-11-05"))
    rows.append(heidi("UAP INC NAPA",             156.80, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-12-18"))
    rows.append(heidi("MARKS WORK WEARHOUSE",    112.50, 5699, "TORONTO", "CAN", "ON", "M5H 1T1", "2026-01-10"))
    rows.append(heidi("LORDCO AUTO PARTS",        278.90, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2026-02-15"))
    rows.append(heidi("HOME DEPOT #7042",         445.25, 5251, "TORONTO", "CAN", "ON", "M5V 3A5", "2026-03-08"))

    # Tobias Grant (Senior — higher-value purchases)
    rows.append(tobias("MATCO TOOLS",            1850.00, 5251, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-09-15"))
    rows.append(tobias("GRAINGER CANADA",         487.30, 5085, "MISSISSAUGA", "CAN", "ON", "L5B 2C9", "2025-10-08"))
    rows.append(tobias("NAPA AUTO PARTS",         398.45, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-11-20"))
    rows.append(tobias("LINCOLN ELECTRIC",        625.00, 5085, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-12-10"))
    rows.append(tobias("SNAP-ON TOOLS",          1245.00, 5251, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-01-22"))
    rows.append(tobias("UAP INC NAPA",            267.80, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2026-03-05"))

    # Mia Kovacs
    rows.append(mia_k("CANADIAN TIRE #0437",      78.45, 5251, "TORONTO", "CAN", "ON", "M5V 3A5", "2025-10-02"))
    rows.append(mia_k("NAPA AUTO PARTS",         215.60, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-11-14"))
    rows.append(mia_k("SAFETYLINE INC",          145.00, 5699, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-12-22"))
    rows.append(mia_k("LORDCO AUTO PARTS",       189.30, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2026-01-28"))
    rows.append(mia_k("HOME DEPOT #7042",        312.75, 5251, "TORONTO", "CAN", "ON", "M5V 3A5", "2026-02-18"))

    # Ray Nakamura
    rows.append(ray("GRAINGER CANADA",           356.90, 5085, "MISSISSAUGA", "CAN", "ON", "L5B 2C9", "2025-09-25"))
    rows.append(ray("UAP INC NAPA",              423.15, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-10-30"))
    rows.append(ray("PRINCESS AUTO",             567.00, 5251, "TORONTO", "CAN", "ON", "L4W 5K6", "2025-12-15"))
    rows.append(ray("NAPA AUTO PARTS",           198.70, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2026-02-05"))
    rows.append(ray("FASTENAL COMPANY",          289.40, 5085, "MISSISSAUGA", "CAN", "ON", "L5B 2C9", "2026-03-18"))
    rows.append(ray("MARKS WORK WEARHOUSE",      95.50, 5699, "TORONTO", "CAN", "ON", "M5H 1T1", "2026-03-20"))

    # Sandra Liu (Parts Manager — larger bulk orders)
    rows.append(sandra("NAPA AUTO PARTS",        1245.80, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-09-05"))
    rows.append(sandra("LORDCO AUTO PARTS",       867.50, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-10-18"))
    rows.append(sandra("GRAINGER CANADA",         534.20, 5085, "MISSISSAUGA", "CAN", "ON", "L5B 2C9", "2025-11-28"))
    rows.append(sandra("UAP INC NAPA",            978.35, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-12-20"))
    rows.append(sandra("SNAP-ON TOOLS",          1950.00, 5251, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-01-15"))
    rows.append(sandra("NAPA AUTO PARTS",        1123.45, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2026-02-25"))
    rows.append(sandra("LORDCO AUTO PARTS",       745.60, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2026-03-22"))

    # Felix Adeyemi
    rows.append(felix("CANADIAN TIRE #0437",     134.99, 5251, "TORONTO", "CAN", "ON", "M5V 3A5", "2025-10-08"))
    rows.append(felix("NAPA AUTO PARTS",         267.45, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-11-22"))
    rows.append(felix("MARKS WORK WEARHOUSE",    78.50, 5699, "TORONTO", "CAN", "ON", "M5H 1T1", "2025-12-30"))
    rows.append(felix("LORDCO AUTO PARTS",       345.20, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2026-01-25"))
    rows.append(felix("HOME DEPOT #7042",        189.99, 5251, "TORONTO", "CAN", "ON", "M5V 3A5", "2026-03-02"))

    # Courtney Marsh
    rows.append(courtney("UAP INC NAPA",         198.75, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2025-09-30"))
    rows.append(courtney("PRINCESS AUTO",        312.50, 5251, "TORONTO", "CAN", "ON", "L4W 5K6", "2025-11-08"))
    rows.append(courtney("NAPA AUTO PARTS",      156.30, 5533, "TORONTO", "CAN", "ON", "M1P 4P5", "2026-01-05"))
    rows.append(courtney("SAFETYLINE INC",        89.95, 5699, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-02-10"))
    rows.append(courtney("CANADIAN TIRE #0437",  245.80, 5251, "TORONTO", "CAN", "ON", "M5V 3A5", "2026-03-15"))

    # ═══════════════════════════════════════════════════════════════════
    #  MANAGEMENT  (~35 txns)
    # ═══════════════════════════════════════════════════════════════════
    sarah    = _mgmt("E036", "Sarah Whitfield", "CEO")
    james    = _mgmt("E037", "James Okonkwo", "COO")
    patricia = _mgmt("E038", "Patricia Hunt", "VP Operations")
    derek    = _mgmt("E039", "Derek Soriano", "Regional Manager")
    michelle = _mgmt("E040", "Michelle Caron", "HR Manager")

    # Sarah Whitfield — CEO
    rows.append(sarah("FOUR SEASONS TORONTO",    2850.00, 7011, "TORONTO", "CAN", "ON", "M5R 1E6", "2025-09-15"))
    rows.append(sarah("ALOBAR YORKVILLE",         485.00, 5812, "TORONTO", "CAN", "ON", "M5R 1B2", "2025-09-15"))
    rows.append(sarah("IVEY BUSINESS SCHOOL",    1500.00, 8299, "LONDON",  "CAN", "ON", "N6G 0N1", "2025-10-20"))
    rows.append(sarah("INTERCONTINENTAL HOTEL",   890.00, 7011, "MONTREAL","CAN", "QC", "H3B 4W3", "2025-11-18"))
    rows.append(sarah("TOQUE RESTAURANT",         395.50, 5812, "MONTREAL","CAN", "QC", "H2Y 1C6", "2025-11-18"))
    rows.append(sarah("AIR CANADA",               675.40, 4511, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-11-17"))
    rows.append(sarah("TEAM OFFSITE RETREAT",    3500.00, 7011, "COLLINGWOOD", "CAN", "ON", "L9Y 3Z1", "2026-01-10"))
    rows.append(sarah("AVIS CAR RENTAL",          245.80, 7512, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-01-10"))
    rows.append(sarah("MIKU RESTAURANT",          520.00, 5812, "TORONTO", "CAN", "ON", "M5J 2G8", "2026-02-20"))
    rows.append(sarah("ROTMAN EXEC ED",          1250.00, 8299, "TORONTO", "CAN", "ON", "M5S 3E6", "2026-03-08"))

    # James Okonkwo — COO
    rows.append(james("SHANGRI-LA HOTEL",        1650.00, 7011, "TORONTO", "CAN", "ON", "M5J 2G8", "2025-09-22"))
    rows.append(james("GEORGE RESTAURANT",        345.00, 5812, "TORONTO", "CAN", "ON", "M5H 1T1", "2025-09-22"))
    rows.append(james("SCHULICH EXEC ED",        1200.00, 8299, "TORONTO", "CAN", "ON", "M3J 1P3", "2025-10-15"))
    rows.append(james("HERTZ RENT A CAR",         189.50, 7512, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-11-05"))
    rows.append(james("FAIRMONT WINNIPEG",       1280.00, 7011, "WINNIPEG","CAN", "MB", "R3C 0A8", "2025-12-10"))
    rows.append(james("UBER TRIP",                 65.30, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-12-10"))
    rows.append(james("OPERATIONS SUMMIT 2026",  2200.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2026-01-25"))
    rows.append(james("BYBLOS RESTAURANT",        410.00, 5812, "TORONTO", "CAN", "ON", "M5V 1K4", "2026-02-14"))
    rows.append(james("NATIONAL CAR RENTAL",      278.90, 7512, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-03-05"))

    # Patricia Hunt — VP Operations
    rows.append(patricia("CHELSEA HOTEL",        1180.00, 7011, "TORONTO", "CAN", "ON", "M5G 1Z8", "2025-10-08"))
    rows.append(patricia("SCARAMOUCHE",           380.00, 5812, "TORONTO", "CAN", "ON", "M5R 1B2", "2025-10-08"))
    rows.append(patricia("QUEENS UNIV EXEC ED",  1350.00, 8299, "KINGSTON","CAN", "ON", "K7L 3N6", "2025-11-20"))
    rows.append(patricia("UBER TRIP",              48.60, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-11-20"))
    rows.append(patricia("WESTIN HARBOUR CASTLE", 950.00, 7011, "TORONTO", "CAN", "ON", "M5J 1B8", "2026-01-15"))
    rows.append(patricia("ALOBAR YORKVILLE",      315.00, 5812, "TORONTO", "CAN", "ON", "M5R 1B2", "2026-01-15"))
    rows.append(patricia("AVIS CAR RENTAL",       198.40, 7512, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-02-05"))
    rows.append(patricia("CANOE RESTAURANT",      445.00, 5812, "TORONTO", "CAN", "ON", "M5J 2G8", "2026-03-12"))

    # EDGE CASE: Luxury merchant — Valentine's Day
    rows.append(patricia("HOLT RENFREW",          420.00, 5944, "TORONTO", "CAN", "ON", "M5R 1B2", "2026-02-14"))

    # Derek Soriano — Regional Manager
    rows.append(derek("HOLIDAY INN EXPRESS",      345.00, 7011, "LONDON",  "CAN", "ON", "N6A 5B9", "2025-09-18"))
    rows.append(derek("JACK ASTORS",              185.50, 5812, "LONDON",  "CAN", "ON", "N6A 5B9", "2025-09-18"))
    rows.append(derek("ENTERPRISE RENT",          210.80, 7512, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-10-25"))
    rows.append(derek("BEST WESTERN PLUS",        295.00, 7011, "KITCHENER","CAN","ON", "N2G 4W1", "2025-11-12"))
    rows.append(derek("CACTUS CLUB CAFE",         175.25, 5812, "KITCHENER","CAN","ON", "N2G 4W1", "2025-11-12"))
    rows.append(derek("HILTON GARDEN INN",        320.00, 7011, "HAMILTON", "CAN", "ON", "L8P 4S9", "2026-01-22"))
    rows.append(derek("MILESTONE'S GRILL",        210.40, 5812, "HAMILTON", "CAN", "ON", "L8P 4S9", "2026-01-22"))
    rows.append(derek("ENTERPRISE RENT",          195.60, 7512, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-02-28"))
    rows.append(derek("COURTYARD MARRIOTT",       385.00, 7011, "WINDSOR", "CAN", "ON", "N9A 6T3", "2026-03-10"))
    rows.append(derek("CHEZ NOUS BISTRO",         165.75, 5812, "WINDSOR", "CAN", "ON", "N9A 6T3", "2026-03-10"))

    # Michelle Caron — HR Manager
    rows.append(michelle("SHRM MEMBERSHIP",       350.00, 8699, "ALEXANDRIA", "USA", "VA", "22314", "2025-09-01"))
    rows.append(michelle("INDIGO BOOKS",            89.95, 5942, "TORONTO", "CAN", "ON", "M5H 1T1", "2025-10-15"))
    rows.append(michelle("HR TECH CONFERENCE",     985.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2025-11-08"))
    rows.append(michelle("UBER TRIP",               32.40, 4121, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-11-08"))
    rows.append(michelle("LINKEDIN LEARNING",      299.88, 5734, "SAN FRANCISCO", "USA", "CA", "94105", "2026-01-05"))
    rows.append(michelle("TEAM BUILDING EVENT",    450.00, 7941, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-02-22"))
    rows.append(michelle("STAPLES BUSINESS DEPOT", 167.45, 5943, "TORONTO", "CAN", "ON", "M5V 3A5", "2026-03-15"))

    # ═══════════════════════════════════════════════════════════════════
    #  COMPLIANCE  (~18 txns)
    # ═══════════════════════════════════════════════════════════════════
    russell = _comp("E049", "Russell Townsend", "Safety Manager")
    yvonne  = _comp("E050", "Yvonne Castillo", "Compliance Officer")

    # Russell Townsend
    rows.append(russell("CSA GROUP TRAINING",     1200.00, 8299, "TORONTO", "CAN", "ON", "M5V 2H1", "2025-09-12"))
    rows.append(russell("SAFETYLINE INC",          325.00, 5699, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-10-05"))
    rows.append(russell("OHSA CERTIFICATION",      750.00, 8299, "TORONTO", "CAN", "ON", "M7A 1Y5", "2025-11-15"))
    rows.append(russell("MARKS WORK WEARHOUSE",   185.50, 5699, "TORONTO", "CAN", "ON", "M5H 1T1", "2025-12-08"))
    rows.append(russell("TRUCKING SAFETY COUNCIL", 400.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2026-01-10"))
    rows.append(russell("AUDIT SOLUTIONS INC",   2500.00, 7392, "TORONTO", "CAN", "ON", "M5H 1T1", "2026-02-15"))
    rows.append(russell("SAFETY FIRST SUPPLY",    278.90, 5699, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-02-28"))
    rows.append(russell("CSA GROUP TRAINING",      890.00, 8299, "TORONTO", "CAN", "ON", "M5V 2H1", "2026-03-20"))
    rows.append(russell("STAPLES BUSINESS DEPOT",  124.35, 5943, "TORONTO", "CAN", "ON", "M5V 3A5", "2026-03-25"))

    # Yvonne Castillo
    rows.append(yvonne("COMPLIANCE WEEK CONF",    850.00, 8699, "TORONTO", "CAN", "ON", "M5V 2H1", "2025-09-20"))
    rows.append(yvonne("SAFETY FIRST SUPPLY",     210.45, 5699, "TORONTO", "CAN", "ON", "M5V 2T3", "2025-10-18"))
    rows.append(yvonne("CCOHS TRAINING",          975.00, 8299, "HAMILTON","CAN", "ON", "L8P 4S9", "2025-11-22"))
    rows.append(yvonne("OHSA CERTIFICATION",      680.00, 8299, "TORONTO", "CAN", "ON", "M7A 1Y5", "2026-01-08"))
    rows.append(yvonne("SAFETYLINE INC",           445.00, 5699, "TORONTO", "CAN", "ON", "M5V 2T3", "2026-01-25"))
    rows.append(yvonne("CTA INDUSTRY ASSOC",      400.00, 8699, "OTTAWA",  "CAN", "ON", "K1P 5G4", "2026-02-10"))
    rows.append(yvonne("MARKS WORK WEARHOUSE",    142.75, 5699, "TORONTO", "CAN", "ON", "M5H 1T1", "2026-03-05"))
    rows.append(yvonne("STAPLES BUSINESS DEPOT",   98.50, 5943, "TORONTO", "CAN", "ON", "M5V 3A5", "2026-03-18"))

    # ═══════════════════════════════════════════════════════════════════
    #  EDGE CASE: Duplicate charge — Finance (Trevor Mills E033)
    # ═══════════════════════════════════════════════════════════════════
    trevor = _fin("E033", "Trevor Mills", "Accountant")
    rows.append(trevor("STAPLES BUSINESS DEPOT", 245.00, 5943, "TORONTO", "CAN", "ON", "M5V 3A5", "2026-01-10"))
    rows.append(trevor("STAPLES BUSINESS DEPOT", 245.00, 5943, "TORONTO", "CAN", "ON", "M5V 3A5", "2026-01-12"))

    return rows


INSERT_SQL = """
INSERT INTO transactions (
    transaction_code, transaction_description, transaction_category,
    posting_date_of_transaction, transaction_date,
    merchant_info_dba_name, transaction_amount, debit_or_credit,
    merchant_category_code, merchant_city, merchant_country,
    merchant_postal_code, merchant_state_province,
    conversion_rate, employee_id, employee_name,
    department, role, amount_cad, is_operational
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""


def main():
    rows = build_transactions()

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute(
        "DELETE FROM transactions WHERE transaction_description = ?",
        (MARKER,),
    )
    deleted = cur.rowcount

    cur.executemany(INSERT_SQL, rows)
    conn.commit()

    # ── Summary ───────────────────────────────────────────────────
    print(f"Deleted {deleted} previous synthetic rows")
    print(f"Inserted {len(rows)} synthetic transactions\n")

    dept_counts = defaultdict(int)
    emp_counts = defaultdict(int)
    emp_spend = defaultdict(float)
    for r in rows:
        dept = r[16]  # department
        eid = r[14]   # employee_id
        name = r[15]  # employee_name
        cad = r[18]   # amount_cad
        dept_counts[dept] += 1
        emp_counts[f"{eid} {name}"] += 1
        emp_spend[f"{eid} {name}"] += cad

    print("By department:")
    for dept in sorted(dept_counts):
        print(f"  {dept}: {dept_counts[dept]}")

    print("\nBy employee:")
    for emp in sorted(emp_counts):
        print(f"  {emp}: {emp_counts[emp]} txns, ${emp_spend[emp]:,.2f} total")

    # Fiona Walsh monthly breakdown
    fiona_monthly = defaultdict(float)
    for r in rows:
        if r[14] == "E044":
            month = r[4][:7]  # YYYY-MM from transaction_date
            fiona_monthly[month] += r[18]
    if fiona_monthly:
        print("\nFiona Walsh (E044) monthly spend vs $3,500 budget:")
        for month in sorted(fiona_monthly):
            amt = fiona_monthly[month]
            flag = " << OVER BUDGET" if amt > 3500 else ""
            print(f"  {month}: ${amt:,.2f}{flag}")

    conn.close()


if __name__ == "__main__":
    main()
