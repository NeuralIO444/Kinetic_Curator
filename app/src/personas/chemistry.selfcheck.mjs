// chemistry.selfcheck.mjs — Persona Adapters A5 (#2398): the learned relation offsets and the
// clamp law. The acceptance property, checked as a property: an offset NEVER pushes an effective
// bias outside the tuning table's declared domain [-1, 1] and NEVER flips a ruled base bias's
// sign; an unruled pair stays unruled; no offsets anywhere = the identical tuning object.
import assert from 'node:assert/strict';
import {
  RELATION_PAIR_KEYS,
  validateRelationsSection,
  relationsOverlay,
  applyRelationOffsets,
  tuningWithChemistry,
} from './chemistry.mjs';
import { TUNING_DEFAULTS, personaTuning } from './tuning.mjs';
import { validateTaste } from '../curator/tasteHead.js';
import { FEATURES_VERSION } from '../curator/recipeFeatures.js';

const baseTaste = () => ({
  kind: 'kc-taste',
  version: 1,
  featuresVersion: FEATURES_VERSION,
  model: 'm',
  dims: 1152,
  labels: { likes: 42, passes: 180 },
  trainedAt: '2026-09-30T00:00:00Z',
  head: { terms: { 'scale=large': 1.5 }, num: { count: -2 }, bias: 0.1, fidelity: 0.71, fitOn: 222 },
});

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

ok('the pair keys are exactly the tuning table\u2019s relation keys', () => {
  assert.deepEqual([...RELATION_PAIR_KEYS].sort(), Object.keys(TUNING_DEFAULTS.relations).sort());
  assert.equal(RELATION_PAIR_KEYS.length, 42);
});

ok('strict validation: clean sections pass rebuilt; anything off neutralizes the section', () => {
  assert.deepEqual(validateRelationsSection({ 'davis->lois': 0.25, 'lois->davis': -1 }), {
    'davis->lois': 0.25,
    'lois->davis': -1,
  });
  assert.equal(validateRelationsSection({ 'davis->davis': 0.5 }), null, 'a self-pair is not a pair');
  assert.equal(validateRelationsSection({ 'davis->lois': 1.5 }), null, 'outside the bias domain');
  assert.equal(validateRelationsSection({ 'davis->lois': 'warm' }), null);
  assert.equal(validateRelationsSection({}), null);
  assert.equal(validateRelationsSection(null), null);
});

ok('the lenient overlay read: damage falls back alone, the rest still lands', () => {
  assert.deepEqual(
    relationsOverlay({ 'davis->lois': 0.25, 'bogus->pair': 1, 'lois->davis': 99, 'carson->greiman': -0.5 }),
    { 'davis->lois': 0.25, 'carson->greiman': -0.5 },
  );
  assert.equal(relationsOverlay({ 'bogus->pair': 1 }), null);
  assert.equal(relationsOverlay(undefined), null);
});

ok('the property: offsets never leave [-1, 1] and never flip a ruled bias\u2019s sign', () => {
  // deterministic sweep over bases and offsets, incl. the extremes
  const bases = [-1, -0.7, -0.2, -0.01, 0, 0.01, 0.2, 0.7, 1];
  const offs = [-1, -0.9, -0.5, -0.1, 0, 0.1, 0.5, 0.9, 1];
  for (const b of bases) {
    for (const o of offs) {
      const base = Object.fromEntries(RELATION_PAIR_KEYS.map((k) => [k, b]));
      const eff = applyRelationOffsets(base, { 'davis->lois': o })['davis->lois'];
      assert.ok(eff >= -1 && eff <= 1, `effective ${eff} outside [-1, 1] (base ${b}, offset ${o})`);
      if (b > 0) assert.ok(eff >= 0, `offset ${o} flipped base ${b} negative`);
      if (b < 0) assert.ok(eff <= 0, `offset ${o} flipped base ${b} positive`);
    }
  }
});

ok('unruled stays unruled; a missing offset leaves the base untouched; zero base takes the offset', () => {
  const allNull = Object.fromEntries(RELATION_PAIR_KEYS.map((k) => [k, null]));
  const shifted = applyRelationOffsets(allNull, { 'davis->lois': 0.9 });
  assert.equal(shifted['davis->lois'], null, 'chemistry never invents a base bias');
  const base = { ...allNull, 'davis->lois': 0.4, 'lois->davis': 0 };
  const out = applyRelationOffsets(base, { 'lois->davis': -0.3 });
  assert.equal(out['davis->lois'], 0.4, 'no offset for the pair — base untouched');
  assert.equal(out['lois->davis'], -0.3, 'a zero base has no sign to flip; the offset applies');
});

ok('no offsets = the identical tuning object; offsets shift only the relations', () => {
  const tuning = personaTuning();
  assert.equal(tuningWithChemistry(null), tuning);
  assert.equal(tuningWithChemistry({ format: 'x' }), tuning);
  assert.equal(tuningWithChemistry({ relations: {} }), tuning);
  const ruled = { ...tuning, relations: { ...tuning.relations, 'davis->lois': 0.5 } };
  const shifted = tuningWithChemistry({ relations: { 'davis->lois': -0.9 } }, ruled);
  assert.notEqual(shifted, ruled);
  assert.equal(shifted.relations['davis->lois'], 0, 'softened to zero, never flipped');
  assert.equal(shifted.personas, ruled.personas, 'everything else is the same object');
});

ok('a taste carrying relations validates with them; a malformed section neutralizes, taste stands', () => {
  const good = validateTaste({ ...baseTaste(), relations: { 'davis->lois': 0.25 } });
  assert.equal(good.ok, true);
  assert.deepEqual(good.taste.relations, { 'davis->lois': 0.25 });
  const bad = validateTaste({ ...baseTaste(), relations: { 'davis->lois': 7 } });
  assert.equal(bad.ok, true);
  assert.equal(bad.taste.relations, undefined, 'the malformed section is dropped, the taste stands');
});

console.log(`chemistry.selfcheck: ${n} checks passed`);
