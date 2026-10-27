// #1145 part 2 (× Mind 3) — the third's hand scales with her tier: the room's sway allowance × her presence, softer in
// cool-down, bounded by the room, and exactly today's allowance when no presence is wired.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  directorGains,
  presenceScale,
  PRESENCE_SCALE,
  PRESENCE_COOL,
  setPresenceProvider,
  currentPresence,
} from './director.js';
import { DIRECTOR_TABLE } from './directorTable.js';
import { roomWidthFromCodes } from './roomWidth.js';
import { createPresenceDriver } from './mindPresenceLive.js';
import { DIRECTORS_MATRIX } from './directorsMatrix.js';
const flat = (s) => s.replace(/\s+/g, '').replace(/,(?=[)\]}])/g, ''); // layout-blind source pins (#1684): whitespace and trailing commas are Prettier's, not the code's

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const rooms = Object.entries(DIRECTORS_MATRIX).flatMap(([l, row]) => Object.keys(row).map((d) => [l, d]));

ok('the scale: tier 1 half, tier 4 whole, cool-down softer; nothing wired is exactly today', () => {
  assert.deepEqual({ ...PRESENCE_SCALE }, { 1: 0.5, 2: 0.7, 3: 0.85, 4: 1 });
  assert.equal(presenceScale(null), 1);
  assert.equal(presenceScale({ tier: 9 }), 1, 'junk is today, never a guess');
  assert.equal(presenceScale({ tier: 2, cool: true }), 0.7 * PRESENCE_COOL);
});

ok(
  "every room: her allowance is the room's × her presence, never above the room; nothing else in the gains moves",
  () => {
    assert.ok(DIRECTOR_TABLE && rooms.length === 20);
    for (const [l, d] of rooms) {
      const today = directorGains({ loisCode: l, davisCode: d, phase: 'explore' });
      for (const tier of [1, 2, 3, 4])
        for (const cool of [false, true]) {
          const g = directorGains({ loisCode: l, davisCode: d, phase: 'explore', presence: { tier, cool } });
          assert.ok(
            Math.abs(g.swayAllowance - today.swayAllowance * presenceScale({ tier, cool })) < 1e-12,
            `${l}×${d} t${tier}`,
          );
          assert.ok(g.swayAllowance <= today.swayAllowance);
          const { swayAllowance: a, ...rest } = g;
          const { swayAllowance: b, ...restToday } = today;
          assert.deepEqual(rest, restToday, 'temperature, kin, LOIS weight, tilt, room: untouched');
        }
      assert.deepEqual(
        directorGains({ loisCode: l, davisCode: d }),
        directorGains({ loisCode: l, davisCode: d, presence: null }),
        'unwired = today',
      );
    }
    const t1 = directorGains({ loisCode: 'AWAY', davisCode: 'FLOW', presence: { tier: 1 } });
    const t4 = directorGains({ loisCode: 'AWAY', davisCode: 'FLOW', presence: { tier: 4 } });
    assert.ok(t4.swayAllowance > 0 && t1.swayAllowance === t4.swayAllowance / 2, 'tier 1 is half of today');
  },
);

ok(
  "the live readers follow the provider: the room width's allowance (birth centre, pace) scales too; a throwing reader is today",
  () => {
    const today = roomWidthFromCodes('AWAY', 'FLOW', null).allowance;
    setPresenceProvider(() => ({ tier: 1, cool: false }));
    assert.deepEqual(currentPresence(), { tier: 1, cool: false });
    assert.equal(roomWidthFromCodes('AWAY', 'FLOW').allowance, today / 2);
    setPresenceProvider(() => {
      throw new Error('x');
    });
    assert.equal(currentPresence(), null);
    assert.equal(roomWidthFromCodes('AWAY', 'FLOW').allowance, today);
    setPresenceProvider(null);
    assert.equal(currentPresence(), null);
  },
);

ok('her presence is earned engagement, not a model: the driver reports her tier and cool-down from the book', () => {
  const store = {
    getItem: () =>
      JSON.stringify({
        v: 1,
        p: [
          [0, 1, 0, null],
          [0, 1, 0, null],
          [300, 3, 0, null],
        ],
      }),
    setItem: () => {},
  };
  const d = createPresenceDriver({ storage: store, today: new Date('nope'), getSignals: () => ({ active: false }) });
  assert.deepEqual(d.third(), { tier: 3, cool: false });
  const live = src('./mindPresenceLive.js');
  assert.ok(
    flat(live).includes(flat('third: () => { const e = book.get(PERSONAS[2])')),
    'read from the engagement book only',
  );
});

ok(
  'wired: the app hands the Director the reader and clears it; the Director imports no mind; no surface names her',
  () => {
    const app = src('../App.jsx');
    assert.match(app, /setPresenceProvider\(presence\.third\)/);
    assert.match(app, /setPresenceProvider\(null\)/);
    assert.ok(!/queen/i.test(app));
    assert.ok(!/from\s+['"]\.\/mind/.test(src('./director.js')));
  },
);

console.log(`directorPresence.selfcheck: ${n} checks passed`);
