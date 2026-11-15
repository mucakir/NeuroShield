// Shared helpers: range evaluation, formatting, storage. Classic script (works from file://).
window.NS = window.NS || {};

NS.util = (function () {
  const lo = (r) => (r && r[0] != null ? r[0] : -Infinity);
  const hi = (r) => (r && r[1] != null ? r[1] : Infinity);

  // 'ok' inside normal band, 'warn' inside caution band, 'crit' beyond.
  function status(def, v) {
    if (v == null || isNaN(v) || !def || !def.normal) return 'na';
    if (v >= lo(def.normal) && v <= hi(def.normal)) return 'ok';
    if (v >= lo(def.warn) && v <= hi(def.warn)) return 'warn';
    return 'crit';
  }

  // 0-100 sub-score: 100 in normal band, 100->60 across caution band, 60->0 beyond.
  function subScore(def, v) {
    if (v == null || isNaN(v) || !def || !def.normal) return null;
    const nl = lo(def.normal), nh = hi(def.normal), wl = lo(def.warn), wh = hi(def.warn);
    const span = def.axis ? (def.axis[1] - def.axis[0]) * 0.25 : 1;
    if (v >= nl && v <= nh) return 100;
    let frac;
    if (v < nl) {
      const w = isFinite(wl) ? nl - wl : span;
      if (v >= wl) return 100 - 40 * (nl - v) / w;
      frac = (wl - v) / w;
    } else {
      const w = isFinite(wh) ? wh - nh : span;
      if (v <= wh) return 100 - 40 * (v - nh) / w;
      frac = (v - wh) / w;
    }
    return Math.max(0, 60 - 60 * frac);
  }

  function fmt(v, dec) {
    if (v == null || isNaN(v)) return '–';
    return Number(v).toFixed(dec == null ? 1 : dec);
  }

  function rangeText(r, dec) {
    if (!r) return '–';
    const a = r[0], b = r[1];
    if (a == null && b == null) return '–';
    if (a == null) return '≤ ' + fmt(b, dec);
    if (b == null) return '≥ ' + fmt(a, dec);
    if (a === 0) return '≤ ' + fmt(b, dec);
    return fmt(a, dec) + ' – ' + fmt(b, dec);
  }

  function mmss(t) {
    t = Math.max(0, Math.round(t));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  function median(a) {
    const s = a.slice().sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem('ns.' + key));
      localStorage.setItem('ns.' + key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }

  const STATUS_TEXT = { ok: 'Normal', warn: 'Caution', crit: 'Alert', na: '–' };

  // Plain-language reading of a value against its normal / caution limits.
  function explain(def, v) {
    const s = status(def, v);
    if (s === 'na') return 'No reading.';
    const d = def.dec, u = def.unit ? ' ' + def.unit : '';
    if (s === 'ok') return `Inside the normal range (${rangeText(def.normal, d)}${u}).`;
    const below = v < lo(def.normal);
    const nLim = fmt(below ? lo(def.normal) : hi(def.normal), d);
    if (s === 'warn') return `${below ? 'Below' : 'Above'} the normal limit (${nLim}${u}) but within the caution limit (${fmt(below ? lo(def.warn) : hi(def.warn), d)}${u}): watch it.`;
    return `${below ? 'Below' : 'Above'} the caution limit (${fmt(below ? lo(def.warn) : hi(def.warn), d)}${u}): act on it.`;
  }

  // One floating popup shared by every element registered with tip(el, render).
  // render() returns HTML and is called again by tipRefresh() while the popup is open (live values).
  let tipBox = null, tipOwner = null, tipRender = null, tipX = 0, tipY = 0;
  function placeTip() {
    const r = tipBox.getBoundingClientRect(), m = 14;
    let x = tipX + m, y = tipY + m;
    if (x + r.width > innerWidth - 8) x = Math.max(8, tipX - r.width - m);
    if (y + r.height > innerHeight - 8) y = Math.max(8, innerHeight - r.height - 8);
    tipBox.style.left = x + 'px';
    tipBox.style.top = y + 'px';
  }
  function tip(target, render) {
    if (!tipBox) { tipBox = el('div', { class: 'tip', role: 'tooltip' }); document.body.appendChild(tipBox); }
    target.addEventListener('mouseenter', (e) => {
      tipOwner = target; tipRender = render; tipX = e.clientX; tipY = e.clientY;
      tipBox.innerHTML = render(); tipBox.classList.add('on'); placeTip();
    });
    target.addEventListener('mousemove', (e) => { if (tipOwner === target) { tipX = e.clientX; tipY = e.clientY; placeTip(); } });
    target.addEventListener('mouseleave', () => { if (tipOwner === target) { tipOwner = null; tipBox.classList.remove('on'); } });
  }
  function tipRefresh() { if (tipOwner && tipOwner.isConnected) { tipBox.innerHTML = tipRender(); placeTip(); } }

  return { status, subScore, fmt, rangeText, mmss, median, store, el, lo, hi, STATUS_TEXT, explain, tip, tipRefresh };
})();
