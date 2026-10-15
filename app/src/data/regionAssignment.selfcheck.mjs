// regionAssignment.selfcheck.mjs — #1434 KINEME Build R3: region kineme
// assignment — family defaults + artist override + import auto-tagging.
//
// Pins: the family table as deterministic functions of geometry +
// category (flora sway/pulse by centre, radial pulse, linework bob,
// other families still, strips excluded); the baked library carrying
// exactly those defaults; the override precedence (a doc edit wins per
// region, a tombstone keeps a region still, and a re-bake never brings
// an edited region back); save/load through the project document with
// tombstones intact; the import pipeline (cap 12 + defaults on arrival,
// surviving the overlay trust boundary); and the contract resolving
// regionAnim from defaults alone — for a library asset and for a custom
// user: asset whose record rides the document.
import assert from 'node:assert';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };

import { ASSETS, ASSETS_AUTHORED } from './assets/index.js';
import {
  familyDefaultRegionKinemes, centreRegionId, tagImportedRegions, FAMILY_DEFAULT_KINEMES,
} from './regionDefaults.js';
import {
  regionsForAsset, regionAssignmentFor, sanitizeRegionKinemesDoc,
} from './regionKinemes.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import { useStore } from '../state/store.js';

const rec = (id, cx, cy, area, color = '000000') => ({
  id, color, cx, cy, x0: cx - 0.1, y0: cy - 0.1, x1: cx + 0.1, y1: cy + 0.1, area,
});

// ── the family table, as functions of geometry ───────────────────────
{
  const petals = [rec('n', 0.5, 0.2, 100), rec('e', 0.8, 0.5, 100), rec('s', 0.5, 0.8, 100), rec('w', 0.2, 0.5, 100)];
  const centre = rec('c', 0.5, 0.5, 40, 'ff2d95');
  const floraRegions = [...petals, centre];
  assert.strictEqual(centreRegionId(floraRegions), 'c', 'the centre is the region nearest the centre of ink');
  assert.deepEqual(
    familyDefaultRegionKinemes({ id: 'x', category: 'floral' }, floraRegions),
    { n: 'rock', e: 'rock', s: 'rock', w: 'rock', c: 'pulse' },
    'flora: outer regions sway (rock, the osc kineme), the centre pulses',
  );
  assert.deepEqual(
    familyDefaultRegionKinemes({ id: 'x', category: 'floral' }, [rec('only', 0.5, 0.5, 10)]),
    { only: 'pulse' },
    'a one-region flower: the region is its centre, so it pulses',
  );
  assert.deepEqual(
    familyDefaultRegionKinemes({ id: 'x', category: 'radial' }, floraRegions),
    { n: 'pulse', e: 'pulse', s: 'pulse', w: 'pulse', c: 'pulse' },
    'radial: every region pulses',
  );
  assert.deepEqual(
    familyDefaultRegionKinemes({ id: 'x', category: 'linework' }, [rec('a', 0.3, 0.5, 10), rec('b', 0.7, 0.5, 10)]),
    { a: 'bob', b: 'bob' },
    'linework: every region bobs',
  );
  for (const cat of ['organic', 'geometric', 'dots', 'stamps', 'crystalline', 'biosynthetic', 'fragments', 'scanlines']) {
    assert.strictEqual(familyDefaultRegionKinemes({ id: 'x', category: cat }, floraRegions), null, `${cat}: no default in the table — still`);
  }
  assert.strictEqual(
    familyDefaultRegionKinemes({ id: 'mic_wave', category: 'linework' }, floraRegions), null,
    'strip assets are excluded even in a named family (the authored cell track owns them)',
  );
  assert.strictEqual(familyDefaultRegionKinemes({ id: 'x', category: 'floral' }, []), null, 'no regions, no defaults');
  assert.strictEqual(familyDefaultRegionKinemes(null, floraRegions), null, 'no asset, no defaults');
  assert.deepEqual(
    familyDefaultRegionKinemes({ id: 'x', category: 'floral' }, floraRegions),
    familyDefaultRegionKinemes({ id: 'x', category: 'floral' }, floraRegions),
    'deterministic: same geometry, same assignment',
  );
  assert.strictEqual(FAMILY_DEFAULT_KINEMES.sway, 'rock');
}
console.log('regionAssignment (family table): OK');

// ── the baked library carries exactly the defaults ───────────────────
{
  const authored = new Map(ASSETS_AUTHORED.map((a) => [a.id, a]));
  let assignedAssets = 0, assignedRegions = 0;
  const perFamily = {};
  for (const a of ASSETS) {
    const expected = familyDefaultRegionKinemes(authored.get(a.id), a.regions || []);
    if (expected) {
      assert.deepEqual(a.regionKinemes, expected, `${a.id}: baked assignments == the family rule`);
      assignedAssets++;
      assignedRegions += Object.keys(expected).length;
      perFamily[a.category] = (perFamily[a.category] || 0) + 1;
    } else {
      assert.ok(!('regionKinemes' in a), `${a.id}: no defaults, no key`);
    }
  }
  assert.deepEqual(perFamily, { floral: 15, radial: 26, linework: 33 }, 'the table names three families in this library');
  assert.strictEqual(assignedRegions, 294, 'every region of a named family is assigned');
  console.log(`regionAssignment (bake): OK — ${assignedAssets} assets, ${assignedRegions} regions assigned`);

  const flora = ASSETS.find((a) => a.id === 'flora_flower_01');
  const centre = flora.regions.find((r) => r.color === 'ff2d95');
  assert.strictEqual(flora.regionKinemes[centre.id], 'pulse', 'flora_flower_01: the centre pulses');
  for (const r of flora.regions) {
    if (r.id !== centre.id) assert.strictEqual(flora.regionKinemes[r.id], 'rock', `flora_flower_01: petal ${r.id} sways`);
  }
  const line = ASSETS.find((a) => a.id === 'line_solid_01');
  assert.deepEqual(line.regionKinemes, { [line.regions[0].id]: 'bob' }, 'a solid line: one region, bobbing');
  const geo = ASSETS.find((a) => a.id === 'geo_tri_01');
  assert.ok(!('regionKinemes' in geo), 'geometric carries no defaults');
}

// ── override precedence: edit wins, tombstone holds, re-bake is safe ──
{
  const FLORA = 'flora_flower_01';
  const flora = ASSETS.find((a) => a.id === FLORA);
  const [petal, centre] = [flora.regions[0].id, flora.regions.find((r) => r.color === 'ff2d95').id];
  const defaults = regionAssignmentFor(FLORA, null);
  assert.ok(defaults && defaults[petal] === 'rock' && defaults[centre] === 'pulse', 'baseline: the defaults');

  const edited = regionAssignmentFor(FLORA, { [FLORA]: { [petal]: 'blink' } });
  assert.strictEqual(edited[petal], 'blink', 'an edit beats the default on its region');
  assert.strictEqual(edited[centre], 'pulse', 'unedited regions keep their default');

  const tamed = regionAssignmentFor(FLORA, { [FLORA]: { [centre]: null } });
  assert.ok(!(centre in tamed), 'a tombstone removes the region: still on purpose');
  assert.strictEqual(tamed[petal], 'rock', 'the tombstone touches only its region');

  const allStill = regionAssignmentFor(FLORA, {
    [FLORA]: Object.fromEntries(flora.regions.map((r) => [r.id, null])),
  });
  assert.strictEqual(allStill, null, 'every region tombstoned resolves to no assignment (the pre-R3 still state)');

  // Re-bake: the defaults are recomputed from geometry (a fresh bake) —
  // the doc edit is separate data, so it still wins afterwards.
  const rebaked = familyDefaultRegionKinemes(ASSETS_AUTHORED.find((a) => a.id === FLORA), flora.regions);
  assert.deepEqual(rebaked, flora.regionKinemes, 'the re-bake reproduces the same defaults');
  const afterRebake = regionAssignmentFor(FLORA, { [FLORA]: { [petal]: 'blink', [centre]: null } });
  assert.strictEqual(afterRebake[petal], 'blink', 'after a re-bake the edit still wins');
  assert.ok(!(centre in afterRebake), 'after a re-bake the tombstone still holds');
}
console.log('regionAssignment (override precedence): OK');

// ── the document: sanitizer + save/load round trip, tombstones intact ─
{
  assert.deepEqual(
    sanitizeRegionKinemesDoc({ a: { r1: 'rock', r2: null, r3: 'nope', r4: 7 }, b: 'x', c: {} }),
    { a: { r1: 'rock', r2: null } },
    'the doc sanitizer keeps kineme ids and tombstones, drops the rest',
  );
  assert.strictEqual(sanitizeRegionKinemesDoc({}), null, 'empty map is null (field omitted)');
  assert.strictEqual(sanitizeRegionKinemesDoc(null), null);

  const FLORA = 'flora_flower_01';
  const flora = ASSETS.find((a) => a.id === FLORA);
  const [petal, centre] = [flora.regions[0].id, flora.regions.find((r) => r.color === 'ff2d95').id];
  const edits = { [FLORA]: { [petal]: 'blink', [centre]: null } };
  const state = {
    seed: 7, seedOffsets: null, paletteId: 'praystation', layoutParams: {}, enabledAssets: {},
    quality: 'balanced', autoQuality: true, customAssets: [], regionKinemes: edits,
  };
  const doc = serializeProject(state);
  assert.deepEqual(doc.regionKinemes, edits, 'serialize: the overrides (and the tombstone) are written');
  const parsed = parseProject(JSON.parse(JSON.stringify(doc)));
  assert.ok(parsed.ok, `parse: ${parsed.error || ''}`);
  assert.deepEqual(parsed.doc.regionKinemes, edits, 'save/load: the edit and the tombstone survive');
  const resolved = regionAssignmentFor(FLORA, parsed.doc.regionKinemes);
  assert.strictEqual(resolved[petal], 'blink', 'after load, the edit still beats the default');
  assert.ok(!(centre in resolved), 'after load, the tombstoned centre is still still');

  const clean = serializeProject({ ...state, regionKinemes: {} });
  assert.ok(!('regionKinemes' in clean), 'a project with no region edits exports exactly as before');
}
console.log('regionAssignment (document): OK');

// ── the store: setRegionKineme + applyProject ────────────────────────
{
  const FLORA = 'flora_flower_01';
  const flora = ASSETS.find((a) => a.id === FLORA);
  const [petal, centre] = [flora.regions[0].id, flora.regions.find((r) => r.color === 'ff2d95').id];
  const st = useStore.getState();
  st.setRegionKineme(FLORA, petal, 'blink');
  st.setRegionKineme(FLORA, centre, 'still');
  assert.deepEqual(useStore.getState().regionKinemes, { [FLORA]: { [petal]: 'blink', [centre]: null } },
    'the store records a kineme override and a tombstone');
  st.setRegionKineme(FLORA, petal, 'default');
  assert.deepEqual(useStore.getState().regionKinemes, { [FLORA]: { [centre]: null } },
    "'default' clears the override — the family default rules that region again");
  st.setRegionKineme(FLORA, centre, 'default');
  assert.deepEqual(useStore.getState().regionKinemes, {}, 'clearing the last override empties the map');
  st.setRegionKineme(FLORA, petal, 'nope');
  assert.deepEqual(useStore.getState().regionKinemes, {}, 'unknown kineme ids are ignored');
  // A loaded document replaces the map wholesale.
  st.setRegionKineme(FLORA, petal, 'bob');
  st.applyProject({ seed: 3, regionKinemes: { [FLORA]: { [centre]: null } } });
  assert.deepEqual(useStore.getState().regionKinemes, { [FLORA]: { [centre]: null } },
    'applyProject: the document’s map wins, tombstone included');
  st.applyProject({ seed: 3 });
  assert.deepEqual(useStore.getState().regionKinemes, {}, 'applyProject: a doc without edits clears the map');
}
console.log('regionAssignment (store): OK');

// ── imports: auto-tagged on arrival (cap + defaults), boundary-safe ──
{
  const many = Array.from({ length: 15 }, (_, i) => rec(`rm-000000-${i % 5}-${Math.floor(i / 5)}`, 0.1 + (i % 5) * 0.2, 0.1 + Math.floor(i / 5) * 0.3, 100 - i));
  const tagged = tagImportedRegions({ id: 'user:lines', category: 'linework' }, many);
  assert.strictEqual(tagged.regions.length, 12, 'an import is capped at the tag cap, like the bake');
  assert.strictEqual(Object.keys(tagged.regionKinemes).length, 12, 'every kept region of a linework import bobs');
  assert.ok(Object.values(tagged.regionKinemes).every((k) => k === 'bob'));
  assert.deepEqual(
    Object.keys(tagged.regionKinemes).sort(), tagged.regions.map((r) => r.id).sort(),
    'assignments name exactly the kept regions',
  );
  const frag = tagImportedRegions({ id: 'user:frag', category: 'fragments' }, many.slice(0, 3));
  assert.strictEqual(frag.regionKinemes, null, 'a family outside the table arrives tagged but unassigned (still)');

  // The overlay trust boundary keeps the tagged record intact — and
  // cleans a hostile one.
  const svg = '<path d="M0 0h10v10z" fill="var(--ink)"/>';
  const clean = sanitizeOverlay([{ id: 'user:lines', svg, category: 'linework', regions: tagged.regions, regionKinemes: tagged.regionKinemes }]);
  assert.strictEqual(clean.length, 1);
  assert.deepEqual(clean[0].regionKinemes, tagged.regionKinemes, 'the auto-tagged defaults survive the trust boundary');
  const hostile = sanitizeOverlay([{
    id: 'user:lines', svg, category: 'linework', regions: tagged.regions,
    regionKinemes: { [tagged.regions[0].id]: 'bob', 'rm-ghost': 'bob', [tagged.regions[1].id]: 'nope' },
  }]);
  assert.deepEqual(hostile[0].regionKinemes, { [tagged.regions[0].id]: 'bob' }, 'unknown regions/kinemes are dropped at the boundary');
}
console.log('regionAssignment (import auto-tag): OK');

// ── the contract: defaults alone animate — library AND custom ────────
{
  const item = (assetId, key) => ({ assetId, x: 500, y: 350, scale: 2.5, rotation: 0, color: '#ffffff', accent: '#ff4444', alpha: 100, key, seedOffset: 0 });
  const layer = (items) => [{ id: 'L', isFx: false, items }];
  const contract = (doc, items) => buildSceneContract({ doc: { seed: 1, ...doc }, resolvedLayers: layer(items) });

  const lib = contract({}, [item('flora_flower_01', 'a')]);
  assert.ok(lib.regionAnim?.assets?.flora_flower_01, 'library: baked defaults raise regionAnim with no doc at all');
  assert.strictEqual(Object.keys(lib.regionAnim.assets.flora_flower_01).length, 5, 'all five flora regions are in the map');

  // A custom linework import: its record (regions + auto-tagged defaults)
  // rides the document's customAssets; the contract resolves it there.
  const tagged = tagImportedRegions({ id: 'user:lines', category: 'linework' }, [rec('rm-000000-1-1', 0.3, 0.5, 50), rec('rm-000000-2-2', 0.7, 0.5, 30)]);
  const customRecord = {
    id: 'user:lines', category: 'linework', weight: 'medium', tags: ['overlay'], source: 'loot',
    svg: '<path d="M0 0h10v10z"/>', regions: tagged.regions, regionKinemes: tagged.regionKinemes,
  };
  const custom = contract({ customAssets: [customRecord] }, [item('user:lines', 'a')]);
  assert.ok(custom.regionAnim?.assets?.['user:lines'], 'custom: the contract resolves the overlay record from the doc');
  assert.deepEqual(Object.keys(custom.regionAnim.assets['user:lines']).sort(), ['rm-000000-1-1', 'rm-000000-2-2']);
  const bobSlot = custom.regionAnim.assets['user:lines']['rm-000000-1-1'];
  assert.ok(bobSlot > 0, 'the imported regions are selected under the default budget');
  assert.strictEqual(custom.kinemes[bobSlot - 1].kind, 5, 'the slot rides the bob kineme kind');
  assert.strictEqual(regionsForAsset('user:lines'), null, 'without the doc record, the catalogue does not invent the asset');
  assert.deepEqual(regionsForAsset('user:lines', customRecord), tagged.regions, 'with the record, its regions resolve');
}
console.log('regionAssignment (contract): OK');
console.log('regionAssignment.selfcheck: OK');
