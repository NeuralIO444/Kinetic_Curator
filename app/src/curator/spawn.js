// curator/spawn.js — #1355: AUTO SPAWN. The artist sets how many creatures (0 to 4, the TE four) in the DIRECTORS
// panel and each one finds its own home; there is no pin to place (Matt, 2026-10-13, option A).
//
// A home is a spot in the MIDDLE REGION of the dish (the central 60%) where a creature can live, by the formation
// rule's own two conditions: the dish's hidden fertility is above the band's bar AND enough marks crowd around it.
// Among the spots that qualify the one nearest the centre wins, and each further creature takes the next nearest that
// is not too close to one already placed. Fewer qualifying spots than creatures means fewer creatures: it never puts
// one where it could not live.
//
// The picker is a pure function of the dish (the marks the resolver placed, the seed's fertility field, the band);
// spawnLive.js keeps the homes steady between frames. No clock, no chance.
import { DISH_RADIUS, DISH_SATURATE } from './dishPressure.js';
import { thresholdsFor } from './formation.js';
import { MAX_PINS } from './dishPins.js';

/** The middle region, as fractions of the canvas: the central 60%. */
export const SPAWN_REGION = Object.freeze({ x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 });
/** The most creatures: the TE four. */
export const MAX_CREATURES = MAX_PINS;
/** Candidate spacing, as a fraction of the canvas's shorter side. */
export const SPAWN_STEP = 0.03;
/** Two homes are at least this far apart, as a fraction of the shorter side: about one moth's width, so they sit side by side. */
export const SPAWN_GAP = 0.32;
/** A spot must clear the rule's bars by this much, so it forms rather than sits on the line. */
export const SPAWN_MARGIN = 0.02;
/**
 * The search, widening only as far as it has to (Matt, 2026-10-13: asked for four, got three). The middle region and the
 * full spacing first; if that finds fewer than asked, the spacing closes up a little, then the region opens outward,
 * then the whole dish. The two conditions a creature needs to FORM (fertility above the bar, a crowd around it) are
 * never relaxed: a home where it could not form would only sit there.
 */
export const SPAWN_STAGES = Object.freeze([
  Object.freeze({ region: SPAWN_REGION, gap: 1 }),
  Object.freeze({ region: SPAWN_REGION, gap: 0.75 }),
  Object.freeze({ region: Object.freeze({ x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 }), gap: 0.75 }),
  Object.freeze({ region: Object.freeze({ x0: 0.04, y0: 0.04, x1: 0.96, y1: 0.96 }), gap: 0.6 }),
]);

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** The whole-number count the dish asks for, 0..MAX_CREATURES. */
export function sanitizeCount(n) {
  return Number.isFinite(n) ? Math.min(MAX_CREATURES, Math.max(0, Math.round(n))) : 0;
}

/** Every mark's centre from the resolver's output (creatures' own marks are not the crowd that forms them). */
export function marksOf(entries) {
  const out = [];
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    const items = e && e.items;
    if (!Array.isArray(items)) continue;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it && !it._creature && Number.isFinite(it.x) && Number.isFinite(it.y)) out.push(it.x, it.y);
    }
  }
  return out;
}

/**
 * Choose homes.
 * @param count     how many creatures are wanted (0..4)
 * @param existing  homes already standing [{x, y}], kept exactly; only the missing ones are chosen
 * @param marks     flat [x0, y0, x1, y1, …] of the placed marks (marksOf)
 * @param field     (x, y) => fertility 0..1 (formation.js fertilityField().at)
 * @param band      the stress band (null reads as NORMAL)
 * @returns [{x, y}] the homes, existing first, at most `count`
 */
export function chooseHomes({ count, existing = [], marks = [], field, band = null, canvasW = 1000, canvasH = 700 }) {
  const want = sanitizeCount(count);
  const homes = existing.slice(0, want).map((p) => ({ x: p.x, y: p.y }));
  if (homes.length >= want || typeof field !== 'function') return homes;
  const W = canvasW > 0 ? canvasW : 1000;
  const H = canvasH > 0 ? canvasH : 700;
  const short = Math.min(W, H);
  const bars = thresholdsFor(band);
  const needFertility = bars.attraction + SPAWN_MARGIN;
  const needMarks = Math.ceil((bars.density + SPAWN_MARGIN) * DISH_SATURATE);
  const r2 = (DISH_RADIUS * short) ** 2;
  const step = Math.max(2, SPAWN_STEP * short);
  const cx = W / 2; const cy = H / 2;
  // a spot qualifies once per call however many stages look at it
  const memo = new Map();
  const qualifies = (x, y) => {
    const k = `${x}|${y}`;
    let v = memo.get(k);
    if (v === undefined) {
      v = false;
      if (clamp01(field(x, y)) > needFertility) {
        let n = 0;
        for (let m = 0; m < marks.length; m += 2) {
          const dx = marks[m] - x; const dy = marks[m + 1] - y;
          if (dx * dx + dy * dy <= r2 && ++n >= needMarks) break;
        }
        v = n >= needMarks;
      }
      memo.set(k, v);
    }
    return v;
  };
  for (const stage of SPAWN_STAGES) {
    if (homes.length >= want) break;
    const gap2 = (SPAWN_GAP * stage.gap * short) ** 2;
    const R = stage.region;
    const cands = [];
    for (let y = R.y0 * H; y <= R.y1 * H + 1e-9; y += step) {
      for (let x = R.x0 * W; x <= R.x1 * W + 1e-9; x += step) {
        if (qualifies(x, y)) cands.push({ x, y, d: (x - cx) ** 2 + (y - cy) ** 2 });
      }
    }
    cands.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x); // nearest the centre first; ties in reading order
    for (const c of cands) {
      if (homes.length >= want) break;
      if (homes.every((h) => (h.x - c.x) ** 2 + (h.y - c.y) ** 2 >= gap2)) homes.push({ x: c.x, y: c.y });
    }
  }
  return homes;
}
