/**
 * tintWash.mjs — WASH color mode: per-instance tint adoption (#624).
 *
 * FADE melts the whole picture (two-deck dissolve). WASH soaks color through
 * the marks instead: on a palette change each item adopts the new ink/accent
 * on its own schedule — a center-out wavefront ordered by distance from the
 * canvas middle, with per-node seeded jitter on the adoption time. The eye
 * chases the dye front while the bulk of items adopt underneath it, which is
 * what defeats change detection (change smeared across time and space).
 *
 * Carrier: the live GPU tint shader (shaders.mjs QUAD_FS, u_liveTint) lerps
 * the per-instance v_ink/v_accent we rewrite here every frame. The live
 * atlas is keyed by asset only (liveAtlas.mjs comboKey), so a palette change
 * needs no rebake — per-frame tint rewrites are just instance-attribute
 * uploads. No extra fullscreen pass.
 *
 * Schedule (fractions of the MIX duration, which the existing slider owns):
 *   delay_i = waveRank_i * WAVE_SPAN + jitter_i * JITTER_SPAN
 *   p_i     = smootherstep(clamp01((t - delay_i) / ADOPT_SPAN))
 * The wavefront sweeps center-out over WAVE_SPAN of the wash; each item takes
 * ADOPT_SPAN to fully adopt. WAVE_SPAN + JITTER_SPAN + ADOPT_SPAN === 1, so
 * every adoption completes by t=1 and the handoff to the plain new palette
 * holds no frame.
 *
 * Same (item index, seed) replays the same soak — deterministic, rehearsable.
 * A second palette change mid-wash re-bases from the currently displayed
 * colors (the DJ re-base, same as paletteMix), so rapid 1-4 taps converge
 * instead of stacking.
 *
 * Pure logic, no GL: the live loop (liveLoop.mjs) owns the clock and calls
 * update() once per frame, then applyWash() while a wash runs. Unit-tested
 * in tintWash.selfcheck.mjs.
 */

/** Per-node jitter salt — a second seeded hash, like itemMorph's move pick. */
export const WASH_SALT = 0x9a5eed;
/** Fraction of the wash the center-out wavefront takes to sweep. */
export const WASH_WAVE_SPAN = 0.55;
/** Fraction of the wash given to per-node jitter. */
export const WASH_JITTER_SPAN = 0.25;
/** Fraction of the wash each item's own adoption takes. */
export const WASH_ADOPT_SPAN = 0.2;

// Canvas geometry for the center-out wavefront (scene units, 1000x700).
const CX = 500;
const CY = 350;
const MAXD = Math.hypot(CX, CY);

/** xorshift-ish avalanche on (index, seed). Index-stable: same seed, same soak. */
export function hash01(i, seed) {
  let h = (Math.imul((i | 0) + 0x9e3779b9, 0x85ebca6b) ^ (seed | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Smootherstep — the dissolve's easing, so the soak never reads mechanical. */
export function smootherstep(t) {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Parse '#rgb' / '#rrggbb' (with or without '#') to [r,g,b] 0..255, else null. */
export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** [r,g,b] 0..255 to '#rrggbb'. */
export function rgbToHex([r, g, b]) {
  const q = (v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');
  return `#${q(r)}${q(g)}${q(b)}`;
}

/**
 * Lerp two hex colors. Garbage on either side degrades to the other side —
 * a bad swatch must never blank an item mid-wash.
 */
export function lerpHex(a, b, t) {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra) return typeof b === 'string' ? b : '#000000';
  if (!rb) return typeof a === 'string' ? a : '#000000';
  const e = smootherstep(t);
  return rgbToHex([ra[0] + (rb[0] - ra[0]) * e, ra[1] + (rb[1] - ra[1]) * e, ra[2] + (rb[2] - ra[2]) * e]);
}

/**
 * Center-out wavefront rank in [0,1]: 0 at the canvas middle (adopts first),
 * 1 at the corners (adopts last). Non-finite positions rank mid-field.
 */
export function waveRank(x, y) {
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return 0.5;
  return clamp01(Math.hypot(nx - CX, ny - CY) / MAXD);
}

/**
 * When (fraction of the wash) item `gi` starts adopting, from its wavefront
 * rank and its seeded jitter. Same (gi, seed) → same delay, every time.
 */
export function adoptionDelay(gi, seed, rank) {
  return rank * WASH_WAVE_SPAN + hash01(gi, (seed ^ WASH_SALT) | 0) * WASH_JITTER_SPAN;
}

/**
 * The per-item key for the color maps. Index-stable across the wash: a
 * palette change never reorders the resolved item arrays.
 */
export const washKey = (layerId, index) => `${layerId}:${index}`;

/**
 * Snapshot item colors from a resolveLayers() result: Map<key, {color, accent}>.
 * FX layers carry no items.
 */
export function colorMap(resolved) {
  const out = new Map();
  if (!Array.isArray(resolved)) return out;
  for (const layer of resolved) {
    if (!layer || layer.isFx || !Array.isArray(layer.items)) continue;
    const items = layer.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      out.set(washKey(layer.id, i), { color: it.color, accent: it.accent });
    }
  }
  return out;
}

/**
 * Create the wash state machine.
 *
 * update() detects palette identity changes (same identity paletteMix uses:
 * Watches the palette identity (a content-based string: palette id, overrides,
 * userPalettes — content-based because the worker's postMessage structured
 * clone hands us fresh array references every UPDATE_STATE) and runs the
 * adoption clock on the loop's own time (loopTimeMs, so pause/hold freezes
 * the soak with everything else).
 *
 * Returns:
 * - { washing: false, bg }                        — idle; render normally.
 * - { washing: true, t, seed, fromColors, bg }    — wash running; the caller
 *   must run applyWash(resolved, ev) this frame and use ev.bg for the field.
 */

/**
 * A stable string for the palette identity. Reference equality breaks
 * across the worker's postMessage structured clone (fresh arrays every
 * UPDATE_STATE), so the identity must be content-based.
 */
export function paletteIdentity(id, overrides, userPalettes) {
  try {
    return JSON.stringify([id, overrides || null, userPalettes || []]);
  } catch {
    return String(id);
  }
}

export function createTintWash() {
  let seen = null; // palette identity string of the last update
  let active = null; // null | { startMs, durMs, seed }
  let fromColors = null; // Map<key,{color,accent}> — displayed colors at (re)start
  let fromBg = '#000000';
  let lastBg = '#000000'; // displayed bg last frame — the re-base source

  function update({ identity, mode, mixSeconds, now, seed, bg, lastResolved }) {
    const bgNow = typeof bg === 'string' ? bg : '#000000';
    if (!seen) {
      // First sighting: baseline, never wash. (Otherwise the very first
      // frame would soak the bg up from the lastBg default.)
      seen = identity;
      lastBg = bgNow;
      return { washing: false, bg: bgNow };
    }
    const identityChanged = identity !== seen;

    if (mode !== 'WASH') {
      // Leaving WASH mid-soak: drop it. The resolver already hands the new
      // palette's colors to every item, so the next frame is the new picture.
      active = null;
      fromColors = null;
      seen = identity;
      lastBg = bgNow;
      return { washing: false, bg: bgNow };
    }

    if (identityChanged) {
      // (Re)start from whatever was actually on screen last frame — the old
      // palette's colors, or mid-soak colors when taps come fast.
      fromColors = colorMap(lastResolved);
      fromBg = lastBg;
      seen = identity;
      const durMs = Math.max(0, Number(mixSeconds) || 0) * 1000;
      if (durMs <= 0) {
        // MIX 0 means instant, same as everywhere else: hard cut, no soak.
        active = null;
        lastBg = bgNow;
        return { washing: false, bg: bgNow };
      }
      active = { startMs: now, durMs, seed: (seed >>> 0) || 0 };
    }

    if (!active) {
      lastBg = bgNow;
      return { washing: false, bg: bgNow };
    }

    const t = (now - active.startMs) / active.durMs;
    if (t >= 1) {
      active = null;
      lastBg = bgNow;
      return { washing: false, bg: bgNow };
    }
    const out = {
      washing: true,
      t: Math.max(0, t),
      seed: active.seed,
      fromColors,
      bg: lerpHex(fromBg, bgNow, t),
    };
    lastBg = out.bg;
    return out;
  }

  return { update, colorMap };
}

/**
 * Rewrite per-instance tints for one wash frame. Mutates the resolved items
 * in place — they are per-frame temporaries from the resolver, safe to touch.
 * Items with no captured "from" color (joined mid-wash) already carry the new
 * palette and are left alone.
 */
export function applyWash(resolved, ev) {
  const { t, seed, fromColors } = ev;
  if (!fromColors || !Array.isArray(resolved)) return;
  let gi = 0;
  for (const layer of resolved) {
    if (!layer || layer.isFx || !Array.isArray(layer.items)) continue;
    const items = layer.items;
    for (let i = 0; i < items.length; i++, gi++) {
      const it = items[i];
      const from = fromColors.get(washKey(layer.id, i));
      if (!from) continue;
      const delay = adoptionDelay(gi, seed, waveRank(it.x, it.y));
      const p = (t - delay) / WASH_ADOPT_SPAN;
      if (p <= 0) {
        it.color = from.color;
        it.accent = from.accent;
      } else if (p < 1) {
        it.color = lerpHex(from.color, it.color, p);
        it.accent = lerpHex(from.accent, it.accent, p);
      }
      // p >= 1: fully adopted — the resolver's new-palette colors stand.
    }
  }
}
