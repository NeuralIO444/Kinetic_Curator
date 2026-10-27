// node src/curator/curatePalette.selfcheck.mjs — #1365: refine never jumps the palette.
import assert from 'node:assert';
import { curatePaletteTarget } from './curatePalette.mjs';
import { PHASE_EXPLORE, PHASE_REFINE } from './phase.js';
import { getRenderProfile } from './renderProfiles.js';
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins (#1684): whitespace and trailing commas are Prettier's, not the code's
const fre = (re) => new RegExp(re.source.replace(/\\s[*+?]?/g, '').replace(/ /g, ''), re.flags); // the same pin as a layout-blind pattern

const davis = getRenderProfile('davis');
assert.ok(davis && davis.paletteId, 'fixture: the davis render profile has a palette');

// REFINE keeps whatever palette is live — a chosen one, an edited one, or the persona's own.
assert.strictEqual(
  curatePaletteTarget({ phase: PHASE_REFINE, profile: davis, paletteId: 'my-picked-palette' }),
  null,
  'refine keeps a palette the artist chose',
);
assert.strictEqual(curatePaletteTarget({ phase: PHASE_REFINE, profile: davis, paletteId: davis.paletteId }), null);
assert.strictEqual(
  curatePaletteTarget({ phase: PHASE_REFINE, profile: davis, paletteId: null }),
  null,
  'refine never switches, even with no palette set',
);

// EXPLORE and no phase: unchanged behaviour — the persona brings its palette.
assert.strictEqual(
  curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: 'my-picked-palette' }),
  davis.paletteId,
);
assert.strictEqual(
  curatePaletteTarget({ phase: null, profile: davis, paletteId: 'my-picked-palette' }),
  davis.paletteId,
  'no phase yet = yesterday exactly',
);

// Already on the persona palette: no switch (no override wipe, no undo entry).
assert.strictEqual(curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: davis.paletteId }), null);

// Voice "off" (no profile) never touches the palette, in any phase.
for (const phase of [null, PHASE_EXPLORE, PHASE_REFINE]) {
  assert.strictEqual(curatePaletteTarget({ phase, profile: null, paletteId: 'x' }), null);
  assert.strictEqual(curatePaletteTarget({ phase, profile: undefined, paletteId: 'x' }), null);
  assert.strictEqual(
    curatePaletteTarget({ phase, profile: {}, paletteId: 'x' }),
    null,
    'a profile with no palette is no palette',
  );
}

// ── #1365 Q1 (Matt, 2026-10-12): explore brings the voice's palette only until the ARTIST picks or edits one ──────
assert.strictEqual(
  curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: 'my-pick', artistChose: true }),
  null,
  'explore leaves a palette the artist picked alone',
);
assert.strictEqual(
  curatePaletteTarget({ phase: null, profile: davis, paletteId: 'my-pick', artistChose: true }),
  null,
  'before any phase too',
);
assert.strictEqual(
  curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: 'whatever', artistChose: false }),
  davis.paletteId,
  'not chosen: the voice brings its palette, as before',
);
assert.strictEqual(
  curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: 'whatever' }),
  davis.paletteId,
  'absent flag = not chosen',
);

// the flag itself: set only on the artist's dispatch path, cleared when a roll or a load replaces the palette
{
  const { readFileSync } = await import('node:fs');
  const { useStore } = await import('../state/store.js');
  const S = () => useStore.getState();
  assert.strictEqual(S().paletteChosen, false, 'a fresh session: not chosen');
  S().setPaletteId('praystation');
  assert.strictEqual(S().paletteChosen, false, "the store action alone (CURATOR's path) never marks it");
  S().markPaletteChosen();
  assert.strictEqual(S().paletteChosen, true);
  S().kineticRoll();
  assert.strictEqual(S().paletteChosen, false, "a KINETIC roll replaces the palette: no longer the artist's");
  for (const pass of ['kineticVoicePass']) {
    S().markPaletteChosen();
    S()[pass]();
    assert.strictEqual(S().paletteChosen, false, `${pass} clears it too`);
  }
  S().markPaletteChosen();
  S().applyProject({ seed: 9, paletteId: 'praystation', layoutParams: {} });
  assert.strictEqual(S().paletteChosen, false, "a loaded project's palette is the document's");

  const ctx = readFileSync(new URL('../state/applyAction.js', import.meta.url), 'utf8'); // the action switch (was in AppContext)
  for (const t of [
    'SET_PALETTE_ID',
    'SET_PALETTE_SWATCH',
    'SET_PALETTE_BG',
    'SET_PALETTE_INK',
    'CLEAR_PALETTE_OVERRIDES',
    'APPLY_HARMONY',
  ]) {
    assert.ok(
      flat(ctx).includes(flat(`case A.${t}: store.markPaletteChosen(); return `)),
      `the artist's ${t} marks the palette chosen`,
    );
  }
  const bar = readFileSync(new URL('../panels/layout/CuratorBar.jsx', import.meta.url), 'utf8');
  assert.match(bar, /artistChose: !!st\.paletteChosen/, 'CURATOR reads the flag');
  assert.doesNotMatch(bar, /markPaletteChosen/, 'CURATOR never marks it');
}

// ── #1365 Q3 (Matt, 2026-10-12): three palettes per voice; explore deals one per seed ─────────────────────────────
{
  const { PALETTES, FAMILY_PALETTES, FAMILY_HUE_STEP, paletteFamily, getCatalogPalette, hueRotateHex } =
    await import('../data/palettes.js');
  const { familyPick } = await import('./curatePalette.mjs');
  const { describePaletteFallback } = await import('../state/recipeUrls.js');
  const allPersonas = PALETTES.filter((p) => p.id.startsWith('persona-'));
  const grey = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => h.slice(i, i + 2));
    return r === g && g === b;
  };
  const personas = allPersonas.filter((p) => !p.swatches.every((c) => grey(c.toLowerCase())));
  assert.ok(allPersonas.length >= 10 && personas.length >= 9, 'fixture: the persona palettes (one is all greys)');
  for (const p of allPersonas.filter((q) => !personas.includes(q))) {
    assert.deepEqual(paletteFamily(p.id), [p.id], `${p.id} has no hue: a family of one (no identical cousins)`);
  }
  assert.equal(FAMILY_PALETTES.length, personas.length * 2, 'two cousins per persona');
  assert.ok(
    !PALETTES.some((p) => p.id.includes('~')),
    "the cousins stay OFF the strip, the KIN pool and Evolve's cycle",
  );
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const light = (h) => {
    const c = hex2rgb(h);
    return (Math.max(...c) + Math.min(...c)) / 2;
  };
  for (const p of personas) {
    const fam = paletteFamily(p.id);
    assert.deepEqual(fam, [p.id, `${p.id}~2`, `${p.id}~3`]);
    assert.deepEqual(paletteFamily(`${p.id}~3`), fam, 'a cousin knows its family');
    for (const [k, deg] of [
      [2, FAMILY_HUE_STEP],
      [3, -FAMILY_HUE_STEP],
    ]) {
      const c = getCatalogPalette(`${p.id}~${k}`);
      assert.equal(c.id, `${p.id}~${k}`, 'a cousin resolves through the catalog (save, reload, links)');
      assert.equal(describePaletteFallback(c.id, []), null, 'a recipe link with a cousin is not a fallback');
      assert.equal(c.bg, p.bg);
      assert.equal(c.ink, p.ink, 'bg and ink kept: the voice still reads as itself');
      assert.equal(c.swatches.length, p.swatches.length);
      c.swatches.forEach((sw, i) => {
        assert.match(sw, /^#[0-9a-f]{6}$/);
        assert.ok(Math.abs(light(sw) - light(p.swatches[i])) <= 1.5, `${c.id} swatch ${i}: lightness kept`);
        const back = hex2rgb(hueRotateHex(sw, -deg));
        const orig = hex2rgb(p.swatches[i]);
        assert.ok(
          back.every((v, j) => Math.abs(v - orig[j]) <= 3),
          `${c.id} swatch ${i}: exactly a ${deg} degree hue turn`,
        );
      });
      assert.ok(
        c.swatches.some((sw, i) => sw !== p.swatches[i].toLowerCase()),
        `${c.id} really differs`,
      );
    }
  }
  assert.equal(hueRotateHex('#808080', 24), '#808080', 'greys stay grey');
  assert.deepEqual(paletteFamily('praystation'), ['praystation'], 'a non-persona palette is a family of one');

  const counts = [0, 0, 0];
  const fam = paletteFamily('persona-davis');
  for (let seed = 1; seed <= 600; seed++) counts[fam.indexOf(familyPick('persona-davis', seed))]++;
  assert.ok(
    counts.every((c) => c > 150),
    `every cousin gets dealt (${counts})`,
  );
  assert.equal(familyPick('persona-davis', 77), familyPick('persona-davis', 77), 'deterministic per seed');
  assert.equal(familyPick('persona-davis', null), 'persona-davis', "no seed: the persona's own palette");
  let colourMoves = 0;
  let spatialMoves = 0;
  for (let seed = 1; seed <= 200; seed++) {
    if (familyPick('persona-davis', seed, { color: 999 }) !== familyPick('persona-davis', seed)) colourMoves++;
    if (familyPick('persona-davis', seed, { spatial: 999 }) !== familyPick('persona-davis', seed)) spatialMoves++;
  }
  assert.ok(colourMoves > 50 && spatialMoves === 0, 'the deal rides the colour stream only');

  const dealt = familyPick(davis.paletteId, 4242);
  assert.equal(
    curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: 'x', seed: 4242 }),
    dealt,
    "explore lands on the seed's cousin",
  );
  assert.equal(
    curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: dealt, seed: 4242 }),
    null,
    'already on it: no switch',
  );
  assert.equal(
    curatePaletteTarget({ phase: PHASE_REFINE, profile: davis, paletteId: 'x', seed: 4242 }),
    null,
    'refine still never switches',
  );
  assert.equal(
    curatePaletteTarget({ phase: PHASE_EXPLORE, profile: davis, paletteId: 'x', seed: 4242, artistChose: true }),
    null,
    "nor over the artist's pick",
  );
  const { readFileSync } = await import('node:fs');
  assert.match(
    flat(readFileSync(new URL('../panels/layout/CuratorBar.jsx', import.meta.url), 'utf8')),
    fre(/seed: st\.seed, seedOffsets: st\.seedOffsets/),
    'CURATOR passes the seed',
  );
}

console.log(
  'curatePalette.selfcheck: ok (#1365 refine keeps the palette; explore keeps a chosen palette; three palettes per voice)',
);
