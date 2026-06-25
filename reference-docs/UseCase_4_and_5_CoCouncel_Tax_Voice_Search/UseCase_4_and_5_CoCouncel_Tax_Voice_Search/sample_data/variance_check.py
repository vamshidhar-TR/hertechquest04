"""Reference variance check for Use Case 5 — Return-to-Return Variance Alerts.

Auto-discovers every return file in this folder, groups them by client, sorts
each client's returns by tax year, and compares each consecutive pair. For each
pair it flags:
  1. any line item whose absolute % change exceeds the threshold, and
  2. any form filed last year but missing this year.

This is the "just math" comparison step — it does NOT call CoCounsel.
Add more clients/years by dropping in more JSON files; no code changes needed.
Run:  python sample_data/variance_check.py

The 20% threshold is a TUNABLE DEMO CHOICE, not an industry standard. The IRS
audit manual (IRM 4.10.4) references ~5%; commercial tools leave it to the preparer.
"""

from __future__ import annotations

import glob
import json
import os
from collections import defaultdict

THRESHOLD_PCT = 20  # tunable demo choice — see module docstring


def load_all() -> list[dict]:
    here = os.path.dirname(os.path.abspath(__file__))
    returns = []
    for path in sorted(glob.glob(os.path.join(here, "*.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if "client" in data and "line_items" in data:  # skip non-return JSON
            data["_file"] = os.path.basename(path)
            returns.append(data)
    return returns


def group_by_client(returns: list[dict]) -> dict[str, list[dict]]:
    by_client: dict[str, list[dict]] = defaultdict(list)
    for r in returns:
        by_client[r["client"]["client_id"]].append(r)
    for items in by_client.values():
        items.sort(key=lambda r: r["tax_year"])
    return by_client


def pct_change(prior: float, current: float) -> float | None:
    """Percent change from prior to current. None if prior is 0 (can't divide)."""
    if prior == 0:
        return None
    return round((current - prior) / abs(prior) * 100, 1)


def compare(prior: dict, current: dict) -> list[str]:
    alerts: list[str] = []
    for line, prior_val in prior["line_items"].items():
        cur_val = current["line_items"].get(line)
        if cur_val is None:
            continue
        change = pct_change(prior_val, cur_val)
        if change is not None and abs(change) >= THRESHOLD_PCT:
            alerts.append(
                f"[VARIANCE] {line}: {prior_val:,} -> {cur_val:,} "
                f"({change:+.0f}%) exceeds {THRESHOLD_PCT}% threshold"
            )
        elif change is None and cur_val != prior_val:
            alerts.append(f"[VARIANCE] {line}: 0 -> {cur_val:,} (new this year)")

    missing = set(prior["forms_present"]) - set(current["forms_present"])
    for form in sorted(missing):
        alerts.append(f"[MISSING FORM] '{form}' was filed last year but is absent this year")
    return alerts


def main() -> None:
    by_client = group_by_client(load_all())
    print(f"Discovered {sum(len(v) for v in by_client.values())} return files "
          f"across {len(by_client)} clients.")
    print(f"Threshold: {THRESHOLD_PCT}% (tunable demo choice)\n")

    total_alerts = 0
    for client_id in sorted(by_client):
        returns = by_client[client_id]
        name = returns[0]["client"]["name"]
        years = ", ".join(str(r["tax_year"]) for r in returns)
        print(f"=== {name}  ({client_id})  years: {years} ===")
        if len(returns) < 2:
            print("  Only one year on file — nothing to compare.\n")
            continue
        for prior, current in zip(returns, returns[1:]):
            alerts = compare(prior, current)
            total_alerts += len(alerts)
            header = f"  {prior['tax_year']} -> {current['tax_year']}:"
            if not alerts:
                print(f"{header} no anomalies (clean).")
            else:
                print(f"{header} {len(alerts)} anomaly(ies)")
                for a in alerts:
                    print("    " + a)
        print()

    print(f"Total anomalies across all clients: {total_alerts}")


if __name__ == "__main__":
    main()
