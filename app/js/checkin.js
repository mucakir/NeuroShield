// Daily check-in: routine tasks with XP/streaks/badges (gamification), a short
// psychomotor vigilance test (PVT) and the daily log entry form.
NS.checkin = (function () {
  const D = window.NS_DATA;
  const U = NS.util;
  const $ = (id) => document.getElementById(id);
  // Mission routine: each task has a time on the station clock (at, minutes after 00:00), a window in which it
  // counts as on time (win, minutes) and short step-by-step instructions (how).
  const TASKS = [
    { id: 'vitals', t: 'Morning vitals', d: 'BP, resting HR, SpO2, temperature', xp: 20, at: 420, win: 60, test: (r) => r.sbp && r.dbp && r.rhr && r.spo2 && r.temp,
      how: ['Sit quietly for 5 min: back supported, feet flat, no talking, no coffee or exercise in the last 30 min.',
        'Put the NeuroShield headband on and keep still for 1 min: resting HR and SpO2 are read automatically.',
        'Blood pressure: arm supported at heart level; take two readings 1 min apart (the average is logged).',
        'Temperature is taken by the thermistor on waking, before exercise or a hot drink.'] },
    { id: 'glucose', t: 'Fasting glucose', d: 'Before breakfast', xp: 10, at: 435, win: 45, test: (r) => r.glucose,
      how: ['Fasting = nothing to eat or drink except water for 8 h.',
        'The continuous glucose monitor reads automatically; check the value before breakfast.',
        'Below 70 mg/dL: take 15 g of fast sugar, recheck after 15 min.'] },
    { id: 'saliva', t: 'Dry saliva sample', d: 'Morning cortisol booklet', xp: 10, at: 440, win: 30, test: (r) => r.cortisol,
      how: ['Within 30 min of waking, before eating, drinking or brushing teeth.',
        'Hold the paper strip under the tongue until it is fully wet (about 1 min).',
        'Close the booklet, write the time on it and stow it dry; no cold storage needed.'] },
    { id: 'sleep', t: "Sync last night's sleep", d: 'Hours slept + actigraph efficiency', xp: 10, at: 450, win: 60, test: (r) => r.sleep_h && r.sleep_eff,
      how: ['Wear the sleep band all night.',
        'On waking, sync it: hours slept and sleep efficiency fill in on their own.',
        'Less than 6 h, or efficiency under 85 %, turns amber: plan a quieter evening.'] },
    { id: 'mood', t: 'Mood, stress & team check-in', d: 'Takes 10 seconds', xp: 10, at: 465, win: 60, test: (r) => r.mood && r.stress && r.team,
      how: ['Rate how you feel right now, not the whole week.',
        'Pick the emoji, then the stress, team and motion-sickness scales in the log form.',
        'Low scores several days in a row are a cue to talk to a crewmate or the flight surgeon.'] },
    { id: 'pvt', t: 'Reaction self-test', d: '10-trial PVT below', xp: 15, at: 540, win: 90,
      how: ['Find a quiet spot and sit comfortably.',
        'Press the box (or space) as soon as the counter appears; do not press early.',
        'Do it at about the same time each day so the results can be compared.'] },
    { id: 'live', t: 'Live monitoring session', d: 'Wear NeuroShield ≥ 1 min', xp: 15, at: 600, win: 120,
      how: ['Put the NeuroShield headband on and check that the sensors touch the skin.',
        'Open the Live Monitor and stay connected for at least 1 min.',
        'An amber or red card shows what it means and what to do in the alert panel.'] },
    { id: 'food', t: 'Log food intake', d: '% of your energy need', xp: 10, at: 780, win: 120, test: (r) => r.kcal_pct,
      how: ['Estimate how much of the planned meals you ate so far today (in %).',
        'Note food you skipped or swapped.',
        'Under 80 % for several days leads to weight loss: tell the flight surgeon.'] },
    { id: 'exercise', t: 'Exercise ≥ 120 min', d: 'ARED / treadmill / cycle', xp: 20, at: 900, win: 180, test: (r) => +r.exercise_min >= 120,
      how: ['Plan about 2 h: resistive (ARED) plus aerobic (treadmill or cycle) exercise.',
        'Warm up for 5 min and follow your trainer’s prescription.',
        'The exercise devices log the minutes; drink water afterwards.'] },
    { id: 'water', t: 'Drink ≥ 2 L water', d: 'Kidney-stone prevention', xp: 10, at: 1200, win: 120, test: (r) => +r.water_l >= 2,
      how: ['Spread at least 2 L over the day, more after exercise.',
        'Log each drink bag in the form; the total is checked here.',
        'Dark urine or a headache means: drink more.'] },
  ];
  const ONTIME = 5; // bonus XP for ticking a task inside its time window
  const BADGES = [
    { id: 'first', t: 'First check-in', ok: (g) => g.saves.length >= 1 },
    { id: 's3', t: '3-day streak', ok: (g) => streak(g) >= 3 },
    { id: 's7', t: '7-day streak', ok: (g) => streak(g) >= 7 },
    { id: 'sharp', t: 'Sharp mind (PVT < 260 ms)', ok: (g) => g.bestPvt && g.bestPvt < 260 },
    { id: 'all', t: 'Full routine in a day', ok: (g) => Object.values(g.done).some((l) => l.length >= TASKS.length) },
    { id: 'xp500', t: '500 XP', ok: (g) => g.xp >= 500 },
    { id: 'punctual', t: 'Punctual (5 tasks on time in a day)', ok: (g) => Object.values(g.ontime).some((l) => l.length >= 5) },
  ];
  // What sensors and devices deliver on their own: the crew member never types these in.
  // weekly = measured once a week, the last value is carried forward.
  const SENSORS = [
    ['sleep_h', 'Sleep band (actigraphy)'], ['sleep_eff', 'Sleep band (actigraphy)'],
    ['rhr', 'NeuroShield headband, on waking'], ['rmssd', 'NeuroShield headband, on waking'],
    ['spo2', 'NeuroShield headband, on waking'], ['temp', 'Skin/ear thermistor, on waking'],
    ['sbp', 'Cuffless BP (pulse transit time)'], ['dbp', 'Cuffless BP (pulse transit time)'],
    ['glucose', 'Continuous glucose monitor, fasting'], ['body_mass', 'Body-mass measurement device'],
    ['exercise_min', 'Treadmill / ARED / cycle logs'], ['work_h', 'Mission timeline'],
    ['cortisol', 'Saliva analyser'], ['pvt_rt', 'Reaction self-test'], ['pvt_lapses', 'Reaction self-test'],
    ['co2_avg', 'Habitat telemetry'], ['microbe_cfu', 'Air sampler'], ['dose_mGy', 'Area + personal dosimeter'],
    ['strength_pct', 'ARED force sensor, weekly', true], ['u_ca', 'Urine analyser, weekly', true], ['sans_grade', 'Eye exam (OCT), weekly', true],
  ];
  // What only the crew member can tell: feelings, symptoms and what they ate and drank.
  const SCALES = [['stress', 1, 5, 'none', 'extreme'], ['team', 1, 5, 'poor', 'great'], ['msq', 0, 10, 'none', 'severe']];
  const SYMPTOMS = ['Headache', 'Congestion', 'Nausea', 'Back pain', 'Vision change', 'Skin rash', 'Dizziness', 'Joint pain'];
  const MOODS = ['😣', '🙁', '😐', '🙂', '😄'];
  let pending = []; // photos picked for today's entry, stored when the entry is saved
  let openHow = null; const snoozed = {};
  let crew = 'A', mood = null, pvtRes = null, scale = {}, sensed = {};

  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => ymd(new Date());
  const FULL = 0.8; // share of the routine that counts as a complete check-in
  let calMonth = 0; // months back from the current one
  function games() { return U.store('game') || {}; }
  function game() {
    const g = games()[crew] || {};
    return { xp: g.xp || 0, done: g.done || {}, saves: g.saves || [], bestPvt: g.bestPvt || null, ontime: g.ontime || {} };
  }
  function saveGame(g) { const all = games(); all[crew] = g; U.store('game', all); }

  function streak(g) {
    const set = new Set(g.saves);
    let n = 0;
    const d = new Date();
    if (!set.has(today())) d.setDate(d.getDate() - 1);
    while (set.has(ymd(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // station clock (the device's local clock in this demo)
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  // later = not yet due · due = inside its window · late = window passed and not done
  function state(t, done) {
    if (done.includes(t.id)) return 'done';
    const n = nowMin();
    return n < t.at ? 'later' : n < t.at + t.win ? 'due' : 'late';
  }
  function bonus(g, id, add) {
    const list = g.ontime[today()] = g.ontime[today()] || [];
    const t = TASKS.find((x) => x.id === id), i = list.indexOf(id);
    if (add && i < 0 && nowMin() >= t.at && nowMin() < t.at + t.win) { list.push(id); return ONTIME; }
    if (!add && i >= 0) { list.splice(i, 1); return -ONTIME; }
    return 0;
  }

  function complete(id) {
    const g = game();
    const list = g.done[today()] = g.done[today()] || [];
    if (list.includes(id)) return 0;
    list.push(id);
    const xp = TASKS.find((t) => t.id === id).xp + bonus(g, id, true);
    g.xp += xp;
    saveGame(g);
    return xp;
  }

  // manual tick: the crew member marks a routine task as done (or undoes it)
  function toggle(id) {
    const g = game();
    const list = g.done[today()] = g.done[today()] || [];
    const xp = TASKS.find((t) => t.id === id).xp;
    const i = list.indexOf(id);
    if (i >= 0) { list.splice(i, 1); g.xp = Math.max(0, g.xp - xp + bonus(g, id, false)); } else { list.push(id); g.xp += xp + bonus(g, id, true); }
    saveGame(g);
    render();
  }

  function init() {
    $('tasks').addEventListener('click', (e) => {
      const how = e.target.closest('.how-btn');
      if (how) { const id = how.dataset.id; openHow = openHow === id ? null : id; render(); return; }
      if (e.target.closest('.how')) return;
      const li = e.target.closest('li[data-id]'); if (li) toggle(li.dataset.id);
    });
    // reminders: re-check the routine every 30 s, on every tab
    setInterval(() => { remind(); if (document.getElementById('view-checkin').classList.contains('active')) render(); }, 30000);
    $('remind').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const id = $('remind').dataset.id;
      if (b.dataset.act === 'open') { openHow = id; document.querySelector('.tab[data-tab="checkin"]').click(); }
      if (b.dataset.act === 'done') { toggle(id); }
      if (b.dataset.act === 'snooze') { snoozed[id] = Date.now() + 15 * 60000; }
      remind();
    });
    $('tasks').addEventListener('keydown', (e) => {
      const li = e.target.closest('li[data-id]');
      if (li && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); toggle(li.dataset.id); $('tasks').querySelector(`li[data-id="${li.dataset.id}"]`).focus(); }
    });
    const pvt = $('pvt');
    pvt.addEventListener('mousedown', pvtClick);
    pvt.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); pvtClick(); } });
    buildForm();
    $('calPrev').addEventListener('click', () => { calMonth++; drawCalendar(); });
    $('calNext').addEventListener('click', () => { calMonth = Math.max(0, calMonth - 1); drawCalendar(); });
  }

  function setCrew(id) { crew = id; mood = null; calMonth = 0; }

  function render() {
    // live session counts as a task once ≥ 60 s were monitored
    if (NS.stream.S.t.length >= 60) complete('live');
    const g = game();
    const done = g.done[today()] || [];
    const STXT = { done: 'Done', later: 'Later', due: 'Due now', late: 'Overdue' };
    $('tasks').innerHTML = TASKS.map((t) => {
      const on = done.includes(t.id), st = state(t, done), ot = (g.ontime[today()] || []).includes(t.id);
      return `<li data-id="${t.id}" class="${on ? 'done' : ''} st-${st}" role="checkbox" aria-checked="${on}" tabindex="0" title="${on ? 'Click to undo' : 'Click to mark as done'}"><span class="tick">${on ? '✓' : ''}</span>
      <span class="at">${hhmm(t.at)}</span><span class="tt">${t.t}<small>${t.d}</small></span>
      <span class="pill st">${STXT[st]}${ot ? ' · on time' : ''}</span>
      <button class="how-btn${openHow === t.id ? ' on' : ''}" data-id="${t.id}" title="How to do it" aria-expanded="${openHow === t.id}">How?</button>
      <span class="xp">+${t.xp} XP</span>
      ${openHow === t.id ? `<ol class="how">${t.how.map((x) => `<li>${x}</li>`).join('')}</ol>` : ''}</li>`;
    }).join('');
    const nLate = TASKS.filter((t) => state(t, done) === 'late').length, nDue = TASKS.filter((t) => state(t, done) === 'due').length;
    const next = TASKS.filter((t) => state(t, done) === 'later')[0];
    $('routineNow').innerHTML = `Station clock <b>${hhmm(nowMin())}</b> · ${nDue ? `<b class="c-warn">${nDue} due now</b>` : 'nothing due now'}`
      + `${nLate ? ` · <b class="c-crit">${nLate} overdue</b>` : ''}${next ? ` · next: ${next.t} at ${hhmm(next.at)}` : ''} · +${ONTIME} XP bonus inside the time window`;
    remind();
    const s = streak(g);
    $('streak').innerHTML = `🔥 Streak: <b>${s}</b> day${s === 1 ? '' : 's'} · ★ <b>${g.xp}</b> XP · ${done.length}/${TASKS.length} tasks today`;
    $('badges').innerHTML = BADGES.map((b) => `<span class="badge ${b.ok(g) ? 'got' : ''}">${b.ok(g) ? '🏅' : '○'} ${b.t}</span>`).join('');
    $('xpChip').textContent = `★ ${g.xp} XP · 🔥${s}`;
    const prof = NS.logbook.allProfiles().find((p) => p.id === crew);
    $('entryFor').textContent = `for ${prof ? prof.name : crew} · will be saved as mission day ${nextDay()}`;
    drawSensors();
    drawCalendar();
  }

  // ---------------- reminders
  // A banner on every tab for the earliest due or overdue task (not snoozed); a count on the Daily Check-in tab.
  function remind() {
    const done = game().done[today()] || [];
    const open = TASKS.filter((t) => ['due', 'late'].includes(state(t, done)));
    const tab = document.querySelector('.tab[data-tab="checkin"]');
    tab.innerHTML = `Daily Check-in${open.length ? ` <b class="tab-cnt">${open.length}</b>` : ''}`;
    const t = open.find((x) => !(snoozed[x.id] > Date.now()));
    const box = $('remind');
    if (!t) { box.hidden = true; return; }
    const st = state(t, done);
    box.hidden = false; box.dataset.id = t.id; box.className = 'remind ' + st;
    box.innerHTML = `<span class="r-ico">⏰</span><div><b>${hhmm(t.at)} · ${t.t}</b> ${st === 'late' ? 'is overdue' : 'is due now'}<small>${t.how[0]}</small></div>
      <button data-act="open">How to</button><button data-act="done">Done</button><button data-act="snooze">Snooze 15 min</button>`;
  }

  // ---------------- calendar
  // Entries saved here carry their date. The bundled mission log has only mission-day numbers, so it is
  // placed so that its last day is the day before the first check-in made in this app (or yesterday).
  function dayLog() {
    const rows = NS.logbook.rowsFor(crew);
    const dated = rows.filter((r) => r.date);
    const anchor = dated.length ? new Date(dated[0].date + 'T12:00') : new Date();
    const lastUndated = Math.max(0, ...rows.filter((r) => !r.date).map((r) => r.day));
    const byDate = {};
    for (const r of rows) {
      let key = r.date;
      if (!key) { const d = new Date(anchor); d.setDate(d.getDate() - (lastUndated - r.day + 1)); key = ymd(d); }
      (byDate[key] = byDate[key] || []).push(r);
    }
    const g = game();
    const out = {};
    for (const key of new Set([...Object.keys(byDate), ...Object.keys(g.done)])) {
      const entries = byDate[key] || [];
      const done = new Set(g.done[key] || []);
      for (const r of entries) for (const t of TASKS) {
        if (t.test ? t.test(r) : t.id === 'pvt' && r.pvt_rt != null) done.add(t.id);
      }
      out[key] = { entries, done: TASKS.filter((t) => done.has(t.id)) };
    }
    const keys = Object.keys(byDate).sort();
    return { days: out, first: keys[0] || null };
  }

  function drawCalendar() {
    const { days, first } = dayLog();
    const now = new Date();
    const m0 = new Date(now.getFullYear(), now.getMonth() - calMonth, 1);
    $('calTitle').textContent = m0.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    $('calNext').disabled = calMonth === 0;
    let h = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span class="cal-h">${d}</span>`).join('');
    const lead = (m0.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) h += '<span></span>';
    const n = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate();
    const sum = { full: 0, part: 0, miss: 0 };
    const t0 = today();
    for (let d = 1; d <= n; d++) {
      const key = ymd(new Date(m0.getFullYear(), m0.getMonth(), d));
      const info = days[key];
      let cls = '';
      if (info && info.done.length) cls = info.done.length / TASKS.length >= FULL ? 'full' : 'part';
      else if (first && key >= first && key < t0) cls = 'miss';
      if (cls) sum[cls]++;
      h += `<span class="cal-d ${cls}${key === t0 ? ' today' : ''}${key > t0 ? ' future' : ''}" data-d="${key}">${d}</span>`;
    }
    $('cal').innerHTML = h;
    $('cal').querySelectorAll('.cal-d').forEach((e) => U.tip(e, () => calTip(e.dataset.d, days[e.dataset.d])));
    $('calSum').innerHTML = `This month: <b class="c-ok">${sum.full}</b> complete · <b class="c-warn">${sum.part}</b> partial · <b class="c-crit">${sum.miss}</b> missed`;
  }

  function calTip(key, info) {
    const date = new Date(key + 'T12:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (!info) return `<h4>${date}</h4><p>${key > today() ? 'Upcoming day.' : 'No check-in logged.'}</p>`;
    const r = info.entries[info.entries.length - 1];
    const doneIds = info.done.map((t) => t.id);
    const list = TASKS.map((t) => `<li class="${doneIds.includes(t.id) ? 'c-ok' : 'muted'}">${doneIds.includes(t.id) ? '✓' : '○'} ${t.t}</li>`).join('');
    return `<h4>${date}</h4>
      <div class="tip-meta">${r ? `Mission day ${r.day}` : 'No log entry saved'} · ${info.done.length}/${TASKS.length} routine tasks</div>
      ${r ? `<p>Mood ${r.mood ?? '–'} · sleep ${r.sleep_h ?? '–'} h · stress ${r.stress ?? '–'}${r.symptoms ? ' · ' + r.symptoms : ''}</p>` : ''}
      <ul class="tip-list">${list}</ul>`;
  }

  function nextDay() { const r = NS.logbook.rowsFor(crew); return r.length ? r[r.length - 1].day + 1 : 1; }

  // ---------------- PVT
  const P = { state: 'idle', trial: 0, rts: [], t0: 0, timer: null, raf: null };
  function pvtClick() {
    const box = $('pvt');
    if (P.state === 'idle' || P.state === 'done') {
      P.trial = 0; P.rts = []; P.lapses = 0; P.falseStarts = 0;
      nextTrial();
      return;
    }
    if (P.state === 'wait') { P.falseStarts++; box.querySelector('span').textContent = 'Too early! wait…'; clearTimeout(P.timer); nextTrial(); return; }
    if (P.state === 'go') {
      const rt = performance.now() - P.t0;
      cancelAnimationFrame(P.raf);
      P.rts.push(rt);
      if (rt > 500) P.lapses++;
      box.classList.remove('go');
      box.querySelector('span').textContent = Math.round(rt) + ' ms';
      P.trial++;
      if (P.trial >= 10) finish(); else { P.state = 'pause'; setTimeout(nextTrial, 700); }
    }
  }
  function nextTrial() {
    const box = $('pvt');
    P.state = 'wait';
    box.classList.remove('go');
    box.querySelector('span').textContent = `Trial ${P.trial + 1}/10 · wait…`;
    P.timer = setTimeout(() => {
      P.state = 'go';
      P.t0 = performance.now();
      box.classList.add('go');
      const tick = () => { box.querySelector('span').textContent = Math.round(performance.now() - P.t0); P.raf = requestAnimationFrame(tick); };
      tick();
    }, 2000 + Math.random() * 4000);
  }
  function finish() {
    P.state = 'done';
    const rt = NS.util.median(P.rts);
    pvtRes = { rt: Math.round(rt), lapses: P.lapses };
    const def = D.ranges.daily.pvt_rt;
    const s = U.status(def, rt);
    $('pvt').querySelector('span').textContent = 'Done — click to repeat';
    $('pvtResult').innerHTML = `Median reaction time <b class="c-${s}">${pvtRes.rt} ms</b> · lapses <b>${P.lapses}</b> · false starts ${P.falseStarts}. ` +
      (s === 'ok' ? 'Within your normal range.' : 'Slower than normal — check your sleep debt before safety-critical tasks.');
    const g = game();
    g.bestPvt = Math.min(g.bestPvt || 9999, pvtRes.rt);
    saveGame(g);
    complete('pvt');
    render();
  }

  // ---------------- entry form
  function buildForm() {
    const f = $('entryForm');
    const sc = (k, lo, hi, a, z) => {
      const def = D.ranges.daily[k];
      let b = '';
      for (let v = lo; v <= hi; v++) b += `<button type="button" data-k="${k}" data-v="${v}">${v}</button>`;
      return `<div class="q" data-k="${k}"><span>${def.label.replace(/ \(.*\)$/, '')}</span><div class="scale ${hi - lo > 5 ? 'wide' : ''}">${b}</div><small>${lo} = ${a} · ${hi} = ${z}</small></div>`;
    };
    f.innerHTML = `
      <div class="sensed"><div class="sensed-h"><b>From sensors &amp; devices</b><span class="muted">synced automatically · nothing to type · hover for details</span></div><div class="sensed-grid" id="sensedGrid"></div></div>
      <div class="self">
        <div class="self-h"><b>Only you can tell us</b><span class="muted">10 seconds</span></div>
        <div class="q" data-k="mood"><span>Mood</span><div class="moods">${MOODS.map((m, i) => `<button type="button" data-v="${i + 1}" title="${i + 1}">${m}</button>`).join('')}</div><small>1 = very low · 5 = very good</small></div>
        ${SCALES.map((x) => sc(...x)).join('')}
        <label class="q" data-k="kcal_pct"><span>Food eaten today</span><select name="kcal_pct"><option value="">–</option><option value="60">Much less than planned</option><option value="85">A bit less</option><option value="100">As planned</option><option value="115">More than planned</option></select><small>% of your energy target</small></label>
        <label class="q" data-k="water_l"><span>Water drunk (L)</span><input type="number" name="water_l" min="0" max="6" step="0.25" placeholder="e.g. 2.5"><small>target 2–3 L</small></label>
        <div class="q wide"><span>Symptoms today</span><div class="syms">${SYMPTOMS.map((x) => `<label><input type="checkbox" name="sym" value="${x}"> ${x}</label>`).join('')}</div>
          <input type="text" name="notes" placeholder="Anything else? (optional)"></div>
        <div class="q wide photos"><span>Photos <small class="muted">optional · skin, eye, wound, ultrasound…</small></span>
          <div class="ph-add"><select name="ph_type">${NS.images.TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
            <input type="text" name="ph_note" placeholder="Where / what (e.g. left forearm)">
            <label class="btn ghost ph-btn">📷 Add photo<input type="file" name="ph_file" accept="image/*" multiple hidden></label></div>
          <small class="ph-hint" id="phHint"></small>
          <div class="ph-list" id="phList"></div></div>
      </div>
      <div class="actions"><button type="submit" class="btn primary">Save to logbook</button><span id="saveMsg" class="muted"></span></div>`;
    f.querySelectorAll('.q[data-k]').forEach((l) => U.tip(l, () => fieldTip(l.dataset.k)));
    f.querySelectorAll('.moods button').forEach((b) => b.addEventListener('click', () => {
      mood = +b.dataset.v;
      f.querySelectorAll('.moods button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    f.querySelectorAll('.scale button').forEach((b) => b.addEventListener('click', () => {
      scale[b.dataset.k] = +b.dataset.v;
      f.querySelectorAll(`.scale button[data-k=${b.dataset.k}]`).forEach((x) => x.classList.toggle('on', x === b));
    }));
    f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    // photos: shrink on pick, show as pending until the entry is saved
    const hint = () => { $('phHint').textContent = NS.images.TYPES.find((x) => x[0] === f.querySelector('[name=ph_type]').value)[2]; };
    f.querySelector('[name=ph_type]').addEventListener('change', hint); hint();
    f.querySelector('[name=ph_file]').addEventListener('change', async (e) => {
      const type = f.querySelector('[name=ph_type]').value, note = f.querySelector('[name=ph_note]').value.trim();
      for (const file of e.target.files) {
        try { pending.push(Object.assign(await NS.images.shrink(file), { type, note })); } catch (err) { $('saveMsg').textContent = `${file.name} could not be read as an image.`; }
      }
      e.target.value = ''; f.querySelector('[name=ph_note]').value = '';
      drawPending();
    });
    $('phList').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { pending.splice(+b.dataset.i, 1); drawPending(); } });
  }

  // Today's sensor values. In this demo they are derived from the crew member's last week (median plus a
  // small day-specific variation); weekly measurements carry the last value; the PVT comes from the test above.
  function hash(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; }
  function readSensors() {
    const rows = NS.logbook.rowsFor(crew), recent = rows.slice(-7), out = {};
    for (const [k, , weekly] of SENSORS) {
      const def = D.ranges.daily[k];
      const vals = recent.map((r) => r[k]).filter((v) => v != null && v !== '').map(Number);
      if (k === 'pvt_rt' || k === 'pvt_lapses') { out[k] = pvtRes ? (k === 'pvt_rt' ? pvtRes.rt : pvtRes.lapses) : null; continue; }
      if (!vals.length) { out[k] = null; continue; }
      if (weekly) { out[k] = vals[vals.length - 1]; continue; }
      const med = U.median(vals), spread = U.median(vals.map((v) => Math.abs(v - med))) || Math.abs(med) * 0.02;
      const v = med + (hash(crew + today() + k) - 0.5) * 2 * spread;
      out[k] = +v.toFixed(def.dec);
    }
    return out;
  }

  function drawSensors() {
    sensed = readSensors();
    $('sensedGrid').innerHTML = SENSORS.map(([k, src, weekly]) => {
      const def = D.ranges.daily[k], v = sensed[k];
      const s = v == null ? 'na' : U.status(def, v);
      const val = v == null ? (k.startsWith('pvt') ? 'do the test ↑' : '–') : `${U.fmt(v, def.dec)}<small>${def.unit ? ' ' + def.unit : ''}</small>`;
      return `<div class="sv c-${s}" data-k="${k}" title=""><span>${def.label.replace(/ \(.*\)$/, '')}</span><b>${val}</b><small>${src}${weekly ? '' : ''}</small></div>`;
    }).join('');
    $('sensedGrid').querySelectorAll('.sv').forEach((el) => U.tip(el, () => fieldTip(el.dataset.k)));
  }

  // short hover help for a log field, with the crew member's last logged value
  function fieldTip(k) {
    const def = D.ranges.daily[k];
    const u = def.unit ? ' ' + def.unit : '';
    const rows = NS.logbook.rowsFor(crew);
    let last = null;
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i][k] != null && rows[i][k] !== '') { last = rows[i]; break; }
    const s = last ? U.status(def, +last[k]) : 'na';
    const src = (SENSORS.find((x) => x[0] === k) || [])[1];
    return `<h4>${def.label}</h4>
      <div class="tip-meta">${src ? 'Measured by: ' + src + ' (automatic)' : 'Self-report: only you can tell'}</div>
      <p>${def.desc}</p>
      <table>
        ${def.normal ? `<tr><td>Normal</td><td class="c-ok">${U.rangeText(def.normal, def.dec)}${u}</td></tr>
        <tr><td>Caution</td><td class="c-warn">${U.rangeText(def.warn, def.dec)}${u}</td></tr>` : ''}
        ${src && sensed[k] != null ? `<tr><td>Today</td><td><b class="c-${U.status(def, sensed[k])}">${U.fmt(sensed[k], def.dec)}${u}</b></td></tr>` : ''}
        ${last ? `<tr><td>Last logged</td><td><b class="c-${s}">${last[k]}${u}</b> <span class="muted">(day ${last.day})</span></td></tr>` : ''}
      </table>
      <div class="tip-src">Basis: ${def.source}</div>`;
  }

  function drawPending() {
    $('phList').innerHTML = pending.map((p, i) => `<figure><img src="${p.data}" alt="${NS.images.label(p.type)}"><figcaption>${NS.images.label(p.type)}${p.note ? ' · ' + p.note.replace(/</g, '&lt;') : ''}</figcaption>
      <button type="button" data-i="${i}" title="Remove">×</button></figure>`).join('') + (pending.length ? '<small class="muted">Stored with this entry when you save.</small>' : '');
  }

  function resetSelf() {
    const f = $('entryForm');
    f.reset(); mood = null; scale = {};
    f.querySelectorAll('.moods button, .scale button').forEach((x) => x.classList.remove('on'));
  }

  function save() {
    const f = $('entryForm');
    if (mood == null) { $('saveMsg').textContent = 'Pick your mood first — it is the one thing no sensor can measure.'; return; }
    const row = Object.assign({}, sensed, { mood }, scale);
    for (const k of ['kcal_pct', 'water_l']) { const v = f.querySelector(`[name=${k}]`).value; row[k] = v === '' ? null : +v; }
    const syms = [...f.querySelectorAll('[name=sym]:checked')].map((x) => x.value.toLowerCase());
    const note = f.querySelector('[name=notes]').value.trim();
    row.symptoms = syms.concat(note ? [note] : []).join('; ');
    row.date = today();
    // body-mass change versus the first logged mass (pre-flight baseline)
    const prior = NS.logbook.rowsFor(crew).find((r) => r.body_mass != null);
    const prof = NS.logbook.allProfiles().find((p) => p.id === crew);
    const ref = prof && prof.mass ? prof.mass : prior ? prior.body_mass : row.body_mass;
    row.mass_change = row.body_mass != null && ref ? +(100 * (row.body_mass - ref) / ref).toFixed(1) : null;
    const day = NS.logbook.addEntry(crew, row);
    let xp = 0;
    for (const t of TASKS) if (t.test && t.test(row)) xp += complete(t.id);
    const g = game();
    if (!g.saves.includes(today())) { g.saves.push(today()); saveGame(g); }
    const now = new Date(), time = now.toTimeString().slice(0, 8), nPh = pending.length;
    const stored = Promise.all(pending.map((p) => NS.images.add({ crew, date: today(), time, day, type: p.type, note: p.note, data: p.data, w: p.w, h: p.h })));
    pending = [];
    resetSelf();
    $('entryForm').querySelector('[name=ph_type]').dispatchEvent(new Event('change'));
    drawPending();
    render();
    $('saveMsg').innerHTML = `Saved as day ${day}${nPh ? ` with ${nPh} photo${nPh > 1 ? 's' : ''}` : ''}. <b class="c-warn">+${xp} XP</b> — see the Crew Logbook for anomaly checks${nPh ? ' and the image log' : ''}.`;
    stored.catch(() => { $('saveMsg').innerHTML += ' <b class="c-crit">The photos could not be stored on this device.</b>'; });
  }

  return { init, render, setCrew };
})();
