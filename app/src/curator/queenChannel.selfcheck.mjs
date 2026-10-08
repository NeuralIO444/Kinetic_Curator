// queenChannel.selfcheck.mjs — #1140 PR-3: the deniable consumption channel.
// Reader neutrality (missing/malformed queen section), the GATE_OPEN
// tripwire, the inertness proof (flipped inputs → identical output while the
// gate is closed), and the deniability import-graph scan.
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTaste, HEAD_MIN_FIDELITY } from './tasteHead.js';
import {
  GATE_OPEN, NEUTRAL_BIAS, BIAS_KEYS,
  readQueenHead, isLive, hiddenBias,
} from './queenChannel.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// A minimal valid taste.json v1 (single head). Queen section added per test.
const baseFile = () => ({
  kind: 'kc-taste',
  version: 1,
  featuresVersion: 3,
  model: 'siglip-so400m',
  dims: 1152,
  trainedAt: '2026-10-08',
  labels: { likes: 20, passes: 200 },
  head: { terms: { 'mode=grid': 0.5 }, num: {}, bias: 0.1, fidelity: 0.9, fitOn: 220 },
});
const queenSection = () => ({
  labels: { keeps: 20 },
  head: { terms: { 'paletteId=tidepool': 0.3 }, num: {}, bias: 0.05, fidelity: 0.8, fitOn: 20 },
});
const withQueen = (q) => {
  const f = baseFile();
  if (q !== undefined) f.queen = q;
  return f;
};

// ─── reader: missing section → neutral, file still loads ───
ok('missing queen section: neutral, other heads load', () => {
  const r = validateTaste(baseFile());
  assert.equal(r.ok, true);
  assert.equal('queen' in r.taste, false, 'absent means absent, not null');
  assert.equal(readQueenHead(r.taste), null);
  assert.equal(isLive(r.taste), false);
});

// ─── reader: malformed section → neutral, never a refusal ───
for (const [name, bad] of [
  ['null head', { labels: {}, head: null }],
  ['missing terms', { labels: {}, head: { num: {}, bias: 0, fidelity: 0.5, fitOn: 1 } }],
  ['non-finite weight', { labels: {}, head: { terms: { 'a=b': NaN }, num: {}, bias: 0, fidelity: 0.5, fitOn: 1 } }],
  ['fidelity out of range', { labels: {}, head: { terms: { 'a=b': 1 }, num: {}, bias: 0, fidelity: 2, fitOn: 1 } }],
  ['not an object', 'queen'],
]) {
  ok(`malformed queen section (${name}): neutral, file still loads`, () => {
    const r = validateTaste(withQueen(bad));
    assert.equal(r.ok, true, 'her absence must never break the heads that exist');
    assert.equal('queen' in r.taste, false);
    assert.equal(readQueenHead(r.taste), null);
  });
}

ok('oversize queen terms: neutral, not a refusal', () => {
  const terms = {};
  for (let i = 0; i < 4001; i++) terms[`k${i}=v`] = 0.01;
  const r = validateTaste(withQueen({ labels: {}, head: { terms, num: {}, bias: 0, fidelity: 0.5, fitOn: 1 } }));
  assert.equal(r.ok, true);
  assert.equal('queen' in r.taste, false);
});

// ─── reader: valid section → parsed, labels sanitized ───
ok('valid queen section: parsed with finite-number labels only', () => {
  const q = queenSection();
  q.labels.stray = 'x';
  q.labels.deep = { n: 1 };
  const r = validateTaste(withQueen(q));
  assert.equal(r.ok, true);
  assert.deepEqual(r.taste.queen.labels, { keeps: 20 }, 'non-finite labels dropped');
  assert.equal(r.taste.queen.head.fidelity, 0.8);
  assert.equal(r.taste.queen.head.terms['paletteId=tidepool'], 0.3);
  assert.deepEqual(readQueenHead(r.taste), r.taste.queen.head);
});

// ─── reader: a bad lois section still refuses, queen present or not ───
ok('bad lois still refuses with a valid queen section', () => {
  const f = withQueen(queenSection());
  f.lois = { labels: {}, head: null };
  const r = validateTaste(f);
  assert.equal(r.ok, false, 'everything still stands on lois');
  assert.match(r.error, /lois/);
});

// ─── gate tripwire ───
ok('GATE_OPEN is false: the channel stays dark until #762 clears', () => {
  assert.equal(GATE_OPEN, false);
});

// ─── inertness: flipped inputs → identical output ───
ok('inert: inputs change, output does not', () => {
  const withQ = validateTaste(withQueen(queenSection())).taste;
  const withoutQ = validateTaste(baseFile()).taste;
  const a = hiddenBias(withQ, { audio: 0.9, paletteWarmth: 0.2, dwellMs: 5000 });
  const b = hiddenBias(withoutQ, { audio: 0.1, paletteWarmth: 0.9, dwellMs: 100 });
  const c = hiddenBias(null, null);
  assert.deepEqual(a, NEUTRAL_BIAS);
  assert.deepEqual(b, NEUTRAL_BIAS);
  assert.deepEqual(c, NEUTRAL_BIAS);
  assert.deepEqual(a, b, 'queen section present or not: same output');
  assert.ok(Object.isFrozen(NEUTRAL_BIAS), 'neutral bias is frozen');
  assert.deepEqual([...BIAS_KEYS].sort(), ['palette', 'phrase', 'rank', 'reactivity', 'temperature']);
  assert.equal(isLive(withQ), false, 'a valid head is still not live with the gate closed');
  assert.equal(isLive(null), false);
});

// ─── deniability: visible consumers never import the channel ───
ok('pick()/scoreBoldness() untouched: no consumer imports the channel', () => {
  for (const f of ['tasteHead.js', 'curate.js', 'taste.js', 'loisRank.js']) {
    const src = readFileSync(join(here, f), 'utf8');
    assert.ok(!src.includes('queenChannel'), `${f} must not import the channel`);
  }
});

// ─── deniability: no UI-surface file may reference the channel ───
ok('no UI-surface file references the channel', () => {
  const allowed = new Set([
    'curator/queenChannel.js',
    'curator/queenChannel.selfcheck.mjs',
    // PR-2's sway module will import it and extend this set deliberately.
  ]);
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) { walk(p); continue; }
      if (!/\.(js|mjs)$/.test(e)) continue;
      const rel = relative(srcRoot, p);
      if (allowed.has(rel)) continue;
      const src = readFileSync(p, 'utf8');
      if (src.includes('queenChannel')) hits.push(rel);
    }
  };
  walk(srcRoot);
  assert.deepEqual(hits, [], `UI-surface references to the channel: ${hits.join(', ')}`);
});

console.log(`\nqueenChannel: ${n} checks passed`);
