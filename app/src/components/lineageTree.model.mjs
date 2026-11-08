// lineageTree.model.mjs — the Lineage Tree's pure model (#2030, creatures, of #1848).
//
// The tree is a VIEW on one banked creature record (kc-assembled/1) and the ancestry summary it retains
// (engine: breedCreature writes it at the birth; the assembler's door validates it). It renders from the
// record ALONE — never from the bank: which relatives happen to be banked today cannot change what a
// creature's family was at its birth. The summary is a flat list, breadth-first: the three parents first,
// then deeper ancestors merged in, deduplicated by id; an entry is an ancestor's identity, its genes as
// they stood at this record's birth, and its own parents' ids. An entry's parents may name ids with no
// entry — the frontier: ancestors bred before summaries existed, whose parents were never retained. Those
// render as stubs (an id, nothing more), never as invented creatures.
//
// Generations are DERIVED here, never stored — a stored generation could lie; a derived one is just the
// shape of the retained graph. A founder (no parents) is GEN 01; a node's generation is one past its
// deepest parent's; where any line runs into the frontier the generation is unknown (null), honestly.
//
// Deltas: what changed in a node relative to its parents, classified by each gene's own source — the same
// source grammar the Timeline reads. inherited (parent:), crossed (cross:, the drive blend), mutated
// (mut:, joined to the record's own lineage entries where the record retains them — the selected creature
// only; an ancestor's mutation entries were never part of its summary), hand (hand:, an edit made in the
// lab — on the selected creature, after its birth; on an ancestor, before it bred), born (the assembly
// sources: this creature simply began with the gene).
//
// Shifts are ABSENT, on purpose: gait belongs to linkage measure sets, which live on beast tiles — a
// creature record carries no measures for the solver to evaluate, so no gait shift can arise on this
// surface; and no registry prices a creature record, so there is no cost shift to read. Both are carried
// as explicit nulls so the absence is a fact of the model, not an oversight of the surface.
//
// KC-1 DS: ancestry is discrete fact — ids, counts, generations — so the tree renders TE: plain text.

import { geneValueText, geneSourceText } from './genomeTimeline.model.mjs';

const SKELETON_IDS = new Set(['head', 'limbs', 'joints']);
const geneName = (g) => (g.family === 'FORM' && SKELETON_IDS.has(g.id) ? 'FORM.skeleton' : `${g.family}.${g.id}`);
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The retained entries of a record, by id (empty for a founder or a pre-summary record). */
const entriesById = (record) => {
  const byId = new Map();
  for (const e of record && Array.isArray(record.ancestry) ? record.ancestry : []) byId.set(e.id, e);
  return byId;
};

/** A node's parent ids: the selected creature's from its lineage; an ancestor's from its summary entry. */
const parentIdsOf = (record, byId, id) => {
  if (id === record.id) return record.lineage ? [...record.lineage.parents] : [];
  const e = byId.get(id);
  return e ? [...e.parents] : [];
};

/**
 * Generations over the retained graph, memoized: founder 1, else one past the deepest parent; null where
 * the line runs into the frontier (a stub's own generation is unknowable — its parents were never kept).
 */
function generationMap(record, byId) {
  const gens = new Map();
  const derive = (id, walking) => {
    if (gens.has(id)) return gens.get(id);
    const isSelf = id === record.id;
    const entry = isSelf ? null : byId.get(id);
    if (!isSelf && !entry) return null; // a stub: it was a parent, and that is all that was retained
    const parents = parentIdsOf(record, byId, id);
    if (parents.length === 0) {
      gens.set(id, 1);
      return 1;
    }
    if (walking.has(id)) return null; // the door refuses cycles; a hand-held record still cannot hang the view
    walking.add(id);
    const parentGens = parents.map((p) => derive(p, walking));
    walking.delete(id);
    const gen = parentGens.some((g) => g === null) ? null : 1 + Math.max(...parentGens);
    gens.set(id, gen);
    return gen;
  };
  return (id) => derive(id, new Set());
}

/**
 * The tree of one record: the creature itself, every retained ancestor and frontier stub as a node
 * (breadth-first from the creature, depth = breeding events away), and every parent edge.
 * @returns {{ recordId: string, self: object, nodes: Array<object>, edges: Array<{child: string, parent: string}>,
 *             stubs: number, complete: boolean }}
 *   node: { id, gen: number|null, depth, retained, stub, parentIds }
 */
export function lineageTree(record) {
  const byId = entriesById(record);
  const gen = generationMap(record, byId);
  const self = {
    id: record.id,
    gen: gen(record.id),
    depth: 0,
    retained: true,
    stub: false,
    parentIds: parentIdsOf(record, byId, record.id),
  };
  const nodes = [];
  const edges = [];
  const seen = new Set([record.id]);
  let frontier = [self];
  while (frontier.length) {
    const next = [];
    for (const node of frontier) {
      for (const pid of node.parentIds) {
        edges.push({ child: node.id, parent: pid });
        if (seen.has(pid)) continue;
        seen.add(pid);
        const entry = byId.get(pid);
        const child = {
          id: pid,
          gen: gen(pid),
          depth: node.depth + 1,
          retained: !!entry,
          stub: !entry,
          parentIds: entry ? [...entry.parents] : [],
        };
        nodes.push(child);
        next.push(child);
      }
    }
    frontier = next;
  }
  const stubs = nodes.filter((nd) => nd.stub).length;
  return { recordId: record.id, self, nodes, edges, stubs, complete: stubs === 0 && self.gen !== null };
}

/**
 * One node's deltas against its parents: every gene it carries, classified by its source, with the
 * parents' own values for the gene wherever they were retained.
 * @returns {null | { nodeId: string, retained: boolean, deltas: Array<object>,
 *                    shifts: { gait: null, cost: null } }}
 *   delta: { family, id, key, value, valueText, source, sourceText, cls, fromId,
 *            parents: Array<{ id, retained, value, valueText, matches }>, mutation: object|null }
 *   cls: 'inherited' | 'crossed' | 'mutated' | 'hand' | 'born'
 */
export function nodeDeltas(record, nodeId) {
  const byId = entriesById(record);
  const isSelf = nodeId === record.id;
  const entry = isSelf ? null : byId.get(nodeId);
  if (!isSelf && !entry) {
    // a frontier stub: it was a parent — no genes were retained for it, so there is nothing honest to diff
    if (!parentIdsKnown(record, byId, nodeId)) return null;
    return { nodeId, retained: false, deltas: [], shifts: { gait: null, cost: null } };
  }
  const genes = isSelf ? record.genome || [] : entry.genes;
  const parentIds = parentIdsOf(record, byId, nodeId);
  const parentGenes = (pid) => {
    const pe = byId.get(pid);
    return pe ? pe.genes : null;
  };
  const geneFrom = (pid, g) => {
    const list = parentGenes(pid);
    const pg = list ? list.find((x) => x.family === g.family && x.id === g.id) : null;
    return pg
      ? {
          id: pid,
          retained: true,
          value: pg.value,
          valueText: geneValueText(pg),
          matches: sameValue(pg.value, g.value),
        }
      : { id: pid, retained: !!list, value: null, valueText: null, matches: false };
  };
  // mutation entries are the selected creature's own data (its lineage) — an ancestor's were never summarized
  const mutations = isSelf && record.lineage ? record.lineage.mutations : [];
  const deltas = genes.map((g) => {
    const at = typeof g.source === 'string' ? g.source.indexOf(':') : -1;
    const kind = at > 0 ? g.source.slice(0, at) : g.source;
    const rest = at > 0 ? g.source.slice(at + 1) : '';
    const base = {
      family: g.family,
      id: g.id,
      key: `${g.family}.${g.id}`,
      value: g.value,
      valueText: geneValueText(g),
      source: g.source,
      sourceText: geneSourceText(g),
      fromId: null,
      parents: [],
      mutation: null,
    };
    if (kind === 'parent') {
      return { ...base, cls: 'inherited', fromId: rest, parents: [geneFrom(rest, g)] };
    }
    if (kind === 'cross') {
      return { ...base, cls: 'crossed', parents: parentIds.map((pid) => geneFrom(pid, g)) };
    }
    if (kind === 'mut') {
      const m = mutations.find((x) => x.gene === geneName(g)) || null;
      return { ...base, cls: 'mutated', mutation: m };
    }
    if (kind === 'hand') return { ...base, cls: 'hand' };
    return { ...base, cls: 'born' };
  });
  return { nodeId, retained: true, deltas, shifts: { gait: null, cost: null } };
}

/** A stub is addressable as a node only when some retained node (or the record) names it as a parent. */
function parentIdsKnown(record, byId, id) {
  if (record.lineage && record.lineage.parents.includes(id)) return true;
  for (const e of byId.values()) if (e.parents.includes(id)) return true;
  return false;
}
