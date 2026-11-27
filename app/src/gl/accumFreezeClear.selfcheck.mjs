// accumFreezeClear.selfcheck.mjs — FREEZE + CLEAR must not black the stage (#2480).
//
// The defect: FREEZE makes the canvas present the ACCUM buffer and nothing else;
// CLEAR re-begins that buffer to the flat background; while frozen no later frame
// steps the scene back in — so the stage presented a pure flat background while
// the resolver count honestly read ~740 nodes, until THAW. The count read the
// resolver; the canvas read the buffer; the two gestures drove them apart.
//
// The fix (all in gl/liveLoop.mjs, the loop being the state's one truth): a
// loop-owned reseed flag. Any buffer begin() that lands while frozen — CLEAR,
// the enable path (a freeze set via MIDI with ACCUM off), a dpr rebuild — sets
// it; the tick then takes the normal render + step path for exactly one frame,
// re-seeding the held buffer with the current scene, and the hold resumes.
//
//   A source    the seam's shape in liveLoop.mjs (runs everywhere).
//   B browser   (skipped when no Playwright browser is present) the BUILT app,
//               driven through the shipped __KC_UI__ bridge — the same channels
//               the panels use — with frames forced through the test-only still
//               path (#2477) and the presented frame read as a colour grid.
//               The governor is gated off (__KC_GOVERNOR_OFF, the established
//               e2e gate) so ACCUM stays effective under software GL; the
//               mechanism under test is the loop's freeze/clear interaction,
//               not the governor. Pin: while ACCUM is effective and the node
//               count is > 0, the presented frame is never the flat background.
//               A/B-proven in the sandbox: on the pre-fix tree the post-CLEAR
//               grid reads distinct 1 / range 1 (pure flat) at 600 nodes; on
//               this tree it reads distinct 28 / range 151 at 48 nodes.
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

// ---- A: source pins
{
  const src = readFileSync(path.join(APP, 'src', 'gl', 'liveLoop.mjs'), 'utf8');
  ok('the loop owns a reseed flag beside the frozen flag', () => {
    assert.ok(src.includes('let accumReseedPending = false;'), 'accumReseedPending declaration missing');
  });
  ok('CLEAR sets the reseed flag when it lands while frozen', () => {
    const at = src.indexOf('clearAccum() {');
    assert.ok(at >= 0, 'clearAccum located');
    const begin = src.indexOf('accumObj.begin(beginBg);', at);
    assert.ok(begin > at, 'clearAccum begin located');
    const after = src.slice(begin, begin + 800);
    assert.ok(
      after.includes('if (accumFrozen) accumReseedPending = true;'),
      'clearAccum must ask for a reseed when frozen',
    );
  });
  ok('the frozen hold yields to a pending reseed for one frame', () => {
    assert.ok(
      src.includes('if (frozen && accumObj && !accumReseedPending) {'),
      'the hold test must let a pending reseed fall through to render + step',
    );
  });
  ok('the sibling begin sites (enable, dpr rebuild) set the flag; the step branch clears it', () => {
    const sets = (src.match(/if \(frozen\) accumReseedPending = true;/g) || []).length;
    assert.ok(sets >= 2, `expected the enable + dpr sites to set the flag, found ${sets}`);
    const clears = (src.match(/accumReseedPending = false;/g) || []).length;
    assert.ok(clears >= 3, `expected declaration + step-branch + session clears, found ${clears}`);
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
    window.__KC_GOVERNOR_OFF = true; // ACCUM must stay effective under software GL
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__kcStore && !!window.__KC_UI__ && !!window.__kcStill', null, {
    timeout: 30000,
  });

  const stage = () => page.evaluate(() => window.__KC_UI__.stage());
  const state = () =>
    page.evaluate(() => {
      const s = window.__kcStore.getState();
      return { nodes: s.nodeCount, accum: !!s.layoutParams.accumulation, tier1: s.perfTier1, fault: s.renderFault };
    });
  const gridStats = async () => {
    const g = await page.evaluate(() => window.__kcPresentedGrid(32));
    if (!g) return null;
    const cells = [];
    for (let i = 0; i < g.grid.length; i += 3) cells.push([g.grid[i], g.grid[i + 1], g.grid[i + 2]]);
    const distinct = new Set(cells.map((c) => c.map((v) => Math.round(v / 8)).join(','))).size;
    let range = 0;
    for (let ch = 0; ch < 3; ch++) {
      const vals = cells.map((c) => c[ch]);
      range = Math.max(range, Math.max(...vals) - Math.min(...vals));
    }
    return { n: g.n, distinct, range: Math.round(range) };
  };
  // Force `count` fixed-step frames through the still path; on a slow rasteriser
  // the race may cut the run short — the presented grid is the evidence either way.
  const forceFrames = async (count, budgetMs) => {
    await page.evaluate(
      ({ f, budget }) => Promise.race([window.__kcStill(f), new Promise((r) => setTimeout(r, budget))]),
      { f: count, budget: budgetMs },
    );
    return gridStats();
  };
  // A flat-background frame is one uniform colour at any sampling density:
  // distinct 1, range 1 — re-measured on the pre-fix tree through this same
  // read path (three FREEZE + CLEARs, 41 nodes standing; 8-, 16- and 32-cell
  // grids all read 1/1). Healthy frames are scene-dependent, and the reseed
  // frame is the weakest read in this suite: the #2548 characterization
  // (21 post-CLEAR reads over 7 dealt scenes in the sandbox, plus the CI
  // samples that opened the issue) put its floor at the old 8-cell read at
  // distinct 6 / range 13 — too close to the defect for a bar with margin
  // on both sides. At 32 cells the same frames floor at distinct 32 /
  // range 64, so the grid moves to 32 cells and the bar sits between the
  // two populations: 2.7x under the healthy floor on both metrics, 12x /
  // 24x over the defect signature. (Scene, hold and thaw reads floor at
  // or above the reseed floor.) Full data: docs/archive/staging/
  // STAGING-REPORT-2548-RECALIBRATION.md.
  const notFlat = (g) => !!g && g.distinct >= 12 && g.range >= 24;

  try {
    const on = await page.evaluate(() => window.__KC_UI__.act('directors.accum', true));
    assert.equal(on.ok, true, 'ACCUM act failed');
    await page.waitForFunction('window.__kcStore.getState().layoutParams.accumulation === true', null, {
      timeout: 15000,
    });
    const gScene = await forceFrames(24, 150000);
    const stScene = await stage();
    ok('ACCUM on: the buffer accumulates a real scene (count > 0, frame not flat)', () => {
      assert.ok(stScene.nodeCount > 0, `nodeCount ${stScene.nodeCount}`);
      assert.ok(notFlat(gScene), `presented grid ${JSON.stringify(gScene)} reads flat`);
    });

    const fr = await page.evaluate(() => window.__KC_UI__.act('directors.accum-freeze', true));
    assert.equal(fr.ok, true, 'FREEZE act failed');
    const gHold = await forceFrames(3, 60000);
    ok('FREEZE holds the accumulated scene (the hold itself is not the defect)', () => {
      assert.ok(notFlat(gHold), `held grid ${JSON.stringify(gHold)} reads flat`);
    });

    const pre = await state();
    ok('ACCUM is effective at the moment of CLEAR (no governor shed, no fault)', () => {
      assert.equal(pre.accum, true, 'accumulation flag off');
      assert.equal(pre.tier1, false, 'governor tier-1 shed latched — ACCUM not effective');
      assert.equal(pre.fault, false, 'renderFault standing');
      assert.ok(pre.nodes > 0, `nodeCount ${pre.nodes}`);
    });

    const cl = await page.evaluate(() => window.__KC_UI__.act('directors.accum-clear'));
    assert.equal(cl.ok, true, 'CLEAR act failed');
    const gClear = await forceFrames(3, 60000);
    const stClear = await stage();
    ok('FREEZE + CLEAR: count > 0 and the presented frame is the scene still, never the flat background', () => {
      assert.ok(stClear.nodeCount > 0, `nodeCount ${stClear.nodeCount}`);
      assert.ok(
        notFlat(gClear),
        `post-CLEAR grid ${JSON.stringify(gClear)} reads flat while ${stClear.nodeCount} nodes stand — the #2480 trap`,
      );
    });

    const th = await page.evaluate(() => window.__KC_UI__.act('directors.accum-freeze', false));
    assert.equal(th.ok, true, 'THAW act failed');
    const gThaw = await forceFrames(3, 60000);
    ok('THAW resumes accumulation (frame still not flat)', () => {
      assert.ok(notFlat(gThaw), `post-THAW grid ${JSON.stringify(gThaw)} reads flat`);
    });

    ok('no frame errors across the whole gesture sequence', () => {
      assert.deepEqual(frameErrors, [], `frame errors: ${(frameErrors[0] || '').slice(0, 160)}`);
    });
  } finally {
    await page.close();
    await browser.close();
    server.close();
  }
}

console.log(`accumFreezeClear.selfcheck: ok (${n} groups${skipped ? ', browser skipped' : ''})`);
