// Per-user daily logbook: dataset rows + entries the user adds (localStorage),
// trend chart with reference limits, anomaly heat-map, detected episodes and CSV export.
NS.logbook = (function () {
  const D = window.NS_DATA;
  const U = NS.util;
  const $ = (id) => document.getElementById(id);
  const SHOW = NS.anomaly.METRICS;
  const CAREER_MSV = 600; // NASA career limit, effective dose (NASA-STD-3001 Vol. 1 Rev. B)
  const Q_MEAN = 2; // approximate mean quality factor of ISS radiation: mGy -> mSv
  const COLS = ['day', ...SHOW, 'body_mass', 'symptoms'];
  const PAGE = 10, KEEP = 50; // recent entries: last 50, 10 per page
  // chart plot area and anomaly-map columns share these margins, so day N sits at the same x in both
  const AX_L = 190, AX_R = 10;
  let metric = 'sleep_h', crew = 'A', result = null, rows = [], page = 0, hover = null;

  function entries() { return U.store('entries') || {}; }

  // Demo version: only the four dataset crew members. Profiles created by earlier builds are removed
  // together with their logbook entries and check-in progress.
  function purgeProfiles() {
    const extra = U.store('profiles') || [];
    if (!extra.length) return;
    const e = entries(), g = U.store('game') || {};
    for (const p of extra) { delete e[p.id]; delete g[p.id]; }
    U.store('entries', e);
    U.store('game', g);
    U.store('profiles', []);
  }
  purgeProfiles();

  function allProfiles() {
    return D.crew.map((c) => ({ id: c.id, name: c.name, mass: c.mass }));
  }

  function rowsFor(id) {
    const base = D.daily.filter((r) => r.crew === id);
    const extra = (entries()[id] || []);
    return base.concat(extra).sort((a, b) => a.day - b.day);
  }

  function addEntry(id, row) {
    const e = entries();
    const list = rowsFor(id);
    row.crew = id;
    row.day = list.length ? list[list.length - 1].day + 1 : 1;
    (e[id] = e[id] || []).push(row);
    U.store('entries', e);
    return row.day;
  }

  function init() {
    NS.images.bindLog(() => crew);
    const ms = $('metricSel');
    for (const m of SHOW) ms.appendChild(U.el('option', { value: m }, D.ranges.daily[m].label));
    ms.value = metric;
    ms.addEventListener('change', () => { metric = ms.value; render(); });
    $('exportBtn').addEventListener('click', exportCsv);
    // anomaly map: one hover tip for the whole grid, filled from the cell under the mouse
    const heat = $('heat');
    let hc = null;
    heat.addEventListener('mouseover', (e) => { hc = e.target.closest('.hc'); U.tipRefresh(); });
    U.tip(heat, () => heatTip(hc));
    // hover: nearest plotted day (within 16 px) shows its day and value
    const cv = $('lbChart');
    cv.addEventListener('mousemove', (e) => {
      const map = cv._map;
      if (!map) return;
      const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = null, bd = 16;
      for (const p of map.pts) {
        if (p.y == null || isNaN(p.y)) continue;
        const d = Math.hypot((map.X(p.x) - mx), (map.Y(p.y) - my) * 0.25);
        if (d < bd) { bd = d; best = p.x; }
      }
      if (best !== hover) { hover = best; drawChart(); U.tipRefresh(); }
    });
    cv.addEventListener('mouseleave', () => { if (hover != null) { hover = null; drawChart(); } });
    U.tip(cv, pointTip);
    window.addEventListener('resize', () => { if ($('view-logbook').classList.contains('active')) drawChart(); });
  }

  function setCrew(id) { crew = id; page = 0; }

  function render() {
    rows = rowsFor(crew);
    hover = null;
    result = rows.length ? NS.anomaly.detect(rows) : null;
    drawChart();
    drawHeat();
    drawEpisodes();
    drawTable();
    NS.images.renderLog(crew);
    drawRadiation();
  }

  // cumulative mission dose versus the career limit (radiation-induced cancer risk)
  function drawRadiation() {
    const d = rows.filter((r) => r.dose_mGy != null && r.dose_mGy !== '').map((r) => +r.dose_mGy);
    if (!d.length) { $('radBox').innerHTML = '<p class="muted">No dose readings yet.</p>'; return; }
    const msv = d.reduce((a, b) => a + b, 0) * Q_MEAN;
    const pct = msv / CAREER_MSV * 100;
    const rate = msv / d.length;
    $('radBox').innerHTML = `<div class="evalrow"><span>Mission dose so far (${d.length} days)</span><b>≈ ${msv.toFixed(1)} mSv</b></div>
      <div class="bar rad"><i style="width:${Math.min(100, pct)}%"></i></div>
      <div class="evalrow"><span>Share of the NASA career limit (${CAREER_MSV} mSv)</span><b>${pct.toFixed(1)} %</b></div>
      <div class="evalrow"><span>At this rate: 6-month mission / 3-year Mars mission</span><b>${(rate * 182).toFixed(0)} / ${(rate * 1095).toFixed(0)} mSv</b></div>
      <p class="muted" style="margin:6px 0 0">Daily doses are <b>real ISS dosimetry</b> (NASA OSDR EDA, mission RR-7, Jul–Sep 2018; the day-20 solar event is added for the demo). Absorbed dose × mean quality factor ≈ ${Q_MEAN}.</p>`;
  }

  function drawChart() {
    const def = D.ranges.daily[metric];
    const prof = allProfiles().find((p) => p.id === crew);
    $('lbTitle').innerHTML = `${def.label} <small>${def.unit} · ${prof ? prof.name : crew} · normal ${U.rangeText(def.normal, def.dec)}</small>`;
    const pts = rows.map((r) => ({ x: r.day, y: r[metric] === '' || r[metric] == null ? null : +r[metric] }));
    const markers = [];
    if (result) {
      for (const e of result.episodes) {
        for (let d = e.start; d <= e.end; d++) markers.push({ x: d, y: null, color: e.envOnly ? '#5eb3ff' : e.severity === 'crit' ? '#f87171' : '#fbbf24', w: 10 });
      }
      const z = result.z[metric];
      rows.forEach((r, i) => {
        if (z[i] == null) return;
        if (result.flagged[metric][i]) markers.push({ x: r.day, y: +r[metric], color: '#f87171', r: 6 });
        else if (Math.abs(z[i]) >= NS.anomaly.Z_WATCH) markers.push({ x: r.day, y: +r[metric], color: '#fbbf24', r: 5 });
      });
    }
    const xmax = rows.length ? rows[rows.length - 1].day : 1;
    const hp = hover == null ? null : pts.find((p) => p.x === hover && p.y != null);
    NS.chart.draw($('lbChart'), { pts, xmin: rows.length ? rows[0].day - 0.5 : 0, xmax: xmax + 0.5, def, markers, dots: true, hover: hp, padL: AX_L, padR: AX_R,
      noLast: true, xfmt: (x) => 'D' + Math.round(x), mean: pts.length ? pts.reduce((a, p) => a + (p.y || 0), 0) / pts.filter((p) => p.y != null).length : null });
  }

  function heatTip(cell) {
    if (!cell || !result) return '<div class="tip-meta">Hover a cell to see the value against your own baseline. Click a row to plot it.</div>';
    const m = cell.dataset.m, i = +cell.dataset.i, def = D.ranges.daily[m], r = rows[i];
    const v = r[m], z = result.z[m][i], flag = result.flagged[m][i];
    const s = v == null || v === '' ? 'na' : U.status(def, +v);
    const ep = flag && result.episodes.find((e) => r.day >= e.start && r.day <= e.end && e.metrics.includes(m));
    return `<h4>${def.label}</h4>
      <div class="tip-meta">Mission day ${r.day}${r.date ? ' · ' + r.date + ' · your entry' : ''}</div>
      <table>
        <tr><td>Value</td><td>${v == null || v === '' ? '<span class="muted">not measured</span>' : `<b>${U.fmt(+v, def.dec)} ${def.unit}</b> <span class="pill c-${s}">${U.STATUS_TEXT[s]}</span>`}</td></tr>
        <tr><td>Own baseline</td><td>${z == null ? 'still forming (first days)' : (z > 0 ? '+' : '') + z.toFixed(1) + ' σ ' + (Math.abs(z) < 1 ? '· usual' : z > 0 ? '· above usual' : '· below usual')}</td></tr>
        <tr><td>Flag</td><td>${[s === 'crit' ? '<b class="c-crit">alert</b> (outside the caution limit)' : '', flag ? `<b class="c-warn">anomaly</b> (|z| ≥ ${NS.anomaly.Z_ANOM})` : ''].filter(Boolean).join(' + ') || 'none'}</td></tr>
        ${ep ? `<tr><td>Episode</td><td>${ep.title} (day ${ep.start}–${ep.end})</td></tr>` : ''}
        ${def.normal ? `<tr><td>Normal</td><td>${U.rangeText(def.normal, def.dec)} ${def.unit}</td></tr>` : ''}
      </table>`;
  }

  function pointTip() {
    const def = D.ranges.daily[metric];
    const i = rows.findIndex((r) => r.day === hover);
    if (i < 0) return `<h4>${def.label}</h4><div class="tip-meta">Move along the line to read a day's value.</div>`;
    const r = rows[i], v = +r[metric], s = U.status(def, v);
    const z = result && result.z[metric][i];
    const ep = result && result.episodes.find((e) => r.day >= e.start && r.day <= e.end);
    return `<h4>Mission day ${r.day}</h4>
      <div class="tip-meta">${r.date ? r.date + ' · your entry' : 'mission log'}</div>
      <table>
        <tr><td>${def.label}</td><td><b>${U.fmt(v, def.dec)} ${def.unit}</b> <span class="pill c-${s}">${U.STATUS_TEXT[s]}</span></td></tr>
        <tr><td>Normal</td><td>${U.rangeText(def.normal, def.dec)} ${def.unit}</td></tr>
        <tr><td>Own baseline</td><td>${z == null ? 'still forming' : (z > 0 ? '+' : '') + z.toFixed(1) + ' σ' + (result.flagged[metric][i] ? ' · flagged' : '')}</td></tr>
        ${ep ? `<tr><td>Episode</td><td>${ep.title} (day ${ep.start}–${ep.end})</td></tr>` : ''}
      </table>`;
  }

  function drawHeat() {
    const box = $('heat');
    if (!result) { box.innerHTML = '<p class="muted">No entries yet. Add one in “Daily Check-in”.</p>'; return; }
    box.style.gridTemplateColumns = `${AX_L - 1}px repeat(${rows.length}, minmax(7px, 1fr))`;
    box.style.paddingRight = AX_R + 'px';
    let h = '<span></span>' + rows.map((r) => `<span class="hd">${r.day % 5 === 0 ? r.day : ''}</span>`).join('');
    for (const m of SHOW) {
      const def = D.ranges.daily[m];
      h += `<span class="hl ${m === metric ? 'sel' : ''}" data-m="${m}">${def.label}</span>`;
      // red = alert (outside the caution limit), amber = anomaly against own baseline,
      // blue shade = distance from the person's own baseline (|z| / 5)
      result.z[m].forEach((z, i) => {
        const v = rows[i][m];
        const st = v == null || v === '' ? 'na' : U.status(def, +v) === 'crit' ? 'alert' : result.flagged[m][i] ? 'flag' : z == null ? 'base' : 'ok';
        const a = z == null ? 0 : Math.min(1, Math.abs(z) / 5);
        h += `<span class="hc" data-m="${m}" data-i="${i}" data-z="${st}" style="--z:${a.toFixed(2)}"></span>`;
      });
    }
    box.innerHTML = h;
    box.querySelectorAll('[data-m]').forEach((e) => e.addEventListener('click', () => { metric = e.dataset.m; $('metricSel').value = metric; render(); }));
  }

  function drawEpisodes() {
    const box = $('episodes');
    if (!result || !result.episodes.length) { box.innerHTML = '<p class="muted">No anomalies detected.</p>'; $('evalBox').innerHTML = ''; return; }
    const truth = D.injected.filter((t) => t.crew === crew || t.crew === 'ALL');
    box.innerHTML = result.episodes.slice().reverse().map((e, k) => {
      const gt = truth.filter((t) => NS.anomaly.matches(e, t));
      const labels = e.metrics.map((m) => D.ranges.daily[m].label).join(', ');
      return `<div class="episode ${e.envOnly ? 'env' : e.severity}" data-m="${e.metrics[0]}">
        <h4>${e.envOnly ? '🛰 ' : ''}${e.title}</h4>
        <div class="meta">Day ${e.start}${e.end > e.start ? '–' + e.end : ''} · ${labels}</div>
        <ul>${e.advice.map((a) => `<li>${a}</li>`).join('')}</ul>
        ${gt.length ? `<div class="gt">✓ matches injected event: ${gt.map((t) => t.type).join('; ')}</div>` : ''}
      </div>`;
    }).join('');
    box.querySelectorAll('.episode').forEach((e) => e.addEventListener('click', () => { metric = e.dataset.m; $('metricSel').value = metric; render(); }));

    // detector check against synthetic ground truth
    if (!truth.length) { $('evalBox').innerHTML = '<p class="muted">No ground truth for user-created profiles.</p>'; return; }
    const ev = NS.anomaly.evaluate(crew, result.episodes, D.injected);
    let all = { det: 0, tot: 0, fp: 0 };
    for (const c of D.crew) {
      const r = NS.anomaly.detect(D.daily.filter((x) => x.crew === c.id));
      const e2 = NS.anomaly.evaluate(c.id, r.episodes, D.injected);
      all.det += e2.detected; all.tot += e2.truth.length; all.fp += e2.falsePos;
    }
    $('evalBox').innerHTML = ev.truth.map((t, i) => `<div class="evalrow"><span>${t.type} <span class="muted">(D${t.days[0]}–${t.days[1]})</span></span><b class="${ev.hit[i] ? 'c-ok' : 'c-crit'}">${ev.hit[i] ? 'detected' : 'missed'}</b></div>`).join('')
      + `<div class="evalrow"><span>False episodes (this crew)</span><b>${ev.falsePos}</b></div>`
      + `<p class="muted" style="margin:8px 0 0">All crew: ${all.det}/${all.tot} injected events detected, ${all.fp} false episode(s).</p>`;
  }

  function drawTable() {
    const recent = rows.slice(-KEEP).reverse();
    const pages = Math.max(1, Math.ceil(recent.length / PAGE));
    page = Math.min(page, pages - 1);
    const last = recent.slice(page * PAGE, page * PAGE + PAGE);
    const head = '<tr>' + COLS.map((c) => `<th>${c === 'day' ? 'Day' : c === 'symptoms' ? 'Symptoms' : c === 'body_mass' ? 'Mass kg' : D.ranges.daily[c].label}</th>`).join('') + '</tr>';
    const body = last.map((r) => '<tr>' + COLS.map((c) => {
      const def = D.ranges.daily[c];
      const s = def && def.normal && r[c] !== '' && r[c] != null ? U.status(def, +r[c]) : '';
      return `<td class="${s}">${r[c] == null ? '' : r[c]}</td>`;
    }).join('') + '</tr>').join('');
    $('lbTable').innerHTML = head + body;
    const first = last.length ? last[0].day : '–', end = last.length ? last[last.length - 1].day : '–';
    $('lbPager').innerHTML = `<button class="btn" data-p="-1" ${page === 0 ? 'disabled' : ''}>‹ Newer</button>
      <span>Page <b>${page + 1}</b> / ${pages} · days ${first}–${end} · last ${recent.length} entries</span>
      <button class="btn" data-p="1" ${page >= pages - 1 ? 'disabled' : ''}>Older ›</button>`;
    $('lbPager').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { page += +b.dataset.p; drawTable(); }));
  }

  function exportCsv() {
    const cols = ['crew', ...COLS];
    const lines = [cols.join(',')].concat(rows.map((r) => cols.map((c) => {
      const v = r[c] == null ? '' : String(r[c]);
      return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `neuroshield_logbook_${crew}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return { init, render, setCrew, rowsFor, addEntry, allProfiles, get crew() { return crew; } };
})();
