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
//
// #2537 — read protocol: a scene transition's atlas bake can still be in
// flight when the hold begins (presents continue on last-good cells,
// Spine B), and its landing — the standing scene with its completed
// atlas — is a real change the seam presents once, even while held. That
// landing can fall after a settle baseline or in the settle→recall gap,
// so a read that takes the FIRST present after an act as that act's
// still races it (CI: the "recall" still read as the pre-recall scene,
// dB 3.6, because it was the pre-recall bake landing, not the recall's
// still). Scene reads therefore poll for convergence, exactly as
// waitScene does for running reads; count baselines are re-taken
// immediately before the act under test, so a landing that belongs to
// the previous scene never spends the act's present budget; and a hold
// baseline is only trusted once a soak re-read agrees the count stands.
//
// #2537 round 2 — the held group's reference is the standing still
// itself: stableHold returns the first settled paused frame of its
// standing attempt as the reference and the soak re-read as the held
// frame, and the group asserts the hold does not drift from the
// standing still (< 5). The earlier reference — the running waitScene
// sample of scene B — is a different animation instant from the
// standing still, so the old comparison could fire on two legitimate
// frames of the same scene with no landing and no count move (QA F1).
// The same disease sat in the ACCUM variant's FREEZE group (F3, found
// by round 2's own proof batch): the frozen buffer was compared
// absolutely (< 8) to the running waitScene sample of B2, but the
// buffer kept accumulating between that sample and the freeze landing
// (fired at d 9.7). It now reads B2's identity relatively (closer to
// B2 than to A) and asserts the hold against its own first frozen
// frame across a soak, at the same threshold.
//
// PR #2540 hardening (2026-11-26) — the convergence waits are budgeted
// in presented frames, not wall seconds. The A/B diagnosis (10 runs on
// the PR tree, 12 on pristine main, byte-identical suite code) proved
// the CI failures were this suite's wall clocks expiring under CPU
// contention, not a production defect: after the A→B setState the
// presented grid's mean luminance parked at 138.9–169.4 against the
// >170 threshold for the full 180 s budget, two runs missing the
// threshold by 1–4 points. The scene converges over presented frames
// (the bake/resolver pipeline advances per present), and contention
// starves the frame count long before it starves the clock. Every run
// that got past scene B passed all 18 groups, both paused-recall
// groups included. waitScene / waitPresented now poll until the
// criterion is met, the presented count has advanced by a generous
// frame budget, or the count stops advancing entirely (the wall clock
// remains only as that hang detector). The boot gate maintains the
// scene-A set inside the read's own page turn. Criteria unchanged.
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
  ok('the signature names the resolver inputs a performer can write alone while paused', () => {
    const at = src.indexOf('function sceneSignature(s, f)');
    assert.ok(at >= 0, 'sceneSignature located');
    const body = src.slice(at, at + 1400);
    // QA's enumeration: each of these is written alone by a performer
    // action (the Asset Pool weight pip, the tile STILL pip, the CA grid
    // reset, a dish-fluid magnet drag) and feeds the resolver — omit one
    // and a paused write to it leaves the stale frame standing.
    for (const field of ['s.assetWeightOverrides', 's.assetStill', 's.caGrid', 's.dishFluidMagnets']) {
      assert.ok(body.includes(field), `sceneSignature must include ${field}`);
    }
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
  //
  // PR #2540 hardening: the budget is PRESENTED FRAMES, not wall seconds
  // (see the header note). Passing runs present the light scene within a
  // few hundred frames even when slow, so FRAME_BUDGET allows ≈6–8×
  // that. The wall clock survives only as a hang detector: a presented
  // count that stops advancing entirely for HANG_MS fails as a hang.
  const FRAME_BUDGET = 2400;
  const HANG_MS = 120000;
  const waitScene = async (kind, { maintainSceneA = false } = {}) => {
    let startN = null;
    let lastN = -1;
    let lastAdvance = Date.now();
    let lastLum = null;
    for (;;) {
      // With maintainSceneA (the boot gate), sample-and-act share one
      // page turn: the store is read and the scene-A set re-applied in
      // the same synchronous turn that reads the presented grid, so a
      // boot hydration landing between polls is corrected on this very
      // read, and one inside the turn is impossible (single-threaded) —
      // the #2542 pattern.
      const g = maintainSceneA
        ? await page.evaluate(() => {
            const s = window.__kcStore.getState();
            if (s.paletteId !== 'hydra' || s.paletteMixSeconds !== 0) {
              window.__kcStore.setState({ paletteId: 'hydra', paletteMixSeconds: 0 });
            }
            return window.__kcPresentedGrid(8);
          })
        : await grid();
      const now = Date.now();
      if (g) {
        if (startN === null) startN = g.n;
        if (g.n !== lastN) {
          lastN = g.n;
          lastAdvance = now;
        }
        lastLum = meanLum(g);
        if (g.n > 0 && (kind === 'dark' ? lastLum < 70 : lastLum > 170)) return g;
        if (lastN - startN >= FRAME_BUDGET) {
          throw new Error(
            `presented grid never showed the ${kind} scene after ${lastN - startN} presented frames (last luminance ${lastLum.toFixed(1)}, threshold ${kind === 'dark' ? '< 70' : '> 170'})`,
          );
        }
      }
      if (now - lastAdvance > HANG_MS) {
        throw new Error(
          `presented count stopped advancing in the ${kind} scene wait — hang (last n ${lastN}, last luminance ${lastLum === null ? 'none' : lastLum.toFixed(1)})`,
        );
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
  // #2537 — a hold baseline that survives a late atlas-bake landing: the
  // count must be settled AND stand across a soak re-read. A landing in
  // between moves the count once and the loop re-settles — but only
  // while the store still holds the expected scene (a store move is a
  // real change, not a landing, and fails the pin). A count that never
  // stands (a still per tick is a defect) exhausts the attempts.
  // Round 2: the returned reference (ref) is the standing attempt's
  // first settled paused frame — the standing still itself — and the
  // returned grid is that attempt's soak re-read, so the caller can
  // assert the hold did not drift from the standing still. (The
  // pre-round-2 reference, the caller's RUNNING scene sample, is a
  // different animation instant and could sit ≥ 5 from the still with
  // nothing having moved — QA F1.)
  const stableHold = async (expectStore) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const n0 = await settledCount();
      const g0 = await grid();
      await page.waitForTimeout(700);
      const g1 = await grid();
      if (g0 && g1 && g1.n === g0.n && g0.n === n0) return { n: n0, grid: g1.grid, ref: g0.grid };
      const st = await store();
      assert.equal(st.seed, expectStore.seed, 'the scene moved during the hold — not a bake landing');
      assert.equal(st.paletteId, expectStore.paletteId, 'the scene moved during the hold — not a bake landing');
    }
    throw new Error('presented count never stabilised while held');
  };
  // #2537 — a post-act settle with a present budget: the count must
  // settle AND stand across a soak re-read, with the total presents
  // since the baseline never exceeding the budget (the act's still +
  // at most its bake landing, whenever the landing falls). A landing
  // during the soak re-enters the loop (the budget binds at every
  // step, and the store must still hold the expected scene — a store
  // move is a real change, not a landing); a count that never stands,
  // or a present beyond the budget, fails. Two back-to-back settled
  // counts are NOT enough here: a single bake landing can fall between
  // them, after the first already read stable.
  const boundedSettle = async (nPre, maxPresents, expectStore) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const n0 = await settledCount();
      assert.ok(n0 - nPre <= maxPresents, `presents since the act exceeded the budget (${n0 - nPre} > ${maxPresents})`);
      await page.waitForTimeout(700);
      const g1 = await grid();
      if (g1 && g1.n === n0) return n0;
      const st = await store();
      assert.equal(st.seed, expectStore.seed, 'the scene moved during the settle — not a bake landing');
      assert.equal(st.paletteId, expectStore.paletteId, 'the scene moved during the settle — not a bake landing');
    }
    throw new Error('presented count never stabilised after the act');
  };
  // #2537 — poll the presented grid until a frame past the baseline count
  // satisfies the caller's scene criterion (convergence, as waitScene),
  // instead of reading the first present after an act: a pre-act bake
  // landing can be that first present, and it shows the previous scene.
  // #2537 — poll the presented grid until a frame past the baseline count
  // satisfies the caller's scene criterion (convergence, as waitScene),
  // instead of reading the first present after an act: a pre-act bake
  // landing can be that first present, and it shows the previous scene.
  // PR #2540 hardening: same frame budget + hang detector as waitScene;
  // the failure message carries the measured values (last n, nPre, and
  // the caller's describe() of the last frame — dA/dB at the recall
  // sites) so a future failure is diagnosable from the log alone.
  const waitPresented = async (nPre, isExpected, what = 'the expected scene', describe = null) => {
    let lastN = -1;
    let lastAdvance = Date.now();
    let lastG = null;
    for (;;) {
      const g = await grid();
      const now = Date.now();
      if (g) {
        lastG = g;
        if (g.n !== lastN) {
          lastN = g.n;
          lastAdvance = now;
        }
        if (g.n > nPre && isExpected(g)) return g;
        if (g.n - nPre >= FRAME_BUDGET) {
          throw new Error(
            `presented grid never showed ${what} after ${g.n - nPre} presented frames past the baseline (last n ${g.n}, nPre ${nPre}${describe ? `, ${describe(g)}` : ''})`,
          );
        }
      }
      if (now - lastAdvance > HANG_MS) {
        throw new Error(
          `presented grid never showed ${what} and the presented count stopped advancing — hang (last n ${lastN}, nPre ${nPre}${describe && lastG ? `, ${describe(lastG)}` : ''})`,
        );
      }
      await page.waitForTimeout(400);
    }
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
    // presenting) before the scene is set. PR #2540 hardening: the set
    // is no longer applied once (or twice) ahead of the read — the read
    // itself maintains it: every poll samples the store and re-applies
    // the scene-A set in the same page turn (maintainSceneA in
    // waitScene), so a boot hydration landing after the set, which
    // overwrites the palette, is corrected on the very next read
    // instead of stranding the wait.
    await page.waitForFunction(() => window.__KC_UI__.stage().nodeCount > 0, null, { timeout: 180000 });
    const gA = await waitScene('dark', { maintainSceneA: true });
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
    const sB = await store();
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
    const hold = await stableHold(sB);
    const nHold = hold.n;
    const gHold = { n: hold.n, grid: hold.grid };
    const sHold = await store();
    ok('an unchanged scene presents nothing while held', () => {
      assert.equal(sHold.running, false, 'the stop must stand');
      assert.ok(
        dist(gHold.grid, hold.ref) < 5,
        `the held frame drifted from the standing still (d ${dist(gHold.grid, hold.ref).toFixed(1)}, threshold 5)`,
      );
    });

    // — The A8 act: recall the hit through the Hits tray's own channel.
    // #2537: the count baseline is re-taken immediately before the act,
    // so a pre-recall bake landing (counted in nPre) never spends the
    // recall's present budget; the still is read by convergence, not as
    // the first present after the act.
    const gPre = await grid();
    const nPre = gPre ? gPre.n : nHold;
    const rec = await page.evaluate((p) => window.__KC_UI__.act('transport.hit-recall', undefined, p), {
      favorite: fav.favorite,
      index: fav.index,
    });
    assert.equal(rec.ok, true, 'hit-recall act failed');
    const sLanded = await store();
    assert.equal(sLanded.seed, sA.seed, 'the recall itself must land through the tray channel');
    const gStill = await waitPresented(
      nPre,
      (g) => dist(g.grid, gA.grid) < dist(g.grid, gB.grid),
      'the recalled scene after the paused recall',
      (g) => `dA ${dist(g.grid, gA.grid).toFixed(1)}, dB ${dist(g.grid, gB.grid).toFixed(1)}`,
    );
    const sStill = await store();
    ok('the paused recall presents a still of the recalled scene, with the stop standing', () => {
      assert.ok(gStill.n >= nPre + 1, 'the recall presented nothing');
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
    // frame) — then the count stands. The budget is measured from nPre
    // (taken immediately before the act): a landing that belongs to the
    // PRE-recall scene is already inside nPre and never spends this
    // budget (#2537). boundedSettle returns only once the count stands
    // across a soak with the budget intact — that standing is the
    // no-drift evidence; a still per tick never stands and fails.
    const nStill = await boundedSettle(nPre, 2, sA);
    ok('the still is bounded: at most the scene still and its bake, then no drift', () => {
      assert.ok(
        nStill - nPre >= 1 && nStill - nPre <= 2,
        `recall produced ${nStill - nPre} presents over the hold — expected the scene still (+ its bake)`,
      );
    });

    // — A resize while paused re-presents the held scene once, at the new
    // size (the presented size rides the signature).
    await page.evaluate(({ canvasW, canvasH }) => window.__kcStore.setState({ canvasW, canvasH }), {
      canvasW: 760,
      canvasH: 532,
    });
    const gResize = await waitPresented(
      nStill,
      (g) => g.width !== gStill.width || g.height !== gStill.height,
      'the held scene at the new size after the resize',
      (g) => `presented size ${g.width}x${g.height}, expected a change from ${gStill.width}x${gStill.height}`,
    );
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
      assert.ok(
        dist(gRun.grid, gA.grid) < dist(gRun.grid, gB.grid),
        `the resumed stage is not the recalled scene (dA ${dist(gRun.grid, gA.grid).toFixed(1)}, dB ${dist(gRun.grid, gB.grid).toFixed(1)})`,
      );
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
    const sB2 = await store();
    const fr = await page.evaluate(() => window.__KC_UI__.act('directors.accum-freeze', true));
    assert.equal(fr.ok, true, 'FREEZE act failed');
    await page.waitForTimeout(1200); // the frozen hold presents the buffer each tick
    const gFrozenHold = await grid();
    await page.waitForTimeout(700); // soak: the frozen hold must stand
    const gFrozenHold2 = await grid();
    ok('FREEZE holds the accumulated B2 buffer (the hold itself is not the defect)', () => {
      // #2537 round 2 (F3, found by the round-2 proof batch): scene
      // identity is read relatively — the frozen buffer is B2's, not
      // A's — because the buffer kept accumulating between the running
      // waitScene sample (gB2, first light read) and the freeze
      // landing, so an absolute distance to that early sample is not a
      // sound bound (it fired at d 9.7 vs the old < 8 with nothing
      // defective: the F1 disease one group over). The hold itself is
      // asserted against its own first frozen frame across the soak,
      // at the group's original threshold.
      assert.ok(
        dist(gFrozenHold.grid, gB2.grid) < dist(gFrozenHold.grid, gAacc.grid),
        `the frozen buffer is not B2's (dB2 ${dist(gFrozenHold.grid, gB2.grid).toFixed(1)}, dA ${dist(gFrozenHold.grid, gAacc.grid).toFixed(1)})`,
      );
      assert.ok(
        dist(gFrozenHold2.grid, gFrozenHold.grid) < 8,
        `the frozen hold drifted across the soak (d ${dist(gFrozenHold2.grid, gFrozenHold.grid).toFixed(1)}, threshold 8)`,
      );
    });
    // The pause here is RUN off, not a second watchdog trip: a trip sheds
    // to tier 1, which stands ACCUM down and dismantles the freeze before
    // the variant could exercise it. RUN off is the other pause the seam
    // serves (the loop's gate is !running either way).
    await page.evaluate(() => window.__kcStore.getState().setRunning(false));
    const frozenHold = await stableHold(sB2);
    const nFrozen = frozenHold.n;
    // #2537: same protocol as the main recall — baseline immediately
    // before the act, still read by convergence.
    const gPre2 = await grid();
    const nPre2 = gPre2 ? gPre2.n : nFrozen;
    const rec2 = await page.evaluate((p) => window.__KC_UI__.act('transport.hit-recall', undefined, p), {
      favorite: fav2.favorite,
      index: fav2.index,
    });
    assert.equal(rec2.ok, true, 'hit-recall act (accum) failed');
    const sLanded2 = await store();
    assert.equal(sLanded2.seed, sA.seed, 'the recall itself must land through the tray channel (accum)');
    const gReseed = await waitPresented(
      nPre2,
      (g) => dist(g.grid, gFrozenHold.grid) > 3 && dist(g.grid, gAacc.grid) < dist(gFrozenHold.grid, gAacc.grid),
      'the reseeded recalled scene after the paused∧frozen recall',
      (g) =>
        `dFrozen ${dist(g.grid, gFrozenHold.grid).toFixed(1)}, dA ${dist(g.grid, gAacc.grid).toFixed(1)}, dFrozenToA ${dist(gFrozenHold.grid, gAacc.grid).toFixed(1)}`,
    );
    const sReseed = await store();
    ok('paused∧frozen recall reseeds the buffer and shows the recalled scene', () => {
      assert.ok(gReseed.n >= nPre2 + 1, 'the recall presented nothing — the stale buffer texture survived');
      assert.ok(
        dist(gReseed.grid, gFrozenHold.grid) > 3,
        `the presented frame did not move (d ${dist(gReseed.grid, gFrozenHold.grid).toFixed(1)}, threshold 3) — the stale buffer texture is still showing`,
      );
      assert.ok(
        dist(gReseed.grid, gAacc.grid) < dist(gFrozenHold.grid, gAacc.grid),
        `the reseeded frame did not move toward the recalled scene (dReseed ${dist(gReseed.grid, gAacc.grid).toFixed(1)}, dHold ${dist(gFrozenHold.grid, gAacc.grid).toFixed(1)})`,
      );
      assert.equal(sReseed.running, false, 'the reseed must not resume the loop');
      assert.equal(sReseed.seed, sA.seed, 'the store holds the hit’s seed');
    });
    // #2537: same bounded settle as the main group — the count must
    // stand across a soak within the budget, however the reseed's bake
    // landing interleaves with the reads.
    const nFrozenAfter = await boundedSettle(nPre2, 2, sA);
    ok('the frozen hold resumes after the reseed (bounded, then no drift)', () => {
      assert.ok(
        nFrozenAfter - nPre2 >= 1 && nFrozenAfter - nPre2 <= 2,
        `recall produced ${nFrozenAfter - nPre2} presents over the frozen hold — expected the reseed (+ its bake)`,
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
