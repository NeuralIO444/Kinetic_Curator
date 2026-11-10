// node src/data/canon/canonMotion.selfcheck.mjs
// #2047 (Canon S3) — layouts, flocking and animation as Canon records. Pins:
//   1. one registry resolves layout, flocking and animation records by namespaced id; every record carries a
//      name, a tradition and style metadata; "which layouts/animations belong to style X" gets a real answer
//   2. every id a standing recipe can name still resolves — old ids aliased by the recipe key, never orphaned
//   3. the colliding ids are disambiguated (flock, orbit, drift, pulse …)
//   4. no sixth list: every Canon id is derived from the module that owns the vocabulary, and the five
//      animation vocabularies are all reachable through the one registry
//   5. dealt behaviour is byte-identical — the source vocabularies and the catalogues are untouched
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANON_MOTION,
  CANON_MOTION_KINDS,
  CANON_MOTION_DOMAINS,
  CANON_MOTION_COLLISIONS,
  CANON_MOTION_PARAMS,
  CANON_ANIMATION_VOCABULARIES,
  canonMotion,
  canonMotionId,
  canonMotionCandidates,
  canonMotionForParam,
  canonMotionOfRecipe,
  canonMotionWhere,
  canonMotionForStyle,
} from './motion.js';
import { canonStyle, isCanonStyle, CANON_STYLE_IDS } from './index.js';
import {
  LAYOUT_MODES,
  MODE_IDS,
  BEHAVE_MODES,
  AUDIO_RESPONSE_IDS,
  DEFAULT_LAYOUT_PARAMS,
  normalizeLayoutParams,
} from '../layout-modes.js';
import { BEHAVE, BEHAVE_IDS } from '../../engine/organisms/behave.js';
import { MOTION_MODES } from '../voices.js';
import { KINEMES, DEFAULT_ASSET_KINEME, getKineme } from '../kinemes.js';
import { CELL_KINEMES, ASSET_CELL_KINEME } from '../cellKinemes.js';
import { KINEME_PATTERNS, KINEME_DRIVERS, TRANSPORT_MODES, PATH_FAMILIES } from '../../engine/kineme.js';
import { BALLISTICS_CURVES } from '../../gl/audioBallistics.mjs';
import { COMPOSITION_PRESETS } from '../presets.js';
import { VOICE_DECK } from '../voiceDeck.js';

const here = dirname(fileURLToPath(import.meta.url));
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const ids = (rs) => rs.map((r) => r.id);

// ── 1. one registry, three domains, every record whole ──────────────────────────────────────────────────────
{
  assert.deepEqual([...new Set(CANON_MOTION.map((r) => r.domain))], [...CANON_MOTION_DOMAINS]);
  assert.equal(new Set(ids(CANON_MOTION)).size, CANON_MOTION.length, 'namespaced ids are unique');
  assert.equal(canonMotion('layout:phyllotaxis').tradition.name, 'Phyllotaxis');
  assert.equal(canonMotion('flock:lorenz').tradition.origin, 'Edward Lorenz, 1963');
  assert.equal(canonMotion('layout:voronoi').domain, 'layout');
  assert.equal(canonMotion('flock:lorenz').domain, 'flocking');
  assert.equal(canonMotion('cell:line-boil').domain, 'animation');
  assert.equal(canonMotion('layout:swarm').name, 'swarm boids', 'the source record’s own name rides along');
  assert.equal(canonMotion('nope:nope'), null);
  assert.equal(canonMotion(''), null);
  for (const r of CANON_MOTION) {
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.styles) && Object.isFrozen(r.tradition), `${r.id}: frozen`);
    assert.equal(r.id, canonMotionId(r.kind, r.localId));
    assert.ok(typeof r.name === 'string' && r.name, `${r.id}: a name`);
    assert.ok(typeof r.tradition.name === 'string' && r.tradition.name.length > 2, `${r.id}: a tradition`);
    assert.ok(r.tradition.origin === null || r.tradition.origin.length > 3, `${r.id}: origin is real or absent`);
    assert.ok(r.styles.every(isCanonStyle), `${r.id}: Canon style ids`);
    assert.deepEqual(Object.keys(r.styleUse), [...r.styles], `${r.id}: a use count behind every style`);
    for (const u of Object.values(r.styleUse))
      assert.ok(u.looks + u.voices + u.assets > 0, `${r.id}: no empty membership`);
  }
  // the named traditions the issue calls out are records, with their lineage
  for (const id of [
    'layout:phyllotaxis',
    'layout:voronoi',
    'layout:lsystem',
    'layout:dla',
    'layout:poisson',
    'flock:lorenz',
  ])
    assert.ok(canonMotion(id).tradition.origin, `${id}: carries its lineage`);

  // the probe: "which layouts / animations belong to style X"
  const opLayouts = canonMotionForStyle('op', { domain: 'layout' });
  assert.ok(opLayouts.length >= 4, 'Op Art has layouts');
  const opLookModes = new Set(COMPOSITION_PRESETS.filter((l) => l.group === 'op').map((l) => l.params.mode));
  for (const m of opLookModes)
    assert.ok(ids(opLayouts).includes(`layout:${m}`), `op’s own look mode ${m} is an Op Art layout`);
  const opAnim = canonMotionForStyle('op', { domain: 'animation' });
  assert.ok(opAnim.length >= 3 && opAnim.every((r) => r.domain === 'animation'), 'Op Art has animations');
  assert.ok(canonMotionForStyle('op', { domain: 'flocking' }).length >= 1, 'and flocking');
  // most-used first
  const w = (r) => Object.values(r.styleUse.op).reduce((a, b) => a + b, 0);
  for (let i = 1; i < opLayouts.length; i++) assert.ok(w(opLayouts[i - 1]) >= w(opLayouts[i]), 'ordered by use');
  // a style whose membership comes from its assets (the micro-HUD ornaments are techno)
  assert.ok(ids(canonMotionForStyle('techno', { kind: 'cell' })).includes('cell:dial-sweep'));
  assert.deepEqual(canonMotionForStyle('vaporwave'), []);
  // every style group answers for layouts — none is silent
  for (const s of CANON_STYLE_IDS.filter((id) => canonStyle(id).looks.length))
    assert.ok(
      canonMotionForStyle(s, { domain: 'layout' }).length >= 4,
      `${s}: at least four layouts (one per look mode)`,
    );
  // and the resolved style record carries how it moves
  const op = canonStyle('op');
  assert.deepEqual(op.motion.layouts, ids(opLayouts));
  assert.deepEqual(op.motion.animation, ids(opAnim));
  assert.ok(op.motion.flocking.includes('flock:cruise'));
}

// ── 2. every id a standing recipe can name still resolves ───────────────────────────────────────────────────
{
  assert.deepEqual(
    [...CANON_MOTION_PARAMS],
    ['mode', 'behave', 'kinemePattern', 'transport', 'transportPath', 'audioResponse'],
  );
  // the whole enum vocabulary of each recipe key
  const vocab = {
    mode: MODE_IDS,
    behave: BEHAVE_MODES,
    kinemePattern: KINEME_PATTERNS,
    transport: TRANSPORT_MODES,
    transportPath: PATH_FAMILIES,
    audioResponse: AUDIO_RESPONSE_IDS,
  };
  for (const [param, values] of Object.entries(vocab))
    for (const v of values) {
      const r = canonMotionForParam(param, v);
      assert.ok(r && r.localId === v && r.param === param, `${param}: '${v}' resolves`);
    }
  // every standing recipe: the 70 looks, the 72 deck voices, the defaults — raw and normalized
  const recipes = [
    ...COMPOSITION_PRESETS.map((l) => [l.id, l.params]),
    ...VOICE_DECK.map((v) => [v.id, v.def.params]),
    ['defaults', DEFAULT_LAYOUT_PARAMS],
  ];
  let named = 0;
  for (const [id, params] of recipes) {
    for (const p of [params, normalizeLayoutParams(params)]) {
      const resolved = canonMotionOfRecipe(p);
      for (const param of CANON_MOTION_PARAMS) {
        if (typeof p[param] !== 'string') continue;
        assert.ok(resolved[param], `${id}: ${param}='${p[param]}' is orphaned`);
        named++;
      }
    }
  }
  assert.ok(named > 600, `recipes named ${named} motion values`);
  // the motion chips a voice is built from, the kinemes assets wear, the cell kinemes strips play
  for (const m of MOTION_MODES) assert.ok(canonMotion(`chip:${m.id}`), `chip ${m.id}`);
  for (const k of Object.values(DEFAULT_ASSET_KINEME))
    assert.equal(canonMotion(`kineme:${k}`).source.id, getKineme(k).id);
  for (const k of Object.values(ASSET_CELL_KINEME)) assert.ok(canonMotion(`cell:${k}`), `cell ${k}`);
  // unknown stays unknown
  assert.equal(canonMotionForParam('mode', 'no-such-mode'), null);
  assert.equal(canonMotionForParam('count', 'grid'), null, 'a key that names no vocabulary resolves nothing');
  assert.deepEqual(canonMotionOfRecipe(null), {});
}

// ── 3. collisions disambiguated ─────────────────────────────────────────────────────────────────────────────
{
  for (const id of ['flock', 'orbit', 'drift', 'pulse'])
    assert.ok(CANON_MOTION_COLLISIONS.includes(id), `${id} collides across vocabularies — and the Canon knows`);
  assert.equal(canonMotion('orbit'), null, 'a colliding bare id does not silently pick one');
  assert.deepEqual(ids(canonMotionCandidates('orbit')).sort(), [
    'chip:orbit',
    'flock:orbit',
    'layout:orbit',
    'path:orbit',
  ]);
  assert.deepEqual(ids(canonMotionCandidates('pulse')).sort(), ['driver:pulse', 'kineme:pulse']);
  assert.deepEqual(ids(canonMotionCandidates('flock')).sort(), ['chip:flock', 'flock:flock']);
  // the recipe key is the alias: same word, different record
  assert.equal(canonMotionForParam('mode', 'orbit').id, 'layout:orbit');
  assert.equal(canonMotionForParam('behave', 'orbit').id, 'flock:orbit');
  assert.equal(canonMotionForParam('transportPath', 'orbit').id, 'path:orbit');
  assert.notEqual(canonMotion('kineme:pulse').tradition.name, canonMotion('driver:pulse').tradition.name);
  // a bare id only one vocabulary owns resolves on its own
  assert.equal(canonMotion('phyllotaxis').id, 'layout:phyllotaxis');
  assert.equal(canonMotion('lissajous').id, 'path:lissajous');
  // every bare id: resolves alone exactly when one vocabulary owns it (no Object.groupBy — CI runs Node 20)
  for (const localId of new Set(CANON_MOTION.map((r) => r.localId))) {
    const rs = canonMotionCandidates(localId);
    assert.equal(canonMotion(localId), rs.length === 1 ? rs[0] : null);
  }
}

// ── 4. no sixth list ────────────────────────────────────────────────────────────────────────────────────────
{
  const sources = {
    layout: LAYOUT_MODES.map((m) => m.id),
    flock: BEHAVE_IDS,
    chip: MOTION_MODES.map((m) => m.id),
    kineme: KINEMES.map((k) => k.id),
    cell: CELL_KINEMES.map((k) => k.id),
    pattern: KINEME_PATTERNS,
    driver: KINEME_DRIVERS.map((d) => d.id),
    transport: TRANSPORT_MODES,
    path: PATH_FAMILIES,
    response: BALLISTICS_CURVES,
  };
  assert.deepEqual(
    CANON_MOTION_KINDS.map((k) => k.kind),
    Object.keys(sources),
    'the kinds, in registry order',
  );
  let total = 0;
  for (const [kind, srcIds] of Object.entries(sources)) {
    assert.deepEqual(
      canonMotionWhere({ kind }).map((r) => r.localId),
      [...srcIds],
      `${kind}: exactly the owner’s ids, in the owner’s order`,
    );
    total += srcIds.length;
  }
  assert.equal(CANON_MOTION.length, total, 'nothing in the registry that no owner declares');
  assert.equal(canonMotionWhere({ kind: 'layout' }).length, LAYOUT_MODES.length);
  assert.equal(canonMotionWhere({ kind: 'flock' }).length, 9);
  // the five animation vocabularies, by owning module — all reachable through the one registry
  assert.deepEqual(
    [...CANON_ANIMATION_VOCABULARIES],
    ['data/voices.js', 'data/kinemes.js', 'data/cellKinemes.js', 'engine/kineme.js', 'gl/audioBallistics.mjs'],
  );
  for (const owner of CANON_ANIMATION_VOCABULARIES)
    assert.ok(
      canonMotionWhere({ domain: 'animation' }).some((r) => r.owner.startsWith(owner)),
      `${owner}: reachable`,
    );
  // by source: the registry module declares no id list of its own, and no owner module was touched to feed it
  const src = readFileSync(join(here, 'motion.js'), 'utf8');
  // (the three domain names are the one literal list — a classification, not a vocabulary of ids)
  const literalLists = [...src.matchAll(/export const (\w+) = (?:Object\.freeze\()?\[\s*'/g)].map((m) => m[1]);
  assert.deepEqual(literalLists, ['CANON_MOTION_DOMAINS'], 'motion.js exports no literal id list');
  for (const k of CANON_MOTION_KINDS)
    assert.match(src, new RegExp(`source: \\(\\) => (named|bare)\\(`), `${k.kind}: derived`);
  // the flocking engine is still the engine: the record sits beside the steering row, it does not replace it
  for (const r of canonMotionWhere({ kind: 'flock' })) assert.ok(BEHAVE[r.localId], `${r.id}: its engine row exists`);
  assert.doesNotMatch(
    readFileSync(join(here, '..', '..', 'engine', 'organisms', 'behave.js'), 'utf8'),
    /from\s+['"][^'"]*canon\//,
    'the engine does not import the Canon',
  );
}

// ── 5. dealt behaviour byte-identical (hashes taken on main @ 6d37f9b, before the Canon) ─────────────────────
{
  const pins = {
    layouts: [LAYOUT_MODES, '2f2c2e591436f2e2'],
    behaveIds: [BEHAVE_IDS, '3e6414f0ec366196'],
    behave: [BEHAVE, '91d27a8073e94f12'],
    chips: [MOTION_MODES, 'aa29e3d08723ec0a'],
    kinemes: [KINEMES, '1eb9700ee0f39603'],
    cells: [CELL_KINEMES, 'dc73f5991acc6120'],
    patterns: [KINEME_PATTERNS, '14d8d39d4e08501c'],
    drivers: [KINEME_DRIVERS, 'f6d51e735553ecdd'],
    transport: [TRANSPORT_MODES, '2c2677687f7afb6f'],
    paths: [PATH_FAMILIES, '0f847ab0be755a83'],
    curves: [BALLISTICS_CURVES, 'e006154defd5974a'],
    defaults: [DEFAULT_LAYOUT_PARAMS, '1c2ddc28c7769673'],
    looks: [COMPOSITION_PRESETS, '0e506973c67a5129'],
    deck: [VOICE_DECK, 'ca7db04bb758bba0'],
  };
  for (const [name, [value, hash]] of Object.entries(pins)) assert.equal(sha(value), hash, `${name}: byte-identical`);
}

const count = (domain) => canonMotionWhere({ domain }).length;
console.log(
  `canonMotion.selfcheck: ok — ${CANON_MOTION.length} records (${count('layout')} layouts, ${count('flocking')} flocking, ${count('animation')} animation across 5 vocabularies); ${CANON_MOTION_COLLISIONS.length} colliding ids disambiguated`,
);
