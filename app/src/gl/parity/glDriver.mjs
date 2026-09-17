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

/** Transform a point by an instance transform (canvas units). */
function xform(x, y, it) {
  const sx = (x - 50) * it.scaleX, sy = (y - 50) * it.scaleY;
  const th = it.rotation * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  return [it.x + sx * c - sy * s, it.y + sx * s + sy * c];
}

/**
 * Union of transformed ink bboxes per fx-wrap (SVG objectBoundingBox region).
 * @returns {Record<string, [x0,y0,x1,y1]|null>}
 */
export function computeWrapBoxes(contract, cells) {
  const boxes = {};
  for (const wrap of contract.fxWraps || []) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const lid of wrap.contentLayerIds || []) {
      const layer = contract.layers.find((l) => l.id === lid);
      for (const it of layer?.instances || []) {
        const cell = cells.get(comboKey(it.asset, it.tint, it.accent));
        const ink = cell?.ink || [0, 0, 100, 100];
        for (const [px, py] of [[ink[0], ink[1]], [ink[2], ink[1]], [ink[0], ink[3]], [ink[2], ink[3]]]) {
          const [wx, wy] = xform(px, py, it);
          if (wx < x0) x0 = wx; if (wx > x1) x1 = wx;
          if (wy < y0) y0 = wy; if (wy > y1) y1 = wy;
        }
      }
    }
    boxes[wrap.fxLayerId] = x1 >= x0 ? [x0, y0, x1, y1] : null;
  }
  return boxes;
}

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
  const wrapBoxes = computeWrapBoxes(contract, atlas.cells);
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
    width, height, bg, contract, cells, wrapBoxes,
    atlasB64: b64(atlas.pixels), atlasW: atlas.width, atlasH: atlas.height,
    atlasMips: atlas.mipmaps.map((m) => ({ b64: b64(m.pixels), w: m.width, h: m.height })),
    grainLuts,
  };
}

/**
 * Render a scene contract through WebGL.
 * @param {object} contract scene contract v1
 * @param {object} opts { width, height, bg }
 * @returns {Promise<{pixels: Buffer, width: number, height: number}>}
 */
export async function renderViaGL(contract, opts = {}) {
  const page = await ensurePage();
  const res = await page.evaluate((p) => window.__kcRender(p), buildRenderPayload(contract, opts));
  return { pixels: Buffer.from(res.pixelsB64, 'base64'), width: res.width, height: res.height };
}
