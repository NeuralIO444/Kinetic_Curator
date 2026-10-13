// #1475 — who is driving the bands: ambient, the set, or real audio. Fades, hysteresis, handoff.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSourceArbiter, IDLE_MS, FADE_BARS, MIN_FADE_MS, SOUND_ON } from './sourceArbiter.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const BAR = 2000; // ms at 120 BPM
const FADE = FADE_BARS * BAR;
/** Run a scenario frame by frame; fn(t) -> { idleMs, level }. */
function run(fn, ms, arb = createSourceArbiter(), start = 0) {
  const out = [];
  for (let t = start; t <= start + ms; t += 16.7) { const i = fn(t - start); out.push({ t, ...arb.update(t, i.idleMs, i.level, BAR) }); }
  return { out, arb };
}

ok('ambient until the artist has been idle for a while; then the set fades in over two bars', () => {
  const { out } = run((t) => ({ idleMs: t, level: 0 }), IDLE_MS + FADE + 2000);
  assert.ok(out.filter((o) => o.t < IDLE_MS).every((o) => o.source === 'ambient' && o.mix === 0), 'ambient before IDLE_MS');
  const half = out.find((o) => o.t >= IDLE_MS + FADE / 2);
  assert.ok(half.mix > 0.35 && half.mix < 0.65, `half way through the fade (${half.mix})`);
  const last = out[out.length - 1];
  assert.equal(last.mix, 1); assert.equal(last.source, 'set');
  for (let i = 1; i < out.length; i++) assert.ok(out[i].mix >= out[i - 1].mix - 1e-9, 'it only rises');
});

ok('real audio arriving makes it yield: a crossfade, then only the audio', () => {
  const arb = createSourceArbiter();
  run((t) => ({ idleMs: IDLE_MS + t, level: 0 }), FADE + 1000, arb); // the set is fully in
  assert.equal(arb.mix(), 1);
  const { out } = run((t) => ({ idleMs: IDLE_MS + 10000 + t, level: 0.4 }), FADE + 1500, arb, 100000);
  assert.ok(out.every((o) => o.source === 'audio' || o.mix > 0), 'never a hole');
  assert.equal(out[out.length - 1].mix, 0);
  assert.equal(out[out.length - 1].source, 'audio');
  const mid = out.find((o) => o.t >= 100000 + FADE / 2);
  assert.ok(mid.mix > 0.2 && mid.mix < 0.8, `crossfading (${mid.mix})`);
  for (let i = 1; i < out.length; i++) assert.ok(out[i].mix <= out[i - 1].mix + 1e-9, 'it only falls');
});

ok('the artist acting makes it yield too, and she returns when the room goes still again', () => {
  const arb = createSourceArbiter();
  run((t) => ({ idleMs: IDLE_MS + t, level: 0 }), FADE + 1000, arb);
  const touched = run(() => ({ idleMs: 0, level: 0 }), FADE + 500, arb, 50000);
  assert.equal(touched.out[touched.out.length - 1].mix, 0);
  assert.equal(touched.out[touched.out.length - 1].source, 'ambient');
  const again = run((t) => ({ idleMs: IDLE_MS + t, level: 0 }), FADE + 1000, arb, 90000);
  assert.equal(again.out[again.out.length - 1].mix, 1, 'back after another while');
});

ok('hysteresis: a level hovering at the threshold does not flip the source back and forth', () => {
  const arb = createSourceArbiter();
  let flips = 0; let prev = null;
  for (let t = 0; t < 12000; t += 16.7) {
    const lvl = SOUND_ON + (Math.floor(t / 16.7) % 2 ? 0.01 : -0.01);
    const st = arb.update(t, IDLE_MS + 5000, lvl, BAR);
    if (prev !== null && st.audio !== prev) flips++;
    prev = st.audio;
  }
  assert.ok(flips <= 2, `${flips} flips`);
});

ok('a very fast tempo still gets a visible fade; junk input never breaks the weight', () => {
  const arb = createSourceArbiter();
  const t0 = arb.update(0, IDLE_MS, 0, 200); // a 200 ms bar
  let t = 0; while (t < MIN_FADE_MS / 2) { t += 16.7; arb.update(t, IDLE_MS, 0, 200); }
  assert.ok(arb.mix() > 0 && arb.mix() < 1, `not a cut at ${t | 0} ms (${arb.mix()})`);
  void t0;
  const j = createSourceArbiter();
  for (const bad of [NaN, undefined, null, 'x']) {
    const st = j.update(100, bad, bad, bad);
    assert.ok(Number.isFinite(st.mix) && st.mix >= 0 && st.mix <= 1);
  }
});

ok('deterministic and pure', () => {
  const f = (t) => ({ idleMs: t, level: t > 90000 ? 0.3 : 0 });
  assert.equal(JSON.stringify(run(f, 120000).out), JSON.stringify(run(f, 120000).out));
  const src = readFileSync(new URL('./sourceArbiter.mjs', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/Date\.now|performance\.now|Math\.random|setTimeout|setInterval|document|window/.test(src));
});

console.log(`sourceArbiter.selfcheck: ${n} checks passed`);
