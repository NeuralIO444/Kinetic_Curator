// world.js — #2104 (Canon) the world record: the ground, ink, boil clock and
// finish that every style on the stage stands in. Steps 1–3 of the build
// order in docs/design/canon-world-record-spec.md: the record and its door
// (step 1), the landing deal — the authored stock and the chapter-alone
// pick (step 2, below) — and the recording (step 3): the standing world
// saves in the project document and in the take, in the sun's shape
// (state/projectDocument.js, gl/performanceFile.mjs), and a load stands the
// recorded world back up through this door. The style response is step 4.
//
// ONE world stands over a scene, above the kit triad. The sun is NOT a field
// of it (the sun stays scene-level in data/light.js, the artist's hand and
// the beat), and trail policy is NOT a field of it (a Look resets ACCUM).
// No field names a look, voice, asset or layout: the world is what is
// shared, and everything that differs between styles stays in their records.
//
// `null` means no world standing, and no world standing is byte-identical
// everywhere — it renders exactly as the instrument did before worlds
// existed. A fresh stage does NOT open world-less: the hand-authored house
// world (HOUSE_WORLD below) stands by default from the open (ruling 10,
// 2026-11-13). World-less is what CHAOS and the launch opener leave behind
// when they clear the world with the chapter (ruling 7), and the state a
// document that predates the field loads in.
//
// Browser-safe, pure. The record stands in the store — the house world from
// the open, a dealt world from each chapter landing — and the door below is
// its one validator: every write into the store and every read back from a
// document or a take passes through it. Nothing reads the record to render
// yet (the response is step 4).

import { normalizeHex } from './palettes.js';
import { BOIL_FPS_DEFAULT, BOIL_FPS_MIN, BOIL_FPS_MAX } from '../engine/kineme.js';

/**
 * The house world, authored by hand (ruling 10): warm paper, a warm
 * near-black line, the classic hand-drawn boil, a light house grain.
 * `chapter` is provenance — the landing that dealt the world; the house
 * world was dealt by no landing, so its provenance is the house itself.
 */
export const HOUSE_WORLD = Object.freeze({
  chapter: 'house',
  ground: '#ece7db',
  ink: '#1a1712',
  boilFps: 8,
  finish: Object.freeze({ grain: 0.2 }),
});

/** The finish family's grain amount runs 0..1 (fx/fxFilters.js); the world's finish is capped by the same ceiling. */
export const WORLD_GRAIN_MAX = 1;

const clamp = (v, lo, hi, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};

const colour = (raw, fallback) => normalizeHex(raw) ?? fallback;

const chapter = (raw) => (typeof raw === 'string' && raw.trim() !== '' ? raw : HOUSE_WORLD.chapter);

/**
 * Normalize a raw world. Returns null (no world standing) for anything that
 * is not an object — fail-closed, like every other document field. Missing
 * fields take the standing defaults (the house world's own values); colours
 * are validated as colours; the boil is clamped to the named band
 * (BOIL_FPS_MIN..MAX in engine/kineme.js — the record carries a value inside
 * that band, never a new band). Unknown keys are dropped: the record's shape
 * is fixed, so an authored world survives the door unchanged.
 */
export function sanitizeWorld(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const finish = raw.finish && typeof raw.finish === 'object' && !Array.isArray(raw.finish) ? raw.finish : {};
  return {
    chapter: chapter(raw.chapter),
    ground: colour(raw.ground, HOUSE_WORLD.ground),
    ink: colour(raw.ink, HOUSE_WORLD.ink),
    boilFps: clamp(raw.boilFps, BOIL_FPS_MIN, BOIL_FPS_MAX, BOIL_FPS_DEFAULT),
    finish: { grain: clamp(finish.grain, 0, WORLD_GRAIN_MAX, HOUSE_WORLD.finish.grain) },
  };
}

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

/**
 * The authored stock (ruling 1): worlds written per chapter — not derived
 * from the chapter's measured settings, and not rolled from named ranges on
 * the die. Written for ALL TWELVE chapters now (conflict-review ruling,
 * 2026-11-13), in the ruled spine order — Organic, Pixel and Techno sit at
 * their ruled positions (after Engraving; after Memphis; after Grunge)
 * ahead of those chapters being built, so when they land later their
 * worlds are already written and waiting, and the deal is never undefined
 * for a landable chapter.
 *
 * Each world's ground is its palette's bg and its ink is that palette's
 * line ink (the stated rule in data/palettes.js — the palette named in the
 * entry's comment); the boil and the grain are the chapter's climate,
 * authored per world, inside the named bands. A chapter's palettes are its
 * own: the card palette first, then the family its Canon style resolves
 * (data/canon/index.js). Now stands on the whole library — its card and
 * two library signatures. Pixel and Techno each resolve to a single
 * palette today, so their stocks are that palette in three climates,
 * written and waiting like the rest.
 */
export const WORLD_STOCK = deepFreeze({
  marks: [
    { chapter: 'marks', ground: '#191008', ink: '#3a2a1a', boilFps: 6, finish: { grain: 0.15 } }, // ochre-wall
    { chapter: 'marks', ground: '#e7dcbf', ink: '#2b1d11', boilFps: 7, finish: { grain: 0.2 } }, // bone-dust
    { chapter: 'marks', ground: '#191008', ink: '#3a2a1a', boilFps: 6, finish: { grain: 0.3 } }, // ochre-wall, dry season
  ],
  engraving: [
    { chapter: 'engraving', ground: '#f0e8d0', ink: '#211d15', boilFps: 7, finish: { grain: 0.2 } }, // persona-haeckel
    { chapter: 'engraving', ground: '#efe3cb', ink: '#2a1d10', boilFps: 6, finish: { grain: 0.25 } }, // sepia-plate
    { chapter: 'engraving', ground: '#f2ecdd', ink: '#1a1a1a', boilFps: 8, finish: { grain: 0.15 } }, // lithograph
  ],
  organic: [
    { chapter: 'organic', ground: '#0a2239', ink: '#2e86ab', boilFps: 6, finish: { grain: 0.2 } }, // river-delta
    { chapter: 'organic', ground: '#f4f1ea', ink: '#5f0f40', boilFps: 7, finish: { grain: 0.3 } }, // petri-bloom
    { chapter: 'organic', ground: '#eef4f1', ink: '#264653', boilFps: 6, finish: { grain: 0.15 } }, // tidepool
  ],
  bauhaus: [
    { chapter: 'bauhaus', ground: '#1a0a00', ink: '#ef476f', boilFps: 8, finish: { grain: 0.1 } }, // solar-max
    { chapter: 'bauhaus', ground: '#f2f3f8', ink: '#da4a5b', boilFps: 9, finish: { grain: 0.1 } }, // vortex-rwb
    { chapter: 'bauhaus', ground: '#1a1410', ink: '#2a1a14', boilFps: 8, finish: { grain: 0.2 } }, // folktotem
  ],
  swiss: [
    { chapter: 'swiss', ground: '#f5f2ea', ink: '#111111', boilFps: 8, finish: { grain: 0.05 } }, // transit
    { chapter: 'swiss', ground: '#08080d', ink: '#0d2030', boilFps: 9, finish: { grain: 0.1 } }, // v01d
    { chapter: 'swiss', ground: '#191410', ink: '#22223b', boilFps: 10, finish: { grain: 0.1 } }, // strata
  ],
  'op-art': [
    { chapter: 'op-art', ground: '#0c1420', ink: '#003049', boilFps: 10, finish: { grain: 0.05 } }, // hydra
    { chapter: 'op-art', ground: '#0d0d0f', ink: '#4d4d4d', boilFps: 12, finish: { grain: 0.05 } }, // static-bloom
    { chapter: 'op-art', ground: '#0d0d0f', ink: '#3a3a3e', boilFps: 11, finish: { grain: 0.05 } }, // persona-mohr
  ],
  japan: [
    { chapter: 'japan', ground: '#efe3cb', ink: '#2a1d10', boilFps: 6, finish: { grain: 0.2 } }, // sepia-plate
    { chapter: 'japan', ground: '#dfe8ec', ink: '#0d2a44', boilFps: 7, finish: { grain: 0.15 } }, // cyanotype
    { chapter: 'japan', ground: '#0a2239', ink: '#2e86ab', boilFps: 6, finish: { grain: 0.25 } }, // river-delta
  ],
  memphis: [
    { chapter: 'memphis', ground: '#050505', ink: '#9b5de5', boilFps: 10, finish: { grain: 0.25 } }, // neon-brood
    { chapter: 'memphis', ground: '#f4f1ea', ink: '#5f0f40', boilFps: 9, finish: { grain: 0.3 } }, // petri-bloom
    { chapter: 'memphis', ground: '#050505', ink: '#1c1c1c', boilFps: 11, finish: { grain: 0.35 } }, // glitch
  ],
  pixel: [
    { chapter: 'pixel', ground: '#a27a84', ink: '#224655', boilFps: 12, finish: { grain: 0.1 } }, // kiln-columns
    { chapter: 'pixel', ground: '#a27a84', ink: '#224655', boilFps: 10, finish: { grain: 0.15 } }, // kiln-columns, slower clock
    { chapter: 'pixel', ground: '#a27a84', ink: '#224655', boilFps: 11, finish: { grain: 0.05 } }, // kiln-columns, cleaner plate
  ],
  grunge: [
    { chapter: 'grunge', ground: '#0d0a08', ink: '#3d2b1f', boilFps: 8, finish: { grain: 0.5 } }, // dirty
    { chapter: 'grunge', ground: '#f2ecdd', ink: '#1a1a1a', boilFps: 7, finish: { grain: 0.35 } }, // lithograph
    { chapter: 'grunge', ground: '#000000', ink: '#8338ec', boilFps: 9, finish: { grain: 0.45 } }, // dystopia
  ],
  techno: [
    { chapter: 'techno', ground: '#050505', ink: '#1c1c1c', boilFps: 12, finish: { grain: 0.3 } }, // glitch
    { chapter: 'techno', ground: '#050505', ink: '#1c1c1c', boilFps: 11, finish: { grain: 0.25 } }, // glitch, slower clock
    { chapter: 'techno', ground: '#050505', ink: '#1c1c1c', boilFps: 12, finish: { grain: 0.4 } }, // glitch, heavier scan
  ],
  now: [
    { chapter: 'now', ground: '#0a0a0a', ink: '#b400ff', boilFps: 8, finish: { grain: 0.2 } }, // praystation
    { chapter: 'now', ground: '#000000', ink: '#8338ec', boilFps: 10, finish: { grain: 0.3 } }, // dystopia
    { chapter: 'now', ground: '#08080d', ink: '#0d2030', boilFps: 9, finish: { grain: 0.25 } }, // v01d
  ],
});

/** FNV-1a over the chapter id — the dice table's hash (curator/dice.js), here the pick's whole seed. */
const chapterHash = (id) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/**
 * The world a chapter deals, on landing. The pick derives from the chapter
 * ALONE (chapter-memory ruling, 2026-11-13): a fixed seeded derivation —
 * the chapter id's hash over its stock — so the same chapter deals the
 * same world on every landing, in every session, with nothing extra
 * stored; the chapter's memory falls out of determinism. The pick does
 * NOT ride the landing's dieRng stream (the spec's §5 mechanism, refined
 * by that ruling), and a replayed landing re-derives the same world
 * because the chapter is the same. Hands back the record through the door
 * (a fresh copy, never the frozen stock entry), or null for a chapter
 * with no stock.
 */
export function worldForChapter(chapterId) {
  const stock = typeof chapterId === 'string' ? WORLD_STOCK[chapterId] : null;
  if (!stock || !stock.length) return null;
  return sanitizeWorld(stock[chapterHash(chapterId) % stock.length]);
}
