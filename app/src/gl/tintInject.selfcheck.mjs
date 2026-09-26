// tintInject.selfcheck.mjs — #625: the INJECT propagation contract.
// The field dyes first on a fast envelope; agents adopt on seeded, varied
// delays that always complete by t=1; rapid re-taps re-base from displayed
// colors; MIX 0 is an instant cut; only color/accent are ever rewritten.
import assert from 'node:assert/strict';
import {
  createTintInject, applyInject, colorMap, injectKey, paletteIdentity,
  hash01, hexToRgb, rgbToHex, lerpHex, lerpHexRaw, smootherstep,
  easeOutCubic, fieldProgress, injectDelay,
  INJECT_SALT, INJECT_FIELD_SPAN, INJECT_LEAD, INJECT_DELAY_SPAN, INJECT_ADOPT_SPAN,
} from './tintInject.mjs';

let n = 0;
function ok(name, fn) {
  n++;
  try { fn(); console.log(`ok ${n} - ${name}`); }
  catch (e) { console.error(`not ok ${n} - ${name}\n  ${e.message}`); process.exitCode = 1; }
}

/** A fake resolveLayers() result: one layer, items with color/accent/geometry. */
function fakeResolved(items, layerId = 'L1') {
  return [{ id: layerId, isFx: false, items }];
}
const mkItem = (color = '#111111', accent = '#222222') => ({
  x: 10, y: 20, scaleX: 1.5, scaleY: 0.7, rotation: 0.3, color, accent,
});

const baseInput = (over = {}) => ({
  identity: paletteIdentity('p1', null, null), mode: 'INJECT',
  mixSeconds: 2, now: 0, seed: 7, bg: '#000000', lastResolved: null, ...over,
});
const id2 = () => paletteIdentity('p2', null, null);

ok('color utils: hex round-trips, raw vs eased lerps', () => {
  assert.deepEqual(hexToRgb('#ff0000'), [255, 0, 0]);
  assert.deepEqual(hexToRgb('#0f0'), [0, 255, 0]);
  assert.equal(hexToRgb('nope'), null);
  assert.equal(rgbToHex([255, 0, 0]), '#ff0000');
  assert.equal(lerpHexRaw('#000000', '#ffffff', 0.25), '#404040');
  assert.equal(lerpHex('#000000', '#ffffff', 0), '#000000');
  assert.equal(lerpHex('#000000', '#ffffff', 1), '#ffffff');
  // garbage never blanks an item: degrades to the good side
  assert.equal(lerpHex('junk', '#ffffff', 0.5), '#ffffff');
  assert.equal(lerpHex('#000000', 'junk', 0.5), '#000000');
  assert.equal(lerpHexRaw('junk', '#ffffff', 0.9), '#ffffff');
  assert.ok(Math.abs(smootherstep(0.5) - 0.5) < 1e-9, 'smootherstep is symmetric');
  assert.ok(easeOutCubic(0.5) > 0.5, 'ease-out attacks fast');
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
});

ok('schedule spans sum to exactly 1: every adoption completes by t=1', () => {
  assert.ok(Math.abs(INJECT_LEAD + INJECT_DELAY_SPAN + INJECT_ADOPT_SPAN - 1) < 1e-9,
    `spans sum to 1, got ${INJECT_LEAD + INJECT_DELAY_SPAN + INJECT_ADOPT_SPAN}`);
  for (let i = 0; i < 50; i++) {
    const d = injectDelay(i, 7);
    assert.ok(d >= INJECT_LEAD && d < INJECT_LEAD + INJECT_DELAY_SPAN, `delay ${d} in range`);
    assert.ok(d + INJECT_ADOPT_SPAN <= 1 + 1e-9, 'every adoption completes by t=1');
  }
});

ok('delays are seeded and varied — the propagation is never lockstep', () => {
  assert.equal(injectDelay(3, 7), injectDelay(3, 7), 'same (index, seed) replays the same delay');
  assert.notEqual(injectDelay(3, 7), injectDelay(3, 8), 'a different seed spreads differently');
  const vals = Array.from({ length: 24 }, (_, i) => injectDelay(i, 11));
  assert.ok(new Set(vals).size > 18, 'delays actually vary per agent');
  const spread = Math.max(...vals) - Math.min(...vals);
  assert.ok(spread > INJECT_DELAY_SPAN * 0.5,
    `spread ${spread.toFixed(3)} covers most of the delay span — no lockstep arrival`);
  assert.ok(vals.every((v) => v >= 0 && v < 1), 'delays in [0,1)');
});

ok('hash01 is index-stable and spread', () => {
  assert.equal(hash01(5, 11), hash01(5, 11));
  const vals = Array.from({ length: 20 }, (_, i) => hash01(i, 11));
  assert.ok(new Set(vals).size > 15, 'hash actually varies per node');
  assert.ok(vals.every((v) => v >= 0 && v < 1), 'hash in [0,1)');
});

ok('field dyes first: field done while agents are still catching up', () => {
  assert.equal(fieldProgress(0), 0);
  assert.equal(fieldProgress(INJECT_FIELD_SPAN), 1, 'field completes at FIELD_SPAN');
  assert.equal(fieldProgress(1), 1, 'field stays dyed');
  // The earliest agent wakes at LEAD < FIELD_SPAN; when the field completes,
  // no agent can be fully adopted yet (latest possible progress at FIELD_SPAN
  // is (FIELD_SPAN - LEAD) / ADOPT_SPAN < 1).
  const pAtFieldDone = (INJECT_FIELD_SPAN - INJECT_LEAD) / INJECT_ADOPT_SPAN;
  assert.ok(pAtFieldDone < 1, `max agent progress at field completion is ${pAtFieldDone.toFixed(2)} < 1`);
  assert.ok(fieldProgress(INJECT_LEAD) > 0.85,
    `field is ${Math.round(fieldProgress(INJECT_LEAD) * 100)}% dyed when the first agent even starts`);
  for (let i = 0; i < 50; i++) {
    const p = (INJECT_FIELD_SPAN - injectDelay(i, 7)) / INJECT_ADOPT_SPAN;
    assert.ok(p < 1, `agent ${i} not fully adopted when the field finishes`);
  }
});

ok('idle when nothing changed; starts on palette identity change', () => {
  const m = createTintInject();
  const r1 = m.update(baseInput({ lastResolved: fakeResolved([mkItem()]) }));
  assert.equal(r1.injecting, false, 'first sighting only baselines, no inject');
  const r2 = m.update(baseInput({ now: 100, lastResolved: fakeResolved([mkItem()]) }));
  assert.equal(r2.injecting, false, 'same identity stays idle');
  const r3 = m.update(baseInput({ identity: id2(), now: 200, lastResolved: fakeResolved([mkItem()]) }));
  assert.equal(r3.injecting, true, 'palette id change starts the inject');
  assert.equal(r3.t, 0, 'clock starts at t=0');
});

ok('non-INJECT modes never inject', () => {
  for (const mode of ['FADE', 'WASH', undefined]) {
    const m = createTintInject();
    m.update(baseInput({ mode, lastResolved: fakeResolved([mkItem()]) }));
    const r = m.update(baseInput({ mode, identity: id2(), now: 100, lastResolved: fakeResolved([mkItem()]) }));
    assert.equal(r.injecting, false, `mode ${mode} does not start an inject`);
  }
});

ok('MIX 0 is an instant cut — the slider at 0 means now, like everywhere else', () => {
  const m = createTintInject();
  m.update(baseInput({ lastResolved: fakeResolved([mkItem()]) }));
  const r = m.update(baseInput({
    identity: id2(), mixSeconds: 0, now: 50, bg: '#ffffff',
    lastResolved: fakeResolved([mkItem('#ffffff')]),
  }));
  assert.equal(r.injecting, false);
  assert.equal(r.bg, '#ffffff', 'bg cuts straight to the new palette');
});

ok('the inject follows the time slider: duration scales with mixSeconds', () => {
  for (const mixSeconds of [0.5, 2, 8]) {
    const m = createTintInject();
    m.update(baseInput({ mixSeconds, lastResolved: fakeResolved([mkItem()]) }));
    const ev = m.update(baseInput({ mixSeconds, identity: id2(), now: 0, bg: '#ffffff', lastResolved: fakeResolved([mkItem()]) }));
    assert.equal(ev.injecting, true);
    // Halfway through the SLIDER's duration the inject is still mid-flight…
    const mid = m.update(baseInput({
      mixSeconds, identity: id2(), now: (mixSeconds * 1000) / 2, bg: '#ffffff',
      lastResolved: fakeResolved([mkItem()]),
    }));
    assert.equal(mid.injecting, true, `still injecting at half of ${mixSeconds}s`);
    assert.ok(mid.t > 0.4 && mid.t < 0.6, `t tracks the slider, got ${mid.t}`);
    // …and done only when the slider's duration elapses, never before.
    const done = m.update(baseInput({
      mixSeconds, identity: id2(), now: mixSeconds * 1000, bg: '#ffffff',
      lastResolved: fakeResolved([mkItem()]),
    }));
    assert.equal(done.injecting, false, `complete exactly at ${mixSeconds}s`);
  }
});

ok('applyInject: old colors hold until each agent\'s seeded delay, then lerp', () => {
  const m = createTintInject();
  const oldItems = fakeResolved([mkItem('#111111', '#222222'), mkItem('#111111', '#222222'), mkItem('#111111', '#222222')]);
  m.update(baseInput({ lastResolved: oldItems }));
  const newItems = fakeResolved([mkItem('#eeeeee', '#dddddd'), mkItem('#eeeeee', '#dddddd'), mkItem('#eeeeee', '#dddddd')]);
  const ev = m.update(baseInput({ identity: id2(), now: 0, bg: '#ffffff', lastResolved: oldItems }));
  assert.equal(ev.injecting, true);

  // t=0: nothing adopted — all show old colors
  applyInject(newItems, { ...ev, t: 0 });
  for (const it of newItems[0].items) {
    assert.equal(it.color, '#111111');
    assert.equal(it.accent, '#222222');
  }

  // t=1: everything adopted — the resolver's new-palette colors stand
  const newItems2 = fakeResolved([mkItem('#eeeeee', '#dddddd'), mkItem('#eeeeee', '#dddddd'), mkItem('#eeeeee', '#dddddd')]);
  applyInject(newItems2, { ...ev, t: 1 });
  for (const it of newItems2[0].items) {
    assert.equal(it.color, '#eeeeee');
    assert.equal(it.accent, '#dddddd');
  }
});

ok('applyInject never touches geometry — no asset changes size, ever', () => {
  const m = createTintInject();
  const oldItems = fakeResolved([mkItem(), mkItem(), mkItem()]);
  m.update(baseInput({ lastResolved: oldItems }));
  const items = [mkItem('#eeeeee', '#dddddd'), mkItem('#eeeeee', '#dddddd'), mkItem('#eeeeee', '#dddddd')];
  const before = items.map((it) => [it.x, it.y, it.scaleX, it.scaleY, it.rotation]);
  const ev = m.update(baseInput({ identity: id2(), now: 0, bg: '#ffffff', lastResolved: oldItems }));
  for (const t of [0, 0.3, 0.7, 0.999]) {
    applyInject(fakeResolved(items), { ...ev, t });
    items.forEach((it, i) => {
      assert.deepEqual([it.x, it.y, it.scaleX, it.scaleY, it.rotation], before[i],
        `geometry untouched at t=${t}`);
    });
  }
});

ok('applyInject skips FX layers and items that joined mid-inject', () => {
  const m = createTintInject();
  m.update(baseInput({ lastResolved: fakeResolved([mkItem()]) }));
  const ev = m.update(baseInput({ identity: id2(), now: 0, bg: '#ffffff', lastResolved: fakeResolved([mkItem()]) }));
  const fxItem = mkItem('#eeeeee');
  const freshItem = mkItem('#eeeeee'); // joined mid-inject: no "from" color captured
  const resolved = [
    { id: 'L1', isFx: false, items: [freshItem] },
    { id: 'FX', isFx: true, items: [fxItem] },
  ];
  applyInject(resolved, { ...ev, t: 0.5, fromColors: new Map() });
  assert.equal(freshItem.color, '#eeeeee', 'unknown item keeps the new palette');
  assert.equal(fxItem.color, '#eeeeee', 'FX layer untouched');
});

ok('colorMap snapshots per-item colors; paletteIdentity is content-based', () => {
  const map = colorMap(fakeResolved([mkItem('#123456', '#654321')], 'L9'));
  assert.deepEqual(map.get(injectKey('L9', 0)), { color: '#123456', accent: '#654321' });
  assert.equal(colorMap(null).size, 0);
  assert.equal(colorMap([{ id: 'FX', isFx: true, items: [mkItem()] }]).size, 0);
  assert.equal(paletteIdentity('p1', null, []), paletteIdentity('p1', null, []));
  assert.notEqual(paletteIdentity('p1', null, []), paletteIdentity('p2', null, []));
});

ok('rapid re-tap re-bases from displayed colors instead of stacking', () => {
  const m = createTintInject();
  m.update(baseInput({ lastResolved: fakeResolved([mkItem('#111111', '#111111')]) }));
  const ev1 = m.update(baseInput({ identity: id2(), now: 0, bg: '#333333', lastResolved: fakeResolved([mkItem('#111111', '#111111')]) }));
  assert.equal(ev1.injecting, true);
  // Mid-inject the user taps again: the new inject starts from the displayed
  // (mid-inject) colors, not the original palette.
  const midItems = fakeResolved([mkItem('#777777', '#777777')]);
  const ev2 = m.update(baseInput({ identity: paletteIdentity('p3', null, null), now: 500, bg: '#999999', lastResolved: midItems }));
  assert.equal(ev2.injecting, true);
  assert.equal(ev2.t, 0, 're-tap restarts the clock');
  const check = fakeResolved([mkItem('#bbbbbb', '#bbbbbb')]);
  applyInject(check, { ...ev2, t: 0, seed: ev2.seed });
  assert.equal(check[0].items[0].color, '#777777', 're-based from the displayed mid-inject color');
});
