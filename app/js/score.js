// Health score: per-metric sub-scores (0-100) -> per-system scores -> overall score.
// System score blends the mean and the worst metric so one bad value is not averaged away.
// Active alerts cap the overall score (critical ≤ 45, caution ≤ 75).
NS.score = (function () {
  let smooth = null;

  function compute(values, ranges, alerts) {
    const systems = {};
    for (const key in ranges.live) {
      const def = ranges.live[key];
      const s = NS.util.subScore(def, values[key]);
      if (s == null) continue;
      (systems[def.system] = systems[def.system] || []).push({ key, s });
    }
    const sys = {};
    let total = 0, wsum = 0;
    for (const id in ranges.systems) {
      const arr = systems[id];
      if (!arr || !arr.length) continue;
      const mean = arr.reduce((a, b) => a + b.s, 0) / arr.length;
      const min = Math.min(...arr.map((x) => x.s));
      let score = 0.4 * mean + 0.6 * min;
      // alerts attributed to this system also cap it
      for (const a of alerts) if (a.rule.system === id) score = Math.min(score, a.level === 'crit' ? 35 : 70);
      sys[id] = { score, worst: arr.reduce((a, b) => (b.s < a.s ? b : a)) };
      total += score * ranges.systems[id].weight;
      wsum += ranges.systems[id].weight;
    }
    let overall = wsum ? total / wsum : 100;
    if (alerts.some((a) => a.level === 'crit')) overall = Math.min(overall, 45);
    else if (alerts.length) overall = Math.min(overall, 75);
    smooth = smooth == null ? overall : smooth + (overall - smooth) * 0.35;
    return { overall: smooth, raw: overall, systems: sys };
  }

  function band(s) { return s >= 80 ? 'ok' : s >= 55 ? 'warn' : 'crit'; }
  function word(s) { return s >= 80 ? 'Good' : s >= 55 ? 'Watch' : 'Act now'; }
  function reset() { smooth = null; }

  return { compute, band, word, reset };
})();
