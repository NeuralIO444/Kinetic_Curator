// emberDrive.selfcheck — #1837 (ACCUM as memory, rung 2 slice 2, of #1808):
// the ember-following drive on the moth. The acceptance, pinned:
//   · the ember field reads mid-age light as food and fresh / old / void
//     light as nothing, on BOTH read surfaces (true ages; the spectral
//     channel-ratio proxy when ages do not ride);
//   · the drive actually steers: a moth beside an ember moves toward it,
//     inside its leash, and does not move for fresh or dead light;
//   · non-collapse: a 10-minute soak at the declared default weight, no
//     single cell holds > 40% of the moths for > 30 s (#1808's bound);
//   · replay: same seed + inputs → identical creature tracks over 2,000
//     frames with steering on;
//   · the off paths are inert — no grid, no weight, the governor's shed,
//     a snapshot from before the slice — and a drifted moth walks home
//     when the drive goes off;
//   · the governor's rung (cut 1.48) sheds steering after the selective
//     feed and before the creature count, and the badge reports it;
//   · the live wire derives at cadence and holds one grid identity
//     between beats (the input log records identities, not copies).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AGE_VOID } from '../gl/accum.mjs';
import {
  emberWindow,
  emberField,
  emberSteerStep,
  emberRelaxStep,
  EMBER_OLD_S,
  EMBER_PEAK_T,
  EMBER_FRESH_T,
  EMBER_LEASH_CELLS,
  EMBER_HOME_PX,
} from './emberDrive.mjs';
import { createCreatureBuilder, MOTH_PARTS } from './creature.js';
import { ASSETS } from '../data/assets/index.js';
import { trailEmberWeight } from '../data/presets.js';
import { nextGovernorCut, shedSummary, GOVERNOR_RESTORE_CUTS } from '../hooks/governorCuts.js';
import {
  updateTrailSteerGrid,
  getTrailSteerGrid,
  clearTrailSteerGrid,
  TRAIL_STEER_EVERY,
} from '../gl/trailGridLive.mjs';

const W = 1600;
const H = 1100;
const COLS = 32;
const ROWS = 22;
const CELL = W / COLS; // 50 px, square at pair aspect

/** A hand-built trail grid (the shape deriveTrailGrid returns). */
function makeGrid({ hasAge = true } = {}) {
  const n = COLS * ROWS;
  return {
    cols: COLS,
    rows: ROWS,
    width: W,
    height: H,
    stamp: 0,
    hasAge,
    energy: new Float64Array(n),
    r: new Float64Array(n),
    g: new Float64Array(n),
    b: new Float64Array(n),
    age: new Float64Array(n).fill(AGE_VOID),
  };
}
const cellIdx = (cx, cy) => cy * COLS + cx;
/** The grid cell a scene point samples — the buffer's own mapping
 *  (sampleTrailGrid's convention: cx = floor(u·cols), cy = floor(v·rows)
 *  with v = 1 − y/H; grid row 0 is the buffer's bottom). */
const gridCx = (px) => Math.min(COLS - 1, Math.max(0, Math.floor((px / W) * COLS)));
const gridCy = (py) => Math.min(ROWS - 1, Math.max(0, Math.floor((1 - py / H) * ROWS)));
/** Lay a disc of light on the grid. Scene px centre; age in seconds (age
 *  path) or as a b/g ratio (proxy path). */
function layBlob(grid, px, py, radiusCells, { energy = 1, age = null, bgRatio = null } = {}) {
  const cx = gridCx(px);
  const cy = gridCy(py);
  for (let dy = -radiusCells; dy <= radiusCells; dy++) {
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      if (dx * dx + dy * dy > radiusCells * radiusCells) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      const c = cellIdx(x, y);
      grid.energy[c] = energy;
      grid.r[c] = energy;
      grid.g[c] = energy;
      grid.b[c] = energy * (bgRatio ?? 1);
      if (age !== null) grid.age[c] = age;
    }
  }
}

// ── the ember window + field ─────────────────────────────────────────

test('#1837 ember window: fresh and old are nothing, mid-age peaks', () => {
  assert.equal(emberWindow(0), 0);
  assert.equal(emberWindow(1), 0);
  assert.equal(emberWindow(EMBER_PEAK_T), 1);
  assert.equal(
    emberWindow(0.05),
    0,
    'the fresh deadband: just-laid light (incl. a moth\u2019s own) is not yet an ember',
  );
  assert.ok(emberWindow(0.2) > 0 && emberWindow(0.2) < 1);
  assert.ok(emberWindow(0.6) > 0 && emberWindow(0.6) < 1);
});

test('#1837 ember field (age path): only the mid-age blob is food', () => {
  const grid = makeGrid();
  layBlob(grid, 300, 300, 1, { age: 0 }); // fresh
  layBlob(grid, 800, 300, 1, { age: EMBER_OLD_S * EMBER_PEAK_T }); // peak age
  layBlob(grid, 1300, 300, 1, { age: EMBER_OLD_S + 2 }); // old
  layBlob(grid, 800, 800, 1, { age: 2, energy: 0.01 }); // below the energy floor
  const field = emberField(grid);
  const at = (px, py) => field[cellIdx(gridCx(px), gridCy(py))];
  assert.equal(at(300, 300), 0, 'fresh light is not an ember');
  assert.ok(Math.abs(at(800, 300) - 1) < 1e-9, `peak-age light is a full ember, got ${at(800, 300)}`);
  assert.equal(at(1300, 300), 0, 'old light is not an ember');
  assert.equal(at(800, 800), 0, 'a whisper of light is below the floor');
});

test('#1837 ember field (proxy path): the b/g ratio carries the age when ages do not ride', () => {
  const grid = makeGrid({ hasAge: false });
  layBlob(grid, 300, 300, 1, { bgRatio: 1.0 }); // fresh: spectrally whole
  layBlob(grid, 800, 300, 1, { bgRatio: 0.55 }); // mid: the blue has died back
  layBlob(grid, 1300, 300, 1, { bgRatio: 0.1 }); // old: past the measured tail
  const field = emberField(grid);
  const at = (px, py) => field[cellIdx(gridCx(px), gridCy(py))];
  assert.equal(at(300, 300), 0, 'fresh (b/g ≈ 1) reads no ember');
  assert.ok(at(800, 300) > 0.5, `mid-age ratio reads a strong ember, got ${at(800, 300)}`);
  assert.equal(at(1300, 300), 0, 'old (b/g at the tail) reads no ember');
});

test('#1837 the look declaration: DUSK FLOCK declares, the rest of the shelf is silent', () => {
  assert.equal(trailEmberWeight('dusk-flock'), 0.6);
  assert.equal(trailEmberWeight('praystation'), 0, 'an undeclared look is off');
  assert.equal(trailEmberWeight('no-such-look'), 0, 'an unknown look is off, not the first look');
  assert.equal(trailEmberWeight(undefined), 0);
});

// ── the pure steer step ──────────────────────────────────────────────

test('#1837 steer step: toward the ember, capped, leashed; flat field is a no-op', () => {
  const grid = makeGrid();
  layBlob(grid, 900, 550, 2, { age: EMBER_OLD_S * EMBER_PEAK_T });
  const field = emberField(grid);
  const start = { x: 0, y: 0 };
  const s1 = emberSteerStep({ grid, field, x: 700, y: 550, canvasW: W, canvasH: H, weight: 0.6, off: start });
  assert.ok(s1.x > 0 && Math.abs(s1.y) < 1e-9, `steps toward the ember (+x), got ${JSON.stringify(s1)}`);
  assert.ok(Math.hypot(s1.x, s1.y) <= 0.55 * 0.6 + 1e-9, 'one step never exceeds the capped speed × weight');
  // From beside the leash limit with the ember far away: the offset may
  // move but never past the leash.
  const far = { x: EMBER_LEASH_CELLS * CELL, y: 0 };
  const s2 = emberSteerStep({ grid, field, x: 700 + far.x, y: 550, canvasW: W, canvasH: H, weight: 1, off: far });
  assert.ok(Math.hypot(s2.x, s2.y) <= EMBER_LEASH_CELLS * CELL + 1e-9, 'the leash holds');
  // A dead field: no gradient, no pull, the offset is returned as-is.
  const dead = emberField(makeGrid());
  const s3 = emberSteerStep({ grid, field: dead, x: 700, y: 550, canvasW: W, canvasH: H, weight: 1, off: start });
  assert.deepEqual(s3, { x: 0, y: 0 });
  // Standing ON the ember (no slope underfoot, food below): the moth
  // grazes — the offset holds exactly.
  const grazing = emberSteerStep({
    grid,
    field,
    x: 900,
    y: 550,
    canvasW: W,
    canvasH: H,
    weight: 0.6,
    off: { x: 40, y: 0 },
  });
  assert.deepEqual(grazing, { x: 40, y: 0 }, 'grazing holds the borrowed ground');
  // No slope and nothing underfoot, away from home: the offset relaxes
  // one step toward the pin — borrowed ground is returned.
  const homing = emberSteerStep({
    grid,
    field: dead,
    x: 700,
    y: 550,
    canvasW: W,
    canvasH: H,
    weight: 1,
    off: { x: 40, y: 0 },
  });
  assert.ok(Math.abs(homing.x - (40 - EMBER_HOME_PX)) < 1e-12 && homing.y === 0, 'no food, no slope: one step home');
});

test('#1837 relax step: walks home at the named rate and lands exactly on the pin', () => {
  let off = { x: 1, y: 0 };
  off = emberRelaxStep(off);
  assert.ok(Math.abs(off.x - (1 - EMBER_HOME_PX)) < 1e-12);
  off = emberRelaxStep(off);
  off = emberRelaxStep(off);
  assert.deepEqual(emberRelaxStep(off), { x: 0, y: 0 }, 'the last partial step lands on exactly 0');
  assert.deepEqual(emberRelaxStep({ x: 0, y: 0 }), { x: 0, y: 0 }, 'zero stays zero (the inert off path)');
});

// ── the moth builder, driven ─────────────────────────────────────────

const PAL = { bg: '#111111', ink: '#eeeeee', swatches: ['#aa0000', '#222222', '#333333', '#444444'] };
const entry = () => [{ id: 'a', items: [{ x: 1, y: 1, assetId: 'x' }], palette: PAL }];
const bodyOf = (e) => e[0].items.find((i) => i._creature && i.assetId === MOTH_PARTS.body && !i.key.includes(':halo:'));
function runFrames(builder, input, frames, atFrame = null) {
  let e = null;
  for (let f = 0; f < frames; f++) {
    e = entry();
    builder.append({ ...input, loopTimeMs: f * (1000 / 60) }, e, ASSETS);
    if (atFrame) atFrame(f, e);
  }
  return e;
}
const PIN = { x: 500, y: 350 };
const baseInput = (over = {}) => ({
  dishPins: [{ ...PIN }],
  dishFormed: [true],
  seed: 77,
  seedOffsets: null,
  loopTimeMs: 0,
  assetAttach: {},
  canvasW: W,
  canvasH: H,
  ...over,
});

test('#1837 the moth steers to the ember — and only to the ember', () => {
  const grid = makeGrid();
  layBlob(grid, 675, 350, 2, { age: EMBER_OLD_S * EMBER_PEAK_T }); // ember, 175 px right of the pin
  const b = createCreatureBuilder();
  const dist = [];
  runFrames(b, baseInput({ trailGrid: grid, trailEmber: 0.6 }), 400, (f, e) => {
    const body = bodyOf(e);
    dist.push(Math.hypot(body.x - 675, body.y - 350));
  });
  assert.ok(
    dist[399] < dist[0] * 0.45,
    `the moth closes on the ember: ${dist[0].toFixed(1)} → ${dist[399].toFixed(1)} px`,
  );
  assert.ok(dist[399] < 80, 'and settles on it, inside the leash');
  // Fresh light at the same spot: not an ember — the moth never leaves its pin.
  const fresh = makeGrid();
  layBlob(fresh, 675, 350, 2, { age: 0 });
  const b2 = createCreatureBuilder();
  const e2 = runFrames(b2, baseInput({ trailGrid: fresh, trailEmber: 0.6 }), 240);
  assert.deepEqual([bodyOf(e2).x, bodyOf(e2).y], [PIN.x, PIN.y], 'fresh light draws nothing');
});

test('#1837 off paths are inert: no grid, no weight, shed — the moth is today\u2019s moth', () => {
  const grid = makeGrid();
  layBlob(grid, 675, 350, 2, { age: EMBER_OLD_S * EMBER_PEAK_T });
  const reference = createCreatureBuilder();
  const refTrack = [];
  runFrames(reference, baseInput(), 300, (f, e) => refTrack.push([bodyOf(e).x, bodyOf(e).y]));
  for (const over of [
    { trailGrid: grid, trailEmber: 0 }, // grid but no declared weight
    { trailGrid: grid, trailEmber: 0.6, trailSteerShed: true }, // the governor's shed
    { trailEmber: 0.6 }, // weight but no grid (ACCUM off)
  ]) {
    const b = createCreatureBuilder();
    const track = [];
    runFrames(b, baseInput(over), 300, (f, e) => track.push([bodyOf(e).x, bodyOf(e).y]));
    assert.deepEqual(track, refTrack, `inert under ${JSON.stringify(Object.keys(over))}`);
  }
});

test('#1837 a drifted moth walks home when the drive goes off, and lands on the pin', () => {
  const grid = makeGrid();
  layBlob(grid, 675, 350, 2, { age: EMBER_OLD_S * EMBER_PEAK_T });
  const b = createCreatureBuilder();
  runFrames(b, baseInput({ trailGrid: grid, trailEmber: 0.6 }), 300);
  const drifted = b.snapshotState();
  assert.ok(Math.hypot(drifted.steerX[0], drifted.steerY[0]) > 30, 'the moth really drifted');
  // Shed the drive: the offset walks home at EMBER_HOME_PX/frame and lands exactly.
  const framesHome = Math.ceil(Math.hypot(drifted.steerX[0], drifted.steerY[0]) / EMBER_HOME_PX) + 5;
  const e = runFrames(b, baseInput({ trailGrid: grid, trailEmber: 0.6, trailSteerShed: true }), framesHome);
  assert.deepEqual([bodyOf(e).x, bodyOf(e).y], [PIN.x, PIN.y], 'home again, on the pin');
  assert.deepEqual(b.snapshotState().steerX, [0]);
});

test('#1837 snapshot: steering state rides it; a pre-slice snapshot restores with moths on their pins', () => {
  const grid = makeGrid();
  layBlob(grid, 675, 350, 2, { age: EMBER_OLD_S * EMBER_PEAK_T });
  const input = baseInput({ trailGrid: grid, trailEmber: 0.6 });
  const a = createCreatureBuilder();
  runFrames(a, input, 200);
  const snap = a.snapshotState();
  assert.ok(Math.abs(snap.steerX[0]) > 10, 'the snapshot carries the drift');
  const contA = [];
  runFrames(a, input, 60, (f, e) => contA.push([bodyOf(e).x, bodyOf(e).y]));
  const b = createCreatureBuilder();
  assert.equal(b.restoreState(JSON.parse(JSON.stringify(snap))), true);
  const contB = [];
  runFrames(b, input, 60, (f, e) => contB.push([bodyOf(e).x, bodyOf(e).y]));
  assert.deepEqual(contB, contA, 'a restored take continues the same drift, frame for frame');
  // Pre-slice shape: no steer keys at all — valid, offsets zero.
  const old = { ages: snap.ages, pair2: snap.pair2, frame: snap.frame };
  const c = createCreatureBuilder();
  assert.equal(c.restoreState(old), true);
  assert.deepEqual(c.snapshotState().steerX, []);
  // Malformed steering state fails closed.
  assert.equal(createCreatureBuilder().restoreState({ ...snap, steerX: ['x'] }), false);
  assert.equal(
    createCreatureBuilder().restoreState({ ages: snap.ages, pair2: snap.pair2, frame: snap.frame, steerX: [1] }),
    false,
    'steerX without steerY refuses',
  );
});

test('#1837 replay: 2,000 frames with steering on replay identically', () => {
  // A grid sequence at the live cadence: a new grid every 15 frames, the
  // ember blob travelling slowly across the stage and ageing as it goes.
  const grids = [];
  for (let gI = 0; gI * 15 < 2000; gI++) {
    const grid = makeGrid();
    const bx = 400 + gI * 6;
    layBlob(grid, bx, 350, 2, { age: EMBER_OLD_S * EMBER_PEAK_T, energy: 0.95 });
    layBlob(grid, bx - 160, 620, 1, { age: 3.4, energy: 0.7 });
    grid.stamp = gI * 15;
    grids.push(grid);
  }
  const trackOf = () => {
    const b = createCreatureBuilder();
    const track = [];
    for (let f = 0; f < 2000; f++) {
      const e = entry();
      b.append(
        baseInput({ trailGrid: grids[Math.floor(f / 15)], trailEmber: 0.6, loopTimeMs: f * (1000 / 60) }),
        e,
        ASSETS,
      );
      const body = bodyOf(e);
      track.push([body.x, body.y]);
    }
    return track;
  };
  const t1 = trackOf();
  const t2 = trackOf();
  assert.deepEqual(t2, t1, 'identical tracks over 2,000 frames');
  assert.ok(
    Math.hypot(t1[1999][0] - PIN.x, t1[1999][1] - PIN.y) > 20,
    'and the run really steered (not a vacuous replay)',
  );
});

// ── non-collapse soak (#1808's bound, at the declared default weight) ─

test('#1837 non-collapse soak: 10 minutes, no cell holds >40% of the moths for >30 s', () => {
  const DT = 1 / 60;
  const FRAMES = 10 * 60 * 60; // 36,000
  const PINS = [
    { x: 710, y: 490 },
    { x: 800, y: 470 },
    { x: 890, y: 490 },
    { x: 720, y: 600 },
    { x: 810, y: 620 },
    { x: 895, y: 600 },
  ];
  const grid = makeGrid();
  let s = 424243;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const moths = PINS.map((pin) => ({ pin, off: { x: 0, y: 0 } }));
  const KEEP = Math.pow(0.5, DT / 7.7); // the buffer's fade: ~7.7 s half-life
  let streak = new Map(); // cell -> consecutive frames at >40% occupancy
  let maxStreak = 0;
  let maxDrift = 0;
  let nextStroke = 0;
  for (let f = 0; f < FRAMES; f++) {
    // The field lives: light ages and fades; dead light lets go of its age.
    for (let c = 0; c < COLS * ROWS; c++) {
      if (grid.energy[c] > 0) {
        grid.energy[c] *= KEEP;
        if (grid.age[c] >= 0) grid.age[c] += DT;
        if (grid.energy[c] < 0.02) {
          grid.energy[c] = 0;
          grid.age[c] = AGE_VOID;
        }
      }
    }
    // New strokes land around the dish every few seconds — drawn light,
    // fresh (age 0), which cools through the ember window and dies.
    if (f >= nextStroke) {
      nextStroke = f + Math.floor((4 + rnd() * 4) * 60);
      layBlob(grid, 620 + rnd() * 380, 380 + rnd() * 340, 1, { age: 0, energy: 1.1 });
    }
    // Each moth's own drawn light keeps its cell young — the physical
    // reason camping fails in the real buffer too.
    const field = emberField(grid);
    for (const m of moths) {
      const px = m.pin.x + m.off.x;
      const py = m.pin.y + m.off.y;
      m.off = emberSteerStep({ grid, field, x: px, y: py, canvasW: W, canvasH: H, weight: 0.6, off: m.off });
      maxDrift = Math.max(maxDrift, Math.hypot(m.off.x, m.off.y));
      const c = gridCy(py) * COLS + gridCx(px);
      grid.energy[c] = Math.min(1.1, grid.energy[c] + 0.015);
      if (grid.age[c] >= 0) grid.age[c] *= 0.95;
      else grid.age[c] = 0;
    }
    // Occupancy: >40% of 6 moths in one cell = 3 or more.
    const counts = new Map();
    for (const m of moths) {
      const c = gridCy(m.pin.y + m.off.y) * COLS + gridCx(m.pin.x + m.off.x);
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    const next = new Map();
    for (const [c, n] of counts) {
      if (n >= 3) {
        const v = (streak.get(c) || 0) + 1;
        next.set(c, v);
        if (v > maxStreak) maxStreak = v;
      }
    }
    streak = next;
  }
  assert.ok(maxDrift > 60, `the soak really steered (max drift ${maxDrift.toFixed(0)} px) — not a vacuous pass`);
  assert.ok(
    maxStreak <= 30 * 60,
    `no cell held >40% of the moths for >30 s (worst streak ${(maxStreak / 60).toFixed(1)} s)`,
  );
});

// ── the governor rung + the live wire ────────────────────────────────

test('#1837 governor: cut 1.48 sheds steering after the feed, before the population; the badge reports it', () => {
  const restore = GOVERNOR_RESTORE_CUTS.find((c) => c.kind === 'trailSteer');
  assert.ok(restore, 'the rung has a restore entry (trap #2)');
  assert.equal(restore.needsRestore({ trailSteerShed: true }, { healthy: true }), true);
  assert.equal(restore.needsRestore({ trailSteerShed: true }, { healthy: false }), false);
  const walk = (over) => ({
    fxaa: false,
    renderScale: 0.33,
    quality: 'performance',
    assetThin: true,
    perfClampOverride: { count: 100 },
    effectiveCount: 100,
    slowRender: true,
    gpuSaturated: false,
    creatureCount: 4,
    creatureShed: 0,
    ...over,
  });
  const s1 = walk({ accumFeedActive: true, accumFeedShed: false, trailSteerActive: true, trailSteerShed: false });
  const c1 = nextGovernorCut(s1);
  assert.equal(c1.kind, 'accumFeed', 'the feed still sheds first in the family');
  const c2 = nextGovernorCut({ ...s1, accumFeedShed: true });
  assert.equal(c2.kind, 'trailSteer', 'steering sheds next — ahead of the creature count');
  const c3 = nextGovernorCut({ ...s1, accumFeedShed: true, trailSteerShed: true });
  assert.equal(c3.kind, 'creatureCount', 'only then does the population shed');
  // Not live: the ladder is exactly the pre-#1837 ladder.
  const c4 = nextGovernorCut(walk({ accumFeedActive: false, trailSteerActive: false }));
  assert.equal(c4.kind, 'creatureCount');
  assert.deepEqual(shedSummary({ renderScale: 1, trailSteerShed: true }), ['ember steering held']);
});

test('#1837 live wire: derivation at cadence, one identity between beats, clear empties it', () => {
  clearTrailSteerGrid();
  const data = new Float32Array(64 * 44 * 4);
  data[0] = 0.5;
  data[1] = 0.5;
  data[2] = 0.5;
  data[3] = 1;
  let stamp = 100;
  const fakeAccum = {
    statsFrame: () => stamp,
    readTrail: () => ({ data, ageData: null, width: 64, height: 44, stamp }),
  };
  updateTrailSteerGrid(fakeAccum);
  const g1 = getTrailSteerGrid();
  assert.ok(g1 && g1.stamp === 100, 'the first offer derives immediately');
  stamp += TRAIL_STEER_EVERY - 1;
  updateTrailSteerGrid(fakeAccum);
  assert.equal(getTrailSteerGrid(), g1, 'inside the beat, the held grid is the same object');
  stamp += 1;
  updateTrailSteerGrid(fakeAccum);
  const g2 = getTrailSteerGrid();
  assert.ok(g2 && g2 !== g1 && g2.stamp === 115, 'on the beat, a fresh grid lands');
  clearTrailSteerGrid();
  assert.equal(getTrailSteerGrid(), null, 'the session end empties the wire');
});
