// personaKernel.selfcheck.mjs — #2381 (Persona Kernel P1): the `kc-persona/1` records + registry.
//
// Pins the slice's contract (docs/design/persona-kernel-spec.md §2, §5):
//   A  the registry: every record validates against the schema (drift is a failure, not a warning), the cast
//      is exactly the 19 records in cast order, records are deep-frozen, and the validator itself bites
//   B  the tastes: curator/personaTastes.js is a pure reader — every PERSONA_TASTES row is its record's
//      identity/taste slots projected back, weight keys stay inside the 19 features, Canon style ids resolve
//   C  the doctrines: curator/doctrines.mjs projects CARSON and ASHWORTH only; GREIMAN's record exists but
//      is nobody's doctrine until P5, so DOCTRINE_IDS and doctrineOfMode('greiman') are unchanged
//   D  the docs: docs/characters/*.md names and dates match the records (the human-readable view cannot
//      drift from the kernel)
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  PERSONAS,
  PERSONA_PROBLEMS,
  PERSONA_SCHEMA,
  getPersona,
  personaIds,
  validatePersonaRecord,
} from './registry.mjs';
import { PERSONA_TASTES, TASTE_FEATURES } from '../curator/personaTastes.js';
import { DOCTRINES, DOCTRINE_IDS, doctrineOfMode, isDoctrine } from '../curator/doctrines.mjs';
import { isCanonStyle } from '../data/canon/styles.js';

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
console.log('personaKernel.selfcheck');

// ── A · the registry ─────────────────────────────────────────────────────
ok('A1 no drift: every record validates against kc-persona/1', () => {
  assert.deepStrictEqual([...PERSONA_PROBLEMS], []);
  for (const r of PERSONAS) assert.equal(r.schema, PERSONA_SCHEMA);
});

ok('A2 the cast is exactly the 19 records, in cast order', () => {
  assert.deepStrictEqual(personaIds(), [
    'lois',
    'davis',
    'queen',
    'governor',
    'carson',
    'greiman',
    'ashworth',
    'te',
    'taste',
    'molnar',
    'mohr',
    'benjamin',
    'reas',
    'haeckel',
    'oxman',
    'stock',
    'anadol',
    'menkman',
  ]);
  assert.equal(getPersona('nope'), null);
});

ok('A3 kinds: directors, listener, governor, three doctrines, TE a voice, TASTE the judge', () => {
  const kind = (id) => getPersona(id).kind;
  assert.equal(kind('lois'), 'director');
  assert.equal(kind('davis'), 'director');
  assert.equal(kind('queen'), 'listener');
  assert.equal(kind('governor'), 'governor');
  for (const id of ['carson', 'greiman', 'ashworth']) assert.equal(kind(id), 'doctrine');
  assert.equal(kind('te'), 'voice');
  assert.equal(kind('taste'), 'judge');
  for (const id of ['molnar', 'mohr', 'benjamin', 'reas', 'haeckel', 'oxman', 'stock', 'anadol', 'menkman'])
    assert.equal(kind(id), 'voice');
});

ok('A4 records are deep-frozen, callsigns follow the surface law (QUEEN and GOVERNOR never named)', () => {
  for (const r of PERSONAS) {
    assert.ok(Object.isFrozen(r), `${r.id} record frozen`);
    assert.ok(Object.isFrozen(r.identity), `${r.id} identity frozen`);
    if (r.taste) assert.ok(Object.isFrozen(r.taste.weights), `${r.id} weights frozen`);
  }
  assert.equal(getPersona('queen').identity.callsign, null);
  assert.equal(getPersona('governor').identity.callsign, null);
  assert.equal(getPersona('lois').identity.callsign, 'COVER');
  assert.equal(getPersona('davis').identity.callsign, 'OVERLAP');
  assert.equal(getPersona('carson').identity.callsign, 'BLAST');
  assert.equal(getPersona('greiman').identity.callsign, 'HYBRID');
  assert.equal(getPersona('ashworth').identity.callsign, 'SWISS GRIT');
});

ok('A5 the validator bites: bad kind, unknown slot, wild weight, missing identity all fail', () => {
  const good = getPersona('molnar');
  const clone = () => JSON.parse(JSON.stringify(good));
  const badKind = clone();
  badKind.kind = 'singer';
  assert.ok(validatePersonaRecord(badKind).length > 0);
  const badSlot = clone();
  badSlot.nickname = 'Vera';
  assert.ok(validatePersonaRecord(badSlot).length > 0);
  const badWeight = clone();
  badWeight.taste.weights.disorder = -2;
  assert.ok(validatePersonaRecord(badWeight).length > 0);
  const noIdentity = clone();
  delete noIdentity.identity;
  assert.ok(validatePersonaRecord(noIdentity).length > 0);
  assert.deepStrictEqual(validatePersonaRecord(clone()), []);
});

// ── B · the tastes ───────────────────────────────────────────────────────
ok('B1 PERSONA_TASTES is the records projected back — same ids, names, aliases, rationales, weights', () => {
  assert.deepStrictEqual(
    PERSONA_TASTES.map((p) => p.id),
    ['davis', 'molnar', 'mohr', 'benjamin', 'reas', 'haeckel', 'oxman', 'stock', 'anadol', 'menkman'],
  );
  for (const p of PERSONA_TASTES) {
    const r = getPersona(p.id);
    assert.equal(p.name, r.identity.name, `${p.id} name`);
    assert.equal(p.alias, r.identity.callsign, `${p.id} alias`);
    assert.equal(p.rationale, r.taste.rationale, `${p.id} rationale`);
    assert.deepStrictEqual(p.weights, { ...r.taste.weights }, `${p.id} weights`);
  }
});

ok('B2 every weight key is one of the 19 features; every Canon style id resolves (or is null)', () => {
  const features = new Set(TASTE_FEATURES);
  assert.equal(features.size, 19);
  for (const r of PERSONAS) {
    if (!r.taste) continue;
    for (const key of Object.keys(r.taste.weights)) assert.ok(features.has(key), `${r.id} weight '${key}'`);
    assert.ok(r.taste.canonStyle === null || isCanonStyle(r.taste.canonStyle), `${r.id} canonStyle`);
  }
  assert.equal(getPersona('haeckel').taste.canonStyle, 'engraved');
  assert.equal(getPersona('carson').taste, undefined);
});

// ── C · the doctrines ────────────────────────────────────────────────────
ok('C1 DOCTRINES projects the carson + ashworth records — and nothing else', () => {
  assert.deepStrictEqual([...DOCTRINE_IDS], ['carson', 'ashworth']);
  for (const id of DOCTRINE_IDS) {
    const d = getPersona(id).doctrine;
    assert.deepStrictEqual(
      { id: DOCTRINES[id].id, name: DOCTRINES[id].name, modes: [...DOCTRINES[id].modes], title: DOCTRINES[id].title },
      { id, name: d.name, modes: d.modes, title: d.title },
      `${id} projection`,
    );
  }
});

ok('C2 GREIMAN has a record and a doctrine slot, but is nobody\u2019s doctrine until P5', () => {
  assert.deepStrictEqual(getPersona('greiman').doctrine.modes, ['greiman']);
  assert.equal(isDoctrine('greiman'), false);
  assert.equal(doctrineOfMode('greiman'), null);
});

// ── D · the docs ─────────────────────────────────────────────────────────
const MONTHS = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};
const docDates = (text) => {
  const found = new Set();
  const re = /(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const month = MONTHS[m[2].toLowerCase()] ?? MONTHS[Object.keys(MONTHS).find((k) => k.startsWith(m[2].toLowerCase()))];
    if (month) found.add(`${m[3]}-${month}-${m[1].padStart(2, '0')}`);
  }
  return found;
};

ok('D1 docs/characters/*.md names and dates match the records', () => {
  for (const id of ['lois', 'davis', 'queen', 'governor']) {
    const text = readFileSync(new URL(`../../../docs/characters/${id}.md`, import.meta.url), 'utf8');
    const r = getPersona(id);
    assert.ok(text.includes(r.identity.name), `${id}.md names ${r.identity.name}`);
    const dates = docDates(text);
    if (r.identity.born) assert.ok(dates.has(r.identity.born), `${id}.md carries born ${r.identity.born}`);
    if (r.identity.died) assert.ok(dates.has(r.identity.died), `${id}.md carries died ${r.identity.died}`);
  }
});

console.log(`personaKernel.selfcheck: ${passed} passed`);
