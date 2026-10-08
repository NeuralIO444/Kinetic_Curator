// node src/components/paletteTasteFit.selfcheck.mjs
// #1123 — the taste-fit shimmer path exists but stays QUIET: no signal, no
// shimmer (KC-1 DS rule 3). Fit levels compress 0..1 into 4 capped levels.
import assert from 'node:assert';
import { paletteTasteFit, fitLevel } from './paletteTasteFit.mjs';

// Rule 3: without a real per-palette scorer there is no signal — always null,
// even when a taste object is handed in. Never fakes a fit.
assert.strictEqual(paletteTasteFit('sepia-plate', null), null, 'no taste → null');
assert.strictEqual(
  paletteTasteFit('sepia-plate', { head: { fidelity: 0.9 } }),
  null,
  'a taste object alone is not a palette signal → still null'
);

// Level mapping: 0 = quiet, 4 compressive levels capped dim
assert.strictEqual(fitLevel(null), 0, 'null fit → level 0 (quiet)');
assert.strictEqual(fitLevel(undefined), 0, 'undefined fit → level 0 (quiet)');
assert.strictEqual(fitLevel(0), 0, 'zero fit → level 0 (quiet)');
assert.strictEqual(fitLevel(0.2), 1, 'faint fit → level 1');
assert.strictEqual(fitLevel(0.35), 2, 'moderate fit → level 2');
assert.strictEqual(fitLevel(0.6), 3, 'strong fit → level 3');
assert.strictEqual(fitLevel(0.85), 4, 'standout fit → level 4');
assert.strictEqual(fitLevel(1.5), 4, 'over-1 clamps to level 4');
assert.strictEqual(fitLevel(-0.5), 0, 'negative clamps to quiet');

console.log('paletteTasteFit selfcheck: quiet-by-default, 4 levels — ok');
