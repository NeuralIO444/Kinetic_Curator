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
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { bakeAtlas, bakeGrainLut, comboKey } from '../atlas.mjs';

const PARITY_DIR = path.dirname(fileURLToPath(import.meta.url));
const GL_DIR = path.join(PARITY_DIR, '..'); // serve src/gl; harness at /parity/glHarness.html

let server = null;
let browser = null;
let page = null;
const atlasCache = new Map();

const MIME = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript' };

// Single page.evaluate arguments much past ~100MB never arrive ("Target page,
// context or browser has been closed"). Combo-heavy scenes bake 3000px+
// atlases whose base64 (+mipmaps) exceeds that, so large strings are ferried
// in 16MB pieces and reassembled in the page before the render call.
const XFER_PIECE = 16 * 1024 * 1024;

function splitLargeStrings(payload) {
  const chunks = new Map();
  const walk = (v) => {
    if (typeof v === 'string' && v.length > XFER_PIECE) {
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

async function evaluateChunked(pg, fnName, payload) {
  const { slim, chunks } = splitLargeStrings(payload);
  if (chunks.size === 0) {
    return pg.evaluate(([name, arg]) => window[name](arg), [fnName, slim]);
  }
  const ids = [];
  for (const [key, pieces] of chunks) {
    const id = `${fnName}:${key}`;
    ids.push([id, key]);
    await pg.evaluate(([i]) => { (window.__kcXfer = window.__kcXfer || {})[i] = []; }, [id]);
    for (const piece of pieces) {
      await pg.evaluate(([i, pc]) => { window.__kcXfer[i].push(pc); }, [id, piece]);
    }
  }
  try {
    return await pg.evaluate(([name, arg, refs]) => {
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
    }, [fnName, slim, ids]);
  } finally {
    const idsOnly = ids.map(([id]) => id);
    await pg.evaluate((list) => {
      if (window.__kcXfer) for (const id of list) delete window.__kcXfer[id];
    }, idsOnly).catch(() => {});
  }
}

async function ensurePage() {
  if (page) return page;
  server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.normalize(path.join(GL_DIR, urlPath));
      if (!file.startsWith(GL_DIR)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('nf');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    browser = await chromium.launch();
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
  try { await page?.close(); } catch { /* noop */ }
  try { await browser?.close(); } catch { /* noop */ }
  try { server?.close(); } catch { /* noop */ }
  page = browser = server = null;
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

function b64(buf) { return Buffer.from(buf).toString('base64'); }

function getAtlas(combos) {
  const key = combos.map((c) => comboKey(c.asset, c.ink, c.accent)).sort().join('|');
  let a = atlasCache.get(key);
  if (!a) {
    a = bakeAtlas(combos);
    atlasCache.set(key, a);
  }
  return a;
}

/**
 * Build the page payload for a scene contract (atlas + grain LUTs + wrap
 * boxes), shared by renderViaGL and the perf probe.
 */
export function buildRenderPayload(contract, { width = 400, height = 280, bg = '#0a0a0a' } = {}) {
  const combos = contract.instances.map((it) => ({ asset: it.asset, ink: it.tint, accent: it.accent }));
  const atlas = getAtlas(combos);
  const cells = {};
  for (const [k, v] of atlas.cells) cells[k] = { u0: v.u0, v0: v.v0, u1: v.u1, v1: v.v1 };
  // One grain LUT per render: the reference turbulence is region-independent
  // (filter region only clips), so a single full-canvas bake serves every wrap.
  let lutB64 = null, lutW = 0, lutH = 0;
  const needsGrain = (contract.fxWraps || []).some((wrap) => {
    const layer = contract.layers.find((l) => l.id === wrap.fxLayerId);
    return layer?.fx?.some((f) => f.kind === 'grain');
  });
  if (needsGrain) {
    const lut = bakeGrainLut(width, height);
    lutB64 = b64(lut.pixels); lutW = lut.width; lutH = lut.height;
  }
  const grainLuts = {};
  for (const wrap of contract.fxWraps || []) {
    const layer = contract.layers.find((l) => l.id === wrap.fxLayerId);
    if (layer?.fx?.some((f) => f.kind === 'grain') && lutB64) {
      grainLuts[wrap.fxLayerId] = { b64: lutB64, w: lutW, h: lutH };
    }
  }
  return {
    width, height, bg, contract, cells,
    atlasB64: b64(atlas.pixels), atlasW: atlas.width, atlasH: atlas.height,
    atlasMips: atlas.mipmaps.map((m) => ({ b64: b64(m.pixels), w: m.width, h: m.height })),
    grainLuts,
  };
}

/**
 * Render an ACCUM trail still through WebGL (#190): each frame contract is
 * rendered in turn and fed through the shared ACCUM recipe (accum.mjs) in
 * the page. One atlas is baked from the union of asset combos across frames.
 *
 * @param {Array<object>} frameContracts scene contracts v1, one per frame
 * @param {object} opts { width, height, bg, fade, optics, tunnel, prism }
 * @returns {Promise<{pixels: Buffer, width: number, height: number}>} top-first RGBA
 */
export async function renderAccumViaGL(frameContracts, { width = 400, height = 280, bg = '#0a0a0a', fade = 0.88, optics = 0, tunnel = 0, prism = 0, flow = 0, echoes = 0, audio = null } = {}) {
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
  const atlas = getAtlas(combos);
  const cells = {};
  for (const [k, v] of atlas.cells) cells[k] = { u0: v.u0, v0: v.v0, u1: v.u1, v1: v.v1 };
  const needsGrain = frameContracts.some((contract) =>
    (contract.fxWraps || []).some((wrap) => {
      const layer = contract.layers.find((l) => l.id === wrap.fxLayerId);
      return layer?.fx?.some((f) => f.kind === 'grain');
    })
  );
  const grainLuts = {};
  if (needsGrain) {
    const lut = bakeGrainLut(width, height);
    for (const contract of frameContracts) {
      for (const wrap of contract.fxWraps || []) {
        const layer = contract.layers.find((l) => l.id === wrap.fxLayerId);
        if (layer?.fx?.some((f) => f.kind === 'grain') && !grainLuts[wrap.fxLayerId]) {
          grainLuts[wrap.fxLayerId] = { b64: b64(lut.pixels), w: lut.width, h: lut.height };
        }
      }
    }
  }
  const payload = {
    width, height, bg, fade, optics, tunnel, prism, flow, echoes,
    audioFrames: audio,
    cells,
    atlasB64: b64(atlas.pixels), atlasW: atlas.width, atlasH: atlas.height,
    atlasMips: atlas.mipmaps.map((m) => ({ b64: b64(m.pixels), w: m.width, h: m.height })),
    grainLuts,
    frames: frameContracts.map((contract) => ({
      contract,
    })),
  };
  const res = await evaluateChunked(page, '__kcAccum', payload);
  return { pixels: Buffer.from(res.pixelsB64, 'base64'), width: res.width, height: res.height };
}

/**
 * Render a scene contract through WebGL.
 * @param {object} contract scene contract v1
 * @param {object} opts { width, height, bg }
 * @returns {Promise<{pixels: Buffer, width: number, height: number}>}
 */
export async function renderViaGL(contract, opts = {}) {
  const page = await ensurePage();
  const res = await evaluateChunked(page, '__kcRender', buildRenderPayload(contract, opts));
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
 * @param {object} opts { width, height, bg }
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
