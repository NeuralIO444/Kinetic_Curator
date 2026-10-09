// patternRoll.js — what KINETIC and CURATOR do to PATTERN tracks (#1042 follow-up, Matt 2026-10-07).
//
// PATTERN is part of the KIN and CURATOR systems once the artist has added one (patterns on request: KIN never adds the first):
//   chaos   (hammered KIN)   every PATTERN track is dealt fresh (seed, mode, density, mix, hero, grout, drift), and
//                            KIN never adds a PATTERN track itself (CHAOS_ADD_CHANCE is 0); the artist adds the first
//   rules   (calm KIN tap)   a new tessellation of the same kind: new seed, density nudged a step
//   weather (warm KIN tap)   same picture, the air changes: DRIFT and MIX nudged
//   curate  (CURATOR)        every PATTERN track is dealt, on the Curator's own seeded stream: a given (seed, offsets,
//                            press #) deals the same patterns again. The taste engine scores layout params, not
//                            patterns, so the deal is seeded dice, said plainly.
// Pure: it takes an rng (a () => [0,1) function) and returns the new layer list; the caller owns the undo entry.
import { PATTERN_MODES, PATTERN_DENSITY_MIN, PATTERN_DENSITY_MAX, sanitizePattern } from '../state/patternTrack.js';
import { QUILT_MAX_GROUT } from './engine.js';
import { isFxLayer } from '../fx/fxFilters.js';
import { isMathLayer } from '../fx/mathFilters.js';
import { MAX_CONTENT_TRACKS } from '../state/projectNormalize.js';

// Matt 2026-10-08: a tessellation laid over the marks reads as a flat 2D overlay (the 1995 layer-mix look), and KIN was
// dealing one 30% of the time on a hammered tap. It is rare now (8%), and a quiet veil when it does come. CURATOR never
// adds one (only chaos does). Making patterns and marks interact instead of mix is its own piece of work.
export const CHAOS_ADD_CHANCE = 0; // Matt, 2026-10-08: patterns on request. KIN never adds one; once the artist has added one, KIN and CURATOR work with it
/** A pattern a roll adds is a whisper, not a wall: it must never carry the picture. */
export const BORN_OPACITY = 0.3;

const isPattern = (l) => !!l && l.type === 'pattern';
const u32 = (rng) => (Math.floor(rng() * 0xffffffff) >>> 0) || 1;
const between = (rng, lo, hi) => lo + (hi - lo) * rng();
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** A freshly dealt block. DROP is a performance setting, so a deal keeps it. About half the deals are still. */
export function dealPattern(prev, rng) {
  const p = sanitizePattern(prev);
  const mode = PATTERN_MODES[Math.floor(rng() * PATTERN_MODES.length)];
  return sanitizePattern({
    ...p,
    mode,
    seed: u32(rng),
    density: Math.round(between(rng, PATTERN_DENSITY_MIN, PATTERN_DENSITY_MAX)),
    mix: between(rng, 0.2, 1),
    hero: rng(),
    grout: between(rng, 0, QUILT_MAX_GROUT),
    drift: rng() < 0.5 ? 0 : between(rng, 0.15, 0.9),
    kin: 'MIX', // #1137: a dealt pattern has a few moving accents once DRIFT is up
    movers: between(rng, 0.15, 0.45),
  });
}

/** RULES tap: a new tessellation of the same kind, density one step either way. */
export function reseedPattern(prev, rng) {
  const p = sanitizePattern(prev);
  const step = rng() < 0.5 ? -1 : 1;
  return sanitizePattern({ ...p, seed: u32(rng), density: clamp(p.density + step, PATTERN_DENSITY_MIN, PATTERN_DENSITY_MAX) });
}

/** WEATHER tap: the same picture, the air moves. A still pattern stays still (the performer chose that). */
export function weatherPattern(prev, rng) {
  const p = sanitizePattern(prev);
  const d = (rng() - 0.5) * 0.4;
  return sanitizePattern({ ...p, mix: clamp(p.mix + d, 0, 1), drift: p.drift > 0 ? clamp(p.drift + (rng() - 0.5) * 0.4, 0.05, 1) : 0 });
}

const BY_KIND = { chaos: dealPattern, curate: dealPattern, rules: reseedPattern, weather: weatherPattern };

/**
 * Apply a roll of `kind` to a layer list. Returns { layers, changed }. `canAdd` is the caller's pre-flight (tape not
 * full) and only matters for chaos; the track cap is checked here. `makeId` names an added track from the roll.
 */
export function rollPatternLayers(layers, kind, rng, { canAdd = true, makeId = () => 'pt-roll', addChance = CHAOS_ADD_CHANCE } = {}) {
  const fn = BY_KIND[kind];
  if (!fn || !Array.isArray(layers)) return { layers, changed: false };
  let changed = false;
  let out = layers.map((l) => {
    if (!isPattern(l)) return l;
    changed = true;
    return { ...l, pattern: fn(l.pattern, rng) };
  });
  if (kind === 'chaos' && canAdd && !out.some(isPattern)) {
    const content = out.filter((l) => !isFxLayer(l) && !isMathLayer(l)).length;
    // draw the dice unconditionally, so the rest of the stream does not depend on the cap
    const roll = rng(); const born = dealPattern(undefined, rng); const id = makeId();
    if (roll < addChance && content < MAX_CONTENT_TRACKS) {
      out = [...out, { id, name: `PT-${out.filter(isPattern).length + 1}`, type: 'pattern', visible: true, layerBlendMode: 'normal', layerOpacity: BORN_OPACITY, pattern: born }];
      changed = true;
    }
  }
  return { layers: out, changed };
}
