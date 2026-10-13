// mindContext.js — #1462 Mind 1: the compact scene summary a persona thinks about. Pure.
//
// A summary, never the manifest: counts and names, the room, the band, how many keeps. Small enough to put in a
// prompt later and cheap to compare. Built from a plain snapshot object the caller assembles (so it needs no store).
export const CONTEXT_VERSION = 1;

const count = (arr, pred) => (Array.isArray(arr) ? arr.filter(pred).length : 0);

/**
 * @param snap { layers, enabledAssetCount, paletteId, room: { lois, davis }, band, keepsCount, bpm, audio: 'mic'|'file'|'none',
 *               source: 'ambient'|'set'|'audio', creatures }
 */
export function buildContext(input) {
  const snap = input && typeof input === 'object' ? input : {};
  const layers = Array.isArray(snap.layers) ? snap.layers : [];
  const room = snap.room && typeof snap.room === 'object' ? snap.room : {};
  return {
    v: CONTEXT_VERSION,
    layers: {
      content: count(layers, (l) => l && l.type === 'content'),
      pattern: count(layers, (l) => l && l.type === 'pattern'),
      fx: count(layers, (l) => l && l.type === 'fx'),
      math: count(layers, (l) => l && l.type === 'math'),
    },
    assets: Number.isFinite(snap.enabledAssetCount) ? snap.enabledAssetCount : 0,
    palette: typeof snap.paletteId === 'string' ? snap.paletteId : null,
    room: { lois: room.lois || null, davis: room.davis || null },
    band: typeof snap.band === 'string' ? snap.band : null,
    keeps: Number.isFinite(snap.keepsCount) ? snap.keepsCount : 0,
    bpm: Number.isFinite(snap.bpm) ? Math.round(snap.bpm) : null,
    audio: snap.audio === 'mic' || snap.audio === 'file' ? snap.audio : 'none',
    source: snap.source === 'set' || snap.source === 'audio' ? snap.source : 'ambient',
    creatures: Number.isFinite(snap.creatures) ? snap.creatures : 0,
  };
}
