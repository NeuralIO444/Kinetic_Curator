// foldInCensus.selfcheck.mjs — #1694 S3: the controls fold-in, censused.
//
// THE CLAIM: after the fold-in, no performer surface is creature-only, and the
// creature count has exactly ONE home — the BUILD layout param `creatures`,
// set from BUILD's hype/moth block, with the range and default the retired
// DIRECTORS stepper had (0..4, default 0). The old home is fully retired: no
// store field, no setter, no bus event, no action, no panel control.
//
// SCOPE OF THE CLAIM (the honest boundary): two DEV surfaces can show creature
// internals — the skeleton overlay (?debug=skeleton) and the stress readout
// (?debug=stress). They are dev flags on the URL, not performer surfaces; this
// suite names them and pins their flag gating instead of pretending the claim
// covers them. The Wet Lab is asset-side kit (H/L attach law) and carries no
// count control at all.
//
// Pattern follows unlockTree.selfcheck: claims are pinned against the actual
// panel/component sources, plus behavioural checks on the store and the
// document layer, so a future edit that quietly re-creates a creature-only
// surface (or a second count home) fails here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC } from '../../data/layout-modes.js';
import { MAX_CREATURES, sanitizeCount } from '../../curator/spawn.js';
import { RANDOMIZABLE_KEYS, MORPHABLE_KEYS } from '../../state/paramUtils.js';
import { parseProject, serializeProject } from '../../state/projectDocument.js';
import { useStore } from '../../state/store.js';
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins (#1684): whitespace and trailing commas are Prettier's, not the code's
const fre = (re) => new RegExp(re.source.replace(/\\s[*+?]?/g, '').replace(/ /g, ''), re.flags); // the same pin as a layout-blind pattern

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const clone = (v) => JSON.parse(JSON.stringify(v));

// ── 1. the count's one home, with the stepper's exact law ─────────────────────
ok('the count is a layout param: default 0, spec 0..4 int — the retired stepper’s range', () => {
  assert.equal(DEFAULT_LAYOUT_PARAMS.creatures, 0, 'an untouched stage spawns nothing');
  assert.deepEqual(PARAM_SPEC.creatures, { min: 0, max: 4, int: true });
  assert.equal(
    PARAM_SPEC.creatures.max,
    MAX_CREATURES,
    'the trust boundary and the spawn sanitizer clamp to the same cap',
  );
  for (const v of [-3, 0, 2, 4, 4.4, 99]) {
    assert.equal(
      Math.min(PARAM_SPEC.creatures.max, Math.max(0, Math.round(v))),
      sanitizeCount(v),
      `spec bounds ≡ sanitizeCount for ${v}`,
    );
  }
});

ok(
  'no machine writes the count: dice, Evolve and morph key lists exclude it (hand input only, DS quantized law)',
  () => {
    assert.ok(!RANDOMIZABLE_KEYS.includes('creatures'), 'the dice never deal a population');
    assert.ok(!MORPHABLE_KEYS.includes('creatures'), 'a morph never blends one');
  },
);

// ── 2. the old home is fully retired ─────────────────────────────────────────
ok('no store field, no setter, no bus event, no action for the count', () => {
  const state = useStore.getState();
  assert.ok(!('creatureCount' in state), 'the store carries no creatureCount field');
  assert.ok(!('setCreatureCount' in state), 'and no setter for it');
  assert.ok(!/CREATURE_COUNT/.test(src('../../composition/eventBus.js')), 'no bus event');
  assert.ok(!/CREATURE_COUNT/.test(src('../../composition/eventRegistry.js')), 'no registry entry');
  assert.ok(!/CREATURE_COUNT|SET_CREATURE_COUNT/.test(src('../../composition/wireEventBus.js')), 'no wiring');
  assert.ok(!/SET_CREATURE_COUNT/.test(src('../../state/actions.js')), 'no action');
  assert.ok(!/SET_CREATURE_COUNT/.test(src('../../state/applyAction.js')), 'no action case');
  assert.ok(
    !/^\s+creatureCount:/m.test(src('../../state/slices/globalSlice.js')),
    'no field definition left in the slice',
  );
});

ok('DIRECTORS carries no creature control (the stepper retired; the header is its pre-#1355 self)', () => {
  const dav = src('../DavisPanel.jsx');
  assert.ok(!/CREATURE_COUNT/.test(dav), 'the panel emits no creature event');
  assert.ok(!/creatures-\$\{/.test(dav), 'no stepper chips');
  assert.ok(!/header-tools/.test(dav), 'no header tools — the header height the stepper borrowed is returned');
});

// ── 3. the count is settable from BUILD, beside its neighbours ───────────────
ok('BUILD’s hype/moth block sets the count 0..4 through the shared layout-param door', () => {
  const hype = src('./HypeSliders.jsx');
  assert.ok(fre(/btn\('CREATURES', 'creatures'/).test(flat(hype)), 'a CREATURES value button in the block');
  assert.ok(
    fre(/min=\{0\} max=\{4\} step=\{1\}/).test(flat(hype)),
    'quantized 0..4 step 1 — the stepper’s stepping feel',
  );
  assert.ok(
    fre(/set\('creatures', Math\.round\(v\)\)/).test(flat(hype)),
    'written through the block’s own set() (Events.LAYOUT_PARAM)',
  );
  const fh = flat(hype);
  const creaturesCall = fh.slice(fh.indexOf("btn('CREATURES'"), fh.indexOf("{btn('BODY'"));
  assert.ok(
    creaturesCall.length > 0 && !fre(/disabled/).test(flat(creaturesCall)),
    'the count is not mode-gated — the stepper never was',
  );
  const build = src('../BuildPanel.jsx');
  assert.ok(
    fre(/<HypeSliders layoutParams=\{layoutParams\} lockedParams=\{lockedParams\} \/>/).test(flat(build)),
    'BUILD renders the block',
  );
  assert.ok(
    fre(/title="Motion & Behavior"[\s\S]*?<HypeSliders/).test(flat(build)),
    'in §3 Motion & Behavior, where it already lived',
  );
});

ok('every pre-slice param is reachable at its home in the block (nothing moved, nothing lost)', () => {
  const hype = src('./HypeSliders.jsx');
  for (const key of ['body', 'flap', 'tight', 'breath', 'wind', 'metabolism']) {
    assert.ok(flat(hype).includes(flat(`set('${key}'`)), `${key} still written from the block`);
  }
  assert.ok(!fre(/🦋/).test(flat(hype)), 'the creature-only framing (the butterfly header) retired with the stepper');
});

// ── 4. the store door behaves (bounds, and only bounds) ──────────────────────
ok('setLayoutParam writes the count and clamps it like the stepper did', () => {
  const S = () => useStore.getState();
  S().setLayoutParam('creatures', 2);
  assert.equal(S().layoutParams.creatures, 2);
  S().setLayoutParam('creatures', 99);
  assert.equal(S().layoutParams.creatures, 4, 'no fifth creature through any door');
  S().setLayoutParam('creatures', 'lots');
  assert.equal(S().layoutParams.creatures, 4, 'a non-number is refused, the count stands');
  S().setLayoutParam('creatures', 0);
  assert.equal(S().layoutParams.creatures, 0);
});

// ── 5. documents keep loading: the migration lands the old field in the param ─
ok('a pre-fold-in document’s top-level count lands in the param — root and snapshots', () => {
  const legacy = {
    version: 1,
    seed: 7,
    creatureCount: 3,
    layoutParams: { count: 5 },
    layers: [{ id: 'a' }, { id: 'b' }],
    activeLayerId: 'a',
    layerSnapshots: { a: { layoutParams: { count: 9 } }, b: { seed: 3 } },
  };
  const p = parseProject(clone(legacy));
  assert.ok(p.ok);
  assert.equal(p.doc.layoutParams.creatures, 3, 'the root count survives the move');
  assert.equal(
    p.doc.layerSnapshots.a.layoutParams.creatures,
    3,
    'a snapshot with params of its own takes the legacy count, not the default',
  );
  assert.equal(
    p.doc.layerSnapshots.b.layoutParams.creatures,
    3,
    'a snapshot without params inherits the migrated root',
  );
  assert.ok(!('creatureCount' in p.doc), 'the parsed document has no top-level count field');
  assert.deepEqual(
    parseProject(clone(p.doc)).doc,
    p.doc,
    'the migrated document is a fixed point (nothing repaired twice)',
  );
});

ok('an explicit param wins over a stale top-level field, and hostile counts clamp through the old sanitizer', () => {
  const base = { version: 1, seed: 7, layers: [], activeLayerId: null };
  assert.equal(
    parseProject({ ...base, creatureCount: 3, layoutParams: { creatures: 1 } }).doc.layoutParams.creatures,
    1,
    'the new home wins',
  );
  assert.equal(
    parseProject({ ...base, creatureCount: 99, layoutParams: {} }).doc.layoutParams.creatures,
    4,
    'the old field clamps to the same 0..4',
  );
  assert.equal(
    parseProject({ ...base, creatureCount: 'lots', layoutParams: {} }).doc.layoutParams.creatures,
    0,
    'junk reads as none',
  );
});

ok('the count round-trips through serialize → parse inside layoutParams', () => {
  const S = () => useStore.getState();
  S().setLayoutParam('creatures', 3);
  const doc = serializeProject(S());
  assert.equal(doc.layoutParams.creatures, 3);
  assert.ok(!('creatureCount' in doc), 'serialize writes no top-level field');
  assert.equal(parseProject(clone(doc)).doc.layoutParams.creatures, 3);
  S().setLayoutParam('creatures', 0);
});

// ── 6. the claim’s boundary, named and pinned ────────────────────────────────
ok('the dev surfaces stay dev surfaces: skeleton and stress readouts mount only behind their URL flags', () => {
  const app = src('../../App.jsx');
  assert.ok(
    fre(/\{DEBUG_STRESS && <StressReadout \/>\}/).test(flat(app)),
    'the stress readout mounts only when ?debug=stress set the flag',
  );
  const canvas = src('../CanvasPanel.jsx');
  assert.ok(
    fre(/\{isSkeletonDebug\(\) && \(/).test(flat(canvas)) && fre(/<SkeletonOverlay/).test(flat(canvas)),
    'the skeleton overlay mounts only when ?debug=skeleton',
  );
  assert.ok(
    !fre(/creatureCount/).test(flat(src('../WetLab.jsx'))),
    'the Wet Lab (asset-side) carries no count control',
  );
});

console.log(`foldInCensus.selfcheck: ${n} checks passed (no creature-only performer surface; one count home)`);
