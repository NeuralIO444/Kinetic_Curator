// node src/deal/dealEngines.selfcheck.mjs
// #2232 step 1 — KINETIC and CURATOR as shared engines. A SYNTHETIC adapter (numbers, no creatures, no store, no React)
// pins the contract every host adapter must live under:
//   determinism  a hand is a pure function of (adapter, scope, seed, press, ctx); no clock, no Math.random
//   ladder       scopes cycle and wrap; unknown → the adapter's default; the scope reaches the adapter unchanged
//   press        bounded by the draw budget; the gate kills; duplicates drop; an adapter that throws is a quiet no-hand
//   narrow       taste ORDERS and PICKS: a permutation of the hand, never an add, never a veto, never the gate
//   funnel       near the subject, gated, never the subject itself, the cap passed through (and sanitized)
//   seam         the engines know nothing of a store, React, a clock or Math.random (source pin)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertAdapter, collectHand } from './dealAdapter.mjs';
import { hash32, u01, pickIndex } from './dealKey.mjs';
import { press, nextScope, sanitizeScope, scopeIds, WIDE_HAND_SIZE, DRAW_BUDGET_PER_SLOT } from './kineticEngine.mjs';
import { narrow, funnel, sanitizeCap, NARROW_HAND_SIZE, NEAR_CAP_DEFAULT } from './curatorEngine.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

// ── the synthetic adapter: a candidate is { id, v }, v in 0..99 ──
const SPANS = { narrow: 10, mid: 40, wide: 100 };
const calls = { deal: [], near: [], gate: 0, read: 0 };
const make = (over = {}) => ({
  scopes: [
    { id: 'narrow', label: 'NARROW' },
    { id: 'mid', label: 'MID' },
    { id: 'wide', label: 'WIDE' },
  ],
  defaultScope: 'wide',
  deal(scope, { seed, press: p, maxDraws }) {
    calls.deal.push({ scope, seed, press: p, maxDraws });
    const out = [];
    for (let i = 0; i < maxDraws; i++) {
      const v = Math.floor(u01(`syn|${seed}|${p}|${scope}|${i}`) * SPANS[scope]);
      out.push({ id: `c${v}`, v });
    }
    return out;
  },
  near(subject, cap, { seed, press: p, maxDraws }) {
    calls.near.push({ cap, seed, press: p, maxDraws });
    const reach = Math.round(cap * 100);
    const out = [];
    for (let i = 0; i < maxDraws; i++) {
      const d = Math.floor(u01(`near|${seed}|${p}|${subject.id}|${i}`) * (2 * reach + 1)) - reach;
      const v = Math.max(0, Math.min(99, subject.v + d));
      out.push({ id: `c${v}`, v });
    }
    return out;
  },
  gate(c) {
    calls.gate++;
    return c.v % 7 !== 0; // multiples of 7 are stillborn
  },
  read(c) {
    calls.read++;
    return { total: (c.v % 10) / 10 };
  },
  key: (c) => c.id,
  ...over,
});
const A = make();
const reset = () => {
  calls.deal.length = 0;
  calls.near.length = 0;
  calls.gate = 0;
  calls.read = 0;
};

ok('the named constants are pinned (Matt, 2026-11-16: KIN 6, CUR 3)', () => {
  assert.equal(WIDE_HAND_SIZE, 6);
  assert.equal(NARROW_HAND_SIZE, 3);
  assert.equal(DRAW_BUDGET_PER_SLOT, 8);
  assert.equal(NEAR_CAP_DEFAULT, 0.25);
});

ok('dealKey: a pure draw in [0,1) that does not cluster on a trailing counter', () => {
  assert.equal(hash32('abc'), hash32('abc'));
  assert.equal(u01('k|1'), u01('k|1'));
  const xs = Array.from({ length: 16 }, (_, i) => u01(`stream|${i}`));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.5, 'kineticBirths measured raw FNV-1a clustering at 0.61–0.63');
  assert.equal(pickIndex('k', 0), 0);
  assert.ok(pickIndex('k', 5) >= 0 && pickIndex('k', 5) < 5);
});

ok('adapter door: every missing or wrong member is named; a good adapter passes through', () => {
  assert.equal(assertAdapter(A), A);
  assert.throws(() => assertAdapter(null), /not an object/);
  assert.throws(() => assertAdapter({}), /scopes.*deal.*near.*gate.*read.*key/s);
  assert.throws(() => assertAdapter(make({ scopes: [] })), /scopes/);
  assert.throws(() => assertAdapter(make({ scopes: [{ id: 'a' }, { id: 'a' }], defaultScope: 'a' })), /unique/);
  assert.throws(() => assertAdapter(make({ defaultScope: 'nope' })), /defaultScope/);
  assert.throws(() => assertAdapter(make({ gate: null })), /gate/);
});

ok('the ladder: cycles narrowest to widest and wraps; unknown falls to the default; ids read back', () => {
  assert.deepEqual(scopeIds(A), ['narrow', 'mid', 'wide']);
  assert.equal(nextScope(A, 'narrow'), 'mid');
  assert.equal(nextScope(A, 'mid'), 'wide');
  assert.equal(nextScope(A, 'wide'), 'narrow');
  assert.equal(sanitizeScope(A, 'koz'), 'wide');
  assert.equal(sanitizeScope(A, undefined), 'wide');
  assert.equal(nextScope(A, 'bogus'), 'narrow', 'an unknown scope is the default, and the default wraps');
});

ok('press: a hand of 6 by default, unique keys, every one gate-passing, inside the draw budget', () => {
  reset();
  const r = press(A, { scope: 'wide', seed: 7, press: 0 });
  assert.equal(r.declined, false);
  assert.equal(r.hand.length, WIDE_HAND_SIZE);
  assert.equal(new Set(r.hand.map((c) => c.id)).size, r.hand.length, 'unique');
  assert.ok(r.hand.every((c) => c.v % 7 !== 0), 'the gate held');
  assert.ok(r.draws <= WIDE_HAND_SIZE * DRAW_BUDGET_PER_SLOT);
  assert.equal(calls.deal[0].maxDraws, WIDE_HAND_SIZE * DRAW_BUDGET_PER_SLOT, 'the budget is asked for, not assumed');
});

ok('press: the scope reaches the adapter unchanged and bounds what it deals', () => {
  reset();
  const r = press(A, { scope: 'narrow', seed: 3, press: 2, handSize: 4 });
  assert.equal(calls.deal[0].scope, 'narrow');
  assert.ok(r.hand.every((c) => c.v < SPANS.narrow));
  assert.ok(r.hand.length <= 4);
  assert.equal(press(A, { scope: 'bogus', seed: 3 }).scope, 'wide', 'unknown → the default, reported back');
});

ok('press: determinism — the same inputs give the identical hand, with the clock and Math.random forbidden', () => {
  const { now } = Date;
  const { random } = Math;
  Date.now = () => {
    throw new Error('the engine read the clock');
  };
  Math.random = () => {
    throw new Error('the engine read Math.random');
  };
  try {
    const a = press(A, { scope: 'mid', seed: 99, press: 5 });
    const b = press(A, { scope: 'mid', seed: 99, press: 5 });
    assert.deepEqual(a, b);
    const f = funnel(A, { id: 'c50', v: 50 }, { seed: 99, press: 5 });
    assert.deepEqual(f, funnel(A, { id: 'c50', v: 50 }, { seed: 99, press: 5 }));
  } finally {
    Date.now = now;
    Math.random = random;
  }
});

ok('press: a different press or seed deals a different hand (the draws are keyed on them)', () => {
  const ids = (r) => r.hand.map((c) => c.id).join(',');
  const base = ids(press(A, { scope: 'wide', seed: 1, press: 0 }));
  assert.notEqual(base, ids(press(A, { scope: 'wide', seed: 1, press: 1 })));
  assert.notEqual(base, ids(press(A, { scope: 'wide', seed: 2, press: 0 })));
});

ok('press: the gate kills and the dead are counted, never carried; duplicates drop', () => {
  const allDead = make({ gate: () => false });
  const r = press(allDead, { scope: 'wide', seed: 1, handSize: 3 });
  assert.equal(r.hand.length, 0);
  assert.equal(r.stillborn, r.draws, 'every draw was a stillborn');
  const dupes = make({ deal: () => Array.from({ length: 20 }, () => ({ id: 'same', v: 1 })) });
  const d = press(dupes, { scope: 'wide', seed: 1 });
  assert.equal(d.hand.length, 1);
  assert.equal(d.duplicates, 19);
});

ok('press: a runaway adapter is cut at the budget; garbage and throws are a quiet no-hand, never a crash', () => {
  const runaway = make({ deal: () => Array.from({ length: 10000 }, (_, i) => ({ id: `r${i}`, v: 1 })), gate: () => false });
  assert.equal(press(runaway, { scope: 'wide', handSize: 2 }).draws, 2 * DRAW_BUDGET_PER_SLOT, 'the budget bounds the reads');
  assert.deepEqual(press(make({ deal: () => 'nope' }), { scope: 'wide' }).hand, []);
  assert.equal(press(make({ deal: () => null }), { scope: 'wide' }).declined, false, 'a null deal is an empty deal');
  const thrown = press(
    make({
      deal: () => {
        throw new Error('boom');
      },
    }),
    { scope: 'wide' },
  );
  assert.equal(thrown.declined, true);
  assert.deepEqual(thrown.hand, []);
  const badGate = make({
    gate: () => {
      throw new Error('boom');
    },
  });
  assert.equal(press(badGate, { scope: 'wide' }).hand.length, 0, 'a throwing gate is a refusal');
  const badKey = make({ deal: () => [{ id: 1 }, { id: '' }, { id: 'ok', v: 1 }], key: (c) => c.id });
  assert.deepEqual(press(badKey, { scope: 'wide' }).hand, [{ id: 'ok', v: 1 }], 'a candidate with no string key never enters');
});

ok('press: hand size and budget are clamped (a hostile number cannot ask for the moon)', () => {
  reset();
  press(A, { scope: 'wide', handSize: 10000, seed: 1 });
  assert.equal(calls.deal[0].maxDraws, 512);
  reset();
  press(A, { scope: 'wide', handSize: NaN, seed: 1 });
  assert.equal(calls.deal[0].maxDraws, WIDE_HAND_SIZE * DRAW_BUDGET_PER_SLOT, 'not a number → the named default');
  reset();
  press(A, { scope: 'wide', handSize: 0, seed: 1 });
  assert.equal(calls.deal[0].maxDraws, 8, 'a hand is at least one');
});

ok('narrow: the order is a PERMUTATION of the hand — nothing added, nothing removed — best read first', () => {
  const hand = press(A, { scope: 'wide', seed: 11 }).hand;
  const frozen = Object.freeze(hand.slice());
  const r = narrow(A, frozen);
  assert.deepEqual(
    r.ordered.map((o) => o.key).sort(),
    hand.map((c) => c.id).sort(),
  );
  for (let i = 1; i < r.ordered.length; i++) assert.ok(r.ordered[i - 1].total >= r.ordered[i].total);
  assert.equal(r.picked, r.ordered[0].candidate, 'no taste: the top of the order');
  assert.equal(r.tasted, false);
  assert.deepEqual(hand, [...frozen], 'the hand it was handed is not changed');
});

ok('narrow: ties break on the key, so the order is a pure function of the hand', () => {
  const tied = make({ read: () => ({ total: 0.5 }) });
  const hand = [{ id: 'b' }, { id: 'c' }, { id: 'a' }];
  assert.deepEqual(
    narrow(tied, hand).ordered.map((o) => o.key),
    ['a', 'b', 'c'],
  );
});

ok('narrow: it never consults the gate — a zero-scored top still picks; a read that is garbage scores 0', () => {
  reset();
  const zero = make({ read: () => ({ total: 0 }) });
  assert.equal(narrow(zero, [{ id: 'z', v: 1 }]).picked.id, 'z');
  const junk = make({ read: () => ({ total: NaN }) });
  assert.equal(narrow(junk, [{ id: 'z', v: 1 }]).ordered[0].total, 0);
  const throws = make({
    read: () => {
      throw new Error('boom');
    },
  });
  assert.equal(narrow(throws, [{ id: 'z', v: 1 }]).ordered[0].total, 0);
  assert.equal(calls.gate, 0, 'narrowing never runs the gate: the gate is the hand\'s, taste never vetoes');
});

ok('narrow: the taste hook chooses AMONG the ordered hand; a bad index or a throw falls back to the top', () => {
  const hand = [{ id: 'a', v: 9 }, { id: 'b', v: 5 }, { id: 'c', v: 1 }];
  const second = narrow(A, hand, { curator: { pick: () => 1 } });
  assert.equal(second.tasted, true);
  assert.equal(second.picked, second.ordered[1].candidate);
  for (const bad of [-1, 3, 1.5, NaN, 'x', undefined]) {
    const r = narrow(A, hand, { curator: { pick: () => bad } });
    assert.equal(r.tasted, false, `index ${String(bad)} is refused`);
    assert.equal(r.picked, r.ordered[0].candidate);
  }
  const boom = narrow(A, hand, {
    curator: {
      pick: () => {
        throw new Error('boom');
      },
    },
  });
  assert.equal(boom.picked, boom.ordered[0].candidate);
  assert.equal(narrow(A, []).picked, null, 'an empty hand picks nothing and invents nothing');
});

ok('narrow: no rng is a stream of zeros — never Math.random (the audit-3a contract)', () => {
  let drawn = null;
  narrow(A, [{ id: 'a', v: 1 }], {
    curator: {
      pick: (_c, draw) => {
        drawn = draw();
        return 0;
      },
    },
  });
  assert.equal(drawn, 0);
  let given = null;
  narrow(A, [{ id: 'a', v: 1 }], {
    rng: () => 0.42,
    curator: {
      pick: (_c, draw) => {
        given = draw();
        return 0;
      },
    },
  });
  assert.equal(given, 0.42);
});

ok('funnel: a hand of 3 near the subject, gated, never the subject, and every one within the cap', () => {
  reset();
  const subject = { id: 'c50', v: 50 };
  const f = funnel(A, subject, { seed: 5, press: 1, cap: 0.1 });
  assert.equal(f.declined, false);
  assert.equal(f.hand.length, NARROW_HAND_SIZE);
  assert.ok(f.hand.every((c) => c.id !== subject.id), 'the subject is never in its own hand');
  assert.ok(f.hand.every((c) => Math.abs(c.v - 50) <= 10), 'within the cap (the synthetic adapter honours it)');
  assert.ok(f.hand.every((c) => c.v % 7 !== 0), 'gated');
  assert.equal(f.picked, f.ordered[0].candidate, 'narrowed: ordered and picked');
  assert.ok(f.hand.length < WIDE_HAND_SIZE, 'fewer than the wide deal');
});

ok('funnel: the cap reaches the adapter as asked and is sanitized to (0, 1]', () => {
  const seen = (cap) => {
    reset();
    funnel(A, { id: 'c50', v: 50 }, { cap, seed: 1 });
    return calls.near[0].cap;
  };
  assert.equal(seen(0.1), 0.1);
  assert.equal(seen(1), 1);
  assert.equal(seen(5), 1, 'above 1 clamps');
  for (const bad of [0, -1, NaN, Infinity, 'x', undefined, null]) {
    assert.equal(seen(bad), NEAR_CAP_DEFAULT, `${String(bad)} → the default`);
  }
  assert.equal(sanitizeCap(0.5), 0.5);
});

ok('funnel: the ctx reaches the gate and the read; a throwing adapter is a quiet no-hand', () => {
  const ctx = { room: 'r1' };
  let gateCtx = null;
  let readCtx = null;
  const spy = make({
    gate: (_c, c) => {
      gateCtx = c;
      return true;
    },
    read: (_c, c) => {
      readCtx = c;
      return { total: 1 };
    },
  });
  funnel(spy, { id: 'c50', v: 50 }, { seed: 1, ctx });
  assert.equal(gateCtx, ctx);
  assert.equal(readCtx, ctx);
  const thrown = funnel(
    make({
      near: () => {
        throw new Error('boom');
      },
    }),
    { id: 'c50', v: 50 },
  );
  assert.equal(thrown.declined, true);
  assert.deepEqual(thrown.hand, []);
  assert.equal(thrown.picked, null);
});

ok('collectHand: reads at most the budget even when asked for more, and honours `exclude`', () => {
  const raw = Array.from({ length: 50 }, (_, i) => ({ id: `k${i}`, v: 1 }));
  const r = collectHand(A, raw, { want: 100, budget: 5, ctx: {} });
  assert.equal(r.draws, 5);
  const ex = collectHand(A, raw, { want: 100, budget: 50, ctx: {}, exclude: ['k0', 'k1'] });
  assert.equal(ex.duplicates, 2);
  assert.equal(ex.hand.length, 48);
});

ok('the seam: the engines import nothing of the app, and read no clock and no Math.random (source pin)', () => {
  for (const f of ['dealKey.mjs', 'dealAdapter.mjs', 'kineticEngine.mjs', 'curatorEngine.mjs']) {
    const s = src(f);
    const code = s
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)) // comment lines may NAME what the code must not do
      .join('\n');
    assert.ok(!/Date\.now|Math\.random|performance\.now|requestAnimationFrame|setTimeout/.test(code), `${f}: no clock / random`);
    assert.ok(!/from\s+['"](react|zustand)/.test(code), `${f}: no React / store library`);
    const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.ok(
      imports.every((p) => /^\.\/deal[A-Za-z]*\.mjs$/.test(p) || /^\.\/(kinetic|curator)Engine\.mjs$/.test(p)),
      `${f}: imports only its own deal/ siblings (${imports.join(', ')})`,
    );
  }
});

console.log(`dealEngines selfcheck: ${n} ok`);
