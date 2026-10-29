/**
 * GL driver — Phase 1 (#187). Node-only.
 *
 * Renders a scene through the WebGL2 renderer in headless Chromium and
 * returns RGBA bytes in top-first row order, matching the SVG candidate.
 *
 * The browser renderer is pure ES modules (renderer.mjs + shaders.mjs); this
 * driver serves them over a local HTTP server, bakes the texture atlas and
 * grain LUTs in Node (resvg), and ferries pixels across via page.evaluate.
 */

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { bakeAtlas, comboKey } from '../atlas.mjs';
import { glStaticHandler } from './glStaticServer.mjs';

const PARITY_DIR = path.dirname(fileURLToPath(import.meta.url));
const GL_DIR = path.join(PARITY_DIR, '..'); // serve src/gl; harness at /parity/glHarness.html

let server = null;
let browser = null;
let page = null;

// Browser launch args (default: none — Playwright's stock headless launch).
// Harness callers that need the REAL GPU (costBench --gpu, #1578) set these
// BEFORE the first page opens: Playwright's headless Chromium falls back to
// SwiftShader software rendering on macOS unless ANGLE is pointed at Metal,
// and software labels are not device truth. Once the browser is up, the args
// are frozen — asking for different ones is a programming error, not a
// relaunch request, so it throws instead of silently measuring the wrong GPU.
let launchArgs = null;
let launchedArgs = null;

/** ANGLE launch args that route WebGL to the platform's real GPU backend,
 * or null on platforms with no known mapping. Pure — safe to unit-test. */
export function realGpuLaunchArgs(platform = os.platform()) {
  switch (platform) {
    case 'darwin':
      return ['--use-gl=angle', '--use-angle=metal'];
    case 'win32':
      return ['--use-gl=angle', '--use-angle=d3d11'];
    case 'linux':
      return ['--use-gl=angle', '--use-angle=vulkan'];
    default:
      return null;
  }
}

/** Set the Chromium launch args for the shared browser. Must be called
 * before the first page opens; afterwards only a matching re-set is a no-op.
 * The setting survives closeGlDriver() (it is caller intent); what the live
 * browser actually launched with does not. */
export function setGlLaunchArgs(args) {
  const next = Array.isArray(args) && args.length ? [...args] : null;
  if (browser) {
    if (JSON.stringify(next) !== JSON.stringify(launchedArgs)) {
      throw new Error('[glDriver] launch args are frozen once the browser has launched');
    }
    return;
  }
  launchArgs = next;
}

/** The launch args currently in effect (test/inspection hook). */
export function glLaunchArgs() {
  return browser ? launchedArgs : launchArgs;
}
const atlasCache = new Map();

// Single page.evaluate arguments much past ~100MB never arrive ("Target page,
// context or browser has been closed"). Combo-heavy scenes bake 3000px+
// atlases whose base64 (+mipmaps) exceeds that, so large strings are ferried
// in 16MB pieces and reassembled in the page before the render call.
const XFER_PIECE = 16 * 1024 * 1024;

function splitLargeStrings(payload) {
  const chunks = new Map();
  const walk = (v) => {
    // >=, not >: a string of exactly one piece still rides the ferry store
    // instead of inline — b64Pieces below cuts atlas pieces to exactly
    // XFER_PIECE chars, and a payload of many such pieces inline would
    // recreate the giant single evaluate this ferry exists to avoid.
    if (typeof v === 'string' && v.length >= XFER_PIECE) {
      const key = `c${chunks.size}`;
      const pieces = [];
      for (let i = 0; i < v.length; i += XFER_PIECE) pieces.push(v.slice(i, i + XFER_PIECE));
      chunks.set(key, pieces);
      return { __chunk: key };
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, val] of Object.entries(v)) o[k] = walk(val);
      return o;
    }
    return v;
  };
  return { slim: walk(payload), chunks };
}

/** Call a harness-page function with a payload too large for one evaluate
 * argument, ferried in pieces and reassembled page-side. Exported for the
 * cost bench (#1578): a recipe's atlas payload is the same shape — and the
 * same size problem — as an export's. */
export async function evaluateChunked(pg, fnName, payload) {
  const { slim, chunks } = splitLargeStrings(payload);
  if (chunks.size === 0) {
    return pg.evaluate(([name, arg]) => window[name](arg), [fnName, slim]);
  }
  const ids = [];
  for (const [key, pieces] of chunks) {
    const id = `${fnName}:${key}`;
    ids.push([id, key]);
    await pg.evaluate(
      ([i]) => {
        (window.__kcXfer = window.__kcXfer || {})[i] = [];
      },
      [id],
    );
    for (const piece of pieces) {
      await pg.evaluate(
        ([i, pc]) => {
          window.__kcXfer[i].push(pc);
        },
        [id, piece],
      );
    }
  }
  try {
    return await pg.evaluate(
      ([name, arg, refs]) => {
        const store = window.__kcXfer || {};
        const byKey = Object.fromEntries(refs.map(([id, key]) => [key, id]));
        const walk = (v) => {
          if (Array.isArray(v)) return v.map(walk);
          if (v && typeof v === 'object') {
            if (typeof v.__chunk === 'string') return store[byKey[v.__chunk]].join('');
            const o = {};
            for (const [k, val] of Object.entries(v)) o[k] = walk(val);
            return o;
          }
          return v;
        };
        return window[name](walk(arg));
      },
      [fnName, slim, ids],
    );
  } finally {
    const idsOnly = ids.map(([id]) => id);
    await pg
      .evaluate((list) => {
        if (window.__kcXfer) for (const id of list) delete window.__kcXfer[id];
      }, idsOnly)
      .catch(() => {});
  }
}

async function ensurePage() {
  if (page) return page;
  server = http.createServer(glStaticHandler(GL_DIR));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    browser = launchArgs ? await chromium.launch({ args: [...launchArgs] }) : await chromium.launch();
    launchedArgs = launchArgs;
  } catch (e) {
    // Launch failed (e.g. no Playwright browser installed in CI): don't
    // leak the just-opened server or the caller's process hangs forever.
    await new Promise((resolve) => server.close(resolve));
    server = null;
    throw e;
  }
  page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/parity/glHarness.html`);
  await page.waitForFunction('window.__kcReady === true', null, { timeout: 30000 });
  return page;
}

export async function closeGlDriver() {
  try {
    await page?.close();
  } catch {
    /* noop */
  }
  try {
    await browser?.close();
  } catch {
    /* noop */
  }
  try {
    server?.close();
  } catch {
    /* noop */
  }
  page = browser = server = null;
  launchedArgs = null;
}

/**
 * Open a raw harness page (e.g. /parity/compositeProbe.html) for
 * shader-level tests. The shared server/browser are reused; each call
 * opens a fresh page the caller must close.
 *
 * @param {string} pagePath URL path under src/gl, e.g. '/parity/compositeProbe.html'
 * @returns {Promise<{page, port, close}>}
 */
export async function openHarnessPage(pagePath) {
  await ensurePage(); // boots the shared server + browser
  const port = server.address().port;
  const probe = await browser.newPage();
  await probe.goto(`http://127.0.0.1:${port}${pagePath}`);
  await probe.waitForFunction('window.__kcReady === true', null, { timeout: 30000 });
  return { page: probe, port, close: () => probe.close().catch(() => {}) };
}

function b64(buf) {
  return Buffer.from(buf).toString('base64');
}

// Atlas pixels cross to the page as an ARRAY of base64 pieces, never one
// string: with region cells baked (#1434), a whole-library atlas base64s
// past V8's ~512M-char string cap and Buffer#toString throws
// ERR_STRING_TOO_LONG before the ferry can slice it. Pieces are cut on a
// 3-byte boundary — 12MiB of bytes is exactly XFER_PIECE base64 chars with
// no padding except on the final piece — so each piece decodes
// independently and the page fills one preallocated buffer (b64ToU8 in
// glHarness.html) without ever joining them.
const B64_PIECE_BYTES = 12 * 1024 * 1024;
function b64Pieces(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length === 0) return [''];
  const pieces = [];
  for (let i = 0; i < b.length; i += B64_PIECE_BYTES) {
    pieces.push(b.subarray(i, i + B64_PIECE_BYTES).toString('base64'));
  }
  return pieces;
}

function getAtlas(combos, regionAssets = null) {
  // #1433: the cache key carries the region-cell demand — the same
  // combos rendered with and without region assignments need different
  // atlases (region cells exist only for assets the contract expands).
  const regionKey = regionAssets === null ? '*' : [...regionAssets].sort().join(',');
  const key = `${regionKey}#${combos
    .map((c) => comboKey(c.asset, c.ink, c.accent))
    .sort()
    .join('|')}`;
  let a = atlasCache.get(key);
  if (!a) {
    a = bakeAtlas(combos, { regionAssets });
    atlasCache.set(key, a);
  }
  return a;
}

// The assets a contract actually expands: its regionAnim assets, or
// none when there is no region state / the state is the collapse shed
// (the pack takes the single-quad path and reads no region cells).
function regionAssetsFor(contract) {
  return contract.regionAnim && !contract.regionAnim.shed
    ? new Set(Object.keys(contract.regionAnim.assets || {}))
    : new Set();
}

/**
 * Build the page payload for a scene contract (atlas + grain LUTs + wrap
 * boxes), shared by renderViaGL and the perf probe.
 */
export function buildRenderPayload(contract, { width = 400, height = 280, bg = '#0a0a0a', wet = null } = {}) {
  const combos = contract.instances.map((it) => ({ asset: it.asset, ink: it.tint, accent: it.accent }));
  const atlas = getAtlas(combos, regionAssetsFor(contract));
  const cells = {};
  for (const [k, v] of atlas.cells)
    cells[k] = { u0: v.u0, v0: v.v0, u1: v.u1, v1: v.v1, ...(v.geo ? { geo: v.geo } : {}) }; // #1433: region geometry rides through
  // #1079: grain is procedural — no LUT is baked or shipped.
  return {
    width,
    height,
    bg,
    wet, // #1815: the warmed field (wetExportPayload form) or null
    contract,
    cells,
    atlasB64: b64Pieces(atlas.pixels),
    atlasW: atlas.width,
    atlasH: atlas.height,
    atlasMips: atlas.mipmaps.map((m) => ({ b64: b64Pieces(m.pixels), w: m.width, h: m.height })),
  };
}

/**
 * Render an ACCUM trail still through WebGL (#190): each frame contract is
 * rendered in turn and fed through the shared ACCUM recipe (accum.mjs) in
 * the page. One atlas is baked from the union of asset combos across frames.
 *
 * @param {Array<object>} frameContracts scene contracts v1, one per frame
 * @param {object} opts { width, height, bg, fade, optics, tunnel, prism,
 *   ageBuffer: request the #1805 age buffer, dt: show-time seconds per step,
 *   stats: request the #1807 buffer statistics }
 * @returns {Promise<{pixels: Buffer, width: number, height: number,
 *   age: {data: Float32Array, width: number, height: number} | null,
 *   stats: {frame: number, energy: number, channels: number[], saturation: number} | null}>}
 *   top-first RGBA; age = the final age field when requested, else null;
 *   stats = the final stamped statistics when requested, else null.
 */
export async function renderAccumViaGL(
  frameContracts,
  {
    width = 400,
    height = 280,
    bg = '#0a0a0a',
    fade = 0.88,
    optics = 0,
    tunnel = 0,
    prism = 0,
    flow = 0,
    echoes = 0,
    scan = 0,
    scanDirection = 1,
    audio = null,
    swell = 1,
    palette = null, // #1803: swatch hex list; forwarded to renderAccumSequence
    ageBuffer = false, // #1805: forwarded to renderAccumSequence
    dt = 1 / 60, // #1805: show-time seconds per step
    stats = false, // #1807: forwarded to renderAccumSequence
    wet = null, // #1815: the warmed field (wetExportPayload form), forwarded to renderAccumSequence
  } = {},
) {
  if (!frameContracts.length) throw new Error('[gl] renderAccumViaGL: no frame contracts');
  const page = await ensurePage();
  const combos = [];
  const seen = new Set();
  for (const contract of frameContracts) {
    for (const it of contract.instances) {
      const key = comboKey(it.asset, it.tint, it.accent);
      if (!seen.has(key)) {
        seen.add(key);
        combos.push({ asset: it.asset, ink: it.tint, accent: it.accent });
      }
    }
  }
  const regionAssets = new Set();
  for (const contract of frameContracts) for (const id of regionAssetsFor(contract)) regionAssets.add(id);
  const atlas = getAtlas(combos, regionAssets);
  const cells = {};
  for (const [k, v] of atlas.cells)
    cells[k] = { u0: v.u0, v0: v.v0, u1: v.u1, v1: v.v1, ...(v.geo ? { geo: v.geo } : {}) }; // #1433: region geometry rides through
  // #1079: grain is procedural — no LUT is baked or shipped.
  const payload = {
    width,
    height,
    bg,
    fade,
    optics,
    tunnel,
    prism,
    flow,
    echoes,
    scan, // #1804: slit-scan amount, forwarded to renderAccumSequence
    scanDirection,
    audioFrames: audio,
    swell, // #306: audio→glow fader, forwarded to renderAccumSequence
    palette, // #1803: forwarded to renderAccumSequence (halation tint)
    ageBuffer, // #1805: forwarded to renderAccumSequence (age buffer)
    dt, // #1805: show-time seconds per step
    stats, // #1807: forwarded to renderAccumSequence (buffer statistics)
    wet, // #1815: forwarded to renderAccumSequence (warmed field, held)
    cells,
    atlasB64: b64Pieces(atlas.pixels),
    atlasW: atlas.width,
    atlasH: atlas.height,
    atlasMips: atlas.mipmaps.map((m) => ({ b64: b64Pieces(m.pixels), w: m.width, h: m.height })),
    frames: frameContracts.map((contract) => ({
      contract,
    })),
  };
  const res = await evaluateChunked(page, '__kcAccum', payload);
  // #1805: the age field crosses the page boundary as base64 of its
  // Float32 bytes; copy through a fresh buffer (Buffer pooling would
  // otherwise hand back a view over shared memory).
  let age = null;
  if (res.ageB64) {
    const raw = Buffer.from(res.ageB64, 'base64');
    const data = new Float32Array(raw.byteLength / 4);
    new Uint8Array(data.buffer).set(raw);
    age = { data, width: res.width, height: res.height };
  }
  return {
    pixels: Buffer.from(res.pixelsB64, 'base64'),
    width: res.width,
    height: res.height,
    age,
    stats: res.stats ?? null, // #1807: a plain object — no base64 ferry needed
  };
}

/**
 * Render a scene contract through WebGL.
 * @param {object} contract scene contract v1
 * @param {object} opts { width, height, bg }
 * @returns {Promise<{pixels: Buffer, width: number, height: number}>}
 */
/**
 * What the VISIBLE canvas shows for a contract, and what the readback returns for the same frame (both top-first RGBA).
 * They must match: a viewer sees what an export contains (parity probe, presentOrientation.selfcheck).
 */
export async function presentProbeViaGL(contract, opts = {}) {
  const page = await ensurePage();
  const res = await evaluateChunked(page, '__kcPresentProbe', buildRenderPayload(contract, opts));
  return {
    shown: Buffer.from(res.shownB64, 'base64'),
    readback: Buffer.from(res.readbackB64, 'base64'),
    width: res.width,
    height: res.height,
  };
}

export async function renderViaGL(contract, opts = {}) {
  const page = await ensurePage();
  const payload = buildRenderPayload(contract, opts);
  // #1806: opts.rawResolve renders in data space (raw premultiplied
  // clamp, no ACES/dither) for pixel-math proofs; see glHarness.html.
  if (opts.rawResolve) payload.rawResolve = true;
  const res = await evaluateChunked(page, '__kcRender', payload);
  return { pixels: Buffer.from(res.pixelsB64, 'base64'), width: res.width, height: res.height };
}

/**
 * Render ONLY the selected strata as an ACCUM input frame (#1806 slice 1):
 * the selected content/pattern strata's pre-FX light over transparent,
 * through the renderer's renderAccumInput seam. MATH/FX ids in layerIds
 * are ignored by the seam (they never feed).
 * @param {object} contract scene contract v1
 * @param {Iterable<string>} layerIds the strata that feed the buffer
 * @param {object} opts { width, height, bg }
 * @returns {Promise<{pixels: Buffer, width: number, height: number}>} top-first RGBA
 */
export async function renderAccumInputViaGL(contract, layerIds, opts = {}) {
  const page = await ensurePage();
  const payload = { ...buildRenderPayload(contract, opts), layerIds: [...(layerIds || [])] };
  if (opts.rawResolve) payload.rawResolve = true; // #1806: data-space proof renders (see renderViaGL)
  const res = await evaluateChunked(page, '__kcAccumInput', payload);
  return { pixels: Buffer.from(res.pixelsB64, 'base64'), width: res.width, height: res.height };
}

/**
 * Render a scene contract through WebGL with chunked readback (#191).
 *
 * Same pixels as renderViaGL, but the page returns them in 16MB base64
 * pieces instead of one giant string: an 8K readback (~177MB base64) would
 * not survive the ~100MB page.evaluate result limit that motivated the
 * chunked payload ferry above. The export entrypoint
 * (app/src/gl/exportStill.mjs) uses this; the parity path keeps renderViaGL.
 *
 * @param {object} contract scene contract v1
 * @param {object} opts { width, height, bg, wet } — wet is the #1815
 *   warmed field (wetExportPayload form) or null
 * @returns {Promise<{pixels: Buffer, width: number, height: number}>} top-first RGBA
 */
export async function renderExportViaGL(contract, opts = {}) {
  const page = await ensurePage();
  const { width, height, chunks } = await evaluateChunked(page, '__kcExportBegin', buildRenderPayload(contract, opts));
  try {
    const parts = new Array(chunks);
    for (let i = 0; i < chunks; i++) {
      const { pixelsB64 } = await page.evaluate(([idx]) => window.__kcExportChunk(idx), [i]);
      parts[i] = Buffer.from(pixelsB64, 'base64');
    }
    return { pixels: Buffer.concat(parts), width, height };
  } finally {
    // Release the page-side stash even on failure — an 8K buffer held
    // across exports is how a long batch leaks 132MB per edition.
    await page.evaluate(() => window.__kcExportEnd()).catch(() => {});
  }
}
