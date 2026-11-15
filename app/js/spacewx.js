// Space Weather: real GOES proton flux from NOAA SWPC, fetched live (CORS is open), with the bundled
// snapshot as fallback when offline. Rated on the NOAA solar radiation storm scale (S1-S5).
NS.spacewx = (function () {
  const N = window.NS_REAL.noaa;
  const U = NS.util;
  const C = NS.chart.C;
  const $ = (id) => document.getElementById(id);
  // NOAA Space Weather Scale for solar radiation storms (>=10 MeV integral flux, pfu)
  const S = [
    { s: 0, v: 0, name: 'S0 · quiet', crew: 'No radiation-storm restrictions. EVAs can go ahead as planned.' },
    { s: 1, v: 10, name: 'S1 · minor', crew: 'Watch the trend; review EVA timelines and shelter readiness.' },
    { s: 2, v: 100, name: 'S2 · moderate', crew: 'Postpone non-essential EVAs; keep the crew near shielded areas.' },
    { s: 3, v: 1e3, name: 'S3 · strong', crew: 'NOAA: radiation-hazard avoidance recommended for astronauts on EVA. End EVAs, prepare the storm shelter.' },
    { s: 4, v: 1e4, name: 'S4 · severe', crew: 'NOAA: unavoidable radiation hazard to astronauts on EVA. Crew to the storm shelter.' },
    { s: 5, v: 1e5, name: 'S5 · extreme', crew: 'NOAA: unavoidable high radiation hazard to astronauts on EVA. Stay in the shelter until the all-clear.' },
  ];
  const level = (f) => [...S].reverse().find((x) => f >= x.v) || S[0];
  let series = N.series.map((p) => ({ t: Date.parse(p.t), p10: p.p10, p100: p.p100 }));
  let source = `Offline snapshot ${N.file} (bundled)`, fetched = false;

  // keep the hourly maximum of the two channels the scale uses
  function hourly(rows) {
    const h = new Map();
    for (const x of rows) {
      const k = x.energy === '>=10 MeV' ? 'p10' : x.energy === '>=100 MeV' ? 'p100' : null;
      if (!k || x.flux == null) continue;
      const t = Math.floor(Date.parse(x.time_tag) / 36e5) * 36e5, o = h.get(t) || { t };
      o[k] = Math.max(o[k] || 0, x.flux); h.set(t, o);
    }
    return [...h.values()].sort((a, b) => a.t - b.t);
  }

  async function load() {
    if (fetched) return;
    fetched = true;
    try {
      const r = await fetch(N.url, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const hs = hourly(await r.json());
      if (hs.length > 24) { series = hs; source = `Live from NOAA SWPC, fetched ${new Date().toLocaleTimeString()}`; }
    } catch (e) {
      source += ' · live fetch failed (offline?)';
    }
    if (document.getElementById('view-spacewx').classList.contains('active')) render();
  }

  function now() {
    const last = [...series].reverse().find((p) => p.p10 != null) || {};
    return { p10: last.p10, p100: last.p100, t: last.t, lv: level(last.p10 || 0), peak: Math.max(...series.map((p) => p.p10 || 0)) };
  }
  const cls = (lv) => (lv.s >= 3 ? 'crit' : lv.s >= 1 ? 'warn' : 'ok');

  // log-scale proton flux with NOAA thresholds
  function chart() {
    const cv = $('swChart'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = { l: 46, r: 10, t: 10, b: 22 }, lo = 0.01, hi = 1e5, L = Math.log10;
    const t0 = series[0].t, t1 = series[series.length - 1].t;
    const X = (t) => pad.l + (w - pad.l - pad.r) * (t - t0) / Math.max(1, t1 - t0);
    const Y = (v) => pad.t + (h - pad.t - pad.b) * (1 - (L(Math.max(v, lo)) - L(lo)) / (L(hi) - L(lo)));
    g.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'; g.lineWidth = 1;
    for (let e = -2; e <= 5; e++) {
      const y = Y(10 ** e);
      g.strokeStyle = C.grid; g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
      g.fillStyle = C.axis; g.fillText(e >= -2 && e <= 3 ? String(10 ** e) : `1e${e}`, 6, y + 4);
    }
    for (const [v, lab, col] of [[10, 'S1 · 10 pfu', C.caution], [1e3, 'S3 · 1000 pfu', C.crit]]) {
      const y = Y(v);
      g.setLineDash([5, 4]); g.strokeStyle = col; g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.fillText(lab, w - pad.r - g.measureText(lab).width - 2, y - 4);
    }
    g.fillStyle = C.axis;
    for (let d = 0; d <= Math.round((t1 - t0) / 864e5); d++) {
      const t = t0 + d * 864e5;
      g.fillText(new Date(t).toISOString().slice(5, 10), Math.min(w - pad.r - 34, Math.max(pad.l, X(t) - 16)), h - 6);
    }
    for (const [k, col] of [['p10', C.line], ['p100', '#b18cff']]) {
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
      let pen = false;
      for (const p of series) { if (p[k] == null) { pen = false; continue; } if (pen) g.lineTo(X(p.t), Y(p[k])); else { g.moveTo(X(p.t), Y(p[k])); pen = true; } }
      g.stroke();
    }
  }

  function render() {
    const n = now(), c = cls(n.lv);
    $('swNow').innerHTML = `
      <div class="sw-big ${c}"><b>${n.lv.name}</b><span>NOAA solar radiation storm level</span></div>
      <table class="sw-tbl">
        <tr><td>≥10 MeV protons</td><td><b>${U.fmt(n.p10, 3)}</b> pfu</td></tr>
        <tr><td>≥100 MeV protons</td><td><b>${U.fmt(n.p100, 3)}</b> pfu</td></tr>
        <tr><td>7-day peak (≥10 MeV)</td><td>${U.fmt(n.peak, 3)} pfu <span class="muted">(S1 starts at 10)</span></td></tr>
        <tr><td>Latest sample</td><td>${n.t ? new Date(n.t).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '–'}</td></tr>
      </table>
      <p class="sw-adv">${n.lv.crew}</p>
      <p class="muted sw-link">The Live Monitor's “Solar particle event” scenarios show what NeuroShield does when such a storm reaches the crew.</p>`;
    chart();
    $('swScale').innerHTML = '<tr><th>Level</th><th>≥10 MeV flux</th><th>What the crew does</th></tr>' +
      S.slice(1).map((x) => `<tr${x.s === n.lv.s ? ' class="sel"' : ''}><td><b>${x.name}</b></td><td class="mono">≥ ${x.v.toLocaleString('en')} pfu</td><td>${x.crew}</td></tr>`).join('');
    $('swSrc').innerHTML = `${source} · <a href="${N.url}" target="_blank" rel="noopener">${N.url}</a>`;
  }

  function init() { load(); }

  return { init, render };
})();
