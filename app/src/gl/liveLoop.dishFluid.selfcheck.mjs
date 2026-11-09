// liveLoop.dishFluid.selfcheck.mjs — FERROFLUID (#1997): the LIVE frame path regression pin.
//
// The fault this suite was born for (found by a coordinator review drive of the first shipped
// build, invisible to every other #1997 suite): tick()'s ferrofluid arm resolved the frame
// palette through a bare `voiceState` read — a name that exists only inside buildFrame and
// clearAccum — so EVERY fluid-active frame threw ReferenceError, the loop's fault channel
// (renderFault in the store) tripped with "frame fault: voiceState is not defined", no frame
// ever presented, and the fluid never appeared in the live app. The resolver, kernel, chip
// and GL-harness suites were all green because none of them drives createLiveLoop's real
// frame path with the fluid active. This suite does.
//
// The presentation rework (Matt's ruling, 2026-11-08) removed the arm itself: the system is
// invisible, the resolver seats the fluid's body as ordinary stage items, and the loop's whole
// part is the stamp. The pin's charge is unchanged — the real frame path, fluid active, must
// run clean and the fluid must actually appear — with the observables the new shape offers:
//
//   A source     tick() carries no `voiceState.` read (the original fault class); NO floor
//                arm survives anywhere (no setDishFluid in the loop or the renderer, no
//                dishfluid programme in the renderer table); the loop still stamps the fluid
//                onto the input; the resolver still publishes the attachment plan and emits
//                the body from it.
//   B browser    (skipped when no Playwright browser is present) the BUILT app, booted for
//                real over a local static server. A control boot (fluid off) must be healthy;
//                turning the mode on through the store's own action must publish
//                dishFluidAwake, raise the store's nodeCount by the attached body (the body
//                is ordinary stage content — the footer count sees it), log ZERO
//                '[gl-live] frame error' console messages and keep renderFault down; turning
//                it off must take the body back off the stage. A second boot through the
//                loop's headless flag (window.__KC_FERROFLUID) must stay clean the same way,
//                with a magnet stamped through the store's own action. The app is rebuilt
//                first (npm run build) so the pin always tests the current tree.
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
  const tickStart = src.indexOf('function tick()');
  const tickEnd = src.indexOf('function captureFrame', tickStart);
  assert.ok(tickStart >= 0 && tickEnd > tickStart, 'tick() body located');
  const tick = src.slice(tickStart, tickEnd);
  ok('tick() carries no voiceState property read (the out-of-scope name)', () => {
    assert.ok(!/voiceState\s*\./.test(tick), 'a bare voiceState.<prop> read in tick() throws every frame');
  });
  ok('no floor arm survives: the loop stamps, the resolver seats', () => {
    assert.ok(!src.includes('renderer.setDishFluid'), 'liveLoop carries no renderer arm for the fluid');
    assert.ok(!src.includes('getLastDishFluidPlan'), 'liveLoop no longer consumes the plan');
    assert.ok(src.includes('dishFluid: dishFluidStamp'), 'the loop still stamps the fluid onto the resolver input');
    const renderer = readFileSync(path.join(APP, 'src', 'gl', 'renderer.mjs'), 'utf8');
    assert.ok(!renderer.includes('setDishFluid'), 'the renderer has no fluid arm');
    assert.ok(!renderer.includes("'dishfluid'"), 'the renderer table has no floor programme');
    const resolve = readFileSync(path.join(APP, 'src', 'gl', 'liveResolve.mjs'), 'utf8');
    assert.ok(resolve.includes('lastDishFluidPlan = dishFluid.plan'), 'the resolver publishes the attachment plan');
    assert.ok(resolve.includes('fluidMatterItems('), 'the resolver emits the body from the plan');
  });
}

// ---- B: browser (built-app live boot) section
let skipped = false;
let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  const probe = await chromium.launch({ args: ['--no-sandbox'] }).catch((e) => {
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

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const shotStats = async (page) => {
    const b64 = (await page.screenshot({ type: 'png' })).toString('base64');
    return page.evaluate(async (b) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = 'data:image/png;base64,' + b;
      });
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 400;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const colours = new Set();
      let sum = 0;
      for (let i = 0; i < d.length; i += 16) {
        colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }
      return { distinct: colours.size, meanLum: sum / (d.length / 16) };
    }, b64);
  };
  const boot = async (fluidOn) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const frameErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().includes('[gl-live] frame error')) frameErrors.push(m.text());
    });
    page.on('pageerror', (e) => frameErrors.push('pageerror: ' + String(e)));
    await page.addInitScript((on) => {
      localStorage.setItem('kc:first-run-seen', '1');
      window.__KC_EXPOSE_STORE = true;
      if (on) window.__KC_FERROFLUID = true;
    }, fluidOn);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('!!window.__kcStore', null, { timeout: 30000 });
    return { page, frameErrors };
  };
  const health = (page) =>
    page.evaluate(() => {
      const s = window.__kcStore.getState();
      return { awake: s.dishFluidAwake, fault: s.renderFault, reason: s.renderFaultReason, nodes: s.nodeCount };
    });
  /** Sample the store's nodeCount for `ms`, returning the max seen (the body's rise is a step, not a flicker). */
  const sampleNodes = async (page, ms) => {
    let max = 0;
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const v = await page.evaluate(() => window.__kcStore.getState().nodeCount | 0);
      if (v > max) max = v;
      await page.waitForTimeout(400);
    }
    return max;
  };

  try {
    // Control boot: healthy with no fluid — then the mode turned on through the store's own
    // action must attach its body to the live stage, and off must take it back off.
    {
      const { page, frameErrors } = await boot(false);
      await page.waitForTimeout(5000);
      const h = await health(page);
      const st = await shotStats(page);
      ok('control boot (fluid off): no frame errors, no fault, real frames present', () => {
        assert.deepEqual(frameErrors, [], `frame errors: ${frameErrors[0] || ''}`);
        assert.equal(h.fault, false, `renderFault tripped on a plain boot: ${h.reason}`);
        assert.equal(h.awake, false, 'the fluid is awake on a fluid-off boot');
        assert.ok(
          st.distinct > 500 && st.meanLum > 2,
          `presented content (distinct ${st.distinct}, meanLum ${st.meanLum.toFixed(2)})`,
        );
      });
      const baseNodes = await sampleNodes(page, 4000);
      await page.evaluate(() => window.__kcStore.getState().setDishFluid(true));
      await page
        .waitForFunction('window.__kcStore.getState().dishFluidAwake === true', null, { timeout: 20000 })
        .catch(() => {});
      const onNodes = await sampleNodes(page, 8000);
      const hOn = await health(page);
      ok('fluid on (store action): the body attaches to the live stage, frame path clean', () => {
        assert.equal(hOn.awake, true, 'dishFluidAwake never published — the stamp never flowed');
        assert.ok(
          onNodes > baseNodes + 8,
          `nodeCount rose by the attached body (off max ${baseNodes} → on max ${onNodes})`,
        );
        assert.deepEqual(frameErrors, [], `frame errors: ${(frameErrors[0] || '').slice(0, 120)}`);
        assert.equal(hOn.fault, false, `renderFault tripped: ${hOn.reason}`);
      });
      await page.evaluate(() => window.__kcStore.getState().setDishFluid(false));
      await page.waitForTimeout(3000);
      const offNodes = await sampleNodes(page, 3000);
      ok('fluid off again: the body leaves the stage', () => {
        assert.ok(
          offNodes <= baseNodes + 8,
          `nodeCount settled back (off max ${offNodes} vs baseline max ${baseNodes})`,
        );
        assert.deepEqual(frameErrors, [], `frame errors: ${(frameErrors[0] || '').slice(0, 120)}`);
      });
      await page.close();
    }
    // The headless-flag boot: the stamp flows from the first frame — the frame path must stay
    // clean and frames must present, with a magnet stamped through the store's own action.
    {
      const { page, frameErrors } = await boot(true);
      await page
        .waitForFunction('window.__kcStore.getState().dishFluidAwake === true', null, { timeout: 20000 })
        .catch(() => {});
      await page.waitForTimeout(6000);
      const h = await health(page);
      const st = await shotStats(page);
      ok('fluid on (headless flag): the stamp publishes awake and the frame path runs clean', () => {
        assert.equal(h.awake, true, 'dishFluidAwake never published — the fluid plan never went live');
        assert.deepEqual(frameErrors, [], `frame errors: ${(frameErrors[0] || '').slice(0, 120)}`);
        assert.equal(h.fault, false, `renderFault tripped: ${h.reason}`);
        assert.ok(
          st.distinct > 500 && st.meanLum > 2,
          `presented content (distinct ${st.distinct}, meanLum ${st.meanLum.toFixed(2)})`,
        );
      });
      const magnets = await page.evaluate(() => {
        const s = window.__kcStore.getState();
        s.placeDishFluidMagnet(0.5, 0.5);
        return window.__kcStore.getState().dishFluidMagnets.length;
      });
      await page.waitForTimeout(2500);
      const h2 = await health(page);
      ok('fluid on + a stamped magnet: the frame path stays clean', () => {
        assert.equal(magnets, 1, 'the magnet never landed in the store');
        assert.deepEqual(frameErrors, [], `frame errors: ${(frameErrors[0] || '').slice(0, 120)}`);
        assert.equal(h2.fault, false, `renderFault tripped: ${h2.reason}`);
        assert.equal(h2.awake, true, 'the fluid went dark with a magnet stamped');
      });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
} else {
  console.log('  [skip] browser section — no Playwright browser in this sandbox');
}

console.log(`liveLoop.dishFluid.selfcheck: ok (${n} groups${skipped ? ', browser skipped' : ''})`);
