#!/usr/bin/env python3
"""
Real human recordings for NeuroShield (Earth-lab datasets reviewed in the Guide tab).

Turns the downloaded open datasets into
  data/real/lab/noneeg_1hz.json   PhysioNet Non-EEG (20 people, stress protocol): HR, SpO2, EDA at 1 Hz + phases
  data/real/lab/prcp_1hz.json     PhysioNet PRCP (10 people, tilt + stand-up): HR, SBP, DBP, +Gz at 1 Hz + manoeuvres
  data/real/lab/bidmc_1hz.json    PhysioNet BIDMC (53 ICU patients, 8 min): HR, respiration rate, SpO2 at 1 Hz
  data/real/lab/calibration.json  reference statistics used to check NeuroShield's limits:
        NSR RR database (54 healthy 24-h ECGs)  -> 5-min RMSSD distribution
        EEG driver drowsiness (11 people)       -> (θ+α)/β drowsiness index, alert vs drowsy
        Sleep-EDF Expanded (sleep cassette)     -> total sleep time and sleep efficiency of healthy adults
        Tufts fNIRS2MW (hand-downloaded subjects) -> forehead oxygenation vs n-back workload level
        Cybersickness dataset (VR navigation)   -> SSQ vs scene rotation, EDA and HR; data/real/lab/cyber_1hz.json
tools/validate_real.js then runs the app's rule engine on the recordings and bundles app/js/real_rec.js.

Raw downloads live in data/external/ (not redistributed); see fetch_lab_datasets.sh.
Usage: uv run --python 3.12 --with wfdb --with scipy --with xlrd python data/generator/build_lab_datasets.py
"""
import csv
import glob
import json
import math
import os
import pickle
import re
import statistics as st

import numpy as np
import scipy.io as sio
from scipy.stats import spearmanr
import wfdb

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXT = os.path.join(ROOT, "data", "external")
OUT = os.path.join(ROOT, "data", "real", "lab")


def r1(a, d=1):
    return [None if (x is None or not np.isfinite(x)) else round(float(x), d) for x in a]


def per_second(t, v, n, win=3.0):
    """Value at each second = median of the beats in the last `win` seconds (None when no beat)."""
    t, v = np.asarray(t), np.asarray(v)
    out = []
    for s in range(n):
        m = (t > s - win) & (t <= s)
        out.append(float(np.median(v[m])) if m.any() else None)
    return out


# ---------------------------------------------------------------- PhysioNet Non-EEG
def noneeg():
    d = glob.glob(os.path.join(EXT, "noneeg", "*"))[0] + "/"
    subjects = []
    for s in range(1, 21):
        h = wfdb.rdrecord(d + f"Subject{s}_SpO2HR")
        e = wfdb.rdrecord(d + f"Subject{s}_AccTempEDA")
        a = wfdb.rdann(d + f"Subject{s}_AccTempEDA", "atr")
        n = h.sig_len
        eda = e.p_signal[:, e.sig_name.index("EDA")]
        temp = e.p_signal[:, e.sig_name.index("temp")]
        eda1 = [float(np.nanmean(eda[i * 8:(i + 1) * 8])) if i * 8 < len(eda) else None for i in range(n)]
        tmp1 = [float(np.nanmean(temp[i * 8:(i + 1) * 8])) if i * 8 < len(temp) else None for i in range(n)]
        phases = [[int(smp // 8), note] for smp, note in zip(a.sample, a.aux_note)]
        info = {}
        for c in h.comments or []:  # "age: 30", "gender: M", "height/cm: 177", ...
            k, _, v = c.partition(":")
            info[k.strip().split("/")[0]] = v.strip()
        subjects.append({"id": f"Subject{s}", "info": info, "hr": r1(h.p_signal[:, h.sig_name.index("hr")], 0),
                         "spo2": r1(h.p_signal[:, h.sig_name.index("SpO2")], 0), "eda": r1(eda1, 2), "skin_temp": r1(tmp1, 2),
                         "phases": phases})
    return {"source": "PhysioNet Non-EEG Dataset for Assessment of Neurological Status v1.0.0 (Birjandtalab et al. 2016)",
            "url": "https://physionet.org/content/noneeg/1.0.0/", "subjects": subjects}


# ---------------------------------------------------------------- PhysioNet PRCP
def prcp():
    d = glob.glob(os.path.join(EXT, "prcp", "*"))[0] + "/"
    recs = []
    for rec in open(d + "RECORDS").read().split():
        hdr = wfdb.rdheader(d + rec)
        fs, n = hdr.fs, int(hdr.sig_len / hdr.fs)
        bp = wfdb.rdann(d + rec, "wabp")
        sbp_t, sbp, dbp = [], [], []
        for smp, note in zip(bp.sample, bp.aux_note):
            m = re.match(r"\s*([\d.]+)/([\d.]+)", note or "")
            if m:
                sbp_t.append(smp / fs); sbp.append(float(m.group(1))); dbp.append(float(m.group(2)))
        q = wfdb.rdann(d + rec, "wqrs")
        bt = q.sample / fs
        rr = np.diff(bt)
        ok = (rr > 0.3) & (rr < 2.0)
        hr_t, hr = bt[1:][ok], 60.0 / rr[ok]
        sig = wfdb.rdrecord(d + rec, channel_names=["Angle"])
        ang = sig.p_signal[:, 0]
        gz = [round(math.sin(math.radians(max(0.0, min(90.0, float(np.nanmean(ang[i * fs:(i + 1) * fs])))))), 2) for i in range(n)]
        ev = wfdb.rdann(d + rec, "anI")
        events = [[int(smp / fs), (note or "").strip()] for smp, note in zip(ev.sample, ev.aux_note)]
        recs.append({"id": rec, "info": " ".join(hdr.comments or []), "hr": r1(per_second(hr_t, hr, n), 0),
                     "sbp": r1(per_second(sbp_t, sbp, n), 0), "dbp": r1(per_second(sbp_t, dbp, n), 0), "gz": gz, "events": events})
    return {"source": "PhysioNet Physiologic Response to Changes in Posture v1.0.0 (Heldt et al. 2003)",
            "url": "https://physionet.org/content/prcp/1.0.0/", "records": recs}


# ---------------------------------------------------------------- PhysioNet BIDMC
def bidmc():
    pats = []
    for f in sorted(glob.glob(os.path.join(EXT, "bidmc", "bidmc_*_Numerics.csv"))):
        pid = os.path.basename(f)[:8]
        rows = list(csv.reader(open(f)))[1:]
        num = lambda i: [float(r[i]) if len(r) > i and r[i].strip() not in ("", "NaN", "nan") else None for r in rows]
        fix = open(f.replace("_Numerics.csv", "_Fix.txt")).read()
        age = re.search(r"Age: (\S+)", fix); sex = re.search(r"Gender: (\S+)", fix); loc = re.search(r"Location: (\S+)", fix)
        pats.append({"id": pid, "info": {"age": age and age.group(1), "sex": sex and sex.group(1), "unit": loc and loc.group(1)},
                     "hr": num(1), "resp": num(3), "spo2": num(4)})
    return {"source": "PhysioNet BIDMC PPG and Respiration Dataset v1.0.0 (Pimentel et al. 2016)",
            "url": "https://physionet.org/content/bidmc/1.0.0/", "patients": pats}


# ---------------------------------------------------------------- calibration: NSR RR (HRV)
def nsr_rmssd():
    d = glob.glob(os.path.join(EXT, "nsr2db", "*"))[0] + "/"
    per_subject, all_w = [], []
    for rec in open(d + "RECORDS").read().split():
        a = wfdb.rdann(d + rec, "ecg")
        t = a.sample / 128.0
        sym = np.array(a.symbol)
        rr = np.diff(t) * 1000
        nn = (sym[1:] == "N") & (sym[:-1] == "N") & (rr > 300) & (rr < 2000)
        tt = t[1:]
        win = []
        for w0 in np.arange(0, tt[-1], 300):
            m = nn & (tt >= w0) & (tt < w0 + 300)
            x = rr[m]
            if len(x) > 150:
                dx = np.diff(x)
                dx = dx[np.abs(dx) < 200]  # drop ectopy / artefact jumps
                if len(dx) > 100:
                    win.append(float(np.sqrt(np.mean(dx ** 2))))
        if win:
            age = re.search(r"Age: (\d+)", " ".join(wfdb.rdheader(d + rec).comments or []))
            per_subject.append({"id": rec, "age": int(age.group(1)) if age else None, "median_rmssd": round(st.median(win), 1),
                                "p10": round(float(np.percentile(win, 10)), 1), "windows": len(win)})
            all_w += win
    a = np.array(all_w)
    young = [s["median_rmssd"] for s in per_subject if s["age"] and s["age"] < 50]
    return {"source": "PhysioNet Normal Sinus Rhythm RR Interval Database v1.0.0", "url": "https://physionet.org/content/nsr2db/1.0.0/",
            "subjects": len(per_subject), "windows_5min": len(all_w),
            "rmssd_ms": {"p5": round(float(np.percentile(a, 5)), 1), "p10": round(float(np.percentile(a, 10)), 1),
                         "median": round(float(np.median(a)), 1), "p90": round(float(np.percentile(a, 90)), 1)},
            "share_below_20": round(float(np.mean(a < 20)), 3), "share_below_12": round(float(np.mean(a < 12)), 3),
            "median_rmssd_under50": round(st.median(young), 1) if young else None, "per_subject": per_subject}


# ---------------------------------------------------------------- calibration: EEG drowsiness index
def eeg_fi():
    m = sio.loadmat(os.path.join(EXT, "eeg_drowsy.mat"))
    x, sub, state = m["EEGsample"], m["subindex"].ravel(), m["substate"].ravel()  # state: 0 alert, 1 drowsy
    fs = 128
    f = np.fft.rfftfreq(x.shape[2], 1 / fs)
    win = np.hanning(x.shape[2])
    p = np.abs(np.fft.rfft((x - x.mean(axis=2, keepdims=True)) * win, axis=2)) ** 2
    band = lambda lo, hi: p[:, :, (f >= lo) & (f < hi)].sum(axis=2).mean(axis=1)  # mean over 30 channels
    fi = (band(4, 8) + band(8, 13)) / band(13, 30)
    rel = np.empty_like(fi)
    per = []
    for s in np.unique(sub):
        ms = sub == s
        base = np.median(fi[ms & (state == 0)])
        rel[ms] = fi[ms] / base
        a_, d_ = rel[ms & (state == 0)], rel[ms & (state == 1)]
        auc = float(np.mean([[1.0 if dv > av else 0.5 if dv == av else 0.0 for av in a_] for dv in d_])) if len(a_) and len(d_) else None
        per.append({"subject": int(s), "n_alert": int(len(a_)), "n_drowsy": int(len(d_)),
                    "median_drowsy_x_baseline": round(float(np.median(d_)), 2) if len(d_) else None, "auc": round(auc, 3) if auc else None})
    A, Dz = rel[state == 0], rel[state == 1]
    auc_all = float(np.mean([np.mean(Dz > a) + 0.5 * np.mean(Dz == a) for a in A]))
    return {"source": "EEG driver drowsiness dataset (Cui et al., figshare 10.6084/m9.figshare.14273687), from Cao et al. 2019",
            "url": "https://figshare.com/articles/dataset/EEG_driver_drowsiness_dataset/14273687",
            "samples": int(len(fi)), "subjects": int(len(per)), "index": "(θ 4-8 Hz + α 8-13 Hz) / β 13-30 Hz power, mean of 30 channels, 3-s epochs, ×each person's alert median",
            "alert_median": round(float(np.median(A)), 2), "drowsy_median": round(float(np.median(Dz)), 2),
            "drowsy_above_1_3": round(float(np.mean(Dz > 1.3)), 3), "alert_above_1_3": round(float(np.mean(A > 1.3)), 3),
            "drowsy_above_1_6": round(float(np.mean(Dz > 1.6)), 3), "alert_above_1_6": round(float(np.mean(A > 1.6)), 3),
            "auc_pooled": round(auc_all, 3), "per_subject": per}


# ---------------------------------------------------------------- calibration: Sleep-EDF hypnograms
def edf_start(path):
    h = open(path, "rb").read(256).decode("ascii", "ignore")
    return h[176:184].strip()  # hh.mm.ss


def sleep_edf():
    d = os.path.join(EXT, "sleepedf")
    lights = {}
    try:
        import xlrd
        book = xlrd.open_workbook(os.path.join(d, "SC-subjects.xls")).sheet_by_index(0)
        hdr = [str(c.value).strip().lower() for c in book.row(0)]
        for i in range(1, book.nrows):
            row = book.row_values(i)
            rec = dict(zip(hdr, row))
            key = f"{int(rec['subject']):02d}{int(rec['night'])}"
            lights[key] = (float(rec["lightsoff"]) * 24 * 3600, int(rec["age"]))
    except Exception as e:
        print("  SC-subjects.xls not read:", e)
    nights = []
    for f in sorted(glob.glob(os.path.join(d, "SC4*-Hypnogram.edf"))):
        raw = open(f, "rb").read()
        tals = re.findall(rb"\+(\d+(?:\.\d+)?)\x15(\d+(?:\.\d+)?)\x14([^\x14]+)\x14", raw)
        stages = [(float(o), float(du), s.decode()) for o, du, s in tals]
        sleep = [(o, du) for o, du, s in stages if s in ("Sleep stage 1", "Sleep stage 2", "Sleep stage 3", "Sleep stage 4", "Sleep stage R")]
        if not sleep:
            continue
        key = os.path.basename(f)[3:6]  # SC4ssN -> ssN
        hh, mm, ss = [int(x) for x in edf_start(f).split(".")]
        start = hh * 3600 + mm * 60 + ss
        lo = None
        if key in lights:
            lo = (lights[key][0] - start) % 86400  # lights off, seconds after recording start
        t_first = min(o for o, _ in sleep)
        t_last = max(o + du for o, du in sleep)
        bed = lo if lo is not None and lo < t_first else t_first
        tst = sum(du for _, du in sleep)
        nights.append({"night": os.path.basename(f)[:7], "age": lights.get(key, (None, None))[1],
                       "tst_h": round(tst / 3600, 2), "efficiency_pct": round(100 * tst / (t_last - bed), 1)})
    tst = [n["tst_h"] for n in nights]
    eff = [n["efficiency_pct"] for n in nights]
    young = [n for n in nights if n["age"] and n["age"] < 50]
    pct = lambda a, q: round(float(np.percentile(a, q)), 2)
    return {"source": "PhysioNet Sleep-EDF Database Expanded v1.0.0, sleep-cassette study (Kemp et al. 2000), hypnograms only",
            "url": "https://physionet.org/content/sleep-edfx/1.0.0/", "nights": len(nights),
            "efficiency_def": "total sleep time ÷ time from lights-off to the final awakening",
            "tst_h": {"p10": pct(tst, 10), "median": pct(tst, 50), "p90": pct(tst, 90)},
            "efficiency_pct": {"p10": pct(eff, 10), "median": pct(eff, 50), "p90": pct(eff, 90)},
            "under50": {"nights": len(young), "tst_median": pct([n["tst_h"] for n in young], 50) if young else None,
                        "eff_median": pct([n["efficiency_pct"] for n in young], 50) if young else None,
                        "eff_p10": pct([n["efficiency_pct"] for n in young], 10) if young else None},
            "share_eff_below_85": round(float(np.mean(np.array(eff) < 85)), 3)}


# ---------------------------------------------------------------- calibration: Tufts fNIRS2MW workload
def fnirs_workload():
    """Tufts fNIRS2MW per-subject CSVs (data/external/fnirs2mw/sub_*.csv, downloaded by hand from Box):
    8 normalised forehead fNIRS features at 5.2 Hz, label = n-back level 0-3. The task is run as blocks,
    so each block's mean is one observation; tests whether oxygenated haemoglobin rises with workload."""
    files = sorted(glob.glob(os.path.join(EXT, "fnirs2mw", "sub_*.csv")), key=lambda f: int(re.findall(r"\d+", os.path.basename(f))[0]))
    if not files:
        return None
    per, pooled = [], {}
    for f in files:
        rows = list(csv.DictReader(open(f)))
        cols = [k for k in rows[0] if k != "label"]
        X = np.array([[float(r[k]) for k in cols] for r in rows])
        y = np.array([int(r["label"]) for r in rows])
        blocks, s = [], 0
        for i in range(1, len(y) + 1):
            if i == len(y) or y[i] != y[s]:
                blocks.append((int(y[s]), X[s:i].mean(axis=0), i - s))
                s = i
        lv = np.array([b[0] for b in blocks])
        feats = {}
        for j, c in enumerate(cols):
            m = np.array([b[1][j] for b in blocks])
            rho = float(spearmanr(lv, m)[0])
            lo, hi = m[lv <= 1], m[lv >= 2]
            auc = float(np.mean([[1.0 if h > l else 0.5 if h == l else 0.0 for l in lo] for h in hi]))
            feats[c] = {"spearman": round(rho, 3), "auc_high_vs_low": round(auc, 3),
                        "level_mean": [round(float(m[lv == k].mean()), 3) for k in range(4)]}
            pooled.setdefault(c, []).append(rho)
        per.append({"subject": os.path.basename(f)[:-4], "blocks": len(blocks), "block_s": round(blocks[0][2] / 5.2, 1), "features": feats})
    best = max(pooled, key=lambda c: np.mean(pooled[c]))
    return {"source": "Tufts fNIRS2MW (Huang et al., NeurIPS 2021 Datasets track), CC BY 4.0",
            "url": "https://tufts-hci-lab.github.io/code_and_datasets/fNIRS2MW.html",
            "subjects": len(per), "of_subjects": 68, "rate_hz": 5.2,
            "features_note": "AB / CD = two forehead optode pairs; I = intensity, PHI = phase; O = oxy-, DO = deoxy-haemoglobin; values normalised per person (no rSO2 %).",
            "best_feature": best, "best_mean_spearman": round(float(np.mean(pooled[best])), 3), "per_subject": per}


# ---------------------------------------------------------------- Cybersickness (VR navigation) proxy for vestibular mismatch
class _Stub:
    pass


class _SafeUnpickler(pickle.Unpickler):
    """raw_data2020.p is a pickle; only numpy/pandas internals and plain stand-ins for its own classes may load."""
    def find_class(self, mod, name):
        if mod == "createDataset":
            return type(name, (_Stub,), {})
        if mod.split(".")[0] in ("numpy", "pandas", "datetime", "collections", "copyreg", "_codecs") or \
                (mod == "builtins" and name in ("slice", "range", "complex", "set", "frozenset", "tuple", "list", "dict", "object", "bytearray")):
            return super().find_class(mod, name)
        raise pickle.UnpicklingError(f"blocked {mod}.{name}")


def cybersickness():
    """Wang et al. 2023 (github.com/coreturn/Cybersickness_Dataset): 159 four-minute VR navigation sessions of 54 people,
    Empatica E4 wrist EDA (4 Hz) + HR, SteamVR head pose and the virtual (scene) rotation, and an SSQ after each session.
    Follows analysis_data.ipynb (SSQ distribution, one-session signals) and adds per-session features vs SSQ.
    Scene rotation with a still body is a visual-vestibular conflict, so |scene rotation| feeds NeuroShield's VMIS channel."""
    f = os.path.join(EXT, "cybersickness", "raw_data2020.p")
    if not os.path.exists(f):
        return None, None
    with open(f, "rb") as fh:
        d = _SafeUnpickler(fh).load()
    sessions, feats = [], []
    for key, o in d.items():
        rot, head = o.Steam.rawRotation, o.Steam.rawHead
        n = int(head.Time.values[-1])
        vis = [float(np.abs(rot.Rotation.values[(rot.Time.values >= i) & (rot.Time.values < i + 1)]).mean()) for i in range(n)]
        e4 = lambda df, col: (df.E4_Time.values - o.Empatica.GSR.E4_Time.values[0], df[col].values)
        gt, g = e4(o.Empatica.GSR, "GSR")
        ht, hr = e4(o.Empatica.HR, "HR")
        sec = lambda t, v: [float(v[(t >= i) & (t < i + 1)].mean()) if ((t >= i) & (t < i + 1)).any() else None for i in range(n)]
        gsr = sec(gt, g)
        q = o.SicknessLevel
        first, last = g[gt < 30].mean(), g[gt > gt[-1] - 60].mean()
        ssq = round(float(q.SSQ), 1)
        sessions.append({"id": key, "person": o.Name, "condition": o.Order, "ssq": ssq, "nausea": round(float(q.Nausea), 1),
                         "oculomotor": round(float(q.Oculomotor), 1), "disorientation": round(float(q.Disorientation), 1),
                         "gsr": r1(gsr, 2), "hr": r1(sec(ht, hr)), "vmis": r1(vis)})
        feats.append({"person": o.Name, "cond": o.Order, "ssq": ssq, "nausea": float(q.Nausea), "vis": float(np.mean(vis)),
                      "dgsr": float(last - first), "dhr": float(hr[-10:].mean() - hr[:10].mean())})
    ssq = np.array([x["ssq"] for x in feats])
    rho = lambda k, y="ssq": [round(float(v), 3) for v in spearmanr([x[k] for x in feats], [x[y] for x in feats])]

    def within(k):  # same person, different sessions: centre on each person's mean
        by = {}
        for x in feats:
            by.setdefault(x["person"], []).append(x)
        a, b = [], []
        for g_ in by.values():
            if len(g_) > 1:
                mk, ms = np.mean([x[k] for x in g_]), np.mean([x["ssq"] for x in g_])
                a += [x[k] - mk for x in g_]; b += [x["ssq"] - ms for x in g_]
        return [round(float(v), 3) for v in spearmanr(a, b)]

    def auc(k):  # sick (SSQ >= 40) vs little (SSQ < 20)
        hi = [x[k] for x in feats if x["ssq"] >= 40]; lo = [x[k] for x in feats if x["ssq"] < 20]
        return round(float(np.mean([[1.0 if h > l else 0.5 if h == l else 0.0 for l in lo] for h in hi])), 3)

    conds = sorted({x["cond"] for x in feats})
    cal = {"source": "Wang, Li, Chardonnet & Hui 2023, Dataset for predicting cybersickness from a virtual navigation task (arXiv:2303.13527)",
           "url": "https://github.com/coreturn/Cybersickness_Dataset", "sessions": len(feats), "people": len({x["person"] for x in feats}),
           "session_s": 240, "ssq_quartiles": [round(float(v), 1) for v in np.percentile(ssq, [25, 50, 75])],
           "share_ssq_ge20": round(float(np.mean(ssq >= 20)), 3), "share_ssq_ge40": round(float(np.mean(ssq >= 40)), 3),
           "by_condition": {c: {"n": sum(x["cond"] == c for x in feats), "ssq_median": round(float(np.median([x["ssq"] for x in feats if x["cond"] == c])), 1),
                                "scene_rot_median": round(float(np.median([x["vis"] for x in feats if x["cond"] == c])), 2)} for c in conds},
           "scene_rotation": {"rho_ssq": rho("vis"), "rho_within_person": within("vis"), "auc_sick": auc("vis"),
                              "session_mean_median": round(float(np.median([x["vis"] for x in feats])), 2)},
           "eda_rise": {"rho_ssq": rho("dgsr"), "rho_nausea": rho("dgsr", "nausea"), "rho_within_person": within("dgsr"), "auc_sick": auc("dgsr"),
                        "median_uS": round(float(np.median([x["dgsr"] for x in feats])), 2)},
           "hr_change": {"rho_ssq": rho("dhr"), "auc_sick": auc("dhr")},
           "features_note": "scene rotation = mean |virtual rotation rate| per session (as logged by SteamVR, taken as °/s); EDA rise = last 60 s minus first 30 s; HR change = last minus first 10 HR samples; AUC = SSQ ≥ 40 vs SSQ < 20 sessions"}
    return {"source": cal["source"], "url": cal["url"], "sessions": sessions}, cal


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [("noneeg_1hz.json", noneeg), ("prcp_1hz.json", prcp), ("bidmc_1hz.json", bidmc)]
    for name, fn in jobs:
        res = fn()
        json.dump(res, open(os.path.join(OUT, name), "w"), separators=(",", ":"))
        print(f"  {name}: {os.path.getsize(os.path.join(OUT, name)) // 1024} KB")
    cyber, cyber_cal = cybersickness()
    if cyber:
        json.dump(cyber, open(os.path.join(OUT, "cyber_1hz.json"), "w"), separators=(",", ":"))
        print(f"  cyber_1hz.json: {os.path.getsize(os.path.join(OUT, 'cyber_1hz.json')) // 1024} KB")
    cal = {"hrv_nsr": nsr_rmssd(), "eeg_drowsiness": eeg_fi(), "sleep_edf": sleep_edf(), "fnirs_workload": fnirs_workload(), "cybersickness": cyber_cal}
    json.dump(cal, open(os.path.join(OUT, "calibration.json"), "w"), indent=1)
    h, e, s = cal["hrv_nsr"], cal["eeg_drowsiness"], cal["sleep_edf"]
    print(f"  NSR: {h['subjects']} people, {h['windows_5min']} 5-min windows, RMSSD median {h['rmssd_ms']['median']} ms, "
          f"p5 {h['rmssd_ms']['p5']}, below 20 ms {h['share_below_20']:.1%}, below 12 ms {h['share_below_12']:.1%}")
    print(f"  EEG: {e['samples']} epochs, drowsy median {e['drowsy_median']}x vs alert {e['alert_median']}x, "
          f">1.3x drowsy {e['drowsy_above_1_3']:.0%} alert {e['alert_above_1_3']:.0%}, AUC {e['auc_pooled']}")
    print(f"  Sleep-EDF: {s['nights']} nights, TST median {s['tst_h']['median']} h, efficiency median {s['efficiency_pct']['median']} % "
          f"(p10 {s['efficiency_pct']['p10']}), under-50 {s['under50']}")
    c = cal["cybersickness"]
    if c:
        print(f"  Cybersickness: {c['sessions']} sessions / {c['people']} people, SSQ quartiles {c['ssq_quartiles']}, "
              f"scene rot {c['scene_rotation']}, EDA rise {c['eda_rise']}, HR {c['hr_change']}")
    fw = cal["fnirs_workload"]
    if fw:
        b = fw["per_subject"][0]["features"][fw["best_feature"]]
        print(f"  fNIRS2MW: {fw['subjects']} subject(s), best {fw['best_feature']} rho {fw['best_mean_spearman']}, "
              f"sub 1 level means {b['level_mean']} AUC {b['auc_high_vs_low']}")


if __name__ == "__main__":
    main()
