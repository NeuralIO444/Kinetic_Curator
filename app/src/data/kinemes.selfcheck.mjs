// kinemes.selfcheck.mjs — #705 micro-HUD defaults.
//
// The six micro-HUD ornaments that move out of the box, and the phase
// decorrelation that keeps copies from moving in lockstep.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  KINEMES, getKineme, sanitizeAssetKineme, kinemePhase, DEFAULT_ASSET_KINEME,
} from './kinemes.js';

test('#705 six micro-HUD defaults, all real library kinemes', () => {
  assert.deepStrictEqual(DEFAULT_ASSET_KINEME, {
    mic_dotgrid_5: 'pulse',
    mic_dotgrid_3: 'pulse',
    mic_plus: 'pulse',
    mic_crosshair: 'blink',
    mic_target: 'blink',
    mic_arrow: 'rock',
  });
  for (const kid of Object.values(DEFAULT_ASSET_KINEME)) {
    assert.ok(getKineme(kid), `${kid} is a real library kineme`);
  }
  assert.ok(Object.isFrozen(DEFAULT_ASSET_KINEME), 'defaults are frozen');
});

test('#705 library unchanged by the defaults', () => {
  assert.deepStrictEqual(KINEMES.map((k) => k.id), ['spin', 'rock', 'pulse', 'blink', 'bob']);
});

test('#705 phases decorrelate copies of one asset', () => {
  const phases = new Set(Array.from({ length: 20 }, (_, i) => kinemePhase(7, `copy-${i}`)));
  assert.ok(phases.size >= 15, `copies get different phases (got ${phases.size})`);
  assert.strictEqual(kinemePhase(7, 'copy-0'), kinemePhase(7, 'copy-0'), 'deterministic');
});

test('#705 sanitize still drops unknown kineme ids', () => {
  assert.deepStrictEqual(
    sanitizeAssetKineme({ ...DEFAULT_ASSET_KINEME, junk: 'nope' }),
    DEFAULT_ASSET_KINEME,
  );
});
