// node src/gl/parity/instanceStreams.ab.mjs — #2183 WS4: the A/B pixel proof.
// Renders every corpus scene through the real WebGL2 renderer in headless Chromium with the split-stream instance
// upload OFF (legacy whole-array) and ON, twice (the second ON render exercises the dirty-range path against a
// populated shadow), and requires byte-identical pixels. Also renders a re-seeded variant of each scene ON after the
// first, so the static stream changes under a live shadow. Not in selfcheck.manifest (needs a browser); run by hand.
import assert from 'node:assert/strict';
import { CORPUS } from './corpus.mjs';
import { openHarnessPage, buildRenderPayload, evaluateChunked, closeGlDriver } from './glDriver.mjs';
import { buildSceneContract } from '../sceneContract.js';
import { resolveLayers, whenSwarmWasmReady } from '../../../../studio/render.mjs';
import { getRenderCaps } from '../../data/quality.js';

const W = 400;
const H = Math.round((W * 700) / 1000);
const contractOf = (doc) => {
  const caps = getRenderCaps(doc.quality || 'balanced', false);
  const resolvedLayers = resolveLayers(doc, { caps });
  return {
    contract: buildSceneContract({ doc, resolvedLayers, caps }),
    bg: resolvedLayers[0]?.palette?.bg || '#000000',
  };
};

await whenSwarmWasmReady();
const { page, close } = await openHarnessPage('/parity/glHarness.html');
const render = async (contract, bg, on) => {
  await page.evaluate((v) => {
    window.__kcInstanceStreams = { on: v };
  }, on);
  const res = await evaluateChunked(page, '__kcRender', buildRenderPayload(contract, { width: W, height: H, bg }));
  return Buffer.from(res.pixelsB64, 'base64');
};

let checked = 0;
let streamedScenes = 0;
for (const scene of CORPUS) {
  const a = contractOf(scene.doc);
  const legacy = await render(a.contract, a.bg, false);
  await page.evaluate(() => window.__uploadMeter.reset());
  const on1 = await render(a.contract, a.bg, true);
  const on2 = await render(a.contract, a.bg, true);
  const m = await page.evaluate(() => window.__uploadMeter.snapshot());
  // A scene whose draws are all under STREAM_MIN_ITEMS (many small blend batches) stays on the legacy path: lawful.
  if (m.streamBytes > 0) {
    streamedScenes++;
    assert.ok(
      m.streamBytes < m.uploadedBytes,
      `${scene.id}: streamed upload (${m.streamBytes} B) not under legacy (${m.uploadedBytes} B)`,
    );
  }
  assert.ok(legacy.equals(on1), `${scene.id}: first streamed render differs from legacy`);
  assert.ok(legacy.equals(on2), `${scene.id}: second (dirty-range) streamed render differs from legacy`);
  const b = contractOf({ ...scene.doc, seed: (scene.doc.seed | 0) + 17 });
  const legacyB = await render(b.contract, b.bg, false);
  const onB = await render(b.contract, b.bg, true); // static stream changes under the populated shadow
  assert.ok(legacyB.equals(onB), `${scene.id}: re-seeded streamed render differs from legacy`);
  checked += 4;
  console.log(
    `  [ok] ${scene.id}: ${a.contract.instances.length} instances — legacy == streamed (x4); upload ${m.streamBytes}/${m.uploadedBytes} B`,
  );
}
assert.ok(streamedScenes >= 4, `only ${streamedScenes} scenes exercised the streamed path`);
await close();
await closeGlDriver();
console.log(`instanceStreams A/B: OK — ${checked} pixel-identical comparisons over ${CORPUS.length} scenes`);
