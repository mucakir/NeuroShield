#!/usr/bin/env node
// Builds presentation/NeuroShield_30s.mp4 (1920x1080, 30 fps, <= 30 s) for the Space Apps project demo:
// English Kokoro-82M voice-over (tools/tts_kokoro.py), burned-in English subtitles (+ .srt), no music.
// Scenes are captured frame by frame from the app (app/index.html, identical to the published copy at
// https://paragonaerotech.com/spaceappschallenge/app/) with Playwright; the end card shows page 1 of the paper.
//
// Usage: KOKORO_DIR=/path/to/models node tools/build_video30.js <workdir>
//   KOKORO_DIR holds kokoro-v1.0.onnx + voices-v1.0.bin; KOKORO_VOICE (default af_heart), KOKORO_SPEED (default 1.2).
// Needs ffmpeg with libx264, uv, and npm playwright-core + sharp.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'ns30-')));
const OUT = path.join(ROOT, 'presentation', 'NeuroShield_30s.mp4');
const SRT = path.join(ROOT, 'presentation', 'NeuroShield_30s.srt');
const URL = 'paragonaerotech.com/spaceappschallenge/app';
const VOICE = process.env.KOKORO_VOICE || 'af_heart', SPEED = process.env.KOKORO_SPEED || '1.2';
const W = 1920, H = 1080, FPS = 30, CAP = 15, LEAD = 0.1, GAP = 0.2, MAX = 29.8;
fs.mkdirSync(WORK, { recursive: true });
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 26, ...opts }).toString();
const dur = (f) => +run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim();

const SEGMENTS = [
  { scene: 'title', t: 'On the way to Mars, help is up to twenty-four minutes away.', sub: 'On the way to Mars, help is up to 24 minutes away.' },
  { scene: 'live', t: 'NeuroShield lets astronauts check their own health: wearable sensors, vital signs and cabin data, color-coded at a glance.' },
  { scene: 'alerts', t: 'Explainable alerts warn minutes early, say exactly what to do, and who leads when Earth is far.' },
  { scene: 'routine', t: 'A timed daily routine with step-by-step help and rewards keeps measurements on track.' },
  { scene: 'logbook', t: "A personal logbook spots changes against each astronaut's own baseline, built on real NASA data." },
  { scene: 'end', t: 'NeuroShield: see it before you feel it.', hold: 0.5 },
];

// ------------------------------------------------------------ 1. narration
function tts() {
  const dir = process.env.KOKORO_DIR;
  if (!dir) throw new Error('Set KOKORO_DIR to the folder with kokoro-v1.0.onnx and voices-v1.0.bin');
  const jobs = SEGMENTS.map((s, i) => ({ text: s.t, out: path.join(WORK, `voice_${i}.wav`) }));
  run('uv', ['run', '--python', '3.12', '--with', 'kokoro-onnx', '--with', 'soundfile', 'python', path.join(__dirname, 'tts_kokoro.py'), dir, VOICE, SPEED],
    { input: JSON.stringify(jobs) });
  const segs = SEGMENTS.map((s, i) => ({ ...s, voice: jobs[i].out, vd: dur(jobs[i].out) }));
  segs.forEach((s) => { s.d = +(LEAD + s.vd + GAP + (s.hold || 0)).toFixed(2); });
  const total = segs.reduce((a, s) => a + s.d, 0);
  if (total > MAX) throw new Error(`Narration too long: ${total.toFixed(2)} s (raise KOKORO_SPEED)`);
  let t = 0; for (const s of segs) { s.start = t; t += s.d; }
  console.log('segments', segs.map((s) => s.d).join(' + '), '=', total.toFixed(2), 's');
  return segs;
}

// ------------------------------------------------------------ 2. still cards
const svgPng = (svg, file) => sharp(Buffer.from(svg)).png().toFile(file);
const LOGO = '<path d="M16 2 4 7v8c0 7.5 5.1 13.4 12 15 6.9-1.6 12-7.5 12-15V7z" fill="#5eb3ff"/><path d="M7 17h5l2-5 3 9 2-4h6" stroke="#0b1220" stroke-width="2.2" fill="none" stroke-linejoin="round"/>';
const FONT = 'Helvetica Neue, Arial, sans-serif';

async function titleCard(file) {
  const pts = [['Earth', 300, '#5eb3ff'], ['Moon', 860, '#cbd5e1'], ['Mars', 1620, '#f87171']];
  const lab = [['ISS · 1 s', 300], ['Moon · ~3 s', 860], ['Mars · up to 24 min', 1620]];
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#070d1a"/>
    <g transform="translate(760,180) scale(3.2)">${LOGO}</g>
    <text x="900" y="245" font-family="${FONT}" font-size="64" font-weight="700" fill="#fff">NeuroShield</text>
    <text x="902" y="292" font-family="${FONT}" font-size="26" letter-spacing="5" fill="#8aa0c0">CREW HEALTH MONITOR</text>
    <line x1="300" y1="560" x2="1620" y2="560" stroke="#41557a" stroke-width="4" stroke-dasharray="14 12"/>
    ${pts.map(([n, x, c]) => `<circle cx="${x}" cy="560" r="${n === 'Moon' ? 34 : 54}" fill="${c}"/><text x="${x}" y="${n === 'Moon' ? 640 : 660}" text-anchor="middle" font-family="${FONT}" font-size="40" fill="#e2e8f0">${n}</text>`).join('')}
    ${lab.map(([t, x]) => `<text x="${x}" y="470" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="600" fill="${t.startsWith('Mars') ? '#fbbf24' : '#8aa0c0'}">⇄ ${t}</text>`).join('')}
    <text x="960" y="760" text-anchor="middle" font-family="${FONT}" font-size="30" fill="#8aa0c0">round-trip signal delay to Earth</text>
  </svg>`, file);
}

async function endCard(file) {
  // page 1 of the paper, rendered from the PDF
  const page = path.join(WORK, 'paper_p1.png');
  run('uv', ['run', '--with', 'pymupdf', 'python', '-c',
    `import pymupdf as f;d=f.open(${JSON.stringify(path.join(ROOT, 'paper', 'NeuroShield_IEEE.pdf'))});d[0].get_pixmap(dpi=150).save(${JSON.stringify(page)})`]);
  const ph = 900, img = await sharp(page).resize({ height: ph }).png().toBuffer();
  const pw = (await sharp(img).metadata()).width;
  const bg = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#070d1a"/>
    <rect x="${120 - 6}" y="${90 - 6}" width="${pw + 12}" height="${ph + 12}" fill="#1e2b45"/>
    <g transform="translate(${pw + 240},250) scale(2.4)">${LOGO}</g>
    <text x="${pw + 330}" y="300" font-family="${FONT}" font-size="58" font-weight="700" fill="#fff">NeuroShield</text>
    <text x="${pw + 240}" y="430" font-family="${FONT}" font-size="54" font-weight="700" fill="#5eb3ff">see it before you feel it</text>
    <text x="${pw + 240}" y="530" font-family="${FONT}" font-size="32" fill="#e2e8f0">Tested on 36 scenarios + 6 real datasets</text>
    <text x="${pw + 240}" y="580" font-family="${FONT}" font-size="32" fill="#e2e8f0">IEEE-style paper · open data · NASA OSDR</text>
    <text x="${pw + 240}" y="700" font-family="${FONT}" font-size="34" font-weight="600" fill="#fbbf24">${URL}</text>
    <text x="${pw + 240}" y="770" font-family="${FONT}" font-size="28" fill="#8aa0c0">Team Paragon · NASA Space Apps Challenge 2026</text>
  </svg>`)).png().toBuffer();
  await sharp(bg).composite([{ input: img, left: 120, top: 90 }]).png().toFile(file);
}

// ------------------------------------------------------------ 3. app scenes, frame by frame
async function capture(segs) {
  const exe = run('sh', ['-c', 'ls -d ~/Library/Caches/ms-playwright/chromium-*/chrome-mac*/*.app/Contents/MacOS/* | head -1']).trim();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const open = async (hour) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const p = await ctx.newPage();
    if (hour != null) { const d = new Date(); d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0); await p.clock.install({ time: d }); }
    await p.goto('file://' + path.join(ROOT, 'app', 'index.html'));
    await p.waitForFunction(() => typeof NS !== 'undefined' && NS.live);
    await p.waitForTimeout(600);
    return p;
  };
  const hideRemind = (p) => p.evaluate(() => { document.getElementById('remind').style.visibility = 'hidden'; });
  async function seq(seg, p, frameFn) {
    const n = Math.round(seg.d * CAP), dir = path.join(WORK, seg.scene);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < n; i++) {
      await frameFn(i, n);
      await p.waitForTimeout(70);
      await p.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) });
    }
    seg.frames = dir;
  }
  const S = Object.fromEntries(segs.map((s) => [s.scene, s]));
  const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : 0.5 - Math.cos(Math.PI * x) / 2);

  // live: Mars habitat leak, the stream advances and the cards turn amber, then red
  let p = await open(null); await hideRemind(p);
  await p.evaluate(() => { const b = [...document.querySelectorAll('.seg button, button')].find((x) => x.textContent.trim().startsWith('Mars')); b && b.click(); NS.live.load('mars_hypoxia_leak'); });
  await seq(S.live, p, (i, n) => p.evaluate((t) => NS.stream.seek(t), Math.round(330 + 270 * i / (n - 1))));
  // alerts: scroll to the guidance panel, back up, then the mission label explains the delay
  await seq(S.alerts, p, async (i, n) => {
    const a = i / (n - 1);
    if (a < 0.62) await p.evaluate((y) => window.scrollTo(0, y), Math.round(860 * ease(a / 0.3) - 860 * ease((a - 0.48) / 0.14)));
    if (i === Math.round(n * 0.66)) await p.hover('#envChip');
  });
  await p.context().close();

  // routine: station clock 07:20, "How?" steps, ticking a task on time
  p = await open(7.33);
  await p.evaluate(() => document.querySelector('.tab[data-tab=checkin]').click());
  await seq(S.routine, p, async (i, n) => {
    if (i === Math.round(n * 0.18)) await p.click('.how-btn[data-id=glucose]');
    if (i === Math.round(n * 0.55)) await p.click('#tasks li[data-id=vitals] .tt');
  });
  await p.context().close();

  // logbook: crew D anomaly map, crew A image log, Inspiration4 bloodwork (real NASA data)
  p = await open(null); await hideRemind(p);
  await p.evaluate(() => { const s = document.getElementById('crewSel'); s.value = 'D'; s.dispatchEvent(new Event('change')); document.querySelector('.tab[data-tab=logbook]').click(); });
  await p.waitForTimeout(400);
  await p.evaluate(() => { const s = document.getElementById('metricSel'); s.value = 'mass_change'; s.dispatchEvent(new Event('change')); });
  await seq(S.logbook, p, async (i, n) => {
    const a = i / (n - 1);
    if (a < 0.4) await p.evaluate((y) => window.scrollTo(0, y), Math.round(420 * ease(a / 0.35)));
    if (i === Math.round(n * 0.4)) {
      await p.evaluate(() => { const s = document.getElementById('crewSel'); s.value = 'A'; s.dispatchEvent(new Event('change')); });
      await p.waitForTimeout(500);
      await p.evaluate(() => { [...document.querySelectorAll('#imFilter button')].find((x) => x.dataset.f === 'skin').click(); });
      await p.waitForTimeout(400);
      await p.evaluate(() => { const e = document.getElementById('imFilter').parentElement; window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 90); });
    }
    if (i === Math.round(n * 0.7)) { await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.tab[data-tab=bloodwork]').click(); }); await p.waitForTimeout(500); }
  });
  await browser.close();
}

// ------------------------------------------------------------ 4. subtitles
const srtTime = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
function lines(text, max = 58) {
  const out = [''];
  for (const w of text.split(' ')) { if ((out[out.length - 1] + ' ' + w).trim().length > max) out.push(w); else out[out.length - 1] = (out[out.length - 1] + ' ' + w).trim(); }
  return out;
}
async function subPng(text, file) {
  const ls = lines(text), lh = 54, h = ls.length * lh + 30;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  await svgPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}">
    <rect x="${W / 2 - 820}" y="0" width="1640" height="${h}" rx="14" fill="#000" fill-opacity="0.72"/>
    ${ls.map((l, i) => `<text x="${W / 2}" y="${46 + i * lh}" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="500" fill="#fff">${esc(l)}</text>`).join('')}
  </svg>`, file);
  return h;
}

// ------------------------------------------------------------ 5. assemble
async function main() {
  const segs = tts();
  console.log('cards'); await titleCard(path.join(WORK, 'title.png')); await endCard(path.join(WORK, 'end.png'));
  console.log('capture'); await capture(segs);
  const parts = [];
  for (const [i, s] of segs.entries()) {
    const out = path.join(WORK, `part_${i}.mp4`), frames = Math.round(s.d * FPS);
    const input = s.frames ? ['-framerate', String(CAP), '-i', path.join(s.frames, 'f%04d.png')] : ['-loop', '1', '-i', path.join(WORK, `${s.scene}.png`)];
    const sub = path.join(WORK, `sub_${i}.png`), sh = await subPng(s.sub || s.t, sub);
    const fade = i === 0 ? ',fade=t=in:d=0.4' : i === segs.length - 1 ? `,fade=t=out:st=${(s.d - 0.5).toFixed(2)}:d=0.5` : '';
    run('ffmpeg', ['-y', ...input, '-loop', '1', '-i', sub, '-filter_complex',
      `[0:v]scale=${W}:${H},fps=${FPS},format=yuv420p[b];[b][1:v]overlay=0:${H - sh - 40}:enable='between(t,${LEAD},${(LEAD + s.vd + 0.2).toFixed(2)})'${fade}[v]`,
      '-map', '[v]', '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), out]);
    parts.push(out);
  }
  const list = path.join(WORK, 'parts.txt');
  fs.writeFileSync(list, parts.map((f) => `file '${f}'`).join('\n'));
  const video = path.join(WORK, 'video.mp4');
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
  // voice track: each clip at its segment start + LEAD, no music
  const total = segs.reduce((a, s) => a + s.d, 0);
  const ins = segs.flatMap((s) => ['-i', s.voice]);
  const fl = segs.map((s, i) => `[${i}:a]aresample=48000,adelay=${Math.round((s.start + LEAD) * 1000)}:all=1[a${i}]`).join(';')
    + ';' + segs.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${segs.length}:normalize=0,apad,atrim=0:${total.toFixed(3)},highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
  const voice = path.join(WORK, 'voice.wav');
  run('ffmpeg', ['-y', ...ins, '-filter_complex', fl, '-map', '[a]', '-ar', '48000', '-ac', '2', voice]);
  fs.writeFileSync(SRT, segs.map((s, i) => `${i + 1}\n${srtTime(s.start + LEAD)} --> ${srtTime(s.start + LEAD + s.vd + 0.2)}\n${lines(s.sub || s.t).join('\n')}\n`).join('\n'));
  run('ffmpeg', ['-y', '-i', video, '-i', voice, '-i', SRT, '-map', '0:v', '-map', '1:a', '-map', '2:s', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
    '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-shortest', '-movflags', '+faststart', OUT]);
  console.log(`done: ${OUT} (${dur(OUT).toFixed(2)} s)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
