// hitBands.selfcheck.mjs — the vibe bands on a HITS pill: three palette colours and one heat step, frozen at capture (#1124).
import assert from 'node:assert';
import { captureBands, sanitizeBands, bandsFor, dominantColors, HEAT_STEPS } from './hitBands.js';
import { heatStep, publishShownHeat, shownHeat, KINETIC_CHAOS_HEAT } from '../panels/layout/kineticHeat.mjs';
import { captureFavorite, sanitizeFavorite } from '../state/slices/davisSlice.js';
import { resolvePalette } from '../data/palettes.js';
import { DEFAULT_LAYOUT_PARAMS } from '../data/layout-modes.js';
import { useStore } from '../state/store.js';

// the store persists to localStorage; node has none, so give it a place to write that goes nowhere
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const HEX = /^#[0-9a-f]{6}$/i;

ok('three colours, each one of the palette\'s own swatches, strongest first', () => {
  const pal = resolvePalette('praystation', null);
  const c = dominantColors(pal);
  assert.equal(c.length, 3); for (const x of c) { assert.match(x, HEX); assert.ok(pal.swatches.map((s) => s.toLowerCase()).includes(x.toLowerCase()), `${x} is a swatch`); }
  assert.deepEqual(c, dominantColors(pal), 'deterministic');
});

ok('heat steps: cool is 0, hot is 3, and they cut where heatLevel cuts', () => {
  assert.equal(HEAT_STEPS, 4);
  assert.equal(heatStep(0), 0); assert.equal(heatStep(0.01), 0); assert.equal(heatStep(0.1), 1); assert.equal(heatStep(0.25), 2);
  assert.equal(heatStep(KINETIC_CHAOS_HEAT), 3); assert.equal(heatStep(1), 3);
  for (const bad of [NaN, undefined, null, -5]) assert.equal(heatStep(bad), 0);
});

ok('the button publishes the heat it is showing; a keep freezes the step', () => {
  publishShownHeat(0.7); assert.equal(shownHeat(), 0.7); publishShownHeat(NaN); assert.equal(shownHeat(), 0);
  publishShownHeat(0.7);
  const fav = captureFavorite({ seed: 5, seedOffsets: {}, layoutParams: { ...DEFAULT_LAYOUT_PARAMS }, enabledAssets: {} }, 'praystation');
  assert.equal(fav.bands.h, 3, 'hot at capture'); assert.equal(fav.bands.c.length, 3);
  publishShownHeat(0); assert.equal(fav.bands.h, 3, 'frozen: later heat does not move it');
  assert.equal(captureFavorite({ seed: 5, seedOffsets: {}, layoutParams: { ...DEFAULT_LAYOUT_PARAMS }, enabledAssets: {} }, 'praystation').bands.h, 0, 'cool now');
});

ok('a stored value is kept only if it is exactly what a keep writes', () => {
  const good = { c: ['#112233', '#445566', '#778899'], h: 2 };
  assert.deepEqual(sanitizeBands(good), good);
  for (const bad of [null, {}, { c: ['#112233'], h: 1 }, { c: ['#112233', '#445566', 'red'], h: 1 }, { c: good.c, h: 4 }, { c: good.c, h: 1.5 }, 'x']) assert.equal(sanitizeBands(bad), null);
  const kept = sanitizeFavorite({ seed: 9, config: { palette: { id: 'praystation' } }, bands: good });
  assert.deepEqual(kept.bands, good);
  assert.equal('bands' in sanitizeFavorite({ seed: 9, config: { palette: { id: 'praystation' } }, bands: { c: [], h: 9 } }), false, 'junk bands drop; the keep survives');
});

ok('a keep from before the bands existed draws its palette and a cool heat band, never a made-up one', () => {
  const old = sanitizeFavorite({ seed: 9, config: { palette: { id: 'praystation' } } });
  const b = bandsFor(old);
  assert.equal(b.h, 0); assert.deepEqual(b.c, dominantColors(resolvePalette('praystation', null)));
  const unknown = bandsFor({ config: { palette: { id: 'no-such-palette' } } });
  assert.equal(unknown.c.length, 3);
});

ok('duplicating a pill copies the recipe right after it, with its own id, and mints no new keep (two-ledger rule)', () => {
  const st = useStore.getState();
  const mk = (seed) => captureFavorite({ seed, seedOffsets: {}, layoutParams: { ...DEFAULT_LAYOUT_PARAMS }, enabledAssets: {} }, 'praystation');
  useStore.setState({ favorites: [], keeps: [] });
  st.addFavorite(mk(11)); st.addFavorite(mk(22));
  const [a, b] = useStore.getState().favorites; const keeps0 = useStore.getState().keeps.length;
  useStore.getState().duplicateFavorite(a.id);
  const f = useStore.getState().favorites;
  assert.equal(f.length, 3); assert.equal(f[1].seed, 11); assert.notEqual(f[1].id, a.id); assert.deepEqual(f[1].bands, a.bands, 'the copy keeps the frozen bands');
  assert.equal(f[2].id, b.id, 'the rest keep their order');
  assert.equal(useStore.getState().keeps.length, keeps0, 'copying a pill is not finding anything');
  useStore.getState().duplicateFavorite('no-such-id'); assert.equal(useStore.getState().favorites.length, 3);
});

console.log(`hitBands.selfcheck: ${n} checks passed`);
