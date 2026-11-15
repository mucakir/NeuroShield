#!/usr/bin/env python3
"""
Download real ISS cabin telemetry and radiation dosimetry from the NASA OSDR Environmental Data
Application (EDA) API and save daily aggregates used by the dataset generator.

API: https://visualization.osdr.nasa.gov/eda/api/  (documented at /eda/api_reference)
  /missions/{mission}/telemetry_data/   5-min ISS + ground: temperature (°C), relative humidity (%), CO2 (ppm)
  /missions/{mission}/radiation_data/   daily absorbed dose (mGy/day): GCR, SAA, total

Output: data/real/osdr_eda_<mission>_daily.csv  (date, co2_ppm, temp_c, rh_pct, gcr_mGy, saa_mGy, total_mGy, n_samples)
        data/real/osdr_eda_summary.json         per-mission medians, used to set the simulator's cabin baselines

Usage: python3 data/generator/fetch_osdr_eda.py [MISSION ...]   (default: every mission with both kinds of data)
"""
import collections
import csv
import json
import os
import statistics as st
import sys
import urllib.request

API = "https://visualization.osdr.nasa.gov/eda/api/missions"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "data", "real")
# plausible sensor range; the telemetry has occasional dropouts (e.g. 200 or 9000 ppm CO2 spikes)
VALID = {"co2_iss": (1000, 8000), "temperature_iss": (15, 32), "humidity_iss": (15, 90)}


def get(url):
    with urllib.request.urlopen(url + "?format=json", timeout=300) as r:
        return json.load(r)


def daily(mission):
    tel, rad = get(f"{API}/{mission}/telemetry_data/"), get(f"{API}/{mission}/radiation_data/")
    if not tel or not rad:
        return None
    by = collections.defaultdict(lambda: collections.defaultdict(list))
    for x in tel:
        for k, (lo, hi) in VALID.items():
            v = x.get(k)
            if v is not None and lo <= v <= hi:
                by[x["time"][:10]][k].append(v)
    dose = {x["time"][:10]: x for x in rad}
    rows = []
    for d in sorted(set(by) & set(dose)):
        b, r = by[d], dose[d]
        if not b["co2_iss"]:
            continue
        rows.append({"date": d, "co2_ppm": round(st.mean(b["co2_iss"])), "temp_c": round(st.mean(b["temperature_iss"]), 2),
                     "rh_pct": round(st.mean(b["humidity_iss"]), 1), "gcr_mGy": r["gcr"], "saa_mGy": r["saa"],
                     "total_mGy": r["total"], "n_samples": len(b["co2_iss"])})
    return rows


def main():
    os.makedirs(OUT, exist_ok=True)
    missions = sys.argv[1:] or [m["name"] for m in get(API + "/")]
    summary = {}
    for m in missions:
        rows = daily(m)
        if not rows:
            print(f"  {m}: no ISS telemetry + radiation pair, skipped")
            continue
        with open(os.path.join(OUT, f"osdr_eda_{m}_daily.csv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(rows)
        med = lambda k: st.median(r[k] for r in rows)
        summary[m] = {"days": len(rows), "from": rows[0]["date"], "to": rows[-1]["date"],
                      **{k: med(k) for k in ("co2_ppm", "temp_c", "rh_pct", "gcr_mGy", "saa_mGy", "total_mGy")}}
        print(f"  {m}: {len(rows)} days {rows[0]['date']}..{rows[-1]['date']}  CO2 {summary[m]['co2_ppm']} ppm  "
              f"T {summary[m]['temp_c']} °C  RH {summary[m]['rh_pct']} %  dose {summary[m]['total_mGy']} mGy/d")
    all_ = list(summary.values())
    summary["_all"] = {k: round(st.median(s[k] for s in all_), 3) for k in ("co2_ppm", "temp_c", "rh_pct", "gcr_mGy", "saa_mGy", "total_mGy")}
    summary["_source"] = API
    with open(os.path.join(OUT, "osdr_eda_summary.json"), "w") as f:
        json.dump(summary, f, indent=1)
    print("  median of missions:", summary["_all"])


if __name__ == "__main__":
    main()
