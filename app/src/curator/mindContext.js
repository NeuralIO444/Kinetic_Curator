// mindContext.js — #1462 Mind 1: the compact scene summary a persona thinks about. Pure.
//
// A summary, never the manifest: counts and names, the room, the band, how many keeps. Small enough to put in a
// prompt later and cheap to compare. Built from a plain snapshot object the caller assembles (so it needs no store).
export const CONTEXT_VERSION = 2;
// #1462 spec update — the persona's engagement tier and the session's zodiac block both come from Mind 3 (#1464).
// Until a tier is supplied it is null; the zodiac block is ABSENT unless the startup reading succeeded, and an absent
// block changes nothing else in the summary.
export const ZODIAC_SIGNS = Object.freeze(['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces']);
export const MOON_PHASES = Object.freeze(['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full',
  'waning-gibbous', 'last-quarter', 'waning-crescent']);
export const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

/** The zodiac block, or null when it is missing or malformed (fail closed: the personas then run unmodulated). */
export function zodiacOf(z) {
  if (!z || typeof z !== 'object' || !ZODIAC_SIGNS.includes(z.sign)) return null;
  return {
    sign: z.sign,
    ...(MOON_PHASES.includes(z.moonPhase) ? { moonPhase: z.moonPhase } : {}),
    ...(SEASONS.includes(z.season) ? { season: z.season } : {}),
  };
}

const count = (arr, pred) => (Array.isArray(arr) ? arr.filter(pred).length : 0);

/**
 * @param snap { layers, enabledAssetCount, paletteId, room: { lois, davis }, band, keepsCount, bpm, audio: 'mic'|'file'|'none',
 *               source: 'ambient'|'set'|'audio', creatures, tier?, zodiac? }
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
    tier: typeof snap.tier === 'string' && /^[a-z0-9-]{1,16}$/.test(snap.tier) ? snap.tier : null,
    ...((z) => (z ? { zodiac: z } : {}))(zodiacOf(snap.zodiac)),
  };
}
