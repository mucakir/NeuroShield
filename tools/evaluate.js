#!/usr/bin/env node
// Reproducible evaluation of the NeuroShield rule engine, health score and logbook anomaly
// detector on the synthetic dataset. Runs the exact browser code in a Node VM.
// Writes paper/results.json and print-friendly SVG figures to paper/figures/.
// Usage: node tools/evaluate.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const JS = path.join(ROOT, 'app', 'js');
const ctx = { localStorage: { getItem() { return null; }, setItem() {} }, setInterval, clearInterval, console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['data_bundle.js', 'util.js', 'rules.js', 'score.js', 'stream.js', 'anomaly.js']) {
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
}
const { NS, NS_DATA: D } = ctx;
// CREW=A..D replays that crew member's own track (personal baselines and scenario role); default = reference crew
if (process.env.CREW) NS.stream.setCrew(process.env.CREW, D.daily.filter((r) => r.crew === process.env.CREW));
const OUT = process.env.CREW ? path.join(ROOT, 'paper', 'crew', process.env.CREW) : path.join(ROOT, 'paper');

// ---------------------------------------------------------------- live scenarios
function runScenario(id) {
  NS.stream.loadScenario(id);
  const sc = NS.stream.track(id);
  const n = sc.cols.HR.length;
  const labelAt = (t) => { let v = 'nominal'; for (const [t0, l] of sc.labels) if (t0 <= t) v = l; return v; };
  const rows = [];
  const events = [];
  NS.score.reset();
  for (let i = 0; i < n; i++) {
    const s = {};
    Object.assign(s, NS.stream.sampleAt(i));
    // replicate stream.push without the DOM emitter
    const changes = pushSample(s, i);
    for (const c of changes) events.push({ t: c.t, rule: c.rule.id, title: c.rule.title, level: c.level });
    const alerts = NS.rules.current();
    const score = NS.score.compute(NS.stream.current(), D.ranges, alerts).overall;
    rows.push({ t: i, label: labelAt(i), alert: alerts.length > 0, crit: alerts.some((a) => a.level === 'crit'), score });
  }
  return { rows, events };
}
function pushSample(s, t) {
  const S = NS.stream.S;
  S.t.push(t);
  for (const k of NS.stream.KEYS) {
    const v = s[k] == null ? null : +s[k];
    S.buf[k].push(v);
    if (v != null) {
      const st = S.stats[k];
      st.sum += v; st.n++; st.min = Math.min(st.min, v); st.max = Math.max(st.max, v);
      if (st.n === 60) S.base[k] = st.sum / st.n;
    }
  }
  return NS.rules.evaluate(NS.stream.ctx, t);
}

// labels that do not warrant an alert: nominal state and expected operational G-load (1.5-4.5 G)
const NEG = ['nominal', 'high_G'];
const live = [];
const all = { tp: 0, fp: 0, fn: 0, tn: 0 };
const scoreBy = { nominal: [], abnormal: [] };
const runs = {};
for (const sc of D.scenarios) {
  const { rows, events } = runScenario(sc.id);
  runs[sc.id] = { rows, events };
  const m = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const r of rows) {
    const pos = !NEG.includes(r.label);
    if (pos && r.alert) m.tp++; else if (pos) m.fn++; else if (r.alert) m.fp++; else m.tn++;
    (pos ? scoreBy.abnormal : scoreBy.nominal).push(r.score);
  }
  for (const k in m) all[k] += m[k];
  const firstAbn = rows.find((r) => !NEG.includes(r.label));
  const firstAlert = events.find((e) => e.level);
  const firstCrit = events.find((e) => e.level === 'crit');
  const critLabels = ['microsleep', 'A-LOC', 'hypoxia', 'hypercapnia', 'spatial_disorientation', 'fever', 'solar_particle_event', 'hypoglycaemia_L2', 'cognitive_overload', 'dcs_high_risk', 'heat_stress', 'cold_cabin'];
  const firstCritLabel = rows.find((r) => critLabels.includes(r.label));
  live.push({
    id: sc.id, title: sc.title, environment: sc.environment,
    firstAbnormal: firstAbn ? firstAbn.t : null, firstCritLabel: firstCritLabel ? firstCritLabel.t : null,
    firstAlert: firstAlert ? { t: firstAlert.t, rule: firstAlert.title, level: firstAlert.level } : null,
    firstCrit: firstCrit ? { t: firstCrit.t, rule: firstCrit.title } : null,
    rules: [...new Set(events.filter((e) => e.level).map((e) => e.title))],
    sensitivity: m.tp + m.fn ? m.tp / (m.tp + m.fn) : null,
    specificity: m.tn + m.fp ? m.tn / (m.tn + m.fp) : null,
    minScore: Math.min(...rows.map((r) => r.score)),
    ...m,
  });
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

// ---------------------------------------------------------------- logbook
const logbook = [];
let det = 0, tot = 0, fps = 0, crewDays = 0;
for (const c of D.crew) {
  const rows = D.daily.filter((r) => r.crew === c.id);
  crewDays += rows.length;
  const res = NS.anomaly.detect(rows);
  const ev = NS.anomaly.evaluate(c.id, res.episodes, D.injected);
  det += ev.detected; tot += ev.truth.length; fps += ev.falsePos;
  logbook.push({
    crew: c.id, name: c.name, detected: ev.detected, total: ev.truth.length, falsePos: ev.falsePos,
    episodes: res.episodes.map((e) => ({ start: e.start, end: e.end, title: e.title, metrics: e.metrics, env: e.envOnly })),
    truth: ev.truth.map((t, i) => ({ type: t.type, days: t.days, hit: ev.hit[i] })),
  });
}

const results = {
  generated: new Date().toISOString(),
  live, liveTotals: { ...all, sensitivity: all.tp / (all.tp + all.fn), specificity: all.tn / (all.tn + all.fp) },
  score: { nominalMean: mean(scoreBy.nominal), nominalSd: sd(scoreBy.nominal), abnormalMean: mean(scoreBy.abnormal), abnormalSd: sd(scoreBy.abnormal) },
  logbook, logbookTotals: { detected: det, total: tot, falsePos: fps, crewDays },
};
fs.mkdirSync(path.join(OUT, 'figures'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));

// ---------------------------------------------------------------- figures (SVG, print style)
function figure(id, panels, file, opts = {}) {
  const W = 520, PH = 92, gap = 14, L = 46, R = 10, T = 8, B = 30;
  const H = T + panels.length * PH + (panels.length - 1) * gap + B;
  const sc = D.live[id];
  const n = sc.cols.HR.length;
  const X = (t) => L + t / (n - 1) * (W - L - R);
  const { events } = runs[id];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Times New Roman, serif" font-size="9">`;
  s += `<rect width="${W}" height="${H}" fill="#fff"/>`;
  panels.forEach((p, k) => {
    const y0 = T + k * (PH + gap), y1 = y0 + PH;
    const def = D.ranges.live[p.key];
    const vals = sc.cols[p.key];
    let lo = Math.min(...vals, ...(p.lim || [])), hi = Math.max(...vals, ...(p.lim || []));
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    if (p.range) [lo, hi] = p.range;
    const Y = (v) => y1 - (v - lo) / (hi - lo) * PH;
    // ground-truth label shading
    sc.labels.forEach(([t0, l], i) => {
      if (l === 'nominal') return;
      const t1 = i + 1 < sc.labels.length ? sc.labels[i + 1][0] : n;
      s += `<rect x="${X(t0)}" y="${y0}" width="${X(t1) - X(t0)}" height="${PH}" fill="#000" opacity="0.06"/>`;
    });
    s += `<rect x="${L}" y="${y0}" width="${W - L - R}" height="${PH}" fill="none" stroke="#000" stroke-width="0.6"/>`;
    // ticks
    for (let i = 0; i <= 3; i++) {
      const v = lo + (hi - lo) * i / 3;
      s += `<text x="${L - 3}" y="${Y(v) + 3}" text-anchor="end">${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)}</text>`;
    }
    // reference limits
    for (const v of (def.normal || [])) if (v != null && v > lo && v < hi) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#2a7" stroke-dasharray="5 3" stroke-width="0.8"/>`;
    for (const v of (def.warn || [])) if (v != null && v > lo && v < hi) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#c22" stroke-dasharray="2 2" stroke-width="0.8"/>`;
    // series
    s += `<polyline fill="none" stroke="#1f4e9c" stroke-width="0.9" points="${vals.map((v, t) => X(t).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ')}"/>`;
    s += `<text x="${L + 4}" y="${y0 + 11}" font-weight="bold">${p.name || def.label} (${def.unit})</text>`;
    // alert onsets
    for (const e of events) {
      if (!e.level || (p.rules && !p.rules.includes(e.rule))) continue;
      s += `<line x1="${X(e.t)}" x2="${X(e.t)}" y1="${y0}" y2="${y1}" stroke="${e.level === 'crit' ? '#c22' : '#d80'}" stroke-width="${e.level === 'crit' ? 1.2 : 0.9}"/>`;
    }
  });
  const yb = H - B;
  for (let t = 0; t <= n; t += 120) s += `<text x="${X(Math.min(t, n - 1))}" y="${yb + 11}" text-anchor="middle">${t / 60}</text>`;
  s += `<text x="${(L + W - R) / 2}" y="${yb + 23}" text-anchor="middle">time (min)</text>`;
  s += '</svg>';
  fs.writeFileSync(path.join(OUT, 'figures', file), s);
}
figure('fatigue_microsleep', [
  { key: 'EEG_FI', rules: ['microsleep'] }, { key: 'NOD', rules: ['microsleep'] }, { key: 'HR', rules: ['microsleep'] },
], 'fig_fatigue.svg');
figure('hypoxia_leak', [
  { key: 'PCAB', rules: ['depress'] }, { key: 'SPO2', rules: ['hypoxia'] }, { key: 'RSO2', rules: ['hypoxia'] },
], 'fig_hypoxia.svg');
figure('gloc_high_g', [{ key: 'GZ', rules: ['gloc'] }, { key: 'RSO2', rules: ['gloc'] }], 'fig_gloc.svg');

console.log(JSON.stringify({ liveTotals: results.liveTotals, score: results.score, logbookTotals: results.logbookTotals }, null, 1));
for (const l of live) console.log(l.id.padEnd(24), 'abn', l.firstAbnormal, 'critLbl', l.firstCritLabel, 'alert', l.firstAlert && l.firstAlert.t, l.firstAlert && l.firstAlert.rule, 'crit', l.firstCrit && l.firstCrit.t, 'sens', l.sensitivity && l.sensitivity.toFixed(2), 'spec', l.specificity && l.specificity.toFixed(2), 'min', l.minScore.toFixed(0));
