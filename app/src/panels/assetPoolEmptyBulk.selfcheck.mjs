// assetPoolEmptyBulk.selfcheck.mjs — #2494 (A16): ASSETS ALL ON silently does nothing when the filter matches 0 assets.
//
// The mechanism, verified on the tree: the pool's bulk on/off act on the SHOWN set whenever a search text,
// facet or role chip narrows the grid (one shared handler, `allOnOff`; the labels switch to "shown on" /
// "shown off" together; the store's toggle-all is likewise scoped to the category view). That filtered-set
// semantic is established and symmetric — the defect is the SILENCE: narrowed to 0 matches, the press emits
// a bulk write over an empty id list, the enabled count does not move, and nothing on the panel says the
// press landed on an empty set. The fix names the consequence in the pool's existing empty line, via the
// pure `poolEmptyNote` in assetPoolLogic.mjs (the panel renders; the logic decides).
//
//   source   the panel renders its empty line through poolEmptyNote({ narrowed }); the bulk semantic and
//            its symmetry are untouched (same handler, same two funnels)
//   note     narrowed → the line names the consequence for shown on/off; un-narrowed → the pre-fix line,
//            byte for byte
//   state    the filed state on real data: a cross-facet filter matching exactly 0, exactly 6 enabled, the
//            press's own funnel leaves the count at 6; a non-empty narrowed press acts on exactly the
//            shown set; the un-narrowed toggle-all still lights the whole library
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS } from '../data/assets/index.js';
import * as logic from './assetPoolLogic.mjs';
import { poolDescriptors, filterRecords, activeChips } from './assetPoolLogic.mjs';

// ---- source
const panelSrc = readFileSync(new URL('./AssetPoolPanel.jsx', import.meta.url), 'utf8');
assert.ok(
  panelSrc.includes('poolEmptyNote,') && panelSrc.includes("from './assetPoolLogic.mjs'"),
  'AssetPoolPanel must import poolEmptyNote from assetPoolLogic — without it the empty line cannot name the bulk consequence',
);
assert.ok(
  panelSrc.includes('{poolEmptyNote({ narrowed })}'),
  'the pool-empty line must render poolEmptyNote({ narrowed }) — on the base tree it is a bare literal that names no consequence for ALL ON, which is the filed silence',
);
assert.ok(
  !panelSrc.includes('>nothing matches — remove a filter above<'),
  'the bare empty line must not be hard-coded in the panel any more (the copy lives in poolEmptyNote)',
);
assert.ok(
  panelSrc.includes(
    'narrowed ? emit(Events.ASSETS_BULK, { ids: order, enabled: on }) : emit(Events.ASSETS_TOGGLE_ALL, on)',
  ),
  'the bulk semantic must stand: narrowed → ASSETS_BULK over the shown ids, un-narrowed → ASSETS_TOGGLE_ALL',
);
assert.ok(
  panelSrc.includes('onClick={() => allOnOff(true)}') && panelSrc.includes('onClick={() => allOnOff(false)}'),
  'ALL ON and ALL OFF must keep sharing the one allOnOff handler (the filtered-set semantic is symmetric)',
);
assert.ok(
  panelSrc.includes(
    "const narrowed = !!(String(search).trim() || chips.some((c) => c.kind === 'facet' || c.kind === 'role'));",
  ),
  'the narrowing test the note keys on must stand: search text or a facet/role chip',
);

// ---- note
assert.equal(
  typeof logic.poolEmptyNote,
  'function',
  'assetPoolLogic must export poolEmptyNote — the function that names the empty-set consequence',
);
const { poolEmptyNote } = logic;
assert.equal(
  poolEmptyNote({ narrowed: true }),
  'nothing matches — shown on/off have nothing to act on — remove a filter above',
  'narrowed to 0, the line must name the consequence for shown on/off',
);
assert.ok(
  poolEmptyNote({ narrowed: true }).includes('shown on/off') &&
    poolEmptyNote({ narrowed: true }).includes('nothing to act on'),
  'the narrowed line must name the bulk controls and that they act on nothing',
);
assert.equal(
  poolEmptyNote({ narrowed: false }),
  'nothing matches — remove a filter above',
  'un-narrowed, the line is the pre-fix line byte for byte (the bulk buttons still act on the category view)',
);
assert.equal(poolEmptyNote(), 'nothing matches — remove a filter above', 'the default is the plain line');
assert.equal(poolEmptyNote({}), 'nothing matches — remove a filter above', 'an empty facts object is the plain line');

// ---- state (the filed repro, on the real catalogue, through the press's own funnel)
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { useStore } = await import('../state/store.js');
const S = () => useStore.getState();
const enabledCount = () => Object.values(S().enabledAssets).filter(Boolean).length;

const recs = poolDescriptors(ASSETS);
assert.ok(recs.length > 200, `fixture: the pool shows a real catalogue (measured ${recs.length} records)`);

// a cross-facet filter whose intersection is empty on the real data — the filed shape
const filedFilters = { cat: 'all', text: '', facets: { subject: ['leaf'], script: ['letter'] }, role: {} };
const filedShown = filterRecords(recs, filedFilters);
assert.equal(
  filedShown.length,
  0,
  `the filed filter must match exactly 0 of ${recs.length} records (measured ${filedShown.length})`,
);
const filedChips = activeChips(filedFilters);
const filedNarrowed = !!(
  String(filedFilters.text).trim() || filedChips.some((c) => c.kind === 'facet' || c.kind === 'role')
);
assert.equal(filedNarrowed, true, 'the filed filter narrows (facet chips are active), so ALL ON takes the bulk funnel');
assert.ok(
  poolEmptyNote({ narrowed: filedNarrowed }).includes('nothing to act on'),
  'in the filed state the panel line must name the consequence',
);

// the session's shape: exactly 6 enabled, then the press (bulk over the shown ids) lands
const allIds = recs.map((r) => r.id);
S().setAssetsEnabled(allIds, false);
S().setAssetsEnabled(allIds.slice(0, 6), true);
assert.equal(enabledCount(), 6, `fixture: exactly 6 enabled before the press (measured ${enabledCount()})`);
S().setAssetsEnabled(
  filedShown.map((r) => r.id),
  true,
);
assert.equal(
  enabledCount(),
  6,
  `the press on the empty shown set is a true no-op: enabled stays 6 (measured ${enabledCount()}) — the state truth the note now names`,
);

// a non-empty narrowed press acts on exactly the shown set — no more, no fewer
const someFilters = { cat: 'all', text: '', facets: { form: ['dot'], mood: ['print'], script: ['glyph'] }, role: {} };
const someShown = filterRecords(recs, someFilters);
assert.ok(
  someShown.length > 0 && someShown.length < recs.length,
  `fixture: the partial filter shows a proper subset (measured ${someShown.length} of ${recs.length})`,
);
S().setAssetsEnabled(allIds, false);
S().setAssetsEnabled(
  someShown.map((r) => r.id),
  true,
);
assert.equal(
  enabledCount(),
  someShown.length,
  `a narrowed press enables exactly the shown set (measured ${enabledCount()} of ${someShown.length} shown)`,
);
for (const r of someShown) assert.equal(S().enabledAssets[r.id], true, `shown asset ${r.id} is on after the press`);

// the un-narrowed contrast from the filing: "Unfiltered ALL ON worked"
S().setAssetsEnabled(allIds, false);
S().toggleAllAssets(true);
assert.equal(
  enabledCount(),
  ASSETS.length,
  `un-narrowed ALL ON lights the whole library (measured ${enabledCount()} of ${ASSETS.length})`,
);

console.log('assetPoolEmptyBulk.selfcheck: ok');
