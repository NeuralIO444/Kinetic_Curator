// beastDraw.selfcheck.mjs — #1866 BEAST S3: the drawn beast, at the builder's
// own contract (the resolver wiring is the coordinator's one-writer step;
// this suite drives createBeastBuilder exactly as liveResolve drives the
// other two families: append(input, entries, pool, motionFor, groundFor)).
//
// Acceptance, from the issue: (1) a wild-type beast at a pin visibly walks —
// flat stance, lifted return, no glide, no foot-skate; (2) a mutated genome
// walks differently; (3) cost registered (kernel suites own the registry —
// here: the item accounting the registration measures); (4) replay
// byte-stable. Plus the family laws: absent input field = inert, a
// stillbirth draws nothing, a dish-hosted pin grows no beast.
// node app/src/engine/beastDraw.selfcheck.mjs

import { createBeastBuilder, beastHostFromGenome, sanitizeMeasures, BEAST } from './beastBuilder.js';
import { wildTypeMeasures, JANSEN_RELATIVE } from './jansenMeasures.js';
import { evaluateGenome, solvePose } from './jansenSolver.js';
import { addJansenMeasures } from './creatureGenome.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const PALETTE = {
  ink: '#202028',
  bg: '#e8e2d4',
  swatches: ['#d43d1a', '#1a7a4a', '#2456c8', '#e8a00c'],
  accent: '#d43d1a',
};
const PIN = { x: 600, y: 520 };

function makeRig(host, { formed = true, hosted = false } = {}) {
  const builder = createBeastBuilder();
  const entries = [{ id: 'top', items: [], palette: PALETTE, morphSeed: 7 }];
  let driverSec = 0;
  const input = {
    dishPins: [{ ...PIN }],
    dishFormed: [formed],
    dishHosted: [hosted],
    beastHosts: [host],
    seed: 42,
    loopTimeMs: 0,
    canvasW: 1200,
    canvasH: 800,
  };
  const motionFor = () => ({
    driverSec,
    amounts: { drift: 0, breath: 0, pulse: 0 },
    canvasW: 1200,
    canvasH: 800,
    stillAssets: new Set(),
  });
  return {
    builder,
    entries,
    input,
    step(sec) {
      driverSec = sec;
      entries[0].items = [];
      builder.append(input, entries, [], motionFor, null);
      return entries[0].items;
    },
    warm(frames = 60) {
      for (let f = 0; f < frames; f++) this.step(0);
    },
  };
}

const wild = wildTypeMeasures();
const wildHost = { measures: wild, drive: 1, phase: 0 };
const PERIOD = 1 / BEAST.crankHz; // driver seconds per crank revolution at drive 1

// ── the gates ────────────────────────────────────────────────────────────────
ok('absent beastHosts (every pre-S3 take): the builder is inert', () => {
  const rig = makeRig(wildHost);
  delete rig.input.beastHosts;
  for (let f = 0; f < 5; f++) assert(rig.step(f * 0.1).length === 0, 'items appeared without the field');
});

ok('null host, unformed pin, dish-hosted pin: no beast', () => {
  assert(makeRig(null).step(0).length === 0, 'null host drew');
  assert(makeRig(wildHost, { formed: false }).step(0).length === 0, 'unformed pin drew');
  assert(makeRig(wildHost, { hosted: true }).step(0).length === 0, 'dish-hosted pin drew a beast over the dish creature');
});

ok('a stillbirth draws nothing (the gate is S2s, inside legal ranges)', () => {
  const still = { ...wild, m: JANSEN_RELATIVE.m * 1.3 }; // crank ×1.3: legal range, cannot assemble
  assert(evaluateGenome(still, 1).feasible === false, 'fixture must be a real stillbirth');
  const rig = makeRig({ measures: still, drive: 1, phase: 0 });
  for (let f = 0; f < 5; f++) assert(rig.step(f * 0.2).length === 0, 'stillbirth drew items');
});

// ── item accounting (what the cost registration measures) ────────────────────
ok('item accounting at the wild type: 12 legs × (12 bars + 8 nodes) + 1 beam, all creature stamps', () => {
  const rig = makeRig(wildHost);
  rig.warm();
  const items = rig.step(0);
  const bars = items.filter((it) => it.assetId === BEAST.barAsset);
  const nodes = items.filter((it) => it.assetId === BEAST.nodeAsset);
  assert(items.length === 241, `expected 241 items, got ${items.length}`);
  assert(bars.length === 145 && nodes.length === 96, `bars ${bars.length} / nodes ${nodes.length}`);
  assert(items.every((it) => it._creature === true), 'an item lacks the creature flag');
  assert(new Set(items.map((it) => it.key)).size === items.length, 'item keys are not unique');
});

// ── the anchor: builder transform vs the solver, independently ──────────────
ok('anchor: at driver 0 the drawn foot is the solvers foot, transformed', () => {
  const rig = makeRig(wildHost);
  rig.warm(); // grow-in complete: unitPx is exactly BEAST.pxPerUnit
  rig.step(0);
  const feet = rig.builder.lastFeet()[0];
  const ev = evaluateGenome(wild, 1);
  const expected = solvePose(wild, 0, 1).joints.F;
  const leg0OriginX = PIN.x + (0 - (wild.legCount - 1) / 2) * BEAST.legSpacingUnits * BEAST.pxPerUnit;
  const got = feet.feet[0];
  assert(Math.abs(got.x - (leg0OriginX + expected.x * BEAST.pxPerUnit)) < 1e-6, 'foot x off the solver');
  assert(
    Math.abs(got.y - (PIN.y + ev.stanceMean * BEAST.pxPerUnit - expected.y * BEAST.pxPerUnit)) < 1e-6,
    'foot y off the solver',
  );
});

// ── acceptance 1: the walk itself ────────────────────────────────────────────
ok('acceptance 1: flat stance on the ground line, monotone backward stroke, lifted return', () => {
  const rig = makeRig(wildHost);
  rig.warm();
  const SAMPLES = 120;
  const track = [];
  for (let s = 0; s < SAMPLES; s++) {
    rig.step((s / SAMPLES) * PERIOD);
    track.push(rig.builder.lastFeet()[0].feet[0]);
  }
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of track) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  // screen y grows downward: the ground line is the track's LOWEST reach (max screen y)
  const groundY = maxY;
  const band = groundY - 0.15 * (maxY - minY); // Wang's 15% stance band, mirrored to screen space
  const stance = track.filter((p) => p.y >= band);
  assert(stance.length > 10, `stance too short: ${stance.length} samples`);
  const step = Math.max(...stance.map((p) => p.x)) - Math.min(...stance.map((p) => p.x));
  const q = Math.floor(stance.length / 4);
  const mid = stance.slice(q, stance.length - q);
  const midRange = Math.max(...mid.map((p) => p.y)) - Math.min(...mid.map((p) => p.y));
  assert(midRange / step < 0.05, `mid-stance height range/step ${(midRange / step).toFixed(4)} >= 0.05 — stance not flat`);
  // no foot-skate: through stance the foot strokes backward (screen −x for a
  // right-facing beast), one direction only, while it stays on the ground line
  const stanceSeq = track.filter((p) => p.y >= band);
  for (let s = 1; s < stanceSeq.length; s++) {
    assert(stanceSeq[s].x < stanceSeq[s - 1].x + 1e-9, 'stance stroke reversed — the foot skates');
  }
  // the feet plant at the pin's ground: stance height sits on PIN.y
  const stanceMeanY = stance.reduce((sum, p) => sum + p.y, 0) / stance.length;
  assert(Math.abs(stanceMeanY - PIN.y) < 1, `stance plants at ${stanceMeanY}, not the pin ${PIN.y}`);
  // lifted return: swing clears the ground by the published clearance (scaled)
  const clearancePx = (maxY - minY) / BEAST.pxPerUnit;
  assert(Math.abs(clearancePx - evaluateGenome(wild, 1).clearance) < 0.5, `swing height ${clearancePx} off the solver`);
});

// ── acceptance 2: a mutant walks differently ─────────────────────────────────
ok('acceptance 2: a feasible mutant (h ×1.15) walks differently — higher step, shorter stride', () => {
  const mut = { ...wild, h: JANSEN_RELATIVE.h * 1.15 };
  const evM = evaluateGenome(mut, 1);
  const evW = evaluateGenome(wild, 1);
  assert(evM.feasible, 'mutant fixture must be feasible');
  assert(evM.clearance > evW.clearance + 0.15, 'mutant gait metrics must differ');
  const rigW = makeRig(wildHost);
  const rigM = makeRig({ measures: mut, drive: 1, phase: 0 });
  rigW.warm();
  rigM.warm();
  let maxDev = 0;
  for (let s = 0; s < 60; s++) {
    const t = (s / 60) * PERIOD;
    rigW.step(t);
    rigM.step(t);
    const a = rigW.builder.lastFeet()[0].feet[0];
    const b = rigM.builder.lastFeet()[0].feet[0];
    maxDev = Math.max(maxDev, Math.hypot(a.x - b.x, a.y - b.y));
  }
  assert(maxDev > 2, `drawn foot paths barely differ (${maxDev.toFixed(2)}px) — the mutant does not walk differently`);
});

// ── acceptance 4: replay byte-stable, snapshot continuation ──────────────────
ok('acceptance 4: replay byte-stable; a restored builder continues bit-identically', () => {
  const seq = [0, 0.13, 0.31, 0.58, 0.9, 1.27, 1.71, 2.2, 2.75];
  const run = (builder, rig) => seq.map((t) => JSON.stringify(rig.step(t)));
  const rigA = makeRig(wildHost);
  rigA.warm();
  const first = run(rigA.builder, rigA);
  const rigB = makeRig(wildHost);
  rigB.warm();
  assert(JSON.stringify(run(rigB.builder, rigB)) === JSON.stringify(first), 'two fresh builders diverged');
  // snapshot mid-run: continue both, one from a restored builder
  const snap = rigA.builder.snapshotState();
  const tailA = [2.9, 3.3].map((t) => JSON.stringify(rigA.step(t)));
  const rigC = makeRig(wildHost);
  assert(rigC.builder.restoreState(snap) === true, 'snapshot refused');
  const tailC = [2.9, 3.3].map((t) => JSON.stringify(rigC.step(t)));
  assert(JSON.stringify(tailC) === JSON.stringify(tailA), 'restored continuation diverged');
  assert(rigC.builder.restoreState({ ages: 'nope' }) === false, 'garbage snapshot accepted');
});

// ── the genome seam + sanitizer ──────────────────────────────────────────────
ok('genome seam: a full measure genome hosts; a measureless genome does not', () => {
  const genome = addJansenMeasures({ genes: [{ kind: 'plan', id: 'plan', value: 0 }] }, wild);
  const host = beastHostFromGenome(genome, 0);
  // the genome record rounds gene values to 4 places (creatureGenome's own
  // quantization — "rounding is part of the copy"), so compare at that grain
  assert(host && Math.abs(host.measures.k - wild.k) < 1e-4, 'genome host lost its measures');
  assert(beastHostFromGenome({ genes: [{ kind: 'plan', id: 'plan', value: 0 }] }, 0) === null, 'empty genome hosted');
  const clamped = sanitizeMeasures({ ...wild, k: JANSEN_RELATIVE.k * 1.5, legCount: 99 });
  assert(clamped.k <= JANSEN_RELATIVE.k * 1.02 + 1e-9, 'k escaped its tripwire');
  assert(clamped.legCount === 12, 'legCount escaped its range');
});

// ── the room dresses it: ground recolour + offset reach the items ────────────
ok('ground treatment reaches the beast (offset + recolour), like the marks', () => {
  const rig = makeRig(wildHost);
  rig.warm();
  const plain = rig.step(0);
  // groundFor returning a dish with a strong lean tile: items must move/recolour
  const groundFor = () => ({
    dish: {
      ground: () => '#336699',
      groundRoles: () => null,
      groundCell: () => ({ u: 0, v: 0.5, size: 10 }),
    },
    lean: 1,
    nudge: 1,
    snap: 0,
    shadow: 0,
  });
  rig.entries[0].items = [];
  rig.builder.append(rig.input, rig.entries, [], () => ({
    driverSec: 0,
    amounts: { drift: 0, breath: 0, pulse: 0 },
    canvasW: 1200,
    canvasH: 800,
    stillAssets: new Set(),
  }), groundFor);
  const dressed = rig.entries[0].items;
  assert(dressed.length === plain.length, 'ground changed the item count');
  const dx = dressed[0].x - plain[0].x;
  // groundNudge at u=0, amount 1: push = 0.5 × EDGE_BAND = 0.125 of the 10px cell
  assert(Math.abs(dx - 1.25) < 1e-6, `ground nudge moved the beast by ${dx}, expected 1.25`);
  assert(dressed[0].color !== plain[0].color, 'ground lean did not recolour the bars');
});

console.log(`beastDraw.selfcheck: ${n} checks passed`);
