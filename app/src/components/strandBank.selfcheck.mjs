// strandBank.selfcheck.mjs — #1871 acceptance (creatures, of #1848): the Strand Bank.
//
// The bank BECOMES the assembler's posture: ingredients as named discrete strands (an asset, an ATTACH
// role set, a named gene value), the conflicts a combination carries shown in the open, and a kept
// conflict recorded on the record through the one door. These checks derive the catalogue from small
// fixtures, hold the conflict derivation against hand-computed fixtures (the registry's own numbers: a
// 700-element, depth-0 drawing scores exactly 700 by ingest's formula, over the 600 line), and prove the
// kept-warning record law: kept → on the record and through persistence; not kept → absent (a record with
// none is byte-identical in shape to a pre-bank record); tampered → refused, cross-checked against the
// record's own facts. The pre-bank fixture below is a literal record produced by main c91ab10a's
// assembleCreature (org_blob_01, its AUTO points, seed 7) — it must open and re-save byte-identical.

import { readFileSync } from 'node:fs';
import { ASSETS } from '../data/assets/index.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { autoAttachPoints } from '../engine/autoAttach.js';
import { assetCostScore, COST_WARNING_THRESHOLD } from '../assets/ingest.js';
import {
  assembleCreature,
  sanitizeCreatureRecord,
  isLookId,
  isVoiceId,
  MAX_KEPT_WARNINGS,
} from '../engine/creatureAssembler.js';
import { breedCreature, handEditRecord } from '../engine/creatureBreed.js';
import { useStore } from '../state/store.js';
import { serializeProject } from '../state/projectDocument.js';
import {
  assetStrands,
  roleSetStrands,
  geneStrands,
  strandlessFamilies,
  strandCatalogue,
  assemblyWarnings,
  keptFromWarnings,
} from './strandBank.model.mjs';

let pass = 0;
const check = (name, cond) => {
  if (!cond) throw new Error(`strandBank check failed: ${name}`);
  pass += 1;
  console.log(`[ok] ${name}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (o) => JSON.parse(JSON.stringify(o));
const S = () => useStore.getState();

const blob = ASSETS.find((a) => a.id === 'org_blob_01');
const marked = (base, roles) => base.map((p, i) => (roles[i] ? { ...p, role: roles[i] } : { ...p }));
const hlPts = marked(autoAttachPoints(blob.svg), ['H', 'L', null, 'L']); // a full skeleton on blob's AUTO set

// — the catalogue: all three kinds, stable ids —
{
  const cat = strandCatalogue({ assets: ASSETS.slice(0, 3), assetAttach: {} });
  check(
    'every pool asset is addressable as an asset strand, id asset:<id>',
    eq(
      cat.assets.map((s) => s.id),
      ASSETS.slice(0, 3).map((a) => `asset:${a.id}`),
    ) && cat.assets.every((s) => s.kind === 'asset'),
  );
  check(
    'strand ids are unique across the catalogue',
    new Set([...cat.assets, ...cat.roleSets, ...cat.looks, ...cat.voices].map((s) => s.id)).size ===
      cat.assets.length + cat.roleSets.length + cat.looks.length + cat.voices.length,
  );
  check(
    'the AUTO role set is always a strand, carrying the shape\u2019s own points',
    cat.roleSets.length === 3 &&
      cat.roleSets.every((s) => s.source === 'auto') &&
      eq(cat.roleSets[0].points, roleSetStrands(blob, undefined).auto.points),
  );
  check(
    'gene strands are the decks: every Look and every Voice, in the genome\u2019s source grammar',
    eq(
      cat.looks.map((s) => s.id),
      COMPOSITION_PRESETS.map((p) => `look:${p.id}`),
    ) &&
      eq(
        cat.voices.map((s) => s.id),
        VOICE_DECK.map((v) => `voice:${v.id}`),
      ) &&
      cat.looks.every((s) => isLookId(s.value)) &&
      cat.voices.every((s) => isVoiceId(s.value)),
  );
  check(
    'DRIVE, MATERIAL and FORM carry no gene strands — a strand names a value the assembler can be handed',
    eq(geneStrands('DRIVE'), []) && eq(geneStrands('MATERIAL'), []) && eq(geneStrands('FORM'), []),
  );
  const sl = strandlessFamilies();
  check(
    'the strandless judgement is stated, with reasons (DRIVE continuous, MATERIAL has no values)',
    eq(
      sl.map((s) => s.family),
      ['DRIVE', 'MATERIAL'],
    ) && sl.every((s) => typeof s.why === 'string' && s.why.length > 0),
  );
}

// — role sets: the artist's own set is a strand only when one exists, and arrives sanitized —
{
  const raw = [
    { x: 10, y: 10, role: 'H' },
    { x: 20, y: 20, role: 'H' }, // a second H — the attach law demotes it
    { x: 30, y: 30, role: 'L' },
    { x: 40, y: 40 },
    { x: 50, y: 50, role: 'L' }, // a fifth point — the attach law keeps at most four
  ];
  const { auto, own } = roleSetStrands(blob, raw);
  check(
    'an own role set is a strand only when the artist has one',
    own && own.id === `points:own:${blob.id}` && roleSetStrands(blob, undefined).own === null,
  );
  check(
    'the own strand carries the attach door\u2019s clean form: at most four points, at most one H',
    own.points.length === 4 && own.points.filter((p) => p.role === 'H').length === 1 && own.counts.heads === 1,
  );
  check(
    'an explicitly empty own set is still a strand (the artist said: no points)',
    roleSetStrands(blob, []).own.points.length === 0 && auto.points.length > 0,
  );
}

// — warnings: hand-computed fixtures, the registry's own numbers —
{
  const heavySvg = `<svg>${'<path d="M0 0h1"/>'.repeat(700)}</svg>`; // 700 drawable elements, no nested groups
  check(
    'the cost fixture is hand-computed from the registry\u2019s formula: 700 elements at depth 0 score exactly 700',
    assetCostScore(heavySvg) === 700 && COST_WARNING_THRESHOLD === 600,
  );
  const heavy = { id: 'user:heavy', svg: heavySvg };
  const costW = assemblyWarnings({ asset: heavy, points: hlPts });
  check(
    'an over-line body warns, with the registry\u2019s numbers inspectable',
    costW.length === 1 &&
      costW[0].kind === 'cost' &&
      costW[0].id === 'cost:user:heavy' &&
      eq(costW[0].cost, { score: 700, threshold: 600 }) &&
      costW[0].what.includes('user:heavy') &&
      costW[0].why.length > 0,
  );
  check(
    'an ingested score is the registry\u2019s number as-is (601 warns at 601)',
    eq(assemblyWarnings({ asset: { id: 'user:cur', costScore: 601, svg: '' }, points: hlPts })[0].cost, {
      score: 601,
      threshold: 600,
    }),
  );
  check(
    'a library body under the line carries no cost warning',
    assemblyWarnings({ asset: blob, points: hlPts }).length === 0,
  );
  const both = assemblyWarnings({ asset: blob, points: autoAttachPoints(blob.svg) }); // blob's AUTO set is all plain points
  check(
    'a role set with no H and no L warns twice, in catalogue order, with no cost attached',
    eq(
      both.map((w) => w.id),
      ['skeleton:no-head', 'skeleton:no-limbs'],
    ) && both.every((w) => w.kind === 'skeleton' && w.cost === null),
  );
  check(
    'H without L warns limbs only; L without H warns head only',
    eq(
      assemblyWarnings({ asset: blob, points: marked(autoAttachPoints(blob.svg), ['H']) }).map((w) => w.id),
      ['skeleton:no-limbs'],
    ) &&
      eq(
        assemblyWarnings({ asset: blob, points: marked(autoAttachPoints(blob.svg), [null, 'L']) }).map((w) => w.id),
        ['skeleton:no-head'],
      ),
  );
  check(
    'a heavy headless combination carries all three warnings, cost first',
    eq(
      assemblyWarnings({ asset: heavy, points: autoAttachPoints(blob.svg) }).map((w) => w.id),
      ['cost:user:heavy', 'skeleton:no-head', 'skeleton:no-limbs'],
    ),
  );
}

// — keeping knowingly: the warnings ride the record through the door and persistence —
{
  const warnings = assemblyWarnings({ asset: blob, points: autoAttachPoints(blob.svg) });
  const kept = keptFromWarnings(warnings);
  const rec = assembleCreature({ assetId: blob.id, points: autoAttachPoints(blob.svg), seed: 7, kept });
  check(
    'assembling with warnings showing records what was kept, data only',
    rec && eq(rec.kept, kept) && rec.kept.every((e) => Object.keys(e).sort().join(',') === 'cost,id,kind'),
  );
  check(
    'kept is not an ingredient of identity: the record id matches the unkept assembly',
    rec.id === assembleCreature({ assetId: blob.id, points: autoAttachPoints(blob.svg), seed: 7 }).id,
  );
  check('the door returns the kept record deep-equal', eq(sanitizeCreatureRecord(clone(rec)), rec));
  const bare = assembleCreature({ assetId: blob.id, points: autoAttachPoints(blob.svg), seed: 7 });
  check(
    'not kept → the field is absent entirely (also for kept: [] and kept: null)',
    !('kept' in bare) &&
      !('kept' in assembleCreature({ assetId: blob.id, points: autoAttachPoints(blob.svg), seed: 7, kept: [] })) &&
      !('kept' in assembleCreature({ assetId: blob.id, points: autoAttachPoints(blob.svg), seed: 7, kept: null })),
  );
  useStore.setState({ creatureRecords: [rec] });
  check(
    'persistence round-trips the kept warnings byte-identical',
    JSON.stringify(serializeProject(S())).includes(JSON.stringify(rec)) && S().creatureRecords[0].kept.length === 2,
  );
}

// — the store path: named gene strands and kept warnings bank together; the two-argument call still deals —
{
  useStore.setState({ creatureRecords: [], creatureNotes: {} });
  const lookId = COMPOSITION_PRESETS[1].id;
  const voiceId = VOICE_DECK[2].id;
  const pts = autoAttachPoints(blob.svg);
  const kept = keptFromWarnings(assemblyWarnings({ asset: blob, points: pts }));
  S().assembleCreature(blob.id, pts, { lookId, voiceId, kept });
  const named = S().creatureRecords[0];
  check(
    'the bank\u2019s named picks bank with named sources and the kept warnings aboard',
    named &&
      named.look === lookId &&
      named.genome.find((g) => g.family === 'LOOK').source === `look:${lookId}` &&
      named.voice === voiceId &&
      named.genome.find((g) => g.family === 'VOICE').source === `voice:${voiceId}` &&
      eq(named.kept, kept),
  );
  useStore.setState({ creatureRecords: [], creatureNotes: {} });
  S().assembleCreature(blob.id, hlPts);
  const dealt = S().creatureRecords[0];
  check(
    'the legacy two-argument call still deals look and voice from the seed and carries no kept field',
    dealt.genome.find((g) => g.family === 'LOOK').source === 'dealt' &&
      dealt.genome.find((g) => g.family === 'VOICE').source === 'dealt' &&
      !('kept' in dealt),
  );
}

// — tampered kept data refuses, cross-checked against the record's own facts —
{
  const headed = assembleCreature({ assetId: blob.id, points: hlPts, seed: 3 });
  const headlessKept = assembleCreature({
    assetId: blob.id,
    points: marked(autoAttachPoints(blob.svg), [null, 'L']),
    seed: 3,
    kept: [{ id: 'skeleton:no-head', kind: 'skeleton', cost: null }],
  });
  check(
    'a consistent kept warning loads (the control)',
    headlessKept && headlessKept.kept.length === 1 && sanitizeCreatureRecord(clone(headlessKept)) !== null,
  );
  const costRec = assembleCreature({
    assetId: 'user:heavy',
    points: hlPts,
    seed: 5,
    kept: [{ id: 'cost:user:heavy', kind: 'cost', cost: { score: 700, threshold: 600 } }],
  });
  check(
    'a kept cost warning on an assembled record loads (the control)',
    costRec && costRec.kept[0].cost.score === 700,
  );
  const refuses = (name, base, kept) => check(name, sanitizeCreatureRecord({ ...clone(base), kept }) === null);
  refuses('a cost warning at or under the line refuses (the warning never existed)', costRec, [
    { id: 'cost:user:heavy', kind: 'cost', cost: { score: 600, threshold: 600 } },
  ]);
  refuses('a cost warning against another registry line refuses', costRec, [
    { id: 'cost:user:heavy', kind: 'cost', cost: { score: 700, threshold: 500 } },
  ]);
  refuses('a cost warning naming another body refuses', costRec, [
    { id: 'cost:org_blob_01', kind: 'cost', cost: { score: 700, threshold: 600 } },
  ]);
  refuses('a cost warning without its numbers refuses', costRec, [{ id: 'cost:user:heavy', kind: 'cost', cost: null }]);
  refuses('a no-head claim on a headed record refuses', headed, [
    { id: 'skeleton:no-head', kind: 'skeleton', cost: null },
  ]);
  refuses('a no-limbs claim on a limbed record refuses', headed, [
    { id: 'skeleton:no-limbs', kind: 'skeleton', cost: null },
  ]);
  refuses('a skeleton warning carrying cost numbers refuses', headlessKept, [
    { id: 'skeleton:no-head', kind: 'skeleton', cost: { score: 700, threshold: 600 } },
  ]);
  refuses('an unknown warning kind refuses', headlessKept, [{ id: 'vibe:off', kind: 'vibe', cost: null }]);
  refuses('an unknown skeleton warning refuses', headlessKept, [
    { id: 'skeleton:no-soul', kind: 'skeleton', cost: null },
  ]);
  refuses('the same warning twice refuses', headlessKept, [
    { id: 'skeleton:no-head', kind: 'skeleton', cost: null },
    { id: 'skeleton:no-head', kind: 'skeleton', cost: null },
  ]);
  check(
    'a kept field that is not a list refuses',
    sanitizeCreatureRecord({ ...clone(headlessKept), kept: 'yes' }) === null,
  );
  check(
    'the engine itself refuses a dishonest kept list rather than writing it',
    assembleCreature({
      assetId: blob.id,
      points: hlPts,
      seed: 3,
      kept: [{ id: 'skeleton:no-head', kind: 'skeleton', cost: null }],
    }) === null,
  );
  check('the kept list is bounded by a named cap', MAX_KEPT_WARNINGS === 8);
  // a bred child was never assembled: warnings kept at an assembly cannot ride it
  const plain = () => autoAttachPoints(blob.svg);
  const parents = [0, 1, 2].map((i) =>
    assembleCreature({ assetId: ASSETS[i * 7 + 1].id, points: plain(), seed: 100 + i * 13 }),
  );
  const child = breedCreature(parents, 11);
  check(
    'kept warnings on a bred record refuse — it was never assembled',
    child &&
      child.head === null &&
      sanitizeCreatureRecord({ ...clone(child), kept: [{ id: 'skeleton:no-head', kind: 'skeleton', cost: null }] }) ===
        null,
  );
}

// — a hand edit that resolves a warning retires it; an unrelated edit leaves kept warnings aboard —
{
  // a three-point skeleton (one limb, two joints): the door's four-point cap leaves room for the head the edit grants
  const headlessKept = assembleCreature({
    assetId: blob.id,
    points: marked(autoAttachPoints(blob.svg), [null, 'L']).slice(0, 3),
    seed: 3,
    kept: [{ id: 'skeleton:no-head', kind: 'skeleton', cost: null }],
  });
  const fixed = handEditRecord(
    headlessKept,
    { action: 'replace', family: 'FORM', id: 'head', origin: { kind: 'asset' } },
    {
      bodyAttachPoints: [
        { x: 50, y: 8, role: 'H' },
        { x: 92, y: 48, role: 'L' },
      ],
    },
  );
  check(
    'a skeleton replace that grants a head retires the kept no-head warning',
    fixed.record && fixed.record.head !== null && !('kept' in fixed.record),
  );
  const costRec = assembleCreature({
    assetId: 'user:heavy',
    points: hlPts,
    seed: 5,
    kept: [{ id: 'cost:user:heavy', kind: 'cost', cost: { score: 700, threshold: 600 } }],
  });
  const rebodied = handEditRecord(
    costRec,
    { action: 'replace', family: 'FORM', id: 'body', origin: { kind: 'pool', value: blob.id } },
    { legalBodies: [blob.id] },
  );
  check(
    'a body replace off the expensive shape retires the kept cost warning',
    rebodied.record && rebodied.record.body === blob.id && !('kept' in rebodied.record),
  );
  const revoiced = handEditRecord(costRec, {
    action: 'replace',
    family: 'VOICE',
    id: 'voice',
    origin: { kind: 'deck', value: VOICE_DECK[0].id === costRec.voice ? VOICE_DECK[1].id : VOICE_DECK[0].id },
  });
  check(
    'an edit that touches nothing warned leaves the kept warnings aboard',
    revoiced.record && eq(revoiced.record.kept, costRec.kept),
  );
}

// — pre-bank compatibility: a record in current main's shape opens and re-saves byte-identical —
{
  // assembled by main c91ab10a itself (org_blob_01, its AUTO points, seed 7 — dealt look and voice)
  const PRE_BANK = {
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
    'the pre-bank record passes the door unchanged, byte for byte',
    JSON.stringify(sanitizeCreatureRecord(clone(PRE_BANK))) === JSON.stringify(PRE_BANK),
  );
  useStore.setState({ creatureRecords: [clone(PRE_BANK)] });
  check(
    'the pre-bank record persists byte-identical through the store',
    JSON.stringify(serializeProject(S())).includes(JSON.stringify(PRE_BANK)),
  );
}

// — detent discipline: no freeform range input in the assembler surface, and the bank's picks are present —
{
  const wet = readFileSync(new URL('../panels/WetLab.jsx', import.meta.url), 'utf8');
  const model = readFileSync(new URL('./strandBank.model.mjs', import.meta.url), 'utf8');
  check(
    'no range input exists in the assembler panel or the bank model',
    !/type\s*=\s*["']range["']/.test(wet) && !/type\s*=\s*["']range["']/.test(model),
  );
  check(
    'the bank\u2019s detents are on the surface: look and voice selects, the role-set chips, the warnings list',
    [
      'data-testid="strand-look"',
      'data-testid="strand-voice"',
      'data-testid="strand-points-auto"',
      'data-testid="strand-points-own"',
      'data-testid="strand-warnings"',
      'assemblyWarnings',
    ].every((s) => wet.includes(s)),
  );
  check(
    'the assemble press and its title survive the rebuild (the e2e and panel contract)',
    wet.includes('data-testid="assemble"') && wet.includes('data-testid="assemble-title"'),
  );
}

console.log(`strandBank selfcheck: ${pass} checks passed`);
