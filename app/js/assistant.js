// AI Assistant (offline demo). No language model is connected yet: every answer is assembled by rules
// from the selected crew member's own data — logbook history, detected episodes, last-7-day trends,
// radiation budget and the live session — so it already reads like a personal health assistant.
// The response format is the contract a future on-device model (see the panel below the chat) would fill.
NS.assistant = (function () {
  const D = window.NS_DATA;
  const U = NS.util;
  const $ = (id) => document.getElementById(id);
  const Q_MEAN = 2, CAREER_MSV = 600;
  const SUGGEST = ['How was my sleep lately?', 'Anything I should worry about this week?', 'Explain my radiation dose', 'What should I focus on today?'];
  // topic -> words that point to it (English + Turkish, since crews write in their own language)
  const TOPICS = {
    sleep: ['sleep', 'tired', 'fatigue', 'rest', 'uyku', 'yorgun', 'uyu'],
    stress: ['stress', 'mood', 'anxious', 'mental', 'stres', 'moral', 'ruh', 'kaygı'],
    heart: ['heart', 'pressure', 'pulse', 'blood', 'bp', 'kalp', 'nabız', 'tansiyon', 'basınç'],
    radiation: ['radiation', 'dose', 'sievert', 'solar', 'radyasyon', 'doz'],
    body: ['exercise', 'weight', 'mass', 'muscle', 'bone', 'food', 'eat', 'egzersiz', 'kilo', 'kas', 'kemik', 'yemek', 'beslen'],
    fluid: ['water', 'drink', 'hydrat', 'su ', 'sıvı', 'içme'],
  };
  const KEY_METRICS = [
    ['sleep_h', -1, 'sleep'], ['sleep_eff', -1, 'sleep'], ['pvt_rt', 1, 'sleep'], ['work_h', 1, 'sleep'],
    ['mood', -1, 'stress'], ['stress', 1, 'stress'], ['cortisol', 1, 'stress'],
    ['rhr', 1, 'heart'], ['rmssd', -1, 'heart'], ['sbp', 1, 'heart'], ['dbp', 1, 'heart'],
    ['exercise_min', -1, 'body'], ['kcal_pct', -1, 'body'], ['mass_change', -1, 'body'], ['strength_pct', -1, 'body'],
    ['water_l', -1, 'fluid'], ['temp', 1, 'heart'],
  ];
  const chats = {}; // crew id -> [{who, blocks}]
  let busy = false;

  function init() {
    $('aiSend').addEventListener('click', send);
    $('aiInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    $('aiInput').addEventListener('input', autosize);
  }

  function autosize() { const t = $('aiInput'); t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }

  function crewId() { return NS.logbook.crew; }
  function crewName(id) { const p = NS.logbook.allProfiles().find((x) => x.id === id); return p ? p.name : id; }

  // ---------------------------------------------------------------- data review
  function num(v) { return v == null || v === '' || isNaN(v) ? null : +v; }
  function median(a) { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; }

  function review(id) {
    const rows = NS.logbook.rowsFor(id);
    const res = rows.length ? NS.anomaly.detect(rows) : { episodes: [] };
    const last = rows.slice(-7), base = rows.slice(0, -7);
    const trends = [];
    for (const [k, bad, topic] of KEY_METRICS) {
      const def = D.ranges.daily[k];
      const b = base.map((r) => num(r[k])), l = last.map((r) => num(r[k]));
      const mb = median(b), ml = median(l);
      if (mb == null || ml == null) continue;
      const spread = median(b.filter((x) => x != null).map((x) => Math.abs(x - mb))) * 1.4826 || Math.abs(mb) * 0.05 || 1;
      const z = (ml - mb) / spread;
      trends.push({ k, def, topic, base: mb, now: ml, z, worse: Math.sign(z) === bad && Math.abs(z) >= 1.5, better: Math.sign(z) === -bad && Math.abs(z) >= 1.5 });
    }
    const doses = rows.map((r) => num(r.dose_mGy)).filter((x) => x != null);
    const msv = doses.reduce((a, b) => a + b, 0) * Q_MEAN;
    // live session for this crew member
    const S = NS.stream.S;
    const sc = S.scenario && D.scenarios.find((s) => s.id === S.scenario);
    const track = sc && S.crew === id ? NS.stream.track(sc.id) : null;
    const live = sc ? { title: sc.title, env: sc.environment, t: S.idx, role: track && track.role, alerts: S.crew === id ? NS.rules.current() : [] } : null;
    return { rows, episodes: res.episodes, trends, msv, days: doses.length, live, trait: D.crewLive && D.crewLive[id] && D.crewLive[id].trait };
  }

  function topicsOf(msg) {
    const m = ' ' + msg.toLowerCase() + ' ';
    return Object.keys(TOPICS).filter((t) => TOPICS[t].some((w) => m.includes(w)));
  }

  const fmt = (v, d) => U.fmt(v, d == null ? 1 : d);
  const val = (t) => `${fmt(t.now, t.def.dec)}${t.def.unit ? ' ' + t.def.unit : ''}`;

  // ---------------------------------------------------------------- answer
  // blocks: {p: [parts]} | {li: [parts]} | {h: text}; parts: string or {b: string}
  function answer(id, msg) {
    const r = review(id);
    const topics = topicsOf(msg);
    const first = crewName(id).replace(/^Crew [A-Z] \((.*)\)$/, '$1');
    const blocks = [];
    if (!r.rows.length) {
      blocks.push({ p: [`I looked for your data, ${first}, but there is no logbook entry yet. Complete a Daily Check-in and I can start comparing your days with your own baseline.`] });
      blocks.push({ p: ['I am not a doctor, but a good start is the routine itself: sleep 8+ hours, ~2.5 h exercise, 2–3 L water and an honest mood score every morning.'] });
      return blocks;
    }
    const span = `${r.rows.length} logbook days (mission day ${r.rows[0].day}–${r.rows[r.rows.length - 1].day})`;
    const liveTxt = !r.live ? '.' : r.live.t > 0 ? `, plus the live session “${r.live.title}” at ${U.mmss(r.live.t)}.` : `. The live session “${r.live.title}” is loaded but not started yet.`;
    blocks.push({ p: [`I reviewed your past data, ${first}: `, { b: span }, liveTxt] });

    // findings
    blocks.push({ h: 'What I found' });
    // the person's own episodes first (newest first), cabin-wide ones after
    const eps = [...r.episodes].reverse().sort((a, b) => a.envOnly - b.envOnly).slice(0, 4);
    const relevantEp = topics.length ? eps.filter((e) => e.tags.some(([k]) => topics.some((t) => tagTopic(k) === t))) : eps;
    for (const e of (relevantEp.length ? relevantEp : eps).slice(0, 3)) {
      blocks.push({ li: [{ b: e.title }, ` on day ${e.start}${e.end > e.start ? '–' + e.end : ''}${e.envOnly ? ' (cabin-wide, not just you)' : ''}: `, e.metrics.slice(0, 4).map((m) => D.ranges.daily[m] ? D.ranges.daily[m].label.toLowerCase() : m).join(', '), ' moved away from your usual range.'] });
    }
    if (!eps.length) blocks.push({ li: ['No unusual episodes against your personal baseline. Your logbook is steady.'] });
    const focus = topics.length ? r.trends.filter((t) => topics.includes(t.topic)) : r.trends.filter((t) => t.worse || t.better);
    const worse = focus.filter((t) => t.worse).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 3);
    const better = focus.filter((t) => t.better).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 2);
    for (const t of worse) blocks.push({ li: [`Last 7 days: your ${t.def.label.toLowerCase()} is `, { b: val(t) }, ` against your usual ${fmt(t.base, t.def.dec)} — worth keeping an eye on.`] });
    for (const t of better) blocks.push({ li: [`Good news: ${t.def.label.toLowerCase()} improved to `, { b: val(t) }, ` (usual ${fmt(t.base, t.def.dec)}).`] });
    if (topics.length && !worse.length && !better.length) {
      for (const t of focus.slice(0, 3)) blocks.push({ li: [`${t.def.label}: `, { b: val(t) }, ` this week, close to your usual ${fmt(t.base, t.def.dec)}.`] });
    }
    if (!topics.length || topics.includes('radiation')) {
      const pct = r.msv / CAREER_MSV * 100;
      blocks.push({ li: ['Radiation: about ', { b: `${fmt(r.msv, 1)} mSv` }, ` so far, ${fmt(pct, 1)} % of the ${CAREER_MSV} mSv NASA career limit${pct > 10 ? ' — plan shielding for the rest of the mission' : ''}.`] });
    }
    if (r.live && r.live.t > 0) {
      const a = r.live.alerts;
      blocks.push({ li: [`Live session (${r.live.env})${r.live.role ? ', your role: ' + r.live.role : ''} — `,
        a.length ? { b: a.map((x) => x.rule.title).join(', ') } : 'no active alerts right now', a.length ? ' is active.' : '.'] });
    }

    // recommendations
    blocks.push({ h: 'What I would suggest' });
    blocks.push({ p: ['I am not a doctor, but based on your own data I would recommend:'] });
    const adv = [];
    for (const e of (relevantEp.length ? relevantEp : eps)) for (const a of e.advice || []) if (!adv.includes(a)) adv.push(a);
    for (const t of worse) { const a = TREND_ADVICE[t.topic]; if (a && !adv.includes(a)) adv.unshift(a); }
    if (r.live && r.live.alerts.length) { const a0 = r.live.alerts[0].rule.advice[0]; if (a0 && !adv.includes(a0)) adv.unshift(a0); }
    if (!adv.length) adv.push('Keep your current routine: it is working. Log the check-in every morning so I can spot changes early.');
    for (const a of adv.slice(0, 4)) blocks.push({ li: [a] });
    if (r.trait && !topics.length) blocks.push({ p: [{ b: 'Your profile: ' }, r.trait + '. I take this into account when I compare you with yourself, never with the rest of the crew.'] });
    blocks.push({ p: ['Please talk to your Crew Medical Officer or the flight surgeon about anything that worries you, especially if it gets worse.'] });
    blocks.push({ note: 'Demo answer: built from your NeuroShield data by rules. No language model is connected yet.' });
    return blocks;
  }

  function tagTopic(k) {
    return { sleep: 'sleep', mood: 'stress', team: 'stress', stress: 'stress', bp: 'heart', infection: 'heart', radiation: 'radiation',
      mass: 'body', fitness: 'body', bone: 'body', co2: 'sleep', sm: 'stress' }[k] || 'other';
  }
  const TREND_ADVICE = {
    sleep: 'Protect an 8.5 h sleep window this week; dim the lights and stop screens an hour before.',
    stress: 'Book a private family or psychological support conference and keep some free time in the schedule.',
    heart: 'Re-measure heart rate and blood pressure after 5 minutes of quiet rest, morning and evening, for three days.',
    body: 'Get back to ~2.5 h of exercise a day and eat to your energy target; muscle and bone loss is hard to reverse in flight.',
    fluid: 'Drink 2.5–3 L a day; low fluid intake raises the kidney-stone risk in microgravity.',
  };

  // ---------------------------------------------------------------- rendering
  function partsHtml(parts) { return parts.map((x) => (typeof x === 'string' ? esc(x) : `<b>${esc(x.b)}</b>`)).join(''); }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function blockEl(b) {
    if (b.h) return U.el('h4', {}, esc(b.h));
    if (b.note) return U.el('div', { class: 'ai-note' }, esc(b.note));
    if (b.li) return U.el('li', {}, partsHtml(b.li));
    return U.el('p', {}, partsHtml(b.p));
  }

  function msgEl(who) {
    const m = U.el('div', { class: 'ai-msg ' + who });
    if (who === 'bot') m.appendChild(U.el('div', { class: 'ai-avatar', 'aria-hidden': 'true' }, '<svg viewBox="0 0 32 32" width="18" height="18"><path d="M16 2 4 7v8c0 7.5 5.1 13.4 12 15 6.9-1.6 12-7.5 12-15V7z" fill="#5eb3ff"/><path d="M7 17h5l2-5 3 9 2-4h6" stroke="#0b1220" stroke-width="2.4" fill="none" stroke-linejoin="round"/></svg>'));
    const body = U.el('div', { class: 'ai-body' });
    m.appendChild(body);
    $('aiLog').appendChild(m);
    return body;
  }

  // lists go into one <ul>; the rest are appended in order
  function place(body, el) {
    if (el.tagName === 'LI') {
      let ul = body.lastElementChild;
      if (!ul || ul.tagName !== 'UL') { ul = U.el('ul'); body.appendChild(ul); }
      ul.appendChild(el);
    } else body.appendChild(el);
  }

  function renderStatic(who, blocks) {
    const body = msgEl(who);
    for (const b of blocks) place(body, blockEl(b));
  }

  // reveal the answer word by word, like a streaming model reply
  function stream(blocks, done) {
    const body = msgEl('bot');
    let i = 0;
    function nextBlock() {
      if (i >= blocks.length) { done(); return; }
      const el = blockEl(blocks[i++]);
      const html = el.innerHTML;
      const tokens = html.split(/(\s+)/);
      el.innerHTML = '';
      place(body, el);
      let j = 0;
      (function tick() {
        j = Math.min(tokens.length, j + 3);
        el.innerHTML = tokens.slice(0, j).join('');
        scrollEnd();
        if (j < tokens.length) setTimeout(tick, 18); else setTimeout(nextBlock, 60);
      })();
    }
    nextBlock();
  }

  function scrollEnd() { const l = $('aiLog'); l.scrollTop = l.scrollHeight; }

  function send(textArg) {
    const text = (typeof textArg === 'string' ? textArg : $('aiInput').value).trim();
    if (!text || busy) return;
    const id = crewId();
    $('aiInput').value = ''; autosize();
    $('aiEmpty').hidden = true;
    const chat = chats[id] = chats[id] || [];
    const q = [{ p: [text] }];
    chat.push({ who: 'me', blocks: q });
    renderStatic('me', q);
    busy = true; $('aiSend').disabled = true;
    const typing = U.el('div', { class: 'ai-msg bot typing' }, '<div class="ai-avatar"></div><div class="ai-body"><span class="dots"><i></i><i></i><i></i></span> reviewing your data…</div>');
    $('aiLog').appendChild(typing); scrollEnd();
    setTimeout(() => {
      typing.remove();
      const a = answer(id, text);
      chat.push({ who: 'bot', blocks: a });
      stream(a, () => { busy = false; $('aiSend').disabled = false; $('aiInput').focus(); });
    }, 900);
  }

  // ---------------------------------------------------------------- view
  function render() {
    const id = crewId();
    const r = review(id);
    $('aiWho').innerHTML = `Talking with <b>${esc(crewName(id))}</b>`;
    $('aiCtx').innerHTML = [
      `${r.rows.length} logbook days`,
      `${r.episodes.length} detected episode${r.episodes.length === 1 ? '' : 's'}`,
      `${fmt(r.msv, 1)} mSv mission dose`,
      r.live ? `live: ${esc(r.live.title)}` : 'no live session',
    ].map((x) => `<span>${x}</span>`).join('');
    $('aiLog').innerHTML = '';
    const chat = chats[id] || [];
    $('aiEmpty').hidden = chat.length > 0;
    $('aiChips').innerHTML = '';
    for (const s of SUGGEST) {
      const b = U.el('button', { class: 'ai-chip' }, esc(s));
      b.addEventListener('click', () => send(s));
      $('aiChips').appendChild(b);
    }
    for (const m of chat) renderStatic(m.who, m.blocks);
    scrollEnd();
  }

  return { init, render, answer };
})();
