// lineageTree.selfcheck.mjs — #2030 (creatures, of #1848): the Lineage Tree, measured against the spec.
//
//   birth     breeding writes the ancestry summary: the three parents, summarized (identity + genes as they
//             stand at the birth + their own parents' ids), deeper ancestors merged in, deduplicated
//   growth    the summary grows LINEARLY in generations — at most three new entries per birth — where a
//             naive copy of three full trees would grow as 3^generations
//   frozen    the summary is written at birth and never recomputed: a parent edited afterwards does not
//             rewrite a child's retained ancestors, and a hand edit never rewrites the record's own summary
//   founder   an assembled creature carries no ancestry and reads as GEN 01; a record bred before summaries
//             existed keeps its lineage, shows its parents as stubs, and its generation is honestly unknown
//   deltas    what changed in a node against its parents, hand-computed: inherited (unchanged, from the
//             named parent), crossed (the parents' values), mutated (joined to the birth's mutation entry),
//             hand (an edit — on an ancestor, made before it bred; on the creature, after its birth), born
//   door      tampered ancestry refuses the record whole: a founder claiming ancestors, a head that is not
//             the lineage, an illegal gene, a cycle, a duplicate, the record among its own ancestors, a
//             malformed parent list, a bad source, an oversize summary, an entry off the birth block
//   agreement retained values are held against the record's other tellings of the same birth: a head value
//             rewritten in range (a crossed drive's parent, an inherited look, a swapped skeleton's
//             holder), a deeper value a child entry inherited whole, a dropped gene. Hand edits, crossed
//             genes inside entries and the unretained frontier are NOT held — they make no checkable claim
//   persist   a deep record survives the document round-trip byte for byte, ancestry included
//   shifts    gait and cost are absent, as explicit nulls: no measure set rides a creature record for the
//             solver to read, and no registry prices one — the tree estimates nothing
import assert from 'node:assert/strict';
import {
  assembleCreature,
  sanitizeCreatureRecord,
  sanitizeCreatureRecords,
  MAX_ANCESTRY_ENTRIES,
} from '../engine/creatureAssembler.js';
import { breedCreature, handEditRecord } from '../engine/creatureBreed.js';
import { ASSETS } from '../data/assets/index.js';
import { autoAttachPoints } from '../engine/autoAttach.js';
import { serializeProject } from '../state/projectDocument.js';
import { useStore } from '../state/store.js';
import { lineageTree, nodeDeltas } from './lineageTree.model.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const bytes = (v) => JSON.stringify(v);
const geneOf = (rec, family, id) => rec.genome.find((g) => g.family === family && g.id === id);
const entryOf = (rec, id) => rec.ancestry.find((e) => e.id === id);

/** Mark an asset's points the way an artist would: the first point the head, the next two limbs. */
const marked = (asset) =>
  autoAttachPoints(asset.svg).map((p, i) => ({ ...p, role: i === 0 ? 'H' : i <= 2 ? 'L' : undefined }));

const BODIES = ASSETS.filter((a) => a.category !== 'creature').map((a) => a.id);
const mkParent = (i, seed) =>
  assembleCreature({ assetId: ASSETS[i].id, points: marked(ASSETS[i]), seed, lookId: null, voiceId: null });
const founders = [mkParent(0, 11), mkParent(1, 22), mkParent(2, 33)];
assert.ok(founders.every(Boolean) && new Set(founders.map((p) => p.id)).size === 3, 'three distinct founders assemble');

const breedFirst = (trio, pred = () => true) => {
  for (let seed = 0; seed < 2000; seed++) {
    const c = breedCreature(trio, seed);
    if (c && pred(c)) return c;
  }
  return null;
};
const child = breedFirst(founders);
assert.ok(child, 'the founders breed');

ok('birth: the child retains its three parents, summarized at the birth', () => {
  assert.equal(child.ancestry.length, 3);
  assert.deepEqual(
    child.ancestry.map((e) => e.id),
    child.lineage.parents,
    'the head of the summary is the lineage, in its order',
  );
  for (const e of child.ancestry) {
    const parent = founders.find((f) => f.id === e.id);
    assert.deepEqual(e.genes, parent.genome, 'the genes as they stood at the birth');
    assert.deepEqual(e.parents, [], 'a founder has no parents');
  }
  assert.deepEqual(sanitizeCreatureRecord(JSON.parse(bytes(child))), child, 'the door returns the child whole');
});

ok('founder: an assembled creature carries no ancestry', () => {
  assert.ok(!('ancestry' in founders[0]));
  assert.ok(!('ancestry' in sanitizeCreatureRecord(founders[0])));
});

ok('recursive: a grandchild carries its grandparents; the tree derives generations', () => {
  const more = [mkParent(3, 44), mkParent(4, 55)];
  const grand = breedFirst([child, ...more]);
  assert.ok(grand);
  assert.equal(grand.ancestry.length, 6, 'three parents + the child’s three, merged');
  assert.deepEqual(entryOf(grand, child.id).parents, child.lineage.parents, 'the parent entry names its own parents');
  for (const f of founders) assert.ok(entryOf(grand, f.id), `grandparent ${f.id} retained`);
  const tree = lineageTree(grand);
  assert.equal(tree.self.gen, 3);
  assert.equal(tree.nodes.length, 6);
  assert.equal(tree.edges.length, 6, 'three edges from the grandchild, three from its parent');
  assert.equal(tree.nodes.find((nd) => nd.id === child.id).gen, 2);
  assert.ok(
    tree.nodes.filter((nd) => nd.depth === 2).every((nd) => nd.gen === 1),
    'the founders are GEN 01',
  );
  assert.equal(tree.stubs, 0);
  assert.equal(tree.complete, true);
  // reuse deduplicates: breeding the grandchild back into its own parent and a founder retains each
  // ancestor once — 3 head entries plus the 4 of the grandchild's line not already named
  const great = breedFirst([grand, child, founders[0]]);
  assert.ok(great);
  const ids = great.ancestry.map((e) => e.id);
  assert.equal(ids.length, 7, 'the merged summary counts shared ancestors once');
  assert.equal(new Set(ids).size, ids.length, 'no ancestor is retained twice');
  assert.equal(lineageTree(great).self.gen, 4);
});

ok('growth: three new entries per generation at most — linear, never 3^generations', () => {
  const used = new Set();
  let salt = 1000;
  const freshFounder = () => {
    for (;;) {
      const f = mkParent(salt % ASSETS.length, salt);
      salt++;
      if (f && !used.has(f.id)) {
        used.add(f.id);
        return f;
      }
    }
  };
  let prev = null;
  const lengths = [];
  for (let g = 0; g < 5; g++) {
    const trio = prev ? [prev, freshFounder(), freshFounder()] : [freshFounder(), freshFounder(), freshFounder()];
    prev = breedFirst(trio);
    assert.ok(prev, `generation ${g + 1} breeds`);
    lengths.push(prev.ancestry.length);
  }
  assert.deepEqual(lengths, [3, 6, 9, 12, 15], 'each birth adds exactly its three parents’ new entries');
  assert.ok(prev.ancestry.length < 3 ** 5 / 10, 'and nowhere near the naive tree’s 243');
  assert.equal(lineageTree(prev).self.gen, 6, 'five breedings past the founders');
});

ok('frozen: edits after the birth never rewrite a retained summary', () => {
  const editedParent = handEditRecord(
    founders[0],
    { action: 'mutate', family: 'DRIVE', id: 'approval' },
    { seed: 42, legalBodies: BODIES },
  ).record;
  assert.ok(editedParent);
  assert.notDeepEqual(geneOf(editedParent, 'DRIVE', 'approval'), geneOf(founders[0], 'DRIVE', 'approval'));
  assert.deepEqual(
    entryOf(child, founders[0].id).genes,
    founders[0].genome,
    'the child keeps the parent as it was at the birth',
  );
  const editedChild = handEditRecord(
    child,
    { action: 'mutate', family: 'VOICE', id: 'voice' },
    { seed: 4, legalBodies: BODIES },
  ).record;
  assert.deepEqual(editedChild.ancestry, child.ancestry, 'a hand edit leaves the record’s own summary untouched');
});

ok('founder tree: GEN 01, no ancestors, every gene born with it', () => {
  const tree = lineageTree(founders[0]);
  assert.equal(tree.self.gen, 1);
  assert.deepEqual(tree.nodes, []);
  assert.deepEqual(tree.edges, []);
  const view = nodeDeltas(founders[0], founders[0].id);
  assert.equal(view.deltas.length, founders[0].genome.length);
  assert.ok(
    view.deltas.every((d) => d.cls === 'born'),
    'assembly sources only',
  );
});

ok('pre-summary record: lineage without ancestry — parents are stubs, generation unknown', () => {
  const legacy = JSON.parse(bytes(child));
  delete legacy.ancestry;
  const clean = sanitizeCreatureRecord(legacy);
  assert.ok(clean, 'a record bred before summaries existed still loads');
  assert.ok(!('ancestry' in clean));
  const tree = lineageTree(clean);
  assert.equal(tree.self.gen, null, 'its generation cannot be derived — not estimated');
  assert.equal(tree.nodes.length, 3);
  assert.ok(
    tree.nodes.every((nd) => nd.stub && !nd.retained),
    'the parents stand as stubs',
  );
  assert.equal(tree.complete, false);
  const self = nodeDeltas(clean, clean.id);
  const inherited = self.deltas.find((d) => d.cls === 'inherited');
  assert.ok(inherited && inherited.parents[0].retained === false, 'the diff names the parent; its genes were not kept');
  const stub = nodeDeltas(clean, clean.lineage.parents[0]);
  assert.equal(stub.retained, false);
  assert.deepEqual(stub.deltas, [], 'a stub has no deltas to show');
});

ok('deltas: hand-computed against the founders — inherited, crossed, mutated', () => {
  const rich = breedFirst(
    founders,
    (c) =>
      c.lineage.mutations.some((m) => m.gene === 'FORM.skeleton') &&
      c.lineage.mutations.some((m) => m.kind === 'reroll'),
  );
  assert.ok(rich, 'a child with a skeleton swap and a drive reroll exists in the seed walk');
  const view = nodeDeltas(rich, rich.id);
  assert.equal(view.deltas.length, rich.genome.length);
  for (const d of view.deltas) {
    const gene = geneOf(rich, d.family, d.id);
    if (gene.source.startsWith('parent:')) {
      assert.equal(d.cls, 'inherited', `${d.key} reads inherited`);
      const from = founders.find((f) => f.id === d.fromId);
      assert.deepEqual(d.value, geneOf(from, d.family, d.id).value, 'the value is the named parent’s');
      assert.equal(d.parents[0].matches, true, 'unchanged against the retained parent');
    } else if (gene.source.startsWith('cross:')) {
      assert.equal(d.cls, 'crossed', `${d.key} reads crossed`);
      assert.deepEqual(
        d.parents.map((p) => p.value),
        founders
          .slice()
          .sort((a, b) => rich.lineage.parents.indexOf(a.id) - rich.lineage.parents.indexOf(b.id))
          .map((f) => geneOf(f, d.family, d.id).value),
        'all three parents’ values, in lineage order',
      );
    } else if (gene.source.startsWith('mut:')) {
      assert.equal(d.cls, 'mutated', `${d.key} reads mutated`);
      assert.ok(d.mutation, 'joined to the birth’s mutation entry');
    }
  }
  const skel = view.deltas.find((d) => d.family === 'FORM' && d.id === 'limbs');
  if (skel.cls === 'mutated') {
    assert.equal(skel.mutation.gene, 'FORM.skeleton', 'the skeleton genes share the one linkage entry');
    assert.equal(skel.mutation.kind, 'swap');
    assert.ok(founders.some((f) => f.id === skel.mutation.from) && founders.some((f) => f.id === skel.mutation.to));
  }
  const rerolled = view.deltas.find((d) => d.mutation && d.mutation.kind === 'reroll');
  assert.equal(rerolled.value, rerolled.mutation.value, 'a reroll’s value IS its gene’s');
});

ok('deltas: hand edits — on an ancestor before it bred, and on the creature after its birth', () => {
  let edited = handEditRecord(
    founders[0],
    {
      action: 'replace',
      family: 'LOOK',
      id: 'look',
      origin: { kind: 'deck', value: founders[0].look === 'praystation' ? 'megacity' : 'praystation' },
    },
    { legalBodies: BODIES },
  ).record;
  edited = handEditRecord(
    edited,
    { action: 'mutate', family: 'DRIVE', id: 'strain' },
    { seed: 9, legalBodies: BODIES },
  ).record;
  assert.ok(edited);
  const kid = breedFirst([edited, founders[1], founders[2]]);
  assert.ok(kid);
  const editedEntry = entryOf(kid, edited.id);
  assert.equal(
    editedEntry.genes.find((g) => g.family === 'LOOK').source,
    `hand:look:${edited.look}`,
    'the edit is retained',
  );
  const parentView = nodeDeltas(kid, edited.id);
  assert.equal(parentView.deltas.find((d) => d.family === 'LOOK').cls, 'hand', 'the look reads as a hand edit');
  assert.equal(parentView.deltas.find((d) => d.id === 'strain').cls, 'hand', 'the drive reads as a hand edit');
  assert.equal(
    parentView.deltas.find((d) => d.family === 'FORM' && d.id === 'body').cls,
    'born',
    'the rest is its birth',
  );
  const kidLook = nodeDeltas(kid, kid.id).deltas.find((d) => d.family === 'LOOK');
  if (kidLook.fromId === edited.id)
    assert.equal(kidLook.value, edited.look, 'a gene inherited from the edited parent carries the edited value');
  const selfEdited = handEditRecord(
    child,
    { action: 'mutate', family: 'DRIVE', id: 'boredom' },
    { seed: 3, legalBodies: BODIES },
  ).record;
  const selfView = nodeDeltas(selfEdited, selfEdited.id);
  assert.equal(selfView.deltas.find((d) => d.id === 'boredom').cls, 'hand', 'a post-birth edit marks its own delta');
});

ok('door: tampered ancestry refuses the record whole', () => {
  const clone = () => JSON.parse(bytes(child));
  const founderClaim = JSON.parse(bytes(founders[0]));
  founderClaim.ancestry = clone().ancestry;
  assert.equal(sanitizeCreatureRecord(founderClaim), null, 'a founder claiming ancestors');
  const swapped = clone();
  [swapped.ancestry[0], swapped.ancestry[1]] = [swapped.ancestry[1], swapped.ancestry[0]];
  assert.equal(sanitizeCreatureRecord(swapped), null, 'the head is not the lineage, in its order');
  const badGene = clone();
  geneOf({ genome: badGene.ancestry[0].genes }, 'LOOK', 'look').value = 'not-a-look';
  assert.equal(sanitizeCreatureRecord(badGene), null, 'an illegal value in a retained gene');
  const badSource = clone();
  badSource.ancestry[0].genes[0].source = 'stolen';
  assert.equal(sanitizeCreatureRecord(badSource), null, 'a source outside the grammar');
  const dup = clone();
  dup.ancestry.push(dup.ancestry[0]);
  assert.equal(sanitizeCreatureRecord(dup), null, 'an ancestor retained twice');
  const selfAnc = clone();
  selfAnc.ancestry[0] = { ...selfAnc.ancestry[0], id: selfAnc.id };
  assert.equal(sanitizeCreatureRecord(selfAnc), null, 'the record among its own ancestors');
  const shortParents = clone();
  shortParents.ancestry[0].parents = ['cr-00000001'];
  assert.equal(sanitizeCreatureRecord(shortParents), null, 'a parent list that is neither none nor three');
  const noGenes = clone();
  noGenes.ancestry[0].genes = [];
  assert.equal(sanitizeCreatureRecord(noGenes), null, 'an entry without genes');
  assert.equal(sanitizeCreatureRecord({ ...clone(), ancestry: {} }), null, 'ancestry that is not a list');
  // a cycle among entries: a parent entry and a grandparent entry naming each other
  const grand = breedFirst([child, mkParent(3, 44), mkParent(4, 55)]);
  const cyc = JSON.parse(bytes(grand));
  const c1Entry = cyc.ancestry.find((e) => e.id === child.id);
  const f0Entry = cyc.ancestry.find((e) => e.id === founders[0].id);
  f0Entry.parents = [child.id, founders[1].id, founders[2].id];
  assert.ok(c1Entry.parents.includes(founders[0].id), 'the cycle is real: the parent names the founder back');
  assert.equal(sanitizeCreatureRecord(cyc), null, 'ancestry only ever points backwards');
  // oversize: the real head plus synthetic founders past the ceiling
  const big = clone();
  const real = new Set(big.ancestry.map((e) => e.id));
  for (let i = 0; big.ancestry.length <= MAX_ANCESTRY_ENTRIES; i++) {
    const id = `cr-${i.toString(16).padStart(8, '0')}`;
    if (real.has(id)) continue;
    real.add(id);
    big.ancestry.push({
      id,
      genes: [{ family: 'MATERIAL', id: 'material', value: null, source: 'none' }],
      parents: [],
    });
  }
  assert.equal(sanitizeCreatureRecord(big), null, 'a summary past the ceiling refuses, never truncates');
});

const cloneOf = (rec) => JSON.parse(bytes(rec));

ok('agreement: tampered head values refuse — a crossed drive, an inherited look, a swapped skeleton', () => {
  // a crossed drive: the child's blend re-derives from the head entries' values under the lineage seed, so
  // rewriting one parent's retained drive — in range, well-formed — breaks the blend it fed
  const crossed = child.genome.find((g) => g.family === 'DRIVE' && g.source.startsWith('cross:'));
  assert.ok(crossed, 'the founders’ child carries a crossed drive to re-derive');
  const driveForged = cloneOf(child);
  const headDrive = geneOf({ genome: entryOf(driveForged, driveForged.lineage.parents[0]).genes }, 'DRIVE', crossed.id);
  headDrive.value = headDrive.value > 1.25 ? headDrive.value - 0.5 : headDrive.value + 0.5;
  assert.equal(sanitizeCreatureRecord(driveForged), null, 'a head drive rewritten in range breaks the blend');
  // an inherited look: the child's gene names the parent it came from, and that parent's entry must hold it
  const lookChild = breedFirst(founders, (c) => geneOf(c, 'LOOK', 'look').source.startsWith('parent:'));
  assert.ok(lookChild, 'a child that inherited its look whole exists in the seed walk');
  const holder = geneOf(lookChild, 'LOOK', 'look').source.slice('parent:'.length);
  const lookForged = cloneOf(lookChild);
  const heldLook = geneOf({ genome: entryOf(lookForged, holder).genes }, 'LOOK', 'look');
  heldLook.value = heldLook.value === 'praystation' ? 'megacity' : 'praystation';
  assert.equal(
    sanitizeCreatureRecord(lookForged),
    null,
    'a head look swapped for another valid look disagrees with the child’s gene',
  );
  // a swapped skeleton: the mutation re-picked another parent's skeleton whole, so the holder's retained
  // skeleton is the child's — rewriting it leaves the child's skeleton held by nobody
  const swapped = breedFirst(founders, (c) => c.lineage.mutations.some((m) => m.gene === 'FORM.skeleton'));
  assert.ok(swapped, 'a child with a skeleton swap exists in the seed walk');
  const swapTo = swapped.lineage.mutations.find((m) => m.gene === 'FORM.skeleton').to;
  const skelForged = cloneOf(swapped);
  geneOf({ genome: entryOf(skelForged, swapTo).genes }, 'FORM', 'limbs').value = [{ x: 0.5, y: 0.5 }];
  assert.equal(sanitizeCreatureRecord(skelForged), null, 'the swap’s holder no longer holds the skeleton');
});

ok('agreement: a tampered deeper value refuses where a child entry evidences it', () => {
  const grand = breedFirst([child, mkParent(3, 44), mkParent(4, 55)]);
  assert.ok(grand);
  // the retained child's material names its holder: material is never swapped (every parent holds null, so
  // there is nothing to swap to) — it always descends whole from one founder
  const matGene = geneOf({ genome: entryOf(grand, child.id).genes }, 'MATERIAL', 'material');
  assert.ok(matGene.source.startsWith('parent:'), 'the retained child inherited its material from a named founder');
  const holder = matGene.source.slice('parent:'.length);
  const forged = cloneOf(grand);
  geneOf({ genome: entryOf(forged, holder).genes }, 'MATERIAL', 'material').value = 'forged';
  assert.equal(
    sanitizeCreatureRecord(forged),
    null,
    'the founder’s retained material disagrees with the child entry’s inheritance',
  );
  // and a value with weight: the retained child's body names its holder the same way, inherited or swapped
  const bodyGene = geneOf({ genome: entryOf(grand, child.id).genes }, 'FORM', 'body');
  const bodyHolder = bodyGene.source.slice(bodyGene.source.indexOf(':') + 1);
  const bodyForged = cloneOf(grand);
  const heldBody = geneOf({ genome: entryOf(bodyForged, bodyHolder).genes }, 'FORM', 'body');
  heldBody.value = BODIES.find((b) => b !== heldBody.value);
  assert.equal(
    sanitizeCreatureRecord(bodyForged),
    null,
    'the holder’s retained body disagrees with the child entry’s gene',
  );
});

ok('agreement: a dropped parent:-sourced gene refuses — from a head entry, and from a deeper one', () => {
  const holder = geneOf(child, 'MATERIAL', 'material').source.slice('parent:'.length);
  const headDropped = cloneOf(child);
  const headEntry = entryOf(headDropped, holder);
  headEntry.genes = headEntry.genes.filter((g) => !(g.family === 'MATERIAL' && g.id === 'material'));
  assert.equal(
    sanitizeCreatureRecord(headDropped),
    null,
    'the head entry no longer holds the gene the child inherited from it',
  );
  const grand = breedFirst([child, mkParent(3, 44), mkParent(4, 55)]);
  const deepHolder = geneOf({ genome: entryOf(grand, child.id).genes }, 'MATERIAL', 'material').source.slice(
    'parent:'.length,
  );
  const deepDropped = cloneOf(grand);
  const deepEntry = entryOf(deepDropped, deepHolder);
  deepEntry.genes = deepEntry.genes.filter((g) => !(g.family === 'MATERIAL' && g.id === 'material'));
  assert.equal(
    sanitizeCreatureRecord(deepDropped),
    null,
    'a deeper entry no longer holds the gene a child entry inherited from it',
  );
});

ok('door: a summary entry is held to the genome’s birth block', () => {
  const missing = cloneOf(child);
  missing.ancestry[0].genes = missing.ancestry[0].genes.filter((g) => !(g.family === 'VOICE' && g.id === 'voice'));
  assert.equal(sanitizeCreatureRecord(missing), null, 'an entry missing a birth gene is not a genome as it stood');
  const reordered = cloneOf(child);
  const rGenes = reordered.ancestry[0].genes;
  const li = rGenes.findIndex((g) => g.family === 'LOOK');
  const vi = rGenes.findIndex((g) => g.family === 'VOICE');
  [rGenes[li], rGenes[vi]] = [rGenes[vi], rGenes[li]];
  assert.equal(sanitizeCreatureRecord(reordered), null, 'the birth genes out of their canonical order');
  const swapped = cloneOf(child);
  const sGenes = swapped.ancestry[0].genes;
  sGenes[sGenes.findIndex((g) => g.family === 'MATERIAL')] = { family: 'DRIVE', id: 'focus', value: 1, source: 'wild' };
  assert.equal(sanitizeCreatureRecord(swapped), null, 'a full-length entry whose set is not the birth set');
});

ok('agreement: hand edits, crossed genes and the frontier are not held against parents', () => {
  // a parent hand-edited BEFORE it bred: its entry carries hand: genes, and its child still verifies — a
  // hand: value is the performer's act, not a claim about that parent's own parents
  const edited = handEditRecord(
    founders[1],
    {
      action: 'replace',
      family: 'LOOK',
      id: 'look',
      origin: { kind: 'deck', value: founders[1].look === 'praystation' ? 'megacity' : 'praystation' },
    },
    { legalBodies: BODIES },
  ).record;
  assert.ok(edited);
  const kid = breedFirst([edited, founders[0], founders[2]]);
  assert.ok(kid, 'the child of a hand-edited parent breeds');
  assert.deepEqual(sanitizeCreatureRecord(cloneOf(kid)), kid, 'and verifies whole at the door');
  // deep families verify whole, crossed drives and all
  const grand = breedFirst([child, mkParent(3, 44), mkParent(4, 55)]);
  assert.deepEqual(sanitizeCreatureRecord(cloneOf(grand)), grand);
  const great = breedFirst([grand, child, founders[0]]);
  assert.deepEqual(sanitizeCreatureRecord(cloneOf(great)), great, 'a line bred back into its own ancestor verifies');
  // the frontier: a pre-summary parent bred today — its entry names parents no entry retains, and its
  // genes' parent: claims end there, unchecked and unrefused
  const legacy = cloneOf(child);
  delete legacy.ancestry;
  const fc = breedFirst([legacy, mkParent(5, 66), mkParent(6, 77)]);
  assert.ok(fc, 'a pre-summary parent breeds into the summary era');
  const legacyEntry = entryOf(fc, child.id);
  assert.deepEqual(legacyEntry.parents, child.lineage.parents, 'the entry names the parents it was born to');
  assert.ok(
    legacyEntry.parents.every((id) => !entryOf(fc, id)),
    'none of them stands retained — the frontier',
  );
  assert.deepEqual(sanitizeCreatureRecord(cloneOf(fc)), fc, 'and the record verifies whole');
});

ok('agreement: bred families verify across seeds — the door’s blend is the breeder’s blend', () => {
  const more = [mkParent(3, 44), mkParent(4, 55)];
  for (let seed = 0; seed < 40; seed++) {
    const c = breedCreature(founders, seed);
    assert.ok(c, `seed ${seed} breeds and verifies`);
    assert.deepEqual(sanitizeCreatureRecord(cloneOf(c)), c, `seed ${seed} round-trips`);
    const g = breedCreature([c, ...more], seed + 5000);
    assert.ok(g, `seed ${seed + 5000} breeds the next generation and verifies`);
  }
});

ok('persist: a deep record round-trips byte for byte, ancestry included', () => {
  const grand = breedFirst([child, mkParent(3, 44), mkParent(4, 55)]);
  const back = sanitizeCreatureRecords([JSON.parse(bytes(grand))]);
  assert.deepEqual(back, [grand], 'the load door returns the record exactly');
  useStore.setState({ creatureRecords: [grand] });
  const doc = JSON.parse(bytes(serializeProject(S())));
  assert.equal(bytes(doc.creatureRecords), bytes([grand]), 'the document carries the ancestry byte for byte');
  useStore.setState({ creatureRecords: [] });
});

ok('shifts: gait and cost are absent — explicit nulls, never estimates', () => {
  for (const id of [child.id, child.lineage.parents[0]]) {
    assert.deepEqual(nodeDeltas(child, id).shifts, { gait: null, cost: null }, `no shift is computed for ${id}`);
  }
});

console.log(`lineageTree.selfcheck: ${n} checks passed`);
