// loisPill.selfcheck.mjs — #1001 face-pill derivation.
// The pill is a state light: NOD > VIBE > LEAN > AWAY, never CRIT.
import assert from 'node:assert';
import {
  deriveLoisPill,
  loisPillText,
  LOIS_PILL_META,
  LOIS_PILL_NOD_MS,
  LOIS_VIBE_DWELL_MS,
} from './loisPill.js';

const T = 1_000_000;

// Base: nothing happening → AWAY, dim.
assert.strictEqual(deriveLoisPill({ now: T }), 'AWAY');

// NOD flash wins over everything, then falls back.
assert.strictEqual(deriveLoisPill({ now: T, nodUntil: T + 1000, vibeUntil: T + 1000, leanUntil: T + 1000 }), 'NOD');
assert.strictEqual(deriveLoisPill({ now: T, nodUntil: T - 1, vibeUntil: T + 1000, leanUntil: T + 1000 }), 'VIBE');
assert.strictEqual(deriveLoisPill({ now: T, nodUntil: T - 1, vibeUntil: T - 1, leanUntil: T + 1000 }), 'LEAN');
assert.strictEqual(deriveLoisPill({ now: T, nodUntil: T - 1, vibeUntil: T - 1, leanUntil: T - 1 }), 'AWAY');

// VIBE from dwell: lingered past the tuned dwell without acting.
assert.strictEqual(
  deriveLoisPill({ now: T, dwellMs: LOIS_VIBE_DWELL_MS, idleMs: LOIS_VIBE_DWELL_MS }),
  'VIBE',
);
// Acting (idle reset) suppresses the dwell VIBE even past the dwell.
assert.strictEqual(
  deriveLoisPill({ now: T, dwellMs: LOIS_VIBE_DWELL_MS + 5000, idleMs: 1000 }),
  'AWAY',
);
// Short dwell never vibes.
assert.strictEqual(
  deriveLoisPill({ now: T, dwellMs: LOIS_VIBE_DWELL_MS - 1, idleMs: LOIS_VIBE_DWELL_MS + 9000 }),
  'AWAY',
);

// VIBE outranks a live LEAN hold (the pre-nod is deeper interest).
assert.strictEqual(
  deriveLoisPill({ now: T, leanUntil: T + 5000, dwellMs: LOIS_VIBE_DWELL_MS, idleMs: LOIS_VIBE_DWELL_MS }),
  'VIBE',
);

// Meta: four states, pure Unicode, no CRIT anywhere.
assert.deepStrictEqual(Object.keys(LOIS_PILL_META).sort(), ['AWAY', 'LEAN', 'NOD', 'VIBE']);
for (const [code, m] of Object.entries(LOIS_PILL_META)) {
  assert.strictEqual(m.code, code);
  assert.ok(m.face.length >= 5, `${code} face is kaomoji`);
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(m.face), `${code} face is pure Unicode, no emoji`);
  assert.ok(m.mood.length > 0, `${code} names its mood`);
  assert.ok(/^#[0-9a-f]{6}$/i.test(m.color), `${code} has a hex color`);
}
assert.ok(!('CRIT' in LOIS_PILL_META), 'CRIT is parked on #954 — never emitted');
assert.ok(LOIS_PILL_NOD_MS > 0 && LOIS_PILL_NOD_MS < 10000, 'NOD is a transient flash');

// Render line shape: kaomoji, the word LOIS, the code.
assert.strictEqual(loisPillText('NOD'), '(¬‿¬) LOIS · NOD');
assert.strictEqual(loisPillText('BOGUS'), loisPillText('AWAY'), 'unknown code falls back to AWAY');

console.log('loisPill ok — NOD > VIBE > LEAN > AWAY, CRIT never, faces pure Unicode');
