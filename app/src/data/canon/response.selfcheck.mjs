// node src/data/canon/response.selfcheck.mjs
// #2104 step 4 — the Canon style response: measured by default, author override wins (§10 ruling 5),
// the material vocabulary open. Pins:
//   1. the door: fail-closed shapes, per-key clamping, non-numeric amounts dropped per key,
//      a record with neither kineme nor material is no response
//   2. the material is open: any non-empty string is kept verbatim (matte/enamel/wet are the
//      starting set, not an enum); a non-string material drops
//   3. the measured default: a membered style with no authored record answers its settings'
//      measured centre — kineme breath = motion.breath, kineme drift = motion.lifeDrift —
//      and pulse/wobble are never invented by measurement
//   4. memberless styles (techno/pixel/organic) and unknown ids answer null (unmodulated)
//   5. the chapter read: a chapter answers through the one Canon style it stands on; the Now
//      chapter (no style) and an unknown chapter answer null
//   6. no style in the shipped deck carries an authored response yet (authoring values is a
//      feel call for Matt — the spec's §3 examples are illustrative of the shape, not ruled),
//      so every shipped answer today is the measured one
//   7. the blend (Q1, ruled 2026-11-13): the pull is one named constant in this one module;
//      the maths is dealt + PULL × (response − dealt) per measured key (breath/drift only —
//      pulse/wobble never blend, a key the dealt amounts do not carry is never invented);
//      and a null / kineme-less response is the identity — the SAME object back, untouched
//   8. the material through light (Q2, first half, ruled 2026-11-13): the light table is the
//      one home of the starting vocabulary's light behaviour — matte zeroes the bevel and
//      the specular, enamel strengthens the specular, wet dims the light that reaches the
//      mark and strengthens the specular; a word the table does not carry (the vocabulary
//      is open) and a missing material are the identity — the SAME sun record back; and no
//      chapter in the shipped deck resolves a material today, so the consumer is inert
//      until an author writes one (authoring values is a feel call for Matt)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  sanitizeStyleResponse,
  styleResponse,
  chapterStyleResponse,
  blendResponseAmounts,
  applyMaterialLight,
  MATERIAL_LIGHT,
  RESPONSE_KINEME_KEYS,
  RESPONSE_BLEND_PULL,
} from './response.js';
import { canonStyleSettings } from './settings.js';
import { CANON_STYLES } from './styles.js';
import { CHAPTERS } from '../chapters.js';
import { contractLight } from '../light.js';
import { resolvePalette } from '../palettes.js';

// ── 1. the door ─────────────────────────────────────────────────────────────────────────────────────────────
assert.equal(sanitizeStyleResponse(null), null);
assert.equal(sanitizeStyleResponse(undefined), null);
assert.equal(sanitizeStyleResponse('matte'), null);
assert.equal(sanitizeStyleResponse([]), null);
assert.equal(sanitizeStyleResponse({}), null, 'an empty record is no response');
assert.equal(sanitizeStyleResponse({ kineme: {} }), null, 'kineme with no kept key is no response');
assert.equal(sanitizeStyleResponse({ material: '' }), null, 'an empty material is no response');
assert.equal(sanitizeStyleResponse({ material: '   ' }), null, 'a blank material is no response');
assert.deepEqual(sanitizeStyleResponse({ kineme: { breath: 2, drift: -1 } }), {
  kineme: { breath: 1, drift: 0 },
});
assert.deepEqual(
  sanitizeStyleResponse({ kineme: { breath: 'x', pulse: 0.5 } }),
  { kineme: { pulse: 0.5 } },
  'a non-numeric amount drops its key, never the record',
);
assert.deepEqual(
  sanitizeStyleResponse({ kineme: { spin: 0.5 } }),
  null,
  'an unknown kineme key is not in the vocabulary and carries nothing',
);
assert.deepEqual(RESPONSE_KINEME_KEYS, ['breath', 'drift', 'pulse', 'wobble']);

// ── 2. the open material ────────────────────────────────────────────────────────────────────────────────────
assert.deepEqual(sanitizeStyleResponse({ material: 'matte' }), { material: 'matte' });
assert.deepEqual(sanitizeStyleResponse({ material: 'enamel' }), { material: 'enamel' });
assert.deepEqual(sanitizeStyleResponse({ material: 'wet' }), { material: 'wet' });
assert.deepEqual(
  sanitizeStyleResponse({ material: 'raw-linen' }),
  { material: 'raw-linen' },
  'the vocabulary is open: a material nobody listed is still a material',
);
assert.equal(sanitizeStyleResponse({ material: 7 }), null, 'a non-string material drops');

// ── 3 + 6. the measured default over the shipped deck ───────────────────────────────────────────────────────
for (const s of CANON_STYLES) assert.equal(s.response, undefined, `${s.id}: no authored response ships in this step`);
for (const s of CANON_STYLES) {
  const settings = canonStyleSettings(s.id);
  const r = styleResponse(s.id);
  if (!settings) {
    assert.equal(r, null, `${s.id}: memberless → unmodulated`);
    continue;
  }
  assert.deepEqual(
    r,
    { kineme: { breath: settings.motion.breath, drift: settings.motion.lifeDrift } },
    `${s.id}: the measured centre, in the response's key space`,
  );
  assert.ok(!('pulse' in r.kineme) && !('wobble' in r.kineme), `${s.id}: measurement never invents pulse/wobble`);
  assert.ok(!('material' in r), `${s.id}: measurement names no material — materials are authored`);
}
assert.equal(styleResponse('no-such-style'), null);
assert.equal(styleResponse(null), null);
assert.equal(styleResponse(undefined), null);

// ── 5. the chapter read ─────────────────────────────────────────────────────────────────────────────────────
for (const c of CHAPTERS) {
  assert.deepEqual(chapterStyleResponse(c.id), c.style ? styleResponse(c.style) : null, `${c.id}: via its style`);
}
assert.equal(chapterStyleResponse('no-such-chapter'), null);

// ── 7. the blend (Q1) ───────────────────────────────────────────────────────────────────────────────
assert.equal(RESPONSE_BLEND_PULL, 0.5, 'the pull is the ruled even blend, a named constant');
// dyadic values, so the expected results are exact doubles: dealt moves halfway to the response
assert.deepEqual(
  blendResponseAmounts({ breath: 0.5, drift: 0.25, pulse: 0.5 }, { kineme: { breath: 0.25, drift: 0.75 } }),
  { breath: 0.375, drift: 0.5, pulse: 0.5 },
  'per measured key: dealt + PULL × (response − dealt); pulse is not a measured key and never blends',
);
assert.deepEqual(
  blendResponseAmounts(
    { breath: 0.5, drift: 0.5, pulse: 0.5 },
    { kineme: { breath: 0.25, pulse: 0.875, wobble: 0.875 } },
  ),
  { breath: 0.375, drift: 0.5, pulse: 0.5 },
  'a response carrying pulse/wobble (an author may declare them) still blends breath/drift only',
);
// the formula itself, on non-dyadic values, written out in the test's own hand
{
  const dealt = { breath: 0.3, drift: 0.5, pulse: 0 };
  const target = styleResponse('swiss');
  const out = blendResponseAmounts(dealt, target);
  assert.equal(out.breath, 0.3 + RESPONSE_BLEND_PULL * (target.kineme.breath - 0.3));
  assert.equal(out.drift, 0.5 + RESPONSE_BLEND_PULL * (target.kineme.drift - 0.5));
  assert.equal(out.pulse, 0);
}
// identity: nothing to blend with → the very same object back (no float ops, no shape change)
{
  const dealt = { breath: 0.3, drift: 0.5, pulse: 0.2 };
  assert.equal(blendResponseAmounts(dealt, null), dealt, 'a null response is the identity');
  assert.equal(blendResponseAmounts(dealt, undefined), dealt);
  assert.equal(blendResponseAmounts(dealt, { material: 'matte' }), dealt, 'a material-only response blends nothing');
  assert.equal(blendResponseAmounts(dealt, { kineme: {} }), dealt, 'a kineme record with no keys blends nothing');
  assert.equal(
    blendResponseAmounts(dealt, { kineme: { pulse: 0.9 } }),
    dealt,
    'a response with no measured key blends nothing',
  );
}
// a key the dealt amounts do not carry is never invented; a non-numeric dealt value never blends
assert.deepEqual(blendResponseAmounts({ drift: 0 }, { kineme: { breath: 0.25, drift: 0.75 } }), { drift: 0.375 });
{
  const dealt = { breath: undefined, drift: 0.5 };
  const out = blendResponseAmounts(dealt, { kineme: { breath: 0.25, drift: 0.75 } });
  assert.equal(out.breath, undefined, 'an absent dealt amount stays absent');
  assert.equal(out.drift, 0.625);
}
// the constant's single home: defined once, in this module; the one consumer calls the helper
// and never reads the constant itself
{
  const own = readFileSync(new URL('./response.js', import.meta.url), 'utf8');
  assert.equal(own.match(/RESPONSE_BLEND_PULL\s*=/g).length, 1, 'the pull is defined exactly once');
  const consumer = readFileSync(new URL('../../gl/liveResolve.mjs', import.meta.url), 'utf8');
  assert.ok(consumer.includes('blendResponseAmounts('), 'the resolver consumes the blend through the helper');
  assert.ok(!consumer.includes('RESPONSE_BLEND_PULL'), 'the resolver never reads the pull itself — one home');
}

// ── 8. the material through light (Q2, first half) ──────────────────────────────────────────────────────────
assert.deepEqual(Object.keys(MATERIAL_LIGHT), ['matte', 'enamel', 'wet'], 'the starting set, in ruled order');
assert.ok(
  Object.isFrozen(MATERIAL_LIGHT) && Object.isFrozen(MATERIAL_LIGHT.wet),
  'the table and its entries are frozen',
);
// a real contract sun, built the way the seam builds it (the door + the resolved colour)
const sun = contractLight(
  { x: 220, y: 140, height: 260, intensity: 0.8, ambient: 0.5, slot: 'white', bevel: 0.6, spec: 0.5, pool: 0.25 },
  resolvePalette('praystation'),
);
assert.ok(sun, 'the fixture sun resolves');
// matte: flat, no shine — the bevel relief and the specular are answered with nothing;
// the mark is still lit by everything else the sun carries
{
  const out = applyMaterialLight(sun, 'matte');
  assert.notEqual(out, sun, 'a known material answers with a copy');
  assert.equal(out.bevel, 0, 'matte: no bevel relief');
  assert.equal(out.spec, 0, 'matte: no specular');
  assert.deepEqual({ ...out, bevel: sun.bevel, spec: sun.spec }, sun, 'matte touches the bevel and the specular only');
  assert.deepEqual(Object.keys(out), Object.keys(sun), 'the answer carries exactly the sun’s keys, in order');
}
// enamel: a hard shine — the specular strengthens by the table's factor (clamped to the
// sun's own 0..1 field range); its tightness is the shader's default, not the table's
{
  const out = applyMaterialLight(sun, 'enamel');
  assert.equal(out.spec, Math.min(1, sun.spec * MATERIAL_LIGHT.enamel.spec), 'enamel: spec × the table factor');
  assert.deepEqual({ ...out, spec: sun.spec }, sun, 'enamel touches the specular only');
  const hot = applyMaterialLight({ ...sun, spec: 0.9 }, 'enamel');
  assert.equal(hot.spec, 1, 'a strengthened specular clamps to the field’s own range, never past it');
}
// wet: dark and glossy — the light that reaches the mark falls (intensity AND ambient,
// darkening through light, never a tint) while the specular strengthens against it
{
  const out = applyMaterialLight(sun, 'wet');
  assert.equal(out.intensity, sun.intensity * MATERIAL_LIGHT.wet.intensity, 'wet: the direct light falls');
  assert.equal(out.ambient, sun.ambient * MATERIAL_LIGHT.wet.ambient, 'wet: the ambient light falls with it');
  assert.equal(out.spec, Math.min(1, sun.spec * MATERIAL_LIGHT.wet.spec), 'wet: the specular strengthens');
  assert.deepEqual(
    { ...out, intensity: sun.intensity, ambient: sun.ambient, spec: sun.spec },
    sun,
    'wet touches intensity, ambient and the specular only — no colour, no pool, no geometry of the sun',
  );
  assert.deepEqual(out.color, sun.color, 'wet never tints: the sun’s colour is the palette’s, unchanged');
}
// identity: an unlisted word (lawful data — the vocabulary is open), a missing material,
// and a missing sun all pass the record through untouched, the same reference back
assert.equal(applyMaterialLight(sun, 'raw-linen'), sun, 'a word the table does not carry reads unmodulated');
assert.equal(applyMaterialLight(sun, 'constructor'), sun, 'a prototype word is not a material either');
assert.equal(applyMaterialLight(sun, undefined), sun);
assert.equal(applyMaterialLight(sun, null), sun);
assert.equal(applyMaterialLight(sun, ''), sun);
assert.equal(applyMaterialLight(null, 'wet'), null, 'no sun, no answer');
// a field the sun does not carry is never invented by a word that names it
{
  const bare = { intensity: 0.5 };
  const out = applyMaterialLight(bare, 'wet');
  assert.deepEqual(Object.keys(out), ['intensity'], 'wet scales the intensity it finds and invents nothing');
  assert.equal(out.intensity, 0.5 * MATERIAL_LIGHT.wet.intensity);
}
// through the door: a synthetic authored response is the seam's exact input — the door
// writes the word, the helper answers the sun
{
  const authoredWet = sanitizeStyleResponse({ material: 'wet' });
  assert.equal(applyMaterialLight(sun, authoredWet.material).spec, Math.min(1, sun.spec * MATERIAL_LIGHT.wet.spec));
  const authoredUnknown = sanitizeStyleResponse({ material: 'raw-linen' });
  assert.equal(applyMaterialLight(sun, authoredUnknown.material), sun, 'an authored unknown word is still inert');
}
// the shipped deck: no chapter resolves a material today — measurement never names one
// and no authored response ships (pin 6) — so the consumer is inert over the whole deck
for (const c of CHAPTERS) {
  assert.equal(chapterStyleResponse(c.id)?.material, undefined, `${c.id}: no material stands today`);
}
// the table's single home: defined once, in this module; the contract seam consumes it
// through the helper and never reads the table itself
{
  const own = readFileSync(new URL('./response.js', import.meta.url), 'utf8');
  assert.equal(own.match(/MATERIAL_LIGHT\s*=/g).length, 1, 'the light table is defined exactly once');
  const seam = readFileSync(new URL('../../gl/sceneContract.js', import.meta.url), 'utf8');
  assert.ok(seam.includes('applyMaterialLight('), 'the scene contract consumes the material through the helper');
  assert.ok(seam.includes('chapterStyleResponse('), 'the seam reads the standing chapter’s response');
  assert.ok(!seam.includes('MATERIAL_LIGHT'), 'the seam never reads the table itself — one home');
}

console.log(
  'response.selfcheck: OK — door, open material, measured centre, memberless null, chapter read, blend (Q1), material light (Q2)',
);
