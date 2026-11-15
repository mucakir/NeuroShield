// Stream engine: replays a 1 Hz scenario from the dataset (or accepts live samples over
// WebSocket), keeps per-signal buffers and running statistics, and exposes the window
// statistics the rule engine needs.
NS.stream = (function () {
  const D = window.NS_DATA;
  const KEYS = Object.keys(D.ranges.live);
  const listeners = [];
  const S = {
    source: 'scenario', scenario: null, crew: null, idx: 0, playing: false, speed: 1, timer: null,
    buf: {}, t: [], stats: {}, base: {}, label: '', phase: '', ws: null,
  };

  function resetBuffers() {
    S.t = [];
    for (const k of KEYS) { S.buf[k] = []; S.stats[k] = { sum: 0, n: 0, min: Infinity, max: -Infinity }; S.base[k] = null; }
    S.label = ''; S.phase = '';
    NS.rules.reset();
    NS.score.reset();
  }

  function push(sample, t, silent) {
    S.t.push(t);
    for (const k of KEYS) {
      const v = sample[k];
      const val = v == null || v === '' ? null : +v;
      S.buf[k].push(val);
      if (val != null && !isNaN(val)) {
        const st = S.stats[k];
        st.sum += val; st.n++; if (val < st.min) st.min = val; if (val > st.max) st.max = val;
        // personal baseline = mean of the first 60 s of the session
        if (st.n === 60) S.base[k] = st.sum / st.n;
      }
    }
    const changes = NS.rules.evaluate(ctx, t);
    if (!silent) emit({ type: 'sample', t, changes });
    return changes;
  }

  function rleAt(list, t) {
    let v = list[0] ? list[0][1] : '';
    for (const [t0, x] of list) { if (t0 <= t) v = x; else break; }
    return v;
  }

  // The scenario as lived by the selected crew member: their own generated body signals
  // (decoded from delta-encoded integers) with the shared cabin channels of the reference run.
  const trackCache = {};
  function track(id) {
    id = id || S.scenario;
    const ref = D.live[id];
    const rec = S.crew && D.recCrew && D.recCrew[S.crew] && D.recCrew[S.crew][id];
    if (rec) return rec; // real recording (Lab mission): this crew member replays their own real person
    const own = S.crew && D.liveCrew && D.liveCrew[S.crew] && D.liveCrew[S.crew][id];
    if (!own) return ref;
    const key = S.crew + '/' + id;
    if (!trackCache[key]) {
      const cols = Object.assign({}, ref.cols);
      const n = ref.cols.HR.length;
      for (const k in own.d) {
        if (own.d[k] === null) { cols[k] = new Array(n).fill(null); continue; } // e.g. no suit: not on the spacewalk
        const sc = 10 ** D.crewLive[S.crew].dec[k];
        let x = 0;
        cols[k] = own.d[k].map((v) => (x += v) / sc);
      }
      trackCache[key] = { cols, labels: own.labels, phases: own.phases || ref.phases, role: own.role, affected: own.affected };
    }
    return trackCache[key];
  }

  function sampleAt(i) {
    const sc = track();
    const o = {};
    for (const k of KEYS) o[k] = sc.cols[k] ? sc.cols[k][i] : null;
    return personalise(o, i);
  }

  // ---- personalisation for user-created profiles (dataset crew A-D have their own generated streams)
  // Physiological channels are shifted to the person's own resting values (median of their last 14
  // daily-log days, relative to the dataset crew median), the heart-rate response is scaled by fitness,
  // and each person gets their own sensor noise. Cabin/suit/radiation channels are shared by the crew.
  const SCEN_HR = 66;                         // resting HR the scenarios were generated around
  const OFFSET = { HR: 'rhr', SBP: 'sbp', DBP: 'dbp', GLU: 'glucose', TEMP: 'temp', SPO2: 'spo2' };
  const JITTER = { HR: 1.2, RMSSD: 2, SBP: 1.5, DBP: 1, RR: 0.3, GSR: 0.15, EEG_FI: 0.03, EEG_WL: 0.03, RSO2: 0.5, TEMP: 0.02, GLU: 0.6 };
  const DAILY_KEYS = ['rhr', 'rmssd', 'sbp', 'dbp', 'glucose', 'temp', 'spo2'];
  let P = null;

  function med(a) { const s = a.filter((x) => x != null && x !== '' && !isNaN(x)).map(Number).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; }

  function crewProfile(id, rows) {
    const ref = {}, own = {};
    for (const k of DAILY_KEYS) { ref[k] = med(D.daily.map((r) => r[k])); own[k] = med(rows.slice(-14).map((r) => r[k])); }
    const d = (k) => (own[k] != null && ref[k] != null ? own[k] - ref[k] : 0);
    const off = {};
    for (const [lk, dk] of Object.entries(OFFSET)) off[lk] = d(dk);
    // seeded AR(1) noise per channel, one series per crew member
    let seed = [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const noise = {};
    for (const [k, sd] of Object.entries(JITTER)) {
      const a = new Float32Array(1000); let x = 0;
      for (let i = 0; i < a.length; i++) { x = 0.85 * x + Math.sqrt(1 - 0.85 ** 2) * gauss() * sd; a[i] = x; }
      noise[k] = a;
    }
    return { id, own, ref, off,
      hrv: own.rmssd && ref.rmssd ? own.rmssd / ref.rmssd : 1,
      hrGain: Math.min(1.2, Math.max(0.8, 1 + d('rhr') / 40)), // fitter (lower resting HR) -> smaller HR rise
      noise };
  }

  function personalise(o, i) {
    if (!P) return o;
    for (const k in o) {
      let v = o[k];
      if (v == null || v === '') continue;
      if (k === 'HR') v = SCEN_HR + (v - SCEN_HR) * P.hrGain;
      if (k === 'RMSSD') v *= P.hrv;
      if (P.off[k]) v += P.off[k];
      if (P.noise[k]) v += P.noise[k][i % 1000];
      if (k === 'SPO2') v = Math.min(100, v);
      if (k === 'RMSSD' || k === 'GSR') v = Math.max(0.2, v);
      const dec = D.ranges.live[k] ? D.ranges.live[k].dec : 1;
      o[k] = +v.toFixed(dec);
    }
    return o;
  }

  // Switch the live stream to another crew member; the scenario is rebuilt up to the current second.
  function setCrew(id, rows) {
    S.crew = id;
    P = D.liveCrew && D.liveCrew[id] ? null : crewProfile(id, rows || []);
    emit({ type: 'crew', profile: P });
    if (S.source === 'scenario' && S.scenario) seek(S.idx);
  }
  function profile() { return P; }

  function loadScenario(id) {
    stop();
    closeWs();
    S.source = 'scenario';
    S.scenario = id;
    S.idx = 0;
    resetBuffers();
    emit({ type: 'reset' });
  }

  function step() {
    const sc = track();
    const n = sc.cols.HR.length;
    if (S.idx >= n) { stop(); emit({ type: 'end' }); return; }
    S.label = rleAt(sc.labels, S.idx);
    S.phase = rleAt(sc.phases, S.idx);
    push(sampleAt(S.idx), S.idx);
    S.idx++;
  }

  function play() {
    if (S.source !== 'scenario' || S.playing) return;
    const sc = track();
    if (S.idx >= sc.cols.HR.length) seek(0);
    S.playing = true;
    schedule();
    emit({ type: 'state' });
  }

  function schedule() {
    clearInterval(S.timer);
    // at high speed, process several samples per frame instead of very short intervals
    const perTick = Math.max(1, Math.round(S.speed / 20));
    const interval = Math.max(16, 1000 / S.speed * perTick);
    S.timer = setInterval(() => { for (let i = 0; i < perTick && S.playing; i++) step(); }, interval);
  }

  function stop() { S.playing = false; clearInterval(S.timer); emit({ type: 'state' }); }

  function setSpeed(x) { S.speed = x; if (S.playing) schedule(); emit({ type: 'state' }); }

  // Rebuild buffers up to second t (rules re-run silently so alert history stays consistent).
  function seek(t) {
    const was = S.playing;
    stop();
    resetBuffers();
    emit({ type: 'reset' });
    const sc = track();
    const n = Math.min(t, sc.cols.HR.length);
    const events = [];
    for (let i = 0; i < n; i++) {
      S.label = rleAt(sc.labels, i);
      S.phase = rleAt(sc.phases, i);
      for (const c of push(sampleAt(i), i, true)) events.push(c);
    }
    S.idx = n;
    emit({ type: 'sample', t: n - 1, changes: events, rebuilt: true });
    if (was) play();
  }

  // ---- live device input (NeuroShield wearable or any JSON source)
  function connectWs(url) {
    stop();
    closeWs();
    resetBuffers();
    S.source = 'websocket';
    S.scenario = null;
    S.idx = 0;
    emit({ type: 'reset' });
    try {
      S.ws = new WebSocket(url);
    } catch (e) { emit({ type: 'ws', status: 'error', msg: e.message }); return; }
    S.ws.onopen = () => emit({ type: 'ws', status: 'open' });
    S.ws.onclose = () => emit({ type: 'ws', status: 'closed' });
    S.ws.onerror = () => emit({ type: 'ws', status: 'error', msg: 'connection failed' });
    S.ws.onmessage = (m) => {
      try {
        const o = JSON.parse(m.data);
        S.label = o.label || 'live'; S.phase = o.phase || 'live device';
        push(o, S.idx++);
      } catch (e) { /* ignore malformed frame */ }
    };
  }
  function closeWs() { if (S.ws) { S.ws.onclose = null; S.ws.close(); S.ws = null; } }

  // ---- window statistics for rules / UI
  function win(key, secs) {
    const b = S.buf[key];
    if (!b || !b.length) return [];
    return b.slice(Math.max(0, b.length - secs)).filter((v) => v != null && !isNaN(v));
  }
  const ctx = {
    last(key) { const b = S.buf[key]; for (let i = b.length - 1; i >= 0; i--) if (b[i] != null) return b[i]; return NaN; },
    mean(key, secs) { const w = win(key, secs); return w.length ? w.reduce((a, b) => a + b, 0) / w.length : NaN; },
    max(key, secs) { const w = win(key, secs); return w.length ? Math.max(...w) : NaN; },
    min(key, secs) { const w = win(key, secs); return w.length ? Math.min(...w) : NaN; },
    // lowest `avg`-second moving average within the last `secs` seconds (a noise-robust recent minimum)
    lowMean(key, secs, avg) {
      const w = win(key, secs);
      if (w.length < avg) return NaN;
      let s = 0, lo = Infinity;
      for (let i = 0; i < w.length; i++) { s += w[i]; if (i >= avg) s -= w[i - avg]; if (i >= avg - 1) lo = Math.min(lo, s / avg); }
      return lo;
    },
    slope(key, secs) {
      const w = win(key, secs);
      const n = w.length;
      if (n < 5) return 0;
      const mx = (n - 1) / 2, my = w.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) { num += (i - mx) * (w[i] - my); den += (i - mx) ** 2; }
      return num / den;
    },
    // % drop of the 5-s mean versus the personal baseline (first 60 s)
    drop(key) {
      const st = S.stats[key];
      const b = S.base[key] != null ? S.base[key] : st.n ? st.sum / st.n : null;
      const m = ctx.mean(key, 5);
      return b ? Math.max(0, (b - m) / b * 100) : 0;
    },
    // personal baseline (mean of the first 60 s), NaN until it exists
    base(key) { return S.base[key] != null ? S.base[key] : NaN; },
    // change of the 30-s mean versus the personal baseline (first 60 s), in the signal's unit
    rise(key) {
      const b = S.base[key];
      const m = ctx.mean(key, 30);
      return b != null && !isNaN(m) ? m - b : 0;
    },
    f(key, dec) { return NS.util.fmt(ctx.last(key), dec == null ? 0 : dec); },
  };

  resetBuffers();

  function current() { const o = {}; for (const k of KEYS) o[k] = ctx.last(k); return o; }
  function stats(k) { const s = S.stats[k]; return s.n ? { mean: s.sum / s.n, min: s.min, max: s.max, n: s.n } : null; }

  function on(fn) { listeners.push(fn); }
  function emit(e) { for (const fn of listeners) fn(e); }

  return { S, KEYS, loadScenario, play, stop, seek, setSpeed, connectWs, closeWs, ctx, current, stats, on, setCrew, profile, sampleAt, track };
})();
