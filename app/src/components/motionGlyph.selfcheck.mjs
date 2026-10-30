import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { motionPose, motionReadout, motionUnit } from './motionGlyph.mjs';

test('#716 motion pose tracks the slider, not a clock', () => {
  assert.equal(motionUnit(0, 0, 1), 0);
  assert.equal(motionUnit(1, 0, 1), 1);
  assert.ok(motionPose('wind', 0, 0, 3).lean < motionPose('wind', 3, 0, 3).lean);
  assert.ok(motionPose('breath', 0, 0, 1).scale < motionPose('breath', 1, 0, 1).scale);
  assert.ok(motionPose('life', 0, 0, 1).drift < motionPose('life', 1, 0, 1).drift);
  assert.ok(motionPose('flap', 0, 0, 1).flap < motionPose('flap', 1, 0, 1).flap);
  assert.equal(motionReadout(0.35, 0.05), '0.35');
  assert.equal(motionReadout(1.2, 0.1), '1.2');
});

test('#716 the STIMULI life key wears the tile; the BUILD keys are mode rows since #1608', () => {
  const block = readFileSync(new URL('../panels/layout/HypeSliders.jsx', import.meta.url), 'utf8');
  const life = readFileSync(new URL('../panels/stimulus/ReactivityControls.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/controls.css', import.meta.url), 'utf8');
  // Re-pin (cause: #1608, Strata Q Phase 2) — flap / breath / wind are
  // stored BUILD params and the Phase 0 exemptions list never named the
  // tiles, so their BUILD form is the mode row like every neighbour.
  // The tile form survives where the DS detent amendment does not reach:
  // STIMULI's life key.
  assert.match(block, /label="FLAP"/, 'flap is a mode row in BUILD');
  for (const key of ['breath', 'wind']) {
    assert.match(block, new RegExp(`'${key.toUpperCase()}',\\s*'${key}'`), `${key} is a mode row in BUILD`);
  }
  assert.ok(!/<MotionTile/.test(block), 'no MotionTile remains in BUILD');
  assert.match(life, /kind="life"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.motion-label \{[^}]*text-transform:\s*lowercase/);
});
