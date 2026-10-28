// mindContext.js — #1462 Mind 1: the compact scene summary a persona thinks about. Pure.
//
// A summary, never the manifest: counts and names, the room, the band, how many keeps. Small enough to put in a
// prompt later and cheap to compare. Built from a plain snapshot object the caller assembles (so it needs no store).
// #1145 × Mind (v3): the Director's room as the minds hear it — its verdict (THE CLASH, AGREEMENT, THE ROOM, FULL BURN,
// DAVIS ALONE) and an intensity band (low | mid | peak). Null until the Director has ticked, and null in silence.
import { ROOM_VERDICTS, INTENSITY_BANDS } from './directorRoom.js';

export const CONTEXT_VERSION = 3;
// #1462 spec update — the persona's engagement tier and the session's zodiac block both come from Mind 3 (#1464).
// Until a tier is supplied it is null; the zodiac block is ABSENT unless the startup reading succeeded, and an absent
// block changes nothing else in the summary.
export const ZODIAC_SIGNS = Object.freeze([
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
]);
export const MOON_PHASES = Object.freeze([
  'new',
  'waxing-crescent',
  'first-quarter',
  'waxing-gibbous',
  'full',
  'waning-gibbous',
  'last-quarter',
  'waning-crescent',
]);
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

const SHOW_ENERGY = Object.freeze(['low', 'mid', 'high']);
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * #1483 — the audio show block: what the trio conducts while audio is live. Null when it is missing or the audio is off
 * (an absent block changes nothing else in the summary). Everything is clamped and bounded: the route table is at most
 * 16 rows, owned targets are names only.
 */
const unit = (v) => r3(Math.min(1, Math.max(0, v)));
/** The spectrum summary { centroid, flux, flatness }, or null unless all three are finite numbers. */
function spectrumOf(sp) {
  if (!sp || typeof sp !== 'object') return null;
  const { centroid, flux, flatness } = sp;
  if (![centroid, flux, flatness].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return { centroid: unit(centroid), flux: unit(flux), flatness: unit(flatness) };
}

export function showOf(s) {
  if (!s || typeof s !== 'object') return null;
  const routes = (Array.isArray(s.routes) ? s.routes : [])
    .slice(0, 16)
    .filter((r) => r && typeof r.input === 'string' && typeof r.target === 'string' && Number.isFinite(r.depth))
    .map((r) => ({
      input: r.input,
      target: r.target,
      depth: r3(r.depth),
      ...(r.by === 'davis' ? { by: 'davis' } : {}),
    }));
  return {
    energy: SHOW_ENERGY.includes(s.energy) ? s.energy : null,
    bpm: Number.isFinite(s.bpm) ? Math.round(s.bpm) : null,
    confidence: Number.isFinite(s.confidence) ? r3(Math.min(1, Math.max(0, s.confidence))) : 0,
    onsets: Number.isFinite(s.onsets) ? Math.max(0, Math.round(s.onsets)) : 0,
    silent: !!s.silent,
    sinceBars: Number.isFinite(s.sinceBars) ? Math.max(0, Math.round(s.sinceBars)) : 0,
    flatBars: Number.isFinite(s.flatBars) ? Math.max(0, Math.round(s.flatBars)) : 0,
    routes,
    owned: (Array.isArray(s.owned) ? s.owned : []).filter((t) => typeof t === 'string' && t.length <= 40).slice(0, 32),
    ...(spectrumOf(s.spectrum) ? { spectrum: spectrumOf(s.spectrum) } : {}),
    ...((m) => (m ? { marks: m } : {}))(marksOf(s.marks)),
  };
}

/**
 * #1483 stage 2 — the spectrum marks as the trio hears them (STIMULI -> SPECTRUM): { map 0..3, scale, displace, colour
 * 0..1 }, or null when absent or malformed (then the block has no `marks` key and nothing else changes).
 */
export function marksOf(m) {
  if (!m || typeof m !== 'object') return null;
  const u = (v) => (Number.isFinite(v) ? r3(Math.min(1, Math.max(0, v))) : null);
  const map = Number.isFinite(m.map) ? Math.min(3, Math.max(0, Math.round(m.map))) : null;
  const out = { map, scale: u(m.scale), displace: u(m.displace), colour: u(m.colour) };
  return Object.values(out).some((v) => v === null) ? null : out;
}

const count = (arr, pred) => (Array.isArray(arr) ? arr.filter(pred).length : 0);

/**
 * @param snap { layers, enabledAssetCount, paletteId, room: { lois, davis }, band, keepsCount, bpm, audio: 'mic'|'file'|'none',
 *               source: 'ambient'|'set'|'audio', creatures, tier?, zodiac?, director?: { verdict, intensity },
 *               show?: { energy, bpm, confidence, onsets, silent, sinceBars, flatBars, routes, owned, marks? } (#1483) }
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
    verdict: snap.director && ROOM_VERDICTS.includes(snap.director.verdict) ? snap.director.verdict : null,
    intensity:
      snap.director &&
      ROOM_VERDICTS.includes(snap.director.verdict) &&
      INTENSITY_BANDS.includes(snap.director.intensity)
        ? snap.director.intensity
        : null,
    tier: typeof snap.tier === 'string' && /^[a-z0-9-]{1,16}$/.test(snap.tier) ? snap.tier : null,
    ...((z) => (z ? { zodiac: z } : {}))(zodiacOf(snap.zodiac)),
    ...((sh) => (sh && snap.audio !== 'none' ? { show: sh } : {}))(showOf(snap.show)),
  };
}
