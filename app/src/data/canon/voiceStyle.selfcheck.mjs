// node src/data/canon/voiceStyle.selfcheck.mjs
// #2045 (Canon S2) — voices carry their own style. Pins:
//   1. the probe: reading data/voices.js ALONE (a fresh process that never loads the deck, and a module graph
//      that cannot reach it) reports every voice's style(s) — including the two-style flagship
//   2. the styles are Canon ids; multi-style voices stay multi-style, in pairing order
//   3. the deck's `styles` is a view over the definition-level style — the sidecar copies are gone
//   4. the dealable deck is byte-identical to before (same 72 records, same pairings)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FLAGSHIP_VOICES, STUB_VOICES, VOICE_STYLES, voiceStyles, voiceStyleReport } from '../voices.js';
import { isCanonStyle } from './styles.js';

const here = dirname(fileURLToPath(import.meta.url));
const voicesPath = resolve(here, '..', 'voices.js');
const deckPath = resolve(here, '..', 'voiceDeck.js');
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

// ── 1. the probe ────────────────────────────────────────────────────────────────────────────────────────────
// (a) the module graph: nothing data/voices.js imports, at any depth, is the deck
{
  const seen = new Set();
  const stack = [voicesPath];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) {
      const target = resolve(dirname(file), m[1]);
      if (existsSync(target) && /\.(m?js)$/.test(target)) stack.push(target);
    }
  }
  assert.ok(seen.size > 1, 'the walk followed imports');
  assert.ok(!seen.has(deckPath), 'data/voices.js cannot reach data/voiceDeck.js');
}
// (b) a fresh process that imports voices.js and nothing else reports the styles
const probed = JSON.parse(
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const v = await import(${JSON.stringify(pathToFileURL(voicesPath).href)});
       process.stdout.write(JSON.stringify(v.voiceStyleReport()));`,
    ],
    { encoding: 'utf8' },
  ),
);
assert.equal(probed.length, 19, 'the 4 flagships + the 15 mode tiles');
assert.deepEqual(
  probed.find((v) => v.id === 'swarm'),
  { id: 'swarm', kind: 'flagship', styles: ['memphis', 'japanese'] },
);
assert.deepEqual(probed, JSON.parse(JSON.stringify(voiceStyleReport())), 'the probe and the in-process read agree');

// ── 2. Canon ids; every definition styled; multi-style kept ─────────────────────────────────────────────────
{
  const defined = [...FLAGSHIP_VOICES, ...STUB_VOICES].map((v) => v.id);
  assert.deepEqual(
    Object.keys(VOICE_STYLES),
    defined,
    'one row per definition, in file order — no stray, none missing',
  );
  for (const id of defined) {
    const styles = voiceStyles(id);
    assert.ok(styles.length >= 1, `${id}: carries a style`);
    assert.ok(styles.every(isCanonStyle), `${id}: Canon style ids (${styles})`);
    assert.equal(new Set(styles).size, styles.length, `${id}: no style twice`);
    assert.ok(Object.isFrozen(styles), `${id}: frozen`);
  }
  assert.equal(voiceStyles(FLAGSHIP_VOICES[0]), voiceStyles('swarm'), 'by definition or by id');
  const multi = defined.filter((id) => voiceStyles(id).length > 1);
  assert.ok(multi.includes('swarm') && multi.includes('hype') && multi.length >= 10, 'multi-style voices are the norm');
  assert.deepEqual([...voiceStyles('hype')], ['japanese', 'memphis'], 'pairing order is data (hype is swarm reversed)');
  assert.deepEqual([...voiceStyles('no-such-voice')], []);
  assert.deepEqual([...voiceStyles(null)], []);
  assert.deepEqual([...voiceStyles('constructor')], [], 'no prototype leak');
  // the definitions themselves are untouched — the deck hands flagships out by reference
  for (const v of [...FLAGSHIP_VOICES, ...STUB_VOICES])
    assert.ok(!('styles' in v), `${v.id}: definition bytes unchanged`);
}

// ── 3 + 4. the deck is a view, and byte-identical ───────────────────────────────────────────────────────────
{
  const { VOICE_DECK } = await import('../voiceDeck.js');
  assert.equal(VOICE_DECK.length, 72);
  assert.equal(
    sha(VOICE_DECK),
    'ca7db04bb758bba0',
    'the 72 deck voices are byte-identical (hash taken on main @ 6d37f9b)',
  );
  for (const v of VOICE_DECK) {
    if (v.kind === 'family') {
      assert.deepEqual(v.styles, [v.def.family], `${v.id}: a family variant's style is its family`);
      continue;
    }
    assert.deepEqual(v.styles, [...voiceStyles(v.id)], `${v.id}: the deck's pairing is the definition's style`);
    assert.notEqual(v.styles, voiceStyles(v.id), `${v.id}: a copy — the deck cannot mutate the definition's row`);
  }
  assert.equal(
    VOICE_DECK.find((v) => v.id === 'swarm').def,
    FLAGSHIP_VOICES[0],
    'flagship def is still the same reference',
  );
  const src = readFileSync(deckPath, 'utf8');
  const meta = src.slice(src.indexOf('const FLAGSHIP_META'), src.indexOf('const PROMOTED'));
  assert.doesNotMatch(meta, /styles:/, 'FLAGSHIP_META no longer declares styles');
  const promoted = src.slice(src.indexOf('const PROMOTED = ['), src.indexOf('export const FAMILY_PAIRING'));
  // formatting-proof: collapse whitespace, then count the string-array columns. Fifteen rows, fifteen arrays —
  // one `categories` column each, and no second (styles) column beside it.
  const flat = promoted.replace(/\s+/g, '');
  const stringArrays = flat.match(/\['[a-z-]+'(?:,'[a-z-]+')*,?\]/g) || [];
  assert.equal(stringArrays.length, 15, 'a PROMOTED row has one array column (categories) — no styles column');
}

console.log(
  'voiceStyle.selfcheck: ok — 19 definitions carry Canon styles (read without the deck); 72-voice deck byte-identical',
);
