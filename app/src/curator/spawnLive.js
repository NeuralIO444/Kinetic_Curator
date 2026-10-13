// curator/spawnLive.js — #1355: the live side of AUTO SPAWN. A module singleton fed by the resolver frame tap.
//
// Steady homes: a home is kept exactly where it was chosen until the DISH changes (a new seed, offsets, canvas size, or
// a lower count), so a creature never wanders off its spot. While fewer homes stand than the artist asked for, it looks
// again every RETRY_FRAMES for a spot that qualifies. A home whose creature has not formed within PATIENCE_FRAMES
// (the crowd moved away) is given up and chosen again. Every window is a count of frames, never a clock.
import { chooseHomes, marksOf, sanitizeCount } from './spawn.js';
import { fertilityField } from './formation.js';

export const RETRY_FRAMES = 30;
export const PATIENCE_FRAMES = 180;

let homes = []; // [{ x, y, age }]
let key = '';
let sinceTry = RETRY_FRAMES;
let field = null;
let fieldKey = '';

const same = (a, b) => a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);

/** The standing homes, [{x, y}]. */
export function getSpawnHomes() {
  return homes.map(({ x, y }) => ({ x, y }));
}

/** Start over (a fresh document, tests). */
export function resetSpawn() {
  homes = []; key = ''; sinceTry = RETRY_FRAMES; field = null; fieldKey = '';
}

/**
 * One resolved frame. `count` is the artist's number; `formed` the formation tracker's per-pin flags in the order of
 * the pins this frame's input carried (the homes we last published); `band` the stress band.
 * Returns the new homes [{x, y}] when they changed, else null.
 */
export function observeSpawn(input, output, { count = 0, formed = [], band = null } = {}) {
  const want = sanitizeCount(count);
  const W = input && input.canvasW; const H = input && input.canvasH;
  const k = `${(input && input.seed) >>> 0}|${JSON.stringify((input && input.seedOffsets) ?? null)}|${W}x${H}`;
  const before = getSpawnHomes();
  if (k !== key) { key = k; homes = []; field = null; sinceTry = RETRY_FRAMES; } // a new dish: start again
  if (homes.length > want) homes = homes.slice(0, want);
  for (let i = 0; i < homes.length; i++) {
    homes[i].age += 1;
    if (!formed[i] && homes[i].age >= PATIENCE_FRAMES) { homes.splice(i, 1); i--; sinceTry = RETRY_FRAMES; }
  }
  if (homes.length < want) {
    sinceTry += 1;
    if (sinceTry >= RETRY_FRAMES) {
      sinceTry = 0;
      if (!field || fieldKey !== k) { field = fertilityField(input.seed, input.seedOffsets, W, H).at; fieldKey = k; }
      const next = chooseHomes({ count: want, existing: homes, marks: marksOf(output), field, band, canvasW: W, canvasH: H });
      for (let i = homes.length; i < next.length; i++) homes.push({ x: next[i].x, y: next[i].y, age: 0 });
    }
  }
  const after = getSpawnHomes();
  return same(before, after) ? null : after;
}
