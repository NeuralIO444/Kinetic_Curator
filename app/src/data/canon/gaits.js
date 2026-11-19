// data/canon/gaits.js — #2329 (GAIT M3; docs/design/gait-spec.md ruling 4): each Canon style's default gaits, as data.
//
// Three per style (spec §5's suggested start): `still`, `idle`, `performing`. The persona pick chooses among a wearer's three
// once per phrase from the audio (curator/gaitLive.js); a user lock wins (engine/gaitAssign.js).
//
//   still       every amount 0 — the KINEME hard gate. A construct wearing it rests as its flat tile: today's render.
//   idle        the style's lean at a low level: the shape is alive but barely moves.
//   performing  the same lean, louder. Still modest (taste call, flagged to Matt on the PR): at most ~4% scale swell,
//               ~7% thump and ~1% of the canvas of wander.
//
// Built from REGISTERED kineme drivers only (ruling 8) and passed through the gait door (`sanitizeGait`), so every
// record here is exactly what a project could store. The roles follow the join tree: the ROOT wanders (drift) and
// carries the whole shape with it, INNER joints breathe, LEAVES pulse — phase cascading root to leaf by the style's
// `cascade` (beats per joint). Drift never sits below the root: a wandering leaf would leave its join.
//
// Pure data. No clock, no random.
import { CANON_STYLE_IDS } from './styles.js';
import { GAIT_KIND, sanitizeGait } from '../../engine/gait.js';

/** The default gait kinds, quiet to loud — the order the pick reads them in. */
export const CANON_GAIT_KINDS = Object.freeze(['still', 'idle', 'performing']);

/** How loud `idle` is against `performing` (the same lean, one level down). */
export const IDLE_LEVEL = 0.35;

/** The most a default gait asks of each driver at full `performing` (amount units, 0..1). Modest on purpose. */
export const CANON_GAIT_CAPS = Object.freeze({ breath: 0.45, pulse: 0.45, drift: 0.5 });

/**
 * Each style's lean: how much of each driver it moves with (0..1 of the cap), and its cascade in beats per joint.
 * swiss/techno tick tight and pulse-led; japanese/engraved breathe slowly with a long follow-through; grunge and
 * marks wander; organic breathes and wanders; op swells; memphis bounces; bauhaus and pixel pulse on the grid.
 */
const LEAN = Object.freeze({
  swiss: { breath: 0.2, pulse: 0.8, drift: 0.1, cascade: 0.125 },
  bauhaus: { breath: 0.5, pulse: 0.7, drift: 0.2, cascade: 0.25 },
  japanese: { breath: 0.8, pulse: 0.1, drift: 0.3, cascade: 0.5 },
  grunge: { breath: 0.4, pulse: 0.4, drift: 0.8, cascade: 0.25 },
  engraved: { breath: 0.6, pulse: 0.1, drift: 0.1, cascade: 0.5 },
  techno: { breath: 0.1, pulse: 1, drift: 0.1, cascade: 0.0625 },
  pixel: { breath: 0.1, pulse: 0.8, drift: 0.2, cascade: 0.25 },
  organic: { breath: 1, pulse: 0.2, drift: 0.6, cascade: 0.375 },
  op: { breath: 0.9, pulse: 0.5, drift: 0, cascade: 0.125 },
  memphis: { breath: 0.4, pulse: 0.7, drift: 0.5, cascade: 0.25 },
  marks: { breath: 0.5, pulse: 0.2, drift: 0.7, cascade: 0.375 },
});

/**
 * #2330 (gait M4) — each style's break-up: how its constructs come apart when the ferrofluid is strong at them (the
 * field decides WHEN; this decides HOW), and how they come back together when it leaves. One structure per style, worn
 * by all three of its defaults. Taste call (flagged to Matt on the PR): most styles release leaf-first, so the tips go
 * before the trunk; the precise styles (swiss, techno, pixel) snap out and back, the slow ones (japanese, engraved,
 * organic, marks) drift or follow the flow and retrace their way home.
 */
const BREAK = Object.freeze({
  swiss: {
    release: { order: 'leaf-first', stagger: 0.25, scatter: 'burst' },
    rejoin: { ease: 'outCubic', beats: 1, path: 'direct' },
  },
  bauhaus: {
    release: { order: 'leaf-first', stagger: 0.25, scatter: 'burst' },
    rejoin: { ease: 'outBack', beats: 1, path: 'direct' },
  },
  japanese: {
    release: { order: 'leaf-first', stagger: 0.5, scatter: 'drift' },
    rejoin: { ease: 'inOutCubic', beats: 4, path: 'retrace' },
  },
  grunge: {
    release: { order: 'together', stagger: 0, scatter: 'burst' },
    rejoin: { ease: 'outCubic', beats: 1, path: 'arc' },
  },
  engraved: {
    release: { order: 'leaf-first', stagger: 0.5, scatter: 'drift' },
    rejoin: { ease: 'inOutCubic', beats: 4, path: 'retrace' },
  },
  techno: {
    release: { order: 'root-first', stagger: 0.125, scatter: 'burst' },
    rejoin: { ease: 'outCubic', beats: 0.5, path: 'direct' },
  },
  pixel: {
    release: { order: 'leaf-first', stagger: 0.25, scatter: 'burst' },
    rejoin: { ease: 'linear', beats: 1, path: 'direct' },
  },
  organic: {
    release: { order: 'leaf-first', stagger: 0.5, scatter: 'follow-flow' },
    rejoin: { ease: 'inOutCubic', beats: 2, path: 'retrace' },
  },
  op: {
    release: { order: 'root-first', stagger: 0.25, scatter: 'drift' },
    rejoin: { ease: 'inOutCubic', beats: 2, path: 'arc' },
  },
  memphis: {
    release: { order: 'leaf-first', stagger: 0.25, scatter: 'burst' },
    rejoin: { ease: 'outBack', beats: 2, path: 'arc' },
  },
  marks: {
    release: { order: 'leaf-first', stagger: 0.375, scatter: 'follow-flow' },
    rejoin: { ease: 'outCubic', beats: 2, path: 'retrace' },
  },
});

const r3 = (v) => Math.round(v * 1000) / 1000;

function gaitOf(style, kind) {
  const lean = LEAN[style] || LEAN.swiss;
  const level = kind === 'performing' ? 1 : kind === 'idle' ? IDLE_LEVEL : 0;
  const amt = (driver) => r3(level * lean[driver] * CANON_GAIT_CAPS[driver]);
  return sanitizeGait({
    kind: GAIT_KIND,
    name: `${style}-${kind}`,
    canon: style,
    roles: {
      root: { drivers: [{ id: 'drift', amount: amt('drift') }] },
      inner: { drivers: [{ id: 'breath', amount: amt('breath') }] },
      leaf: {
        drivers: [
          { id: 'pulse', amount: amt('pulse') },
          { id: 'breath', amount: r3(amt('breath') * 0.5) },
        ],
      },
    },
    cascade: lean.cascade,
    ...(BREAK[style] || BREAK.swiss),
  });
}

/** { styleId: { still, idle, performing } } — every gait sanitized, frozen. */
export const CANON_GAITS = Object.freeze(
  Object.fromEntries(
    CANON_STYLE_IDS.map((style) => [
      style,
      Object.freeze(Object.fromEntries(CANON_GAIT_KINDS.map((k) => [k, Object.freeze(gaitOf(style, k))]))),
    ]),
  ),
);

const BY_ID = new Map();
for (const set of Object.values(CANON_GAITS)) for (const g of Object.values(set)) BY_ID.set(g.id, g);

/**
 * #2329 follow-up — the Canon gait ids as #2402 (gait M3, main @ 7af21e5) shipped them, before #2405 (M4) added each
 * style's release/rejoin. A gait id is the content hash of the record, so M4 changed every id. A take or a document
 * written between the two names a gait by its OLD id (a GAIT_ASSIGN row, an `input.gaits` stamp, a saved lock); each
 * row here says which style and kind that id was, so it resolves to the same default now.
 *
 * LITERAL DATA, never recomputed at load: computed once from the pre-M4 records (`git show 7af21e5:app/src/data/canon/
 * gaits.js`, every CANON_GAITS[style][kind].id). data/canon/gaits.selfcheck.mjs proves each row equals the current
 * record of that style and kind with M4's release/rejoin taken out — i.e. that each old id names the same gait.
 *   [old id, style, kind]
 */
export const PRE_M4_GAIT_IDS = Object.freeze([
  ['gait:a5af271336ba7f22', 'swiss', 'still'],
  ['gait:b78bc6b903502b55', 'swiss', 'idle'],
  ['gait:a7777f1f2020d0d1', 'swiss', 'performing'],
  ['gait:680c2eee6f0965b9', 'bauhaus', 'still'],
  ['gait:02bdaf200b52820f', 'bauhaus', 'idle'],
  ['gait:7f8f860bbf3a95a6', 'bauhaus', 'performing'],
  ['gait:4506976339b4b0cd', 'japanese', 'still'],
  ['gait:cee521c64ce07202', 'japanese', 'idle'],
  ['gait:9724f2736401b6f3', 'japanese', 'performing'],
  ['gait:5d9a9861b9c89d5b', 'grunge', 'still'],
  ['gait:4eebcfea8f51cd75', 'grunge', 'idle'],
  ['gait:f8e50d72abaead33', 'grunge', 'performing'],
  ['gait:6c1f93a6f18b907b', 'engraved', 'still'],
  ['gait:54b734038e4d0f62', 'engraved', 'idle'],
  ['gait:b2e88b9ac27a1aae', 'engraved', 'performing'],
  ['gait:bbe4db2826c55c19', 'techno', 'still'],
  ['gait:5e3be4a946c0bd14', 'techno', 'idle'],
  ['gait:b2e7edb35d74c06e', 'techno', 'performing'],
  ['gait:11bf915c98f5df4f', 'pixel', 'still'],
  ['gait:872bd3f93c67a83b', 'pixel', 'idle'],
  ['gait:53d113074309039e', 'pixel', 'performing'],
  ['gait:b42a0d1136e332c1', 'organic', 'still'],
  ['gait:a7288b3e07893c4a', 'organic', 'idle'],
  ['gait:2e680ea58d310022', 'organic', 'performing'],
  ['gait:309e752c9e62a942', 'op', 'still'],
  ['gait:827d4e556bb40e23', 'op', 'idle'],
  ['gait:a9659d129d20f426', 'op', 'performing'],
  ['gait:05857d052f790fd9', 'memphis', 'still'],
  ['gait:5c595e0e54e78623', 'memphis', 'idle'],
  ['gait:2340217e15db8716', 'memphis', 'performing'],
  ['gait:4baad138a8877901', 'marks', 'still'],
  ['gait:dba4193e6e3e3651', 'marks', 'idle'],
  ['gait:236aec667bae1bd9', 'marks', 'performing'],
]);

/** old id → the current record of the same style and kind. */
const ALIAS = new Map(PRE_M4_GAIT_IDS.map(([old, style, kind]) => [old, CANON_GAITS[style][kind]]));

/** A Canon style's three default gaits ({ still, idle, performing }), or null for a style the Canon does not know. */
export function canonGaits(styleId) {
  return Object.prototype.hasOwnProperty.call(CANON_GAITS, styleId) ? CANON_GAITS[styleId] : null;
}

/** The Canon default gait with this id (a pre-M4 id resolves through PRE_M4_GAIT_IDS), or null. */
export function canonGaitById(id) {
  return BY_ID.get(id) || ALIAS.get(id) || null;
}

/** The id to keep for a gait id: a pre-M4 Canon id becomes the current id of the same gait; any other id is itself. */
export function canonicalGaitId(id) {
  const g = ALIAS.get(id);
  return g ? g.id : id;
}
