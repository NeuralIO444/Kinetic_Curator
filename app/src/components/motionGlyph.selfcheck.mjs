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

test('#716 the four motion keys wear the tile', () => {
  const block = readFileSync(new URL('../panels/layout/ParamBlock.jsx', import.meta.url), 'utf8');
  const life = readFileSync(new URL('../panels/stimulus/ReactivityControls.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/controls.css', import.meta.url), 'utf8');
  for (const kind of ['wind', 'breath', 'flap']) assert.match(block, new RegExp(`kind="${kind}"`));
  assert.match(life, /kind="life"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.motion-label \{[^}]*text-transform:\s*lowercase/);
});
