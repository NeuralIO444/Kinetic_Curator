// cultivate.selfcheck.mjs — #1872 acceptance (creatures, of #1848): Simulate / Cultivate.
//
// CULTIVATE is the dry-run between assembling (#1849) and injecting (#1850): three reads from the machinery
// that already exists — the sketch (the contract's expansion / the solver's sweep), the cost read (the
// registry's own accounting), the integrity read (the linkage gate's verdict for linkage bodies; the bank's
// warnings and the tile-buildability verdict for records) — and, on a record, a cultivation note written
// through the one door with `kept`'s discipline. These checks derive the reads from fixtures (the cost
// fixture is hand-computed from ingest's formula: a 700-element, depth-0 drawing scores exactly 700, over
// the 600 line), hold the linkage read against the gate itself on assembling and non-assembling measure
// sets, prove the note law (written → persists byte-identical; tampered → refused whole-record; never
// cultivated → the field is absent and a pre-1872 record is byte-identical), pin the sketch's determinism
// (same record → same seeded play), and pin that cultivating writes nothing to any stage (the store action
// touches the record alone — no tile, no pool, no switch moves).

import { readFileSync } from 'node:fs';
import { ASSETS } from '../data/assets/index.js';
import { autoAttachPoints } from '../engine/autoAttach.js';
import { assetCostScore, COST_WARNING_THRESHOLD } from '../assets/ingest.js';
import { getAssetCost } from '../assets/cost.js';
import {
  assembleCreature,
  sanitizeCreatureRecord,
  sanitizeCultivation,
  withCultivation,
  creatureTile,
  MAX_KEPT_WARNINGS,
} from '../engine/creatureAssembler.js';
import { breedCreature, handEditRecord } from '../engine/creatureBreed.js';
import { evaluateGenome, isStillborn } from '../engine/jansenSolver.js';
import { wildTypeMeasures, MEASURE_RANGES } from '../engine/jansenMeasures.js';
import { sanitizeMeasures } from '../engine/beastBuilder.js';
import { assemblyWarnings, keptFromWarnings } from './strandBank.model.mjs';
import {
  pointsOfRecord,
  cultivateReads,
  cultivationNote,
  noteReads,
  linkageReads,
  sketchInstancesAt,
  linkageSketchAt,
} from './cultivate.model.mjs';
import { useStore } from '../state/store.js';
import { serializeProject } from '../state/projectDocument.js';

let pass = 0;
const check = (name, cond) => {
  if (!cond) throw new Error(`cultivate check failed: ${name}`);
  pass += 1;
  console.log(`[ok] ${name}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (o) => JSON.parse(JSON.stringify(o));
const S = () => useStore.getState();

const blob = ASSETS.find((a) => a.id === 'org_blob_01');
const hlPts = [
  { x: 50, y: 8, role: 'H' },
  { x: 10, y: 60, role: 'L' },
  { x: 90, y: 60, role: 'L' },
];
const plainPts = autoAttachPoints(blob.svg); // blob's AUTO set is all plain points: no head, no limbs
const hlRec = assembleCreature({ assetId: blob.id, points: hlPts, seed: 1872 });
const plainRec = assembleCreature({ assetId: blob.id, points: plainPts, seed: 1872 });
const heavySvg = `<svg>${'<path d="M0 0h1"/>'.repeat(700)}</svg>`; // 700 drawable elements, no nested groups
const heavyAsset = { id: 'user:heavy', svg: heavySvg };
const heavyRec = assembleCreature({ assetId: 'user:heavy', points: hlPts, seed: 5 });

// — the cost read is the registry's own accounting —
{
  check(
    'the cost fixture is hand-computed from the registry’s formula: 700 elements at depth 0 score exactly 700',
    assetCostScore(heavySvg) === 700 && COST_WARNING_THRESHOLD === 600,
  );
  const reads = cultivateReads(hlRec, blob);
  check(
    'the cost read equals the registry’s own accounting for a fixture record',
    reads.cost.score === getAssetCost(blob) && reads.cost.threshold === COST_WARNING_THRESHOLD,
  );
  check(
    'a library body reads under the line (the registry’s max library score is far below it)',
    reads.cost.over === false && reads.outcome === 'viable' && reads.drawable === true,
  );
  const heavy = cultivateReads(heavyRec, heavyAsset);
  check(
    'an over-line body reads its exact registry score, flagged over',
    heavy.cost.score === 700 && heavy.cost.over === true,
  );
  const stamped = cultivateReads(hlRec, { id: blob.id, costScore: 601, svg: '<path d="M0 0h1"/>' });
  check(
    'a stamped registry score wins, as the registry itself reads it',
    stamped.cost.score === 601 && stamped.cost.over,
  );
  const atLine = cultivateReads(hlRec, { id: blob.id, costScore: 600, svg: '<path d="M0 0h1"/>' });
  check('a score exactly at the line is not over it', atLine.cost.score === 600 && atLine.cost.over === false);
}

// — the integrity read's warnings are the bank's own derivation, over the record's combination —
{
  check('a full-skeleton record carries no warnings', eq(cultivateReads(hlRec, blob).kept, []));
  check(
    'a headless, limbless record carries both skeleton warnings, in the catalogue’s order',
    eq(
      cultivateReads(plainRec, blob).kept.map((w) => w.id),
      ['skeleton:no-head', 'skeleton:no-limbs'],
    ),
  );
  check(
    'the warnings equal the bank’s derivation over the record’s reconstructed points',
    eq(cultivateReads(plainRec, blob).warnings, assemblyWarnings({ asset: blob, points: pointsOfRecord(plainRec) })) &&
      eq(
        cultivateReads(plainRec, blob).kept,
        keptFromWarnings(assemblyWarnings({ asset: blob, points: pointsOfRecord(plainRec) })),
      ),
  );
  const headOnly = assembleCreature({
    assetId: blob.id,
    points: [
      { x: 50, y: 8, role: 'H' },
      { x: 92, y: 48 },
    ],
    seed: 3,
  });
  check(
    'a headed, limbless record carries only the no-limbs warning',
    eq(
      cultivateReads(headOnly, blob).kept.map((w) => w.id),
      ['skeleton:no-limbs'],
    ),
  );
  const heavyPlain = assembleCreature({ assetId: 'user:heavy', points: plainPts, seed: 5 });
  check(
    'an expensive headless body carries the cost warning first, with the registry’s numbers',
    eq(cultivateReads(heavyPlain, heavyAsset).kept, [
      { id: 'cost:user:heavy', kind: 'cost', cost: { score: 700, threshold: 600 } },
      { id: 'skeleton:no-head', kind: 'skeleton', cost: null },
      { id: 'skeleton:no-limbs', kind: 'skeleton', cost: null },
    ]),
  );
}

// — the note: written through the door, persists byte-identical —
{
  const note = cultivationNote(plainRec, blob, 42);
  check(
    'the note is the reads in the door’s shape, stamped with the cultivation seed',
    eq(note, {
      seed: 42,
      outcome: 'viable',
      cost: { score: getAssetCost(blob), threshold: 600 },
      warnings: [
        { id: 'skeleton:no-head', kind: 'skeleton', cost: null },
        { id: 'skeleton:no-limbs', kind: 'skeleton', cost: null },
      ],
    }),
  );
  const written = withCultivation(plainRec, note);
  check(
    'the written record passes its own door byte-identical (the note is canonical)',
    written && eq(sanitizeCreatureRecord(clone(written)), written),
  );
  check(
    'the note is the only difference from the never-cultivated record',
    eq((({ cultivated, ...rest }) => rest)(written), sanitizeCreatureRecord(clone(plainRec))),
  );
  useStore.setState({ creatureRecords: [clone(written)] });
  check(
    'the cultivated record persists byte-identical through the store',
    JSON.stringify(serializeProject(S())).includes(JSON.stringify(written)),
  );
  const shown = noteReads(written.cultivated, written);
  check(
    'a standing note reads back as inspectable reads, with the bank’s words for its warnings',
    shown.seed === 42 &&
      shown.outcome === 'viable' &&
      shown.cost.score === getAssetCost(blob) &&
      shown.warnings.length === 2 &&
      shown.warnings.every((w) => w.what.length > 0 && w.why.length > 0),
  );
  check(
    're-cultivating replaces the note (the latest cultivation stands)',
    withCultivation(written, cultivationNote(plainRec, blob, 43)).cultivated.seed === 43,
  );
}

// — a stillbirth: a body that cannot be drawn, recorded honestly —
{
  const goneRec = assembleCreature({ assetId: 'gone_asset', points: hlPts, seed: 9 });
  const reads = cultivateReads(goneRec, null);
  check(
    'a record whose body the pool no longer holds reads stillborn, unpriced',
    reads.outcome === 'stillborn' && reads.drawable === false && reads.cost === null && eq(reads.kept, []),
  );
  const written = withCultivation(goneRec, cultivationNote(goneRec, null, 7));
  check(
    'the stillbirth is written on the record and passes the door byte-identical',
    written &&
      written.cultivated.outcome === 'stillborn' &&
      written.cultivated.cost === null &&
      eq(sanitizeCreatureRecord(clone(written)), written),
  );
  check(
    'a body asset with no drawing is a stillbirth too (no tile can be built from it)',
    cultivateReads(hlRec, { id: blob.id, svg: '' }).outcome === 'stillborn' &&
      creatureTile(hlRec, { id: blob.id, svg: '' }) === null,
  );
  const gonePlain = assembleCreature({ assetId: 'gone_asset', points: plainPts, seed: 9 });
  const gw = withCultivation(gonePlain, cultivationNote(gonePlain, null, 7));
  check(
    'a stillborn headless record keeps its skeleton warnings in the note — and no cost entry',
    gw &&
      eq(
        gw.cultivated.warnings.map((w) => w.id),
        ['skeleton:no-head', 'skeleton:no-limbs'],
      ),
  );
}

// — tampered notes refuse the record whole —
{
  const base = withCultivation(plainRec, cultivationNote(plainRec, blob, 42));
  const tamper = (patch) => {
    const r = clone(base);
    patch(r.cultivated);
    return sanitizeCreatureRecord(r) === null;
  };
  check(
    'an unknown outcome refuses',
    tamper((c) => (c.outcome = 'dead')),
  );
  check(
    'a missing outcome refuses',
    tamper((c) => delete c.outcome),
  );
  check(
    'a seed outside the uint32 terms refuses',
    tamper((c) => (c.seed = -1)) && tamper((c) => (c.seed = 4294967296)) && tamper((c) => (c.seed = 1.5)),
  );
  check(
    'a viable note with no price refuses (the outcome and the cost must agree)',
    tamper((c) => (c.cost = null)),
  );
  check(
    'a stillborn note carrying a price refuses',
    tamper((c) => (c.outcome = 'stillborn')),
  );
  check(
    'a cost read at a moved warning line refuses',
    tamper((c) => (c.cost.threshold = 500)),
  );
  check(
    'a dropped skeleton warning refuses (the note must carry exactly what the record derives)',
    tamper((c) => (c.warnings = c.warnings.slice(0, 1))),
  );
  check(
    'an invented warning refuses',
    tamper((c) => c.warnings.push({ id: 'skeleton:no-head', kind: 'skeleton', cost: null })),
  );
  check(
    'warnings that are not a list refuse',
    tamper((c) => (c.warnings = 'yes')),
  );
  check(
    'a note that is not an object refuses',
    sanitizeCreatureRecord({ ...clone(plainRec), cultivated: 'yes' }) === null,
  );
  const headed = withCultivation(hlRec, cultivationNote(hlRec, blob, 42));
  check(
    'a skeleton warning the genome contradicts refuses',
    sanitizeCreatureRecord({
      ...clone(headed),
      cultivated: {
        seed: 42,
        outcome: 'viable',
        cost: clone(headed.cultivated.cost),
        warnings: [{ id: 'skeleton:no-head', kind: 'skeleton', cost: null }],
      },
    }) === null,
  );
  const heavyBase = withCultivation(heavyRec, cultivationNote(heavyRec, heavyAsset, 42));
  check(
    'a cost warning whose numbers are not the note’s own read refuses',
    sanitizeCreatureRecord({
      ...clone(heavyBase),
      cultivated: {
        ...clone(heavyBase.cultivated),
        warnings: [{ id: 'cost:user:heavy', kind: 'cost', cost: { score: 701, threshold: 600 } }],
      },
    }) === null,
  );
  check(
    'a cost warning under a read at or under the line refuses',
    sanitizeCreatureRecord({
      ...clone(headed),
      cultivated: {
        seed: 42,
        outcome: 'viable',
        cost: clone(headed.cultivated.cost),
        warnings: [{ id: `cost:${blob.id}`, kind: 'cost', cost: { score: 700, threshold: 600 } }],
      },
    }) === null,
  );
  check(
    'the engine refuses a dishonest note rather than writing it',
    withCultivation(plainRec, { seed: 1, outcome: 'dead', cost: null, warnings: [] }) === null &&
      withCultivation(plainRec, null) === null,
  );
  check('the warnings bound is the bank’s named cap', MAX_KEPT_WARNINGS === 8);
  check(
    'sanitizeCultivation is the door’s own piece (a clean note canonicalizes)',
    eq(sanitizeCultivation(clone(base.cultivated), sanitizeCreatureRecord(clone(plainRec))), base.cultivated),
  );
}

// — the linkage read is the gate's own verdict —
{
  const wild = wildTypeMeasures();
  const live = linkageReads(wild);
  check(
    'the wild type assembles: feasible, with the solver’s gait metrics',
    live.feasible === true &&
      live.stillborn === false &&
      live.metrics.duty > 0 &&
      live.metrics.duty < 1 &&
      evaluateGenome(sanitizeMeasures(wild), 1).feasible === true,
  );
  const dead = { ...wild, k: MEASURE_RANGES.k.max }; // one bar at the edge of its own legal band
  const deadReads = linkageReads(dead);
  check(
    'a non-assembling measure set reads stillborn — the gate’s verdict, not a paraphrase',
    deadReads.feasible === false &&
      deadReads.stillborn === true &&
      deadReads.metrics === null &&
      isStillborn(sanitizeMeasures(dead), 1) === true &&
      evaluateGenome(sanitizeMeasures(dead), 1).feasible === false,
  );
  check('no measures, no read', linkageReads(null) === null && linkageReads('nope') === null);
}

// — sketch determinism: same record → same seeded play —
{
  const env = {
    record: hlRec,
    bodyAsset: blob,
    stageIds: ['org_pod_02', 'org_leaf_02', 'geo_diamond_01'],
    overlay: [],
    seed: 1872,
  };
  const a = sketchInstancesAt(env, 0.7);
  const b = sketchInstancesAt(env, 0.7);
  check('the same record at the same t sketches the identical frame', eq(a, b) && a.length > 1);
  check(
    'the play actually moves (a later t poses the parts elsewhere)',
    !eq(sketchInstancesAt(env, 0), sketchInstancesAt(env, 0.7)),
  );
  const bare = sketchInstancesAt({ ...env, record: plainRec }, 0.7);
  check(
    'a boneless creature sketches as its bare body alone, still across t',
    bare.length === 1 && eq(bare, sketchInstancesAt({ ...env, record: plainRec }, 0.2)),
  );
  check(
    'a stillborn body sketches nothing',
    eq(
      sketchInstancesAt(
        { record: assembleCreature({ assetId: 'gone_asset', points: hlPts, seed: 9 }), bodyAsset: null },
        0.7,
      ),
      [],
    ),
  );
  const wild = wildTypeMeasures();
  check(
    'the linkage sweep is deterministic, turns with t, and poses nothing for a stillbirth',
    eq(linkageSketchAt(wild, 0.3), linkageSketchAt(wild, 0.3)) &&
      !eq(linkageSketchAt(wild, 0), linkageSketchAt(wild, 0.45)) &&
      linkageSketchAt({ ...wild, k: MEASURE_RANGES.k.max }, 0.3) === null,
  );
}

// — no injection: the store action writes the record alone —
{
  const tile = creatureTile(hlRec, blob);
  useStore.setState({
    creatureRecords: [clone(hlRec)],
    customAssets: [clone(tile)],
    enabledAssets: { [tile.id]: true },
    seed: 42,
  });
  const poolBefore = S().customAssets;
  const enabledBefore = S().enabledAssets;
  S().cultivateCreature(hlRec.id, cultivationNote(hlRec, blob, S().seed));
  const after = S();
  check(
    'cultivating writes nothing to any stage: the pool and the switches are untouched, by reference',
    after.customAssets === poolBefore && after.enabledAssets === enabledBefore,
  );
  check(
    'the record gained exactly the note, stamped with the project seed',
    after.creatureRecords[0].cultivated.seed === 42 &&
      after.creatureRecords[0].cultivated.outcome === 'viable' &&
      after.creatureCultivateNote.status === 'viable',
  );
  check(
    'apart from the note the record is unchanged',
    eq((({ cultivated, ...rest }) => rest)(after.creatureRecords[0]), sanitizeCreatureRecord(clone(hlRec))),
  );
  S().cultivateCreature('cr-00000000', cultivationNote(hlRec, blob, 42));
  check(
    'cultivating a record that is not banked changes nothing',
    S().creatureCultivateNote.status === 'no-record' && S().creatureRecords.length === 1,
  );
  S().cultivateCreature(hlRec.id, { seed: 1, outcome: 'dead', cost: null, warnings: [] });
  check(
    'a dishonest note is refused at the store door and the standing note survives',
    S().creatureCultivateNote.status === 'refused' && S().creatureRecords[0].cultivated.seed === 42,
  );
  // a banked record whose body import is removed afterwards: the stillbirth lands on the record, the pool untouched
  useStore.setState({ creatureRecords: [clone(hlRec)], customAssets: [], enabledAssets: {} });
  S().cultivateCreature(hlRec.id, cultivationNote(hlRec, null, 42));
  check(
    'a record whose body left the pool cultivates to a recorded stillbirth',
    S().creatureRecords[0].cultivated.outcome === 'stillborn' && eq(S().customAssets, []),
  );
}

// — legacy parity: records never cultivated stay byte-identical —
{
  // assembled by main 2693b758's own assembler shape (org_blob_01, its AUTO points, seed 7) — the same
  // literal the Strand Bank suite pins as its pre-bank fixture
  const PRE_1872 = {
    kind: 'kc-assembled/1',
    id: 'cr-2d3ee6b0',
    seed: 7,
    body: 'org_blob_01',
    head: null,
    limbs: [],
    joints: [
      { x: 50, y: 8 },
      { x: 92, y: 48 },
      { x: 51.24, y: 92.25 },
      { x: 8, y: 52 },
    ],
    drives: { approval: null, crowding: null, strain: null, boredom: null },
    look: 'torn-poster',
    voice: 'plakat',
    genome: [
      { family: 'FORM', id: 'body', value: 'org_blob_01', source: 'asset:org_blob_01' },
      { family: 'FORM', id: 'head', value: null, source: 'asset:org_blob_01' },
      { family: 'FORM', id: 'limbs', value: [], source: 'asset:org_blob_01' },
      {
        family: 'FORM',
        id: 'joints',
        value: [
          { x: 50, y: 8 },
          { x: 92, y: 48 },
          { x: 51.24, y: 92.25 },
          { x: 8, y: 52 },
        ],
        source: 'asset:org_blob_01',
      },
      { family: 'LOOK', id: 'look', value: 'torn-poster', source: 'dealt' },
      { family: 'VOICE', id: 'voice', value: 'plakat', source: 'dealt' },
      { family: 'MATERIAL', id: 'material', value: null, source: 'none' },
      { family: 'DRIVE', id: 'approval', value: 1, source: 'wild' },
      { family: 'DRIVE', id: 'crowding', value: 1, source: 'wild' },
      { family: 'DRIVE', id: 'strain', value: 1, source: 'wild' },
      { family: 'DRIVE', id: 'boredom', value: 1, source: 'wild' },
    ],
  };
  check(
    'a pre-1872 record passes the door unchanged, byte for byte, with no cultivation field',
    JSON.stringify(sanitizeCreatureRecord(clone(PRE_1872))) === JSON.stringify(PRE_1872) &&
      !('cultivated' in sanitizeCreatureRecord(clone(PRE_1872))),
  );
  useStore.setState({ creatureRecords: [clone(PRE_1872)] });
  check(
    'the pre-1872 record persists byte-identical through the store',
    JSON.stringify(serializeProject(S())).includes(JSON.stringify(PRE_1872)),
  );
  const cultivatedOld = withCultivation(PRE_1872, cultivationNote(PRE_1872, blob, 7));
  check(
    'the pre-1872 record itself cultivates (headless and limbless, viable, both warnings recorded)',
    cultivatedOld.cultivated.outcome === 'viable' &&
      eq(
        cultivatedOld.cultivated.warnings.map((w) => w.id),
        ['skeleton:no-head', 'skeleton:no-limbs'],
      ) &&
      eq(sanitizeCreatureRecord(clone(cultivatedOld)), cultivatedOld),
  );
}

// — bred records: the note is an act on the record as it stands —
{
  const plain = () => autoAttachPoints(blob.svg);
  const parents = [0, 1, 2].map((i) =>
    assembleCreature({ assetId: ASSETS[i * 7 + 1].id, points: plain(), seed: 100 + i * 13 }),
  );
  const parentBody = (r) => ASSETS.find((a) => a.id === r.body) || null;
  const cultivatedParent = withCultivation(parents[0], cultivationNote(parents[0], parentBody(parents[0]), 5));
  const child = breedCreature([cultivatedParent, parents[1], parents[2]], 11);
  check('a bred child is born uncultivated — the note is never inherited', child && !('cultivated' in child));
  const cultivatedChild = child && withCultivation(child, cultivationNote(child, parentBody(child), 7));
  check(
    'a bred record may be cultivated (unlike kept, the note is no assembly claim)',
    !!cultivatedChild && eq(sanitizeCreatureRecord(clone(cultivatedChild)), cultivatedChild),
  );
  // the kept law is undisturbed: warnings kept at an assembly still cannot ride a bred record
  let keptRefused = null;
  for (let s = 11; s < 60 && keptRefused === null; s++) {
    const c = breedCreature(parents, s);
    if (!c) continue;
    const entry =
      c.head === null
        ? { id: 'skeleton:no-head', kind: 'skeleton', cost: null }
        : c.limbs.length === 0
          ? { id: 'skeleton:no-limbs', kind: 'skeleton', cost: null }
          : null;
    if (entry) keptRefused = sanitizeCreatureRecord({ ...clone(c), kept: [entry] }) === null;
  }
  check('kept warnings on a bred record still refuse (the #1871 law is untouched)', keptRefused === true);
}

// — a hand edit retires the note (the edited animal is a different creature) —
{
  const cultivated = withCultivation(plainRec, cultivationNote(plainRec, blob, 42));
  const mutated = handEditRecord(cultivated, { action: 'mutate', family: 'DRIVE', id: 'approval' }, { seed: 3 });
  check(
    'a hand mutation retires the cultivation note and the record stays door-clean',
    mutated.record && !('cultivated' in mutated.record),
  );
  const headlessRec = assembleCreature({
    assetId: blob.id,
    points: [
      { x: 92, y: 48, role: 'L' },
      { x: 51, y: 92 },
      { x: 8, y: 52 },
    ],
    seed: 3,
  });
  const headlessCultivated = withCultivation(headlessRec, cultivationNote(headlessRec, blob, 42));
  const fixed = handEditRecord(
    headlessCultivated,
    { action: 'replace', family: 'FORM', id: 'head', origin: { kind: 'asset' } },
    {
      bodyAttachPoints: [
        { x: 50, y: 8, role: 'H' },
        { x: 92, y: 48, role: 'L' },
      ],
    },
  );
  check(
    'a skeleton replace that grants a head is not blocked by the stale note — the note retires with the edit',
    fixed.record && fixed.record.head !== null && !('cultivated' in fixed.record),
  );
}

// — the surface: the invocation is in the lab, the miniature is a shared component, detents only —
{
  const wet = readFileSync(new URL('../panels/WetLab.jsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('./CreatureCultivate.jsx', import.meta.url), 'utf8');
  const mini = readFileSync(new URL('./CreatureMiniature.jsx', import.meta.url), 'utf8');
  const model = readFileSync(new URL('./cultivate.model.mjs', import.meta.url), 'utf8');
  check(
    'the lab carries the invocation: a cultivate chip per record and per beast, the standing-note marker',
    [
      'data-testid="record-cultivate"',
      'data-testid="record-cultivated"',
      'data-testid="beast-cultivate"',
      'CreatureCultivate',
    ].every((s) => wet.includes(s)),
  );
  check(
    'the panel carries the press and the reads, and renders the shared miniature component',
    [
      'data-testid="creature-cultivate"',
      'data-testid="cultivate-run"',
      'data-testid="cultivate-warning"',
      'CreatureMiniature',
    ].every((s) => panel.includes(s)) && panel.includes("from './CreatureMiniature.jsx'"),
  );
  check(
    'no range input exists in the cultivate surface (detent discipline, as the bank’s)',
    [wet, panel, mini, model].every((src) => !/type\s*=\s*["']range["']/.test(src)),
  );
}

console.log(`cultivate selfcheck: ${pass} checks passed`);
