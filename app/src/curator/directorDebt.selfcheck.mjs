// #1145 part 3 — pacing debt: LOIS BURN adds, NOD pays back (cap 4, floor 0); at 3 the room owes quiet until it is paid
// to 0 — temperature capped, her allowance held, Davis's freedom held — and a stall still widens. Never serialized.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDirector, directorGains, nextDebt, nextOwed, DEBT_CAP, DEBT_OWED, DEBT_TEMP_CAP, DEBT_HOLD, SWAY_GATE_OPEN } from './director.js';
import { DIRECTORS_MATRIX } from './directorsMatrix.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const rooms = Object.entries(DIRECTORS_MATRIX).flatMap(([l, row]) => Object.keys(row).map((d) => [l, d]));

ok('the ledger: BURN adds 1, NOD pays 1, cap 4, floor 0; staying put or other faces change nothing', () => {
  assert.equal(nextDebt(0, 'VIBE', 'BURN'), 1);
  assert.equal(nextDebt(DEBT_CAP, 'VIBE', 'BURN'), DEBT_CAP);
  assert.equal(nextDebt(2, 'VIBE', 'NOD'), 1);
  assert.equal(nextDebt(0, 'VIBE', 'NOD'), 0);
  assert.equal(nextDebt(2, 'BURN', 'BURN'), 2, 'a held burn is one burn');
  assert.equal(nextDebt(2, 'BURN', 'VIBE'), 2);
  assert.equal(nextDebt(2, 'NOD', 'AWAY'), 2);
});

ok('owing quiet has hysteresis: starts at 3, lasts until the debt is paid to 0', () => {
  assert.equal(nextOwed(false, DEBT_OWED - 1), false);
  assert.equal(nextOwed(false, DEBT_OWED), true);
  assert.equal(nextOwed(true, 1), true, 'still owing while any debt is left');
  assert.equal(nextOwed(true, 0), false, 'paid off');
});

ok('every room while owing: temperature capped, her allowance held, Davis held — except a stall; not owing is today', () => {
  for (const [l, d] of rooms) {
    const today = directorGains({ loisCode: l, davisCode: d, phase: 'explore' });
    assert.deepEqual(directorGains({ loisCode: l, davisCode: d, phase: 'explore', owed: false }), today);
    const q = directorGains({ loisCode: l, davisCode: d, phase: 'explore', owed: true });
    if (d === 'STUCK') { assert.deepEqual(q, today, `${l}×STUCK: a stall still widens`); continue; }
    assert.ok(q.temperature <= DEBT_TEMP_CAP + 1e-12 && q.temperature <= today.temperature, `${l}×${d} temp`);
    assert.ok(q.kinWeight <= 1 && q.kinWeight <= today.kinWeight, `${l}×${d} kin`);
    if (SWAY_GATE_OPEN) assert.ok(q.swayAllowance >= Math.min(1, Math.max(DEBT_HOLD, today.swayAllowance)) - 1e-12, `${l}×${d} she holds`);
    assert.equal(q.loisWeight, today.loisWeight); assert.equal(q.tiltLimit, today.tiltLimit); assert.deepEqual(q.room, today.room);
  }
  const fb = directorGains({ loisCode: 'BURN', davisCode: 'FLOW', owed: true });
  assert.ok(fb.temperature <= DEBT_TEMP_CAP && fb.kinWeight <= 1, 'even FULL BURN owes');
  const held = directorGains({ loisCode: 'BURN', davisCode: 'FLOW', owed: true, presence: { tier: 1 } });
  assert.ok(Math.abs(held.swayAllowance - fb.swayAllowance * 0.5) < 1e-12, 'her hold is still × her presence');
});

ok('live: three burns and the room owes quiet; FULL BURN cools; nods pay it back and Davis is free again', () => {
  const d = createDirector({ now: () => 0 });
  const flow = { rollsLastMinute: 999 };
  const at = (lois) => ({ ...flow, burning: lois === 'BURN', frameKept: lois === 'NOD' });
  const hot = d.tick({ feed: at('BURN'), audio: 0, nowTs: 0 }); // burn 1
  assert.equal(hot.gains.room.verdict, 'FULL BURN');
  assert.ok(hot.gains.kinWeight > 1, 'the first burns are unleashed');
  d.tick({ feed: at('VIBE'), audio: 0, nowTs: 0 }); d.tick({ feed: at('BURN'), audio: 0, nowTs: 0 }); // burn 2
  d.tick({ feed: at('VIBE'), audio: 0, nowTs: 0 });
  const owe = d.tick({ feed: at('BURN'), audio: 0, nowTs: 0 }); // burn 3
  assert.deepEqual(d.pacing, { debt: 3, owed: true });
  assert.ok(owe.gains.temperature <= DEBT_TEMP_CAP && owe.gains.kinWeight <= 1, 'FULL BURN owes quiet now');
  for (let i = 0; i < 2; i++) { d.tick({ feed: at('NOD'), audio: 0, nowTs: 0 }); d.tick({ feed: at('VIBE'), audio: 0, nowTs: 0 }); }
  assert.deepEqual(d.pacing, { debt: 1, owed: true }, 'still owing');
  d.tick({ feed: at('NOD'), audio: 0, nowTs: 0 });
  assert.deepEqual(d.pacing, { debt: 0, owed: false }, 'paid');
  const free = d.tick({ feed: at('BURN'), audio: 0, nowTs: 0 });
  assert.ok(free.gains.kinWeight > 1, 'Davis is free again');
  d.reset();
  assert.deepEqual(d.pacing, { debt: 0, owed: false });
});

ok('never serialized, never on a surface: the debt lives only inside the Director', () => {
  const dir = src('./director.js');
  assert.match(dir, /let debt = 0;/);
  assert.ok(!/localStorage\.setItem|JSON\.stringify\(\s*\{\s*debt/.test(dir));
  for (const f of ['./directorRoom.js', './mindRoom.js', './mindContext.js']) assert.ok(!/debt/i.test(src(f)), `${f} never carries the debt`);
});

console.log(`directorDebt.selfcheck: ${n} checks passed`);
