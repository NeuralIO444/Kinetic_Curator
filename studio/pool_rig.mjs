#!/usr/bin/env node
// studio/pool_rig.mjs — #762: a synthetic test rig for the taste model's PASS pool.
//
//   node studio/pool_rig.mjs --count 480 --seed 7 --out DIR [--width 1000] [--prefix syn]
//   (run several in parallel with different --seed and --prefix into one DIR: each writes DIR/<prefix>-features.json)
//
// The old pass pool was one base project with a new seed each time: 200 renders sharing a mode, a palette and a
// behaviour, so the distilled head could learn nothing and the probe separated keeps from it trivially.
// This rolls the WHOLE scene with the instrument's own chaos roll (mode, palette, behaviour, symmetry, blends, fx,
// and the rare pattern layer), headless, from a seeded stream, renders each through the GL candidate path, and writes
//   DIR/<prefix>-0001.png ...      the pictures
//   DIR/<prefix>-features.json     { "<prefix>-0001.png": recipeFeatures(...) }   at the app's CURRENT feature version
//   DIR/<prefix>-recipes.json      the documents, so any render can be reproduced
// Deterministic: same --seed and --count give the same recipes.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const COUNT = parseInt(arg('count', '480'), 10); const SEED = parseInt(arg('seed', '7'), 10);
const DRY = process.argv.includes('--dry'); // roll and describe the recipes, render nothing (the selfcheck, and a quick look at the spread)
const OUT = arg('out', 'pool-rig'); const WIDTH = parseInt(arg('width', '1000'), 10); const PREFIX = arg('prefix', 'syn');

// a seeded Math.random: the rolls are replayable
let a = SEED >>> 0;
Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { useStore } = await import('../app/src/state/store.js');
const { serializeProject } = await import('../app/src/state/projectDocument.js');
const { recipeFeatures } = await import('../app/src/curator/recipeFeatures.js');
const { DEFAULT_LAYOUT_PARAMS } = await import('../app/src/data/layout-modes.js');
const { renderCandidate, closeCandidate } = DRY ? { renderCandidate: null, closeCandidate: async () => {} } : await import('../app/src/gl/candidate.mjs');

function png(width, height, rgba) { // minimal RGBA PNG encoder (filter 0)
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]); };
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(OUT, { recursive: true });
const kc = (i) => ({ id: `kc${i}`, name: `KC-${i + 1}`, type: 'content', visible: true, layerBlendMode: 'normal', layerOpacity: 1, patch: { mode: 'off', to: null, strength: 0.16 } });
const features = {}; const recipes = {}; const t0 = Date.now();
for (let i = 1; i <= COUNT; i++) {
  useStore.setState({
    layers: [kc(0)], activeLayerId: 'kc0', layerSnapshots: {}, lockedParams: {}, armedMode: null, armedMotion: null, historyUndoStack: [], historyRedoStack: [],
    layoutParams: { ...DEFAULT_LAYOUT_PARAMS }, seed: Math.floor(Math.random() * 0xffffffff) >>> 0, paletteId: 'praystation', paletteOverrides: null,
  });
  // alternate the two live verbs so the pool spans what each deals: a full chaos roll, and a calm rules pass on top
  useStore.getState().kineticRoll();
  if (i % 3 === 0) useStore.getState().kineticRulesPass();
  const s = useStore.getState();
  const doc = serializeProject(s);
  const name = `${PREFIX}-${String(i).padStart(4, '0')}.png`;
  if (!DRY) {
    const r = await renderCandidate({ doc }, { width: WIDTH });
    writeFileSync(join(OUT, name), png(r.width, r.height, new Uint8Array(r.pixels.buffer, r.pixels.byteOffset, r.pixels.byteLength)));
  }
  const enabled = s.enabledAssets ? Object.keys(s.enabledAssets).filter((k) => s.enabledAssets[k]) : null;
  features[name] = recipeFeatures({ layoutParams: s.layoutParams, paletteId: s.paletteId, assets: enabled });
  recipes[name] = doc;
  if (i % 40 === 0) console.log(`  ${i}/${COUNT} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
writeFileSync(join(OUT, `${PREFIX}-features.json`), JSON.stringify(features));
writeFileSync(join(OUT, `${PREFIX}-recipes.json`), JSON.stringify(recipes));
await closeCandidate();
console.log(`rig: ${COUNT} varied ${DRY ? 'recipes (dry run, nothing rendered)' : 'renders'} -> ${OUT}`);
