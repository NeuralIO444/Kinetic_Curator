// node src/curator/curatePalette.selfcheck.mjs — #1365: refine never jumps the palette.
import assert from 'node:assert';
import { curatePaletteTarget } from './curatePalette.mjs';
import { PHASE_EXPLORE, PHASE_REFINE } from './phase.js';
import { getRenderProfile } from './renderProfiles.js';

const davis = getRenderProfile('davis');
assert.ok(davis && davis.paletteId, 'fixture: the davis render profile has a palette');

// REFINE keeps whatever palette is live — a chosen one, an edited one, or the persona's own.
assert.strictEqual(curatePaletteTarget({ phase: PHASE_REFINE, profile: davis, paletteId: 'my-picked-palette' }), null,
  'refine keeps a palette the artist chose');
assert.strictEqual(curatePaletteTarget({ phase: PHASE_REFINE, profile: davis, paletteId: davis.paletteId }), null);
assert.strictEqual(curatePaletteTarget({ phase: PHASE_REFINE, profile: davis, paletteId: null }), null,
  'refine never switches, even with no palette set');

// EXPLORE and no phase: unchanged behaviour — the persona brings its palette.
assert.strictEqual(curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: 'my-picked-palette' }), davis.paletteId);
assert.strictEqual(curatePaletteTarget({ phase: null, profile: davis, paletteId: 'my-picked-palette' }), davis.paletteId,
  'no phase yet = yesterday exactly');

// Already on the persona palette: no switch (no override wipe, no undo entry).
assert.strictEqual(curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: davis.paletteId }), null);

// Voice "off" (no profile) never touches the palette, in any phase.
for (const phase of [null, PHASE_EXPLORE, PHASE_REFINE]) {
  assert.strictEqual(curatePaletteTarget({ phase, profile: null, paletteId: 'x' }), null);
  assert.strictEqual(curatePaletteTarget({ phase, profile: undefined, paletteId: 'x' }), null);
  assert.strictEqual(curatePaletteTarget({ phase, profile: {}, paletteId: 'x' }), null, 'a profile with no palette is no palette');
}

console.log('curatePalette.selfcheck: ok (#1365 refine keeps the palette)');
