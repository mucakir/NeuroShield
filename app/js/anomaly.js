// Day-to-day anomaly detection on the crew logbook.
//  - short-term: robust z-score vs the previous 14 days (median / 1.4826·MAD), excluding
//    days already flagged, so an ongoing episode does not become the new normal
//  - long-term drift: robust z-score vs the personal in-flight baseline (days 4-14)
//  - flagged days are merged into episodes and classified by pattern
NS.anomaly = (function () {
  const METRICS = ['sleep_h', 'sleep_eff', 'work_h', 'mood', 'stress', 'team', 'msq', 'pvt_rt', 'pvt_lapses', 'sans_grade',
    'rhr', 'rmssd', 'sbp', 'dbp', 'spo2', 'temp', 'cortisol', 'glucose', 'mass_change', 'kcal_pct',
    'exercise_min', 'strength_pct', 'u_ca', 'water_l', 'co2_avg', 'microbe_cfu', 'dose_mGy'];
  // minimum robust sigma per metric (measurement noise floor)
  const FLOOR = { sleep_h: 0.45, mood: 0.7, stress: 0.7, rhr: 3, rmssd: 6, sbp: 4.5, dbp: 3.5, spo2: 0.8,
    temp: 0.18, glucose: 5, mass_change: 0.45, exercise_min: 18, water_l: 0.35, pvt_rt: 16, pvt_lapses: 1.3,
    co2_avg: 250, dose_mGy: 0.06, sleep_eff: 3, work_h: 0.8, team: 0.7, msq: 0.8, sans_grade: 0.3,
    cortisol: 2.5, kcal_pct: 6, strength_pct: 2, u_ca: 18, microbe_cfu: 40 };
  const Z_ANOM = 3, Z_WATCH = 2.2;
  const ENV = ['co2_avg', 'dose_mGy', 'microbe_cfu'];
  const PERSIST = ['mood', 'stress', 'team', 'mass_change'];

  function robust(vals, floor) {
    const med = NS.util.median(vals);
    const mad = NS.util.median(vals.map((v) => Math.abs(v - med)));
    return { med, sd: Math.max(1.4826 * mad, floor) };
  }

  function detect(rows) {
    const days = rows.map((r) => r.day);
    const z = {}, zShort = {}, zLong = {};
    const flagged = {};
    for (const m of METRICS) {
      z[m] = []; zShort[m] = []; zLong[m] = []; flagged[m] = [];
      const base = rows.filter((r) => r.day >= 4 && r.day <= 14 && r[m] != null).map((r) => +r[m]);
      const lb = base.length >= 5 ? robust(base, FLOOR[m]) : null;
      for (let i = 0; i < rows.length; i++) {
        const v = rows[i][m];
        if (v == null || v === '' || isNaN(v)) { z[m].push(null); zShort[m].push(null); zLong[m].push(null); flagged[m].push(false); continue; }
        const hist = [];
        for (let j = i - 1; j >= 0 && hist.length < 14; j--) {
          if (rows[i].day - rows[j].day > 21) break;
          if (!flagged[m][j] && rows[j][m] != null && rows[j][m] !== '') hist.push(+rows[j][m]);
        }
        let zs = null, zl = null;
        if (hist.length >= 5) { const b = robust(hist, FLOOR[m]); zs = (v - b.med) / b.sd; }
        if (lb && rows[i].day > 14) zl = (v - lb.med) / lb.sd * 0.8; // drift is down-weighted
        zShort[m].push(zs); zLong[m].push(zl);
        const zz = [zs, zl].filter((x) => x != null).reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
        z[m].push(zs == null && zl == null ? null : zz);
        flagged[m].push(Math.abs(zz) >= Z_ANOM);
      }
      // ordinal self-reports & slow drifts: outside the reference range on ≥3 of the last 5 days
      if (PERSIST.includes(m)) {
        const def = window.NS_DATA.ranges.daily[m];
        const out = rows.map((r) => r[m] != null && r[m] !== '' && NS.util.status(def, +r[m]) !== 'ok');
        for (let i = 0; i < rows.length; i++) {
          if (!out[i]) continue;
          let k = 0;
          for (let j = Math.max(0, i - 4); j <= i; j++) if (out[j]) k++;
          if (k >= 3 && z[m][i] != null && Math.abs(z[m][i]) < Z_ANOM) {
            const below = +rows[i][m] < NS.util.lo(def.normal);
            z[m][i] = below ? -Z_ANOM : Z_ANOM;
            flagged[m][i] = true;
          }
        }
      }
      // drift must persist ≥3 days to count; isolated long-term blips become 'watch'
      for (let i = 0; i < rows.length; i++) {
        if (!flagged[m][i]) continue;
        const shortHit = zShort[m][i] != null && Math.abs(zShort[m][i]) >= Z_ANOM;
        if (shortHit) continue;
        const run = [i - 1, i + 1].filter((k) => k >= 0 && k < rows.length && flagged[m][k]).length;
        if (run === 0) { flagged[m][i] = false; z[m][i] = Math.sign(z[m][i]) * Math.min(Math.abs(z[m][i]), Z_ANOM - 0.01); }
      }
    }

    // day score + flags
    const flags = [];
    const dayScore = rows.map((r, i) => {
      let s = 0;
      for (const m of METRICS) {
        const v = z[m][i];
        if (v == null) continue;
        if (Math.abs(v) >= Z_WATCH) s += Math.abs(v) - Z_WATCH + 0.2;
        if (flagged[m][i]) flags.push({ day: r.day, i, metric: m, z: v, value: r[m] });
      }
      return s;
    });

    // episodes
    // habitat (environment) flags and physiological flags form separate episodes
    const episodes = [];
    for (const group of [flags.filter((f) => !ENV.includes(f.metric)), flags.filter((f) => ENV.includes(f.metric))]) {
      const byDay = {};
      for (const f of group) (byDay[f.day] = byDay[f.day] || []).push(f);
      const fdays = Object.keys(byDay).map(Number).sort((a, b) => a - b);
      const eps = [];
      for (const d of fdays) {
        const last = eps[eps.length - 1];
        if (last && d - last.end <= 2) { last.end = d; last.flags.push(...byDay[d]); }
        else eps.push({ start: d, end: d, flags: byDay[d].slice() });
      }
      episodes.push(...eps);
    }
    episodes.sort((a, b) => a.start - b.start);
    for (const e of episodes) classify(e);
    return { days, z, flags, dayScore, episodes, flagged };
  }

  function dir(e, m) {
    const f = e.flags.filter((x) => x.metric === m);
    if (!f.length) return 0;
    return Math.sign(f.reduce((a, b) => a + b.z, 0));
  }

  function classify(e) {
    e.metrics = [...new Set(e.flags.map((f) => f.metric))];
    const has = (m, s) => dir(e, m) === s;
    const tags = [];
    if (has('temp', 1) && (has('rhr', 1) || has('rmssd', -1))) tags.push(['infection', 'Possible infection / fever']);
    else if (has('temp', 1)) tags.push(['infection', 'Raised body temperature']);
    if (has('sleep_h', -1) || has('sleep_eff', -1) || has('pvt_rt', 1) || has('pvt_lapses', 1)) tags.push(['sleep', has('work_h', 1) ? 'Sleep loss / work overload' : 'Sleep loss / fatigue']);
    else if (has('work_h', 1)) tags.push(['sleep', 'Work overload']);
    if (has('co2_avg', 1)) tags.push(['co2', 'Elevated cabin CO2']);
    if (has('sbp', 1) || has('dbp', 1)) tags.push(['bp', 'Blood pressure rise']);
    if (has('mass_change', -1)) tags.push(['mass', 'Body-mass loss']);
    else if (has('kcal_pct', -1)) tags.push(['mass', 'Low energy intake']);
    else if (has('exercise_min', -1) || has('water_l', -1)) tags.push(['mass', 'Reduced exercise / fluid intake']);
    if (has('strength_pct', -1)) tags.push(['fitness', 'Muscle strength loss']);
    if (has('u_ca', 1)) tags.push(['bone', 'Bone breakdown marker up']);
    if (has('mood', -1) || has('stress', 1)) tags.push(['mood', 'Low mood / high stress']);
    if (has('team', -1)) tags.push(['team', 'Team cohesion drop']);
    if (has('cortisol', 1) && !tags.some((t) => t[0] === 'infection' || t[0] === 'mood' || t[0] === 'sleep')) tags.push(['stress', 'Stress hormone rise']);
    if (has('msq', 1)) tags.push(['sm', 'Motion sickness']);
    if (has('sans_grade', 1)) tags.push(['sans', 'Optic-disc swelling (SANS sign)']);
    if (has('dose_mGy', 1)) tags.push(['radiation', 'Radiation dose spike']);
    if (has('microbe_cfu', 1)) tags.push(['microbe', 'Microbial growth in cabin air']);
    if (!tags.length) tags.push(['generic', 'Unusual values']);
    e.tags = tags;
    e.title = tags.map((t) => t[1]).join(' + ');
    e.severity = e.flags.reduce((a, f) => Math.max(a, Math.abs(f.z)), 0) >= 5 || e.end - e.start >= 4 ? 'crit' : 'warn';
    e.envOnly = e.metrics.every((m) => ENV.includes(m));
    const adv = [];
    for (const [k] of tags) for (const a of NS.rules.DAILY_ADVICE[k] || []) if (!adv.includes(a)) adv.push(a);
    e.advice = adv;
  }

  // An episode matches a ground-truth event if it overlaps in time (±1 day) and is of the same kind.
  function matches(e, t) {
    return e.start <= t.days[1] + 1 && e.end >= t.days[0] - 1 && !!e.envOnly === !!t.env;
  }

  // Compare detected episodes with the injected ground truth for one crew member.
  function evaluate(crewId, episodes, injected) {
    const truth = injected.filter((x) => x.crew === crewId || x.crew === 'ALL');
    const hit = truth.map((t) => episodes.some((e) => matches(e, t)));
    const tp = episodes.filter((e) => truth.some((t) => matches(e, t)));
    return { truth, hit, detected: hit.filter(Boolean).length, falsePos: episodes.length - tp.length };
  }

  return { METRICS, detect, evaluate, matches, Z_ANOM, Z_WATCH };
})();
