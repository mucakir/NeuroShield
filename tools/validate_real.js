#!/usr/bin/env node
// Runs NeuroShield's own rule engine (the browser code, in a Node VM) on real human recordings and
// bundles them for the app:
//   PhysioNet Non-EEG  (20 people, stress protocol)      -> does the stress rule fire in stress, stay quiet at rest?
//   PhysioNet PRCP     (10 people, tilt + stand-up)       -> does the orthostatic rule react to head-up posture?
//   PhysioNet BIDMC    (53 ICU patients, 8 min)            -> how often does the monitor alert on real bedside vitals?
// Inputs: data/real/lab/*.json (build_lab_datasets.py). Outputs: data/real/lab/validation.json, app/js/real_rec.js
// Usage: node tools/validate_real.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const LAB = path.join(ROOT, 'data', 'real', 'lab');
const ctx = { localStorage: { getItem() { return null; }, setItem() {} }, setInterval, clearInterval, console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['data_bundle.js', 'util.js', 'rules.js', 'score.js', 'stream.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'app', 'js', f), 'utf8'), ctx, { filename: f });
}
const { NS } = ctx;
const S = NS.stream.S, KEYS = NS.stream.KEYS;
const load = (f) => JSON.parse(fs.readFileSync(path.join(LAB, f), 'utf8'));
const noneeg = load('noneeg_1hz.json'), prcp = load('prcp_1hz.json'), bidmc = load('bidmc_1hz.json');
const calib = load('calibration.json');
const cyber = fs.existsSync(path.join(LAB, 'cyber_1hz.json')) ? load('cyber_1hz.json') : null;

// replay one recording second by second; returns the active rule ids per second
function run(cols) {
  S.t = [];
  for (const k of KEYS) { S.buf[k] = []; S.stats[k] = { sum: 0, n: 0, min: Infinity, max: -Infinity }; S.base[k] = null; }
  NS.rules.reset();
  const n = Math.max(...Object.values(cols).map((a) => a.length));
  const out = [];
  for (let t = 0; t < n; t++) {
    S.t.push(t);
    for (const k of KEYS) {
      const v = cols[k] ? cols[k][t] : null;
      const val = v == null ? null : +v;
      S.buf[k].push(val);
      if (val != null && !isNaN(val)) {
        const st = S.stats[k];
        st.sum += val; st.n++; st.min = Math.min(st.min, val); st.max = Math.max(st.max, val);
        if (st.n === 60) S.base[k] = st.sum / st.n;
      }
    }
    NS.rules.evaluate(NS.stream.ctx, t);
    out.push(NS.rules.current().map((a) => a.rule.id));
  }
  return out;
}
const rle = (labels) => labels.reduce((o, l, t) => { if (!o.length || o[o.length - 1][1] !== l) o.push([t, l]); return o; }, []);
const pct = (x) => Math.round(1000 * x) / 10;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

// ---------------------------------------------------------------- Non-EEG: stress protocol
const PHASE = { Relax: 'nominal', PhysicalStress: 'physical_stress', CognitiveStress: 'cognitive_stress', EmotionalStress: 'emotional_stress' };
function noneegLabels(s) {
  const n = s.hr.length, lab = new Array(n).fill('nominal');
  s.phases.forEach(([t0, name], i) => { const t1 = i + 1 < s.phases.length ? s.phases[i + 1][0] : n; for (let t = t0; t < Math.min(t1, n); t++) lab[t] = PHASE[name] || 'nominal'; });
  return lab;
}
const ne = { phases: {}, subjects: [] };
for (const s of noneeg.subjects) {
  const cols = { HR: s.hr, SPO2: s.spo2, GSR: s.eda };
  const act = run(cols), lab = noneegLabels(s);
  const per = {};
  act.forEach((ids, t) => {
    if (t < 60) return; // baseline still forming
    const p = per[lab[t]] = per[lab[t]] || { n: 0, stress: 0, any: 0 };
    p.n++; if (ids.includes('stress')) p.stress++; if (ids.length) p.any++;
  });
  for (const [k, v] of Object.entries(per)) { const q = ne.phases[k] = ne.phases[k] || { n: 0, stress: 0, any: 0, subjectsHit: 0 }; q.n += v.n; q.stress += v.stress; q.any += v.any; if (v.stress) q.subjectsHit++; }
  ne.subjects.push({ id: s.id, stressShare: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, pct(v.stress / v.n)])) });
}
for (const v of Object.values(ne.phases)) { v.stressPct = pct(v.stress / v.n); v.anyPct = pct(v.any / v.n); }

// ---------------------------------------------------------------- PRCP: head-up tilt and standing
function prcpLabels(r) {
  const n = r.hr.length, lab = new Array(n).fill('nominal');
  let start = null;
  for (const [t, note] of r.events) {
    const s = note.toLowerCase();
    if (/fail|misfire|artifact|signal|finapres|noise|break/.test(s)) continue;
    if (start == null && /(tilt up|stand)/.test(s)) start = t;
    else if (start != null && /(tilt down|tilt back down|supine)/.test(s)) { for (let k = start; k < Math.min(t, n); k++) lab[k] = 'orthostatic_challenge'; start = null; }
  }
  return lab;
}
const pr = { headUp: { n: 0, alert: 0 }, supine: { n: 0, alert: 0 }, manoeuvres: 0, detected: 0, hrRise: [], sbpChange: [], records: [] };
for (const r of prcp.records) {
  const cols = { HR: r.hr, SBP: r.sbp, DBP: r.dbp, GZ: r.gz };
  const act = run(cols), lab = prcpLabels(r);
  act.forEach((ids, t) => {
    if (t < 60) return;
    const g = lab[t] === 'nominal' ? pr.supine : pr.headUp;
    g.n++; if (ids.includes('orthostatic')) g.alert++;
  });
  // per manoeuvre: response in the first 3 minutes head-up vs the 60 s before
  rle(lab).forEach(([t0, l], i, arr) => {
    if (l === 'nominal') return;
    const t1 = i + 1 < arr.length ? arr[i + 1][0] : lab.length;
    pr.manoeuvres++;
    if (act.slice(t0, t1).some((ids) => ids.includes('orthostatic'))) pr.detected++;
    const pre = (a) => median(a.slice(Math.max(0, t0 - 60), t0).filter((x) => x != null));
    const dur = (a) => median(a.slice(t0 + 20, Math.min(t1, t0 + 180)).filter((x) => x != null));
    if (pre(r.hr) != null && dur(r.hr) != null) pr.hrRise.push(dur(r.hr) - pre(r.hr));
    if (pre(r.sbp) != null && dur(r.sbp) != null) pr.sbpChange.push(dur(r.sbp) - pre(r.sbp));
  });
  pr.records.push({ id: r.id, info: r.info });
}
const prOut = { headUpAlertPct: pct(pr.headUp.alert / pr.headUp.n), supineAlertPct: pct(pr.supine.alert / pr.supine.n), manoeuvres: pr.manoeuvres,
  manoeuvresWithAlert: pr.detected, hrRiseMedian: Math.round(median(pr.hrRise)), sbpChangeMedian: Math.round(median(pr.sbpChange)), records: pr.records.length };

// ---------------------------------------------------------------- BIDMC: ICU bedside vitals
const bi = { seconds: 0, alertSeconds: 0, byRule: {}, patients: 0, patientsWithAlert: 0 };
for (const p of bidmc.patients) {
  const act = run({ HR: p.hr, RR: p.resp, SPO2: p.spo2 });
  let any = false;
  act.forEach((ids, t) => {
    if (t < 60) return;
    bi.seconds++;
    if (ids.length) { bi.alertSeconds++; any = true; }
    for (const id of ids) bi.byRule[id] = (bi.byRule[id] || 0) + 1;
  });
  bi.patients++; if (any) bi.patientsWithAlert++;
}
const biOut = { patients: bi.patients, patientsWithAlert: bi.patientsWithAlert, alertTimePct: pct(bi.alertSeconds / bi.seconds),
  byRule: Object.fromEntries(Object.entries(bi.byRule).map(([k, v]) => [k, pct(v / bi.seconds)])) };

// ---------------------------------------------------------------- Cybersickness: VR navigation, SSQ after each session
let cyOut = null;
if (cyber) {
  const grp = { sick: { n: 0, s: 0, hit: 0, dis: 0 }, mild: { n: 0, s: 0, hit: 0, dis: 0 } };
  const rows = [];
  for (const c of cyber.sessions) {
    const act = run({ GSR: c.gsr, HR: c.hr, VMIS: c.vmis });
    const live = act.slice(60);
    const share = (id) => live.filter((ids) => ids.includes(id)).length / live.length;
    rows.push({ ssq: c.ssq, dis: share('disorientation'), any: live.filter((ids) => ids.length).length / live.length });
    const g = c.ssq >= 40 ? grp.sick : c.ssq < 20 ? grp.mild : null;
    if (g) { g.n++; g.s += share('disorientation'); g.dis += share('disorientation') > 0 ? 1 : 0; g.hit += live.some((ids) => ids.length) ? 1 : 0; }
  }
  const sum = (g) => ({ sessions: g.n, disorientationTimePct: pct(g.s / g.n), sessionsWithDisorientation: g.dis, sessionsWithAnyAlert: g.hit });
  cyOut = { sessions: rows.length, sick: sum(grp.sick), mild: sum(grp.mild), anyAlertTimePct: pct(rows.reduce((a, r) => a + r.any, 0) / rows.length) };
}

const validation = { generated: new Date().toISOString(), noneeg: { subjects: noneeg.subjects.length, phases: ne.phases }, prcp: prOut, bidmc: biOut, cybersickness: cyOut };
fs.writeFileSync(path.join(LAB, 'validation.json'), JSON.stringify(validation, null, 1));

// ---------------------------------------------------------------- bundle for the app (Live Monitor "Lab" mission)
// Each crew member replays a different real person; channels the dataset does not have stay empty.
const CREW = ['A', 'B', 'C', 'D'];
const pickNE = ['Subject1', 'Subject7', 'Subject13', 'Subject9'];
const pickPR = ['12726', '12734', '12744', '12821'];
const fullBI = bidmc.patients.filter((p) => p.hr.every((x) => x != null) && p.spo2.every((x) => x != null) && p.resp.every((x) => x != null));
const pickBI = fullBI.slice(0, 4).map((p) => p.id);
// four sessions of four different people across the SSQ range (most sick first)
const pickCY = [];
if (cyber) {
  const byS = [...cyber.sessions].sort((a, b) => b.ssq - a.ssq);
  for (const q of [0.03, 0.2, 0.5, 0.85]) {
    let i = Math.floor(q * byS.length);
    while (pickCY.some((x) => x.person === byS[i].person)) i++;
    pickCY.push(byS[i]);
  }
}
const who = (i) => Object.entries(i || {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ');
const scen = [
  { id: 'lab_stress', title: 'Stress protocol (real recording)', description: 'Real wrist-sensor recording from PhysioNet Non-EEG: 5 min rest, treadmill exercise, rest, emotional and cognitive (mental arithmetic) stress. This dataset records HR, SpO2 and skin conductance only.',
    build: (c, i) => { const s = noneeg.subjects.find((x) => x.id === pickNE[i]); return { cols: { HR: s.hr, SPO2: s.spo2, GSR: s.eda }, labels: rle(noneegLabels(s)), role: `${s.id} of PhysioNet Non-EEG (${who(s.info)})` }; } },
  { id: 'lab_tilt', title: 'Tilt table & stand-up (real recording)', description: 'Real beat-to-beat blood pressure and ECG from PhysioNet PRCP: supine rest, slow and fast head-up tilt and standing up, the closest Earth analogue of re-entering gravity after spaceflight. +Gz is derived from the table angle.',
    build: (c, i) => { const r = prcp.records.find((x) => x.id === pickPR[i]); return { cols: { HR: r.hr, SBP: r.sbp, DBP: r.dbp, GZ: r.gz }, labels: rle(prcpLabels(r)), role: `record ${r.id} of PhysioNet PRCP (${r.info.replace(/[<>]/g, '').trim()})` }; } },
  { id: 'lab_icu', title: 'ICU bedside vitals (real recording, clinical reference)', description: 'Real 8-minute 1 Hz vitals of intensive-care patients from PhysioNet BIDMC. These are hospital patients, not astronauts: use it to see the monitor on genuine bedside data.',
    build: (c, i) => { const p = bidmc.patients.find((x) => x.id === pickBI[i]); return { cols: { HR: p.hr, RR: p.resp, SPO2: p.spo2 }, labels: [[0, 'nominal']], role: `${p.id} of PhysioNet BIDMC (${who(p.info)})` }; } },
];
if (cyber) scen.push({ id: 'lab_cyber', title: 'VR navigation, cybersickness (real recording)', description: 'Real 4-minute VR navigation sessions (Wang et al. 2023): the scene turns while the body stays still, a visual-vestibular conflict like the one that causes space motion sickness. Wrist skin conductance and HR are real; the mismatch card shows the scene rotation rate. Each person rated their sickness (SSQ) afterwards.',
  build: (c, i) => { const x = pickCY[i]; return { cols: { GSR: x.gsr, HR: x.hr, VMIS: x.vmis }, labels: [[0, x.ssq >= 40 ? 'motion_sickness' : 'nominal']], role: `${x.person} (${x.condition}) of the Cybersickness dataset, SSQ ${x.ssq} (nausea ${x.nausea}, disorientation ${x.disorientation})` }; } });
const rec = { mission: { id: 'Lab', label: 'Lab', gravity: 'real data', g: 1, delay_s: 0,
  desc: 'Real human recordings from open Earth-lab datasets (PhysioNet, VR cybersickness), replayed at 1 Hz. Each crew member replays a different real person; only the channels each dataset has are shown.' },
  scenarios: [], tracks: {}, calibration: calib, validation };
for (const s of scen) {
  let dur = 0;
  CREW.forEach((c, i) => {
    const t = s.build(c, i);
    t.phases = [[0, s.title.replace(/ \(.*/, '')]];
    t.affected = t.labels.some(([, l]) => l !== 'nominal');
    (rec.tracks[c] = rec.tracks[c] || {})[s.id] = t;
    dur = Math.max(dur, ...Object.values(t.cols).map((a) => a.length));
  });
  rec.scenarios.push({ id: s.id, base: s.id, missionId: 'Lab', title: s.title, environment: 'Earth lab',
    mission: { where: 'Earth laboratory / hospital (real recording)', gravity: '1 g', g: 1, delay_s: 0 }, description: s.description, duration_s: dur, rate_hz: 1, real: true });
}
fs.writeFileSync(path.join(ROOT, 'app', 'js', 'real_rec.js'),
  '// Generated by tools/validate_real.js - do not edit by hand.\n' +
  '// Real human recordings (PhysioNet) for the Live Monitor "Lab" mission, plus calibration and validation results.\n' +
  'window.NS_REC = ' + JSON.stringify(rec) + ';\n');

console.log('Non-EEG stress rule, share of time active per phase (20 people):');
for (const [k, v] of Object.entries(ne.phases)) console.log(`  ${k.padEnd(17)} ${String(v.stressPct).padStart(5)} %  (any alert ${v.anyPct} %, people with ≥1 stress alert ${v.subjectsHit}/20)`);
console.log('PRCP orthostatic rule:', prOut);
console.log('BIDMC ICU vitals:', biOut);
if (cyOut) console.log('Cybersickness disorientation rule:', cyOut);
console.log(`app/js/real_rec.js ${Math.round(fs.statSync(path.join(ROOT, 'app', 'js', 'real_rec.js')).size / 1024)} KB`);
