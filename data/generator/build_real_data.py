#!/usr/bin/env python3
"""
NeuroShield - real data for the Bloodwork and Space Weather tabs (Python 3 standard library only).

Inputs (data/real/, unchanged downloads):
  OSD-569_*.csv   Inspiration4 complete blood count      NASA OSDR https://osdr.nasa.gov/bio/repo/data/studies/OSD-569
  OSD-575_*.csv   Inspiration4 comprehensive metabolic panel  NASA OSDR https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
  noaa_goes_*.json  GOES integral proton flux, 7 days (offline snapshot; the app also fetches it live)
Output:
  app/js/real_data.js   window.NS_REAL = {i4, noaa}

Usage: python3 data/generator/build_real_data.py
"""
import csv
import glob
import json
import os
import statistics as st

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "data", "real")


# ---------------------------------------------------------------- Inspiration4 (real)
TP_ORDER = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"]
TP_DAYS = {"L-92": -92, "L-44": -44, "L-3": -3, "R+1": 1, "R+45": 45, "R+82": 82, "R+194": 194}
PRE = ["L-92", "L-44", "L-3"]
# Plain-language notes for the analytes the app explains in detail.
I4_NOTES = {
    "WHITE BLOOD CELL COUNT": "Immune cells. Spaceflight is known to dysregulate immunity.",
    "ABSOLUTE NEUTROPHILS": "First-line immune cells; often rise with acute stress (e.g. landing).",
    "ABSOLUTE LYMPHOCYTES": "Adaptive immune cells; can fall after stress and radiation.",
    "RED BLOOD CELL COUNT": "Oxygen carriers. Space anaemia: the body destroys more red cells in microgravity.",
    "HEMOGLOBIN": "Oxygen-carrying protein. Falls after flight (space anaemia).",
    "HEMATOCRIT": "Share of blood volume made of red cells.",
    "PLATELET COUNT": "Clotting cells.",
    "GLUCOSE": "Blood sugar; energy supply and stress marker.",
    "UREA NITROGEN (BUN)": "Protein breakdown and kidney function marker.",
    "CREATININE": "Muscle waste product; kidney filter marker.",
    "CALCIUM": "Bone loss in microgravity releases calcium (kidney-stone risk).",
    "POTASSIUM": "Electrolyte important for heart rhythm.",
    "SODIUM": "Main fluid-balance electrolyte; shifts as body fluids redistribute back to the legs after landing.",
    "ALKALINE PHOSPHATASE": "Bone-formation and liver enzyme.",
    "ALT": "Liver enzyme.",
    "AST": "Liver and muscle enzyme.",
    "ALBUMIN": "Main blood protein; nutrition and fluid status.",
    "CARBON DIOXIDE": "Bicarbonate; acid-base balance.",
    "MCV": "Average red-cell size. Smaller cells after flight fit the known red-cell turnover in space.",
    "BILIRUBIN; TOTAL": "Haemoglobin breakdown product; rises when more red cells are destroyed.",
}
GROUP = {
    "Immune": ["WHITE BLOOD CELL COUNT", "ABSOLUTE NEUTROPHILS", "ABSOLUTE LYMPHOCYTES", "ABSOLUTE MONOCYTES", "ABSOLUTE EOSINOPHILS",
               "ABSOLUTE BASOPHILS", "NEUTROPHILS", "LYMPHOCYTES", "MONOCYTES", "EOSINOPHILS", "BASOPHILS"],
    "Red cells & oxygen": ["RED BLOOD CELL COUNT", "HEMOGLOBIN", "HEMATOCRIT", "MCV", "MCH", "MCHC", "RDW", "PLATELET COUNT", "MPV"],
    "Kidney & electrolytes": ["UREA NITROGEN (BUN)", "CREATININE", "eGFR NON-AFR. AMERICAN", "BUN/CREATININE RATIO", "SODIUM",
                              "POTASSIUM", "CHLORIDE", "CARBON DIOXIDE", "CALCIUM"],
    "Liver, protein & energy": ["GLUCOSE", "PROTEIN; TOTAL", "ALBUMIN", "GLOBULIN", "ALBUMIN/GLOBULIN RATIO", "BILIRUBIN; TOTAL",
                                "ALKALINE PHOSPHATASE", "AST", "ALT"],
}


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def build_i4():
    files = [("CBC", "OSD-569", glob.glob(os.path.join(RAW, "OSD-569_*.csv"))[0], "TEST_DATE"),
             ("CMP", "OSD-575", glob.glob(os.path.join(RAW, "OSD-575_*.csv"))[0], "timepoint")]
    analytes = {}
    sexes = {}
    for panel, osd, path, tpcol in files:
        with open(path, encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                name = row["ANALYTE"].replace(" (FEMALE)", "")
                if name == "eGFR AFRICAN AMERICAN":
                    continue  # race-based eGFR is obsolete (NKF-ASN 2021); keep the other one
                a = analytes.setdefault(name, dict(name=name, panel=panel, osd=osd, unit=row["UNITS"], ranges={}, values={}))
                sid = row["SUBJECT_ID"]
                sexes[sid] = row["SEX"]
                lo, hi = num(row["RANGE_MIN"]), num(row["RANGE_MAX"])
                a["ranges"][sid] = [lo, hi]
                v = num(row["VALUE"])
                if v is not None:
                    a["values"].setdefault(sid, {})[row[tpcol]] = v
    subjects = sorted(sexes)
    group_of = {n: g for g, ns in GROUP.items() for n in ns}
    out = []
    for name, a in analytes.items():
        a["group"] = group_of.get(name, "Other")
        a["note"] = I4_NOTES.get(name, "")
        a["stats"] = {}
        for sid in subjects:
            vals = a["values"].get(sid, {})
            pre = [vals[t] for t in PRE if t in vals]
            if len(pre) < 2:
                continue
            mu = st.mean(pre)
            lo, hi = a["ranges"].get(sid, [None, None])
            width = (hi - lo) if (lo is not None and hi is not None) else abs(mu) or 1
            sd = max(st.stdev(pre), 0.05 * width, 1e-9)
            r1 = vals.get("R+1")
            a["stats"][sid] = dict(pre_mean=round(mu, 3), pre_sd=round(sd, 3),
                                   r1_pct=None if r1 is None or mu == 0 else round(100 * (r1 - mu) / mu, 1),
                                   r1_z=None if r1 is None else round((r1 - mu) / sd, 2))
        # crew-wide return signature: same-direction shift in >= 3 of 4 crew at R+1
        z = [s["r1_z"] for s in a["stats"].values() if s["r1_z"] is not None]
        up, down = sum(1 for x in z if x >= 1.5), sum(1 for x in z if x <= -1.5)
        a["signature"] = "up" if up >= 3 else "down" if down >= 3 else None
        a["mean_r1_pct"] = round(st.mean([s["r1_pct"] for s in a["stats"].values() if s["r1_pct"] is not None]), 1) if a["stats"] else None
        out.append(a)
    order = {n: i for i, n in enumerate(sum(GROUP.values(), []))}
    out.sort(key=lambda a: (list(GROUP).index(a["group"]) if a["group"] in GROUP else 99, order.get(a["name"], 999)))
    res = dict(source="NASA OSDR OSD-569 (CBC) and OSD-575 (CMP), Inspiration4 crew, Quest Diagnostics clinical labs",
               urls=["https://osdr.nasa.gov/bio/repo/data/studies/OSD-569", "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575"],
               mission=dict(name="Inspiration4", launch="2021-09-16", landing="2021-09-18", days=3, orbit_km=585),
               timepoints=TP_ORDER, tp_days=TP_DAYS, preflight=PRE, subjects={s: dict(sex=sexes[s]) for s in subjects},
               groups=list(GROUP), analytes=out)
    return res


# ---------------------------------------------------------------- NOAA GOES snapshot
def build_noaa():
    path = sorted(glob.glob(os.path.join(RAW, "noaa_goes_*.json")))[-1]
    with open(path) as f:
        rows = json.load(f)
    keep = {">=10 MeV": "p10", ">=100 MeV": "p100"}
    hourly = {}
    for x in rows:
        if x["energy"] in keep and x["flux"] is not None:
            h = x["time_tag"][:13] + ":00:00Z"
            hourly.setdefault(h, {}).setdefault(keep[x["energy"]], []).append(x["flux"])
    series = [dict(t=h, **{k: round(max(v), 4) for k, v in d.items()}) for h, d in sorted(hourly.items())]
    return dict(file=os.path.basename(path), source="NOAA SWPC GOES-primary integral protons, 7-day",
                url="https://services.swpc.noaa.gov/json/goes/primary/integral-protons-7-day.json", series=series)


def main():
    i4 = build_i4()
    noaa = build_noaa()
    out = os.path.join(ROOT, "app", "js", "real_data.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("// Generated by data/generator/build_real_data.py - do not edit by hand.\n")
        f.write("window.NS_REAL = " + json.dumps({"i4": i4, "noaa": noaa}, separators=(",", ":"), ensure_ascii=False) + ";\n")
    sig = [(a["name"], a["signature"], a["mean_r1_pct"]) for a in i4["analytes"] if a["signature"]]
    print(f"  inspiration4: {len(i4['analytes'])} analytes, crew-wide R+1 changes {sig}")
    print(f"  noaa: {len(noaa['series'])} hourly points from {noaa['file']}")
    print(f"  app/js/real_data.js  {os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    main()
