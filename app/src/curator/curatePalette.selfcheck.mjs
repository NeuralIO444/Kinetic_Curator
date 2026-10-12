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

// ── #1365 Q1 (Matt, 2026-10-12): explore brings the voice's palette only until the ARTIST picks or edits one ──────
assert.strictEqual(curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: 'my-pick', artistChose: true }), null,
  'explore leaves a palette the artist picked alone');
assert.strictEqual(curatePaletteTarget({ phase: null, profile: davis, paletteId: 'my-pick', artistChose: true }), null, 'before any phase too');
assert.strictEqual(curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: 'whatever', artistChose: false }), davis.paletteId,
  'not chosen: the voice brings its palette, as before');
assert.strictEqual(curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: 'whatever' }), davis.paletteId, 'absent flag = not chosen');

// the flag itself: set only on the artist's dispatch path, cleared when a roll or a load replaces the palette
{
  const { readFileSync } = await import('node:fs');
  const { useStore } = await import('../state/store.js');
  const S = () => useStore.getState();
  assert.strictEqual(S().paletteChosen, false, 'a fresh session: not chosen');
  S().setPaletteId('praystation');
  assert.strictEqual(S().paletteChosen, false, 'the store action alone (CURATOR\'s path) never marks it');
  S().markPaletteChosen();
  assert.strictEqual(S().paletteChosen, true);
  S().kineticRoll();
  assert.strictEqual(S().paletteChosen, false, 'a KINETIC roll replaces the palette: no longer the artist\'s');
  for (const pass of ['kineticRulesPass', 'kineticWeatherPass']) {
    S().markPaletteChosen(); S()[pass]();
    assert.strictEqual(S().paletteChosen, false, `${pass} clears it too`);
  }
  S().markPaletteChosen();
  S().applyProject({ seed: 9, paletteId: 'praystation', layoutParams: {} });
  assert.strictEqual(S().paletteChosen, false, 'a loaded project\'s palette is the document\'s');

  const ctx = readFileSync(new URL('../state/AppContext.jsx', import.meta.url), 'utf8');
  for (const t of ['SET_PALETTE_ID', 'SET_PALETTE_SWATCH', 'SET_PALETTE_BG', 'SET_PALETTE_INK', 'CLEAR_PALETTE_OVERRIDES', 'APPLY_HARMONY']) {
    assert.match(ctx, new RegExp(`case A\\.${t}: store\\.markPaletteChosen\\(\\); return `), `the artist's ${t} marks the palette chosen`);
  }
  const bar = readFileSync(new URL('../panels/layout/CuratorBar.jsx', import.meta.url), 'utf8');
  assert.match(bar, /artistChose: !!st\.paletteChosen/, 'CURATOR reads the flag');
  assert.doesNotMatch(bar, /markPaletteChosen/, 'CURATOR never marks it');
}

console.log('curatePalette.selfcheck: ok (#1365 refine keeps the palette; explore keeps a palette the artist chose)');
