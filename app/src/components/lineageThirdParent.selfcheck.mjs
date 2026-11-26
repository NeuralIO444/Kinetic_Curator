// lineageThirdParent.selfcheck.mjs — #2500 (stress A23): the Lineage Tree's crossed drive lines.
//
// The filed observation: on a bred child's LINEAGE, the approval and crowding lines named all three
// parents but showed no value for the third ('cr-ccb3100d:' — nothing after the colon), while strain
// and boredom showed all three values. This suite pins the line's law, per gene:
//
//   values    a parent whose retained summary holds the gene renders that value — all three parents,
//             every crossed drive, the actual strings the panel prints;
//   missing   a parent whose retained summary does NOT hold the gene (the filed shape) is named as
//             what it is — 'not retained', the surface's own words for an unretained parent — never a
//             bare 'null' standing where a value should read, and never a claim (an inherited gene)
//             to differ from a value that was never retained;
//   tokens    the standing honest tokens survive: a stub parent (no entry at all) reads 'not retained'
//             on every drive alike, and a gene retained with an empty (null) value reads 'none';
//   corpus    across bred families the crossed parts are always '<id>: <number>' — the per-gene
//             retention fix changes nothing for any record the assembler's door admits.
//
// The parts builder below mirrors LineageTree.jsx's deltaGroups crossed/inherited branches verbatim
// (the component is JSX and cannot be imported here); the model objects it consumes are the real ones.
import assert from 'node:assert/strict';
import { assembleCreature } from '../engine/creatureAssembler.js';
import { breedCreature } from '../engine/creatureBreed.js';
import { ASSETS } from '../data/assets/index.js';
import { autoAttachPoints } from '../engine/autoAttach.js';
import { nodeDeltas } from './lineageTree.model.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const bytes = (v) => JSON.stringify(v);
const clone = (v) => JSON.parse(bytes(v));
const geneOf = (genes, family, id) => genes.find((g) => g.family === family && g.id === id);
const entryOf = (rec, id) => rec.ancestry.find((e) => e.id === id);

/** The crossed line's parts, exactly as LineageTree.jsx builds them (deltaGroups, crossed branch). */
const crossedParts = (d) => d.parents.map((p) => `${p.id}: ${p.retained ? p.valueText : 'not retained'}`);
const crossedSuffix = (d) => ` — crossed · a blend of the parents — ${crossedParts(d).join(' · ')}`;
/** The inherited suffix, exactly as LineageTree.jsx builds it (deltaGroups, inherited branch). */
const inheritedSuffix = (d) => {
  const p = d.parents[0];
  return p && p.retained ? (p.matches ? ' · unchanged' : ' · differs from the retained value') : '';
};

const marked = (asset) =>
  autoAttachPoints(asset.svg).map((p, i) => ({ ...p, role: i === 0 ? 'H' : i <= 2 ? 'L' : undefined }));
const mkParent = (i, seed) =>
  assembleCreature({ assetId: ASSETS[i].id, points: marked(ASSETS[i]), seed, lookId: null, voiceId: null });
const founders = [mkParent(0, 11), mkParent(1, 22), mkParent(2, 33)];
assert.ok(founders.every(Boolean) && new Set(founders.map((p) => p.id)).size === 3, 'three distinct founders assemble');

/** A child whose approval AND crowding both crossed (the filed pair), bred from the founders. */
const breedFiled = () => {
  for (let seed = 0; seed < 2000; seed++) {
    const c = breedCreature(founders, seed);
    if (!c) continue;
    const crossed = new Set(
      c.genome.filter((g) => g.family === 'DRIVE' && g.source.startsWith('cross:')).map((g) => g.id),
    );
    if (crossed.has('approval') && crossed.has('crowding')) return c;
  }
  return null;
};
const child = breedFiled();
assert.ok(child, 'a child with crossed approval and crowding breeds');
const crossedDrives = (rec) => nodeDeltas(rec, rec.id).deltas.filter((d) => d.cls === 'crossed');

ok('values: three recorded parents render all three values, on every crossed drive', () => {
  const deltas = crossedDrives(child);
  assert.ok(deltas.length >= 2, `the filed child carries crossed drives (got ${deltas.map((d) => d.key).join(', ')})`);
  for (const d of deltas) {
    assert.equal(d.parents.length, 3, `${d.key} names three parents`);
    const parts = crossedParts(d);
    d.parents.forEach((p, i) => {
      const held = geneOf(entryOf(child, p.id).genes, 'DRIVE', d.id);
      assert.ok(held, `${d.key}: parent ${p.id} retains the gene in the record`);
      assert.equal(p.retained, true, `${d.key}: ${p.id} reads retained`);
      assert.equal(
        parts[i],
        `${p.id}: ${String(held.value)}`,
        `${d.key}: part ${i + 1} renders the recorded value — actual line: ${crossedSuffix(d)}`,
      );
    });
    assert.ok(!/null|not retained|none/.test(crossedSuffix(d)), `${d.key}: no empty token in: ${crossedSuffix(d)}`);
  }
});

ok('missing: an entry that lacks the gene names it not retained — never a bare null after the colon', () => {
  const filed = clone(child);
  const third = filed.lineage.parents[2];
  const entry = entryOf(filed, third);
  entry.genes = entry.genes.filter((g) => !(g.family === 'DRIVE' && (g.id === 'approval' || g.id === 'crowding')));
  for (const drive of ['approval', 'crowding']) {
    const d = crossedDrives(filed).find((x) => x.id === drive);
    assert.ok(d, `${drive} still reads crossed`);
    const p = d.parents[2];
    assert.equal(p.id, third);
    assert.deepEqual(
      { retained: p.retained, value: p.value, valueText: p.valueText },
      { retained: false, value: null, valueText: null },
      `${drive}: the third parent's unretained gene reads as unretained (got retained=${p.retained}, valueText=${p.valueText})`,
    );
    const parts = crossedParts(d);
    assert.equal(
      parts[2],
      `${third}: not retained`,
      `${drive}: the line names the state — actual line: ${crossedSuffix(d)}`,
    );
    assert.ok(!crossedSuffix(d).includes('null'), `${drive}: no leaked null in: ${crossedSuffix(d)}`);
    // the defect was per gene: the same parent's strain and boredom values still render
    for (const other of ['strain', 'boredom']) {
      const od = crossedDrives(filed).find((x) => x.id === other);
      if (!od) continue;
      const held = geneOf(entryOf(filed, third).genes, 'DRIVE', other);
      assert.equal(
        crossedParts(od)[2],
        `${third}: ${String(held.value)}`,
        `${other}: the third parent's retained value still renders — actual line: ${crossedSuffix(od)}`,
      );
    }
  }
});

ok('missing: an inherited gene claims no difference from a value that was never retained', () => {
  const filed = clone(child);
  const view = nodeDeltas(filed, filed.id);
  const inherited = view.deltas.find((d) => d.cls === 'inherited' && d.parents[0] && d.parents.length === 1);
  assert.ok(inherited, 'the child carries an inherited gene to test');
  const holder = inherited.fromId;
  const entry = entryOf(filed, holder);
  entry.genes = entry.genes.filter((g) => !(g.family === inherited.family && g.id === inherited.id));
  const d = nodeDeltas(filed, filed.id).deltas.find((x) => x.key === inherited.key);
  assert.equal(d.parents[0].retained, false, `${d.key}: the named parent did not retain this gene`);
  assert.equal(
    inheritedSuffix(d),
    '',
    `${d.key}: no 'differs from the retained value' claim — there is no retained value (got '${inheritedSuffix(d)}')`,
  );
});

ok('tokens: a stub parent reads not retained on every drive; a retained empty value reads none', () => {
  const preSummary = clone(child);
  delete preSummary.ancestry; // bred before summaries existed: lineage stands, parents are stubs
  for (const d of crossedDrives(preSummary)) {
    assert.deepEqual(
      crossedParts(d),
      d.parents.map((p) => `${p.id}: not retained`),
      `${d.key}: every parent a stub — actual line: ${crossedSuffix(d)}`,
    );
  }
  const emptied = clone(child);
  const third = emptied.lineage.parents[2];
  geneOf(entryOf(emptied, third).genes, 'DRIVE', 'strain').value = null;
  const strain = crossedDrives(emptied).find((x) => x.id === 'strain');
  if (strain) {
    assert.equal(strain.parents[2].retained, true, 'the gene was retained; its value is empty');
    assert.equal(
      crossedParts(strain)[2],
      `${third}: none`,
      `strain: a retained empty value reads 'none' — actual line: ${crossedSuffix(strain)}`,
    );
  }
});

ok('corpus: bred families render a number for every parent on every crossed drive', () => {
  const bank = [...founders, mkParent(3, 44), mkParent(4, 55), mkParent(5, 66)].filter(Boolean);
  let parts = 0;
  for (let seed = 0; seed < 120; seed++) {
    const trio = [bank[seed % bank.length], bank[(seed + 3) % bank.length], bank[(seed + 5) % bank.length]];
    if (new Set(trio.map((r) => r.id)).size !== 3) continue;
    const c = breedCreature(trio, seed + 31000);
    if (!c) continue;
    for (const d of crossedDrives(c)) {
      for (const part of crossedParts(d)) {
        parts++;
        assert.match(part, /^cr-[0-9a-f]{8}: -?\d/, `a crossed part is '<id>: <number>' — got '${part}'`);
      }
    }
    if (seed % 3 === 0) bank.push(c);
  }
  assert.ok(parts > 100, `the corpus exercised real crossed lines (${parts} parts)`);
});

console.log(`lineageThirdParent.selfcheck: ${n} groups passed`);
