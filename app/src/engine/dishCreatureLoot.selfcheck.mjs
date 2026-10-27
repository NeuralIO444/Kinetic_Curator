// node src/engine/dishCreatureLoot.selfcheck.mjs
// The creature loot on the dish creature, each behind an input field older takes do not carry:
//   #1731 bounds (reflection), #1732 facing (the dot product), #1734-#1737 the ALife creature (genome, chemistry,
//   policy, dreaming). Gates off = the older animal, byte for byte; gates on = seeded, replayable, snapshot-safe.
import assert from 'node:assert/strict';
import { ASSETS } from '../data/assets/index.js';
import { createDishCreatureBuilder, reflectInBounds, DISH_RADII } from './dishCreature.js';
import { genomeFromTraits } from './creatureGenome.js';
import { HATCH_FRAMES, parseCreatureRecord } from './creatureDream.js';

const PAL = { bg: '#0b0e12', ink: '#e8e4da', swatches: ['#7fe07a', '#2ec4b6', '#e0a458', '#b678e0'] };
const PINS = [
  { x: 500, y: 350 },
  { x: 220, y: 180 },
];
const entry = () => [{ id: 'a', items: [], palette: PAL }];
const motionFor = (frame) => () => ({
  driverSec: frame / 60,
  amounts: { breath: 0.5, drift: 1 },
  canvasW: 1000,
  canvasH: 700,
});
const input = (frame, over = {}) => ({
  dishPins: PINS,
  dishFormed: [true, true],
  dishHosted: [true, false],
  seed: 4242,
  seedOffsets: null,
  loopTimeMs: frame * 16.666,
  reducedMotion: false,
  assetAttach: {},
  canvasW: 1000,
  canvasH: 700,
  ...(typeof over === 'function' ? over(frame) : over),
});
function run(n, over = {}, b = createDishCreatureBuilder(), from = 0) {
  let e = entry();
  for (let f = from; f < n; f++) {
    e = entry();
    b.append(input(f, over), e, ASSETS, motionFor(f));
  }
  return { b, e };
}
const sig = (r) => JSON.stringify(r.e[0].items) + JSON.stringify(r.b.lastBodies());

// 1 — gates off is the older animal: explicit false flags (and a genome with ALife off) change nothing
{
  const plain = sig(run(200));
  const g = genomeFromTraits({}, 4242, 'off');
  assert.equal(
    sig(
      run(200, {
        creatureFacing: false,
        creatureBounds: false,
        creatureAlife: false,
        dishGenomes: [g, null],
        creatureKeeps: 3,
      }),
    ),
    plain,
  );
}

// 2 — #1731 reflection: speed kept, the outward component flips, the disc lands inside
{
  const sys = { x: [-4], y: [50], vx: [-3], vy: [1] };
  assert.ok(reflectInBounds(sys, 0, 10, 100, 100));
  assert.equal(sys.x[0], 24);
  assert.equal(sys.vx[0], 3);
  assert.equal(sys.vy[0], 1);
  const far = { x: [-500], y: [50], vx: [0], vy: [0] };
  reflectInBounds(far, 0, 10, 100, 100);
  assert.ok(far.x[0] >= 10 && far.x[0] <= 90, 'a far overshoot is clamped inside, never past the other side');
  // a creature born against the corner stays on the stage with bounds on; without, it hangs off the edge
  const corner = { dishPins: [{ x: 0, y: 0 }, PINS[1]] };
  const outside = (d) => d.x - d.r < -1e-9 || d.y - d.r < -1e-9 || d.x + d.r > 1000 + 1e-9 || d.y + d.r > 700 + 1e-9;
  const everOut = (over) => {
    const b = createDishCreatureBuilder();
    let out = 0;
    for (let f = 0; f < 240; f++) {
      b.append(input(f, over), entry(), ASSETS, motionFor(f));
      out += b.lastBodies()[0].filter(outside).length;
    }
    return out;
  };
  assert.ok(everOut(corner) > 0, 'without bounds a body born on the corner hangs off the stage');
  assert.equal(everOut({ ...corner, creatureBounds: true }), 0, 'with bounds no disc ever ends a frame off the stage');
}

// 3 — #1732 facing: an alignment in [-1, 1] is published, the head leans with the flow, and an attractor turns it
{
  let sum = 0;
  let n = 0;
  const b = createDishCreatureBuilder();
  for (let f = 0; f < 400; f++) {
    b.append(input(f, { creatureFacing: true }), entry(), ASSETS, motionFor(f));
    const a = b.lastBodies()[0][0].facing;
    assert.ok(Number.isFinite(a) && a >= -1 && a <= 1);
    if (f >= 100) {
      sum += a;
      n++;
    }
  }
  assert.ok(sum / n > 0, `the head leans with the flow (mean alignment ${(sum / n).toFixed(2)})`);
  const toward = (over) => {
    const r = run(300, over);
    const h = r.b.lastBodies()[0][0];
    const eye = r.e[0].items.find((i) => i.key === 'dish:0:0:eye');
    return Math.cos(Math.atan2(eye.y - h.y, eye.x - h.x) - Math.atan2(350 - h.y, 990 - h.x));
  };
  const attr = { x: 990, y: 350 };
  assert.ok(
    toward({ creatureFacing: true, attractor: attr }) > toward({ creatureFacing: true }),
    'the attractor turns the head toward it',
  );
}

// 4 — the ALife creature (#1734-#1737)
const G = genomeFromTraits({ body: 1, swatch: 0 }, 4242, 'wild:0');
const alife =
  (keeps = () => 0) =>
  (f) => ({ creatureAlife: true, creatureFacing: true, dishGenomes: [G, null], creatureKeeps: keeps(f) });
{
  // hatching: dreaming (no eye) through HATCH_FRAMES, resting; then it opens its eyes and behaves
  const early = run(HATCH_FRAMES - 10, alife());
  assert.ok(!early.e[0].items.some((i) => i.key === 'dish:0:0:eye'), 'a hatching creature draws no eye');
  assert.equal(early.b.lastBodies()[0][0].mode, 'rest', 'and rests');
  const later = run(HATCH_FRAMES + 40, alife());
  assert.ok(
    later.e[0].items.some((i) => i.key === 'dish:0:0:eye'),
    'after hatching it opens its eyes',
  );
  // the newborn already knows its instincts; records are per pin, round-trip, null where no genome
  const recs = later.b.getCreatureRecords();
  assert.equal(recs[1], null);
  const back = parseCreatureRecord(JSON.parse(JSON.stringify(recs[0])));
  assert.ok(back && back.policy.ltw.some((v) => v > 0), 'its education is written and portable');
  // a genome change is a new animal (rebirth): eyes shut again
  const G2 = genomeFromTraits({ body: 1.1, swatch: 1 }, 4242, 'wild:1');
  const b = later.b;
  const e = entry();
  b.append(
    input(HATCH_FRAMES + 40, { creatureAlife: true, dishGenomes: [G2, null], creatureKeeps: 0 }),
    e,
    ASSETS,
    motionFor(HATCH_FRAMES + 40),
  );
  assert.ok(!e[0].items.some((i) => i.key === 'dish:0:0:eye'), 'a new genome is born again');
}
{
  // keeps consolidate: a keep serial that rises folds short-term into long-term weights (LTW moves)
  const quiet = run(600, alife()).b.getCreatureRecords()[0].ltw;
  const kept = run(
    600,
    alife((f) => Math.floor(f / 90)),
  ).b.getCreatureRecords()[0].ltw;
  assert.notDeepEqual(kept, quiet, 'keeps change what it remembers');
  // replay law: same inputs, same animal; snapshot mid-life and continue = never stopped
  const keeps = (f) => Math.floor(f / 90);
  assert.equal(sig(run(500, alife(keeps))), sig(run(500, alife(keeps))));
  const a = run(250, alife(keeps));
  const snap = JSON.parse(JSON.stringify(a.b.snapshotState()));
  const c = createDishCreatureBuilder();
  assert.ok(c.restoreState(snap));
  assert.equal(
    sig(run(500, alife(keeps), c, 250)),
    sig(run(500, alife(keeps), a.b, 250)),
    'a restored creature lives on identically',
  );
  // modes actually vary once it behaves (the policy is choosing, not stuck)
  const modes = new Set();
  const m = createDishCreatureBuilder();
  for (let f = 0; f < 1500; f++) {
    m.append(input(f, alife(keeps)), entry(), ASSETS, motionFor(f));
    if (f > HATCH_FRAMES) modes.add(m.lastBodies()[0][0].mode);
  }
  assert.ok(modes.size >= 2, `the creature behaves (${[...modes].join(', ')})`);
  assert.equal(m.lastBodies()[0].length, DISH_RADII.length);
}

console.log('dishCreatureLoot.selfcheck: ok (#1731 #1732 #1734-#1737)');
