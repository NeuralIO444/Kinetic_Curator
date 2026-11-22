// queenDeniability.selfcheck.mjs — the hidden pull stays hidden (DS rule 10), checked as an IMPORT GRAPH and as text on
// every surface, not as a list of strings (#1139 wiring plan, 2026-10-08).
//
// Before this check the guards looked for the literal 'queenChannel' only, so a visible consumer could have imported
// queenLean.mjs and passed; and the surface scan skipped the whole of curator/. Both holes are closed here.
import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const here = join(srcRoot, 'curator');
let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(srcRoot);
const src = (rel) => readFileSync(join(srcRoot, rel), 'utf8');
// comments do not ship to a surface: strip them when asking whether CODE names her
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const live = files
  .map((p) => relative(srcRoot, p))
  .filter((r) => /\.(js|jsx|mjs)$/.test(r) && !r.endsWith('.selfcheck.mjs'));

// the modules that carry the hidden pull, and the ONLY files allowed to import them
const HIDDEN = ['queenChannel', 'queenLean'];
const IDS = [
  'queenChannel',
  'queenLean',
  'swayBiases',
  'swayOpen',
  'hiddenBias',
  'rankBiases',
  'applyRankBias',
  'warmedTemperature',
  'lean_lois',
  'lean_davis',
];
const MAY_IMPORT = new Set(['curator/queenChannel.js', 'curator/queenLean.mjs', 'curator/director.js']); // director.js hosts the pull (never a surface)

ok('the visible consumers (the picker, the scorer, the ranker, the head) reference none of her identifiers', () => {
  for (const f of ['tasteHead.js', 'curate.js', 'taste.js', 'loisRank.js', 'tasteStore.js', 'tasteGate.js']) {
    if (!existsSync(join(here, f))) continue; // tasteGate.js lands with the experimental switch
    const text = src(`curator/${f}`);
    for (const id of IDS) assert.ok(!text.includes(id), `${f} must not reference ${id}`);
  }
});

ok('only the allowlisted hosts import the hidden modules (an import graph, not a string list)', () => {
  const bad = [];
  for (const rel of live) {
    const text = src(rel);
    for (const h of HIDDEN)
      if (
        new RegExp(`from\\s+['"][^'"]*${h}(\\.m?js)?['"]|import\\(\\s*['"][^'"]*${h}`).test(text) &&
        !MAY_IMPORT.has(rel)
      )
        bad.push(`${rel} -> ${h}`);
  }
  assert.deepEqual(bad, [], `unexpected importers: ${bad.join(', ')}`);
});

ok('no surface file (UI, copy, styles, hooks, components) carries her identifiers or her name in a string', () => {
  const surfaces = live.filter((r) => /\.jsx$/.test(r) || /^(components|panels|hooks|styles|data)\//.test(r));
  const hits = [];
  for (const rel of surfaces) {
    const text = src(rel);
    for (const id of IDS) if (text.includes(id)) hits.push(`${rel}:${id}`);
    if (/queen/i.test(text)) hits.push(`${rel}:name`);
  }
  assert.deepEqual(hits, [], `surface leaks: ${hits.join(', ')}`);
});

ok('the rest of curator/ outside the allowlist does not name her identifiers either', () => {
  const allow = new Set([...MAY_IMPORT, 'curator/beatConfidence.mjs']); // beatConfidence's comment says it is neutral by design
  const hits = [];
  for (const rel of live.filter((r) => r.startsWith('curator/') && !allow.has(r))) {
    const text = code(src(rel));
    for (const id of IDS) if (text.includes(id)) hits.push(`${rel}:${id}`);
  }
  assert.deepEqual(hits, [], `leaks inside curator/: ${hits.join(', ')}`);
});

ok(
  'the SwayMark names nothing: no title, aria-label, aria-labelledby, tooltip or visible text on its span (QA nit, P9)',
  () => {
    const text = code(src('components/SwayMark.jsx'));
    const tags = [...text.matchAll(/<(?!\/)[A-Za-z][^>]*>/g)].map((m) => m[0]);
    assert.ok(tags.length >= 1, 'the span is there');
    for (const tag of tags)
      assert.ok(
        !/\btitle\s*=|aria-label\s*=|aria-labelledby\s*=|aria-describedby\s*=|\balt\s*=|data-tip|tooltip|\bplaceholder\s*=/i.test(
          tag,
        ),
        `nothing names it: ${tag}`,
      );
    assert.ok(!/<[A-Za-z][^>]*>\s*[^<>{}\s][^<>]*<\//.test(text), 'no visible text inside the mark');
    assert.ok(text.includes('aria-hidden="true"'), 'screen readers skip it');
    // and no other surface that mounts it adds a title/aria-label around it
    for (const rel of live.filter((r) => /\.jsx$/.test(r) && r !== 'components/SwayMark.jsx')) {
      for (const line of code(src(rel)).split('\n'))
        if (/<SwayMark\b/.test(line))
          assert.ok(!/title\s*=|aria-label\s*=/.test(line), `${rel}: the mount carries a name: ${line.trim()}`);
    }
  },
);

ok('no store key and no saved-document key carries her: state is data, so she must not appear in it', () => {
  const hits = [];
  for (const rel of live.filter((r) => r.startsWith('state/'))) {
    const text = src(rel);
    // an object key or a property write named sway / queen / lean (the bundle's left-out reason strings are prose, not keys)
    for (const m of text.matchAll(/(^|[\s{,])(sway\w*|queen\w*|lean_\w+)\s*:/gm)) hits.push(`${rel}:${m[2]}`);
    for (const m of text.matchAll(/\.(sway\w*|queen\w*|lean_\w+)\s*=[^=]/g)) hits.push(`${rel}:${m[1]}`);
  }
  assert.deepEqual(hits, [], `state leaks: ${hits.join(', ')}`);
});

ok(
  'the dial-lean driver (#1640) reaches the dials only through the bus: no store, no hidden module, no identifier',
  () => {
    const text = code(src('curator/leanLive.js'));
    assert.ok(
      !/useStore|state\/store|SET_LAYOUT_PARAM|SET_EVOLVE_INTERVAL/.test(text),
      'the driver writes events, never state',
    );
    for (const h of HIDDEN) assert.ok(!text.includes(h), `leanLive must not reference ${h}`);
    for (const id of IDS) assert.ok(!text.includes(id), `leanLive must not reference ${id}`);
  },
);

ok('the only console trace allowed is behind the developer flag, and it is off by default', () => {
  const lean = src('curator/queenLean.mjs');
  assert.match(lean, /localStorage\.getItem\('kc:queen:trace'\)\s*===\s*'1'/);
  const loud = live.filter(
    (r) => /console\.(log|info|warn)\(\s*['"`]\[(sway|queen)/i.test(src(r)) && r !== 'curator/queenLean.mjs',
  );
  assert.deepEqual(loud, [], `unflagged traces: ${loud.join(', ')}`);
});

// ── #2389 (Persona Kernel P9): her reads, her seat, her eyes, her mark ────────────────────────────────────────────
ok('#2389: nothing imports her read (queenView) — no surface, no driver: it is hers alone', () => {
  const bad = live.filter((r) => /from\s+['"][^'"]*queenView(\.mjs)?['"]|import\(\s*['"][^'"]*queenView/.test(src(r)));
  assert.deepEqual(bad, [], `importers: ${bad.join(', ')}`);
});

ok("#2389: no surface reads her standing timing or her looks (the holder is for the band's movers only)", () => {
  const surfaces = live.filter((r) => /\.jsx$/.test(r) || /^(components|panels|hooks|styles|data)\//.test(r));
  const hits = [];
  for (const rel of surfaces)
    for (const id of ['getRhythmTiming', 'getRhythmLooks', 'bandTimingOpen', 'bandTiming(', 'queenView'])
      if (code(src(rel)).includes(id)) hits.push(`${rel}:${id}`);
  assert.deepEqual(hits, [], `surface reads: ${hits.join(', ')}`);
});

ok('#2389: her record, her eyes and her switch carry no name — no key, row, prompt or string names her', () => {
  for (const rel of ['personas/rhythmRecord.mjs', 'personas/rhythmVision.mjs', 'personas/rhythmVisionLive.js'])
    assert.ok(!/queen|tina|turner/i.test(code(src(rel))), `${rel} names her in code`);
  // the audible switch's name lives in its driver only (curator/, never a surface, never saved)
  const holders = live.filter((r) => code(src(r)).includes('__KC_QUEEN_AUDIBLE'));
  assert.deepEqual(holders, ['curator/beatSynthLive.js']);
});

ok('#2389 (Q18): her mark left the top bar for the STIMULI meter — one trace, no glyph, no name', () => {
  assert.ok(!src('panels/layout/CuratorBar.jsx').includes('SwayMark'), 'not in the top bar');
  assert.ok(src('panels/stimulus/MeterHero.jsx').includes('<SwayMark />'), 'on the meter');
  const surfaces = live.filter((r) => /\.jsx$/.test(r) || /^(components|panels|hooks|styles|data)\//.test(r));
  const crowns = surfaces.filter((r) => /\u{1F478}|\u{1F451}/u.test(src(r)));
  assert.deepEqual(crowns, [], `a crown glyph on a surface: ${crowns.join(', ')}`);
});

// ── #2397 (Persona Adapters A4): the heads readout can never show her ────────────────────────────────────────────
ok('#2397: the A4 readout, rollback and note machinery name her nowhere in code', () => {
  for (const rel of [
    'panels/PersonaHeadsPanel.jsx',
    'curator/personaRollback.mjs',
    'curator/personaRollbackLive.js',
    'curator/personaHeadsBridge.mjs',
  ])
    assert.ok(!/queen/i.test(code(src(rel))), `${rel} names her in code`);
});

ok('#2397: the readout lists only the head-holding seats — she holds no entry in that list', () => {
  const panel = src('panels/PersonaHeadsPanel.jsx');
  assert.ok(panel.includes('PERSONA_HEAD_IDS'), 'rows come from the head-holding seat list');
  const idsLine = src('curator/tasteHead.js').match(/PERSONA_HEAD_IDS = Object\.freeze\(\[([^\]]*)\]\)/);
  assert.ok(idsLine, 'the seat list is a literal in tasteHead.js');
  assert.ok(!idsLine[1].includes('queen'), 'she is not a head-holding seat');
});

console.log(`queenDeniability.selfcheck: ${n} checks passed`);
