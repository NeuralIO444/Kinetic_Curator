// world.js — #2104 (Canon) the world record: the ground, ink, boil clock and
// finish that every style on the stage stands in. Step 1 of the build order
// in docs/design/canon-world-record-spec.md: the record and its door. The
// landing deal, the recording and the style response are later steps.
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
// Browser-safe, pure. In this step the record stands in the store as the
// standing default and the door below is its one validator; nothing reads
// the record to render yet.

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
