// Bloodwork: real Inspiration4 clinical panels (NASA OSDR OSD-569 CBC, OSD-575 CMP).
// The same personal-baseline idea as the logbook, applied to real astronaut data: the mean of the three
// preflight samples (L-92, L-44, L-3) is each person's baseline, the day-after-landing sample (R+1) is scored against it.
NS.bloodwork = (function () {
  const I4 = window.NS_REAL.i4;
  const U = NS.util;
  const C = NS.chart.C;
  const $ = (id) => document.getElementById(id);
  const TP = I4.timepoints;
  const SPLIT = [TP.indexOf('L-3') + 0.35, TP.indexOf('R+1') - 0.35]; // grey bar = the 3-day flight
  // demo assumption: the real Inspiration4 subjects stand in for crew A-D, in order
  const SUBJ = { A: 'C001', B: 'C002', C: 'C003', D: 'C004' };
  const CREW = Object.fromEntries(Object.entries(SUBJ).map(([c, s]) => [s, c]));
  let subj = 'C001';
  const who = (s) => `Crew ${CREW[s]} (I4 ${s})`;

  function init() {
    $('bwSrc').innerHTML = `${I4.source}. ${I4.urls.map((u) => `<a href="${u}" target="_blank" rel="noopener">${u.split('/').pop()}</a>`).join(' · ')}`;
  }

  const title = (n) => (n.length <= 4 ? n : n.toLowerCase().replace(/(^|[\s(/;])([a-z])/g, (m, p, c) => p + c.toUpperCase())
    .replace('Egfr', 'eGFR').replace(' Non-afr. American', '').replace(/\(bun\)/i, '(BUN)'));
  const rangeTxt = (r) => { const [lo, hi] = r || []; return lo == null && hi == null ? '–' : lo == null ? `≤ ${hi}` : hi == null ? `≥ ${lo}` : `${lo}–${hi}`; };

  function flagOf(a, sid) {
    const vals = a.values[sid] || {}, [lo, hi] = a.ranges[sid] || [];
    const out = TP.filter((t) => vals[t] != null && ((lo != null && vals[t] < lo) || (hi != null && vals[t] > hi)));
    const s = a.stats[sid];
    return { out, shift: !!(s && s.r1_z != null && Math.abs(s.r1_z) >= 3) };
  }

  // 7-point sparkline with the lab reference band and the flight marked
  function spark(canvas, pts, band) {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vs = pts.filter((p) => p.v != null).map((p) => p.v);
    if (!vs.length) return;
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (band) { if (band[0] != null) lo = Math.min(lo, band[0]); if (band[1] != null) hi = Math.max(hi, band[1]); }
    const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
    const X = (i) => 6 + (w - 12) * i / (pts.length - 1), Y = (v) => 4 + (h - 8) * (1 - (v - lo) / (hi - lo));
    if (band && band[0] != null && band[1] != null) { g.fillStyle = C.band; g.fillRect(0, Y(band[1]), w, Y(band[0]) - Y(band[1])); }
    g.fillStyle = 'rgba(138,155,182,0.22)'; g.fillRect(X(SPLIT[0]), 0, X(SPLIT[1]) - X(SPLIT[0]), h);
    g.strokeStyle = C.line; g.lineWidth = 1.5; g.beginPath();
    let pen = false;
    pts.forEach((p, i) => { if (p.v == null) return; if (pen) g.lineTo(X(i), Y(p.v)); else { g.moveTo(X(i), Y(p.v)); pen = true; } });
    g.stroke();
    pts.forEach((p, i) => {
      if (p.v == null) return;
      const out = band && ((band[0] != null && p.v < band[0]) || (band[1] != null && p.v > band[1]));
      g.fillStyle = out ? C.crit : p.hi ? C.caution : C.line;
      g.beginPath(); g.arc(X(i), Y(p.v), out || p.hi ? 3.2 : 2.2, 0, 7); g.fill();
    });
  }

  function render() {
    subj = SUBJ[NS.logbook.crew] || 'C001';
    // analytes where at least 3 of 4 crew moved the same way the day after landing
    $('bwSig').innerHTML = I4.analytes.filter((a) => a.signature).map((a) => {
      const n = Object.values(a.stats).filter((s) => (a.signature === 'up' ? s.r1_z >= 1.5 : s.r1_z <= -1.5)).length;
      return `<div class="sig ${a.signature}"><b>${title(a.name)}</b><span>${a.signature === 'up' ? '▲' : '▼'} ${U.fmt(Math.abs(a.mean_r1_pct), 1)} % on R+1 · ${n} of 4 crew</span><small>${a.note || ''}</small></div>`;
    }).join('');
    let nOut = 0, nShift = 0;
    const html = I4.groups.concat(['Other']).map((g) => {
      const list = I4.analytes.filter((a) => a.group === g && a.values[subj] && Object.keys(a.values[subj]).length >= 4);
      if (!list.length) return '';
      return `<tr class="grp"><th colspan="8">${g}</th></tr>` + list.map((a) => {
        const i = I4.analytes.indexOf(a), s = a.stats[subj] || {}, f = flagOf(a, subj), v = a.values[subj];
        if (f.out.length) nOut++;
        if (f.shift) nShift++;
        const flag = f.out.length ? `<span class="pill c-crit">out of range ${f.out.join(', ')}</span>` : f.shift ? '<span class="pill c-warn">R+1 shift</span>' : '';
        return `<tr data-i="${i}"><td>${title(a.name)}</td><td class="muted">${a.unit}</td><td>${rangeTxt(a.ranges[subj])}</td>
          <td><canvas class="sp" data-i="${i}"></canvas></td><td class="mono">${U.fmt(s.pre_mean, 2)}</td><td class="mono">${U.fmt(v['R+1'], 2)}</td>
          <td class="mono ${f.shift ? 'c-warn' : ''}">${s.r1_pct == null ? '–' : (s.r1_pct > 0 ? '+' : '') + U.fmt(s.r1_pct, 1) + ' %'}</td><td>${flag}</td></tr>`;
      }).join('');
    }).join('');
    $('bwTable').innerHTML = '<tr><th>Analyte</th><th>Unit</th><th>Lab range</th><th>7 samples (L-92 … R+194)</th><th>Preflight</th><th>R+1</th><th>Δ R+1</th><th>Flag</th></tr>' + html;
    $('bwSum').textContent = `${who(subj)}: ${nOut} analytes outside the lab range at least once, ${nShift} with a ≥ 3 σ change the day after landing`;
    document.querySelectorAll('#bwTable canvas.sp').forEach((cv) => {
      const a = I4.analytes[+cv.dataset.i], v = a.values[subj], s = a.stats[subj];
      spark(cv, TP.map((t) => ({ v: v[t] == null ? null : v[t], hi: t === 'R+1' && s && Math.abs(s.r1_z) >= 3 })), a.ranges[subj]);
    });
    document.querySelectorAll('#bwTable tr[data-i]').forEach((tr) => U.tip(tr, () => rowTip(I4.analytes[+tr.dataset.i])));
  }

  function rowTip(a) {
    const v = a.values[subj], s = a.stats[subj] || {};
    return `<h4>${title(a.name)}</h4><div class="tip-meta">${a.panel} · ${a.osd} · ${who(subj)}</div>
      ${a.note ? `<p>${a.note}</p>` : ''}
      <table>${TP.map((t) => `<tr><td>${t}</td><td>${v[t] == null ? '–' : U.fmt(v[t], 2) + ' ' + a.unit}</td></tr>`).join('')}
      <tr><td>Baseline</td><td>${U.fmt(s.pre_mean, 2)} ± ${U.fmt(s.pre_sd, 2)} (L-92, L-44, L-3)</td></tr>
      <tr><td>R+1 vs base</td><td>${s.r1_z == null ? '–' : (s.r1_z > 0 ? '+' : '') + s.r1_z.toFixed(1) + ' σ'}</td></tr>
      <tr><td>Crew R+1</td><td>${Object.entries(a.stats).map(([k, x]) => `${CREW[k]} ${x.r1_pct == null ? '–' : (x.r1_pct > 0 ? '+' : '') + x.r1_pct + '%'}`).join(' · ')}</td></tr></table>
      <div class="tip-legend">Shaded = lab reference range · grey bar = the 3-day flight · red dot = outside range · amber dot = ≥ 3 σ change on R+1</div>`;
  }

  return { init, render };
})();
