"""
Synthetic employee generator for Brim challenge.
Maps real transaction codes to synthetic employees using geographic/temporal clustering.
Card 3001 is a shared fleet card — transactions are split among ~18 drivers
by clustering on (date + state) proximity. Same driver won't appear in AB and IL same day.
"""
import pandas as pd
import numpy as np
from datetime import datetime
import json
import sqlite3
import os

# ─── 50 synthetic employees ────────────────────────────────────────────────
EMPLOYEES = [
    # id, name, department, role, card_code, hire_date, monthly_budget
    # Drivers (card 3001 shared)
    {"id": "E001", "name": "Marcus Rivera",    "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2021-03-15", "budget": 8000},
    {"id": "E002", "name": "Tyler Kowalski",   "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2020-07-01", "budget": 8000},
    {"id": "E003", "name": "Devon Okafor",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2022-01-10", "budget": 8000},
    {"id": "E004", "name": "Jasmine Tran",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2019-11-05", "budget": 8000},
    {"id": "E005", "name": "Brett Holloway",   "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2023-02-20", "budget": 7500},
    {"id": "E006", "name": "Kenji Watanabe",   "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2021-09-14", "budget": 8000},
    {"id": "E007", "name": "Sofia Mendes",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2020-04-22", "budget": 7500},
    {"id": "E008", "name": "Curtis Webb",      "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2018-06-30", "budget": 8500},
    {"id": "E009", "name": "Priya Sharma",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2022-08-01", "budget": 7500},
    {"id": "E010", "name": "Nate Bergmann",    "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2019-03-18", "budget": 8000},
    {"id": "E011", "name": "Amara Diallo",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2023-05-09", "budget": 7000},
    {"id": "E012", "name": "Jake Sorensen",    "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2021-12-01", "budget": 8000},
    {"id": "E013", "name": "Lena Fischer",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2020-10-17", "budget": 7500},
    {"id": "E014", "name": "Carlos Reyes",     "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2022-06-25", "budget": 8000},
    {"id": "E015", "name": "Patrick Nguyen",   "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2017-09-12", "budget": 9000},
    {"id": "E016", "name": "Dana Korhonen",    "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2021-07-04", "budget": 7500},
    {"id": "E017", "name": "Omar Hassan",      "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2023-01-16", "budget": 7000},
    {"id": "E018", "name": "Brooke Tanaka",    "dept": "Operations", "role": "Long-Haul Driver",     "card": 3001, "hired": "2019-08-28", "budget": 8000},
    # Dispatchers
    {"id": "E019", "name": "Rosenberg T.",     "dept": "Operations", "role": "Fleet Dispatcher",    "card": 3005, "hired": "2016-04-01", "budget": 3000},
    {"id": "E020", "name": "Sheldon Park",     "dept": "Operations", "role": "Fleet Dispatcher",    "card": 3005, "hired": "2018-11-20", "budget": 3000},
    {"id": "E021", "name": "Grace O'Neill",    "dept": "Operations", "role": "Dispatcher",           "card": 3001, "hired": "2022-03-07", "budget": 2500},
    {"id": "E022", "name": "Ivan Petrov",      "dept": "Operations", "role": "Dispatcher",           "card": 3001, "hired": "2023-09-15", "budget": 2500},
    # Maintenance
    {"id": "E023", "name": "Darrell King",     "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2015-02-14", "budget": 5000},
    {"id": "E024", "name": "Heidi Larsen",     "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2020-09-03", "budget": 4500},
    {"id": "E025", "name": "Tobias Grant",     "dept": "Maintenance","role": "Senior Mechanic",      "card": 3001, "hired": "2017-06-19", "budget": 6000},
    {"id": "E026", "name": "Mia Kovacs",       "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2021-04-12", "budget": 4500},
    {"id": "E027", "name": "Ray Nakamura",     "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2019-07-22", "budget": 5000},
    {"id": "E028", "name": "Sandra Liu",       "dept": "Maintenance","role": "Parts Manager",        "card": 3001, "hired": "2018-03-31", "budget": 7000},
    {"id": "E029", "name": "Felix Adeyemi",    "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2023-08-01", "budget": 4000},
    {"id": "E030", "name": "Courtney Marsh",   "dept": "Maintenance","role": "Fleet Mechanic",       "card": 3001, "hired": "2022-11-10", "budget": 4000},
    # Finance / Admin
    {"id": "E031", "name": "Victor Chen",      "dept": "Finance",    "role": "CFO",                  "card": 3006, "hired": "2014-01-07", "budget": 5000},
    {"id": "E032", "name": "Nadia Osei",       "dept": "Finance",    "role": "Finance Manager",      "card": 3006, "hired": "2018-05-14", "budget": 3000},
    {"id": "E033", "name": "Trevor Mills",     "dept": "Finance",    "role": "Accountant",           "card": 3006, "hired": "2020-02-24", "budget": 2000},
    {"id": "E034", "name": "Hannah West",      "dept": "Finance",    "role": "Accounts Payable",     "card": 3006, "hired": "2021-10-18", "budget": 1500},
    {"id": "E035", "name": "Alan Blackwood",   "dept": "Finance",    "role": "Payroll Specialist",   "card": 3006, "hired": "2019-06-03", "budget": 1500},
    # Management
    {"id": "E036", "name": "Sarah Whitfield",  "dept": "Management", "role": "CEO",                  "card": 3035, "hired": "2012-09-01", "budget": 10000},
    {"id": "E037", "name": "James Okonkwo",    "dept": "Management", "role": "COO",                  "card": 3001, "hired": "2015-03-15", "budget": 8000},
    {"id": "E038", "name": "Patricia Hunt",    "dept": "Management", "role": "VP Operations",        "card": 3001, "hired": "2017-08-07", "budget": 7000},
    {"id": "E039", "name": "Derek Soriano",    "dept": "Management", "role": "Regional Manager",     "card": 3001, "hired": "2019-01-22", "budget": 5000},
    {"id": "E040", "name": "Michelle Caron",   "dept": "Management", "role": "HR Manager",           "card": 3006, "hired": "2018-07-11", "budget": 3000},
    # Sales
    {"id": "E041", "name": "Brandon Leitch",   "dept": "Sales",      "role": "Sales Manager",        "card": 3001, "hired": "2019-04-29", "budget": 5000},
    {"id": "E042", "name": "Olivia Park",      "dept": "Sales",      "role": "Account Executive",    "card": 3001, "hired": "2021-11-01", "budget": 4000},
    {"id": "E043", "name": "Darius Monroe",    "dept": "Sales",      "role": "Account Executive",    "card": 3001, "hired": "2022-09-12", "budget": 4000},
    {"id": "E044", "name": "Fiona Walsh",      "dept": "Sales",      "role": "Business Dev Rep",     "card": 3001, "hired": "2023-03-20", "budget": 3500},
    {"id": "E045", "name": "Marco Esposito",   "dept": "Sales",      "role": "Account Executive",    "card": 3001, "hired": "2020-06-08", "budget": 4000},
    # IT
    {"id": "E046", "name": "Kim Nakagawa",     "dept": "IT",         "role": "IT Manager",           "card": 3001, "hired": "2018-02-19", "budget": 4000},
    {"id": "E047", "name": "Leo Baptiste",     "dept": "IT",         "role": "Systems Admin",        "card": 3001, "hired": "2022-07-04", "budget": 3000},
    {"id": "E048", "name": "Chloe Dubois",     "dept": "IT",         "role": "IT Support",           "card": 3001, "hired": "2023-06-01", "budget": 2500},
    # Safety / Compliance
    {"id": "E049", "name": "Russell Townsend", "dept": "Compliance","role": "Safety Manager",        "card": 3001, "hired": "2016-10-14", "budget": 3000},
    {"id": "E050", "name": "Yvonne Castillo",  "dept": "Compliance","role": "Compliance Officer",    "card": 3001, "hired": "2020-12-01", "budget": 2500},
]

print(f"Generated {len(EMPLOYEES)} employees")
print("Departments:", pd.DataFrame(EMPLOYEES)['dept'].value_counts().to_dict())
