// Live monitor view: signal cards, health score, body map, alerts and event log.
NS.live = (function () {
  const D = window.NS_DATA;
  const U = NS.util;
  const ST = NS.stream;
  const SYS_ORDER = ['neuro', 'cardio', 'resp', 'metabolic', 'thermal', 'env'];
  const FILTERS = [['all', 'All'], ['caution', 'Cautions'], ['neuro', 'Neuro'], ['cardio', 'Cardio'], ['resp', 'Respiratory'], ['metabolic', 'Metabolic'], ['thermal', 'Thermal'], ['env', 'Habitat']];
  const CRIT_LABELS = ['microsleep', 'A-LOC', 'high_G_risk', 'hypercapnia', 'spatial_disorientation', 'fever', 'solar', '_L2', 'cognitive_overload', 'dcs_high', 'dcs_symptoms', 'heat_stress', 'cold_cabin'];
  let win = 180, filter = 'all', sound = false, dirty = true, lastDraw = 0, lastScore = null;
  const cards = {};
  const $ = (id) => document.getElementById(id);

  function labelColor(l) {
    if (!l || l === 'nominal') return '#34d39955';
    if (l === 'hypoxia' || CRIT_LABELS.some((k) => l.includes(k))) return '#f87171';
    return '#fbbf24';
  }

  function init() {
    // mission switch (ISS / Moon / Mars): every scenario exists once per mission
    for (const m of D.missions) {
      const b = U.el('button', { 'data-m': m.id }, `${m.label} <small>${m.gravity}</small>`);
      b.addEventListener('click', () => setMission(m.id));
      U.tip(b, () => `<b>${m.label} · ${m.gravity}</b><p>${m.desc}</p><p class="tip-f">Signal delay to Earth: ${delayText(m.delay_s)} one way.</p>`);
      $('missionSeg').appendChild(b);
    }
    $('scenarioSel').addEventListener('change', (e) => load(e.target.value));

    // filters
    for (const [id, name] of FILTERS) {
      const b = U.el('button', { 'data-f': id, class: id === filter ? 'on' : '' }, name);
      b.addEventListener('click', () => { filter = id; document.querySelectorAll('#filters button').forEach((x) => x.classList.toggle('on', x.dataset.f === id)); applyFilter(); });
      $('filters').appendChild(b);
    }

    // cards
    const keys = Object.keys(D.ranges.live).sort((a, b) => SYS_ORDER.indexOf(D.ranges.live[a].system) - SYS_ORDER.indexOf(D.ranges.live[b].system));
    for (const k of keys) {
      const def = D.ranges.live[k];
      const c = U.el('div', { class: 'card', 'data-sys': def.system });
      c.innerHTML = `
        <div class="card-h"><span class="card-t">${def.label}</span><span class="card-s">${def.sensor}</span></div>
        <div class="card-v"><b>–</b><small>${def.unit}</small><span class="pill c-na">–</span></div>
        <canvas></canvas>
        <div class="card-f"><span>avg <b data-s="mean">–</b></span><span>min <b data-s="min">–</b></span><span>max <b data-s="max">–</b></span><span title="Normal range">⟦${U.rangeText(def.normal, def.dec)}⟧</span></div>`;
      $('cards').appendChild(c);
      cards[k] = { el: c, def, val: c.querySelector('.card-v b'), pill: c.querySelector('.pill'), cv: c.querySelector('canvas'),
        mean: c.querySelector('[data-s=mean]'), min: c.querySelector('[data-s=min]'), max: c.querySelector('[data-s=max]') };
      U.tip(c, () => cardTip(k));
    }

    // system bars
    for (const id of SYS_ORDER) {
      $('sysbars').appendChild(U.el('div', { class: 'sysbar', id: 'sb-' + id }, `<div><span>${D.ranges.systems[id].label}</span><b>–</b></div><div class="bar"><i></i></div>`));
    }
    NS.bodymap.mount($('bodymap'), renderBodyInfo);

    // controls
    $('playBtn').addEventListener('click', () => (ST.S.playing ? ST.stop() : ST.play()));
    $('restartBtn').addEventListener('click', () => { ST.seek(0); ST.play(); });
    $('speedSel').addEventListener('change', (e) => ST.setSpeed(+e.target.value));
    $('winSel').addEventListener('change', (e) => { win = +e.target.value; dirty = true; });
    $('seek').addEventListener('input', (e) => { if (ST.S.source === 'scenario') ST.seek(+e.target.value); });
    $('soundBtn').addEventListener('click', () => {
      sound = !sound;
      $('soundBtn').textContent = sound ? '🔊' : '🔈';
      $('soundBtn').setAttribute('aria-label', `Audible alerts (${sound ? 'on' : 'off'})`);
      if (sound) beep(660, 0.08);
      U.tipRefresh();
    });
    // header chip: where the selected scenario takes place, its gravity and the radio delay to Earth
    U.tip($('envChip'), () => {
      const sc = D.scenarios.find((x) => x.id === ST.S.scenario) || D.scenarios[0], m = sc.mission, d = m.delay_s;
      const g = m.g == null ? '' : m.g < 0.01 ? 'Near-weightless: fluids shift to the head, bones and muscles unload, balance adapts.'
        : m.g < 0.5 ? `${Math.round(m.g * 100)} % of Earth gravity: you weigh ${Math.round(m.g * 100)} % of your Earth weight.`
        : m.g > 1.2 ? `${m.g} g peak load: blood is pushed towards the feet; watch for grey-out and G-LOC.` : 'Earth-like gravity.';
      const lead = d === 0 ? 'Recorded on Earth: no radio delay.' : d < 60 ? 'Mission control can answer almost at once, so the flight surgeon leads the response to an alert.'
        : `A question and its answer take ${2 * Math.round(d / 60)} min, so the Crew Medical Officer leads and NeuroShield sends the alert package to Earth.`;
      return `<h4>${sc.environment} · ${m.gravity} · ⇄ ${delayText(d)}</h4>
        <table><tr><td>Where</td><td>${m.where}</td></tr>
        <tr><td>Gravity</td><td>${m.gravity}. ${g}</td></tr>
        <tr><td>⇄ ${delayText(d)}</td><td>${d ? `One-way radio delay to Earth (round trip ${delayText(2 * d)}). ` : ''}${lead}</td></tr></table>
        <div class="tip-legend">Changes with the mission (ISS / Moon / Mars / Lab) and the scenario.</div>`;
    });
    U.tip($('soundBtn'), () => `<h4>Audible alerts <span class="pill c-${sound ? 'ok' : 'na'}">${sound ? 'ON' : 'OFF'}</span></h4>
      <p>${sound ? 'Two short beeps sound' : 'When switched on, two short beeps sound'} the moment an alert turns <b class="c-crit">critical (red, ALERT)</b>, so the crew does not miss it while looking away from the screen, e.g. at the robotic arm or supporting an EVA.</p>
      <table>
        <tr><td>Switching on</td><td>One short test beep</td></tr>
        <tr><td>No sound for</td><td>Amber cautions · a critical alert that is already active (only its first moment) · alerts rebuilt when you scrub the timeline</td></tr>
      </table>
      <div class="tip-src">Click to turn ${sound ? 'off' : 'on'}. Off when the page opens.</div>`);
    $('deviceBtn').addEventListener('click', () => $('deviceDlg').showModal());
    // demo version: device streaming is not available yet (ST.connectWs stays for the full version)
    $('deviceDlg').addEventListener('close', () => { if ($('deviceDlg').returnValue === 'ok') $('deviceDemoDlg').showModal(); });
    window.addEventListener('resize', () => { dirty = true; });
    document.addEventListener('keydown', (e) => {
      if (!document.getElementById('view-live').classList.contains('active')) return;
      if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); ST.S.playing ? ST.stop() : ST.play(); }
    });

    ST.on(onStream);
    ST.setSpeed(+$('speedSel').value);
    requestAnimationFrame(loop);
  }

  let mission = null;

  function fillScenarios() {
    const sel = $('scenarioSel');
    sel.innerHTML = '';
    for (const s of D.scenarios.filter((x) => x.missionId === mission)) sel.appendChild(U.el('option', { value: s.id }, `${s.title} · ${s.environment}`));
    document.querySelectorAll('#missionSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === mission));
  }

  // switching mission keeps the same kind of scenario (e.g. G-LOC on the ISS -> G-LOC on Mars)
  function setMission(id) {
    if (id === mission) return;
    const cur = D.scenarios.find((s) => s.id === ST.S.scenario);
    mission = id;
    U.store('mission', id);
    fillScenarios();
    const next = D.scenarios.find((s) => s.missionId === id && (!cur || s.base === cur.base)) || D.scenarios.find((s) => s.missionId === id);
    load(next.id);
  }

  function load(id) {
    const sc = D.scenarios.find((s) => s.id === id) || D.scenarios[0];
    id = sc.id;
    if (sc.missionId !== mission) { mission = sc.missionId; U.store('mission', mission); fillScenarios(); }
    U.store('scenario', id);
    $('scenarioSel').value = id;
    $('scTitle').textContent = sc.title + ' —';
    $('scDesc').textContent = sc.description;
    const m = sc.mission;
    $('envChip').textContent = `${sc.environment} · ${m.gravity} · ⇄ ${delayText(m.delay_s)}`;
    $('seek').max = sc.duration_s;
    ST.loadScenario(id);
    drawStrip();
    crewNote();
  }

  // ground-truth label strip on the timeline (labels belong to the selected crew member's own run)
  function drawStrip() {
    const sc = D.scenarios.find((s) => s.id === ST.S.scenario);
    if (!sc) return;
    const strip = $('tlLabels');
    strip.innerHTML = '';
    const L = ST.track(sc.id).labels;
    for (let i = 0; i < L.length; i++) {
      const t0 = L[i][0], t1 = i + 1 < L.length ? L[i + 1][0] : sc.duration_s;
      strip.appendChild(U.el('i', { style: `width:${(t1 - t0) / sc.duration_s * 100}%;background:${labelColor(L[i][1])}`, title: `${U.mmss(t0)}–${U.mmss(t1)} ${L[i][1]}` }));
    }
  }

  // who the live stream belongs to, and the baseline it was shifted to
  function crewNote() {
    const P = ST.profile(), id = ST.S.crew;
    const cl = D.crewLive && D.crewLive[id];
    if (cl) {
      const prof = NS.logbook.allProfiles().find((p) => p.id === id), r = cl.rest;
      // who is involved in this scenario, and how (click to switch crew member)
      const sid = ST.S.scenario;
      const cast = Object.keys(D.liveCrew).map((c) => {
        const run = (D.recCrew && D.recCrew[c] && D.recCrew[c][sid]) || D.liveCrew[c][sid];
        if (!run) return '';
        const name = (NS.logbook.allProfiles().find((p) => p.id === c) || { name: c }).name;
        return `<button class="cast ${run.affected ? 'hit' : 'calm'}${c === id ? ' me' : ''}" data-c="${c}" title="${name}: ${run.role}"><b>${c}</b> ${run.role}</button>`;
      }).join('');
      const rec = D.recCrew && D.recCrew[id] && D.recCrew[id][sid];
      $('crewNote').innerHTML = `<div class="cast-row">${cast}</div>
        <div>${rec ? `Replaying a <b>real recording</b> for ${prof ? prof.name : id}: ${rec.role}. Only the channels this dataset records are shown.`
          : `Streaming <b>${prof ? prof.name : id}</b> · own sensor data · resting HR ${r.HR} bpm, HRV ${r.RMSSD} ms, BP ${r.SBP}/${r.DBP} mmHg, SpO2 ${r.SPO2} % · ${cl.trait}`}</div>`;
      $('crewNote').querySelectorAll('.cast').forEach((b) => b.addEventListener('click', () => {
        $('crewSel').value = b.dataset.c;
        $('crewSel').dispatchEvent(new Event('change'));
      }));
      return;
    }
    if (!P) { $('crewNote').textContent = ''; return; }
    const prof = NS.logbook.allProfiles().find((p) => p.id === P.id);
    const o = P.own, f = (v, d = 0) => (v == null ? '–' : (+v).toFixed(d));
    $('crewNote').innerHTML = o.rhr == null
      ? `Streaming for <b>${prof ? prof.name : P.id}</b> · no daily log yet, so the reference crew baseline is used. Log a check-in to personalise it.`
      : `Streaming for <b>${prof ? prof.name : P.id}</b> · own resting baseline (median of the last 14 log days): HR ${f(o.rhr)} bpm, HRV ${f(o.rmssd)} ms, BP ${f(o.sbp)}/${f(o.dbp)} mmHg, glucose ${f(o.glucose)} mg/dL, temp ${f(o.temp, 1)} °C`;
  }

  function delayText(s) { return s < 60 ? s + ' s' : Math.round(s / 60) + ' min'; }

  // Distance from Earth decides who leads the response to a critical alert.
  function escalation() {
    const sc = ST.S.source === 'scenario' && D.scenarios.find((x) => x.id === ST.S.scenario);
    const d = sc ? sc.mission.delay_s : 0;
    if (d < 60) return '➜ Inform the flight surgeon / mission control.';
    const min = Math.round(d / 60);
    return `➜ Earth is ${min} min away (${2 * min} min for a reply): the Crew Medical Officer leads; NeuroShield sends the alert package to the flight surgeon.`;
  }

  function onStream(e) {
    if (e.type === 'crew') { crewNote(); drawStrip(); applyFilter(); }
    if (e.type === 'reset') { applyFilter(); $('events').innerHTML = ''; renderAlerts(); lastScore = null; dirty = true; }
    if (e.type === 'state') $('playBtn').textContent = ST.S.playing ? '❚❚ Pause' : '▶ Play';
    if (e.type === 'end') logEvent(ST.S.idx, 'info', 'Scenario finished — open “Daily Check-in” to log this session.');
    if (e.type === 'ws') logEvent(ST.S.idx, e.status === 'open' ? 'info' : 'warn', 'Device stream ' + e.status + (e.msg ? ': ' + e.msg : ''));
    if (e.type === 'sample') {
      let newCrit = false;
      for (const c of e.changes || []) {
        if (c.level) {
          logEvent(c.t, c.level, `${c.level === 'crit' ? 'ALERT' : 'Caution'} · ${c.rule.title}`);
          if (c.level === 'crit' && c.prev !== 'crit') newCrit = true;
        } else logEvent(c.t, 'ok', `Cleared · ${c.rule.title}`);
      }
      if ((e.changes || []).length) renderAlerts();
      if (newCrit && sound && !e.rebuilt) { beep(880, 0.15); setTimeout(() => beep(880, 0.15), 220); }
      dirty = true;
    }
  }

  function loop(ts) {
    if (dirty && ts - lastDraw > 90) { draw(); dirty = false; lastDraw = ts; }
    requestAnimationFrame(loop);
  }

  // Lab replays of real recordings: only the channels that dataset records are shown (null = show all)
  function recChannels() {
    const rec = D.recCrew && ST.S.source === 'scenario' && D.recCrew[ST.S.crew] && D.recCrew[ST.S.crew][ST.S.scenario];
    return rec ? new Set(Object.keys(rec.cols).filter((k) => cards[k] && rec.cols[k].some((v) => v != null))) : null;
  }

  function applyFilter() {
    const only = recChannels();
    // system filters without any recorded channel are hidden too
    document.querySelectorAll('#filters button').forEach((b) => {
      const f = b.dataset.f;
      b.hidden = !!only && f !== 'all' && f !== 'caution' && ![...only].some((k) => cards[k].def.system === f);
      if (b.hidden && filter === f) { filter = 'all'; document.querySelectorAll('#filters button').forEach((x) => x.classList.toggle('on', x.dataset.f === 'all')); }
    });
    if (filter === 'caution') { dirty = true; return; } // decided on every draw: the status changes each second
    for (const k in cards) cards[k].el.style.display = (!only || only.has(k)) && (filter === 'all' || cards[k].def.system === filter) ? '' : 'none';
    $('noCautions').hidden = true;
    dirty = true;
  }

  function draw() {
    const t = ST.S.t;
    const n = t.length;
    const tEnd = n ? t[n - 1] : 0;
    const xmax = Math.max(tEnd, win), xmin = xmax - win;
    $('clock').textContent = U.mmss(tEnd);
    if (ST.S.source === 'scenario') $('seek').value = ST.S.idx;
    $('phase').textContent = ST.S.phase || '–';
    const cur = ST.current();
    // "Cautions" filter: every card whose value has left the normal (green) band right now
    let nCaution = 0;
    const only = recChannels();
    for (const k in cards) {
      if (only && !only.has(k)) continue;
      const s = U.status(cards[k].def, cur[k]);
      const off = s === 'warn' || s === 'crit';
      if (off) nCaution++;
      if (filter === 'caution') cards[k].el.style.display = off ? '' : 'none';
    }
    const cb = document.querySelector('#filters button[data-f=caution]');
    cb.innerHTML = `Cautions <b class="${nCaution ? 'cnt on' : 'cnt'}">${nCaution}</b>`;
    $('noCautions').hidden = filter !== 'caution' || nCaution > 0;
    for (const k in cards) {
      const c = cards[k];
      if (c.el.style.display === 'none') continue;
      const v = cur[k];
      const s = U.status(c.def, v);
      c.el.className = 'card ' + s;
      c.val.textContent = U.fmt(v, c.def.dec);
      c.val.className = 'c-' + s;
      c.pill.textContent = s === 'na' && c.def.sensor.includes('EVA only') ? 'EVA only' : U.STATUS_TEXT[s];
      c.pill.className = 'pill c-' + s;
      const st = ST.stats(k);
      c.mean.textContent = st ? U.fmt(st.mean, c.def.dec) : '–';
      c.min.textContent = st ? U.fmt(st.min, c.def.dec) : '–';
      c.max.textContent = st ? U.fmt(st.max, c.def.dec) : '–';
      const buf = ST.S.buf[k];
      const pts = [];
      for (let i = Math.max(0, n - win - 1); i < n; i++) pts.push({ x: t[i], y: buf[i] });
      NS.chart.draw(c.cv, { pts, xmin, xmax, def: c.def, mean: st && st.mean, compact: true, xfmt: U.mmss,
        statusColor: NS.chart.C[s === 'ok' ? 'ok' : s === 'warn' ? 'caution' : s === 'crit' ? 'crit' : 'line'] });
    }
    // score
    if (n) {
      const sc = NS.score.compute(cur, D.ranges, NS.rules.current());
      lastScore = sc;
      const band = NS.score.band(sc.overall);
      $('scoreNum').textContent = Math.round(sc.overall);
      $('scoreNum').className = 'c-' + band;
      $('scoreWord').textContent = 'Health score · ' + NS.score.word(sc.overall);
      const arc = $('gArc');
      arc.style.strokeDashoffset = 157 * (1 - sc.overall / 100);
      arc.style.stroke = band === 'ok' ? 'var(--ok)' : band === 'warn' ? 'var(--warn)' : 'var(--crit)';
      for (const id of SYS_ORDER) {
        const s = sc.systems[id];
        const box = $('sb-' + id);
        if (!s) continue;
        box.querySelector('b').textContent = Math.round(s.score);
        const i = box.querySelector('i');
        i.style.width = s.score + '%';
        i.style.background = `var(--${NS.score.band(s.score)})`;
      }
      NS.bodymap.color(sc.systems);
      renderBodyInfo(NS.bodymap.selected);
    }
    U.tipRefresh();
  }

  // hover popup of a signal card: what it is, its limits and what the current value means
  function cardTip(k) {
    const def = D.ranges.live[k];
    const v = ST.current()[k];
    const s = U.status(def, v);
    const st = ST.stats(k);
    const u = def.unit ? ' ' + def.unit : '';
    const eva = s === 'na' && def.sensor.includes('EVA only');
    let trend = '';
    if (!isNaN(v) && def.axis) {
      const ch = ST.ctx.slope(k, 30) * 30; // change over the last 30 s
      const rel = ch / (def.axis[1] - def.axis[0]);
      trend = Math.abs(rel) < 0.02 ? '→ stable' : (ch > 0 ? '↑ rising' : '↓ falling') + ` (${ch > 0 ? '+' : ''}${U.fmt(ch, def.dec)}${u} in 30 s)`;
    }
    const sub = U.subScore(def, v);
    const sys = D.ranges.systems[def.system].label;
    return `<h4>${def.label}</h4>
      <div class="tip-meta">${sys} · ${def.sensor}</div>
      <p>${def.desc}</p>
      <table>
        <tr><td>Current</td><td><b class="c-${s}">${eva ? 'no EVA in progress' : U.fmt(v, def.dec) + u}</b> ${s !== 'na' ? `<span class="pill c-${s}">${U.STATUS_TEXT[s]}</span>` : ''}</td></tr>
        ${eva ? '' : `<tr><td>Meaning</td><td>${U.explain(def, v)}</td></tr>`}
        ${trend ? `<tr><td>Trend</td><td>${trend}</td></tr>` : ''}
        <tr><td>Normal</td><td class="c-ok">${U.rangeText(def.normal, def.dec)}${u}</td></tr>
        <tr><td>Caution</td><td class="c-warn">${U.rangeText(def.warn, def.dec)}${u} <span class="muted">· beyond = alert</span></td></tr>
        ${st ? `<tr><td>Session</td><td>avg ${U.fmt(st.mean, def.dec)} · min ${U.fmt(st.min, def.dec)} · max ${U.fmt(st.max, def.dec)}${u} <span class="muted">(${st.n} s)</span></td></tr>` : ''}
        ${sub != null ? `<tr><td>Sub-score</td><td>${Math.round(sub)} / 100 <span class="muted">→ ${sys} score</span></td></tr>` : ''}
      </table>
      <div class="tip-legend">Chart: green band and green dashed lines = normal limits · red dashed = caution limits · dotted = session average.</div>
      <div class="tip-src">Basis: ${def.source}</div>`;
  }

  function renderBodyInfo(sys) {
    const info = NS.bodymap.INFO[sys];
    const s = lastScore && lastScore.systems[sys];
    const cur = ST.current();
    let rows = '';
    for (const k in D.ranges.live) {
      const def = D.ranges.live[k];
      if (def.system !== sys) continue;
      const st = U.status(def, cur[k]);
      if (st === 'na' && def.sensor.includes('EVA only')) continue;
      rows += `<li><span>${def.label}</span><b class="c-${st}">${U.fmt(cur[k], def.dec)} ${def.unit}</b></li>`;
    }
    // latest daily-log values of the selected crew member for the same body system
    const log = NS.logbook.rowsFor(NS.logbook.crew);
    const last = log[log.length - 1];
    let daily = '';
    if (last) {
      for (const k in D.ranges.daily) {
        const def = D.ranges.daily[k];
        if (def.system !== sys || !def.normal || last[k] == null || last[k] === '') continue;
        daily += `<li><span>${def.label}</span><b class="c-${U.status(def, +last[k])}">${U.fmt(+last[k], def.dec)} ${def.unit}</b></li>`;
      }
    }
    $('bodyInfo').innerHTML = `<h4>${info.name} ${s ? `<span class="c-${NS.score.band(s.score)}">${Math.round(s.score)}</span>` : ''}</h4>
      <div class="muted">${info.what}</div><div style="margin-top:4px"><b>Spaceflight hazard:</b> <span class="muted">${info.hazard}</span></div>
      <div class="bi-h">Live now</div><ul>${rows}</ul>
      ${daily ? `<div class="bi-h">Daily log · day ${last.day}</div><ul>${daily}</ul>` : ''}`;
  }

  function renderAlerts() {
    const list = NS.rules.current();
    const box = $('alerts');
    if (!list.length) { box.innerHTML = '<p class="muted">No active alerts. All monitored conditions are within limits.</p>'; return; }
    box.innerHTML = list.map((a) => `
      <div class="alert ${a.level}">
        <h4><span>${a.level === 'crit' ? '⚠' : '●'} ${a.rule.title}</span><span class="mono muted">since ${U.mmss(a.since)}</span></h4>
        <div class="why">${a.why}</div>
        <ol>${a.rule.advice.map((x) => `<li>${x}</li>`).join('')}</ol>
        ${a.rule.escalate && a.level === 'crit' ? `<div class="esc">${escalation()}</div>` : ''}
        <div class="ref">Basis: ${a.rule.ref}</div>
      </div>`).join('');
  }

  function logEvent(t, level, text) {
    const li = U.el('li', null, `<span>${U.mmss(t)}</span><b class="c-${level === 'info' ? 'na' : level}">${text}</b>`);
    $('events').prepend(li);
  }

  let actx = null;
  function beep(freq, dur) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; g.gain.value = 0.08;
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* audio unavailable */ }
  }

  // averages of the current session, used to pre-fill the daily log
  function summary() {
    const o = {};
    for (const k of ST.KEYS) { const s = ST.stats(k); if (s) o[k] = s.mean; }
    return ST.S.t.length ? o : null;
  }

  return { init, load, summary, redraw: () => { dirty = true; } };
})();
