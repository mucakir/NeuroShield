#!/usr/bin/env node
// Captures the app screenshots used by the 7-slide deck into presentation/assets/deck_*.png.
// Usage: node tools/capture_deck_assets.js   (needs playwright-core and a Chromium)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = (f) => path.join(ROOT, 'presentation', 'assets', f);
const W = 1600, H = 1000;

(async () => {
  const exe = execFileSync('sh', ['-c', 'ls -d ~/Library/Caches/ms-playwright/chromium-*/chrome-mac*/*.app/Contents/MacOS/* 2>/dev/null | head -1']).toString().trim();
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const open = async (hour) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    if (hour != null) { const d = new Date(); d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0); await p.clock.install({ time: d }); }
    await p.goto('file://' + path.join(ROOT, 'app', 'index.html'));
    await p.waitForFunction(() => typeof NS !== 'undefined' && NS.live);
    await p.waitForTimeout(600);
    await p.evaluate(() => { document.getElementById('remind').style.display = 'none'; document.querySelector('header').style.position = 'static'; });
    return p;
  };
  const panel = (p, id) => p.locator('#' + id).locator('xpath=ancestor::div[contains(concat(" ", @class, " "), " panel ")][1]');
  const tab = (p, t) => p.evaluate((t) => document.querySelector(`.tab[data-tab=${t}]`).click(), t);
  const crew = (p, c) => p.evaluate((c) => { const s = document.getElementById('crewSel'); s.value = c; s.dispatchEvent(new Event('change')); }, c);

  // Live Monitor, Mars habitat leak: whole screen, then the body map
  let p = await open(null);
  await p.evaluate(() => { [...document.querySelectorAll('#missionSeg button')].find((x) => x.textContent.trim().startsWith('Mars')).click(); NS.live.load('mars_hypoxia_leak'); NS.stream.seek(560); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT('deck_live_mars.png') });
  await panel(p, 'bodymap').screenshot({ path: OUT('deck_bodymap.png') });
  await p.evaluate(() => document.getElementById('alerts').scrollIntoView({ block: 'center' }));
  await panel(p, 'alerts').screenshot({ path: OUT('deck_alerts.png') });
  await p.context().close();

  // Daily Check-in at 07:20: "How?" steps open, vitals ticked on time; then streak + badges
  p = await open(7.33);
  await tab(p, 'checkin');
  await p.click('#tasks li[data-id=vitals] .tt');
  await p.click('.how-btn[data-id=glucose]');
  await p.waitForTimeout(400);
  await panel(p, 'tasks').screenshot({ path: OUT('deck_routine.png') });
  await panel(p, 'badges').screenshot({ path: OUT('deck_badges.png') });
  await p.context().close();

  // Crew Logbook: trend chart (crew B, optic-disc grade), anomaly map (crew A, real ISS CO2 excursion)
  p = await open(null);
  await crew(p, 'B'); await tab(p, 'logbook');
  await p.waitForTimeout(400);
  await p.evaluate(() => { const s = document.getElementById('metricSel'); s.value = 'sbp'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400);
  await panel(p, 'lbChart').screenshot({ path: OUT('deck_chart.png') });
  await crew(p, 'A');
  await p.waitForTimeout(500);
  await panel(p, 'heat').screenshot({ path: OUT('deck_heat.png') });
  await tab(p, 'bloodwork');
  await p.waitForTimeout(500);
  await panel(p, 'bwTable').screenshot({ path: OUT('deck_bloodwork.png') });
  await tab(p, 'guide');
  await p.waitForTimeout(400);
  await p.evaluate(() => document.getElementById('guideTbl').scrollIntoView());
  await p.screenshot({ path: OUT('deck_guide.png') });
  await browser.close();
  console.log('done');
})();
