// birthLive.mjs — #2037: the live side of KINETIC births — the standing parent population read from
// the store's standing state, and the pre-made hand derived from it.
//
// The amendment to #2037: candidate children are pre-bred + pre-cultivated whenever the parent
// population changes. The population is a pure read of standing state (the banked records and the
// stage-born children whose tiles stand enabled, plus the pool assets standing enabled, wearing the
// room's standing look and voice), so the hand is a pure function of recorded state too: it is
// re-derived here exactly when the population's fingerprint changes, and a press that finds the
// standing hand's fingerprint different from its own standing population treats the hand as stale
// and breeds on the spot (engine/kineticBirths.mjs holds the whole law).
//
// This module is fed from the live loop, which already watches the state references the population
// reads; the derivation itself is gated on the fingerprint, so steady frames cost one cheap
// population read and no breeding at all.

import { ASSETS } from '../data/assets/index.js';
import { NEVER_DEALT } from '../state/rollPool.mjs';
import { autoAttachPoints } from '../engine/autoAttach.js';
import { creatureTileId, isCreatureTile } from '../engine/creatureTileId.js';
import { birthFingerprint, deriveBirthHand } from '../engine/kineticBirths.mjs';

const byIdAsc = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The standing parent population, in the pure core's shape. Creatures first (banked records, then
 * stage-born children), each by id; then assemblies by asset id — a canonical order, so the same
 * standing state always yields the same population, the same fingerprint and the same draws.
 * Assemblies exist only when the room has a standing look AND voice for them to wear (the breeder's
 * door refuses an assembly whose look/voice are not the room's own); the pool they come from is the
 * dealt pool — the never-dealt packs (creature tiles included) are never parents.
 */
export function birthPopulation(state) {
  const enabled = (state && state.enabledAssets) || {};
  const overlay = (state && state.customAssets) || [];
  const assetsById = new Map();
  for (const a of [...overlay, ...ASSETS]) if (a && a.id && !assetsById.has(a.id)) assetsById.set(a.id, a);
  const sources = [];
  const presentIds = [];
  const banked = [...((state && state.creatureRecords) || [])].sort(byIdAsc);
  for (const rec of banked) {
    presentIds.push(rec.id);
    if (enabled[creatureTileId(rec.id)]) sources.push({ key: `cr:${rec.id}`, src: { kind: 'creature', record: rec } });
  }
  const born = [...((state && state.stageBirths) || [])]
    .filter((b) => b && b.record && b.tile)
    .sort((a, b) => byIdAsc(a.record, b.record));
  for (const b of born) {
    presentIds.push(b.record.id);
    if (enabled[b.tile.id]) sources.push({ key: `cr:${b.record.id}`, src: { kind: 'creature', record: b.record } });
  }
  const lookId = (state && state.layoutParams && state.layoutParams.composition) || null;
  const voiceId = (state && state.kineticVoiceId) || null;
  if (lookId && voiceId) {
    const attach = (state && state.assetAttach) || {};
    const poolAssets = [...assetsById.values()]
      .filter((a) => enabled[a.id] && !isCreatureTile(a) && !NEVER_DEALT.includes(a.id))
      .sort(byIdAsc);
    for (const a of poolAssets) {
      const edited = attach[a.id];
      const points = Array.isArray(edited) && edited.length ? edited : autoAttachPoints(a.svg);
      sources.push({ key: `as:${a.id}`, src: { kind: 'assembly', assetId: a.id, points, lookId, voiceId } });
    }
  }
  return { seed: (state && state.seed) >>> 0, sources, presentIds, assetsById, lookId, voiceId };
}

let standingHand = null;
let lastRefs = null;

/**
 * Note the standing state (called from the live loop as it assembles resolver inputs): re-derive
 * the pre-made hand when — and only when — the population's fingerprint has changed. Returns the
 * standing hand either way.
 */
export function noteBirthPopulation(state) {
  const refs = [
    state && state.seed,
    state && state.creatureRecords,
    state && state.stageBirths,
    state && state.enabledAssets,
    state && state.customAssets,
    state && state.assetAttach,
    state && state.kineticVoiceId,
    state && state.layoutParams,
  ];
  if (lastRefs && refs.every((r, i) => r === lastRefs[i])) return standingHand;
  lastRefs = refs;
  const pop = birthPopulation(state);
  const fingerprint = birthFingerprint(pop);
  if (!standingHand || standingHand.fingerprint !== fingerprint) standingHand = deriveBirthHand(pop);
  return standingHand;
}

/** The standing pre-made hand (null before the first population read). */
export function standingBirthHand() {
  return standingHand;
}

/** Drop the standing hand (project loads and the selfcheck: the next population read re-derives). */
export function resetBirthHand() {
  standingHand = null;
  lastRefs = null;
}
