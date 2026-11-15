#!/usr/bin/env node
// Builds presentation/NeuroShield_demo.mp4 (1920x1080): English voice-over with the open-source
// Kokoro-82M TTS (tools/tts_kokoro.py), burned-in subtitles (+ soft track and .srt), very quiet
// synthesized ambient music, static deck slides (Keynote export), a detailed frame-by-frame demo of
// the web app (Playwright, 2x capture with zoom on the relevant panel) and a scroll through the paper.
//
// Usage: KOKORO_DIR=/path/to/models node tools/build_video.js <workdir>
//   KOKORO_DIR holds kokoro-v1.0.onnx + voices-v1.0.bin; KOKORO_VOICE (default af_heart), KOKORO_SPEED (default 1.1).
// Needs macOS (Keynote, PDFKit via swift), ffmpeg with libx264, uv, and npm playwright-core + sharp.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'nsvideo-')));
const OUT = path.join(ROOT, 'presentation', 'NeuroShield_demo.mp4');
const SRT = path.join(ROOT, 'presentation', 'NeuroShield_demo.srt');
const KOKORO_DIR = process.env.KOKORO_DIR;
const VOICE = process.env.KOKORO_VOICE || 'af_heart';
const SPEED = process.env.KOKORO_SPEED || '1.1';
const W = 1920, H = 1080, FPS = 30, PAD = 0.55, CAP_FPS = 15;
const NAVY = '#0a1222';
fs.mkdirSync(WORK, { recursive: true });
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1 << 26, ...opts }).toString();
const dur = (f) => +run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim();

// v: {slide: n} | {app: key} | {paper: [fromPage, fromFrac, toPage, toFrac]}  (pages 0-based)
const SEGMENTS = [
  { v: { slide: 1 }, t: 'NeuroShield, by Team Paragon: a camera-free health monitor for astronauts, built for the NASA Space Apps Challenge.' },
  { v: { slide: 2 }, t: 'On the way to Mars, a message to Earth can take twenty-two minutes. When an astronaut’s health starts to slip, the crew has to notice first, and act on its own.' },
  { v: { slide: 3 }, t: 'Today’s monitors fall short. Cabin cameras can’t see behind helmets and masks, single-sensor headbands only detect fatigue, and periodic exams miss fast events.' },
  { v: { slide: 4 }, t: 'NeuroShield fuses four kinds of input: a wearable with EEG, brain-oxygen, pulse and skin sensors; standard vital-sign devices; cabin sensors; and short self-reports. It runs offline, in any browser.' },
  { v: { slide: 5 }, t: 'Together they give twenty live indicators across six body systems, including every vital sign the challenge asks for.' },
  { v: { app: 'overview' }, t: 'Here is the live monitor. Each card is one signal, streaming once per second. The menu replays ten recorded mission scenarios at up to sixty times real speed, or connects a real device. The coloured strip above the timeline marks where problems occur.' },
  { v: { app: 'card' }, t: 'Let’s read one card. The large number is the current value, and the badge says normal, caution or alert. The green band and green dashed lines show the normal range; the red dotted lines are the caution limits. The faint dotted line is the session average, and the row below lists the average, minimum and maximum, next to the normal range.' },
  { v: { app: 'fatigue' }, t: 'The fatigue scenario is a night shift at the robotic arm. The EEG drowsiness index rises long before the head starts to nod. NeuroShield raises a caution after about six minutes, almost five minutes before the first microsleep.' },
  { v: { app: 'hypoxia' }, t: 'In the cabin-leak scenario on Orion, pressure falls first, and NeuroShield warns before blood oxygen drops. When oxygen saturation falls below ninety percent, the hypoxia alert turns critical. Every alert shows the values that triggered it, numbered actions, its scientific source, and when to call the flight surgeon.' },
  { v: { app: 'montage' }, t: 'Other scenarios cover a high-G entry, where brain oxygen falls with G-load; disorientation on a Mars rover; CO2 build-up on a lunar base; low blood sugar after exercise; a fever; and a solar storm that sends the crew to the shelter.' },
  { v: { app: 'score' }, t: 'The health score summarises all twenty signals. Each body system blends its average and its worst value, so one dangerous reading is never averaged away. Active alerts cap the score: here, hypoxia pulls it down to forty-five, act now.' },
  { v: { app: 'body' }, t: 'Click any part of the body figure to see what it measures. The head shows brain signals; the heart, pulse and blood pressure; the lungs, oxygen and breathing; the arms and legs, temperature; and the habitat tag, cabin air and radiation. Each view lists live values and the spaceflight hazard behind them.' },
  { v: { app: 'checkin' }, t: 'Every morning, the daily check-in asks for vitals, glucose, mood, sleep, exercise and water. Tasks earn points, streaks and badges, and a ten-trial reaction test measures alertness, like the test astronauts use on the space station.' },
  { v: { app: 'logbook' }, t: 'Each entry goes into a personal logbook. NeuroShield compares every value with that astronaut’s own baseline, using a robust z-score. Crew D’s body mass slowly drifts down, and from day thirty-four the detector flags it in red.' },
  { v: { app: 'heat' }, t: 'The anomaly map shows seventeen indicators over sixty days: red means above baseline, blue means below. You can spot the CO2 event on days thirty to thirty-three, the solar storm on day forty-seven, and crew D’s late fall in sleep and mood.' },
  { v: { app: 'episodes' }, t: 'Flagged days become episodes, with a likely cause and advice. For crew C, raised temperature and heart rate, with falling heart-rate variability, point to an infection. A detector check compares every result with the dataset’s ground truth.' },
  { v: { app: 'guide' }, t: 'Finally, the guide explains every indicator: how it is measured, its normal and caution limits, why it matters in space, and the literature behind it.' },
  { v: { slide: 9 }, t: 'All of this runs on an open, labelled dataset we created: ten fifteen-minute scenarios at one hertz, and sixty days of logs for four crew members, with thirteen injected events.' },
  { v: { slide: 10 }, t: 'On this synthetic data, the alerts reach ninety-two percent sensitivity and eighty-nine percent specificity, with no false alarms on a normal day.' },
  { v: { paper: [0, 0, 0, 0] }, t: 'We documented the work in a seven-page, IEEE-style paper with forty-four references.' },
  { v: { paper: [0, 0, 1, 0.05] }, t: 'It first reviews the literature: how spaceflight changes the heart, immunity and sleep; why CO2 causes headaches on the station; and how EEG and near-infrared sensors track fatigue and brain oxygen in pilots.' },
  { v: { paper: [1, 0.3, 2, 0.25] }, t: 'It then defines the health score, the fourteen rules with persistence, hysteresis and root-cause suppression, and the robust anomaly detector.' },
  { v: { paper: [2, 0.6, 4, 0.05] }, t: 'The results show drowsiness flagged four and a half minutes before the first microsleep, and cabin-pressure loss ninety-six seconds before blood oxygen falls. The health score averages ninety-six when nominal, and fifty-eight when not.' },
  { v: { paper: [4, 0.25, 5, 0.3] }, t: 'The logbook detector finds all thirteen injected events. The paper is also clear about its limits: the data are synthetic, thresholds need personal calibration, and activity context is still missing.' },
  { v: { slide: 12 }, t: 'Next, we connect the real NeuroShield wearable, and validate it on a motion simulator. NeuroShield: see it before you feel it.' },
];
// Subtitles use digits where the speech spells numbers out.
const SUBS = [['twenty-two minutes', '22 minutes'], ['ninety percent', '90%'], ['ninety-two percent', '92%'], ['eighty-nine percent', '89%'],
  ['sixty times', '60×'], ['forty-five', '45'], ['ten-trial', '10-trial'], ['day thirty-four', 'day 34'], ['seventeen indicators', '17 indicators'],
  ['sixty days', '60 days'], ['days thirty to thirty-three', 'days 30–33'], ['day forty-seven', 'day 47'], ['ten fifteen-minute', 'ten 15-minute'],
  ['thirteen', '13'], ['seven-page', '7-page'], ['forty-four', '44'], ['four and a half minutes', '4.5 minutes'], ['ninety-six seconds', '96 seconds'],
  ['ninety-six when', '96 when'], ['fifty-eight', '58'], ['CO2', 'CO₂'], ['twenty live', '20 live'], ['all twenty', 'all 20'], ['one hertz', '1 Hz']];
const SUB = (t) => SUBS.reduce((s, [a, b]) => s.split(a).join(b), t);

// ------------------------------------------------------------ 1. narration (Kokoro)
function tts() {
  if (!KOKORO_DIR) throw new Error('Set KOKORO_DIR to the folder with kokoro-v1.0.onnx and voices-v1.0.bin');
  const jobs = SEGMENTS.map((s, i) => ({ text: s.t.replace(/[’‘]/g, "'"), out: path.join(WORK, `voice_${i}.wav`) }));
  run('uv', ['run', '--python', '3.12', '--with', 'kokoro-onnx', '--with', 'soundfile', 'python',
    path.join(__dirname, 'tts_kokoro.py'), KOKORO_DIR, VOICE, SPEED], { input: JSON.stringify(jobs) });
  return SEGMENTS.map((s, i) => {
    const vd = dur(jobs[i].out);
    return { ...s, voice: jobs[i].out, vd, d: vd + PAD + (i === 0 ? 0.4 : 0) + (i === SEGMENTS.length - 1 ? 1.8 : 0) };
  });
}

// ------------------------------------------------------------ 2. slides + paper pages
function pdfToPng(pdf, dir, width) {
  fs.mkdirSync(dir, { recursive: true });
  const swift = path.join(WORK, 'pdf2png.swift');
  fs.writeFileSync(swift, `import PDFKit
import AppKit
let a = CommandLine.arguments
let doc = PDFDocument(url: URL(fileURLWithPath: a[1]))!
let width = CGFloat(Double(a[3])!)
for i in 0..<doc.pageCount {
  let p = doc.page(at: i)!; let r = p.bounds(for: .mediaBox); let s = width / r.width
  let img = NSImage(size: NSSize(width: r.width * s, height: r.height * s)); img.lockFocus()
  NSColor.white.set(); NSRect(x: 0, y: 0, width: r.width * s, height: r.height * s).fill()
  let c = NSGraphicsContext.current!.cgContext; c.scaleBy(x: s, y: s); p.draw(with: .mediaBox, to: c); img.unlockFocus()
  let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\\(a[2])/page\\(i + 1).png"))
}`);
  run('swift', [swift, pdf, dir, String(width)]);
}
function slides() {
  const dir = path.join(WORK, 'slides');
  if (fs.existsSync(path.join(dir, 'page12.png'))) return dir;
  const pptx = path.join(WORK, 'deck.pptx'), pdf = path.join(WORK, 'deck.pdf');
  fs.copyFileSync(path.join(ROOT, 'presentation', 'NeuroShield_TeamParagon.pptx'), pptx);
  run('osascript', ['-e', `tell application "Keynote"
    set d to open POSIX file "${pptx}"
    delay 4
    export d to POSIX file "${pdf}" as PDF
    close d saving no
  end tell`]);
  pdfToPng(pdf, dir, W);
  return dir;
}
// Paper pages stacked on a navy strip, centred; returns the strip and each page's top offset.
async function paperStrip() {
  const dir = path.join(WORK, 'paper');
  pdfToPng(path.join(ROOT, 'paper', 'NeuroShield_IEEE.pdf'), dir, 1150);
  const pages = fs.readdirSync(dir).filter((f) => /^page\d+\.png$/.test(f)).sort((a, b) => parseInt(a.slice(4)) - parseInt(b.slice(4)));
  // PDFKit renders at the screen's backing scale, so normalise every page to 1150 px wide
  const bufs = await Promise.all(pages.map((p) => sharp(path.join(dir, p)).resize(1150).png().toBuffer()));
  const meta = await Promise.all(bufs.map((b) => sharp(b).metadata()));
  const gap = 48, top0 = 60;
  const tops = [];
  let y = top0;
  for (const m of meta) { tops.push(y); y += m.height + gap; }
  const strip = path.join(WORK, 'paper_strip.png');
  await sharp({ create: { width: W, height: y + H, channels: 3, background: NAVY } })
    .composite(bufs.map((b, i) => ({ input: b, left: Math.round((W - meta[i].width) / 2), top: tops[i] })))
    .png().toFile(strip);
  return { strip, tops, pageH: meta[0].height };
}

// ------------------------------------------------------------ 3. app capture (frame by frame, 2x)
async function capture(segs) {
  const exe = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 1920, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(ROOT, 'app', 'index.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(600);
  const box = async (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const c169 = (x, y, w) => ({ x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), width: Math.round(w), height: Math.round(w * 9 / 16) });
  const seek = (t) => page.evaluate((x) => NS.stream.seek(x), t);
  const scenario = (id) => page.selectOption('#scenarioSel', id);
  const out = {};
  const nFrames = (k) => Math.ceil(segs.find((s) => s.v.app === k).d * CAP_FPS) + 2;
  async function seq(key, frameFn) {
    const n = nFrames(key);
    const dir = path.join(WORK, 'cap_' + key);
    out[key] = dir;
    // reuse a previous capture of the same length (narration is deterministic)
    if (!process.env.FRESH && fs.existsSync(dir) && fs.readdirSync(dir).length === n) { process.stdout.write(`   ${key}: cached\n`); return; }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir);
    let prev = null;
    for (let f = 0; f < n; f++) {
      const r = await frameFn(f, n);
      const file = path.join(dir, `f_${String(f).padStart(4, '0')}.png`);
      if (r.same && prev) { fs.copyFileSync(prev, file); continue; }
      await page.waitForTimeout(130); // the app redraws at most every 90 ms
      const buf = await page.screenshot({ clip: r.clip });
      await sharp(buf).resize(W, H).png().toFile(file);
      prev = file;
    }
    out[key] = dir;
    process.stdout.write(`   ${key}: ${n} frames\n`);
  }
  // Switches state at the given fractions of the segment and holds one screenshot per state.
  const states = (list) => {
    let cur = -1, clip = null;
    return async (f, n) => {
      let i = 0;
      while (i + 1 < list.length && f / n >= list[i + 1][0]) i++;
      if (i === cur) return { clip, same: true };
      cur = i;
      await list[i][1]();
      clip = typeof list[i][2] === 'function' ? await list[i][2]() : list[i][2];
      return { clip };
    };
  };

  const full = c169(0, 0, 1920);
  await scenario('nominal');
  const cards = await box('#cards');
  const cardsClip = c169(0, cards.y - 150, cards.x + cards.w + 20);
  const first = await box('#cards .card');
  const cardClip = c169(first.x - 14, first.y - 14, 820);
  const alertsClip = async () => { const a = await box('#alerts'); return c169(a.x + a.w - 720 + 20, a.y - 60, 720); };

  await seq('overview', async (f) => { await seek(300 + f * 2); return { clip: full }; });
  await scenario('fatigue_microsleep');
  await seq('card', async (f) => { await seek(560 + f * 0.5); return { clip: cardClip }; });
  let aClip = null;
  await seq('fatigue', async (f, n) => {
    await seek(300 + f * 2.2);
    if (f < n * 0.6) return { clip: cardsClip };
    aClip = aClip || await alertsClip();
    return { clip: aClip };
  });
  await scenario('hypoxia_leak');
  aClip = null;
  await seq('hypoxia', async (f, n) => {
    await seek(215 + f * 2.2);
    if (f < n * 0.45) return { clip: cardsClip };
    aClip = aClip || await alertsClip();
    return { clip: aClip };
  });
  const mont = [['gloc_high_g', 470], ['spatial_disorientation', 450], ['hypercapnia_scrubber', 700], ['hypoglycaemia', 600], ['fever_infection', 820], ['solar_particle_event', 430]];
  await seq('montage', states(mont.map(([id, t], k) => [k / mont.length, async () => { await scenario(id); await seek(t); }, cardsClip])));
  await scenario('hypoxia_leak');
  await seek(560);
  const sp = await box('#view-live .score-panel');
  await seq('score', states([[0, async () => {}, c169(sp.x - 150, sp.y - 30, 680)]]));
  const side = await box('#view-live .side');
  const bodyClip = c169(1920 - 1000 - 10, side.y - 10, 1000);
  await seq('body', states(['neuro', 'cardio', 'resp', 'thermal', 'env'].map((r, k) => [k / 5, () => page.evaluate((x) => NS.bodymap.select(x), r), bodyClip])));
  await page.click('[data-tab=checkin]');
  await seq('checkin', states([[0, async () => {}, c169(0, 60, 1460)]]));
  await page.click('[data-tab=logbook]');
  await page.selectOption('#crewSel', 'D');
  await page.selectOption('#metricSel', 'mass_change');
  const chart = await box('#lbChart');
  await seq('logbook', states([[0, async () => {}, c169(chart.x - 30, chart.y - 70, 1250)]]));
  const heat = await box('#heat');
  await seq('heat', states([[0, async () => {}, c169(heat.x - 30, heat.y - 60, heat.w + 60)]]));
  await seq('episodes', states([[0, async () => {
    await page.selectOption('#crewSel', 'C');
    await page.selectOption('#metricSel', 'temp');
  }, async () => { const e = await box('#view-logbook .side'); return c169(e.x + e.w - 980 + 10, e.y - 20, 980); }]]));
  await page.click('[data-tab=guide]');
  await seq('guide', states([[0, async () => {}, c169(0, 60, 1920)]]));
  await browser.close();
  return out;
}

// ------------------------------------------------------------ 4. subtitles
function cues(segs) {
  const out = [];
  let t = 0;
  for (const s of segs) {
    const words = SUB(s.t).split(' ');
    const chunks = [];
    let cur = [];
    for (const w of words) {
      cur.push(w);
      const line = cur.join(' ');
      if (line.length > 54 || (/[.:;]$/.test(w) && line.length > 22)) { chunks.push(line); cur = []; }
    }
    if (cur.length) chunks.push(cur.join(' '));
    const total = chunks.reduce((a, c) => a + c.length, 0);
    let ct = t + 0.05 + (s === segs[0] ? 0.4 : 0);
    for (const c of chunks) { const d = s.vd * c.length / total; out.push({ a: ct, b: ct + d, text: c }); ct += d; }
    t += s.d;
  }
  return out;
}
const srtTime = (x) => {
  const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
async function cuePng(text, file) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fsz = 44, wTxt = Math.min(W - 160, Math.round(text.length * fsz * 0.52) + 80);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="120">
    <rect x="${(W - wTxt) / 2}" y="18" width="${wTxt}" height="82" rx="14" fill="#000" fill-opacity="0.66"/>
    <text x="${W / 2}" y="72" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="${fsz}" font-weight="500" fill="#fff">${esc}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

// ------------------------------------------------------------ 5. assemble
(async () => {
  console.log('1/7 narration (Kokoro, voice ' + VOICE + ')');
  const segs = tts();
  const total = segs.reduce((a, s) => a + s.d, 0);
  console.log(`   total ${total.toFixed(1)} s`);
  console.log('2/7 slides + paper');
  const sdir = slides();
  const paper = await paperStrip();
  console.log('3/7 app capture');
  const cap = await capture(segs);

  console.log('4/7 video clips');
  const clips = segs.map((s, i) => {
    const out = path.join(WORK, `clip_${i}.mp4`);
    const frames = Math.round(s.d * FPS);
    const fade = `fade=t=in:st=0:d=0.3,fade=t=out:st=${(s.d - 0.3).toFixed(2)}:d=0.3`;
    let args;
    if (s.v.slide) {
      args = ['-y', '-loop', '1', '-framerate', String(FPS), '-i', path.join(sdir, `page${s.v.slide}.png`), '-vf', `scale=${W}:${H},${fade}`];
    } else if (s.v.app) {
      args = ['-y', '-framerate', String(CAP_FPS), '-i', path.join(cap[s.v.app], 'f_%04d.png'), '-vf', `fps=${FPS},${fade}`];
    } else {
      const [p0, f0, p1, f1] = s.v.paper;
      const A = Math.max(0, Math.round(paper.tops[p0] + f0 * paper.pageH - 30)), B = Math.max(0, Math.round(paper.tops[p1] + f1 * paper.pageH - 30));
      const D = Math.max(0.1, s.d - 1.4);
      const p = `clip((t-0.5)/${D.toFixed(2)},0,1)`; // smooth-step scroll from A to B after 0.5 s
      args = ['-y', '-loop', '1', '-framerate', String(FPS), '-i', paper.strip, '-vf',
        `crop=${W}:${H}:0:'${A}+(${B - A})*${p}*${p}*(3-2*${p})',${fade}`];
    }
    run('ffmpeg', [...args, '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), out]);
    return out;
  });
  const list = path.join(WORK, 'clips.txt');
  fs.writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n'));
  const silent = path.join(WORK, 'video_silent.mp4');
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);

  console.log('5/7 voice track');
  const vparts = segs.map((s, i) => {
    const f = path.join(WORK, `vpad_${i}.wav`);
    const lead = i === 0 ? 400 : 0;
    run('ffmpeg', ['-y', '-i', s.voice, '-af', `aresample=48000,adelay=${lead}:all=1,apad,atrim=0:${s.d.toFixed(3)}`, '-ac', '2', f]);
    return f;
  });
  fs.writeFileSync(path.join(WORK, 'voice.txt'), vparts.map((f) => `file '${f}'`).join('\n'));
  const voiceRaw = path.join(WORK, 'voice_raw.wav'), voice = path.join(WORK, 'voice.wav');
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(WORK, 'voice.txt'), '-c', 'copy', voiceRaw]);
  run('ffmpeg', ['-y', '-i', voiceRaw, '-af', 'highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', voice]);

  console.log('6/7 music + mix');
  const pad = [[110, 0.07], [164.81, 0.05], [220, 0.11], [261.63, 0.08], [329.63, 0.06]]
    .map(([f, l]) => `0.18*sin(2*PI*${f}*t)*(0.6+0.4*sin(2*PI*${l}*t))`).join('+');
  const music = path.join(WORK, 'music.wav');
  run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `aevalsrc='${pad}':s=48000:d=${total.toFixed(2)}`, '-af',
    `lowpass=f=900,aecho=0.8:0.7:600|1100:0.3|0.2,volume=0.13,afade=t=in:d=3,afade=t=out:st=${(total - 3).toFixed(2)}:d=3`, '-ac', '2', music]);
  const mix = path.join(WORK, 'mix.m4a');
  run('ffmpeg', ['-y', '-i', voice, '-i', music, '-filter_complex', '[0:a][1:a]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]',
    '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', mix]);

  console.log('7/7 subtitles + final encode');
  const cs = cues(segs);
  fs.writeFileSync(SRT, cs.map((c, i) => `${i + 1}\n${srtTime(c.a)} --> ${srtTime(c.b)}\n${c.text}\n`).join('\n'));
  const inputs = ['-i', silent, '-i', mix, '-i', SRT];
  let fc = '', last = '0:v';
  for (let i = 0; i < cs.length; i++) {
    const png = path.join(WORK, `cue_${i}.png`);
    await cuePng(cs[i].text, png);
    inputs.push('-i', png);
    const tag = i === cs.length - 1 ? 'vout' : `v${i}`;
    fc += `[${last}][${i + 3}:v]overlay=0:${H - 165}:enable='between(t,${cs[i].a.toFixed(2)},${cs[i].b.toFixed(2)})'[${tag}];`;
    last = tag;
  }
  fs.writeFileSync(path.join(WORK, 'overlay.txt'), fc.replace(/;$/, ''));
  run('ffmpeg', ['-y', ...inputs, '-/filter_complex', path.join(WORK, 'overlay.txt'), '-map', '[vout]', '-map', '1:a', '-map', '2:s',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-c:s', 'mov_text',
    '-metadata:s:s:0', 'language=eng', '-metadata', 'title=NeuroShield — Team Paragon', '-movflags', '+faststart', '-shortest', OUT]);
  console.log(`Video written: ${OUT} (${dur(OUT).toFixed(1)} s)\nSubtitles: ${SRT}`);
})();
