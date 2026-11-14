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
import assert from 'node:assert/strict';
import { sanitizeStyleResponse, styleResponse, chapterStyleResponse, RESPONSE_KINEME_KEYS } from './response.js';
import { canonStyleSettings } from './settings.js';
import { CANON_STYLES } from './styles.js';
import { CHAPTERS } from '../chapters.js';

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

console.log('response.selfcheck: OK — door, open material, measured centre, memberless null, chapter read');
