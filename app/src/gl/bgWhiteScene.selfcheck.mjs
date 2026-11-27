// bgWhiteScene.selfcheck.mjs — BG WHITE must never blank a standing scene (#2487, A9).
//
// The report: on the hosted build, BG PALETTE > TRANSPARENT > WHITE, lock S1,
// shuffle, harmony COMPLEMENTARY, open/close the lab left a pure-white canvas
// with 200-264 nodes live and no marks visible; BG back to PALETTE recovered it.
//
// Verdict on this tree (shape (e) — not reproducible): the recorded sequence was
// driven end-to-end in the built app across a palette spread (praystation,
// smoke, perihelion, ochre-wall + random boot palettes), with ACCUM on and off,
// FREEZE/CLEAR included, governor on and off. In every controlled run the
// presented frame in WHITE mode carried the scene's marks (deviation share
// 9.9%-31.7% of a 48x48 presented grid; the one unreproduced blank read 1.4%
// under sandbox GPU collapse and never recurred). The candidate mechanisms are
// eliminated in code and in data:
//   (a) ink coupling — WHITE mode changes only the frame's bgCss; item tints
//       come from the palette/wash machines, which never see canvasBg.
//   (b) compositing — the .canvas-bg div sits UNDER the GL canvas; the frame
//       target is cleared with the bg colour and layers composite over it.
//   (c) alpha — non-transparent modes clear at alpha 1; the mark alpha path
//       is mode-independent.
//   (d) palette — measured below: every catalog palette resolves with >= 3
//       swatches at relative luminance <= 0.5, and every harmony generation
//       (any anchor, any scheme) yields >= 2 — no standing or shuffled
//       palette can be all-near-white.
//
//   A data      the palette/harmony luminance floors + the BG cycle order
//               (runs everywhere).
//   B browser   (skipped when no Playwright browser is present) the BUILT app,
//               driven through the shipped __KC_UI__ bridge with frames forced
//               through the test-only still path (#2477) and the presented
//               frame read as a colour grid. The governor is gated off
//               (__KC_GOVERNOR_OFF, the established e2e gate). Pin: with a
//               standing scene (nodeCount > 0) and canvasBg 'white', the
//               presented frame is a white field WITH the scene's marks on
//               it — modal cell near-white and the accumFreezeClear flatness
//               bar cleared (distinct >= 8, range >= 40; a blank reads ~1/~0)
//               — across the full recorded sequence and a light palette
//               (smoke).
//
// Hardening (2026-11-26) — the browser reads are convergence waits budgeted
// in presented frames, not single samples (or two re-reads) taken after a
// wall-clock race. The failure this answers: on a docs-only branch (zero
// code diff vs a main that passed the full job the same evening) the
// standing-scene read below failed with the presented count at n:24 and a
// flat light-grey modal [199,197,190] — the grid was sampled at the
// earliest possible moment, right after the first forced stills, before
// the scene had converged into the presented grid. Convergence is a
// function of presented frames (the resolver/bake advances per present);
// under runner CPU contention the still race expires early and the first
// presents still show the pre-scene flat field, so a single early sample
// reads flat on a healthy app. waitForGrid keeps forcing frames and
// re-reading until the criterion is met, the presented count has advanced
// by a generous frame budget, or the count stops advancing entirely
// (hang detector). The flatness bar (distinct >= 8, range >= 40) and the
// marksOnWhite criterion are unchanged: a truly blank frame is stable
// (the #2487 blank held across a frozen buffer), so a blank spends the
// whole budget and still fails — the wait cannot mask the defect this
// pin guards. Same pattern as the pausedRecallPresent hardening
// (PR #2540).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PALETTES, resolvePalette } from '../data/palettes.js';
import { buildHarmony, SCHEME_IDS } from '../engine/harmony.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** WCAG relative luminance of a '#rrggbb' colour, in [0,1]. */
function relLum(hex) {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(v >> 16) + 0.7152 * f((v >> 8) & 255) + 0.0722 * f(v & 255);
}
const DARK = 0.5; // a swatch at or below this luminance reads clearly on white

// ---- A: data + source pins
{
  ok('every catalog palette resolves with >= 3 swatches visible on white', () => {
    for (const p of PALETTES) {
      const rp = resolvePalette(p.id, null, []);
      const dark = rp.swatches.filter((s) => relLum(s) <= DARK).length;
      assert.ok(dark >= 3, `${p.id}: only ${dark} swatches at luminance <= ${DARK}`);
    }
  });
  ok('no harmony generation (any anchor, any scheme) is all-near-white', () => {
    const anchors = [...PALETTES.map((p) => p.swatches[0]), '#ffffff', '#f2f2f2', '#000000'];
    for (const a of anchors) {
      for (const scheme of SCHEME_IDS) {
        const gen = buildHarmony(a, scheme, 6);
        const dark = gen.filter((s) => relLum(s) <= DARK).length;
        assert.ok(dark >= 2, `anchor ${a} scheme ${scheme}: only ${dark} dark swatches`);
      }
    }
  });
  ok('the BG cycle order is palette > transparent > white (the recorded sequence)', () => {
    const src = readFileSync(path.join(APP, 'src', 'state', 'slices', 'globalSlice.js'), 'utf8');
    assert.ok(
      src.includes(
        "state.canvasBg === 'palette' ? 'transparent' : state.canvasBg === 'transparent' ? 'white' : 'palette'",
      ),
      'canvasBg cycle progression not found in globalSlice',
    );
  });
}

// ---- B: browser (built-app, bridge-driven) section
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
  // Always build: the pin tests the current tree, not whatever dist happens to lie around.
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
        file = path.join(DIST, 'index.html'); // SPA fallback for extensionless routes
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const frameErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('[gl-live] frame error')) frameErrors.push(m.text());
  });
  page.on('pageerror', (e) => frameErrors.push('pageerror: ' + String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('kc:first-run-seen', '1');
    window.__KC_EXPOSE_STORE = true;
    window.__KC_GOVERNOR_OFF = true; // the mechanism under test is BG compositing, not the governor
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__kcStore && !!window.__KC_UI__ && !!window.__kcStill', null, {
    timeout: 30000,
  });

  const act = (id, value, param) =>
    page.evaluate((a) => window.__KC_UI__.act(a.id, a.value, a.param), { id, value, param });
  const state = () =>
    page.evaluate(() => {
      const s = window.__kcStore.getState();
      return { nodes: s.nodeCount, bg: s.canvasBg, fault: s.renderFault };
    });
  // Presented-frame stats on a 32x32 grid: the modal (most common) cell is the
  // field colour; devShare is the share of cells deviating from it by > 25 in
  // any channel (the marks); distinct/range are the accumFreezeClear flatness
  // metrics. A flat field reads devShare ~0, distinct ~1, range ~0. Healthy
  // WHITE frames measured devShare 0.026-0.317 across the probe spread (the
  // low end is a sparse scene: distinct 29, range 90 — marks plainly present);
  // the one unreproduced blank read devShare 0.014 with a 100% modal field.
  const gridStats = async () => {
    const g = await page.evaluate(() => window.__kcPresentedGrid(32));
    if (!g) return null;
    const cells = [];
    for (let i = 0; i < g.grid.length; i += 3) cells.push([g.grid[i], g.grid[i + 1], g.grid[i + 2]]);
    const counts = new Map();
    for (const c of cells) {
      const k = c.map((v) => Math.round(v)).join(',');
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const modal = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])[0][0]
      .split(',')
      .map(Number);
    let dev = 0;
    for (const c of cells)
      if (Math.max(Math.abs(c[0] - modal[0]), Math.abs(c[1] - modal[1]), Math.abs(c[2] - modal[2])) > 25) dev++;
    const distinct = new Set(cells.map((c) => c.map((v) => Math.round(v / 8)).join(','))).size;
    let range = 0;
    for (let ch = 0; ch < 3; ch++) {
      const vals = cells.map((c) => c[ch]);
      range = Math.max(range, Math.max(...vals) - Math.min(...vals));
    }
    return { n: g.n, modal, devShare: dev / cells.length, distinct, range: Math.round(range) };
  };
  const forceFrames = async (count, budgetMs) => {
    await page.evaluate(
      ({ f, budget }) => Promise.race([window.__kcStill(f), new Promise((r) => setTimeout(r, budget))]),
      { f: count, budget: budgetMs },
    );
    return gridStats();
  };
  // The pass condition is the accumFreezeClear flatness bar (distinct >= 8,
  // range >= 40) on a field whose modal cell is white: the reported defect is
  // a PURE-WHITE BLANK, which reads distinct ~1 / range ~0. devShare is
  // reported in the failure text but not gated — a sparse scene on white
  // legitimately reads devShare 0.026 while carrying 29 distinct colours at
  // range 90 (measured), so gating on it would fail healthy scenes.
  const marksOnWhite = (g) => !!g && g.modal.every((v) => v >= 170) && g.distinct >= 8 && g.range >= 40;
  // Hardening (2026-11-26): sampling a presented state is a convergence
  // wait budgeted in PRESENTED FRAMES, not one sample (or two re-reads)
  // after a wall-clock race — see the header note. FRAME_BUDGET is the
  // same 2400 the pausedRecallPresent hardening uses (≈6–8× its observed
  // convergence), and the wall clock survives only as a hang detector:
  // a presented count that stops advancing entirely for HANG_MS fails
  // as a hang. A truly blank frame is stable (the #2487 blank held
  // across a frozen buffer), so the wait cannot mask the defect this
  // pin guards — a blank spends the whole budget and still fails, with
  // the last grid carried in the failure message.
  const FRAME_BUDGET = 2400;
  const HANG_MS = 120000;
  const waitForGrid = async (criterion, what, seedFrames, seedBudgetMs) => {
    let g = await forceFrames(seedFrames, seedBudgetMs);
    if (criterion(g)) return g;
    let baseline = g ? g.n : null;
    let lastN = g ? g.n : -1;
    let lastAdvance = Date.now();
    for (;;) {
      g = await forceFrames(6, 60000);
      const now = Date.now();
      if (g) {
        if (baseline === null) baseline = g.n;
        if (g.n !== lastN) {
          lastN = g.n;
          lastAdvance = now;
        }
        if (criterion(g)) return g;
        if (lastN - baseline >= FRAME_BUDGET) {
          throw new Error(
            `presented grid never showed ${what} after ${lastN - baseline} presented frames (last grid ${JSON.stringify(g)})`,
          );
        }
      }
      if (now - lastAdvance > HANG_MS) {
        throw new Error(
          `presented count stopped advancing waiting for ${what} — hang (last n ${lastN}, last grid ${JSON.stringify(g)})`,
        );
      }
    }
  };
  // Sample a white-mode state: converge until the marks-on-white
  // criterion holds (or the wait above spends its budget and throws).
  const sampleWhite = async (frames, budgetMs) =>
    waitForGrid(marksOnWhite, 'marks on the white field', frames, budgetMs);

  try {
    const chip = await act('topbar.palette-chip', undefined, 'praystation');
    assert.equal(chip.ok, true, 'palette-chip act failed');
    const gScene = await waitForGrid((g) => !!g && g.distinct >= 8 && g.range >= 40, 'a standing scene', 24, 150000);
    const stScene = await state();
    ok('a standing scene is up (count > 0, frame not flat)', () => {
      assert.ok(stScene.nodes > 0, `nodeCount ${stScene.nodes}`);
      assert.ok(
        !!gScene && gScene.distinct >= 8 && gScene.range >= 40,
        `scene grid ${JSON.stringify(gScene)} reads flat`,
      );
    });

    // The recorded sequence: BG PALETTE > TRANSPARENT > WHITE.
    await act('canvas.bg');
    await forceFrames(6, 60000);
    await act('canvas.bg');
    const gWhite = await sampleWhite(12, 90000);
    const stWhite = await state();
    ok('BG WHITE: the standing scene presents its marks on the white field', () => {
      assert.equal(stWhite.bg, 'white', `canvasBg ${stWhite.bg}`);
      assert.ok(stWhite.nodes > 0, `nodeCount ${stWhite.nodes}`);
      assert.ok(marksOnWhite(gWhite), `white grid ${JSON.stringify(gWhite)} — marks missing on white`);
    });

    // Lock S1, shuffle, harmony COMPLEMENTARY.
    await act('topbar.swatch-lock', undefined, 0);
    const sh = await act('topbar.palette-shuffle', 'complementary');
    assert.equal(sh.ok, true, 'palette-shuffle act failed');
    const gShuffled = await sampleWhite(16, 90000);
    ok('WHITE + lock S1 + COMPLEMENTARY shuffle: marks still present on white', () => {
      assert.ok(marksOnWhite(gShuffled), `shuffled white grid ${JSON.stringify(gShuffled)} — marks missing on white`);
    });

    // Open/close the palette lab (the wing toggle in the strip; inert by
    // design, and the sequence includes it, so the pin walks it too).
    await page.evaluate(() => {
      const lab = document.querySelector('button.palette-save-btn');
      if (lab) lab.click();
    });
    await forceFrames(3, 60000);
    await page.keyboard.press('Escape').catch(() => {});
    const gLab = await sampleWhite(6, 60000);
    ok('WHITE after lab open/close: marks still present', () => {
      assert.ok(marksOnWhite(gLab), `post-lab white grid ${JSON.stringify(gLab)} — marks missing on white`);
    });

    // The ACCUM path: accumulation on, still WHITE, marks must ride the buffer.
    const ac = await act('directors.accum', true);
    assert.equal(ac.ok, true, 'ACCUM act failed');
    const gAccum = await sampleWhite(20, 120000);
    const stAccum = await state();
    ok('WHITE + ACCUM: the accumulated scene presents its marks on white', () => {
      assert.ok(stAccum.nodes > 0, `nodeCount ${stAccum.nodes}`);
      assert.ok(marksOnWhite(gAccum), `accum white grid ${JSON.stringify(gAccum)} — marks missing on white`);
    });

    // FREEZE holds the accumulated scene (the hold itself is not a defect).
    const fr = await act('directors.accum-freeze', true);
    assert.equal(fr.ok, true, 'FREEZE act failed');
    const gHold = await sampleWhite(3, 60000);
    ok('WHITE + ACCUM FROZEN: the held frame keeps the marks', () => {
      assert.ok(marksOnWhite(gHold), `frozen white grid ${JSON.stringify(gHold)} — held frame blank`);
    });
    await act('directors.accum-freeze', false);

    // The lightest catalog palette: smoke's greys on white.
    const chip2 = await act('topbar.palette-chip', undefined, 'smoke');
    assert.equal(chip2.ok, true, 'palette-chip smoke act failed');
    const gSmoke = await sampleWhite(16, 90000);
    const stSmoke = await state();
    ok('WHITE + smoke (lightest palette): marks still present on white', () => {
      assert.ok(stSmoke.nodes > 0, `nodeCount ${stSmoke.nodes}`);
      assert.ok(marksOnWhite(gSmoke), `smoke white grid ${JSON.stringify(gSmoke)} — marks missing on white`);
    });

    ok('no frame errors across the whole sequence', () => {
      assert.deepEqual(frameErrors, [], `frame errors: ${(frameErrors[0] || '').slice(0, 160)}`);
    });
  } finally {
    await page.close();
    await browser.close();
    server.close();
  }
}

console.log(`bgWhiteScene.selfcheck: ok (${n} groups${skipped ? ', browser skipped' : ''})`);
