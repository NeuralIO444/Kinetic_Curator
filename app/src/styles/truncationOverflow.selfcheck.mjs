// truncationOverflow.selfcheck.mjs — #2501: truncation and overflow across the
// bottom bar, DEV tabs, asset rows and DEV tables (stress-session B1/B3/B7/B8/
// B20/B21/B26, filed 2026-11-24).
//
// The filed defects, and what this pin holds:
//   B1  the master bar's fixed 38px row could not compress: a crowded left
//       cluster pushed REC/TAKE/RUN off the window's right edge (body
//       overflow-x is hidden) and cut them silently. Measured on the pre-fix
//       tree at a 1280px window: the right group's right edge sat at 1401px.
//       The fix: the left cluster takes only what the transport leaves
//       (flex 1 1 auto, min-width 0, overflow hidden), the transport never
//       shrinks, controls never shrink, the LOIS pill and status pills give
//       first, and meter labels hide below 1500px (values stay).
//   B3  thirteen DEV tabs squeezed flex:1 1 0 ellipsized their labels
//       ("PERSONA…", "CENSU…"). In the DEV panel the tabs now take their
//       label's width and the row scrolls (it already allowed overflow-x).
//   B7  the ASSETS category row: verified on this tree to already conform —
//       .cat-filter wraps (probe: 2 chip rows, scrollWidth == clientWidth at
//       the stress width). This pin locks the wrap contract so it cannot
//       silently regress to a run-off row.
//   B8  KEEPS SHELF labels ellipsize with the name only in the label span's
//       tooltip; the slot button's own tooltip was the swap hint, so most
//       hover targets never named the keep. The slot's title now leads with
//       the keep's label, and the collection row carries it too.
//   B20 MIND/CENSUS tables set nowrap cells, so a wide table's min-content
//       clipped at the DEV panel's right edge with no scroll. Every table in
//       both panels now sits in a .dev-table-scroll box (overflow-x: auto).
//   B21 PERSONA TUNE repeated one identical "band: …" footnote under every
//       seat (7 copies). It stands once, with the relations note.
//   B26 the footer build line was 9px --dimmer (rgba .32) — the hash, the
//       only build identifier, now carries --ink + 700 in a .footer-hash
//       span, and the line steps up to --dim at 10px.
//
//   A source    the shapes above, read from the tree (runs everywhere).
//   B browser   (skipped when no Playwright browser is present) the BUILT
//               app measured at real widths: the transport inside the
//               window at 1280/1100, DEV labels untruncated, a widened MIND
//               table scrolling inside its own box, one band footnote, the
//               footer hash in full ink, the shelf slot naming its keep.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(APP, rel), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

// ---- A: source pins
{
  const layout = read('src/styles/layout.css');
  ok('B1: the master bar keeps its fixed 38px row and may not widen the app column', () => {
    assert.match(flat(layout), /\.master-bar \{[^}]*height: 38px;[^}]*min-width: 0;/);
  });
  ok('B1: the left cluster takes what the transport leaves; the transport never shrinks', () => {
    assert.match(flat(layout), /\.master-left \{ flex: 1 1 auto; min-width: 0; overflow: hidden; \}/);
    assert.match(flat(layout), /\.master-right \{ flex: 0 0 auto; \}/);
    assert.match(flat(layout), /\.master-left > :not\(\.lois-pill\):not\(\.status-pill\) \{ flex-shrink: 0; \}/);
    assert.match(flat(layout), /\.master-left \.status-pill \{ flex: 0 1 auto; min-width: 0; overflow: hidden;/);
  });
  ok('B1: the LOIS pill gives width back (flex 0 1 168px, floor 100px); meter labels hide below 1500px', () => {
    assert.match(flat(layout), /\.lois-pill \{[^}]*flex: 0 1 168px;/);
    assert.match(flat(layout), /\.lois-pill \{[^}]*min-width: 100px;/);
    assert.match(flat(layout), /@media \(max-width: 1500px\) \{ \.master-left \{ gap: 6px; \}/);
    assert.match(flat(layout), /\.master-left \.meter-label \{ display: none; \}/);
  });
  ok('B26: the build line steps up to --dim at 10px and the hash carries full ink at 700', () => {
    assert.match(flat(layout), /\.footer-build \{ color: var\(--dim\); font-size: 10px; \}/);
    assert.match(flat(layout), /\.footer-hash \{ color: var\(--ink\); font-weight: 700; \}/);
    const app = read('src/App.jsx');
    assert.match(app, /<span className="footer-build">/);
    assert.match(app, /<span className="footer-hash">\{import\.meta\.env\.VITE_BUILD_ID \|\| 'dev'\}<\/span>/);
  });
  ok('B3: DEV tabs take their label width (the Shell strip keeps its equal-share squeeze)', () => {
    const ux = read('src/styles/ux-polish.css');
    assert.match(flat(ux), /\.panel-dev \.panel-tab \{ flex: 0 0 auto;/);
    assert.match(flat(ux), /\.panel-tab \{ flex: 1 1 0;/);
  });
  ok('B7: the ASSETS category row keeps its wrap contract', () => {
    const pool = read('src/styles/pool.css');
    assert.match(flat(pool), /\.cat-filter \{ display: flex; flex-wrap: wrap;/);
  });
  ok('B8: the shelf slot tooltip leads with the keep label; the row carries it too', () => {
    const view = read('src/panels/ShelfView.jsx');
    assert.match(view, /`\$\{cell\.label\} — on the deck — this slot refuses swaps`/);
    assert.match(view, /`\$\{cell\.label\} — aim a swap at this slot`/);
    assert.match(view, /className=\{`shelf-row\$\{row\.tier === 'stage' \? ' is-stage' : ''\}`\} title=\{row\.label\}/);
  });
  ok('B20: every MIND/CENSUS table sits in a .dev-table-scroll box, and the box scrolls', () => {
    for (const rel of ['src/panels/MindPanel.jsx', 'src/panels/CensusPanel.jsx']) {
      const src = read(rel);
      const tables = (src.match(/<table /g) || []).length;
      const boxes = (src.match(/<div className="dev-table-scroll">/g) || []).length;
      assert.ok(tables > 0, `${rel}: tables present`);
      assert.equal(boxes, tables, `${rel}: every table wrapped (${boxes}/${tables})`);
    }
    const panels = read('src/styles/panels.css');
    assert.match(flat(panels), /\.dev-table-scroll \{ overflow-x: auto; max-width: 100%;/);
  });
  ok('B21: the band footnote stands exactly once in PersonaTune, after the seats', () => {
    const src = read('src/panels/PersonaTunePanel.jsx');
    const copies = (src.match(/band: solo length/g) || []).length;
    assert.equal(copies, 1, `expected one band footnote, found ${copies}`);
    assert.ok(
      src.indexOf('band: solo length') > src.indexOf('TUNING_SEATS.map'),
      'the footnote stands after the seat sections, not under each one',
    );
  });
}

// ---- B: browser (built-app) section
let skipped = false;
let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  const probe = await chromium
    .launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    .catch((e) => {
      if (/Executable doesn't exist/.test(String(e?.message || e))) {
        skipped = true;
        return null;
      }
      throw e;
    });
  if (probe) await probe.close();
} catch (e) {
  if (/Executable doesn't exist/.test(String(e?.message || e))) skipped = true;
  else throw e;
}

if (!skipped) {
  execFileSync('npm', ['run', 'build'], { cwd: APP, stdio: 'pipe' });

  const DIST = path.join(APP, 'dist');
  const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
  };
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.startsWith('/Kinetic_Curator/')) p = p.slice('/Kinetic_Curator'.length);
      if (p === '/' || p === '') p = '/index.html';
      let file = path.normalize(path.join(DIST, p));
      if (!file.startsWith(DIST)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let data;
      try {
        data = await readFile(file);
      } catch {
        file = path.join(DIST, 'index.html');
        data = await readFile(file);
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('nf');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/Kinetic_Curator/`;

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const boot = async (width, height) => {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.addInitScript(() => {
      localStorage.setItem('kc:first-run-seen', '1');
      localStorage.setItem('kc:dev-mode:v1', '1');
      window.__KC_EXPOSE_STORE = true;
      window.__KC_GOVERNOR_OFF = true;
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('!!window.__kcStore && !!window.__KC_UI__', null, { timeout: 30000 });
    await page.waitForTimeout(900);
    return page;
  };
  const clickTab = (page, label, scope) =>
    page.evaluate(
      ({ label, scope }) => {
        const root = scope ? document.querySelector(scope) : document;
        if (!root) return 'no-scope';
        const hit = [...root.querySelectorAll('.panel-tab')].find(
          (t) => t.querySelector('.panel-tab-label')?.textContent.trim() === label,
        );
        if (!hit) return 'not-found';
        hit.click();
        return 'ok';
      },
      { label, scope },
    );

  // B1 at the widths where the old bar broke (1280 measured 1401 pre-fix).
  for (const w of [1280, 1100]) {
    const page = await boot(w, 900);
    const m = await page.evaluate(() => {
      const bar = document.querySelector('.master-bar');
      const rr = document.querySelector('.master-right').getBoundingClientRect();
      return { barCW: bar.clientWidth, barSW: bar.scrollWidth, rightRight: Math.round(rr.right), vw: window.innerWidth };
    });
    ok(`B1: at ${w}px the transport stays inside the window and the bar does not overflow`, () => {
      assert.ok(m.rightRight <= m.vw, `transport right edge ${m.rightRight} beyond window ${m.vw}`);
      assert.ok(m.barSW <= m.barCW + 1, `bar scrollWidth ${m.barSW} exceeds clientWidth ${m.barCW}`);
    });
    await page.close();
  }

  const page = await boot(1904, 1000);

  const footer = await page.evaluate(() => {
    const hash = document.querySelector('.footer-hash');
    const build = document.querySelector('.footer-build');
    return {
      hashText: hash?.textContent,
      hashColor: hash ? getComputedStyle(hash).color : null,
      buildSize: build ? getComputedStyle(build).fontSize : null,
      line: build?.textContent.replace(/\s+/g, ' ').trim(),
    };
  });
  ok('B26: the footer hash renders in full ink and the build line reads at 10px', () => {
    assert.equal(footer.hashColor, 'rgb(232, 232, 224)');
    assert.equal(footer.buildSize, '10px');
    assert.ok(footer.line.startsWith('KINETIC_CURATOR v'), `build line intact: ${footer.line}`);
    assert.ok(footer.line.endsWith(`build ${footer.hashText}`), 'the hash still ends the line');
  });

  assert.equal(await clickTab(page, 'ASSETS', null), 'ok');
  await page.waitForTimeout(1000);
  const cat = await page.evaluate(() => {
    const cf = document.querySelector('.cat-filter');
    return { cw: cf.clientWidth, sw: cf.scrollWidth };
  });
  ok('B7: the ASSETS category row wraps instead of running off the panel', () => {
    assert.ok(cat.sw <= cat.cw + 1, `cat-filter scrollWidth ${cat.sw} exceeds clientWidth ${cat.cw}`);
  });

  // B8: crown a keep through the bridge, deal it onto the shelf stage, and
  // read the slot's + row's tooltips.
  await page.evaluate(() => window.__KC_UI__.act('directors.favorite'));
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.shelf-fill-btn')?.click());
  await page.waitForTimeout(600);
  // The collection rows render in the shelf's expanded size.
  await page.evaluate(() => document.querySelector('[title="Open the shelf over the canvas"]')?.click());
  await page.waitForTimeout(600);
  const shelf = await page.evaluate(() => {
    const slot = document.querySelector('.shelf-slot:not(.ghost)');
    const slotLabel = slot?.querySelector('.shelf-slot-label');
    const row = document.querySelector('.shelf-row');
    return {
      slotTitle: slot?.getAttribute('title') ?? null,
      slotLabel: slotLabel?.textContent.trim() ?? null,
      slotLabelTitle: slotLabel?.getAttribute('title') ?? null,
      rowTitle: row?.getAttribute('title') ?? null,
      rowLabel: row?.querySelector('.shelf-row-label')?.textContent.trim() ?? null,
    };
  });
  ok('B8: hovering a shelf slot or row names the keep in full', () => {
    assert.ok(shelf.slotLabel, 'a staged keep renders a slot label');
    assert.ok(
      shelf.slotTitle && shelf.slotTitle.startsWith(shelf.slotLabelTitle || shelf.slotLabel),
      `slot tooltip leads with the keep: ${shelf.slotTitle}`,
    );
    assert.ok(shelf.rowTitle, 'the collection row carries a tooltip');
    assert.ok(shelf.rowTitle.length >= (shelf.rowLabel || '').length, 'the row tooltip carries the full label');
  });

  assert.equal(await clickTab(page, 'DEV', null), 'ok');
  await page.waitForTimeout(1200);
  const devTabs = await page.evaluate(() =>
    [...document.querySelectorAll('.panel-dev .panel-tab-label')].map((l) => ({
      label: l.textContent.trim(),
      cw: l.clientWidth,
      sw: l.scrollWidth,
    })),
  );
  ok('B3: every DEV tab label reads in full (the row scrolls instead)', () => {
    assert.equal(devTabs.length, 13, 'all thirteen DEV tabs render');
    for (const t of devTabs) assert.ok(t.sw <= t.cw + 1, `${t.label} truncated: ${t.sw} > ${t.cw}`);
  });

  assert.equal(await clickTab(page, 'MIND', '.panel-dev'), 'ok');
  await page.waitForTimeout(1500);
  const mind = await page.evaluate(() => {
    const content = document.querySelector('.panel-dev .panel-tab-content');
    const tables = [...content.querySelectorAll('table')];
    const wrapped = tables.filter((t) => t.closest('.dev-table-scroll')).length;
    // Widen the first table past the panel with an unbreakable cell: the
    // excess must scroll inside the table's own box, never clip the panel.
    const box = tables[0]?.closest('.dev-table-scroll');
    const cell = tables[0]?.querySelector('td, th');
    if (cell) cell.textContent = 'x'.repeat(180);
    return {
      tables: tables.length,
      wrapped,
      boxSW: box?.scrollWidth ?? 0,
      boxCW: box?.clientWidth ?? 0,
      contentSW: content.scrollWidth,
      contentCW: content.clientWidth,
    };
  });
  ok('B20: MIND tables sit in scroll boxes; a widened table scrolls inside its box, not the panel', () => {
    assert.ok(mind.tables > 0, 'MIND renders tables');
    assert.equal(mind.wrapped, mind.tables, 'every MIND table is wrapped');
    assert.ok(mind.boxSW > mind.boxCW, `the widened table overflows its box (${mind.boxSW} > ${mind.boxCW})`);
    assert.ok(
      mind.contentSW <= mind.contentCW + 1,
      `the panel itself does not clip: content scrollWidth ${mind.contentSW} vs clientWidth ${mind.contentCW}`,
    );
  });

  assert.equal(await clickTab(page, 'PERSONA TUNE', '.panel-dev'), 'ok');
  await page.waitForTimeout(1500);
  const bandCount = await page.evaluate(() => {
    const content = document.querySelector('.panel-dev .panel-tab-content');
    return [...content.querySelectorAll('div')].filter((d) =>
      [...d.childNodes].some((nd) => nd.nodeType === 3 && nd.textContent.includes('band: solo length')),
    ).length;
  });
  ok('B21: the band footnote stands once in PERSONA TUNE, not under every seat', () => {
    assert.equal(bandCount, 1);
  });

  await page.close();
  await browser.close();
  server.close();
} else {
  console.log('  [skip] browser section — no Playwright browser present');
}

console.log(`truncationOverflow.selfcheck: ${n} checks passed${skipped ? ' (browser section skipped)' : ''}`);
