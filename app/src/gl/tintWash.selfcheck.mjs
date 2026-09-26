// tintWash.selfcheck.mjs — #624: the WASH soak's contract.
// The wavefront is center-out and seeded; every adoption completes by t=1;
// rapid re-taps re-base from displayed colors; MIX 0 is an instant cut.
import assert from 'node:assert/strict';
import {
  createTintWash, applyWash, colorMap, washKey, paletteIdentity,
  hash01, hexToRgb, rgbToHex, lerpHex, smootherstep,
  waveRank, adoptionDelay,
  WASH_SALT, WASH_WAVE_SPAN, WASH_JITTER_SPAN, WASH_ADOPT_SPAN,
} from './tintWash.mjs';

let n = 0;
function ok(name, fn) {
  n++;
  try { fn(); console.log(`ok ${n} - ${name}`); }
  catch (e) { console.error(`not ok ${n} - ${name}\n  ${e.message}`); process.exitCode = 1; }
}

/** A fake resolveLayers() result: one layer, items with x/y/color/accent. */
function fakeResolved(items, layerId = 'L1') {
  return [{ id: layerId, isFx: false, items }];
}
const mkItem = (x, y, color = '#111111', accent = '#222222') => ({ x, y, color, accent });

const baseInput = (over = {}) => ({
  identity: paletteIdentity('p1', null, null), mode: 'WASH',
  mixSeconds: 2, now: 0, seed: 7, bg: '#000000', lastResolved: null, ...over,
});
const id2 = () => paletteIdentity('p2', null, null);

ok('color utils: hex round-trips and lerps', () => {
  assert.deepEqual(hexToRgb('#ff0000'), [255, 0, 0]);
  assert.deepEqual(hexToRgb('#0f0'), [0, 255, 0]);
  assert.deepEqual(hexToRgb('abc'), [170, 187, 204]);
  assert.equal(hexToRgb('nope'), null);
  assert.equal(hexToRgb(null), null);
  assert.equal(rgbToHex([255, 0, 0]), '#ff0000');
  assert.equal(lerpHex('#000000', '#ffffff', 0), '#000000');
  assert.equal(lerpHex('#000000', '#ffffff', 1), '#ffffff');
  // garbage never blanks an item: degrades to the good side
  assert.equal(lerpHex('junk', '#ffffff', 0.5), '#ffffff');
  assert.equal(lerpHex('#000000', 'junk', 0.5), '#000000');
  assert.ok(Math.abs(smootherstep(0.5) - 0.5) < 1e-9, 'smootherstep is symmetric');
  assert.equal(smootherstep(0), 0);
  assert.equal(smootherstep(1), 1);
});

ok('waveRank: center first, corners last, garbage mid-field', () => {
  assert.equal(waveRank(500, 350), 0);
  assert.ok(waveRank(0, 0) > 0.99, 'corner ranks ~1');
  assert.ok(waveRank(1000, 350) < waveRank(0, 0), 'edge midpoint ranks below the corner');
  assert.equal(waveRank(NaN, 10), 0.5);
  assert.equal(waveRank(undefined, undefined), 0.5);
});

ok('schedule: seeded, bounded, wave spans the wash', () => {
  const a = adoptionDelay(3, 7, 0.4);
  const b = adoptionDelay(3, 7, 0.4);
  assert.equal(a, b, 'same (index, seed) replays the same delay');
  const c = adoptionDelay(3, 8, 0.4);
  assert.notEqual(a, c, 'a different seed jitters differently');
  // bounds: rank in [0,1], jitter in [0,1)
  for (let i = 0; i < 50; i++) {
    const d = adoptionDelay(i, 7, Math.random());
    assert.ok(d >= 0 && d < WASH_WAVE_SPAN + WASH_JITTER_SPAN, `delay ${d} in range`);
    assert.ok(d + WASH_ADOPT_SPAN <= 1 + 1e-9, 'every adoption completes by t=1');
  }
  assert.ok(Math.abs(WASH_WAVE_SPAN + WASH_JITTER_SPAN + WASH_ADOPT_SPAN - 1) < 1e-9,
    'spans sum to exactly 1');
  // wavefront order: center item starts before corner item, same seed
  const dCenter = adoptionDelay(0, 7, 0);
  const dCorner = adoptionDelay(0, 7, 1);
  assert.ok(dCenter < dCorner, 'center adopts before the corner');
});

ok('hash01 is index-stable and spread', () => {
  assert.equal(hash01(5, 11), hash01(5, 11));
  const vals = Array.from({ length: 20 }, (_, i) => hash01(i, 11));
  assert.ok(new Set(vals).size > 15, 'jitter actually varies per node');
  assert.ok(vals.every((v) => v >= 0 && v < 1), 'hash in [0,1)');
});

ok('idle when nothing changed; starts on palette identity change', () => {
  const w = createTintWash();
  const r1 = w.update(baseInput({ lastResolved: fakeResolved([mkItem(500, 350)]) }));
  assert.equal(r1.washing, false, 'first sighting only baselines, no wash');
  const r2 = w.update(baseInput({ now: 100, lastResolved: fakeResolved([mkItem(500, 350)]) }));
  assert.equal(r2.washing, false, 'same identity stays idle');
  const r3 = w.update(baseInput({ identity: id2(), now: 200, lastResolved: fakeResolved([mkItem(500, 350)]) }));
  assert.equal(r3.washing, true, 'palette id change starts the soak');
  assert.equal(r3.t, 0, 'clock starts at t=0');
});

ok('non-WASH modes never soak', () => {
  for (const mode of ['FADE', 'INJECT', undefined]) {
    const w = createTintWash();
    w.update(baseInput({ mode, lastResolved: fakeResolved([mkItem(0, 0)]) }));
    const r = w.update(baseInput({ mode, identity: id2(), now: 100, lastResolved: fakeResolved([mkItem(0, 0)]) }));
    assert.equal(r.washing, false, `mode ${mode} does not start a wash`);
  }
});

ok('MIX 0 is an instant cut, like everywhere else', () => {
  const w = createTintWash();
  w.update(baseInput({ lastResolved: fakeResolved([mkItem(0, 0)]) }));
  const r = w.update(baseInput({ identity: id2(), mixSeconds: 0, now: 50, bg: '#ffffff', lastResolved: fakeResolved([mkItem(0, 0, '#ffffff')]) }));
  assert.equal(r.washing, false);
  assert.equal(r.bg, '#ffffff', 'bg cuts straight to the new palette');
});

ok('applyWash: center adopts before the corner, old colors hold until their delay', () => {
  const w = createTintWash();
  const oldItems = fakeResolved([mkItem(500, 350, '#111111', '#222222'), mkItem(0, 0, '#111111', '#222222')]);
  w.update(baseInput({ lastResolved: oldItems }));
  // palette flips: new items carry the new colors
  const newItems = fakeResolved([mkItem(500, 350, '#eeeeee', '#dddddd'), mkItem(0, 0, '#eeeeee', '#dddddd')]);
  const ev = w.update(baseInput({ identity: id2(), now: 0, bg: '#ffffff', lastResolved: oldItems }));
  assert.equal(ev.washing, true);

  // t=0: nothing adopted yet — both show old colors
  applyWash(newItems, { ...ev, t: 0 });
  assert.equal(newItems[0].items[0].color, '#111111', 'center still old at t=0');
  assert.equal(newItems[0].items[1].color, '#111111', 'corner still old at t=0');

  // mid-wash: the center (rank 0, small jitter) has started; the corner (rank ~1) has not
  const tMid = 0.35;
  const dCenter = adoptionDelay(0, 7, waveRank(500, 350));
  const dCorner = adoptionDelay(1, 7, waveRank(0, 0));
  assert.ok(dCenter < tMid && dCorner > tMid, 'test premise: mid-wash splits the two');
  const midItems = fakeResolved([mkItem(500, 350, '#eeeeee', '#dddddd'), mkItem(0, 0, '#eeeeee', '#dddddd')]);
  applyWash(midItems, { ...ev, t: tMid });
  assert.notEqual(midItems[0].items[0].color, '#111111', 'center is adopting mid-wash');
  assert.equal(midItems[0].items[1].color, '#111111', 'corner still holds old mid-wash');

  // t=1: everything fully new
  const endItems = fakeResolved([mkItem(500, 350, '#eeeeee', '#dddddd'), mkItem(0, 0, '#eeeeee', '#dddddd')]);
  applyWash(endItems, { ...ev, t: 1 });
  assert.equal(endItems[0].items[0].color, '#eeeeee');
  assert.equal(endItems[0].items[1].color, '#eeeeee');
});

ok('bg lerps over the whole wash', () => {
  const w = createTintWash();
  w.update(baseInput({ bg: '#000000', lastResolved: fakeResolved([]) }));
  const ev = w.update(baseInput({ identity: id2(), now: 1000, bg: '#ffffff', lastResolved: fakeResolved([]) }));
  assert.equal(ev.bg, '#000000', 'bg starts old');
  const mid = w.update(baseInput({ identity: id2(), now: 2000, bg: '#ffffff', lastResolved: fakeResolved([]) }));
  assert.equal(mid.bg, '#808080', 'bg is halfway at t=0.5');
  const done = w.update(baseInput({ identity: id2(), now: 3000, bg: '#ffffff', lastResolved: fakeResolved([]) }));
  assert.equal(done.washing, false);
  assert.equal(done.bg, '#ffffff', 'bg lands new at t=1');
});

ok('rapid re-tap re-bases from displayed colors (DJ re-base)', () => {
  const w = createTintWash();
  const oldItems = fakeResolved([mkItem(500, 350, '#111111', '#222222')]);
  w.update(baseInput({ lastResolved: oldItems }));
  const ev1 = w.update(baseInput({ identity: id2(), now: 0, bg: '#111111', lastResolved: oldItems }));
  // run to mid-adoption with the first wash displayed: pick t strictly inside
  // this item's own adoption window so the displayed color is genuinely between
  const d0 = adoptionDelay(0, 7, waveRank(500, 350));
  const tMidAdopt = d0 + WASH_ADOPT_SPAN / 2;
  const shown1 = fakeResolved([mkItem(500, 350, '#eeeeee', '#dddddd')]);
  applyWash(shown1, { ...ev1, t: tMidAdopt });
  const displayedMid = shown1[0].items[0].color;
  assert.notEqual(displayedMid, '#111111', 'premise: mid-wash color is between');
  assert.notEqual(displayedMid, '#eeeeee', 'premise: mid-wash color is between');
  // second tap: re-base — the new "from" is the displayed mid-wash color
  const shown2 = fakeResolved([mkItem(500, 350, '#0000ff', '#0000cc')]);
  const ev2 = w.update(baseInput({ id: 'p3', now: 1000, bg: '#0000ff', lastResolved: shown1 }));
  assert.equal(ev2.washing, true, 're-tap restarts the soak');
  assert.equal(ev2.t, 0, 'clock restarts');
  applyWash(shown2, { ...ev2, t: 0 });
  assert.equal(shown2[0].items[0].color, displayedMid, 're-based from displayed, not from the first palette');
});

ok('colorMap keys are layer-scoped; FX layers skipped', () => {
  const m = colorMap([
    { id: 'A', isFx: false, items: [mkItem(0, 0, '#111111', '#222222')] },
    { id: 'B', isFx: false, items: [mkItem(0, 0, '#333333', '#444444')] },
    { id: 'FX', isFx: true, items: [mkItem(0, 0, '#555555', '#666666')] },
  ]);
  assert.equal(m.get(washKey('A', 0)).color, '#111111');
  assert.equal(m.get(washKey('B', 0)).color, '#333333');
  assert.equal(m.has(washKey('FX', 0)), false, 'FX layers carry no items');
  assert.equal(colorMap(null).size, 0, 'null-safe');
  assert.equal(colorMap('junk').size, 0, 'garbage-safe');
});

ok('wash completes and hands off cleanly at t=1', () => {
  const w = createTintWash();
  w.update(baseInput({ lastResolved: fakeResolved([mkItem(0, 0)]) }));
  w.update(baseInput({ identity: id2(), now: 0, bg: '#ffffff', lastResolved: fakeResolved([mkItem(0, 0)]) }));
  const done = w.update(baseInput({ identity: id2(), now: 2000, bg: '#ffffff', lastResolved: fakeResolved([mkItem(0, 0, '#ffffff')]) }));
  assert.equal(done.washing, false, 't>=1 ends the wash');
  const idle = w.update(baseInput({ identity: id2(), now: 2100, bg: '#ffffff', lastResolved: fakeResolved([mkItem(0, 0, '#ffffff')]) }));
  assert.equal(idle.washing, false, 'stays idle after handoff');
});

ok('paletteIdentity is content-stable across structured clones', () => {
  // The worker receives state via postMessage, which structured-clones every
  // array — a fresh userPalettes reference each UPDATE_STATE. Reference
  // equality would restart the wash every frame; the identity must be
  // content-based.
  const a = paletteIdentity('p1', null, []);
  const b = paletteIdentity('p1', null, []);
  assert.equal(a, b, 'empty arrays compare equal');
  assert.notEqual(a, paletteIdentity('p2', null, []), 'different id differs');
  assert.notEqual(a, paletteIdentity('p1', { bg: '#fff' }, []), 'overrides differ');
  const w = createTintWash();
  // Simulate the worker: same content, fresh array references each frame.
  w.update(baseInput({ identity: paletteIdentity('p1', null, []), lastResolved: fakeResolved([mkItem(0, 0)]) }));
  const r = w.update(baseInput({ identity: paletteIdentity('p1', null, []), now: 100, lastResolved: fakeResolved([mkItem(0, 0)]) }));
  assert.equal(r.washing, false, 'fresh-but-equal arrays do not restart the wash');
});

console.log(`\n${n} tests done`);
