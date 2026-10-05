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
import { FLAGSHIP_VOICE_IDS, FLAGSHIP_VOICES } from './voices.js';
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

// #735 face copy: the banned words stay off the faces this ticket cleaned,
// and the doc header tracks the runtime version (the two drifted once).
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (rel) => readFileSync(join(here, rel), 'utf8');
  const curatorBar = read('../panels/layout/CuratorBar.jsx');
  assert.ok(/>\s*looks ▾\s*</.test(curatorBar), 'CuratorBar button says looks ▾');
  assert.ok(!/>\s*presets\s*▾/i.test(curatorBar), 'no "presets ▾" on the face');
  // 1.3.0 (#716): the Curator cluster's one home is the top bar, next to KC-1.
  assert.ok(/<CuratorBar \/>/.test(read('../components/PaletteStrip.jsx')), 'top bar renders the Curator cluster');
  assert.ok(!/CuratorBar/.test(read('../panels/BuildPanel.jsx')), 'BUILD no longer carries the Curator cluster (one home)');
  const tour = read('tour.js');
  assert.ok(!/title:\s*'[^']*\b(preset|recipe)\b/i.test(tour), 'tour titles say Look, not preset/recipe');
  // 1.4.0 (#717): the flagship Voices' one home is DAVIS; BUILD no longer renders them.
  const voiceTiles = read('../panels/davis/VoiceTiles.jsx');
  assert.ok(/<VoiceTiles \/>/.test(read('../panels/DavisPanel.jsx')), 'DAVIS renders the flagship Voice tiles');
  assert.ok(!/FLAGSHIP_VOICES/.test(read('../panels/layout/CompositionTiles.jsx')), 'BUILD no longer renders the flagship Voices (one home)');
  const flagshipChip = voiceTiles.slice(voiceTiles.indexOf('function FlagshipChip'), voiceTiles.indexOf('export function VoiceTiles'));
  assert.ok(flagshipChip.length > 0, 'FlagshipChip found');
  assert.ok(!/voice\.name/.test(flagshipChip), 'flagship chips print voice.title, never the SWARM/HYPE/MURM name');
  assert.ok(/\{voice\.title\}/.test(flagshipChip), 'flagship chips print voice.title');
  const voiceSlice = read('../state/slices/voiceSlice.js');
  assert.ok(/displayName: f\.title\b/.test(voiceSlice), 'MIX bar names a flagship by its title');
  for (const v of FLAGSHIP_VOICES) {
    assert.ok(!/^(swarm|hype|murm|murmuration)$/i.test(v.title), `${v.id}: title is a Voice title, not a chassis name`);
    assert.equal(lookIds.has(v.title.toLowerCase()), false, `${v.id}: title must not twin a Look id`);
  }
  const doc = read('../../../docs/TAXONOMY.md');
  assert.ok(doc.includes(`Version: ${TAXONOMY_VERSION}`), `docs/TAXONOMY.md header must say Version: ${TAXONOMY_VERSION}`);
  assert.ok(doc.includes(`Frozen voice ids: ${FROZEN_VOICE_IDS.join(', ')}`), 'docs header lists the frozen voice ids');
}

console.log('taxonomy.selfcheck: ok', TAXONOMY_VERSION);
