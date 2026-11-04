// fieldBattery.selfcheck.mjs — FIELD S4 (#1905): room bias, measured + the stillborn gate.
//
// The battery (curator/fieldEval.roomBattery) runs seeded ROOM cells —
// (verdict, intensity, keep pressure) — through the real pick step and the
// real deal path, and this suite pins what the spec demands of it:
//
//   - poet distribution by room temperature differs measurably in the
//     spec'd direction (cool rooms held/upright poets only, hot rooms
//     modular/sparse poets only, neutral rooms all four);
//   - high keep pressure leans a neutral room held/upright (the S4 lean),
//     and a blazing room outranks the pressure (the #1907 precedence);
//   - hot rooms deal denser forms than cool rooms (mean dealt density);
//   - ZERO stillborn forms across the battery: the gate log is printed,
//     every spawned form is re-audited against the gate it came through;
//   - the gate itself fires on synthetic stillborns (charset / fit /
//     overlap) at both doors — the deal report and sanitizeFieldForm;
//   - determinism: the whole battery, run twice, is byte-identical.
//
// Room temperature here is the Director's intensity level (the sense module's
// scalar); keep pressure is the keep/pass velocity on the same
// normalization the intensity tracker reads. Cells stand in a type-native
// room — the genre gate is measured in fieldSilence.selfcheck.mjs.
import assert from 'node:assert/strict';
import { roomBattery } from './fieldEval.js';
import { choosePoet, KEEP_PRESSURE_HIGH } from './fieldDirector.js';
import {
  POET_DECKS,
  fieldDealReport,
  fieldFormForDeal,
  gateFieldForm,
  sanitizeFieldForm,
  FIELD_MIN_LEGIBLE_EM,
} from '../poets/fieldForm.js';
import { placePiece } from '../poets/placement.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const makeRng = (s) => {
  let x = s;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
};

const battery = roomBattery({ seed: 1905, draws: 400 });
const byName = Object.fromEntries(battery.cells.map((c) => [c.name, c]));

console.log('fieldBattery: poet distribution by room (seed 1905, 400 draws/cell)');
for (const c of battery.cells) {
  console.log(
    `  ${c.name.padEnd(12)} int=${c.intensity} keep=${c.keepPressure} ` +
      `G=${c.counts.greenleaf} T=${c.counts.teijo} R=${c.counts.rosselli} Gi=${c.counts.gibson} silence=${c.counts.silence} ` +
      `coolShare=${c.coolShare.toFixed(3)} hotShare=${c.hotShare.toFixed(3)} meanDensity=${c.meanDensity.toFixed(3)} meanStamps=${c.meanStamps.toFixed(1)}`,
  );
}
console.log(
  `  gate log: deals=${battery.totals.deals} spawned=${battery.totals.spawned} ` +
    `refused=${JSON.stringify(battery.totals.refused)} stillbornSpawned=${battery.totals.stillbornSpawned}`,
);

ok('cool rooms deal held/upright poets only (Greenleaf/Teijo bias)', () => {
  assert.ok(byName.cool.coolShare >= 0.95, `cool coolShare ${byName.cool.coolShare}`);
  assert.ok(byName.cool.hotShare <= 0.05, `cool hotShare ${byName.cool.hotShare}`);
  assert.ok(byName.cool.counts.greenleaf > 0 && byName.cool.counts.teijo > 0, 'both cool poets dealt');
});

ok('hot rooms deal denser/fragmented poets only (Rosselli/Gibson bias)', () => {
  assert.ok(byName.hot.hotShare >= 0.95, `hot hotShare ${byName.hot.hotShare}`);
  assert.ok(byName.hot.coolShare <= 0.05, `hot coolShare ${byName.hot.coolShare}`);
  assert.ok(byName.hot.counts.rosselli > 0 && byName.hot.counts.gibson > 0, 'both hot poets dealt');
});

ok('neutral rooms deal all four poets', () => {
  for (const p of ['greenleaf', 'teijo', 'rosselli', 'gibson']) {
    assert.ok(byName.neutral.counts[p] > 0, `${p} dealt in a neutral room`);
  }
  assert.ok(byName.neutral.coolShare > 0.35 && byName.neutral.coolShare < 0.65, 'neutral is unleaned');
});

ok('high keep pressure leans a neutral room held and upright (the S4 lean)', () => {
  const delta = byName.neutralKeep.coolShare - byName.neutral.coolShare;
  assert.ok(delta >= 0.3, `keep pressure moved the neutral room's cool share by ${delta.toFixed(3)} (>= 0.3)`);
  assert.ok(byName.neutralKeep.coolShare >= 0.95, 'under pressure the neutral room deals cool poets only');
  assert.ok(byName.coolKeep.coolShare >= 0.95, 'a cool room under pressure stays held');
});

ok('a blazing room outranks keep pressure (the #1907 precedence)', () => {
  assert.ok(byName.hotKeep.hotShare >= 0.95, `hot room under pressure still hot (hotShare ${byName.hotKeep.hotShare})`);
});

ok('keep pressure below the line does not lean (KEEP_PRESSURE_HIGH is the threshold)', () => {
  // One stream per pressure level, many picks — the way the Director draws.
  const seen = new Set();
  const rngBelow = makeRng(3100);
  for (let i = 0; i < 200; i++) {
    const d = choosePoet({
      intensity: 0.5,
      keepPressure: KEEP_PRESSURE_HIGH - 0.01,
      rng: rngBelow,
      typeEligible: true,
    });
    if (d) seen.add(d.poetId);
  }
  assert.ok(seen.has('rosselli') || seen.has('gibson'), 'sub-threshold pressure leaves the hot pool reachable');
  const leaned = new Set();
  const rngAt = makeRng(3100);
  for (let i = 0; i < 200; i++) {
    const d = choosePoet({ intensity: 0.5, keepPressure: KEEP_PRESSURE_HIGH, rng: rngAt, typeEligible: true });
    if (d) leaned.add(d.poetId);
  }
  assert.deepEqual([...leaned].sort(), ['greenleaf', 'teijo'], 'at the line, the neutral pool is the cool pool');
});

ok('hot rooms deal denser forms than cool rooms (mean dealt density)', () => {
  assert.ok(
    byName.hot.meanDensity > byName.cool.meanDensity + 0.05,
    `hot ${byName.hot.meanDensity.toFixed(3)} vs cool ${byName.cool.meanDensity.toFixed(3)}`,
  );
});

ok('zero stillborn forms across the battery (the gate log above)', () => {
  assert.equal(battery.totals.stillbornSpawned, 0, 'no spawned form fails the gate re-audit');
  assert.equal(
    battery.totals.spawned,
    battery.totals.deals,
    'every dealt form spawned — real decks deal no stillborns',
  );
  assert.deepEqual(battery.totals.refused, { charset: 0, fit: 0, overlap: 0 }, 'no refusals on the shipped decks');
});

ok('the gate refuses a charset stillborn (a line failing the charset law)', () => {
  const placed = placePiece({ id: 'x', lines: ['snow! falls'], layout: 'bands', density: 0.4 }, makeRng(5), {
    aspect: 10 / 7,
  });
  const gate = gateFieldForm(placed.stamps, { aspect: 10 / 7 });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'charset');
});

ok('the gate refuses a fit stillborn (a line that cannot fit its module at a readable size)', () => {
  const placed = placePiece({ id: 'y', lines: ['A'.repeat(160)], layout: 'bands', density: 0.4 }, makeRng(5), {
    aspect: 0.5,
  });
  assert.ok(placed.stamps[0].em < FIELD_MIN_LEGIBLE_EM, `crushed to em ${placed.stamps[0].em.toFixed(4)}`);
  const gate = gateFieldForm(placed.stamps, { aspect: 0.5 });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'fit');
});

ok('the gate refuses an overlap stillborn (glyphs piled into each other)', () => {
  const stamps = [
    { assetId: 'typ_A', ch: 'A', x: 0.5, y: 0.5, rotation: 0, em: 0.06 },
    { assetId: 'typ_B', ch: 'B', x: 0.52, y: 0.5, rotation: 0, em: 0.06 },
  ];
  const gate = gateFieldForm(stamps, { aspect: 10 / 7 });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'overlap');
});

ok('the document door refuses stillborns too (sanitizeFieldForm runs the gate)', () => {
  const deal = fieldFormForDeal({ poetId: 'greenleaf', pieceId: 'g1' }, makeRng(9), { aspect: 10 / 7 });
  assert.deepEqual(sanitizeFieldForm(deal), deal, 'an honest form round-trips');
  const edge = {
    ...deal,
    stamps: deal.stamps.map((s, j) => (j === 0 ? { ...s, x: 0.01, ch: 'W', assetId: 'typ_W' } : s)),
  };
  assert.equal(sanitizeFieldForm(edge), null, 'ink off the dish refused');
  const overlapped = {
    ...deal,
    stamps: deal.stamps.map((s, j) => (j === 1 ? { ...s, x: deal.stamps[0].x, y: deal.stamps[0].y } : s)),
  };
  assert.equal(sanitizeFieldForm(overlapped), null, 'overlapping glyphs refused');
  const crushed = { ...deal, stamps: deal.stamps.map((s) => ({ ...s, em: 0.005 })) };
  assert.equal(sanitizeFieldForm(crushed), null, 'crushed type refused');
});

ok('every shipped placement passes the gate, and the legibility floor stays grounded', () => {
  let minEm = Infinity;
  let checked = 0;
  for (const deck of Object.values(POET_DECKS)) {
    for (const piece of deck) {
      for (const density of [0, 0.25, 0.5, 0.8, 1]) {
        for (const aspect of [0.5, 0.6, 1, 10 / 7, 16 / 9, 2.6, 3]) {
          const { stamps } = placePiece({ ...piece, density }, makeRng(77), { aspect });
          const gate = gateFieldForm(stamps, { aspect });
          assert.ok(gate.ok, `${piece.id} d=${density} a=${aspect} gated: ${gate.reason}`);
          for (const s of stamps) if (s.em < minEm) minEm = s.em;
          checked++;
        }
      }
    }
  }
  console.log(
    `  grid audit: ${checked} placements, smallest dealt em ${minEm.toFixed(4)} (floor ${FIELD_MIN_LEGIBLE_EM})`,
  );
  assert.ok(
    minEm >= FIELD_MIN_LEGIBLE_EM * 1.5,
    `the shipped minimum (${minEm.toFixed(4)}) keeps 1.5x headroom over the floor — if this fails, re-ground the floor in fieldForm.js`,
  );
});

ok('fieldFormForDeal is unchanged: it is fieldDealReport without the record', () => {
  for (let i = 0; i < 60; i++) {
    const d = choosePoet({ intensity: [0.2, 0.5, 0.85][i % 3], rng: makeRng(100 + i), typeEligible: true });
    if (!d) continue;
    const a = fieldFormForDeal(d, makeRng(7 + i), { aspect: 10 / 7 });
    const r = fieldDealReport(d, makeRng(7 + i), { aspect: 10 / 7 });
    assert.equal(JSON.stringify(a), JSON.stringify(r.form), 'same form through both doors');
    assert.equal(r.gate, null, 'real decisions are not gate refusals');
  }
});

ok('determinism: the whole battery replays byte-identical on the final tree', () => {
  const again = roomBattery({ seed: 1905, draws: 400 });
  assert.equal(JSON.stringify(again), JSON.stringify(battery), 'identical seeds -> identical distributions');
});

console.log(`fieldBattery.selfcheck: ${n} checks passed`);
