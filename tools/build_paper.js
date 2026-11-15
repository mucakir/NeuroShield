#!/usr/bin/env node
// Builds the IEEE-style paper: numbers {{cite:key,...}} in order of first appearance,
// writes paper/NeuroShield_IEEE.html and prints paper/NeuroShield_IEEE.pdf with Chromium.
// Usage: node tools/build_paper.js   (PDF step needs the `playwright-core` package and a Chromium)
const fs = require('fs');
const path = require('path');

const P = path.resolve(__dirname, '..', 'paper');
const refs = JSON.parse(fs.readFileSync(path.join(P, 'references.json'), 'utf8'));
let src = fs.readFileSync(path.join(P, 'paper.src.html'), 'utf8');

const order = [];
src = src.replace(/\{\{cite:([^}]+)\}\}/g, (_, keys) => {
  const nums = keys.split(',').map((k) => k.trim()).map((k) => {
    if (!refs[k]) throw new Error('Unknown reference key: ' + k);
    if (!order.includes(k)) order.push(k);
    return order.indexOf(k) + 1;
  }).sort((a, b) => a - b);
  // IEEE style: [1], [2]  or [3]–[5] for runs of three or more
  const parts = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    if (j - i >= 2) { parts.push(`[${nums[i]}]–[${nums[j]}]`); i = j; } else parts.push(`[${nums[i]}]`);
  }
  return parts.join(', ');
});
const unused = Object.keys(refs).filter((k) => !order.includes(k));
if (unused.length) console.warn('Unused references:', unused.join(', '));
src = src.replace('{{references}}', order.map((k) => `<li>${refs[k]}</li>`).join('\n'));
const htmlOut = path.join(P, 'NeuroShield_IEEE.html');
fs.writeFileSync(htmlOut, src);
console.log(`HTML written (${order.length} references).`);

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright-core')); } catch (e) { console.log('playwright-core not found; skipping PDF.'); return; }
  const mac = path.join(process.env.HOME || '', 'Library/Caches/ms-playwright');
  let exe;
  if (fs.existsSync(mac)) {
    const dir = fs.readdirSync(mac).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
    if (dir) exe = path.join(mac, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  }
  const browser = await chromium.launch(exe && fs.existsSync(exe) ? { executablePath: exe } : {});
  const page = await browser.newPage();
  await page.goto('file://' + htmlOut);
  await page.waitForTimeout(500);
  const pdf = path.join(P, 'NeuroShield_IEEE.pdf');
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  await browser.close();
  const pages = (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`PDF written: ${pdf} (${pages} pages)`);
})();
