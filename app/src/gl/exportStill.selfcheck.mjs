/**
 * exportStill.selfcheck.mjs — Phase 5 (#191).
 *
 * - parseRes unit tests (WxH, scale factor, 4k/8k shorthand, rejections).
 * - PNG writer round-trip (signature, IHDR dims, inflated rows match input).
 * - isBrowserMissingError classification.
 * - #191 acceptance: applyUncapped / restoreFromSnapshot are gone from the
 *   app export path (PipelinePanel.jsx, useMediaExport.js).
 * - #176's before/after rule: renderExport at 1x is pixel-identical to the
 *   parity candidate (same shared render function, only the size differs),
 *   and renderExportViaGL (chunked readback) matches renderViaGL
 *   bit-for-bit. Skips explicitly when headless Chromium is absent.
 *
 * Run: cd app && node src/gl/exportStill.selfcheck.mjs
 */
import { readFileSync, unlinkSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRes, renderExport, isBrowserMissingError } from './exportStill.mjs';
import { writePngFile } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, '..', '..');

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`  ${cond ? 'ok' : 'FAIL'} ${name}${extra && cond ? '' : ` — ${extra}`}`);
  if (!cond) failures++;
}

// ── parseRes ─────────────────────────────────────────────────────────────
check('parseRes WxH', JSON.stringify(parseRes('3840x2160')) === JSON.stringify({ w: 3840, h: 2160 }));
check('parseRes scale', JSON.stringify(parseRes('2')) === JSON.stringify({ w: 2000, h: 1400 }));
check('parseRes 4k', JSON.stringify(parseRes('4k')) === JSON.stringify({ w: 3840, h: 2688 }));
check('parseRes 8k', JSON.stringify(parseRes('8k')) === JSON.stringify({ w: 7680, h: 5376 }));
for (const bad of ['0x100', '100x0', 'nope', '-2', '99999x99999', '20000x100']) {
  let threw = false;
  try { parseRes(bad); } catch { threw = true; }
  check(`parseRes rejects ${bad}`, threw);
}

// ── isBrowserMissingError ────────────────────────────────────────────────
check('classifies missing browser',
  isBrowserMissingError(new Error("Executable doesn't exist at /root/.cache/ms-playwright/chromium-1181/chrome-linux/chrome")));
check('ignores other errors', !isBrowserMissingError(new Error('WebGL2 not available')));

// ── PNG round-trip ───────────────────────────────────────────────────────
function parsePng(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('bad PNG signature');
  const chunks = {};
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    (chunks[type] = chunks[type] || []).push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  return chunks;
}

{
  const w = 5, h = 3;
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[i] = (x * 51) & 0xff; px[i + 1] = (y * 127) & 0xff;
      px[i + 2] = ((x + y) * 37) & 0xff; px[i + 3] = (x === 4 && y === 2) ? 0 : 255;
    }
  }
  const tmp = path.join(HERE, '.exportStill-selfcheck.png');
  await writePngFile(tmp, px, w, h);
  const chunks = parsePng(readFileSync(tmp));
  const ihdr = chunks.IHDR[0];
  check('png IHDR dims', ihdr.readUInt32BE(0) === w && ihdr.readUInt32BE(4) === h);
  check('png 8-bit RGBA', ihdr[8] === 8 && ihdr[9] === 6);
  const raw = inflateSync(Buffer.concat(chunks.IDAT));
  let rowsOk = raw.length === (w * 4 + 1) * h;
  for (let y = 0; rowsOk && y < h; y++) {
    const off = y * (w * 4 + 1);
    rowsOk = raw[off] === 0 && raw.subarray(off + 1, off + 1 + w * 4).equals(px.subarray(y * w * 4, (y + 1) * w * 4));
  }
  check('png rows round-trip', rowsOk);
  check('png IEND present', (chunks.IEND || []).length === 1);
  let rejected = false;
  try { await writePngFile(tmp, Buffer.alloc(10), w, h); } catch { rejected = true; }
  check('png rejects short buffer', rejected);
  unlinkSync(tmp);
}

// ── flip-then-restore is gone (#191 acceptance) ──────────────────────────
for (const rel of ['src/hooks/useMediaExport.js', 'src/panels/PipelinePanel.jsx']) {
  const src = readFileSync(path.join(APP, rel), 'utf8');
  check(`${rel}: no applyUncapped`, !src.includes('applyUncapped'));
  check(`${rel}: no restoreFromSnapshot`, !src.includes('restoreFromSnapshot'));
}

// ── #168: FINAL export is off-store, caps hold, materials disclosed ──────
{
  const { getScene } = await import('./parity/corpus.mjs');
  const { resolveLayers } = await import('../../../studio/render.mjs');
  const { buildSceneContract, warnUnsupportedMaterials } =
    await import('./sceneContract.js');
  const { getRenderCaps, QUALITY_PRESETS, FINAL_CAPS } =
    await import('../data/quality.js');

  const scene = getScene('single-basic');

  // The shared recipe must not mutate the project doc it reads (#168:
  // FINAL export is off-store — the input doc is the only shared state).
  const doc = scene.doc;
  const before = JSON.stringify(doc);
  const capsLive = getRenderCaps(doc.quality || 'balanced', false);
  const rl = resolveLayers(doc, { caps: capsLive });
  buildSceneContract({ doc, resolvedLayers: rl, caps: capsLive });
  check('export recipe does not mutate the project doc',
    JSON.stringify(doc) === before);

  // Export drivers never touch the live zustand store — all inputs are
  // explicit arguments (doc, seed, width, height).
  for (const rel of ['src/gl/exportStill.mjs', 'src/gl/accumStill.mjs']) {
    const src = readFileSync(path.join(APP, rel), 'utf8');
    check(`${rel}: no store import`, !src.includes('state/store') && !src.includes('AppContext'));
  }

  // Caps hold on export: HIGH never renders more than its ceiling, even at
  // print sizes (#168 "so HIGH does not turn to mud"). Deep-clone: the
  // corpus scenes are module-shared and the browser section below renders
  // 'single-basic' at its authored count.
  const big = JSON.parse(JSON.stringify(getScene('single-basic').doc));
  big.layoutParams = { ...big.layoutParams, count: 5000 };
  big.quality = 'high';
  const highCaps = getRenderCaps('high', false);
  check('HIGH caps resolve', highCaps === QUALITY_PRESETS.high);
  const rlHigh = resolveLayers(big, { caps: highCaps });
  check('HIGH clamps count to ceiling',
    rlHigh.every((L) => L.safeCount === QUALITY_PRESETS.high.maxCount),
    rlHigh.map((L) => L.safeCount).join(','));
  check('uncapped resolves FINAL_CAPS',
    getRenderCaps('high', true) === FINAL_CAPS);

  // Materials honesty (#168): non-flat material on wing items warns once;
  // flat or no wings stays silent.
  const warned = [];
  const origWarn = console.warn;
  console.warn = (m) => warned.push(String(m));
  try {
    warnUnsupportedMaterials([{ layoutParams: { material: 'plate' }, items: [{ role: 'wing' }] }]);
    check('material warning fires', warned.length === 1 && warned[0].includes('"plate"'));
    warnUnsupportedMaterials([{ layoutParams: { material: 'plate' }, items: [{ role: 'wing' }] }]);
    check('material warning fires once', warned.length === 1);
    warnUnsupportedMaterials([{ layoutParams: { material: 'flat' }, items: [{ role: 'wing' }] }]);
    warnUnsupportedMaterials([{ layoutParams: { material: 'wash' }, items: [{ role: 'body' }] }]);
    check('flat / no-wing materials stay silent', warned.length === 1);
  } finally {
    console.warn = origWarn;
  }
}

// ── #176's rule: 1x export ≡ live preview render ─────────────────────────
// renderExport shares the exact scene→contract→GL path with the parity
// candidate (candidate.mjs); the resolution is the only difference. Both
// must be bit-identical, and the chunked readback must match renderViaGL.
try {
  const { getScene } = await import('./parity/corpus.mjs');
  const { renderCandidate, closeCandidate } = await import('./candidate.mjs');
  const { renderViaGL, renderExportViaGL, closeGlDriver } =
    await import('./parity/glDriver.mjs');
  const { buildSceneContract } = await import('./sceneContract.js');
  const { resolveLayers } = await import('../../../studio/render.mjs');
  const { getRenderCaps } = await import('../data/quality.js');

  const scene = getScene('single-basic');
  const doc = scene.doc;
  const W = 200, H = 140;

  const viaExport = await renderExport({ doc, width: W, height: H });
  const viaCandidate = await renderCandidate({ doc }, { width: W });
  check('export 1x dims', viaExport.width === W && viaExport.height === H);
  check('export ≡ candidate (shared render fn, #176 rule)',
    viaExport.pixels.equals(viaCandidate.pixels),
    `bytes differ`);

  // Chunked readback vs the single-shot path, same contract.
  const caps = getRenderCaps(doc.quality || 'balanced', false);
  const resolvedLayers = resolveLayers(doc, { caps });
  const contract = buildSceneContract({ doc, resolvedLayers, caps });
  const bg = resolvedLayers[0]?.palette?.bg || '#000000';
  const a = await renderExportViaGL(contract, { width: W, height: H, bg });
  const b = await renderViaGL(contract, { width: W, height: H, bg });
  check('chunked readback ≡ renderViaGL', a.pixels.equals(b.pixels));

  // Uncapped renders without touching anything live: FINAL_CAPS path works.
  const uncapped = await renderExport({ doc, width: W, height: H, uncapped: true });
  check('uncapped export renders', uncapped.pixels.length === W * H * 4);

  await closeCandidate();
  await closeGlDriver();
} catch (e) {
  if (/Executable doesn't exist/.test(e.message || '')) {
    console.log('  SKIP browser render checks: headless Chromium not installed');
  } else {
    throw e;
  }
}

if (failures) {
  console.error(`[exportStill.selfcheck] ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('[exportStill.selfcheck] all checks passed');
