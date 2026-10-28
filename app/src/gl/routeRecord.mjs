// routeRecord.mjs — #1483 follow-up: a take carries its audio route table, so playback hears through the same routes.
//
// The resolver's input carries what the routes made of each frame's audio for the marks (scaleMul, alphaBoost), but
// the loop also reads the table AFTER the resolve: the breath, the glow, and every route target that sits beside the
// resolver. Those read the store's table, so a take played back after the table changed (Davis conducted during the
// take, or the artist edited the STIMULI matrix since) was heard through TODAY's routes, not the take's. This records
// the table when the take began and every change after, by frame — the clock section's shape — and playback lays the
// table at the playing frame over the loop's store view (playback.overlayScene).
//
// THE LOG WINS like the other take sections: on playback these tables are the authority. A take without the section
// (recorded before it existed) plays through the live table, as before.
import { sanitizeAudioRoutes } from '../data/audioRoutes.js';

export const ROUTE_RECORD_VERSION = 1;
/** Davis lands at most one edit a phrase; the artist edits by hand. Far above any real take. */
export const ROUTE_RECORD_MAX = 2000;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copy = (t) => (t == null ? null : JSON.parse(JSON.stringify(t)));
/** A table as the store holds it: null (the default routing), [] (none), or the sanitized rows. */
const tableOf = (raw) => (raw == null ? null : sanitizeAudioRoutes(raw));

/**
 * Recorder. `getFrame()` returns the take's current frame index.
 * @param initial the store's audioRoutes when the take begins
 */
export function createRouteRecorder({ initial = null, getFrame = () => 0 } = {}) {
  const start = tableOf(initial);
  let now = start;
  const changes = []; // [frame, table]
  return {
    /** The table now (call on every store change; an unchanged table is ignored). */
    set(next) {
      const t = tableOf(next);
      if (same(t, now) || changes.length >= ROUTE_RECORD_MAX) return;
      now = t;
      changes.push([getFrame() | 0, copy(t)]);
    },
    finish() {
      return { version: ROUTE_RECORD_VERSION, initial: copy(start), changes: changes.map(([f, t]) => [f, copy(t)]) };
    },
  };
}

/** Fail-closed shape check: the record, or null. Every table must survive sanitizing unchanged. */
export function checkRouteRecord(r) {
  if (!r || typeof r !== 'object' || r.version !== ROUTE_RECORD_VERSION) return null;
  const okTable = (t) => t === null || (Array.isArray(t) && same(sanitizeAudioRoutes(t), t));
  if (!okTable(r.initial) || !Array.isArray(r.changes) || r.changes.length > ROUTE_RECORD_MAX) return null;
  let prev = -1;
  for (const c of r.changes) {
    if (!Array.isArray(c) || c.length !== 2 || !Number.isInteger(c[0]) || c[0] < prev || !okTable(c[1])) return null;
    prev = c[0];
  }
  return r;
}

/** The table in force at `frame` (the last change at or before it, else the take's starting table). */
export function routesAt(record, frame) {
  let t = record.initial;
  for (const [f, table] of record.changes) {
    if (f > frame) break;
    t = table;
  }
  return t;
}
