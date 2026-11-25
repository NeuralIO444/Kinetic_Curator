// pausedRecallPresent.selfcheck.mjs — a hit recall while the loop is paused must
// present the recalled scene (#2486).
//
// The defect: while PERF PAUSED stood (watchdog stop: running false), clicking a
// Hit in the bottom bar wrote the hit's whole state into the store — seed,
// offsets, layout, palette, cast — and the resolver resolved the hit's stage
// from it, but the stage picture never changed: the live loop's tick returns
// before every present call while paused (the Spine-B hold), so the canvas
// kept the last presented frame until RUN. The count read the resolver; the
// canvas read the hold; the recall fell between them.
//
// The fix (all in gl/liveLoop.mjs, the loop being the state's one truth): a
// scene signature — the store's identity inputs plus the frame's presented
// facts — recorded at every present. The paused branch still rolls the clocks
// back and holds, but when the current frame's signature differs from the
// last presented one, the tick falls through and presents exactly one held
// still of the new scene; an unchanged scene returns as before. Paused AND
// frozen with ACCUM on, the fall-through asks A2's reseed law (#2480) for the
// one render + step frame, since the frozen branch would present the buffer's
// pre-recall texture and the recall could never show.
//
//   A source    the seam's shape in liveLoop.mjs (runs everywhere).
//   B browser   (skipped when no Playwright browser is present) the BUILT app,
//               driven through the shipped __KC_UI__ bridge — the recall goes
//               through the Hits tray's own channel (transport.hit-recall) —
//               with the presented frame read back through the loop's own
//               readback (__kcPresentedGrid: the last PRESENTED frame and its
//               present count, no re-render). The loop FREE-RUNS throughout:
//               the test-only still path (#2477) freezes the loop after its
//               run by design, so a pin that must observe live ticks across
//               a pause cannot use it — scene reads poll the presented grid
//               until it shows the expected scene instead. The main pause is
//               the real watchdog trip (the filed PERF PAUSED); the ACCUM
//               variant pauses via RUN off, since a trip's tier-1 shed stands
//               ACCUM down before the variant could exercise it. The governor
//               is gated off (__KC_GOVERNOR_OFF, the established e2e gate) so
//               ACCUM stays effective under software GL; the mechanism under
//               test is the loop's paused presentation gate.
//               Pins: while paused, an unchanged scene presents nothing; a
//               recall presents a still of the recalled scene (plus at most
//               one more when its atlas bake lands), with the stop still
//               standing and no drift after; RUN continues the same scene;
//               and the paused∧frozen ACCUM variant reseeds the same way.
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
  ok('the loop records the presented scene’s signature beside A2’s reseed flag', () => {
    assert.ok(src.includes('let lastPresentedSig = null;'), 'lastPresentedSig declaration missing');
    assert.ok(src.includes('function sceneSignature(s, f)'), 'sceneSignature helper missing');
  });
  ok('the paused branch presents on change and otherwise holds as before', () => {
    const at = src.indexOf('if (paused) {');
    assert.ok(at >= 0, 'paused branch located');
    const branch = src.slice(at, at + 2600);
    assert.ok(
      branch.includes('if (sameSceneSignature(sig, lastPresentedSig)) return;'),
      'unchanged scene must still return in the paused branch',
    );
    assert.ok(
      branch.includes('if (frozen && accumOn) accumReseedPending = true;'),
      'paused∧frozen must ask A2’s reseed law for the still, not present the stale buffer',
    );
  });
  ok('the slowRender clock rollback does not double-roll a paused fall-through', () => {
    assert.match(
      src,
      /if \(!paused\) \{\s*\n\s*if \(getState\(\)\.slowRender\) \{\s*\n\s*loopTimeMs -= clampedDtMs;/,
      'the #823 rollback must sit inside a !paused wrapper so a paused still is not rolled back twice',
    );
  });
  ok('every present records the signature it showed', () => {
    assert.ok(
      src.includes('lastPresentedSig = sig; // #2486: the canvas now shows this scene'),
      'present site must record lastPresentedSig',
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
    window.__KC_GOVERNOR_OFF = true; // no automatic second trip while the test holds its own stop
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__kcStore && !!window.__KC_UI__', null, { timeout: 30000 });

  const stage = () => page.evaluate(() => window.__KC_UI__.stage());
  const store = () =>
    page.evaluate(() => {
      const s = window.__kcStore.getState();
      return {
        running: s.running,
        slowRender: s.slowRender,
        slowRenderSource: s.slowRenderSource,
        seed: s.seed,
        paletteId: s.paletteId,
        canvasW: s.canvasW,
        canvasH: s.canvasH,
        favorites: s.favorites ? s.favorites.length : 0,
      };
    });
  const grid = () => page.evaluate(() => window.__kcPresentedGrid(8));
  const dist = (a, b) => {
    let d = 0;
    for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
    return d / a.length;
  };
  const meanLum = (g) => g.grid.reduce((a, v) => a + v, 0) / g.grid.length;
  // Poll the presented grid until it shows the expected scene character —
  // the two test palettes are chosen for coarse-grid legibility (hydra's
  // ground is near-black, transit's near-white), so the presented frame's
  // mean luminance names the scene outright.
  const waitScene = async (kind, timeoutMs = 180000) => {
    const t0 = Date.now();
    for (;;) {
      const g = await grid();
      if (g && g.n > 0 && (kind === 'dark' ? meanLum(g) < 70 : meanLum(g) > 170)) return g;
      if (Date.now() - t0 > timeoutMs) {
        throw new Error(`presented grid never showed the ${kind} scene (last ${g ? meanLum(g).toFixed(1) : 'none'})`);
      }
      await page.waitForTimeout(600);
    }
  };
  // While paused, wait until the presented count is stable across two
  // reads, and return it — the baseline a change is measured against.
  const settledCount = async () => {
    let prev = -1;
    for (let i = 0; i < 25; i++) {
      const g = await grid();
      if (g && g.n === prev) return prev;
      prev = g ? g.n : -1;
      await page.waitForTimeout(400);
    }
    throw new Error('presented count never settled while paused');
  };
  const waitCount = async (target, timeoutMs = 60000) => {
    await page.waitForFunction((t) => (window.__kcPresentedGrid(8)?.n ?? -1) >= t, target, { timeout: timeoutMs });
    return grid();
  };

  try {
    // — Scene A standing and presented; keep it as a hit through the panel's
    // own ★ channel (the bridge recipe builds it with captureFavorite).
    // paletteMixSeconds 0: palette/seed changes land instantly, so the
    // scene reads below are settled scenes, not mid-dissolve blends (the
    // pin tests the presentation gate, not the dissolve). It is a
    // top-level store field, not a layout param, so no favourite carries
    // it and it stays 0 for the whole run.
    // Boot gate: the stage must be live (the loop resolving and
    // presenting) before the scene is set — and the set is re-applied
    // once if the app's own boot hydration lands after it and overwrites
    // the palette (a race the read below would otherwise time out on).
    await page.waitForFunction(() => window.__KC_UI__.stage().nodeCount > 0, null, { timeout: 180000 });
    let gA = null;
    for (let attempt = 0; attempt < 2 && !gA; attempt++) {
      await page.evaluate(({ paletteId }) => window.__kcStore.setState({ paletteId, paletteMixSeconds: 0 }), {
        paletteId: 'hydra',
      });
      gA = await waitScene('dark', attempt === 0 ? 90000 : 180000).catch(() => null);
    }
    assert.ok(gA, 'scene A never presented');
    const stA = await stage();
    const sA = await store();
    ok('boot scene A is presented (count > 0)', () => {
      assert.ok(stA.nodeCount > 0, `nodeCount ${stA.nodeCount}`);
      assert.ok(gA && gA.n > 0, 'no presented frame read back');
    });
    const favAct = await page.evaluate(() => window.__KC_UI__.act('directors.favorite'));
    assert.equal(favAct.ok, true, 'FAVORITE act failed');
    const fav = await page.evaluate(() => {
      const favs = window.__kcStore.getState().favorites || [];
      return { favorite: favs[favs.length - 1], index: favs.length - 1 };
    });
    ok('the hit was kept through the tray channel', () => {
      assert.ok(fav.favorite, 'no favorite in state after the ★ act');
      assert.ok(fav.index >= 0, 'favorite index missing');
    });

    // — Scene B: a different seed and the light palette, presented live.
    await page.evaluate(({ seed, paletteId }) => window.__kcStore.setState({ seed, paletteId }), {
      seed: sA.seed + 12345,
      paletteId: 'transit',
    });
    const gB = await waitScene('light');
    ok('scene B is a visibly different stage from A (the pin can tell them apart)', () => {
      assert.ok(dist(gA.grid, gB.grid) > 20, `A/B grid distance ${dist(gA.grid, gB.grid).toFixed(1)} too small`);
    });

    // — PERF PAUSED: the real watchdog trip, read back in the same task —
    // the trip's own write IS the filed state. (Two environment notes:
    // the governor-off gate's housekeeping clears the slowRender overlay
    // on a later effect tick, and the trip's tier-1 shed is its own; the
    // run-flag stop is what gates presentation, and it stands. What the
    // seam owes — never move the stop — is pinned below by comparing the
    // stop fields before and after the still.)
    const tripState = await page.evaluate(() => {
      const st = window.__kcStore.getState();
      st.tripWatchdog('fps-critical');
      const a = window.__kcStore.getState();
      return { running: a.running, slowRender: a.slowRender, slowRenderSource: a.slowRenderSource };
    });
    ok('the watchdog trip produces the PERF PAUSED state', () => {
      assert.equal(tripState.running, false, 'the trip must stop the run flag');
      assert.equal(tripState.slowRender, true, 'the trip must stand slowRender');
      assert.equal(tripState.slowRenderSource, 'watchdog', 'the stop is the watchdog’s');
    });
    const nHold = await settledCount();
    const gHold = await grid();
    const sHold = await store();
    ok('an unchanged scene presents nothing while held', () => {
      assert.equal(sHold.running, false, 'the stop must stand');
      assert.equal(gHold.n, nHold, 'presented count moved while settling');
      assert.ok(dist(gHold.grid, gB.grid) < 5, 'the held frame is still scene B');
    });

    // — The A8 act: recall the hit through the Hits tray's own channel.
    const rec = await page.evaluate((p) => window.__KC_UI__.act('transport.hit-recall', undefined, p), {
      favorite: fav.favorite,
      index: fav.index,
    });
    assert.equal(rec.ok, true, 'hit-recall act failed');
    const sLanded = await store();
    assert.equal(sLanded.seed, sA.seed, 'the recall itself must land through the tray channel');
    const gStill = await waitCount(nHold + 1);
    const sStill = await store();
    ok('the paused recall presents a still of the recalled scene, with the stop standing', () => {
      assert.ok(gStill.n >= nHold + 1, 'the recall presented nothing');
      assert.ok(
        dist(gStill.grid, gA.grid) < dist(gStill.grid, gB.grid),
        `still reads closer to B than A (dA ${dist(gStill.grid, gA.grid).toFixed(1)}, dB ${dist(gStill.grid, gB.grid).toFixed(1)}) — the stale frame survived`,
      );
      assert.equal(sStill.running, false, 'the still must not resume the loop');
      assert.equal(sStill.slowRender, sHold.slowRender, 'the still must not move the stop’s slowRender');
      assert.equal(sStill.slowRenderSource, sHold.slowRenderSource, 'the still must not move the stop’s source');
      assert.equal(sStill.seed, sA.seed, 'the store holds the hit’s seed');
      assert.equal(sStill.paletteId, sA.paletteId, 'the store holds the hit’s palette');
    });
    // Bounded: the scene still, plus at most one more when the recall's
    // atlas bake lands (new cells are a real change to the presented
    // frame) — then the count is stable. A still per tick would never
    // settle, and that is what this pair of reads catches.
    const nStill = await settledCount();
    const nStillStable = await settledCount();
    ok('the still is bounded: at most the scene still and its bake, then no drift', () => {
      assert.ok(
        nStill - nHold >= 1 && nStill - nHold <= 2,
        `recall produced ${nStill - nHold} presents over the hold — expected the scene still (+ its bake)`,
      );
      assert.equal(nStillStable, nStill, `presented count drifted ${nStill} → ${nStillStable} with no change`);
    });

    // — A resize while paused re-presents the held scene once, at the new
    // size (the presented size rides the signature).
    await page.evaluate(({ canvasW, canvasH }) => window.__kcStore.setState({ canvasW, canvasH }), {
      canvasW: 760,
      canvasH: 532,
    });
    const gResize = await waitCount(nStill + 1);
    ok('a canvas resize while paused presents the held scene at the new size', () => {
      assert.ok(gResize.n >= nStill + 1, 'the resize presented nothing');
      assert.ok(
        gResize.width !== gStill.width || gResize.height !== gStill.height,
        `presented size unchanged (${gResize.width}x${gResize.height})`,
      );
    });
    await page.evaluate(({ canvasW, canvasH }) => window.__kcStore.setState({ canvasW, canvasH }), {
      canvasW: sA.canvasW,
      canvasH: sA.canvasH,
    });
    const nResized = await settledCount();

    // — RUN: the same scene continues; nothing is restored over the recall.
    await page.evaluate(() => window.__kcStore.getState().setRunning(true));
    await waitCount(nResized + 3);
    const gRun = await grid();
    const sRun = await store();
    ok('RUN resumes and the recalled scene is what continues', () => {
      assert.equal(sRun.running, true, 'RUN must resume');
      assert.ok(dist(gRun.grid, gA.grid) < dist(gRun.grid, gB.grid), 'the resumed stage is not the recalled scene');
    });

    // — Variant: paused AND frozen, ACCUM on. The frozen branch alone would
    // present the buffer's pre-recall texture forever; the seam must ask the
    // reseed law for exactly one render + step frame.
    const on = await page.evaluate(() => window.__KC_UI__.act('directors.accum', true));
    assert.equal(on.ok, true, 'ACCUM act failed');
    await page.waitForFunction('window.__kcStore.getState().layoutParams.accumulation === true', null, {
      timeout: 15000,
    });
    const gAacc = await waitScene('dark'); // scene A accumulates over the coming frames
    await page.waitForTimeout(4000); // let the buffer build A's trails
    const fav2Act = await page.evaluate(() => window.__KC_UI__.act('directors.favorite'));
    assert.equal(fav2Act.ok, true, 'FAVORITE act (accum) failed');
    const fav2 = await page.evaluate(() => {
      const favs = window.__kcStore.getState().favorites || [];
      return { favorite: favs[favs.length - 1], index: favs.length - 1 };
    });
    await page.evaluate(({ seed, paletteId }) => window.__kcStore.setState({ seed, paletteId }), {
      seed: sA.seed + 54321,
      paletteId: 'transit',
    });
    const gB2 = await waitScene('light'); // scene B2 accumulates
    const fr = await page.evaluate(() => window.__KC_UI__.act('directors.accum-freeze', true));
    assert.equal(fr.ok, true, 'FREEZE act failed');
    await page.waitForTimeout(1200); // the frozen hold presents the buffer each tick
    const gFrozenHold = await grid();
    ok('FREEZE holds the accumulated B2 buffer (the hold itself is not the defect)', () => {
      assert.ok(
        dist(gFrozenHold.grid, gB2.grid) < 8,
        `held buffer drifted from B2 (d ${dist(gFrozenHold.grid, gB2.grid).toFixed(1)})`,
      );
    });
    // The pause here is RUN off, not a second watchdog trip: a trip sheds
    // to tier 1, which stands ACCUM down and dismantles the freeze before
    // the variant could exercise it. RUN off is the other pause the seam
    // serves (the loop's gate is !running either way).
    await page.evaluate(() => window.__kcStore.getState().setRunning(false));
    const nFrozen = await settledCount();
    const rec2 = await page.evaluate((p) => window.__KC_UI__.act('transport.hit-recall', undefined, p), {
      favorite: fav2.favorite,
      index: fav2.index,
    });
    assert.equal(rec2.ok, true, 'hit-recall act (accum) failed');
    const sLanded2 = await store();
    assert.equal(sLanded2.seed, sA.seed, 'the recall itself must land through the tray channel (accum)');
    const gReseed = await waitCount(nFrozen + 1);
    const sReseed = await store();
    ok('paused∧frozen recall reseeds the buffer and shows the recalled scene', () => {
      assert.ok(gReseed.n >= nFrozen + 1, 'the recall presented nothing — the stale buffer texture survived');
      assert.ok(
        dist(gReseed.grid, gFrozenHold.grid) > 3,
        'the presented frame did not move — the stale buffer texture is still showing',
      );
      assert.ok(
        dist(gReseed.grid, gAacc.grid) < dist(gFrozenHold.grid, gAacc.grid),
        'the reseeded frame did not move toward the recalled scene',
      );
      assert.equal(sReseed.running, false, 'the reseed must not resume the loop');
      assert.equal(sReseed.seed, sA.seed, 'the store holds the hit’s seed');
    });
    const nFrozenAfter = await settledCount();
    const nFrozenStable = await settledCount();
    ok('the frozen hold resumes after the reseed (bounded, then no drift)', () => {
      assert.ok(
        nFrozenAfter - nFrozen >= 1 && nFrozenAfter - nFrozen <= 2,
        `recall produced ${nFrozenAfter - nFrozen} presents over the frozen hold — expected the reseed (+ its bake)`,
      );
      assert.equal(
        nFrozenStable,
        nFrozenAfter,
        `presented count drifted ${nFrozenAfter} → ${nFrozenStable} with no change`,
      );
    });
    await page.evaluate(() => window.__kcStore.getState().setRunning(true));
    await page.evaluate(() => window.__KC_UI__.act('directors.accum-freeze', false));

    ok('no frame errors across the whole gesture sequence', () => {
      assert.deepEqual(frameErrors, [], `frame errors: ${(frameErrors[0] || '').slice(0, 160)}`);
    });
  } finally {
    await page.close();
    await browser.close();
    server.close();
  }
}

console.log(`pausedRecallPresent.selfcheck: ok (${n} groups${skipped ? ', browser skipped' : ''})`);
