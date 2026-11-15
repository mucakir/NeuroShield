#!/usr/bin/env python3
"""
NeuroShield Crew Health Monitor - synthetic dataset generator.

Produces
  data/live/<scenario>.csv        1 Hz multimodal stream (15 min each) with ground-truth labels
                                  (EVA suit channels TR/PSUIT are empty outside the spacewalk scenario)
  data/live/scenarios.json        scenario catalogue
  data/logbook/crew_daily_log.csv 60-day daily log for 4 crew members with injected anomalies
  data/logbook/injected_anomalies.json  ground truth for the anomaly detector
  app/js/data_bundle.js           everything above (+ reference ranges) for the web app

Physiology is modelled with simple, literature-informed relationships (see docs/).
It is synthetic data for demonstration; it is not real astronaut data.

Usage: python3 data/generator/generate_dataset.py   (stdlib only, deterministic)
"""
import csv
import json
import math
import os
import random

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DUR = 900  # seconds per live scenario

LIVE_COLS = ["HR", "RMSSD", "SBP", "DBP", "SPO2", "RR", "TEMP", "GLU", "EEG_FI", "EEG_WL",
             "RSO2", "GSR", "NOD", "GZ", "VMIS", "CO2", "PPO2", "PCAB", "CO", "DOSE",
             "TR", "PSUIT", "NEUT", "CABT", "RH", "SPL"]
DEC = {"HR": 0, "RMSSD": 0, "SBP": 0, "DBP": 0, "SPO2": 1, "RR": 1, "TEMP": 2, "GLU": 0,
       "EEG_FI": 2, "EEG_WL": 2, "RSO2": 1, "GSR": 2, "NOD": 0, "GZ": 2, "VMIS": 1,
       "CO2": 0, "PPO2": 2, "PCAB": 2, "CO": 1, "DOSE": 1,
       "TR": 2, "PSUIT": 1, "NEUT": 1, "CABT": 1, "RH": 0, "SPL": 0}

# None = channel only exists in some scenarios (EVA suit telemetry)
# Real ISS cabin telemetry and dosimetry (NASA OSDR EDA, rodent-research missions 2014-2020),
# downloaded by data/generator/fetch_osdr_eda.py; medians set the simulator's cabin baselines.
EDA = json.load(open(os.path.join(ROOT, "data", "real", "osdr_eda_summary.json"), encoding="utf-8"))
EDA_ALL = EDA["_all"]
ISS_DOSE_UGYH = round(EDA_ALL["total_mGy"] * 1000 / 24, 1)   # mGy/day -> µGy/h

BASE = {"HR": 66, "RMSSD": 45, "SBP": 116, "DBP": 74, "SPO2": 98, "RR": 14, "TEMP": 36.8,
        "GLU": 95, "EEG_FI": 1.0, "EEG_WL": 1.0, "RSO2": 70, "GSR": 4.0, "NOD": 0, "GZ": 0.0,
        "VMIS": 3.0, "CO2": round(EDA_ALL["co2_ppm"]), "PPO2": 21.3, "PCAB": 101.3, "CO": 2.0, "DOSE": 14,
        "TR": None, "PSUIT": None, "NEUT": 6.0, "CABT": round(EDA_ALL["temp_c"], 1), "RH": round(EDA_ALL["rh_pct"]), "SPL": 56}

NOISE = {"HR": (1.5, 0.8), "RMSSD": (3, 0.85), "SBP": (2, 0.9), "DBP": (1.5, 0.9),
         "SPO2": (0.4, 0.7), "RR": (0.6, 0.8), "TEMP": (0.03, 0.95), "GLU": (1.0, 0.97),
         "EEG_FI": (0.06, 0.6), "EEG_WL": (0.06, 0.6), "RSO2": (0.8, 0.8), "GSR": (0.25, 0.9),
         "GZ": (0.03, 0.5), "VMIS": (1.2, 0.6), "CO2": (40, 0.95), "PPO2": (0.08, 0.9),
         "PCAB": (0.05, 0.95), "CO": (0.3, 0.9), "DOSE": (1.5, 0.7)}
# separate generator for the newer channels so the original channels stay identical
NOISE2 = {"TR": (0.006, 0.9), "PSUIT": (0.08, 0.9), "NEUT": (0.7, 0.7), "CABT": (0.06, 0.95),
          "RH": (0.6, 0.9), "SPL": (0.8, 0.8)}

# Mission context per scenario environment: the "distance from Earth" and "gravity fields" hazards.
# g = resting gravity load (sets the GZ baseline); dose/neut = background radiation (µGy/h, µSv/h).
ENVS = {
    "ISS": {"where": "Low Earth orbit, inside the magnetosphere", "gravity": "microgravity", "g": 0.0, "delay_s": 0.5, "dose": ISS_DOSE_UGYH, "neut": 6.0},
    "ISS EVA": {"where": "Spacewalk outside the ISS", "gravity": "microgravity", "g": 0.0, "delay_s": 0.5, "dose": ISS_DOSE_UGYH, "neut": 6.0},
    "Earth entry": {"where": "Capsule re-entry to Earth after a long stay in microgravity", "gravity": "microgravity → up to 6.5 G → 1 g", "g": 0.0, "delay_s": 0.5, "dose": ISS_DOSE_UGYH, "neut": 6.0},
    "Lunar return": {"where": "Orion skip entry to Earth on the way back from the Moon", "gravity": "microgravity → up to 7 G → 1 g", "g": 0.0, "delay_s": 0.5, "dose": ISS_DOSE_UGYH, "neut": 6.0},
    "Lunar base": {"where": "Lunar south-pole surface habitat, no magnetosphere", "gravity": "0.17 g", "g": 0.17, "delay_s": 1.3, "dose": 13, "neut": 7.5},
    "Lunar lander": {"where": "Human landing system, final descent to the lunar surface", "gravity": "0.17 g", "g": 0.17, "delay_s": 1.3, "dose": 13, "neut": 7.5},
    "Lunar rover": {"where": "Pressurised rover traverse on the Moon", "gravity": "0.17 g", "g": 0.17, "delay_s": 1.3, "dose": 13, "neut": 7.5},
    "Lunar EVA": {"where": "Moonwalk from the lunar base", "gravity": "0.17 g", "g": 0.17, "delay_s": 1.3, "dose": 13, "neut": 7.5},
    "Mars base": {"where": "Mars surface habitat; thin CO2 atmosphere shields part of the radiation", "gravity": "0.38 g", "g": 0.38, "delay_s": 720, "dose": 9, "neut": 7.0},
    "Mars EDL": {"where": "Mars entry, descent & landing after 7 months in microgravity", "gravity": "microgravity → up to 5.5 G → 0.38 g", "g": 0.0, "delay_s": 720, "dose": 20, "neut": 8.0},
    "Mars rover": {"where": "Pressurised rover traverse on Mars", "gravity": "0.38 g", "g": 0.38, "delay_s": 720, "dose": 9, "neut": 7.0},
    "Mars EVA": {"where": "Surface EVA from the Mars base", "gravity": "0.38 g", "g": 0.38, "delay_s": 720, "dose": 9, "neut": 7.0},
}
MISSIONS = [
    {"id": "ISS", "label": "ISS", "gravity": "µg", "g": 0.0, "delay_s": 0.5,
     "desc": "Low Earth orbit, 400 km. Microgravity, inside Earth's magnetic shield, ground contact in real time."},
    {"id": "Moon", "label": "Moon", "gravity": "0.17 g", "g": 0.17, "delay_s": 1.3,
     "desc": "Artemis lunar surface mission. One-sixth gravity, no magnetosphere, 1.3 s signal delay."},
    {"id": "Mars", "label": "Mars", "gravity": "0.38 g", "g": 0.38, "delay_s": 720,
     "desc": "Mars surface mission after a 7-month transit. Three-eighths gravity, crew deconditioned by microgravity, up to 24 min round-trip delay."},
]
# Resting cardiovascular load rises with gravity (hydrostatic gradient partly restored vs microgravity).
# Per 1 g, illustrative; after Buckey 2006 (Space Physiology) and Norsk 2020 (µg fluid shift).
GRAV_ADJ = {"HR": 10, "SBP": 8, "DBP": 5, "RSO2": -3}


def ramp(t, t0, t1):
    """Smooth 0->1 transition between t0 and t1."""
    if t <= t0:
        return 0.0
    if t >= t1:
        return 1.0
    x = (t - t0) / (t1 - t0)
    return x * x * (3 - 2 * x)


def pulse(t, t0, t1, rise=10):
    return ramp(t, t0, t0 + rise) - ramp(t, t1 - rise, t1)


class AR1:
    def __init__(self, rng, sigma, phi):
        self.rng, self.sigma, self.phi, self.x = rng, sigma, phi, 0.0

    def __call__(self):
        self.x = self.phi * self.x + math.sqrt(1 - self.phi ** 2) * self.rng.gauss(0, self.sigma)
        return self.x


# ---------------------------------------------------------------- scenarios
# Each scenario returns (deltas: dict of signal -> value (absolute where noted), label, phase)

def sc_nominal(t, st):
    task = pulse(t, 300, 480, 40)  # routine payload task
    return {"HR": 5 * task, "EEG_WL": 0.15 * task, "GSR": 0.6 * task}, "nominal", st["p"].get("task", "payload task") if task > 0.05 else "routine"


def sc_fatigue(t, st):
    c = st["c"]
    sh = c.get("fat_shift", 0)                 # individual sleep pressure: drowsy earlier (<0) or later (>0)
    d = ramp(t, st["p"].get("onset", 60) + sh, 780 + sh)
    mss = [ms + sh for ms in (655, 735, 805, 860)]
    out = {"EEG_FI": 1.05 * d * c.get("fat", 1.0), "EEG_WL": -0.3 * d, "HR": -8 * d, "RMSSD": 14 * d, "GSR": -2.2 * d,
           "RR": -2 * d, "SBP": -4 * d, "DBP": -3 * d, "RSO2": -2 * d}
    nod = 0
    if d > 0.55:
        nod = 1 if st["rng"].random() < 0.04 + 0.12 * (d - 0.55) else 0
    for ms in mss:  # microsleep episodes (3-6 s)
        if ms <= t < ms + 5:
            out["EEG_FI"] += 1.0
            nod = 1
    st["nods"].append(nod)
    out["NOD"] = ("abs", sum(st["nods"][-60:]))
    label = "nominal" if d < 0.35 else ("drowsy" if not any(ms <= t < ms + 5 for ms in mss) else "microsleep")
    phase = st["p"].get("phase", "monotonous robotic-arm monitoring, night shift")
    return out, label, phase


def sc_overload(t, st):
    w = (ramp(t, 100, 380) - ramp(t, 660, 800)) * st["c"].get("cog", 1.0)  # same task, individual mental load
    out = {"EEG_WL": 0.95 * w, "HR": 30 * w, "RMSSD": -27 * w, "GSR": 7.5 * w, "SBP": 19 * w,
           "DBP": 11 * w, "RR": 6 * w, "RSO2": 3 * w, "EEG_FI": -0.2 * w}
    label = "nominal" if w < 0.35 else "cognitive_overload"
    phase = st["p"].get("busy", "rendezvous & docking with multiple malfunctions") if w > 0.05 else st["p"].get("calm", "pre-docking checklist")
    return out, label, phase


def sc_hypoxia(t, st):
    leak = ramp(t, 120, 620)
    recover_p = ramp(t, 760, 900)
    pcab = 101.3 - 39 * leak + 25 * recover_p
    ppo2 = 21.3 * pcab / 101.3
    md = st["c"].get("mask_dt", 0)            # when this crew member gets the O2 mask on
    mask = ramp(t, 690 + md, 720 + md)
    s0 = st["c"].get("spo2_0", 98)
    spo2_air = s0 - 1.75 * st["c"].get("hyp", 1.0) * max(0.0, 20.5 - ppo2) ** 1.12
    spo2 = spo2_air + (99 - spo2_air) * mask
    st["spo2"] = st.get("spo2", s0) + (spo2 - st.get("spo2", s0)) / 8  # body lag
    s = st["spo2"]
    deficit = max(0.0, s0 - s)
    out = {"PCAB": ("abs", pcab), "PPO2": ("abs", ppo2), "SPO2": ("abs", s), "HR": 1.3 * deficit,
           "RR": 0.45 * deficit, "RSO2": -1.15 * deficit, "EEG_FI": 0.05 * deficit,
           "EEG_WL": 0.03 * deficit, "GSR": 0.15 * deficit, "SBP": 0.5 * deficit}
    if s >= 94:
        label = "nominal"
    elif s >= 90:
        label = "mild_hypoxia"
    else:
        label = "hypoxia"
    phase = ("slow cabin leak (undetected)" if t < 690 + md else "O2 mask on, leak isolated") if t >= 120 else st["p"].get("calm", "cruise")
    return out, label, phase


def sc_gloc(t, st):
    p = st["p"]
    b, k, tol, gf = p.get("base", 3.2), p.get("k", 1.0), p.get("tol", 1.0), p.get("gf", 1.0)
    g = 0.0
    g += b * ramp(t, 120, 200)                         # sustained entry load
    g += 1.6 * k * pulse(t, 380, 500, 20)              # steep-entry / abort manoeuvre
    g += 1.4 * k * pulse(t, 430, 470, 8)               # peak
    g -= (b - gf) * ramp(t, 540, 620)                  # deceleration ends -> surface gravity
    g += 0.25 * math.sin(t / 7.0) * ramp(t, 120, 200) * (1 - ramp(t, 540, 620))
    gz = max(g, 0.0)
    # deconditioned crews (long microgravity) tolerate less G: tol > 1 steepens the brain-O2 fall
    r0 = st["c"].get("rso2_0", 70)
    target = r0 - 2.6 * tol * st["c"].get("gtol", 1.0) * max(0.0, gz - 1.0) ** 1.3
    st["r"] = st.get("r", r0) + (target - st.get("r", r0)) / 6.0
    r = st["r"]
    drop = r0 - r
    aloc = r < 50
    out = {"GZ": ("abs", gz), "RSO2": ("abs", r), "HR": 9 * max(0.0, gz - 1) + (12 if gz > 1.5 else 0),
           "SBP": 6 * max(0.0, gz - 1), "DBP": 3 * max(0.0, gz - 1), "RR": 1.5 * max(0.0, gz - 1),
           "GSR": 0.6 * max(0.0, gz - 1), "EEG_FI": 0.06 * drop + (0.9 if aloc else 0),
           "EEG_WL": 0.05 * max(0.0, gz - 1), "VMIS": 4 * max(0.0, gz - 2)}
    if aloc:
        label = "A-LOC (G-LOC precursor)"
    elif gz > 4.5 or r < 57:
        label = "high_G_risk"
    elif gz > 1.5:
        label = "high_G"
    else:
        label = "nominal"
    phase = p.get("entry", "entry / launch-abort profile") if t >= 120 else "pre-entry"
    if t >= 620:
        phase = p.get("after", "after splashdown (1 G)")
    return out, label, phase


def sc_disorientation(t, st):
    m = (ramp(t, 250, 330) - ramp(t, 600, 680)) * st["p"].get("amp", 1.0)
    burst = 0.0
    if m > 0.2:
        burst = 25 * max(0.0, math.sin(t / 9.0)) ** 3
    vmis = (35 * m + burst) * st["c"].get("vest", 1.0)   # individual motion-sickness susceptibility
    out = {"VMIS": vmis, "HR": 16 * m, "GSR": 5.5 * m, "RR": 4 * m, "EEG_WL": 0.35 * m,
           "RMSSD": -12 * m, "GZ": ("abs", max(0.0, st["g"] + 0.15 * math.sin(t / 3.0) * m)),
           "SBP": 6 * m, "TEMP": -0.1 * m}
    label = "nominal" if vmis < 15 else ("disorientation_risk" if vmis < 30 else "spatial_disorientation")
    phase = st["p"].get("phase", "pressurised rover traverse over crater rim (Mars 0.38 G)")
    return out, label, phase


def sc_hypercapnia(t, st):
    f = ramp(t, 100, 840)
    c0 = BASE["CO2"]
    co2 = c0 + 7400 * f ** 1.3
    x = max(0.0, co2 - c0)  # response to the rise above the crew's usual (acclimatised) cabin level
    out = {"CO2": ("abs", co2), "RR": 0.0013 * x, "HR": 0.0016 * x, "SBP": 0.0011 * x, "DBP": 0.0007 * x,
           "EEG_FI": 0.00006 * x, "RSO2": 0.0005 * x, "EEG_WL": 0.00003 * x}
    label = "nominal" if co2 < 3950 else ("elevated_CO2" if co2 < 5300 else "hypercapnia")  # 3 / 4 mmHg
    phase = st["p"].get("phase", "CO2 scrubber (CDRA) failure") if t >= 100 else "nominal ECLSS"
    return out, label, phase


def sc_hypoglycaemia(t, st):
    ex = pulse(t, 100, 400, 40)
    fall = ramp(t, 150, 650)
    eat = ramp(t, 700, 880)
    g0 = st["c"].get("glu0", 92)
    glu = g0 - 40 * st["c"].get("glu_fall", 1.0) * fall + (33 + g0 - 92) * eat
    hypo = max(0.0, 70 - glu)
    out = {"GLU": ("abs", glu), "HR": 60 * ex + 1.0 * hypo + 12 * (1 - ex) * ramp(t, 380, 420) * (1 - eat),
           "RR": 8 * ex + 0.2 * hypo, "GSR": 3 * ex + 0.45 * hypo, "TEMP": 0.4 * ex - 0.02 * hypo,
           "EEG_FI": 0.025 * hypo, "EEG_WL": 0.02 * hypo, "RMSSD": -20 * ex - 0.6 * hypo, "SBP": 15 * ex}
    label = "nominal" if glu >= 70 else ("hypoglycaemia_L1" if glu >= 54 else "hypoglycaemia_L2")
    phase = st["p"].get("phase", "cycle ergometer (CEVIS) after skipped meal") if t < 400 else ("post-exercise" if t < 700 else "15 g fast carbs taken")
    return out, label, phase


def sc_fever(t, st):
    f = ramp(t, 60, 820)
    dt = 1.85 * f * st["c"].get("fever", 1.0)
    out = {"TEMP": dt, "HR": 10 * dt, "RR": 2.5 * dt, "RMSSD": -11 * dt, "GSR": 1.2 * dt,
           "EEG_FI": 0.12 * dt, "SBP": -2 * dt, "SPO2": -0.6 * dt}
    temp = st["c"].get("temp0", 36.8) + dt
    label = "nominal" if temp < 37.5 else ("subfebrile" if temp < 38.0 else "fever")
    phase = st["p"].get("phase", "viral reactivation (time-compressed: 15 min ≈ 12 h)")
    return out, label, phase


def sc_radiation(t, st):
    e, f = st["env"], st["p"].get("shield", 1.0)   # f = share of the event that reaches the habitat
    spe = (ramp(t, 200, 330) - 0.4 * ramp(t, 700, 900)) * f
    sd = st["c"].get("shelter_dt", 0)         # how long this crew member needs to reach the storm shelter
    shelter = ramp(t, 480 + sd, 520 + sd)
    dose = e["dose"] + 340 * spe * (1 - 0.72 * shelter)
    stress = ramp(t, 330, 380) * (1 - 0.6 * shelter) * min(1.0, 2 * f)
    neut = e["neut"] + 30 * spe * (1 - 0.6 * shelter)  # secondary neutrons produced in the hull / regolith
    out = {"DOSE": ("abs", dose), "NEUT": ("abs", neut), "HR": 9 * stress, "GSR": 2.5 * stress, "EEG_WL": 0.25 * stress,
           "RMSSD": -8 * stress}
    label = "nominal" if dose < 25 else ("elevated_radiation" if dose < 100 else "solar_particle_event")
    phase = "SPE alert" if t < 480 + sd else "in the storm shelter"
    if t < 200:
        phase = st["p"].get("calm", "deep-space cruise")
    return out, label, phase


def sc_eva(t, st):
    # time-compressed spacewalk (15 min ≈ 6.5 h)
    p = st["p"]
    hab, fn2, pre = p.get("hab", 101.3), p.get("fn2", 0.79), st["c"].get("pre", p.get("pre", 0.62))
    dep = ramp(t, 90, 150)                    # suit depressurisation hab -> 29.6 kPa
    bump = ramp(t, 470, 500)                  # variable-pressure suit raised to 41.4 kPa
    rep = ramp(t, 700, 760)                   # back in the airlock, repressurised
    psuit = hab - (hab - 29.6) * dep + 11.8 * bump
    psuit += (hab - psuit) * rep
    # N2 left in the 360-min tissue after a prebreathe cut short; slow washout on pure O2
    tissue = fn2 * hab * pre * math.exp(-max(0, t - 150) / 4000)
    tr = tissue / psuit
    work = pulse(t, 160, 690, 30) * p.get("work", 1.0)
    pain = pulse(t, 420, 500, 15) * st["c"].get("pain", 1)  # knee pain reported until the pressure bump
    out = {"PSUIT": ("abs", psuit), "TR": ("abs", tr), "GZ": ("abs", st["g"]), "HR": 28 * work + 10 * pain, "RR": 6 * work,
           "TEMP": 0.5 * work, "GSR": 2.5 * work + 3 * pain, "EEG_WL": 0.25 * work,
           "RMSSD": -14 * work - 6 * pain, "SBP": 10 * work, "DBP": 4 * work}
    if pain > 0.3:
        label = "dcs_symptoms"
    elif tr > 1.65:
        label = "dcs_high_risk"
    elif tr > 1.4:
        label = "dcs_risk"
    else:
        label = "nominal"
    if t < 90:
        phase = p.get("pre_txt", "airlock: O2 prebreathe cut short by 40 min (timeline slip)")
    elif t < 150:
        phase = "suit depressurisation to 29.6 kPa (4.3 psi)"
    elif t < 420:
        phase = p.get("task", "EVA: truss maintenance")
    elif t < 470:
        phase = "reports knee pain" if st["c"].get("pain", 1) else "EV partner reports knee pain; stays close"
    elif t < 700:
        phase = ("suit pressure raised to 41.4 kPa (6 psi); EVA terminated, return to airlock" if st["c"].get("pain", 1)
                 else "EVA terminated for the partner; escorts them back to the airlock")
    else:
        phase = "airlock repressurisation"
    return out, label, phase


def sc_thermal(t, st):
    p = st["p"]
    h = ramp(t, 120, 640) * (1 - ramp(t, 700, 880))  # pump / heater failure until the backup loop is online
    if p.get("cold"):
        # Martian night (-80 °C outside): heater bus fails, cabin cools
        cabt = 22.5 - 9.5 * h
        rh = 45 - 12 * h
        spl = 56.0
        cold = max(0.0, 20 - cabt) * st["c"].get("heat", 1.0)
        out = {"CABT": ("abs", cabt), "RH": ("abs", rh), "SPL": ("abs", spl), "TEMP": -0.07 * cold,
               "HR": 1.6 * cold, "RR": 0.3 * cold, "GSR": -0.15 * cold, "SBP": 1.5 * cold, "DBP": 1.0 * cold,
               "RMSSD": -1.2 * cold, "EEG_FI": 0.04 * cold}
        if cabt < 15:
            label = "cold_cabin"
        elif cabt < 18:
            label = "cool_cabin"
        else:
            label = "nominal"
        phase = "nominal ECLSS" if t < 120 else ("night: heater bus failure, outside -80 °C" if t < 700 else "backup heaters online")
        return out, label, phase
    k = p.get("k", 1.0)                                # lunar day: hotter radiator sink
    cabt = 22.5 + 9.0 * k * h
    rh = 45 + 35 * h
    spl = 56 + 15 * ramp(t, 130, 170) * (1 - ramp(t, 700, 760))  # portable fans at maximum speed
    heat = max(0.0, cabt - 25) * st["c"].get("heat", 1.0)
    out = {"CABT": ("abs", cabt), "RH": ("abs", rh), "SPL": ("abs", spl), "TEMP": 0.12 * heat,
           "HR": 2.2 * heat, "RR": 0.5 * heat, "GSR": 0.9 * heat, "RMSSD": -2 * heat,
           "EEG_FI": 0.05 * heat, "SBP": -1.2 * heat}
    if cabt > 30:
        label = "heat_stress"
    elif cabt > 27 or rh > 75:
        label = "warm_humid_cabin"
    elif spl > 67:
        label = "noise_exposure"
    else:
        label = "nominal"
    phase = "nominal ECLSS" if t < 120 else (p.get("fail", "thermal-control loop pump failure, fans at maximum") if t < 700 else "backup coolant loop online")
    return out, label, phase


# One entry per scenario; each mission gets its own version (title, environment, description, parameters).
# ISS versions keep the original ids so existing references stay valid; Moon/Mars ids are prefixed.
LUNAR_HAB = {"hab": 70.3, "fn2": 0.735, "pre": 0.92, "work": 1.3}   # 70.3 kPa / 26.5 % O2 habitat
SCENARIOS = [
    ("nominal", sc_nominal, {
        "ISS": ("Nominal day on station", "ISS", "Routine operations with a short payload task. Use it to learn the normal ranges.", {}),
        "Moon": ("Nominal day at the lunar base", "Lunar base", "Routine work in 0.17 g. Heart rate and blood pressure sit a little higher than on the ISS because gravity pulls blood towards the legs again; background radiation is higher without a magnetosphere.", {"task": "sample processing in the glovebox"}),
        "Mars": ("Nominal sol at the Mars base", "Mars base", "Routine work in 0.38 g. The cardiovascular system carries more load than in orbit; ground support is 12 minutes away.", {"task": "greenhouse maintenance"}),
    }),
    ("fatigue_microsleep", sc_fatigue, {
        "ISS": ("Fatigue → microsleep", "ISS", "Night-shift robotic-arm monitoring. EEG slowing rises minutes before head nods and microsleeps.", {}),
        "Moon": ("Fatigue → microsleep", "Lunar base", "Lunar night: 14 days of darkness blur the sleep–wake rhythm. EEG slowing rises minutes before head nods and microsleeps.", {"phase": "lunar night, long rover-telemetry watch"}),
        "Mars": ("Fatigue → microsleep (sol shift)", "Mars base", "The 24 h 39 min Martian sol keeps shifting the schedule; drowsiness starts earlier than on the ISS.", {"onset": 20, "phase": "late sol after a schedule shift (24 h 39 min day)"}),
    }),
    ("cognitive_overload", sc_overload, {
        "ISS": ("Cognitive overload", "ISS", "Docking of a visiting vehicle with multiple malfunctions: workload index, HR, BP and skin conductance rise; HRV falls.", {}),
        "Moon": ("Cognitive overload (manual landing)", "Lunar lander", "Final descent with a failed landing sensor: the commander flies the last 500 m by hand among boulders.", {"busy": "manual landing, landing radar failed", "calm": "powered descent, automatic mode"}),
        "Mars": ("Cognitive overload (medical emergency, no ground help)", "Mars base", "A crewmate is injured; with a 24-min round trip the crew handles the emergency alone.", {"busy": "crewmate injury handled without ground support", "calm": "routine sol"}),
    }),
    ("hypoxia_leak", sc_hypoxia, {
        "ISS": ("Hypoxia (slow cabin leak)", "ISS", "Undetected depressurisation: ppO2, SpO2 and brain oxygenation fall; crew dons O2 mask at 11:30.", {"calm": "routine operations"}),
        "Moon": ("Hypoxia (slow habitat leak)", "Lunar base", "Abrasive lunar dust wears a hatch seal: slow leak, ppO2, SpO2 and brain oxygenation fall; crew dons O2 mask at 11:30.", {"calm": "routine operations"}),
        "Mars": ("Hypoxia (slow habitat leak)", "Mars base", "A cracked seal in the cold Martian night leaks air; ppO2, SpO2 and brain oxygenation fall; crew dons O2 mask at 11:30.", {"calm": "routine operations"}),
    }),
    ("gloc_high_g", sc_gloc, {
        "ISS": ("High-G / G-LOC precursor", "Earth entry", "Return to Earth after 6 months on the ISS, with an abort-profile load peak: brain oxygenation (fNIRS) falls with sustained +Gz.", {}),
        "Moon": ("High-G / G-LOC precursor", "Lunar return", "Orion returns from the Moon at 11 km/s; the skip entry peaks higher than an ISS return.", {"k": 1.2, "entry": "lunar-return skip entry"}),
        "Mars": ("High-G / G-LOC precursor (deconditioned crew)", "Mars EDL", "Mars entry after 7 months in microgravity: the peak G is lower than an Earth entry, but deconditioning lowers G tolerance, so brain oxygen still falls fast.", {"base": 2.6, "k": 0.8, "tol": 1.35, "gf": 0.38, "entry": "Mars entry, descent & landing", "after": "on the surface (0.38 g)"}),
    }),
    ("spatial_disorientation", sc_disorientation, {
        "ISS": ("Spatial disorientation", "ISS", "Visual reorientation illusion when moving between modules with different 'up' directions; weaker than on a planetary surface.", {"amp": 0.75, "phase": "translation between modules with different 'up' orientation"}),
        "Moon": ("Spatial disorientation", "Lunar rover", "Rover traverse in 0.17 g: weak gravity cues and long shadows make tilt and slope hard to judge.", {"amp": 0.9, "phase": "pressurised rover traverse across a crater rim (0.17 G)"}),
        "Mars": ("Spatial disorientation", "Mars rover", "Rover traverse soon after landing: the inner ear is still adapting from 7 months of microgravity to 0.38 g.", {"phase": "pressurised rover traverse over crater rim (Mars 0.38 G)"}),
    }),
    ("hypercapnia_scrubber", sc_hypercapnia, {
        "ISS": ("CO2 build-up (scrubber failure)", "ISS", "CO2 removal (CDRA) fails; respiration, HR and BP rise, drowsiness/headache markers follow.", {}),
        "Moon": ("CO2 build-up (scrubber failure)", "Lunar base", "Lunar dust clogs the CO2 scrubber; respiration, HR and BP rise, drowsiness/headache markers follow.", {"phase": "CO2 scrubber clogged by lunar dust"}),
        "Mars": ("CO2 build-up (scrubber failure)", "Mars base", "CO2 scrubber fails with no resupply possible; respiration, HR and BP rise, drowsiness/headache markers follow.", {"phase": "CO2 scrubber failure"}),
    }),
    ("hypoglycaemia", sc_hypoglycaemia, {
        "ISS": ("Hypoglycaemia after exercise", "ISS", "Exercise after a skipped meal; glucose falls below 70 then 54 mg/dL, recovers after 15 g carbs.", {}),
        "Moon": ("Hypoglycaemia after exercise", "Lunar base", "Heavy shovelling of regolith after a skipped meal; glucose falls below 70 then 54 mg/dL, recovers after 15 g carbs.", {"phase": "regolith shovelling for shielding after a skipped meal"}),
        "Mars": ("Hypoglycaemia after exercise", "Mars base", "Treadmill session in 0.38 g after a skipped meal; glucose falls below 70 then 54 mg/dL, recovers after 15 g carbs.", {"phase": "treadmill in 0.38 g after a skipped meal"}),
    }),
    ("fever_infection", sc_fever, {
        "ISS": ("Fever / immune response", "ISS", "Latent virus reactivation (time-compressed): temperature, HR and respiration rise, HRV falls.", {}),
        "Moon": ("Fever / immune response", "Lunar base", "Latent virus reactivation (time-compressed); evacuation to Earth would take about 3 days.", {}),
        "Mars": ("Fever / immune response", "Mars base", "Latent virus reactivation (time-compressed); no evacuation possible, the Crew Medical Officer treats on site.", {}),
    }),
    ("solar_particle_event", sc_radiation, {
        "ISS": ("Solar particle event (magnetosphere shields)", "ISS", "The same solar storm seen from the ISS: Earth's magnetic field deflects most protons, so the dose rate rises only to the caution band.", {"shield": 0.2, "calm": "routine operations"}),
        "Moon": ("Solar particle event", "Lunar base", "No magnetosphere: the full proton storm reaches the surface; crew moves to the storm shelter and dose rate drops.", {"calm": "surface operations"}),
        "Mars": ("Solar particle event (thin atmosphere)", "Mars base", "Mars' thin atmosphere absorbs part of the storm; dose still exceeds the alert limit, crew shelters.", {"shield": 0.35, "calm": "surface operations"}),
    }),
    ("eva_dcs", sc_eva, {
        "ISS": ("EVA: decompression sickness risk", "ISS EVA", "Spacewalk after a shortened O2 prebreathe: tissue N2 ratio is high at 29.6 kPa suit pressure; a suit pressure bump resolves it.", {}),
        "Moon": ("Moonwalk: decompression sickness risk", "Lunar EVA", "Habitat at 70.3 kPa (26.5 % O2) shortens prebreathe, but walking in 0.17 g works the joints harder than floating, and the prebreathe was skipped.",
                 dict(LUNAR_HAB, task="EVA: geology traverse on foot (0.17 g)", pre_txt="airlock at 70.3 kPa: prebreathe skipped (timeline slip)")),
        "Mars": ("Mars EVA: decompression sickness risk", "Mars EVA", "Habitat at 70.3 kPa; walking in 0.38 g is heavy work in the suit and the prebreathe was skipped.",
                 dict(LUNAR_HAB, work=1.45, task="EVA: drilling and core sampling on foot (0.38 g)", pre_txt="airlock at 70.3 kPa: prebreathe skipped (timeline slip)")),
    }),
    ("thermal_failure", sc_thermal, {
        "ISS": ("Cabin heat & humidity (thermal-control failure)", "ISS", "Coolant pump fails: cabin temperature, humidity and fan noise rise; heart rate and body temperature follow.", {}),
        "Moon": ("Cabin heat (lunar day, radiator failure)", "Lunar base", "At lunar noon the surface reaches +120 °C; a radiator pump fails and the cabin heats faster than on the ISS.", {"k": 1.2, "fail": "lunar noon: radiator pump failure, fans at maximum"}),
        "Mars": ("Cold cabin (heater failure at night)", "Mars base", "Night at −80 °C outside: the heater bus fails and the cabin cools; shivering raises heart rate and blood pressure.", {"cold": True}),
    }),
]


def gen_live(sid, fn, seed, env="ISS", params=None, crew=None, run=None):
    rng = random.Random(seed)
    e = ENVS[env]
    cl = dict(CREW_LIVE.get(crew, {}))
    cl.update(run or {})
    shift = cl.get("shift", 0)
    noise = {k: AR1(rng, s, p) for k, (s, p) in NOISE.items()}
    rng2 = random.Random(seed + 500)
    noise.update({k: AR1(rng2, s, p) for k, (s, p) in NOISE2.items()})
    st = {"rng": rng, "nods": [], "env": e, "g": e["g"], "p": params or {}, "c": cl}
    local = {"GZ": e["g"], "DOSE": e["dose"], "NEUT": e["neut"]}
    local.update({k: cl[k] for k in PERSONAL if k in cl})
    rows = []
    for t in range(DUR):
        d, label, phase = fn(t - shift, st)
        row = {"t": t}
        for c in LIVE_COLS:
            v = d.get(c, 0.0)
            if isinstance(v, tuple):
                val = v[1]
            elif BASE[c] is None:
                row[c] = None
                continue
            else:
                val = local.get(c, BASE[c]) + v * cl.get(GAIN.get(c), 1.0) + GRAV_ADJ.get(c, 0) * e["g"]
            if c in noise:
                n = noise[c]()
                if c == "RMSSD":
                    n *= max(0.3, val / 45)
                val += n
            row[c] = val
        # physical limits
        row["SPO2"] = min(100.0, row["SPO2"])
        row["RMSSD"] = max(5.0, row["RMSSD"])
        row["GSR"] = max(0.2, row["GSR"])
        row["VMIS"] = max(0.0, row["VMIS"])
        row["CO"] = max(0.0, row["CO"])
        row["DOSE"] = max(0.0, row["DOSE"])
        row["NOD"] = max(0, row["NOD"])
        row["NEUT"] = max(0.0, row["NEUT"])
        for c in LIVE_COLS:
            if row[c] is None:
                continue
            row[c] = round(row[c], DEC[c])
            if DEC[c] == 0:
                row[c] = int(row[c])
        row["label"] = label
        row["phase"] = phase
        rows.append(row)
    return rows


# ---------------------------------------------------------------- daily log
CREW = [
    {"id": "A", "name": "Crew A (Commander)", "age": 46, "sex": "F", "mass": 62.0, "rhr": 58, "sbp": 112, "dbp": 70, "rmssd": 52, "glu": 86, "sleep": 7.2, "pvt": 245},
    {"id": "B", "name": "Crew B (Pilot)", "age": 41, "sex": "M", "mass": 79.0, "rhr": 62, "sbp": 121, "dbp": 77, "rmssd": 41, "glu": 92, "sleep": 6.9, "pvt": 255},
    {"id": "C", "name": "Crew C (Flight Engineer)", "age": 38, "sex": "M", "mass": 84.5, "rhr": 55, "sbp": 118, "dbp": 72, "rmssd": 60, "glu": 89, "sleep": 7.0, "pvt": 238},
    {"id": "D", "name": "Crew D (Mission Specialist)", "age": 34, "sex": "F", "mass": 58.5, "rhr": 64, "sbp": 108, "dbp": 68, "rmssd": 48, "glu": 84, "sleep": 7.4, "pvt": 250},
]
DAYS = 60

# Live-stream profile of each crew member: resting baselines and how strongly they react.
# Gains are illustrative individual differences (fitness, sleep need, motion-sickness and hypoxia
# susceptibility); every crew member gets their own sensor-noise seed too.
CREW_LIVE = {
    "A": {"HR": 64, "SBP": 113, "DBP": 72, "RMSSD": 48, "GLU": 92, "TEMP": 36.8, "SPO2": 98.2, "RR": 13.5, "RSO2": 69, "GSR": 3.4,
          "hr": 0.9, "gsr": 0.9, "hrv": 0.95, "bp": 1.0, "rr": 0.95, "fat_shift": 20, "fat": 0.95, "hyp": 1.1, "gtol": 1.05,
          "vest": 0.8, "glu_fall": 0.9, "fever": 1.0, "heat": 1.1, "cog": 0.95,
          "trait": "experienced, calm under pressure; slightly more sensitive to low oxygen and heat"},
    "B": {"HR": 68, "SBP": 121, "DBP": 78, "RMSSD": 40, "GLU": 98, "TEMP": 36.8, "SPO2": 97.8, "RR": 14.5, "RSO2": 71, "GSR": 4.6,
          "hr": 1.15, "gsr": 1.2, "hrv": 1.1, "bp": 1.2, "rr": 1.05, "fat_shift": -30, "fat": 1.1, "hyp": 1.0, "gtol": 0.85,
          "vest": 1.15, "glu_fall": 1.1, "fever": 1.1, "heat": 1.0, "cog": 1.1,
          "trait": "test pilot, trained in anti-G straining (better G tolerance); strong stress and blood-pressure response, tires earlier"},
    "C": {"HR": 60, "SBP": 117, "DBP": 72, "RMSSD": 56, "GLU": 95, "TEMP": 36.7, "SPO2": 98.4, "RR": 13.0, "RSO2": 72, "GSR": 3.0,
          "hr": 0.85, "gsr": 0.8, "hrv": 0.85, "bp": 0.9, "rr": 0.9, "fat_shift": 30, "fat": 0.9, "hyp": 0.9, "gtol": 1.0,
          "vest": 1.0, "glu_fall": 0.8, "fever": 0.9, "heat": 0.85, "cog": 0.85,
          "trait": "endurance athlete: low resting heart rate, small heart-rate rise, resists fatigue and heat"},
    "D": {"HR": 70, "SBP": 108, "DBP": 69, "RMSSD": 45, "GLU": 90, "TEMP": 36.9, "SPO2": 97.9, "RR": 14.5, "RSO2": 68, "GSR": 4.2,
          "hr": 1.1, "gsr": 1.1, "hrv": 1.05, "bp": 1.0, "rr": 1.05, "fat_shift": -50, "fat": 1.15, "hyp": 1.05, "gtol": 1.05,
          "vest": 1.25, "glu_fall": 1.2, "fever": 1.0, "heat": 1.0, "cog": 1.1,
          "trait": "first flight: prone to motion sickness, needs more sleep, glucose drops faster after exercise"},
}
for _c in CREW_LIVE.values():
    _c.update({"spo2_0": _c["SPO2"], "rso2_0": _c["RSO2"], "glu0": _c["GLU"], "temp0": _c["TEMP"]})
# personal (body) channels differ per crew member; cabin, suit and radiation channels are shared
PERSONAL = ["HR", "RMSSD", "SBP", "DBP", "SPO2", "RR", "TEMP", "GLU", "EEG_FI", "EEG_WL", "RSO2", "GSR", "NOD", "VMIS",
            "GZ", "TR", "PSUIT", "DOSE", "NEUT"]

# Who is affected by what, per mission. Personal events (fatigue, workload, motion sickness, low glucose,
# infection, spacewalk) hit only some crew members, at their own time; the others have a normal day (None).
# Shared-cabin events (leak, CO2, solar storm, heat, entry G) reach everyone at once, but each person reacts
# differently and takes their own time to get the mask on or reach the shelter.
# Entry: (overrides, role text). shift = seconds the personal event starts later (+) or earlier (-).
N = None
CAST = {
    "ISS": {
        "nominal": {"A": ({"shift": 0}, "payload experiment"), "B": ({"shift": 200}, "maintenance task later in the shift"),
                    "C": ({"shift": -150}, "early exercise session"), "D": ({"shift": 100}, "Earth-observation photography")},
        "fatigue_microsleep": {"A": (N, "slept well, day shift: not affected"), "B": ({"fat_shift": -40}, "night shift at the robotic-arm console"),
                               "C": (N, "off duty, asleep in crew quarters: not affected"), "D": ({"fat_shift": -120, "fat": 1.2}, "second night shift in a row: tires early")},
        "cognitive_overload": {"A": ({"cog": 1.1}, "flies the docking approach"), "B": ({"cog": 0.8, "shift": 60}, "supports with the checklists, gets busy later"),
                               "C": (N, "working in the Japanese module: not affected"), "D": (N, "asleep: not affected")},
        "hypoxia_leak": {"A": ({"mask_dt": -40}, "notices first and dons the mask early"), "B": ({}, "dons the mask on the alarm"),
                         "C": ({"mask_dt": 30}, "finishes a task before the mask"), "D": ({"mask_dt": 70, "hyp": 1.2}, "asleep when the leak starts: masks up late")},
        "gloc_high_g": {"A": ({}, "commander seat"), "B": ({}, "pilot seat, strains well"), "C": ({}, "mission-specialist seat"), "D": ({}, "first flight, mission-specialist seat")},
        "spatial_disorientation": {"A": (N, "not affected"), "B": (N, "not affected"),
                                   "C": ({"vest": 0.9, "shift": -60}, "moves cargo through the node"), "D": ({"vest": 1.3, "shift": 80}, "first days on station: space motion sickness")},
        "hypercapnia_scrubber": {"A": ({}, "in the lab"), "B": ({"cog": 1.0}, "sleeps near the scrubber"), "C": ({}, "in the lab"), "D": ({}, "exercising")},
        "hypoglycaemia": {"A": (N, "ate breakfast: not affected"), "B": (N, "not affected"),
                          "C": ({"glu_fall": 0.55, "shift": 90}, "short workout, small dip only"), "D": ({"glu_fall": 1.2, "shift": -30}, "skipped breakfast, long ergometer session")},
        "fever_infection": {"A": (N, "healthy"), "B": ({"fever": 0.45, "shift": 150}, "mild symptoms later (same virus)"),
                            "C": ({"fever": 1.05, "shift": -100}, "reactivated virus: fever"), "D": (N, "healthy")},
        "solar_particle_event": {"A": ({"shelter_dt": 0}, "reaches the shelter on time"), "B": ({"shelter_dt": 60}, "secures an experiment first"),
                                 "C": ({"shelter_dt": -30}, "already near the shelter"), "D": ({"shelter_dt": 120}, "in the farthest module")},
        "eva_dcs": {"A": (N, "inside, EVA coordinator: not affected"), "B": ({"pain": 1}, "EV1 on the spacewalk: knee pain"),
                    "C": ({"pain": 0, "pre": 0.5}, "EV2 on the spacewalk: full prebreathe, no symptoms"), "D": (N, "inside, robotic-arm operator: not affected")},
        "thermal_failure": {"A": ({}, "in the hottest module"), "B": ({}, "troubleshoots the pump"), "C": ({"heat": 0.7}, "in the coolest module"), "D": ({}, "in the hottest module")},
    },
    "Moon": {
        "nominal": {"A": ({"shift": 120}, "sample processing"), "B": ({"shift": -100}, "rover maintenance"),
                    "C": ({"shift": 0}, "habitat check-out"), "D": ({"shift": 250}, "science briefing")},
        "fatigue_microsleep": {"A": ({"fat_shift": -60}, "long telemetry watch in the lunar night"), "B": (N, "asleep: not affected"),
                               "C": ({"fat_shift": 100}, "evening shift, tires late"), "D": (N, "rested: not affected")},
        "cognitive_overload": {"A": ({"cog": 1.15}, "commander, flies the landing by hand"), "B": ({"cog": 1.0, "shift": 20}, "pilot, calls out altitude and fuel"),
                               "C": ({"cog": 0.12}, "passenger: watches, light load"), "D": ({"cog": 0.12}, "passenger: watches, light load")},
        "hypoxia_leak": {"A": ({"mask_dt": 20}, "in the airlock"), "B": ({"mask_dt": -30}, "next to the leaking hatch, masks first"),
                         "C": ({}, "in the lab"), "D": ({"mask_dt": 60}, "asleep when it starts")},
        "gloc_high_g": {"A": ({}, "commander seat"), "B": ({}, "pilot seat"), "C": ({}, "crew seat"), "D": ({}, "crew seat")},
        "spatial_disorientation": {"A": (N, "in the habitat: not affected"), "B": ({"vest": 1.1}, "drives the rover"),
                                   "C": (N, "in the habitat: not affected"), "D": ({"vest": 1.3, "shift": 40}, "rover passenger, motion sick")},
        "hypercapnia_scrubber": {"A": ({}, "in the habitat"), "B": ({}, "in the habitat"), "C": ({"heat": 1.0}, "sleeps next to the scrubber"), "D": ({}, "in the habitat")},
        "hypoglycaemia": {"A": (N, "not affected"), "B": ({"glu_fall": 1.1, "shift": -80}, "shovels regolith after a skipped meal"),
                          "C": ({"glu_fall": 0.45, "shift": 60}, "shovels regolith, ate before: small dip"), "D": (N, "not affected")},
        "fever_infection": {"A": ({"fever": 0.5, "shift": 200}, "mild symptoms late"), "B": (N, "healthy"), "C": (N, "healthy"),
                            "D": ({"fever": 1.0}, "infection: fever")},
        "solar_particle_event": {"A": ({"shelter_dt": 150}, "on a moonwalk, far from the shelter"), "B": ({}, "in the habitat"),
                                 "C": ({"shelter_dt": 20}, "in the habitat"), "D": ({"shelter_dt": 150}, "on a moonwalk, far from the shelter")},
        "eva_dcs": {"A": ({"pain": 0, "pre": 0.75}, "EV1 on the moonwalk: no symptoms"), "B": (N, "inside, coordinates: not affected"),
                    "C": (N, "inside: not affected"), "D": ({"pain": 1}, "EV2 on the moonwalk: knee pain")},
        "thermal_failure": {"A": ({}, "in the habitat"), "B": ({"heat": 1.2}, "fixes the radiator pump"), "C": ({}, "in the habitat"), "D": ({"heat": 0.8}, "in the shaded module")},
    },
    "Mars": {
        "nominal": {"A": ({"shift": -120}, "greenhouse"), "B": ({"shift": 150}, "rover check-out"),
                    "C": ({"shift": 50}, "medical check of the crew"), "D": ({"shift": 0}, "geology lab")},
        "fatigue_microsleep": {"A": (N, "rested: not affected"), "B": ({"fat_shift": -100}, "schedule shifted by the long sol"),
                               "C": ({"fat_shift": 20}, "late sol, tires late"), "D": ({"fat_shift": -60, "fat": 1.2}, "short sleep after the shift change")},
        "cognitive_overload": {"A": ({"cog": 1.1}, "leads the emergency, no ground help"), "B": ({"cog": 0.12}, "assists, light load"),
                               "C": ({"cog": 1.15, "shift": -30}, "medical officer treats the injured crewmate"), "D": (N, "the injured crewmate, sedated")},
        "hypoxia_leak": {"A": ({}, "in the habitat"), "B": ({"mask_dt": 40}, "asleep when it starts"), "C": ({"mask_dt": -40}, "near the cracked seal"), "D": ({}, "in the habitat")},
        "gloc_high_g": {"A": ({}, "commander seat"), "B": ({}, "pilot seat"), "C": ({}, "crew seat"), "D": ({}, "crew seat")},
        "spatial_disorientation": {"A": (N, "in the habitat: not affected"), "B": ({"vest": 1.2, "shift": -50}, "drives the rover"),
                                   "C": ({"vest": 1.0, "shift": 30}, "rover passenger"), "D": (N, "in the habitat: not affected")},
        "hypercapnia_scrubber": {"A": ({}, "in the habitat"), "B": ({}, "in the habitat"), "C": ({}, "in the habitat"), "D": ({}, "sleeps next to the scrubber")},
        "hypoglycaemia": {"A": ({"glu_fall": 1.0, "shift": 50}, "treadmill after a skipped meal"), "B": (N, "not affected"),
                          "C": (N, "not affected"), "D": (N, "not affected")},
        "fever_infection": {"A": (N, "healthy"), "B": ({"fever": 1.0, "shift": -60}, "infection: fever"), "C": (N, "healthy, treats the patient"),
                            "D": ({"fever": 0.5, "shift": 180}, "mild symptoms later")},
        "solar_particle_event": {"A": ({}, "in the habitat"), "B": ({"shelter_dt": 140}, "in the rover, drives back"),
                                 "C": ({"shelter_dt": 140}, "in the rover, drives back"), "D": ({"shelter_dt": -20}, "already in the shelter area")},
        "eva_dcs": {"A": (N, "inside, coordinates: not affected"), "B": ({"pain": 0}, "EV1 drilling: no symptoms"),
                    "C": ({"pain": 1}, "EV2 sampling: knee pain"), "D": (N, "inside: not affected")},
        "thermal_failure": {"A": ({}, "in the habitat"), "B": ({"heat": 1.2}, "outside the sleeping bag, repairs the heaters"),
                            "C": ({"heat": 0.8}, "in a warm sleeping bag"), "D": ({}, "in the habitat")},
    },
}
GAIN = {"HR": "hr", "GSR": "gsr", "RMSSD": "hrv", "SBP": "bp", "DBP": "bp", "RR": "rr"}
# baselines of the newer daily indicators (Standard Measures / ARCHeR / Immune Biomarkers style)
CREW2 = {"A": {"eff": 90, "kcal": 94, "uca": 175, "cort": 13.0},
         "B": {"eff": 88, "kcal": 92, "uca": 195, "cort": 15.0},
         "C": {"eff": 91, "kcal": 96, "uca": 185, "cort": 12.0},
         "D": {"eff": 89, "kcal": 93, "uca": 165, "cort": 14.0}}
EXAM_EVERY = 7  # weekly strength test and eye exam; the last result is carried forward

INJECTED = [
    {"crew": "A", "days": [18, 21], "type": "Sleep deprivation (docking ops shift)", "metrics": ["sleep_h", "sleep_eff", "work_h", "pvt_rt", "pvt_lapses", "mood", "stress", "cortisol"]},
    {"crew": "ALL", "days": [37, 44], "type": "Real ISS CO2 excursion (OSDR EDA RR-7, 20-27 Aug 2018)", "metrics": ["co2_avg"], "env": True, "real": True},
    {"crew": "B", "days": [37, 41], "type": "CO2-related headache and BP rise", "metrics": ["sbp", "dbp", "symptoms"]},
    {"crew": "C", "days": [40, 44], "type": "Fever / viral reactivation", "metrics": ["temp", "rhr", "rmssd", "sleep_h", "cortisol", "kcal_pct"]},
    {"crew": "D", "days": [25, 60], "type": "Progressive body-mass loss (low intake)", "metrics": ["mass_change", "kcal_pct", "exercise_min", "water_l", "strength_pct", "u_ca"]},
    {"crew": "B", "days": [42, 60], "type": "Early SANS sign (optic-disc swelling, Frisén grade 1)", "metrics": ["sans_grade"]},
    {"crew": "D", "days": [45, 60], "type": "Low mood / isolation", "metrics": ["mood", "stress", "team", "sleep_h", "cortisol"]},
    {"crew": "ALL", "days": [20, 20], "type": "Solar particle event (synthetic, added to the real ISS dose)", "metrics": ["dose_mGy"], "env": True},
    {"crew": "ALL", "days": [50, 56], "type": "Microbial growth in cabin air (condensate leak)", "metrics": ["microbe_cfu"], "env": True},
]


def in_win(day, a, b):
    return a <= day <= b


# Cabin environment of the 60-day log = 60 consecutive real ISS days (with data) from OSDR EDA mission RR-7,
# 13 Jul - 13 Sep 2018, so the real CO2 excursion of 20-27 Aug 2018 falls on mission days 37-44.
EDA_MISSION, EDA_EVENT, EDA_EVENT_DAY = "RR-7", "2018-08-20", 37


def real_env():
    with open(os.path.join(ROOT, "data", "real", f"osdr_eda_{EDA_MISSION}_daily.csv"), encoding="utf-8") as f:
        allrows = list(csv.DictReader(f))
    i0 = [r["date"] for r in allrows].index(EDA_EVENT) - (EDA_EVENT_DAY - 1)
    rows = allrows[i0:i0 + DAYS]
    assert i0 >= 0 and len(rows) == DAYS, "not enough real days"
    return rows


def gen_daily(seed=7):
    rng = random.Random(seed)
    r2 = random.Random(seed + 100)  # newer indicators; keeps the original columns unchanged
    rows = []
    env = real_env()
    co2_daily = [float(r["co2_ppm"]) for r in env]
    dose_daily = [float(r["total_mGy"]) for r in env]
    microbe_daily = []
    for day in range(1, DAYS + 1):
        cfu = 150 * math.exp(r2.gauss(0, 0.15))
        if in_win(day, 50, 56):
            cfu += 1150 * (1 - abs(day - 53) / 4)  # condensate leak, cleaned up on day 54-56
        microbe_daily.append(cfu)
    for c in CREW:
        mass = c["mass"]
        b2 = CREW2[c["id"]]
        strength, strength_test, sans_test = 100.0, 100.0, 0
        for day in range(1, DAYS + 1):
            g = rng.gauss
            h = r2.gauss
            adapt = ramp(day, 1, 10)  # early-flight adaptation
            sleep = c["sleep"] - 0.4 * (1 - adapt) + g(0, 0.45)
            mood = 4 + g(0, 0.55)
            stress = 2 + g(0, 0.55) + 0.6 * (1 - adapt)
            rhr = c["rhr"] - 2 * adapt + g(0, 2.0)
            rmssd = c["rmssd"] + g(0, 5)
            sbp = c["sbp"] - 3 * adapt + g(0, 3.5)
            dbp = c["dbp"] - 2 * adapt + g(0, 2.5)
            spo2 = 98 + g(0, 0.6)
            temp = 36.9 + 0.3 * adapt + g(0, 0.15)
            glu = c["glu"] + 2 * adapt + g(0, 4)
            ex = 150 + g(0, 15)
            water = 2.6 + g(0, 0.3)
            pvt = c["pvt"] + g(0, 12)
            lapses = max(0, round(g(1.0, 0.9)))
            dose = dose_daily[day - 1] * (1 + g(0, 0.04))  # real ISS daily dose, ±4 % personal dosimeter
            sleep_eff = b2["eff"] - 3 * (1 - adapt) + h(0, 2.2)
            work = 6.8 + h(0, 0.55)
            team = 4 + h(0, 0.5)
            msq = max(0.0, h(0.4, 0.5))
            if day <= 3 and c["id"] in ("B", "D"):
                msq = 7 - 1.8 * day + h(0, 0.6)  # space motion sickness, first days
            kcal = b2["kcal"] + h(0, 4.5)
            u_ca = b2["uca"] + 45 * ramp(day, 1, 10) + h(0, 14)
            cort = b2["cort"] + h(0, 2.0)
            strength -= 4.0 / DAYS  # average decline with the full exercise countermeasure
            sans = 0
            symptoms = []
            if day <= 3:
                symptoms.append("space motion sickness" if c["id"] in ("B", "D") else "facial puffiness")
                stress += 0.5
            mass_target = -0.6 * adapt  # expected fluid loss early in flight
            # --- injected anomalies
            if c["id"] == "A" and in_win(day, 18, 21):
                sleep = 4.3 + g(0, 0.4)
                sleep_eff -= 12
                work = 11.6 + h(0, 0.5)
                cort += 9
                pvt += 85 + g(0, 15)
                lapses += 6
                mood -= 1.4
                stress += 1.6
                rmssd -= 10
            if in_win(day, 37, 44):
                sbp += 4
                dbp += 2
                if rng.random() < 0.4:
                    symptoms.append("mild headache")
            if c["id"] == "B" and in_win(day, 37, 41):
                sbp += 14
                dbp += 9
                symptoms = [s for s in symptoms if s != "mild headache"] + ["headache", "lethargy"]
                pvt += 30
            if c["id"] == "C" and in_win(day, 40, 44):
                peak = 1 - abs(day - 42) / 3
                temp += 0.9 + 0.8 * peak
                rhr += 10 + 8 * peak
                rmssd -= 20 + 8 * peak
                sleep += 1.2
                ex = 40 + g(0, 15)
                cort += 6 + 4 * peak
                kcal -= 18
                mood -= 1
                symptoms += ["fever", "fatigue", "sore throat"]
            if c["id"] == "D" and day >= 25:
                mass_target -= 0.09 * (day - 24)  # kg/day loss beyond expected
                ex -= 0.9 * (day - 24)
                water -= 0.012 * (day - 24)
                kcal -= 0.6 * (day - 24)
                u_ca += 1.3 * (day - 24)
                strength -= 0.33  # reduced resistive exercise
            if c["id"] == "D" and day >= 45:
                k = ramp(day, 45, 55)
                mood -= 1.8 * k
                stress += 1.2 * k
                sleep -= 1.3 * k
                team -= 1.6 * k
                cort += 5 * k
                if k > 0.5 and rng.random() < 0.5:
                    symptoms.append("withdrawn, low motivation")
            if day == 20:
                dose = 4.6 + g(0, 0.3)
            if c["id"] == "B" and day >= 42:
                sans = 1  # optic-disc swelling found at the day-42 eye exam
            if day % EXAM_EVERY == 0:
                strength_test = strength + h(0, 0.8)
                sans_test = sans
            m = c["mass"] + mass_target + g(0, 0.25)
            mass_change = 100 * (m - c["mass"]) / c["mass"]
            rows.append({
                "crew": c["id"], "day": day,
                "sleep_h": round(min(11, max(2.5, sleep)), 1),
                "mood": int(min(5, max(1, round(mood)))),
                "stress": int(min(5, max(1, round(stress)))),
                "rhr": int(round(rhr)), "rmssd": int(round(max(8, rmssd))),
                "sbp": int(round(sbp)), "dbp": int(round(dbp)),
                "spo2": int(round(min(100, spo2))), "temp": round(temp, 1),
                "glucose": int(round(glu)), "body_mass": round(m, 1), "mass_change": round(mass_change, 1),
                "exercise_min": int(round(max(0, ex))), "water_l": round(max(0.8, water), 1),
                "pvt_rt": int(round(pvt)), "pvt_lapses": int(lapses),
                "co2_avg": int(round(co2_daily[day - 1] + g(0, 60))), "dose_mGy": round(max(0.05, dose), 3),
                "sleep_eff": int(round(min(99, sleep_eff))), "work_h": round(max(0, work), 1),
                "team": int(min(5, max(1, round(team)))), "msq": int(min(10, max(0, round(msq)))),
                "sans_grade": sans_test, "cortisol": round(max(1, cort), 1), "kcal_pct": int(round(kcal)),
                "strength_pct": round(strength_test, 1), "u_ca": int(round(u_ca)),
                "microbe_cfu": int(round(microbe_daily[day - 1] * math.exp(h(0, 0.05)))),
                "symptoms": "; ".join(symptoms),
            })
    return rows


DAILY_COLS = ["crew", "day", "sleep_h", "mood", "stress", "rhr", "rmssd", "sbp", "dbp", "spo2", "temp",
              "glucose", "body_mass", "mass_change", "exercise_min", "water_l", "pvt_rt", "pvt_lapses",
              "co2_avg", "dose_mGy", "sleep_eff", "work_h", "team", "msq", "sans_grade", "cortisol",
              "kcal_pct", "strength_pct", "u_ca", "microbe_cfu", "symptoms"]


def main():
    ranges = json.load(open(os.path.join(ROOT, "data", "reference_ranges.json"), encoding="utf-8"))
    catalogue = []
    live_bundle = {}
    crew_bundle = {}
    jobs = []
    for i, (base_id, fn, per) in enumerate(SCENARIOS):
        for j, m in enumerate(MISSIONS):
            title, env, desc, params = per[m["id"]]
            sid = base_id if m["id"] == "ISS" else f"{m['id'].lower()}_{base_id}"
            jobs.append((sid, base_id, m["id"], title, env, desc, params, fn, 1000 + i + 100 * j))
    for sid, base_id, mission, title, env, desc, params, fn, seed in jobs:
        rows = gen_live(sid, fn, seed, env, params)
        path = os.path.join(ROOT, "data", "live", f"{sid}.csv")
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["t"] + LIVE_COLS + ["label", "phase"])
            w.writeheader()
            w.writerows(rows)
        labels = sorted(set(r["label"] for r in rows))
        catalogue.append({"id": sid, "base": base_id, "missionId": mission, "title": title, "environment": env,
                          "mission": {k: ENVS[env][k] for k in ("where", "gravity", "g", "delay_s")}, "description": desc,
                          "duration_s": DUR, "rate_hz": 1, "labels": labels, "file": f"data/live/{sid}.csv"})
        # columnar, label/phase run-length encoded
        cols = {c: [r[c] for r in rows] for c in LIVE_COLS}
        def rle(key):
            out = []
            for r in rows:
                if not out or out[-1][1] != r[key]:
                    out.append([r["t"], r[key]])
            return out
        live_bundle[sid] = {"cols": cols, "labels": rle("label"), "phases": rle("phase")}
        print(f"  live/{sid}.csv  {len(rows)} rows  labels={labels}")
        # the scenario as each crew member lives it: own role, timing and body signals; shared cabin
        nominal_params = SCENARIOS[0][2][mission][3]
        for k, cid in enumerate(CREW_LIVE):
            run, role = CAST[mission][base_id][cid]
            if run is None:   # not involved: an ordinary day at their own pace
                run_fn, run_params = sc_nominal, nominal_params
                run = dict(CAST[mission]["nominal"][cid][0])
            else:
                run_fn, run_params = fn, params
            crows = gen_live(sid, run_fn, seed + 7919 * (k + 1), env, run_params, cid, run)
            for r, ref in zip(crows, rows):
                for c in LIVE_COLS:
                    if c not in PERSONAL:
                        r[c] = ref[c]
            os.makedirs(os.path.join(ROOT, "data", "live", f"crew_{cid}"), exist_ok=True)
            with open(os.path.join(ROOT, "data", "live", f"crew_{cid}", f"{sid}.csv"), "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=["t"] + LIVE_COLS + ["label", "phase"])
                w.writeheader()
                w.writerows(crows)
            enc = {}
            for c in PERSONAL:  # delta-encoded integers (value x 10^dec) keep the bundle small; null = no sensor
                if all(r[c] is None for r in crows):
                    enc[c] = None
                    continue
                sc = 10 ** DEC[c]
                ints = [int(round(r[c] * sc)) for r in crows]
                enc[c] = [ints[0]] + [b - a for a, b in zip(ints, ints[1:])]
            def rle_c(key):
                out = []
                for r in crows:
                    if not out or out[-1][1] != r[key]:
                        out.append([r["t"], r[key]])
                return out
            crew_bundle.setdefault(cid, {})[sid] = {"d": enc, "labels": rle_c("label"), "phases": rle_c("phase"),
                                                    "role": role, "affected": any(r["label"] not in ("nominal", "high_G") for r in crows)}
    json.dump(catalogue, open(os.path.join(ROOT, "data", "live", "scenarios.json"), "w", encoding="utf-8"),
              indent=2, ensure_ascii=False)

    daily = gen_daily()
    with open(os.path.join(ROOT, "data", "logbook", "crew_daily_log.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=DAILY_COLS)
        w.writeheader()
        w.writerows(daily)
    json.dump(INJECTED, open(os.path.join(ROOT, "data", "logbook", "injected_anomalies.json"), "w", encoding="utf-8"),
              indent=2, ensure_ascii=False)
    print(f"  logbook/crew_daily_log.csv  {len(daily)} rows")

    crew_live = {cid: {"dec": {c: DEC[c] for c in PERSONAL}, "trait": p["trait"],
                       "rest": {k: p[k] for k in ("HR", "RMSSD", "SBP", "DBP", "GLU", "SPO2", "RSO2")}}
                 for cid, p in CREW_LIVE.items()}
    bundle = {"ranges": ranges, "missions": MISSIONS, "scenarios": catalogue, "live": live_bundle,
              "liveCrew": crew_bundle, "crewLive": crew_live, "personal": PERSONAL,
              "crew": [{k: c[k] for k in ("id", "name", "age", "sex", "mass")} for c in CREW],
              "daily": daily, "injected": INJECTED}
    out = os.path.join(ROOT, "app", "js", "data_bundle.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("// Generated by data/generator/generate_dataset.py - do not edit by hand.\n")
        f.write("window.NS_DATA = ")
        json.dump(bundle, f, separators=(",", ":"), ensure_ascii=False)
        f.write(";\n")
    print(f"  app/js/data_bundle.js  {os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    main()
