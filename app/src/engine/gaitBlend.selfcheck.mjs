// node src/engine/gaitBlend.selfcheck.mjs
// #2329 follow-up (Matt, 2026-11-18 18:53 PT, ruling 1) — a gait swap eases its driver amounts over ONE beat; the drop
// back to still eases them to 0 before the wearer is its flat tile again. The fold, alone:
//   1. hard gate: no stamp and an empty fold is null, every frame
//   2. a swap cross-fades over exactly one beat (the gait's beat clock), with no amount jump, and then wears the
//      stamped record itself (steady state = the stamp, exactly)
//   3. the drop to still eases every amount to 0, then the wearer leaves (no stamp, no fold)
//   4. a swap mid-fade starts from where the amounts are (continuous)
//   5. snapshot mid-fade → restore → identical continuation; junk is refused; two runs are identical
import assert from 'node:assert/strict';
import { createGaitBlend, mixGaits, checkBlendSnapshot, GAIT_EASE_BEATS } from './gaitBlend.js';
import { gaitInputStamp } from './gaitAssign.js';
import { canonGaits } from '../data/canon/gaits.js';
import { GAIT_ROLES } from './gait.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const G = canonGaits('organic');
const T = 'user:cn-aaaaaaaa';
const stampOf = (g, bpm = 120) =>
  g ? gaitInputStamp({ [T]: { gaitId: g.id, by: 'queen', locked: false } }, bpm) : null;
const FPS = 60;
const sec = (f) => f / FPS;
/** One number per (role, driver) — the amounts a wearer wears. */
const vec = (g) => {
  const out = {};
  for (const role of GAIT_ROLES)
    for (const d of (g && g.roles && g.roles[role] && g.roles[role].drivers) || []) out[`${role}.${d.id}`] = d.amount;
  return out;
};
const dist = (a, b) => {
  let m = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) m = Math.max(m, Math.abs((a[k] || 0) - (b[k] || 0)));
  return m;
};

/** Run frames [0, frames) with stampAt(f); returns per-frame { worn (vec | null), same (the stamped record itself) }. */
function run(stampAt, frames, blend = createGaitBlend(), from = 0, snapAt = -1) {
  const rows = [];
  let snap = null;
  for (let f = from; f < frames; f++) {
    const st = stampAt(f);
    const m = blend.step(st, sec(f));
    const w = m ? m.get(T) : null;
    rows.push({ worn: w ? vec(w.gait) : null, gait: w ? w.gait : null, bpm: w ? w.bpm : null });
    if (f === snapAt) snap = JSON.parse(JSON.stringify(blend.snapshot()));
  }
  return { rows, snap, blend };
}

ok('hard gate: no stamp, nothing easing → null every frame; the fold stays empty', () => {
  const b = createGaitBlend();
  for (let f = 0; f < 60; f++) assert.equal(b.step(null, sec(f)), null);
  assert.equal(b.size, 0);
  assert.equal(b.snapshot(), null);
});

// at 120 BPM a beat is 0.5 s = 30 frames
const BEAT_FRAMES = (60 / 120) * FPS * GAIT_EASE_BEATS;
const SWAP = 90;
const DROP = 240;
const script = (f) => (f < 30 ? null : f < SWAP ? stampOf(G.idle) : f < DROP ? stampOf(G.performing) : null);
const main = run(script, 360);

ok('a swap cross-fades over exactly one beat, never jumping, then wears the stamped record itself', () => {
  // into idle from still (frame 30): starts at 0, reaches idle one beat later
  assert.deepEqual(
    Object.values(main.rows[30].worn).every((v) => v === 0),
    true,
    'the fade in starts from rest',
  );
  assert.equal(main.rows[30 + BEAT_FRAMES].gait, G.idle, 'one beat on, the wearer wears the Canon record itself');
  // idle → performing at SWAP
  const per = vec(G.performing);
  const idl = vec(G.idle);
  const full = dist(per, idl);
  assert.ok(full > 0);
  assert.ok(dist(main.rows[SWAP].worn, idl) < full * 0.01, 'the swap frame is still (almost) idle — no jump');
  let maxStep = 0;
  for (let f = SWAP; f < SWAP + BEAT_FRAMES + 2; f++)
    maxStep = Math.max(maxStep, dist(main.rows[f].worn, main.rows[f - 1].worn));
  // inOutCubic's steepest slope is 3 per beat = 0.1 of the swap per frame at 30 frames a beat (a snap would be 1)
  assert.ok(maxStep < full * 0.11, `per-frame amount step ${maxStep} vs the whole swap ${full}`);
  for (let f = SWAP; f < SWAP + BEAT_FRAMES; f++)
    assert.notEqual(main.rows[f].gait, G.performing, `frame ${f} mid-fade`);
  assert.equal(main.rows[SWAP + BEAT_FRAMES].gait, G.performing, 'after one beat: performing, exactly');
  assert.equal(main.rows[SWAP + BEAT_FRAMES].bpm, 120);
});

ok('the drop to still eases every amount to 0 over one beat, then the wearer leaves (its flat tile)', () => {
  const per = vec(G.performing);
  assert.ok(dist(main.rows[DROP].worn, per) < dist(per, {}) * 0.01, 'the drop frame still wears performing');
  for (let f = DROP; f < DROP + BEAT_FRAMES; f++) assert.ok(main.rows[f].worn, `frame ${f}: still easing home`);
  const last = main.rows[DROP + BEAT_FRAMES - 1].worn;
  assert.ok(dist(last, {}) < 1e-3, `the last eased frame is at rest (${dist(last, {})})`);
  for (let f = DROP + BEAT_FRAMES; f < 360; f++) assert.equal(main.rows[f].worn, null, `frame ${f}: home`);
  assert.equal(main.blend.size, 0, 'the fold forgets the wearer');
  assert.equal(main.blend.snapshot(), null);
});

ok('a swap mid-fade starts from where the amounts are (continuous), and keeps the tempo it was moving on', () => {
  const MID = SWAP + 10;
  const s = run((f) => (f >= MID && f < MID + 60 ? stampOf(G.idle) : script(f)), 300);
  let maxStep = 0;
  for (let f = SWAP; f < MID + BEAT_FRAMES + 2; f++)
    maxStep = Math.max(maxStep, dist(s.rows[f].worn, s.rows[f - 1].worn));
  assert.ok(maxStep < dist(vec(G.performing), vec(G.idle)) * 0.11, `per-frame step ${maxStep}`);
  // the stamp vanishes at 140 BPM's absence: the drop eases on the beat it was moving on
  const t = run((f) => (f < 60 ? stampOf(G.performing, 140) : null), 120);
  assert.equal(t.rows[70].bpm, 140);
});

ok('mixGaits: the ends are the gaits; still is all-zero; structure follows the destination', () => {
  assert.deepEqual(vec(mixGaits(G.idle, G.performing, 0)), { ...vec(G.idle) });
  assert.deepEqual(vec(mixGaits(G.idle, G.performing, 1)), { ...vec(G.performing) });
  assert.ok(Object.values(vec(mixGaits(G.performing, null, 1))).every((v) => v === 0));
  assert.deepEqual(mixGaits(null, G.performing, 0.3).rejoin, G.performing.rejoin);
  assert.deepEqual(mixGaits(G.performing, null, 0.3).release, G.performing.release);
});

ok('a snapshot mid-fade restores into a fresh fold and continues identically; junk is refused', () => {
  const at = SWAP + 12;
  const a = run(script, 360, createGaitBlend(), 0, at);
  assert.ok(a.snap && Object.keys(a.snap.f).length === 1, 'a fade is in the snapshot');
  assert.ok(checkBlendSnapshot(a.snap));
  const b = createGaitBlend();
  b.restore(a.snap);
  const cont = run(script, 360, b, at + 1);
  assert.deepEqual(
    cont.rows.map((r) => r.worn),
    a.rows.slice(at + 1).map((r) => r.worn),
  );
  const again = run(script, 360);
  assert.deepEqual(
    again.rows.map((r) => r.worn),
    a.rows.map((r) => r.worn),
    'two runs, the same amounts',
  );
  for (const junk of [
    null,
    1,
    {},
    { w: {}, f: { x: { to: 'nope', from: null, t0: 0, bpm: 120 } } },
    { w: { x: ['gait:zz', 1] }, f: {} },
  ])
    assert.equal(checkBlendSnapshot(junk), false);
  const c = createGaitBlend();
  c.restore({ w: { x: ['gait:zz', 1] }, f: {} });
  assert.equal(c.size, 0, 'a malformed snapshot restores to an empty fold');
});

console.log(`gaitBlend.selfcheck: ${n} checks ok`);
