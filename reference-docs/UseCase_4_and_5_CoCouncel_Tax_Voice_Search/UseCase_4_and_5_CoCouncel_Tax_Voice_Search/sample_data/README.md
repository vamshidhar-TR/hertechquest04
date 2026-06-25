# Sample data — Use Case 5 (Return-to-Return Variance Alerts)

**⚠️ This is SYNTHETIC / FICTIONAL data.** Not real taxpayer data. Names, SSNs, and
figures are invented for demo and testing only — do not present it as real.

## What's here

**5 fictional clients, 11 return files** — each file is one client's return for one
tax year. Two files per client = "last year + this year" (mirrors the workflow's
"load both returns" step). One client has three years for multi-year testing.

| Client | Files | Scenario | What it exercises |
|---|---|---|---|
| **Johnson** (MFJ) | `johnson_2024/2025.json` | Charitable drop + dropped schedules | Big % variance + **missing forms** (Schedule B, Form 8283) |
| **Nguyen** (Single, Sch C) | `nguyen_2024/2025.json` | Business income spike | Large **upward** swings + missing Form 8829 |
| **Patel** (MFJ, rental) | `patel_2024/2025.json` | One rental property sold | **Within-form** line drop (Schedule E stays, a line goes to 0) |
| **Garcia** (Single) | `garcia_2024/2025.json` | Normal year | **CONTROL — should raise ZERO alerts** (false-positive check) |
| **Thompson** (Single) | `thompson_2023/2024/2025.json` | Phased retirement | **Multi-year** (2 consecutive comparisons), new income lines appearing |

Plus `variance_check.py` — a reference comparison that **auto-discovers** every
return file, groups by client, sorts by year, and compares each consecutive pair.

Each current-year file lists its planted anomalies in its `_meta` block.

### Inside each file

Every return is a full record, not just a few numbers:

- `client` — name, id, filing status, preparer
- `demographics` — ages, dependents, state, occupation(s)
- `tax_year`, `form`, `forms_present` (the list used for missing-form detection)
- `line_items` — ~25–35 lines: full income breakdown (wages, interest, dividends,
  capital gains, pension, Social Security, Schedule C/E), adjustments, itemized vs.
  standard deduction detail, QBI, tax, credits, payments, and refund/balance due.

The comparison only needs `line_items`, `forms_present`, `tax_year`, and
`client.client_id`; the rest is realistic context for your UI/demo.

## Anomaly types covered

- **Big downward variance** (Johnson charitable −90%)
- **Big upward variance** (Nguyen receipts +247%)
- **Line goes to zero** while its form stays (Patel rental property B)
- **Missing form** that existed last year (Johnson Schedule B / 8283, Nguyen 8829)
- **New income line** appearing (Thompson pension, then Social Security)
- **No anomaly at all** (Garcia — to confirm you don't over-alert)

## Run it

```bash
cd hackathon-kit/starter
python sample_data/variance_check.py
```

Expected: alerts for Johnson, Nguyen, Patel, and Thompson; **none for Garcia**.

## Add more data

Drop in another `*.json` file with the same shape (`client.client_id`, `tax_year`,
`forms_present`, `line_items`). The script picks it up automatically — no code
changes. Same `client_id` across files = same client; years are sorted and
compared in sequence.

## Notes

- The **20% threshold is a tunable demo choice**, not an industry standard. The IRS
  audit manual (IRM 4.10.4) references ~5%; commercial tools leave the call to the preparer.
- Want more realistic single-year fact patterns to base new clients on? See IRS
  **Pub 4491-W** (VITA/TCE Problems and Exercises) and **Form 6744** — fictional
  taxpayers with full schedules. You'd still derive a second year + plant a variance
  yourself (which these files already do for you).
- The comparison is **just math — it does NOT come from CoCounsel.** CoCounsel is the
  optional follow-up "brain" you ask *after* an alert for the tax rule + citation.
