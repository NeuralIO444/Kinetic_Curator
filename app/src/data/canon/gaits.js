// data/canon/gaits.js — #2329 (GAIT M3; docs/design/gait-spec.md ruling 4): each Canon style's default gaits, as data.
//
// Three per style (spec §5's suggested start): `still`, `idle`, `performing`. The QUEEN picks among a wearer's three
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

/** The default gait kinds, quiet to loud — the order the QUEEN reads them in. */
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

/** A Canon style's three default gaits ({ still, idle, performing }), or null for a style the Canon does not know. */
export function canonGaits(styleId) {
  return Object.prototype.hasOwnProperty.call(CANON_GAITS, styleId) ? CANON_GAITS[styleId] : null;
}

/** The Canon default gait with this id, or null. */
export function canonGaitById(id) {
  return BY_ID.get(id) || null;
}
