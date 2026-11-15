// Health images: photos the crew member adds with the daily log (skin, eye/OCT, wound, ultrasound...).
// Kept on this device in IndexedDB (photos are too large for localStorage); downscaled to ≤ 1024 px JPEG.
// The demo does not interpret images; it stores them by date and lets the crew compare them over time.
NS.images = (function () {
  const TYPES = [
    ['skin', 'Skin / rash', 'Same body spot, same distance, daylight-like light; a ruler or coin next to it shows the size.'],
    ['eye', 'Eye (fundus / OCT)', 'Export the image from the fundoscope or OCT; the same eye and view each week.'],
    ['wound', 'Wound / injury', 'Photograph straight on, with a ruler; once a day until it has healed.'],
    ['ultrasound', 'Ultrasound', 'Save the frame from the ultrasound device; note the body area and probe position.'],
    ['other', 'Other', 'Anything you want the flight surgeon to see; describe it in the note.'],
  ];
  // Built-in examples for crew A (illustrative, drawn by data/generator/make_sample_images.py); read-only.
  const SAMPLES = { A: [
    { file: 'skin_d52.jpg', day: 52, type: 'skin', note: 'Forehead under the headband strap: red, itchy patch' },
    { file: 'skin_d56.jpg', day: 56, type: 'skin', note: 'Same spot after moving the strap and using barrier cream: fading' },
    { file: 'eye_d30.jpg', day: 30, type: 'eye', note: 'Weekly fundus, right eye: optic-disc margin sharp (Frisén 0)' },
    { file: 'eye_d58.jpg', day: 58, type: 'eye', note: 'Weekly fundus, right eye: unchanged, no disc swelling' },
    { file: 'wound_d44.jpg', day: 44, type: 'wound', note: 'Middle knuckle abrasion from the ARED bar; cleaned and covered' },
    { file: 'us_d33.jpg', day: 33, type: 'ultrasound', note: 'Right kidney, long axis: no stone shadow (renal-stone check)' },
    { file: 'other_d25.jpg', day: 25, type: 'other', note: 'Urine colour vs hydration chart: about 2 (well hydrated)' },
  ] };
  // the bundled log has mission-day numbers only; place them on the calendar the same way the check-in calendar does
  function sampleList(crew) {
    const rows = NS.logbook.rowsFor(crew), dated = rows.filter((r) => r.date);
    const anchor = dated.length ? new Date(dated[0].date + 'T12:00') : new Date();
    const last = Math.max(0, ...rows.filter((r) => !r.date).map((r) => r.day));
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return (SAMPLES[crew] || []).map((x, i) => {
      const d = new Date(anchor); d.setDate(d.getDate() - (last - x.day + 1));
      return { id: 's' + i, crew, sample: true, date: ymd(d), time: '08:00:00', day: x.day, type: x.type, note: x.note, data: 'img/samples/' + x.file };
    });
  }
  const label = (t) => (TYPES.find((x) => x[0] === t) || TYPES[4])[1];
  let dbp = null;
  const mem = []; // fallback when IndexedDB is not available (e.g. some private windows)

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res) => {
      try {
        const rq = indexedDB.open('neuroshield', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
      } catch (e) { res(null); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      if (!d) { res(fn(null)); return; }
      const t = d.transaction('images', mode), st = t.objectStore('images');
      const r = fn(st);
      t.oncomplete = () => res(r && r.result !== undefined ? r.result : r);
      t.onerror = () => rej(t.error);
    }));
  }

  function add(rec) {
    return tx('readwrite', (st) => { if (!st) { rec.id = mem.length + 1; mem.push(rec); return rec.id; } return st.add(rec); });
  }
  function list(crew) {
    return tx('readonly', (st) => (st ? st.getAll() : { result: mem.slice() }))
      .then((all) => all.filter((x) => x.crew === crew).concat(sampleList(crew)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)));
  }
  function remove(id) {
    return tx('readwrite', (st) => { if (!st) { const i = mem.findIndex((x) => x.id === id); if (i >= 0) mem.splice(i, 1); return null; } return st.delete(id); });
  }

  // read a picked file and shrink it so a year of daily photos still fits on the device
  function shrink(file, max = 1024) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(fr.error);
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('not an image'));
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res({ data: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // ---------------- Crew Logbook → Image log: filter by kind, newest first, side-by-side comparison
  let filt = 'all', sel = null;
  const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const when = (x) => `${x.date} · day ${x.day}`;
  const fig = (x, cap) => `<figure><img src="${x.data}" alt="${esc(label(x.type))} ${esc(x.date)}"><figcaption><b>${cap}</b>${x.sample ? ' <span class="pill c-na">illustrative sample</span>' : ''} ${when(x)} · ${esc(label(x.type))}${x.note ? ' · ' + esc(x.note) : ''}</figcaption></figure>`;

  async function renderLog(crew) {
    const box = document.getElementById('imStrip');
    if (!box) return;
    const all = await list(crew);
    const counts = {};
    all.forEach((x) => { counts[x.type] = (counts[x.type] || 0) + 1; });
    if (filt !== 'all' && !counts[filt]) filt = 'all';
    document.getElementById('imFilter').innerHTML = [['all', 'All', all.length], ...TYPES.filter(([k]) => counts[k]).map(([k, l]) => [k, l, counts[k]])]
      .map(([k, l, n]) => `<button class="${k === filt ? 'on' : ''}" data-f="${k}">${l} <b>${n}</b></button>`).join('');
    const shown = all.filter((x) => filt === 'all' || x.type === filt);
    if (!all.length) {
      box.innerHTML = '<p class="muted">No photos yet for this crew member. Add one in Daily Check-in → Daily log entry → Photos (skin, eye/OCT, wound, ultrasound…).</p>';
      document.getElementById('imCompare').innerHTML = ''; return;
    }
    if (!shown.some((x) => String(x.id) === sel)) sel = String(shown[0].id);
    box.innerHTML = shown.map((x) => `<button class="im-th${String(x.id) === sel ? ' on' : ''}" data-id="${x.id}" title="${esc(label(x.type))} · ${when(x)}${x.note ? ' · ' + esc(x.note) : ''}">
      <img src="${x.data}" alt=""><span>${x.date.slice(5)} · ${esc(label(x.type).split(' ')[0])}</span></button>`).join('');
    const cur = all.find((x) => String(x.id) === sel);
    const prev = all.find((x) => x.type === cur.type && (x.date + x.time) < (cur.date + cur.time));
    const days = prev ? Math.round((new Date(cur.date) - new Date(prev.date)) / 864e5) : 0;
    document.getElementById('imCompare').innerHTML = `<div class="im-pair">${prev ? fig(prev, 'Earlier') : '<div class="im-none muted">First photo of this kind — the next one will appear beside it.</div>'}${fig(cur, 'Selected')}</div>
      <div class="im-meta">${prev ? `${days} day${days === 1 ? '' : 's'} apart. Look for changes in size, colour, swelling or borders; tell the flight surgeon if it is growing or new.` : ''}
      NeuroShield stores and compares photos; it does not diagnose them.${cur.sample ? ' Examples marked “illustrative sample” are drawn by code, not real patient images.' : ` <button class="btn ghost" data-del="${cur.id}">Delete selected</button>`}</div>`;
  }

  function bindLog(getCrew) {
    document.getElementById('imFilter').addEventListener('click', (e) => { const b = e.target.closest('button[data-f]'); if (b) { filt = b.dataset.f; sel = null; renderLog(getCrew()); } });
    document.getElementById('imStrip').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) { sel = b.dataset.id; renderLog(getCrew()); } });
    document.getElementById('imCompare').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-del]');
      if (b && confirm('Delete this photo from the device?')) remove(+b.dataset.del).then(() => { sel = null; renderLog(getCrew()); });
    });
  }

  return { TYPES, label, add, list, remove, shrink, renderLog, bindLog };
})();
