#!/usr/bin/env node
// Converts the built IEEE paper (paper/NeuroShield_IEEE.html) into an editable Word file
// (paper/NeuroShield_IEEE.docx) with the same IEEE two-column layout: US Letter,
// Times 10 pt, Roman-numbered sections, full-width figures in single-column sections,
// and an auto-numbered reference list.
// Usage: node tools/build_paper.js && node tools/build_paper_docx.js
// Needs the `playwright-core` (with a Chromium) and `docx` npm packages.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright-core');
const D = require('docx');

const P = path.resolve(__dirname, '..', 'paper');
const FONT = 'Times New Roman';
const PAGE_W = 12240, MARGIN_LR = 900, COL_GAP = 346;
const FULL_W = PAGE_W - 2 * MARGIN_LR;          // 10440 dxa = 7.25 in
const COL_W = Math.floor((FULL_W - COL_GAP) / 2); // 5047 dxa
const PX = (dxa) => Math.round(dxa / 1440 * 96);

// ------------------------------------------------------------ 1. extract
async function extract(tmp) {
  const mac = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  let exe;
  if (fs.existsSync(mac)) {
    const dir = fs.readdirSync(mac).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
    if (dir) exe = path.join(mac, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  }
  const browser = await chromium.launch(exe && fs.existsSync(exe) ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 }, deviceScaleFactor: 3 });
  await page.goto('file://' + path.join(P, 'NeuroShield_IEEE.html'));
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(400);
  const figs = await page.$$('figure svg, figure img');
  const figInfo = [];
  for (let i = 0; i < figs.length; i++) {
    const src = await figs[i].evaluate((e) => (e.tagName === 'IMG' ? e.getAttribute('src') : null));
    const box = await figs[i].boundingBox();
    let file;
    if (src && src.endsWith('.png')) file = path.join(P, src); // use the original screenshot
    else { file = path.join(tmp, `fig${i + 1}.png`); await figs[i].screenshot({ path: file }); }
    figInfo.push({ file, ratio: box.height / box.width });
  }
  const blocks = await page.evaluate(() => {
    const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n];
    function runs(node, st = {}) {
      const out = [];
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { const t = c.textContent.replace(/\s+/g, ' '); if (t) out.push({ t, ...st }); continue; }
        if (c.nodeType !== 1) continue;
        const tag = c.tagName.toLowerCase();
        if (tag === 'br') { out.push({ br: true }); continue; }
        if (c.classList.contains('eqn')) continue;
        const s = { ...st };
        if (tag === 'b' || tag === 'strong') s.b = true;
        if (tag === 'i' || tag === 'em') s.i = true;
        if (tag === 'sub') s.sub = true;
        if (tag === 'sup') s.sup = true;
        if (c.classList.contains('sc')) s.sc = true;
        out.push(...runs(c, s));
      }
      return out;
    }
    const clean = (r) => {
      r = r.filter((x) => x.br || x.t);
      for (let i = 0; i < r.length; i++) if (r[i].t && (i === 0 || r[i - 1].br)) r[i].t = r[i].t.replace(/^\s+/, '');
      for (let i = r.length - 1; i >= 0; i--) if (r[i].t && (i === r.length - 1 || r[i + 1].br)) r[i].t = r[i].t.replace(/\s+$/, '');
      return r.filter((x) => x.br || x.t);
    };
    const B = [{ type: 'title', runs: clean(runs(document.querySelector('h1'))) }];
    for (const a of document.querySelectorAll('.author')) B.push({ type: 'author', runs: clean(runs(a)) });
    let sec = 0, sub = 0, fig = 0;
    for (const el of document.querySelector('.cols').children) {
      const tag = el.tagName.toLowerCase(), cl = el.classList;
      if (tag === 'p' && cl.contains('abstract')) B.push({ type: 'abstract', runs: clean(runs(el)) });
      else if (tag === 'p' && cl.contains('keywords')) B.push({ type: 'keywords', runs: clean(runs(el)) });
      else if (tag === 'p' && cl.contains('eq')) B.push({ type: 'eq', runs: clean(runs(el)), num: el.querySelector('.eqn').textContent });
      else if (tag === 'p') B.push({ type: 'p', runs: clean(runs(el)) });
      else if (tag === 'h2') {
        const nonum = cl.contains('nonum');
        if (!nonum) { sec++; sub = 0; }
        B.push({ type: 'h1', text: (nonum ? '' : roman(sec) + '. ') + el.textContent.trim() });
      } else if (tag === 'h3') { sub++; B.push({ type: 'h2', text: String.fromCharCode(64 + sub) + '. ' + el.textContent.trim() }); }
      else if (tag === 'ol') B.push({ type: cl.contains('refs') ? 'refs' : 'ol', items: [...el.children].map((li) => clean(runs(li))) });
      else if (tag === 'figure' && cl.contains('tbl')) {
        const cap = el.querySelector('figcaption');
        const note = el.querySelector('.tnote');
        B.push({
          type: 'table', label: cap.childNodes[0].textContent.trim(), caption: cap.querySelector('.sc').textContent.trim(),
          rows: [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => ({ h: c.tagName === 'TH', runs: clean(runs(c)) }))),
          widths: [...el.querySelector('tr').children].map((c) => c.getBoundingClientRect().width),
          num: el.querySelector('table').classList.contains('num'), note: note ? clean(runs(note)) : null,
        });
      } else if (tag === 'figure') B.push({ type: 'figure', idx: fig++, wide: cl.contains('wide'), caption: clean(runs(el.querySelector('figcaption'))) });
    }
    return B;
  });
  await browser.close();
  return { blocks, figInfo };
}

// ------------------------------------------------------------ 2. build
function textRuns(runs, size, extra = {}) {
  return runs.map((r) => (r.br ? new D.TextRun({ break: 1 }) : new D.TextRun({
    text: r.t, font: FONT, size, bold: r.b || extra.bold, italics: r.i || extra.italics,
    subScript: r.sub, superScript: r.sup, smallCaps: r.sc,
  })));
}

const thin = { style: D.BorderStyle.SINGLE, size: 6, color: '000000' };
const none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };

function table(b) {
  // start from the browser's column proportions, then guarantee each column fits its longest word
  const W = COL_W - 7;
  const total = b.widths.reduce((a, x) => a + x, 0);
  let cols = b.widths.map((w) => w / total * W);
  const minW = b.widths.map((_, ci) => {
    const words = b.rows.flatMap((r) => (r[ci] ? r[ci].runs.map((x) => x.t || '').join('').split(/\s+/) : []));
    return Math.max(...words.map((w) => w.length), 2) * 90 + 170;
  });
  for (let pass = 0; pass < 4; pass++) {
    const short = cols.map((c, i) => c < minW[i]);
    const deficit = cols.reduce((a, c, i) => a + (short[i] ? minW[i] - c : 0), 0);
    if (deficit <= 0) break;
    const room = cols.reduce((a, c, i) => a + (short[i] ? 0 : c - minW[i]), 0);
    cols = cols.map((c, i) => (short[i] ? minW[i] : c - (c - minW[i]) / room * Math.min(deficit, room)));
  }
  cols = cols.map(Math.floor);
  cols[cols.length - 1] += W - cols.reduce((a, x) => a + x, 0);
  const out = [
    new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 120, after: 0 }, keepNext: true, children: [new D.TextRun({ text: b.label, font: FONT, size: 16 })] }),
    new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 60 }, keepNext: true, children: [new D.TextRun({ text: b.caption, font: FONT, size: 16, smallCaps: true })] }),
  ];
  const rows = b.rows.map((r, ri) => new D.TableRow({
    tableHeader: ri === 0, cantSplit: true,
    children: r.map((c, ci) => new D.TableCell({
      width: { size: cols[ci], type: D.WidthType.DXA },
      margins: { top: 20, bottom: 20, left: 50, right: 50 },
      verticalAlign: c.h ? D.VerticalAlign.BOTTOM : D.VerticalAlign.TOP,
      borders: { top: ri === 0 ? thin : none, bottom: c.h ? thin : ri === b.rows.length - 1 ? thin : none, left: none, right: none },
      children: [new D.Paragraph({
        alignment: b.num && ci > 0 ? D.AlignmentType.CENTER : D.AlignmentType.LEFT,
        spacing: { after: 0, line: 220 }, keepNext: ri < b.rows.length - 1,
        children: textRuns(c.runs, 15),
      })],
    })),
  }));
  out.push(new D.Table({
    width: { size: W, type: D.WidthType.DXA }, columnWidths: cols, rows,
    margins: { top: 0, bottom: 0, left: 50, right: 50 },
    borders: { top: thin, bottom: thin, left: none, right: none, insideHorizontal: none, insideVertical: none },
  }));
  out.push(new D.Paragraph({ spacing: { after: 100 }, children: b.note ? textRuns(b.note, 14) : [] }));
  return out;
}

function build({ blocks, figInfo }) {
  const sections = [];
  let cur = [];
  const pageProps = { size: { width: PAGE_W, height: 15840 }, margin: { top: 1080, bottom: 1224, left: MARGIN_LR, right: MARGIN_LR } };
  const flush = (cols, first) => {
    sections.push({
      properties: { page: pageProps, ...(first ? {} : { type: D.SectionType.CONTINUOUS }), column: cols === 2 ? { count: 2, space: COL_GAP, equalWidth: true } : { count: 1 } },
      children: cur,
    });
    cur = [];
  };
  let listNo = 0;
  const numbering = [{ reference: 'refs', levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: '[%1]', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 400 } }, run: { font: FONT, size: 15 } } }] }];

  const authors = [];
  const authorTable = () => {
    const w = Math.floor(FULL_W / authors.length);
    cur.push(new D.Table({
      width: { size: w * authors.length, type: D.WidthType.DXA }, columnWidths: authors.map(() => w),
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
      rows: [new D.TableRow({ children: authors.map((a) => new D.TableCell({
        width: { size: w, type: D.WidthType.DXA }, borders: { top: none, bottom: none, left: none, right: none },
        margins: { left: 60, right: 60 },
        children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { after: 0, line: 240 }, children: textRuns(a.runs, 18) })],
      })) })],
    }));
    cur.push(new D.Paragraph({ spacing: { after: 160 }, children: [] }));
    flush(1, true);
    authors.length = 0;
  };
  for (const b of blocks) {
    if (authors.length && b.type !== 'author') authorTable();
    switch (b.type) {
      case 'title':
        cur.push(new D.Paragraph({ heading: D.HeadingLevel.TITLE, children: textRuns(b.runs, 44) }));
        break;
      case 'author':
        authors.push(b); // laid out side by side (IEEE style) once the author list ends
        break;
      case 'abstract': case 'keywords':
        cur.push(new D.Paragraph({ alignment: D.AlignmentType.JUSTIFIED, spacing: { before: b.type === 'abstract' ? 240 : 0, after: b.type === 'abstract' ? 120 : 160, line: 220 }, children: textRuns(b.runs, 18, { bold: true }) }));
        break;
      case 'h1':
        cur.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: [new D.TextRun({ text: b.text, font: FONT, size: 20, smallCaps: true })] }));
        break;
      case 'h2':
        cur.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, children: [new D.TextRun({ text: b.text, font: FONT, size: 20, italics: true })] }));
        break;
      case 'p':
        cur.push(new D.Paragraph({ style: 'Body', children: textRuns(b.runs, 20) }));
        break;
      case 'eq':
        cur.push(new D.Paragraph({
          tabStops: [{ type: D.TabStopType.CENTER, position: Math.round(COL_W / 2) }, { type: D.TabStopType.RIGHT, position: COL_W - 10 }],
          spacing: { before: 60, after: 60 },
          children: [new D.TextRun({ children: [new D.Tab()] }), ...textRuns(b.runs, 20), new D.TextRun({ children: [new D.Tab(), b.num], font: FONT, size: 20 })],
        }));
        break;
      case 'ol': {
        const ref = 'list' + ++listNo;
        numbering.push({ reference: ref, levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: '%1.', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 220 } } } }] });
        for (const it of b.items) cur.push(new D.Paragraph({ numbering: { reference: ref, level: 0 }, alignment: D.AlignmentType.JUSTIFIED, spacing: { after: 20 }, children: textRuns(it, 20) }));
        break;
      }
      case 'refs':
        for (const it of b.items) cur.push(new D.Paragraph({ numbering: { reference: 'refs', level: 0 }, spacing: { after: 30, line: 210 }, children: textRuns(it, 15) }));
        break;
      case 'table':
        cur.push(...table(b));
        break;
      case 'figure': {
        const f = figInfo[b.idx];
        const wpx = PX(b.wide ? FULL_W : COL_W) - 2;
        const img = new D.Paragraph({
          alignment: D.AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true,
          children: [new D.ImageRun({ type: 'png', data: fs.readFileSync(f.file), transformation: { width: wpx, height: Math.round(wpx * f.ratio) }, altText: { title: 'Figure', description: b.caption.map((r) => r.t || '').join('').slice(0, 120), name: 'fig' + (b.idx + 1) } })],
        });
        const cap = new D.Paragraph({ alignment: D.AlignmentType.JUSTIFIED, spacing: { after: 160, line: 200 }, children: textRuns(b.caption, 16) });
        if (b.wide) { flush(2); cur.push(img, cap); flush(1); } else cur.push(img, cap);
        break;
      }
    }
  }
  flush(2);

  return new D.Document({
    creator: 'Mehmet Ulaş Çakır',
    title: 'NeuroShield — IEEE paper',
    styles: {
      default: {
        document: { run: { font: FONT, size: 20 } },
        title: { run: { font: FONT, size: 44 }, paragraph: { alignment: D.AlignmentType.CENTER, spacing: { before: 0, after: 240, line: 260 }, keepNext: true } },
        heading1: { run: { font: FONT, size: 20, bold: false, color: '000000', smallCaps: true }, paragraph: { alignment: D.AlignmentType.CENTER, spacing: { before: 200, after: 80 }, keepNext: true } },
        heading2: { run: { font: FONT, size: 20, bold: false, color: '000000', italics: true }, paragraph: { spacing: { before: 120, after: 60 }, keepNext: true } },
      },
      paragraphStyles: [{
        id: 'Body', name: 'Body Text IEEE', basedOn: 'Normal', quickFormat: true,
        run: { font: FONT, size: 20 },
        paragraph: { alignment: D.AlignmentType.JUSTIFIED, indent: { firstLine: 245 }, spacing: { before: 0, after: 0, line: 230 } },
      }],
    },
    numbering: { config: numbering },
    sections,
  });
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nsdocx-'));
  const data = await extract(tmp);
  const buf = await D.Packer.toBuffer(build(data));
  const out = path.join(P, 'NeuroShield_IEEE.docx');
  fs.writeFileSync(out, buf);
  console.log(`DOCX written: ${out} (${Math.round(buf.length / 1024)} KB, ${data.blocks.length} blocks, ${data.figInfo.length} figures)`);
})();
