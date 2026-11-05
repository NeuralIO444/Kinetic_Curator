// dishLifeStage.selfcheck.mjs — DISH LIFE slice 3c (#1923): the culture on the resolver's stage.
//
//   A off       no stamp = no work: layers untouched (same arrays), state dropped; junk stamps and empty stages are inert
//   B wake      the first stamped frame seeds from every visible layer's marks; gen 0 draws the scene alone; the culture rides the TOP layer
//   C advance   steps toward the stamped generation, bounded by shed; a stamp behind the culture rebuilds (replay seek)
//   D replay    the same stamp sequence = the same frames, frame by frame; any generation is the same culture however it was reached
//   E terrain   held/locked marks are never seeded or consumed, stay on their own layer exactly as dealt, colonies grow around them
//   F snapshot  a take can begin mid-culture: restore() continues bit-identically
import assert from 'node:assert/strict';
import { createDishLifeStage, isTerrain, isSpeck, SHED_STEPS } from './dishLifeStage.mjs';

const W = 1000;
const H = 500;
const mark = (x, y, extra = {}) => ({
  x,
  y,
  scale: 5,
  scaleY: 5,
  alpha: 80,
  assetId: 'a',
  color: '#111',
  accent: '#222',
  zTier: 1,
  glass: false,
  key: `m${x}-${y}`,
  ...extra,
});
const scene = () => [mark(250, 150), mark(500, 250), mark(750, 350), mark(300, 380, { assetId: 'b' }), mark(700, 120)];
const layers = (extra = {}) => [
  { id: 'L1', layoutParams: {}, items: scene(), ...extra },
  { id: 'FX', isFx: true },
  { id: 'L2', layoutParams: {}, items: [mark(120, 420), mark(880, 80)] },
  { id: 'P', isPattern: true, items: [] },
];
const stamp = (gen, wakeMs = 5000, shed = 0) => ({ wakeMs, gen, shed });

// ---- A: off
{
  const stage = createDishLifeStage();
  const ls = layers();
  const before = ls.map((l) => l.items);
  assert.equal(stage.apply(undefined, ls, W, H), false);
  assert.equal(stage.apply(null, ls, W, H), false);
  assert.equal(stage.apply({ wakeMs: NaN, gen: 3 }, ls, W, H), false, 'a junk stamp is inert');
  assert.equal(stage.apply('x', ls, W, H), false);
  ls.forEach((l, i) => assert.equal(l.items, before[i], 'no stamp: the very same item arrays, untouched'));
  assert.equal(stage.active, false);
  assert.equal(
    stage.apply(
      stamp(0),
      [
        { id: 'FX', isFx: true },
        { id: 'P', isPattern: true, items: [] },
      ],
      W,
      H,
    ),
    false,
    'no content layers: nothing to do',
  );
  assert.equal(stage.apply(stamp(0), [{ id: 'L', items: [] }], W, H), false, 'an empty stage never seeds');
  assert.equal(stage.apply(stamp(0), null, W, H), false);
  // a culture that was running is dropped the moment the stamp goes
  stage.apply(stamp(3), layers(), W, H);
  assert.equal(stage.active, true);
  stage.apply(undefined, layers(), W, H);
  assert.equal(stage.active, false, 'stamp gone: state dropped (a touch ends the culture)');
}

// ---- B: wake
{
  const stage = createDishLifeStage();
  const ls = layers();
  const originals = ls.map((l) => l.items);
  const originalCopy = JSON.parse(JSON.stringify(originals));
  assert.equal(stage.apply(stamp(0), ls, W, H), true);
  assert.equal(stage.generation, 0);
  assert.deepEqual(ls[0].items, [], 'lower content layers hand their marks to the culture');
  const top = ls[2].items;
  assert.equal(top.length, 7, 'generation 0 is the scene alone: all 7 marks, on the top layer');
  assert.deepEqual(
    top.map((m) => m.key).sort(),
    ['m120-420', 'm250-150', 'm300-380', 'm500-250', 'm700-120', 'm750-350', 'm880-80'],
    "every visible layer's marks, exactly as they were",
  );
  assert.deepEqual(ls[1], { id: 'FX', isFx: true }, 'FX layers are untouched');
  assert.deepEqual(ls[3], { id: 'P', isPattern: true, items: [] }, 'pattern layers are untouched');
  assert.deepEqual(
    JSON.parse(JSON.stringify(originals)),
    originalCopy,
    "the resolver's own arrays are never edited in place",
  );
  // a few generations in: scene dissolving, cells arriving, all ordinary placement items
  stage.apply(stamp(4), ls, W, H);
  const f = ls[2].items;
  const cells = f.filter((i) => String(i.key).startsWith('life:'));
  assert.ok(cells.length > 0, 'cells are drawn');
  assert.ok(
    f.some((i) => !String(i.key).startsWith('life:')),
    'the scene is still dissolving at gen 4',
  );
  for (const c of cells) {
    assert.ok(
      c.alpha > 0 && c.alpha <= 100 && Number.isFinite(c.x) && Number.isFinite(c.y) && c.scale > 0,
      'cells are valid placement items',
    );
    assert.ok(['a', 'b'].includes(c.assetId), "cells use the scene's own assets");
  }
  stage.apply(stamp(20), ls, W, H);
  assert.ok(
    ls[2].items.every((i) => String(i.key).startsWith('life:')),
    'after the dissolve only the culture is drawn',
  );
  assert.ok(ls[2].items.length <= 600, 'the mark budget holds');
}

// ---- C: advance
{
  const stage = createDishLifeStage();
  const ls = () => layers();
  stage.apply(stamp(0), ls(), W, H);
  stage.apply(stamp(3), ls(), W, H);
  assert.equal(stage.generation, 3);
  stage.apply(stamp(40), ls(), W, H);
  assert.equal(stage.generation, 3 + SHED_STEPS[0], 'a big jump catches up in bounded steps per frame');
  stage.apply(stamp(40, 5000, 1), ls(), W, H);
  assert.equal(stage.generation, 3 + SHED_STEPS[0] + 1, 'shed 1 trickles one generation per frame');
  const g = stage.generation;
  stage.apply(stamp(40, 5000, 2), ls(), W, H);
  assert.equal(stage.generation, g, 'shed 2 holds the culture');
  stage.apply(stamp(40, 5000, 99), ls(), W, H);
  assert.equal(stage.generation, g, 'a junk shed level clamps to hold, not to catch-up');
  assert.equal(SHED_STEPS[2], 0);
  // seeking back rebuilds and lands on the stamped generation
  const back = ls();
  stage.apply(stamp(2), back, W, H);
  assert.equal(stage.generation, 2, 'a stamp behind the culture rebuilds from the frozen seed');
  // a new wake is a new culture, seeded from the scene AS IT IS THEN (not the old frozen one)
  {
    const fresh = createDishLifeStage();
    fresh.apply(stamp(0, 5000), layers(), W, H);
    fresh.apply(stamp(6, 5000), layers(), W, H);
    const other = [{ id: 'L', items: [mark(111, 111), mark(222, 222), mark(333, 333)] }];
    fresh.apply(stamp(6, 77_000), other, W, H);
    assert.equal(fresh.generation, 4, 'a new wake restarts at generation 0 and catches up in bounded steps');
    const keys = other[0].items.map((i) => i.key).filter((x) => !String(x).startsWith('life:'));
    assert.ok(
      keys.every((x) => /^m(111|222|333)-/.test(x)),
      'the new wake seeds from the new scene, not the old one',
    );
  }
  // a new wake is a new culture
  stage.apply(stamp(0, 99_000), ls(), W, H);
  assert.equal(stage.generation, 0);
}

// ---- D: replay
{
  const seq = [0, 1, 2, 3, 4, 8, 12, 12, 13, 20, 30, 31].map((g) => stamp(g));
  const run = (shed = 0) => {
    const stage = createDishLifeStage();
    return seq.map((s) => {
      const ls = layers();
      stage.apply({ ...s, shed }, ls, W, H);
      return JSON.stringify(ls);
    });
  };
  assert.deepEqual(run(), run(), 'same stamps, same frames, frame by frame');
  // generation g is the same culture however it was reached: straight there, or via a long run and a seek back
  const direct = createDishLifeStage();
  direct.apply(stamp(0), layers(), W, H);
  for (let g = 1; g <= 12; g++) direct.apply(stamp(g), layers(), W, H);
  const lsA = layers();
  direct.apply(stamp(12), lsA, W, H);
  const roundTrip = createDishLifeStage();
  roundTrip.apply(stamp(0), layers(), W, H);
  for (const g of [5, 25, 9, 30, 12]) for (let k = 0; k < 8; k++) roundTrip.apply(stamp(g), layers(), W, H);
  const lsB = layers();
  roundTrip.apply(stamp(12), lsB, W, H);
  assert.equal(roundTrip.generation, 12);
  assert.equal(JSON.stringify(lsA), JSON.stringify(lsB), 'generation 12 is the same culture however it was reached');
}

// ---- E: terrain
{
  assert.equal(isTerrain({ held: true }), true);
  assert.equal(isTerrain({ locked: true }), true);
  assert.equal(isTerrain({}), false);
  assert.equal(isTerrain(null), false);
  const held = mark(500, 250, { held: true, key: 'poem', scale: 6 });
  const ls = () => [
    { id: 'L1', items: [...scene(), held] },
    { id: 'L2', items: [mark(120, 420)] },
  ];
  const stage = createDishLifeStage();
  const l0 = ls();
  stage.apply(stamp(0), l0, W, H);
  assert.deepEqual(
    l0[0].items.map((i) => i.key),
    ['poem'],
    'held marks stay on their own layer, exactly as dealt',
  );
  assert.deepEqual(l0[0].items[0], held, '…unedited');
  assert.ok(!l0[1].items.some((i) => i.key === 'poem'));
  assert.ok(l0[1].items.length === 5 + 1, 'the rest of the scene (6 non-held marks) rides the top layer');
  for (let g = 1; g <= 40; g++) {
    const l = ls();
    stage.apply(stamp(g), l, W, H);
    const cells = l[1].items.filter((i) => String(i.key).startsWith('life:'));
    assert.ok(
      cells.every((c) => Math.hypot(c.x - 500, c.y - 250) > 6 * 0.05 * 500 * 0.7),
      `gen ${g}: no cell lives under the held mark (bedrock)`,
    );
    assert.equal(l[0].items.length, 1, 'the held mark is always drawn, never consumed');
  }
  // terrain on the TOP layer is drawn once, with the culture frame (never lost, never doubled)
  {
    const topHeld = mark(500, 250, { held: true, key: 'poem-top', scale: 6 });
    const st2 = createDishLifeStage();
    for (let g = 0; g <= 6; g++) {
      const l = [
        { id: 'L1', items: scene() },
        { id: 'L2', items: [topHeld, mark(120, 420)] },
      ];
      st2.apply(stamp(g), l, W, H);
      assert.equal(
        l[1].items.filter((i) => i.key === 'poem-top').length,
        1,
        'a held mark on the top layer is drawn exactly once',
      );
    }
  }
  // terrain that appears AFTER the wake becomes bedrock from that frame on: what was under it dies and stays dead
  {
    const st3 = createDishLifeStage();
    for (let g = 0; g <= 5; g++) st3.apply(stamp(g), [{ id: 'L1', items: scene() }], W, H);
    const late = mark(500, 250, { held: true, key: 'late-poem', scale: 6 });
    for (let g = 6; g <= 30; g++) {
      const l = [{ id: 'L1', items: [...scene(), late] }];
      st3.apply(stamp(g), l, W, H);
      const under = l[0].items.filter(
        (i) => String(i.key).startsWith('life:') && Math.hypot(i.x - 500, i.y - 250) < 6 * 0.05 * 500 * 0.7,
      );
      assert.equal(under.length, 0, `gen ${g}: nothing lives under terrain that was locked mid-culture`);
    }
  }
  // the frozen seed is isolated from the live marks: editing the originals after the wake changes nothing
  {
    const st4 = createDishLifeStage();
    const sc = scene();
    st4.apply(stamp(0), [{ id: 'L1', items: sc }], W, H);
    sc[0].x = 999;
    sc[0].alpha = 1;
    const l = [{ id: 'L1', items: sc }];
    st4.apply(stamp(0), l, W, H);
    const m0 = l[0].items.find((i) => i.key === 'm250-150');
    assert.equal(m0.x, 250, 'the scene is frozen at the wake');
    assert.equal(m0.alpha, 80);
  }
  // only terrain on the stage: nothing to seed, nothing happens
  const only = createDishLifeStage();
  assert.equal(only.apply(stamp(0), [{ id: 'L', items: [held] }], W, H), false);
}

// ---- F: snapshot
{
  const a = createDishLifeStage();
  for (let g = 0; g <= 9; g++) a.apply(stamp(g), layers(), W, H);
  const snap = a.snapshot();
  assert.ok(snap && snap.gen === 9 && snap.marks.length === 7);
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap, 'the snapshot is JSON-safe');
  const b = createDishLifeStage();
  b.restore(JSON.parse(JSON.stringify(snap)));
  assert.equal(b.generation, 9);
  for (let g = 10; g <= 18; g++) {
    const la = layers();
    const lb = layers();
    a.apply(stamp(g), la, W, H);
    b.apply(stamp(g), lb, W, H);
    assert.equal(
      JSON.stringify(la),
      JSON.stringify(lb),
      `gen ${g}: a take that begins mid-culture continues bit-identically`,
    );
  }
  assert.equal(createDishLifeStage().snapshot(), null, 'nothing running: null');
  const z = createDishLifeStage();
  z.restore(null);
  z.restore({ marks: [] });
  assert.equal(z.active, false, 'junk snapshots restore nothing');
}

// ---- Q: the QUIET (secondary-read) mode — the culture is only a field; no layer is touched
{
  const quiet = (gen, wakeMs = 5000, strength = 0.5) => ({
    mode: 'quiet',
    wakeMs,
    gen,
    cycleGens: 48,
    shed: 0,
    strength,
  });
  const stage = createDishLifeStage();
  const ls = layers();
  const before = ls.map((l) => l.items);
  assert.equal(stage.field(), null, 'nothing yet: no field');
  assert.equal(stage.apply(quiet(0), ls, W, H), true, 'a quiet frame is applied');
  ls.forEach((l, i) =>
    assert.equal(l.items, before[i], 'quiet: the very same item arrays — nothing replaced or drawn'),
  );
  assert.equal(stage.generation, 0);
  assert.equal(stage.field().strength, 0, 'the envelope is 0 at the seed: the layer breathes in');
  for (let g = 1; g <= 24; g++) stage.apply(quiet(g), ls, W, H);
  const f = stage.field();
  assert.ok(f && Math.abs(f.strength - 0.5) < 1e-9, 'mid-cycle the field reads the dial at full envelope');
  assert.equal(f.gen, 24);
  const out = { level: 0, activity: 0 };
  let live = 0;
  for (let y = 0; y < H; y += 20) for (let x = 0; x < W; x += 20) if (f.sample(x, y, out) && out.level > 0) live++;
  assert.ok(live > 0, 'the field has living cells over the scene');
  stage.apply(quiet(25, 5000, 0.9), ls, W, H);
  assert.ok(
    Math.abs(stage.field().strength - 0.9 * Math.sin((Math.PI * 25) / 48)) < 1e-9,
    'the dial is live frame to frame',
  );
  // a new cycle re-seeds from what the scene is now
  const g1 = stage.generation;
  stage.apply(quiet(0, 11000), ls, W, H);
  assert.equal(stage.generation, 0, 'a new cycle starts again');
  assert.ok(g1 > 0);
  // snapshot keeps the dial: a take that begins mid-cycle reads the field on its first frame
  for (let g = 1; g <= 10; g++) stage.apply(quiet(g, 11000), ls, W, H);
  const snap = JSON.parse(JSON.stringify(stage.snapshot()));
  assert.deepEqual(snap.quiet, { strength: 0.5, cycleGens: 48 });
  const r = createDishLifeStage();
  r.restore(snap);
  assert.ok(
    Math.abs(r.field().strength - stage.field().strength) < 1e-9,
    'restored field matches before any new stamp',
  );
  // no stamp: the field is gone; a non-quiet stamp has no field
  stage.apply(undefined, ls, W, H);
  assert.equal(stage.field(), null);
  const t = createDishLifeStage();
  t.apply(stamp(3), layers(), W, H);
  assert.equal(t.field(), null, 'the takeover mode publishes no quiet field');
}

// ---- R: the tertiary specks ride the top layer in quiet mode — added, never replacing a mark, never stacking
{
  const quiet = (gen, strength = 0.8) => ({ mode: 'quiet', wakeMs: 5000, gen, cycleGens: 48, shed: 0, strength });
  const stage = createDishLifeStage();
  const small = () => scene().map((m) => ({ ...m, scale: 2, scaleY: 2 })); // gaps open up between small marks
  const layersS = () => [
    { id: 'L1', layoutParams: {}, items: small() },
    { id: 'L2', layoutParams: {}, items: [] },
  ];
  // run to mid-cycle on freshly dealt layers each frame, as the resolver does
  let last = null;
  for (let g = 0; g <= 24; g++) {
    last = layersS();
    stage.apply(quiet(g), last, W, H);
  }
  const top = last[last.length - 1];
  const specks = top.items.filter(isSpeck);
  assert.ok(specks.length > 0, 'mid-cycle: specks appear in the gaps');
  assert.equal(
    last[0].items.length + top.items.filter((it) => !isSpeck(it)).length,
    small().length,
    'every dealt mark is still there on its own layer; specks are only added',
  );
  for (let i = 0; i < last.length - 1; i++)
    assert.equal(last[i].items.filter(isSpeck).length, 0, 'only the top layer carries them');
  assert.ok(
    specks.every((s) => s.alpha > 0 && s.alpha < 25),
    'faint',
  );
  // the same layers applied twice never stack a previous frame's specks
  const again = layersS();
  stage.apply(quiet(24), again, W, H);
  const once = again[again.length - 1].items.length;
  stage.apply(quiet(24), again, W, H);
  assert.equal(again[again.length - 1].items.length, once, 'no stacking across frames');
  // reduced motion / specks off: the layers are exactly the dealt ones
  const off = layersS();
  const beforeOff = off.map((l) => l.items);
  stage.apply(quiet(24), off, W, H, { specks: false });
  off.forEach((l, i) => assert.equal(l.items, beforeOff[i], 'specks:false touches nothing'));
  // strength 0 → no specks even if stamped
  const zero = layersS();
  stage.apply(quiet(24, 0), zero, W, H);
  assert.equal(zero[zero.length - 1].items.filter(isSpeck).length, 0, 'strength 0 is silence');
  // a speck is never a seed: the next wake's marks exclude specks
  const wake = layersS();
  wake[wake.length - 1].items.push({ ...scene()[0], key: 'speck:1', x: 5, y: 5 });
  const fresh = createDishLifeStage();
  fresh.apply({ mode: 'quiet', wakeMs: 1, gen: 0, cycleGens: 48, shed: 0, strength: 0.5 }, wake, W, H);
  assert.equal(fresh.snapshot().marks.length, small().length, 'specks are not marks');
}
console.log('dishLifeStage.selfcheck: ok');
