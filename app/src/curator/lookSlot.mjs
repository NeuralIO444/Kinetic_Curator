// lookSlot.mjs — #2148 step 3: loading a Library Look into one of the 16 stage slots. Pure: no store, no DOM, no clock.
//
// A stage slot holds a KEEP (curator/shelf.mjs). A Library Look is a kc-look/1 preset (mode + layout params + paletteId, seed
// optional). Loading one is an explicit act: the Look becomes a hand keep (cost 1) in the collection and takes a stage slot —
// a free one, or a chosen slot it replaces (the shelf's own swap law: the performing Look's slot stays pinned, the budget is a
// hard invariant, a refusal speaks). Loading never applies the Look to the scene; playing the slot is the existing slot press.
//
// Seed: a seeded Look keeps its seed. A seedless Look is stamped with the session's current seed at load time (Matt, 2026-11-16)
// and the line says so — the slot is then a frozen plate, which is what a keep is.
import { admitToStage, swapSlots, stageRecords, stageFits } from './shelf.mjs';

/** The seed a loaded Look sits on, and whether it was stamped from the session (a seedless Look). */
export function lookSeedFor(look, liveSeed) {
  if (look && look.seed !== undefined) return { seed: look.seed, stamped: false };
  return { seed: liveSeed, stamped: true };
}

/**
 * The raw keep record for a Library entry ({ id, name, look }). The store passes it through sanitizeFavorite, the one door every
 * keep walks. The mode rides inside the layout params, the way every keep and live scene carries it.
 */
export function lookToKeepRecord(entry, { seed, at, id }) {
  const { look } = entry;
  const picked = lookSeedFor(look, seed);
  return {
    id,
    seed: picked.seed,
    timestamp: new Date(at).toISOString(),
    keptAt: at,
    config: { layout: { ...look.layoutParams, mode: look.mode }, palette: { id: look.paletteId } },
  };
}

/**
 * Where the loaded keep goes. `keeps` is the whole shelf INCLUDING the new keep. outId null → the next free slot (refused with the
 * shelf's own line when the stage has no room); an outId → that slot, exchanged in place by the swap law.
 * @returns {{ ok: true, stageIds: string[], replaced: boolean } | { ok: false, copy: string, stageIds: string[] }}
 */
export function planLookLoad(keeps, stageIds, keepId, outId, { performingKeepId = null } = {}) {
  const keep = (keeps || []).find((k) => k.id === keepId);
  if (outId == null) {
    const res = admitToStage(keeps, stageIds, keep);
    return res.ok
      ? { ok: true, stageIds: res.stageIds, replaced: false }
      : { ok: false, copy: res.copy, stageIds: res.stageIds };
  }
  const res = swapSlots(keeps, stageIds, outId, keepId, { performingKeepId });
  return res.ok
    ? { ok: true, stageIds: res.stageIds, replaced: true }
    : { ok: false, copy: res.copy, stageIds: res.stageIds };
}

/**
 * What the LOAD picker offers: one choice per occupied slot (menu order, numbered from 1) and whether a free slot remains.
 * `labelOf(keep)` names a slot's Look. The performing Look's slot is listed but marked, so the refusal is visible before the press.
 */
export function slotChoices(keeps, stageIds, { performingKeepId = null, labelOf = (k) => k.id } = {}) {
  const recs = stageRecords(keeps, stageIds);
  const slots = recs.map((k, i) => ({
    n: i + 1,
    outId: k.id,
    label: labelOf(k),
    performing: k.id === performingKeepId,
  }));
  const room = stageFits(keeps, stageIds, { id: '', provenance: null }); // a hand keep's cost: 1
  return { slots, canAddNew: room.fits };
}

/** The line a successful load speaks. */
export function lookLoadedLine(name, { stamped, replaced }) {
  const where = replaced ? 'replaced a slot' : 'took a free slot';
  return `${name} loaded — ${where}${stamped ? ' · seed stamped from this session' : ''}`;
}

export const LOOK_NOT_LOADED_COPY = 'that Look could not be loaded';
export const LOOK_GONE_COPY = 'that Look is not in the Library';
export const REPLACE_PROMPT = 'REPLACE?';
