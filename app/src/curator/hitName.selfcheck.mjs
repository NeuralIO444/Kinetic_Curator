// hitName.selfcheck.mjs — a hit's name comes from its seed and nothing else (#1124).
import assert from 'node:assert';
import { HIT_WORDS, hitName, hitAge } from './hitName.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('256 distinct words, uppercase letters only, six at most: two of them cover the 4-hex seed space', () => {
  assert.equal(HIT_WORDS.length, 256); assert.equal(new Set(HIT_WORDS).size, 256);
  for (const w of HIT_WORDS) { assert.match(w, /^[A-Z]+$/, w); assert.ok(w.length <= 6, `${w} is ${w.length}`); }
});

ok('same seed, same name; every 16-bit seed has its own full name (65,536 of them)', () => {
  assert.deepEqual(hitName(0x8bea), hitName(0x8bea)); assert.deepEqual(hitName(0x8bea), hitName(0x1_8bea), 'only the 4-hex space names it');
  const seen = new Set();
  for (let v = 0; v < 65536; v++) seen.add(hitName(v).full);
  assert.equal(seen.size, 65536);
});

ok('the pill word is the high byte, the card pairs it with the low byte, and hex is the real seed', () => {
  const h = hitName(0x0a03);
  assert.equal(h.short, HIT_WORDS[0x0a]); assert.equal(h.full, `${HIT_WORDS[0x0a]} ${HIT_WORDS[3]}`); assert.equal(h.hex, '0a03');
});

ok('junk in is a name out, never a throw', () => {
  for (const bad of [undefined, null, NaN, 'x', -1, 1e12]) assert.ok(hitName(bad).short.length > 0);
});

ok('capture age reads in the coarsest honest unit, and says nothing when the time is unknown', () => {
  const t = 1_000_000_000_000;
  assert.equal(hitAge(t, t + 5_000), 'just now'); assert.equal(hitAge(t, t + 5 * 60_000), '5m ago'); assert.equal(hitAge(t, t + 3 * 3_600_000), '3h ago'); assert.equal(hitAge(t, t + 2 * 86_400_000), '2d ago');
  for (const bad of [null, undefined, NaN]) assert.equal(hitAge(bad, t), null); assert.equal(hitAge(t, t - 1), null, 'a time in the future is unknown, not negative');
});

console.log(`hitName.selfcheck: ${n} checks passed`);
