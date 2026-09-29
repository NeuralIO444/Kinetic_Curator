import assert from 'node:assert/strict';
import {
  TAXONOMY_VERSION,
  TAXONOMY_COMPAT,
  FROZEN_VOICE_IDS,
  LOOK_ALIASES,
  parseSemver,
  compareSemver,
  classifyBump,
  bumpSemver,
  resolveLookId,
  isFrozenVoiceId,
} from './taxonomy.js';
import { COMPOSITION_PRESETS, getPreset } from './presets.js';
import { FLAGSHIP_VOICE_IDS } from './voices.js';
import { validateLayoutParams, COMPOSITION_IDS } from './layout-modes.js';

assert.ok(parseSemver(TAXONOMY_VERSION), 'TAXONOMY_VERSION must be x.y.z');
assert.equal(TAXONOMY_COMPAT, 'look-apply=layout-only');

assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
assert.ok(compareSemver('1.1.0', '1.0.0') > 0);
assert.ok(compareSemver('1.0.0', '2.0.0') < 0);
assert.equal(classifyBump('1.0.0', '1.0.1'), 'patch');
assert.equal(classifyBump('1.0.0', '1.1.0'), 'minor');
assert.equal(classifyBump('1.1.0', '2.0.0'), 'major');
assert.equal(bumpSemver('1.1.0', 'patch'), '1.1.1');
assert.equal(bumpSemver('1.1.0', 'minor'), '1.2.0');
assert.equal(bumpSemver('1.1.0', 'major'), '2.0.0');
assert.equal(parseSemver('1.0'), null);
assert.throws(() => compareSemver('nope', '1.0.0'));

assert.deepEqual([...FROZEN_VOICE_IDS], [...FLAGSHIP_VOICE_IDS]);

const lookIds = new Set(COMPOSITION_PRESETS.map((p) => p.id));
for (const vid of FROZEN_VOICE_IDS) {
  assert.equal(lookIds.has(vid), false, `Look id collides with frozen voice id "${vid}"`);
  assert.ok(isFrozenVoiceId(vid));
}

for (const [from, to] of Object.entries(LOOK_ALIASES)) {
  assert.ok(lookIds.has(to), `alias target "${to}" must be a current Look id`);
  assert.equal(lookIds.has(from), false, `alias key "${from}" must not still be a Look id`);
  assert.equal(isFrozenVoiceId(to), false, `alias must not target a voice id (${to})`);
  assert.equal(resolveLookId(from), to);
  assert.equal(resolveLookId(to), to);
}

assert.equal(resolveLookId('praystation'), 'praystation');
assert.equal(resolveLookId('dusk-flock'), 'dusk-flock');
assert.equal(resolveLookId('murmuration'), 'dusk-flock');
assert.equal(getPreset('murmuration').id, 'dusk-flock');
assert.equal(getPreset('dusk-flock').id, 'dusk-flock');
assert.ok(COMPOSITION_IDS.includes('dusk-flock'));
assert.equal(COMPOSITION_IDS.includes('murmuration'), false);

const { params, rejected } = validateLayoutParams({ composition: 'murmuration' });
assert.equal(rejected.includes('composition'), false, 'aliased Look id must validate');
assert.equal(params.composition, 'dusk-flock', 'load rewrites alias to canonical Look id');

console.log('taxonomy.selfcheck: ok', TAXONOMY_VERSION);
