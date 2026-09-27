// node src/data/chiaroscuro.selfcheck.mjs — #704, the chiaroscuro render mode.
//
// The mode is a LOOK, and a look assembled from three separate axes (#555):
// the CHIAROSCURO palette (colour), the CHIAROSCURO preset (layout), and a
// crystalline shape pool. These assert the properties that make it that look,
// so a later tuning pass cannot quietly turn it into another bright preset.
import assert from 'node:assert';
import { COMPOSITION_PRESETS, getPreset } from './presets.js';
import { PALETTES } from './palettes.js';
import { normalizeLayoutParams, DEFAULT_LAYOUT_PARAMS } from './layout-modes.js';

const cs = getPreset('chiaroscuro');
assert.ok(cs, 'the chiaroscuro preset must exist');

// PAIRED — same id as the palette, the convention the Rendah pack set.
assert.ok(PALETTES.some((p) => p.id === 'chiaroscuro'),
  'the preset must pair with a same-id palette');

// SPARSE — the sparsest preset in the set. Chiaroscuro is mostly dark; a high
// count tiles the plate and leaves no dark to carve the light out of.
{
  const counts = COMPOSITION_PRESETS
    .filter((p) => p.id !== 'chiaroscuro' && Number.isFinite(p.params?.count))
    .map((p) => p.params.count);
  assert.ok(cs.params.count < Math.min(...counts),
    `chiaroscuro must be the sparsest preset (${cs.params.count} vs min ${Math.min(...counts)})`);
}

// LARGE — the biggest shapes in the set, at both ends of the range.
{
  const tops = COMPOSITION_PRESETS
    .filter((p) => p.id !== 'chiaroscuro' && Array.isArray(p.params?.scale))
    .map((p) => p.params.scale[1]);
  assert.ok(cs.params.scale[1] >= Math.max(...tops),
    `chiaroscuro facets must be the largest (${cs.params.scale[1]} vs max ${Math.max(...tops)})`);
  assert.ok(cs.params.scale[0] > 1, 'even the smallest facet is large');
}

// SLOW-DRIFTING — the calmest in the set on both motion knobs.
{
  const speeds = COMPOSITION_PRESETS
    .filter((p) => p.id !== 'chiaroscuro' && Number.isFinite(p.params?.noiseSpeed))
    .map((p) => p.params.noiseSpeed);
  assert.ok(cs.params.noiseSpeed <= Math.min(...speeds),
    `chiaroscuro must drift slowest (${cs.params.noiseSpeed})`);
  assert.ok(cs.params.lifeDrift <= 0.15, 'chiaroscuro barely breathes');
}

// THE DARK GROUND IS LOAD-BEARING — `screen` lifts every overlap toward white
// and would erase it, so facets occlude rather than glow through each other.
assert.strictEqual(cs.params.blendMode, 'normal',
  'a screen blend would destroy the dark ground this mode is built on');

// FACETS — the asset steer is crystalline, per #704 item 2.
assert.ok(cs.categories.includes('crystalline'), 'chiaroscuro paints with faceted shapes');

// A long accumulation wake: slow drift is only legible if it leaves a trail.
assert.ok(cs.params.accumulation === true && cs.params.accumulationFade >= 10,
  'the slow drift needs a wake to read as movement');
// …but NOT at the glow maximum. Measured on the real canvas, max glow blows
// this plate out to a near-white bloom (mean luminance 0.24, 15% of the frame
// above 0.75) and the dark ground the whole mode is built on disappears. Every
// parameter assertion above passed while that was true — which is why the
// rendered result is pinned separately, in the QA scenario.
assert.ok(cs.params.accumulationOptics <= 0.15,
  `glow ${cs.params.accumulationOptics} blows out the dark ground`);

// Every param must survive the firewall unchanged — a preset that gets clamped
// on apply is not the preset anyone authored.
{
  const applied = normalizeLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, ...cs.params });
  for (const [k, v] of Object.entries(cs.params)) {
    assert.deepStrictEqual(applied[k], v, `preset param ${k} must survive normalization`);
  }
}

// FLAT STAYS THE DEFAULT — stepping into chiaroscuro must be a deliberate
// press, never the boot state (#704 acceptance).
assert.notStrictEqual(DEFAULT_LAYOUT_PARAMS.composition, 'chiaroscuro');
assert.ok(DEFAULT_LAYOUT_PARAMS.count > cs.params.count,
  'the default plate is denser than chiaroscuro — the mode is somewhere you go');

console.log('chiaroscuro.selfcheck: OK');
