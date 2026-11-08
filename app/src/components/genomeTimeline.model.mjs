// genomeTimeline.model.mjs — the Genome Timeline's pure model (#1870, creatures, of #1848).
//
// The timeline is a VIEW on one banked creature record (kc-assembled/1): one node per gene, in record order,
// grouped into family bands, with a human-readable readout per gene (its value + where the value came from).
// It holds no genome truth of its own — the record is the truth, this file only derives what the WetLab shows
// and what the surface may offer. Every write goes back through engine/creatureBreed.js's handEditRecord and
// the assembler's door; the options derived here are advisory (the engine re-validates everything).
//
// KC-1 DS: a genome is discrete fact — counts, ids, sources — so the strip renders TE: plain text, no shimmer.

import { GENE_FAMILIES, lookName, voiceName } from '../engine/creatureAssembler.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';

export const geneKey = (g) => `${g.family}.${g.id}`;

const ptText = (p) => `(${p.x}, ${p.y})`;
const ptsText = (list) => (Array.isArray(list) && list.length ? list.map(ptText).join(' ') : 'none');

/** A gene's value in human-readable form: shapes by id, points as coordinates, decks by name, drives as numbers. */
export function geneValueText(gene) {
  const v = gene.value;
  if (gene.family === 'FORM') {
    if (gene.id === 'body') return String(v);
    if (gene.id === 'head') return v ? ptText(v) : 'none';
    if (gene.id === 'limbs' || gene.id === 'joints') return ptsText(v);
  }
  if (gene.family === 'LOOK') {
    const name = lookName(v);
    return name ? `${name} · ${v}` : String(v);
  }
  if (gene.family === 'VOICE') {
    const name = voiceName(v);
    return name ? `${name} · ${v}` : String(v);
  }
  if (gene.family === 'MATERIAL') return v == null ? 'none — no material yet' : String(v);
  if (gene.family === 'DRIVE') return typeof v === 'number' ? String(v) : 'none';
  if (v == null) return 'none';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  const text = JSON.stringify(v);
  return text.length > 64 ? `${text.slice(0, 61)}…` : text;
}

/** Where a gene's value came from, in words — for assembled, bred, beast-measure and hand-edited genes alike. */
export function geneSourceText(gene) {
  const s = gene.source;
  if (s === 'dealt') return 'dealt at assembly';
  if (s === 'wild') return 'wild type';
  if (s === 'none') return 'no source — a stub';
  const at = s.indexOf(':');
  if (at < 0) return s;
  const kind = s.slice(0, at);
  const rest = s.slice(at + 1);
  if (kind === 'asset') return `assembly · shape ${rest}`;
  if (kind === 'look') return `assembly · named look ${rest}`;
  if (kind === 'voice') return `assembly · named voice ${rest}`;
  if (kind === 'parent') return `breeding · parent ${rest}`;
  if (kind === 'cross') return 'breeding · blend of the three parents';
  if (kind === 'mut')
    return /^cr-[0-9a-f]{8}$/.test(rest)
      ? `breeding mutation · re-picked from ${rest}`
      : 'breeding mutation · re-rolled';
  if (kind === 'hand') {
    if (rest === 'mut') return 'hand mutation · this lab';
    if (rest.startsWith('look:')) return `hand replace · look ${rest.slice(5)}`;
    if (rest.startsWith('voice:')) return `hand replace · voice ${rest.slice(6)}`;
    if (rest.startsWith('asset:')) return `hand replace · shape ${rest.slice(6)}`;
    if (rest.startsWith('donor:')) return `hand replace · donor ${rest.slice(6)}`;
    return `hand edit · ${rest}`;
  }
  return s;
}

/**
 * The strip: the record's genes in record order, banded by family — the five birth families in their canonical
 * order first, any further families (a newer build's genes, beast measures) after, in first-appearance order.
 * @returns {{ recordId: string, count: number, bands: Array<{ family: string, nodes: Array<object> }> }}
 */
export function genomeStrip(record) {
  const genes = record && Array.isArray(record.genome) ? record.genome : [];
  const order = [...GENE_FAMILIES];
  for (const g of genes) if (!order.includes(g.family)) order.push(g.family);
  const bands = [];
  genes.forEach((g, index) => {
    let band = bands.find((b) => b.family === g.family);
    if (!band) {
      band = { family: g.family, nodes: [] };
      bands.push(band);
    }
    band.nodes.push({
      index,
      family: g.family,
      id: g.id,
      key: geneKey(g),
      value: g.value,
      source: g.source,
      valueText: geneValueText(g),
      sourceText: geneSourceText(g),
      hand: typeof g.source === 'string' && g.source.startsWith('hand:'),
    });
  });
  bands.sort((a, b) => order.indexOf(a.family) - order.indexOf(b.family));
  return { recordId: record ? record.id : null, count: genes.length, bands };
}

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SKELETON_IDS = new Set(['head', 'limbs', 'joints']);

/**
 * What the surface may offer for one gene — advisory only; handEditRecord is the law and re-checks everything.
 * Mutate mirrors the engine's legality (which genes have a lawful single-gene mutation, and why not); replace
 * lists the legal origins with the values on offer: the family deck, the asset pool, the shape's own points,
 * and each donor record's corresponding gene. Options that would change nothing are not offered.
 *
 * @param {object} record the selected record
 * @param {object} gene one of its genes
 * @param {{legalBodies?: string[], donors?: object[], hasBodyPoints?: boolean}} [env]
 * @returns {{ mutate: { ok: boolean, why: string|null },
 *             replace: Array<{ kind: string, value?: string, donorId?: string, label: string }> }}
 */
export function geneActions(record, gene, env = {}) {
  const legalBodies = env.legalBodies ?? [];
  const donors = env.donors ?? [];
  let mutate;
  if (gene.family === 'DRIVE') mutate = { ok: true, why: null };
  else if (gene.family === 'LOOK' || gene.family === 'VOICE')
    mutate = { ok: true, why: null }; // the deck always holds another card
  else if (gene.family === 'FORM' && gene.id === 'body')
    mutate = legalBodies.some((id) => id !== gene.value)
      ? { ok: true, why: null }
      : { ok: false, why: 'no other shape in the pool to mutate to' };
  else if (gene.family === 'FORM' && SKELETON_IDS.has(gene.id))
    mutate = {
      ok: false,
      why: 'the skeleton is one linkage group — it changes whole: replace a gene below, or breed',
    };
  else if (gene.family === 'MATERIAL')
    mutate = { ok: false, why: 'material is a stub — there are no legal values to mutate to yet' };
  else mutate = { ok: false, why: 'no mutation machinery for this family' };

  const replace = [];
  if (gene.family === 'LOOK')
    for (const p of COMPOSITION_PRESETS)
      if (p.id !== gene.value) replace.push({ kind: 'deck', value: p.id, label: `look deck · ${p.name ?? p.id}` });
  if (gene.family === 'VOICE')
    for (const v of VOICE_DECK)
      if (v.id !== gene.value) replace.push({ kind: 'deck', value: v.id, label: `voice deck · ${v.name ?? v.id}` });
  if (gene.family === 'FORM' && gene.id === 'body')
    for (const id of legalBodies)
      if (id !== gene.value) replace.push({ kind: 'pool', value: id, label: `pool shape · ${id}` });
  if (gene.family === 'FORM' && SKELETON_IDS.has(gene.id) && env.hasBodyPoints)
    replace.push({ kind: 'asset', label: "this shape's own attach points" });
  for (const donor of donors) {
    if (!donor || donor.id === record.id || !Array.isArray(donor.genome)) continue;
    const dg = donor.genome.find((g) => g.family === gene.family && g.id === gene.id);
    if (dg && !sameValue(dg.value, gene.value))
      replace.push({ kind: 'donor', donorId: donor.id, label: `donor ${donor.id} · ${geneValueText(dg)}` });
  }
  return { mutate, replace };
}
