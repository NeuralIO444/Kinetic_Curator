// personas/wireRecord.mjs — #2390 (Persona Kernel P10): the Wire's holder and the take's `wire` section.
//
// The holder is the one place the shelf lives in memory (ephemeral: never store state, never saved in a project).
// The live adapter (wireLive.js) puts a fetched shelf in; the readers (the Mind context, queenView) read it out.
//
// THE TAKE (determinism law, spec §3a): a take records which Wire items were in reach — the shelf as it stood when
// the take began — as an optional `wire` section: { version, items }. Fetching never happens while a take records or
// plays, so the shelf cannot change under a take; on playback the holder is OVERRIDDEN by the take's own items (or by
// nothing, for a take without the section), so a replay reads exactly what the recording read and never needs the
// network, the cache or the live shelf. The section is optional and additive: a take made with the Wire off (every
// take before P10) has none and loads as it always did; checkWireRecord is fail-closed — one malformed item, an
// unknown key or a wrong version refuses the whole section, and a refused section replays as an empty shelf.
import { WIRE_SHELF_MAX, checkWireItems } from './wireFeed.mjs';

export const WIRE_RECORD_VERSION = 1;

let live = []; // the fetched shelf (clean items)
let override = null; // null = live reads; an array = a take is playing and the shelf is ITS items
let held = false; // a take is recording: the live shelf is frozen under it

/** Is the shelf held for a recording take? */
export function wireHeld() {
  return held;
}

/** The items in reach now: a playing take's own, else the live shelf. Copies. */
export function getWireItems() {
  return (override ?? live).map((i) => ({ ...i }));
}

/**
 * The Wire's slot for queenView: null when nothing is in reach (so the typed empty slot stands and the default view is
 * byte-identical), else { schema, built, items }.
 */
export function getWireView() {
  const items = getWireItems();
  return items.length ? { schema: 'kc-wire/1', built: true, items } : null;
}

/** A recording take holds the shelf (true) or lets it go (false): no shelf lands under a take. */
export function holdWireShelf(on) {
  held = on === true;
}

/**
 * The live adapter puts a fetched (or cached) shelf in. Proved whole (checkWireItems) or refused; refused while a take
 * records (the shelf is frozen under a take). Returns whether it took.
 */
export function setWireShelf(items) {
  if (held) return false;
  const c = checkWireItems(items);
  if (!c) return false;
  live = c;
  return true;
}

/** Forget the live shelf (the Wire is switched off or the adapter stops). */
export function clearWireShelf() {
  live = [];
}

// ── the take side ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The recorder: the shelf in reach when the take begins. finish() is undefined when nothing was in reach — the section
 * is then absent and the take is byte-identical to one made without the Wire.
 */
export function createWireRecorder({ getItems = getWireItems } = {}) {
  const items = checkWireItems(getItems()) || [];
  return {
    finish() {
      if (!items.length) return undefined;
      return { version: WIRE_RECORD_VERSION, items: items.map((i) => ({ ...i })) };
    },
  };
}

/**
 * A take's wire section, checked: { version, items } (copied) or null — absent, or malformed (fail closed: a wrong
 * version, an unknown key, a bad item, a duplicate or an over-long list refuses the whole section).
 */
export function checkWireRecord(section) {
  if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
  if (section.version !== WIRE_RECORD_VERSION) return null;
  if (Object.keys(section).some((k) => k !== 'version' && k !== 'items')) return null;
  const items = checkWireItems(section.items, WIRE_SHELF_MAX);
  return items && items.length ? { version: WIRE_RECORD_VERSION, items } : null;
}

let replay = null; // { section }

/**
 * Playback: from the take's first frame on, the holder reads the take's items — an absent or malformed section reads as
 * an empty shelf, never as the live one. Cheap per frame (it acts once per take). Returns whether it changed the holder.
 */
export function replayWireFrame(section) {
  if (replay && replay.section === section) return false;
  const rec = checkWireRecord(section);
  replay = { section };
  override = rec ? rec.items : [];
  return true;
}

/** Leave playback: the live shelf is read again. */
export function endWireReplay() {
  replay = null;
  override = null;
}
