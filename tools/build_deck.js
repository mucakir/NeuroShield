#!/usr/bin/env node
// Builds presentation/NeuroShield_TeamParagon.pptx (7 slides, 16:9) with pptxgenjs.
// One slide per Space Apps judging criterion: Impact, Creativity, Presentation, Relevance, Validity.
// Structured deck: theme colors + fonts, two layouts (TITLE, CONTENT), sections, speaker notes.
// Usage: node tools/build_deck.js [path/to/apply_theme.js]
// Screenshots: node tools/capture_deck_assets.js (presentation/assets/deck_*.png); paper page 1 (assets/paper_p1.png):
//   uv run --with pymupdf python -c "import pymupdf; pymupdf.open('paper/NeuroShield_IEEE.pdf')[0].get_pixmap(dpi=200).save('presentation/assets/paper_p1.png')"
// Needs: pptxgenjs, react, react-dom, react-icons, sharp.
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const fa = require('react-icons/fa6');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'presentation', 'NeuroShield_TeamParagon.pptx');
const A = (f) => path.join(ROOT, 'presentation', 'assets', f);
const DEMO = 'paragonaerotech.com/spaceappschallenge/app';
const VIDEO = 'youtube.com/watch?v=gFMQSDXIvwI';
const REPO = 'github.com/mucakir/NeuroShield';

const THEME = {
  name: 'NeuroShield Mission Control',
  headFontFace: 'Arial',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '0A1222', lt1: 'FFFFFF', dk2: '13223D', lt2: 'A9B8CE',
    accent1: '5EB3FF', accent2: 'F6B54A', accent3: '34D399', accent4: 'F87171', accent5: 'A78BFA', accent6: '22D3EE',
    hlink: '5EB3FF', folHlink: 'A78BFA',
  },
};
const HEX = THEME.colors;
const BG = HEX.dk1;
const LINE = '24395C';

// ------------------------------------------------------------------ helpers
async function icon(Comp, color = '#0A1222') {
  const svg = renderToStaticMarkup(React.createElement(Comp, { size: 256, color }));
  const buf = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}
async function svgPng(file, width) {
  const buf = await sharp(file, { density: 200 }).resize({ width }).flatten({ background: '#ffffff' }).png().toBuffer();
  const m = await sharp(buf).metadata();
  return { data: 'image/png;base64,' + buf.toString('base64'), ratio: m.height / m.width };
}
// a region of an image (fractions of width/height), as a data URL plus its height/width ratio
async function crop(file, top, bottom, left = 0, right = 1) {
  const m = await sharp(file).metadata();
  const region = { left: Math.round(left * m.width), top: Math.round(top * m.height), width: Math.round((right - left) * m.width), height: Math.round((bottom - top) * m.height) };
  const buf = await sharp(file).extract(region).png().toBuffer();
  return { data: 'image/png;base64,' + buf.toString('base64'), ratio: region.height / region.width };
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
  pres.author = 'Team Paragon';
  pres.company = 'Team Paragon';
  pres.title = 'NeuroShield: camera-free health self-assessment for astronauts';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  pres.defineSlideMaster({
    title: 'TITLE',
    background: { color: BG },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 1.45, w: 6.6, h: 1.2, fontSize: 54, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.7, y: 2.75, w: 6.4, h: 0.9, fontSize: 22, color: C.accent1, valign: 'top', align: 'left', margin: 0 }, text: '' } },
    ],
  });
  pres.defineSlideMaster({
    title: 'CONTENT',
    background: { color: BG },
    margin: [0.5, 0.6, 0.6, 0.6],
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.3, w: 12.1, h: 0.85, fontSize: 30, bold: true, color: C.background1, valign: 'middle', margin: 0 }, text: '' } },
      { text: { text: 'NeuroShield  ·  Team Paragon  ·  NASA Space Apps Challenge 2026', options: { x: 0.6, y: 7.05, w: 8, h: 0.3, fontSize: 10, color: C.background2, margin: 0 } } },
    ],
    slideNumber: { x: 12.2, y: 7.05, w: 0.5, h: 0.3, fontSize: 10, color: C.background2, align: 'right' },
  });

  // shapes ------------------------------------------------------------
  const card = (s, x, y, w, h, name, fill) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12, fill: { color: fill || C.text2 }, line: { color: LINE, width: 0.75 }, objectName: name,
  });
  const badge = async (s, x, y, d, Comp, color, name) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color }, line: { type: 'none' }, objectName: name + ' circle' });
    s.addImage({ data: await icon(Comp), x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52, objectName: name + ' icon' });
  };
  const text = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, color: C.background1, fontSize: 14, valign: 'top', ...o });
  const arrow = (s, x1, y1, x2, y2, name) => s.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001,
    flipV: y2 < y1, line: { color: HEX.lt2, width: 1.5, endArrowType: 'triangle' }, objectName: name,
  });
  const shadow = () => ({ type: 'outer', color: '000000', blur: 12, offset: 4, angle: 90, opacity: 0.45 });
  // picture fitted inside a box (keeps its aspect ratio, centred)
  const fit = (s, img, x, y, w, h, name, sh = true) => {
    let iw = w, ih = w * img.ratio;
    if (ih > h) { ih = h; iw = h / img.ratio; }
    s.addImage({ data: img.data, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih, objectName: name, ...(sh ? { shadow: shadow() } : {}) });
  };

  // ================================================================ 1 Title
  pres.addSection({ title: 'Opening' });
  let s = pres.addSlide({ masterName: 'TITLE', sectionTitle: 'Opening' });
  s.addText('NeuroShield', { placeholder: 'title' });
  s.addText('Camera-free health self-assessment for astronauts', { placeholder: 'body' });
  await badge(s, 0.7, 0.6, 0.62, fa.FaShieldHeart, C.accent1, 'Logo');
  text(s, 'TEAM PARAGON', { x: 1.5, y: 0.65, w: 4, h: 0.5, fontSize: 16, bold: true, charSpacing: 3, valign: 'middle' });
  text(s, 'When Earth is 24 minutes away, the crew must be its own first responder.', { x: 0.7, y: 3.75, w: 6.3, h: 0.8, fontSize: 18, italic: true, color: C.accent2 });
  text(s, [
    { text: 'NASA Space Apps Challenge 2026', options: { bold: true, breakLine: true } },
    { text: 'Create Health Monitoring Software for Astronauts on Space Missions', options: { color: C.background2 } },
  ], { x: 0.7, y: 4.8, w: 6.3, h: 0.8, fontSize: 15 });
  text(s, [
    { text: 'Mehmet Ulaş Çakır', options: { bold: true } }, { text: '  Team Lead  ·  ', options: { color: C.background2 } },
    { text: 'Ece Özge Çakır', options: { bold: true } }, { text: '  Researcher', options: { color: C.background2, breakLine: true } },
    { text: 'Dr. Rıfat Uğurlutan', options: { bold: true } }, { text: '  Consultant  ·  ', options: { color: C.background2 } },
    { text: 'Dr. Emre Ayvaz', options: { bold: true } }, { text: '  Consultant', options: { color: C.background2 } },
  ], { x: 0.7, y: 5.85, w: 6.4, h: 0.7, fontSize: 13 });
  const live = await crop(A('deck_live_mars.png'), 0, 0.62, 0, 0.75);
  fit(s, live, 7.45, 1.1, 5.4, 4.6, 'App screenshot');
  text(s, 'Live Monitor · Mars base, slow habitat leak', { x: 7.45, y: 5.05, w: 5.4, h: 0.3, fontSize: 11, color: C.background2, align: 'right' });
  text(s, 'See it before you feel it.', { x: 7.45, y: 6.0, w: 5.4, h: 0.5, fontSize: 20, bold: true, color: C.accent1, align: 'right' });
  s.addNotes('NeuroShield is Team Paragon\'s answer to the health-monitoring challenge. It is a camera-free tool that lets astronauts see, understand and act on their own health, on the station, on the Moon and on Mars. On the way to Mars help is up to 24 minutes away, so the crew has to be its own first responder.');

  // ================================================================ 2 Problem (Impact)
  pres.addSection({ title: 'Problem' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Problem' });
  s.addText('Longer missions, farther from help', { placeholder: 'title' });
  text(s, 'Artemis has flown a crew around the Moon; Mars is next. NASA\'s Human Research Program maps five hazards of spaceflight:', { x: 0.6, y: 1.2, w: 12.1, h: 0.4, fontSize: 15, color: C.background2 });
  const hazards = [
    [fa.FaRadiation, C.accent2, 'Space radiation', 'Solar storms, immune and cancer risk'],
    [fa.FaUserAstronaut, C.accent5, 'Isolation & confinement', 'Sleep loss, low mood, fatigue'],
    [fa.FaEarthAmericas, C.accent1, 'Distance from Earth', 'Help and evacuation are delayed'],
    [fa.FaArrowDown, C.accent6, 'Gravity fields', 'Fluid shift, bone loss, G-LOC'],
    [fa.FaWind, C.accent4, 'Hostile closed environment', 'CO₂ build-up, leaks, heat'],
  ];
  for (let i = 0; i < 5; i++) {
    const [Ic, col, t, d] = hazards[i];
    const x = 0.6 + i * 2.46;
    card(s, x, 1.75, 2.26, 2.1, 'Hazard card ' + (i + 1));
    await badge(s, x + 0.22, 1.95, 0.62, Ic, col, 'Hazard ' + (i + 1));
    text(s, t, { x: x + 0.22, y: 2.68, w: 1.9, h: 0.5, fontSize: 15, bold: true });
    text(s, d, { x: x + 0.22, y: 3.3, w: 1.9, h: 0.5, fontSize: 12, color: C.background2 });
  }
  // signal delay line: Earth → ISS → Moon → Mars
  card(s, 0.6, 3.95, 7.4, 2.85, 'Delay card', '101C33');
  text(s, 'One-way signal delay to the flight surgeon', { x: 0.9, y: 4.1, w: 6.8, h: 0.35, fontSize: 15, bold: true });
  s.addShape(pres.shapes.LINE, { x: 1.2, y: 5.25, w: 6.2, h: 0, line: { color: HEX.lt2, width: 2, dashType: 'dash' }, objectName: 'Delay line' });
  const stops = [['Earth', '', C.accent1, 1.2], ['ISS', '0.5 s', C.background2, 2.6], ['Moon', '1.3 s', C.background2, 4.2], ['Mars', 'up to 24 min', C.accent4, 7.0]];
  stops.forEach(([n, d, col, x], i) => {
    const r = i === 3 ? 0.5 : i === 0 ? 0.42 : 0.26;
    s.addShape(pres.shapes.OVAL, { x: x - r / 2, y: 5.25 - r / 2, w: r, h: r, fill: { color: col }, line: { type: 'none' }, objectName: n + ' dot' });
    text(s, n, { x: x - 0.8, y: 4.6, w: 1.6, h: 0.3, fontSize: 14, bold: true, align: 'center' });
    if (d) text(s, d, { x: x - 1.0, y: 5.6, w: 2.0, h: 0.4, fontSize: i === 3 ? 20 : 15, bold: i === 3, color: i === 3 ? C.accent4 : C.background2, align: 'center' });
  });
  text(s, 'On Mars, a question and its answer take up to 48 minutes.', { x: 0.9, y: 6.2, w: 6.8, h: 0.35, fontSize: 13, color: C.background2 });
  card(s, 8.3, 3.95, 4.4, 2.85, 'Gap card', '0F2A4A');
  text(s, 'Today\'s tools are not enough', { x: 8.6, y: 4.1, w: 3.9, h: 0.35, fontSize: 15, bold: true, color: C.accent2 });
  text(s, [
    { text: 'Cameras are blind under helmets, visors and masks', options: { bullet: true, breakLine: true } },
    { text: 'Periodic exams are snapshots; fast events slip by', options: { bullet: true, breakLine: true } },
    { text: 'Data reviewed on the ground arrives too late', options: { bullet: true, breakLine: true } },
    { text: 'Astronauts must assess themselves and act', options: { bullet: true, bold: true } },
  ], { x: 8.6, y: 4.55, w: 3.9, h: 2.1, fontSize: 13, paraSpaceAfter: 4 });
  s.addNotes('As missions get longer and farther, the five spaceflight hazards weigh more. On the ISS a flight surgeon answers almost at once. At Mars a one-way message takes up to 24 minutes, so a question and its answer take up to 48. Cameras fail behind helmets and masks, and periodic exams miss fast events. The challenge asks for a tool that lets astronauts assess their own health; that is our goal.');

  // ================================================================ 3 Solution (Creativity)
  pres.addSection({ title: 'Solution' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Solution' });
  s.addText('Measure → understand → act, without waiting for Earth', { placeholder: 'title' });
  const flow = [
    [fa.FaHelmetSafety, C.accent1, 'Measure', ['Wearable: EEG, fNIRS brain O₂, heart rate, SpO₂, skin conductance, head motion', 'The challenge\'s six: BP, HR, glucose, temperature, sleep, mood', 'Cabin: CO₂, O₂, pressure, radiation', 'Photos: skin, eye/OCT, wound, ultrasound']],
    [fa.FaMicrochip, C.accent5, 'Understand', ['21 explainable rules with persistence and hysteresis', 'Health score 0–100 per body system', 'Change vs the astronaut\'s own baseline, not a population average']],
    [fa.FaListCheck, C.accent3, 'Act', ['Every alert: why it fired, numbered steps, linked source', 'Prevention: timed routine for sleep, food, water, exercise']],
    [fa.FaTowerBroadcast, C.accent2, 'Escalate', ['Who leads depends on the delay: flight surgeon on the ISS, Crew Medical Officer at Mars', 'Alert package sent to the ground']],
  ];
  for (let i = 0; i < 4; i++) {
    const [Ic, col, t, items] = flow[i];
    const x = 0.6 + i * 3.1;
    card(s, x, 1.35, 2.8, 4.1, 'Step card ' + (i + 1));
    await badge(s, x + 0.25, 1.55, 0.72, Ic, col, 'Step ' + (i + 1));
    text(s, t, { x: x + 1.1, y: 1.6, w: 1.6, h: 0.6, fontSize: 20, bold: true, valign: 'middle', color: col });
    text(s, items.map((x, k) => ({ text: x, options: { bullet: true, breakLine: k < items.length - 1 } })), { x: x + 0.25, y: 2.45, w: 2.4, h: 2.9, fontSize: 13, color: C.background1, paraSpaceAfter: 5 });
    if (i < 3) arrow(s, x + 2.83, 3.4, x + 3.07, 3.4, 'Flow arrow ' + (i + 1));
  }
  const news = [
    ['Camera-free', 'works behind visors and masks, in darkness'],
    ['Minutes early', 'brain, body and cabin signals change before visible signs'],
    ['Delay-aware', 'guidance changes with the distance from Earth'],
  ];
  news.forEach(([h, d], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 5.7, 3.9, 1.05, 'Novelty ' + (i + 1), '0F2A4A');
    text(s, [{ text: h, options: { bold: true, color: C.accent1, breakLine: true } }, { text: d, options: { color: C.background2 } }], { x: x + 0.25, y: 5.82, w: 3.45, h: 0.85, fontSize: 14 });
  });
  s.addNotes('NeuroShield measures, understands and acts. It reads wearable brain and body sensors, the six indicators named in the challenge, the cabin and the crew\'s own photos. Twenty-one explainable rules and a personal baseline turn that into a health score and alerts. Each alert says why, what to do in numbered steps, and who leads: at Mars that is the Crew Medical Officer, because the flight surgeon is minutes away. What is new: no camera, warnings minutes before visible signs, and guidance that adapts to the delay.');

  // ================================================================ 4 Demo (Presentation)
  pres.addSection({ title: 'Product' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Product' });
  s.addText('A working demo of everything the challenge asks for', { placeholder: 'title' });
  const tiles = [
    ['Different environments', 'ISS · Moon · Mars, 12 scenarios each: base, rover, EVA, landing', await crop(A('deck_live_mars.png'), 0.05, 0.33, 0, 0.6)],
    ['Routine & reminders', 'Timed daily tasks with "How?" steps and snooze', await crop(A('deck_routine.png'), 0, 0.42)],
    ['Gamification', 'XP, on-time bonus, streaks and badges', await crop(A('deck_routine.png'), 0.6, 1.0)],
    ['Dynamic charts', 'Live 1 Hz streams and a 60-day personal logbook', await crop(A('deck_chart.png'), 0, 1)],
    ['Colour coding', 'Green / amber / red signal cards, plus a clickable body figure', await crop(A('deck_live_mars.png'), 0.33, 0.62, 0, 0.44)],
    ['Instructions & explanations', 'Guide with sources, hover tips, AI Assistant', await crop(A('deck_guide.png'), 0.05, 0.42, 0, 0.62)],
  ];
  for (let i = 0; i < 6; i++) {
    const [t, d, img] = tiles[i];
    const x = 0.6 + (i % 3) * 4.08, y = 1.3 + Math.floor(i / 3) * 2.75;
    card(s, x, y, 3.85, 2.55, 'Feature ' + (i + 1));
    fit(s, img, x + 0.15, y + 0.15, 3.55, 1.5, 'Feature screenshot ' + (i + 1), false);
    text(s, (i + 1) + '  ' + t, { x: x + 0.2, y: y + 1.75, w: 3.5, h: 0.32, fontSize: 15, bold: true, color: C.accent1 });
    text(s, d, { x: x + 0.2, y: y + 2.08, w: 3.5, h: 0.4, fontSize: 12, color: C.background2 });
  }
  text(s, [{ text: 'Try it: ', options: { bold: true } }, { text: DEMO, options: { color: C.accent1, hyperlink: { url: 'https://' + DEMO + '/index.html' } } }, { text: '   ·   no login, works offline   ·   30 s video: ', options: { color: C.background2 } }, { text: VIDEO, options: { color: C.accent1, hyperlink: { url: 'https://www.' + VIDEO } } }],
    { x: 0.6, y: 6.8, w: 12.1, h: 0.25, fontSize: 12 });
  s.addNotes('Here is the demo, feature by feature. One: three missions with twelve scenarios each. Two: a timed daily routine with step-by-step help and reminders. Three: XP, streaks and badges. Four: live charts and a 60-day logbook. Five: colour coding and a clickable body figure. Six: a guide with linked sources, hover explanations and an assistant. The link opens the app in any browser, with no login.');

  // ================================================================ 5 NASA data (Relevance)
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Product' });
  s.addText('Built on real NASA data', { placeholder: 'title' });
  const nasa = [
    [fa.FaSatellite, C.accent6, 'ISS cabin and radiation (NASA OSDR EDA)', 'Real CO₂ and dose set the habitat baselines; the logbook\'s 60 days are real ISS days of mission RR-7, with a real CO₂ excursion'],
    [fa.FaVial, C.accent4, 'Inspiration4 bloodwork (OSDR OSD-569 / 575)', 'Each astronaut scored against their own preflight baseline; shared changes the day after landing'],
    [fa.FaBookMedical, C.accent3, 'HRP risks and NASA-STD-3001 limits', 'Every indicator is mapped to the 5 hazards and HRP risks, with a linked source for each limit'],
    [fa.FaSun, C.accent2, 'NOAA space weather', 'Live GOES proton flux and the S-scale, for EVA and shelter decisions'],
  ];
  for (let i = 0; i < 4; i++) {
    const [Ic, col, t, d] = nasa[i];
    const y = 1.3 + i * 1.38;
    card(s, 0.6, y, 5.9, 1.22, 'Source ' + (i + 1));
    await badge(s, 0.8, y + 0.25, 0.7, Ic, col, 'Source ' + (i + 1));
    text(s, t, { x: 1.7, y: y + 0.13, w: 4.65, h: 0.35, fontSize: 15, bold: true });
    text(s, d, { x: 1.7, y: y + 0.5, w: 4.65, h: 0.68, fontSize: 12, color: C.background2 });
  }
  const heat = await crop(A('deck_heat.png'), 0, 1);
  fit(s, heat, 6.85, 1.3, 5.85, 2.55, 'Logbook anomaly map');
  text(s, 'Crew Logbook: real ISS CO₂ excursion (days 37–44) in the anomaly map', { x: 6.85, y: 3.92, w: 5.85, h: 0.28, fontSize: 11, color: C.background2, align: 'right' });
  const bw = await crop(A('deck_bloodwork.png'), 0, 0.16, 0, 0.6);
  fit(s, bw, 6.85, 4.4, 5.85, 2.1, 'Bloodwork table');
  text(s, 'Bloodwork: Inspiration4 panels vs each astronaut\'s preflight baseline', { x: 6.85, y: 6.6, w: 5.85, h: 0.28, fontSize: 11, color: C.background2, align: 'right' });
  s.addNotes('NASA data is at the core, not decoration. Real ISS cabin and radiation data from the Open Science Data Repository set our habitat baselines, and the logbook replays sixty real station days, including a real CO2 excursion. The Bloodwork tab scores the Inspiration4 crew against their own preflight values. Every indicator is mapped to the Human Research Program risks and NASA standards, and NOAA space weather feeds the radiation view.');

  // ================================================================ 6 Evidence (Validity)
  pres.addSection({ title: 'Evidence' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Evidence' });
  s.addText('The details of the study are in the paper', { placeholder: 'title' });
  const page = await crop(A('paper_p1.png'), 0, 1);
  fit(s, page, 0.6, 1.3, 4.3, 5.55, 'Paper first page');
  // the paper's study figures (Fig. 2-7)
  const F = (f) => path.join(ROOT, 'paper', 'figures', f);
  const figs = [
    ['Fig. 2  Live monitor, cabin leak', await crop(F('fig_ui_live.png'), 0, 1)],
    ['Fig. 3  Daily routine', await crop(F('fig_ui_checkin.png'), 0, 1)],
    ['Fig. 4  Image log', await crop(F('fig_ui_images.png'), 0, 1)],
    ['Fig. 5  Fatigue → microsleep', await svgPng(F('fig_fatigue.svg'), 1400)],
    ['Fig. 6  Slow cabin leak', await svgPng(F('fig_hypoxia.svg'), 1400)],
    ['Fig. 7  Crew D logbook', await crop(F('fig_ui_logbook.png'), 0, 1)],
  ];
  figs.forEach(([cap, img], i) => {
    const x = 5.2 + (i % 2) * 3.8, y = 1.3 + Math.floor(i / 2) * 1.88;
    card(s, x, y, 3.7, 1.78, 'Figure card ' + (i + 1));
    fit(s, img, x + 0.1, y + 0.1, 3.5, 1.3, 'Paper figure ' + (i + 2), false);
    text(s, cap, { x: x + 0.15, y: y + 1.45, w: 3.4, h: 0.26, fontSize: 11, color: C.background2, align: 'center' });
  });
  s.addNotes('The full method, the validation on synthetic scenarios and on open human datasets, and all 68 references are in our IEEE-format paper. On the left is its first page; on the right are the study figures: the live monitor, the daily routine, the image log, the fatigue and cabin-leak scenarios, and a crew logbook.');

  // ================================================================ 7 Next steps + closing (Impact)
  pres.addSection({ title: 'Next steps' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Next steps' });
  s.addText('Next: from prototype to the crew', { placeholder: 'title' });
  const steps = [
    [fa.FaLaptopCode, C.accent1, 'Today', 'Web app, open data pipeline, IEEE paper, demo'],
    [fa.FaHelmetSafety, C.accent3, 'Next', 'Connect the NeuroShield headband (WebSocket input ready)'],
    [fa.FaVrCardboard, C.accent2, 'Then', 'Volunteer tests on a motion simulator'],
    [fa.FaRobot, C.accent5, 'On board', 'Small medical language model (MedGemma), offline'],
    [fa.FaUsers, C.accent6, 'Analog crews', 'Usability tests with analog-mission teams'],
  ];
  s.addShape(pres.shapes.LINE, { x: 1.4, y: 1.85, w: 10.5, h: 0, line: { color: LINE, width: 2 }, objectName: 'Timeline' });
  for (let i = 0; i < 5; i++) {
    const [Ic, col, t, d] = steps[i];
    const x = 0.6 + i * 2.46;
    await badge(s, x + 0.78, 1.4, 0.9, Ic, col, 'Step ' + (i + 1));
    text(s, t, { x, y: 2.45, w: 2.46, h: 0.35, fontSize: 16, bold: true, align: 'center', color: col });
    text(s, d, { x: x + 0.1, y: 2.85, w: 2.26, h: 0.8, fontSize: 12, color: C.background2, align: 'center' });
  }
  text(s, [{ text: 'On Earth too: ', options: { bold: true } }, { text: 'pilots, miners, divers and remote health workers face the same "help is far" problem.', options: { color: C.background2 } }],
    { x: 0.6, y: 3.85, w: 12.1, h: 0.35, fontSize: 14, align: 'center' });
  card(s, 0.6, 4.4, 12.1, 2.45, 'Closing card', '0F2A4A');
  text(s, 'See it before you feel it.', { x: 0.95, y: 4.5, w: 11.4, h: 0.75, fontSize: 30, bold: true, color: C.accent1, valign: 'middle' });
  text(s, [
    { text: 'Demo  ', options: { bold: true } }, { text: DEMO, options: { color: C.accent1, hyperlink: { url: 'https://' + DEMO + '/index.html' }, breakLine: true } },
    { text: 'Video  ', options: { bold: true } }, { text: VIDEO, options: { color: C.accent1, hyperlink: { url: 'https://www.' + VIDEO }, breakLine: true } },
    { text: 'Code  ', options: { bold: true } }, { text: REPO, options: { color: C.accent1, hyperlink: { url: 'https://' + REPO }, breakLine: true } },
    { text: 'Paper  ', options: { bold: true } }, { text: 'NeuroShield_IEEE.pdf (68 references)', options: { color: C.accent1, hyperlink: { url: 'https://' + REPO + '/blob/main/paper/NeuroShield_IEEE.pdf' } } },
  ], { x: 0.95, y: 5.3, w: 6.2, h: 1.45, fontSize: 13 });
  text(s, [
    { text: 'Team Paragon', options: { bold: true, breakLine: true } },
    { text: 'M. U. Çakır · E. Ö. Çakır · Dr. R. Uğurlutan · Dr. E. Ayvaz', options: { color: C.background2, breakLine: true } },
    { text: 'AI assistance (Claude) used for code and writing; sources in the paper.', options: { color: C.background2, fontSize: 10 } },
  ], { x: 7.3, y: 5.5, w: 5.2, h: 1.2, fontSize: 13, align: 'right' });
  s.addNotes('Next we connect the real NeuroShield headband, test volunteers on a motion simulator, add a small medical language model that runs on board, and test usability with analog-mission crews. The same idea helps people on Earth who work far from help. NeuroShield: see it before you feel it. Thank you.');

  await pres.writeFile({ fileName: OUT });
  const applyPath = process.argv[2];
  if (applyPath) {
    const { applyTheme } = require(applyPath);
    await applyTheme(OUT, THEME);
  }
  console.log('Deck written:', OUT);
})();
