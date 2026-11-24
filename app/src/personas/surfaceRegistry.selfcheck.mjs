// surfaceRegistry.selfcheck.mjs — #2461 slice 3: the persona surface registry + head-consumption registry.
//
// Pins the slice's contract (spec Q1–Q3, Q6, ruled 2026-11-23):
//   A  the surface registry is exactly the Tier 1 trio, every entry sourced against the real module
//      it describes (a named export that no longer exists is drift, and fails here)
//   B  the limits are the code's own values — imported constants match, and the two validator
//      literals (critique delta cap, Queen lean keys) match mindContract's source text
//   C  Tier 2 / Tier 3 ship NO entries; the tiers exist as a shape only
//   D  the head-consumption registry states only consumption that exists today, under the standing
//      structure / earn-in law — no new head, no impossible head, no Queen personas-section entry
//   E  descriptive only: nothing in src imports the registry, so it cannot change runtime behaviour
import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PERSONA_SURFACE,
  PERSONA_SURFACE_SCHEMA,
  HEAD_CONSUMPTION,
  HEAD_CONSUMPTION_SCHEMA,
  HEAD_EARN_IN,
  SURFACE_TIERS,
  SURFACE_PROBLEMS,
  surfaceById,
  headConsumptionFor,
} from './surfaceRegistry.mjs';
import { PERSONAS as MIND_PERSONAS, CANONICAL_STATES, MOODS, MAX_LINE, MAX_DECAY_BARS, wantsStage } from '../curator/mindContract.js';
import { PERSONA_VOICES } from '../curator/megamindVoice.mjs';
import { ROUTE_OPS, TIER_OPS, ENERGY_LEVELS, BRAKE_AT, BRAKE_MAX } from '../curator/mindConduct.js';
import { MAX_ROUTES } from '../gl/audioRoutes.mjs';
import { LOIS_JUDGE_ID } from '../curator/loisJudge.mjs';
import { VISION_JUDGE_ID } from '../curator/megamindVision.mjs';
import { MIN_KEEPS } from '../curator/queenLean.mjs';
import { PERSONA_HEAD_IDS, PERSONA_HEAD_STRUCTURE } from '../curator/tasteHead.js';
import { getPersona } from './registry.mjs';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('surfaceRegistry.selfcheck');

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcText = (module) => readFileSync(join(SRC, module), 'utf8');
const exportPattern = (name) =>
  new RegExp(`export\\s+(?:async\\s+)?(?:const|let|var|function|class)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`);

// ── A · the surface registry ─────────────────────────────────────────────────────
ok('A1 no drift: the registry validates clean', () => {
  assert.deepEqual([...SURFACE_PROBLEMS], []);
  for (const e of PERSONA_SURFACE) assert.equal(e.schema, PERSONA_SURFACE_SCHEMA);
  for (const e of HEAD_CONSUMPTION) assert.equal(e.schema, HEAD_CONSUMPTION_SCHEMA);
});

ok('A2 the surface is exactly the Tier 1 trio (Q2), matching mindContract and the voices', () => {
  assert.deepEqual(PERSONA_SURFACE.map((e) => e.id).sort(), [...MIND_PERSONAS].sort());
  assert.deepEqual(Object.keys(PERSONA_VOICES).sort(), [...MIND_PERSONAS].sort());
  for (const e of PERSONA_SURFACE) {
    assert.equal(e.tier, 1);
    assert.equal(e.kind, getPersona(e.id).kind, `${e.id}: kind is its kc-persona/1 record's`);
    assert.equal(e.callsign, getPersona(e.id).identity.callsign, `${e.id}: callsign is its record's`);
    assert.ok(Object.isFrozen(e) && Object.isFrozen(e.limits), `${e.id}: frozen`);
  }
  assert.equal(surfaceById('governor'), null, 'Tier 2 ships no entry');
  assert.equal(surfaceById('curator'), null, 'Tier 3 ships no entry');
});

ok('A3 every reads/verbs source pointer names a real export in a real module', () => {
  for (const e of PERSONA_SURFACE)
    for (const r of [...e.reads, ...e.verbs]) {
      assert.ok(existsSync(join(SRC, r.source.module)), `${e.id}/${r.id}: ${r.source.module} exists`);
      assert.ok(
        exportPattern(r.source.export).test(srcText(r.source.module)),
        `${e.id}/${r.id}: ${r.source.export} is exported by ${r.source.module}`,
      );
    }
});

ok('A4 channels name real bus events; the Queen is never on the stage-ask channel', () => {
  const bus = srcText('composition/eventBus.js');
  for (const e of PERSONA_SURFACE)
    for (const c of e.channels) {
      if (c.kind === 'bus') assert.ok(bus.includes(`'${c.name}'`), `${e.id}: ${c.name} is a real bus event`);
      assert.ok(exportPattern(c.source.export).test(srcText(c.source.module)), `${e.id}: channel source export`);
    }
  const stageAsk = (id) => surfaceById(id).channels.some((c) => c.name === 'mind:request');
  assert.ok(stageAsk('davis') && stageAsk('lois'), 'the directors may ask the stage');
  assert.ok(!stageAsk('queen'), 'the Queen never asks the stage');
  assert.equal(wantsStage('queen', { mood: 'calm', lean: {} }), false, 'the contract itself agrees');
});

// ── B · the limits are the code's own ────────────────────────────────────────────
ok('B1 imported limits match the enforcing modules, entry by entry', () => {
  const d = surfaceById('davis').limits;
  assert.equal(d.maxLine, MAX_LINE);
  assert.equal(d.maxDecayBars, MAX_DECAY_BARS);
  assert.deepEqual([...d.canonicalStates], [...CANONICAL_STATES.davis]);
  assert.deepEqual([...d.routeOps], [...ROUTE_OPS]);
  assert.deepEqual(Object.keys(d.tierOps), Object.keys(TIER_OPS));
  assert.deepEqual([...d.energyLevels], [...ENERGY_LEVELS]);
  assert.equal(d.maxRoutes, MAX_ROUTES);
  const l = surfaceById('lois').limits;
  assert.equal(l.brakeAt, BRAKE_AT);
  assert.equal(l.brakeMax, BRAKE_MAX);
  assert.equal(l.judgeId, LOIS_JUDGE_ID);
  assert.equal(l.visionJudgeId, VISION_JUDGE_ID);
  assert.deepEqual([...l.canonicalStates], [...CANONICAL_STATES.lois]);
  const q = surfaceById('queen').limits;
  assert.deepEqual([...q.moods], [...MOODS]);
  assert.equal(q.minKeeps, MIN_KEEPS, 'minKeeps is stated as data in the registry, pinned here against queenLean’s export');
  assert.deepEqual([...q.canonicalStates], [], 'the Queen has no canonical face states');
  assert.ok(!('queen' in CANONICAL_STATES), 'the contract agrees: no queen entry');
  assert.equal(q.surfaceFacing, false, 'she is never surfaced');
});

ok('B2 the two validator literals match mindContract source text', () => {
  const contract = srcText('curator/mindContract.js');
  assert.ok(contract.includes('Math.abs(delta) > 0.25'), 'the critique delta cap literal is in the validator');
  assert.equal(surfaceById('lois').limits.critiqueDeltaMax, 0.25);
  assert.ok(contract.includes("['wetness', 'evolve']"), 'the lean keys literal is in the validator');
  assert.deepEqual([...surfaceById('queen').limits.leanKeys], ['wetness', 'evolve']);
});

// ── C · tiers ────────────────────────────────────────────────────────────────────
ok('C1 tiers exist as a shape; only Tier 1 is served and only Tier 1 has entries (Q3)', () => {
  assert.deepEqual(SURFACE_TIERS.map((t) => t.tier), [1, 2, 3]);
  assert.deepEqual(SURFACE_TIERS.map((t) => t.served), [true, false, false]);
  assert.ok(PERSONA_SURFACE.every((e) => e.tier === 1));
  assert.ok(HEAD_CONSUMPTION.every((e) => PERSONA_SURFACE.some((s) => s.id === e.persona)));
});

// ── D · head consumption ─────────────────────────────────────────────────────────
ok('D1 consumption entries: 6, Tier 1 only, each consumer a real module member', () => {
  assert.equal(HEAD_CONSUMPTION.length, 6);
  assert.deepEqual(
    HEAD_CONSUMPTION.map((e) => `${e.persona}:${e.head}:${e.kind}`).sort(),
    [
      'davis:persona-head:solo',
      'davis:persona-head:trade',
      'lois:persona-head:trade',
      'queen:queen-head:inclination',
      'queen:queen-timing:timing',
      'queen:shared-taste:ranking',
    ],
  );
  for (const e of HEAD_CONSUMPTION) {
    assert.ok(existsSync(join(SRC, e.consumer.module)), `${e.persona}/${e.head}: consumer module exists`);
    assert.ok(
      new RegExp(`\\b${e.consumer.export}\\b`).test(srcText(e.consumer.module)),
      `${e.persona}/${e.head}: ${e.consumer.export} is in ${e.consumer.module}`,
    );
    assert.ok(
      exportPattern(e.consumer.via.export).test(srcText(e.consumer.via.module)),
      `${e.persona}/${e.head}: via ${e.consumer.via.export} is exported by ${e.consumer.via.module}`,
    );
  }
});

ok('D2 persona-head consumption obeys the standing structure — no impossible head', () => {
  for (const e of HEAD_CONSUMPTION.filter((x) => x.head === 'persona-head')) {
    assert.ok(PERSONA_HEAD_IDS.includes(e.persona), `${e.persona} may hold a persona head`);
    assert.ok(
      PERSONA_HEAD_STRUCTURE[e.kind].includes(e.persona),
      `${e.persona} may hold a ${e.kind} head (structure table)`,
    );
  }
  assert.equal(headConsumptionFor('lois').filter((e) => e.kind === 'solo' || e.kind === 'cut').length, 0);
});

ok('D3 the Queen holds no personas-section head — hers are the timing and third heads (A6 / queenChannel)', () => {
  assert.ok(!PERSONA_HEAD_IDS.includes('queen'), 'the taste validator itself excludes her from the section');
  assert.equal(headConsumptionFor('queen').filter((e) => e.head === 'persona-head').length, 0);
  assert.deepEqual(headConsumptionFor('queen').map((e) => e.head).sort(), ['queen-head', 'queen-timing', 'shared-taste']);
});

ok('D4 the earn-in law stated is the imported law', () => {
  assert.equal(HEAD_EARN_IN.minLabeledTurns, 200);
  assert.equal(HEAD_EARN_IN.minFidelity, 0.3);
  assert.deepEqual([...HEAD_EARN_IN.personaHeadIds], [...PERSONA_HEAD_IDS]);
  assert.deepEqual(Object.keys(HEAD_EARN_IN.personaHeadStructure), ['solo', 'trade', 'cut']);
});

// ── E · descriptive only ─────────────────────────────────────────────────────────
ok('E1 nothing in src imports the registry — it is not a call path and changes no behaviour', () => {
  const walk = (d) =>
    readdirSync(d).flatMap((name) => {
      const p = join(d, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  // An import edge is the claim — two deniability selfchecks legitimately NAME these files in
  // their allowlists (#2461 slice 3 re-pins), which is text, not an import.
  const importOf = /from\s+['"][^'"]*surfaceRegistry(?:\.mjs)?['"]|import\(\s*['"][^'"]*surfaceRegistry/;
  const offenders = walk(SRC)
    .filter((p) => /\.(mjs|js|jsx)$/.test(p))
    .filter((p) => !p.endsWith('surfaceRegistry.mjs') && !p.endsWith('surfaceRegistry.selfcheck.mjs'))
    .filter((p) => importOf.test(readFileSync(p, 'utf8')));
  assert.deepEqual(offenders, []);
});

console.log(`surfaceRegistry.selfcheck: ${passed} checks passed`);
