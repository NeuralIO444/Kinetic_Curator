/**
 * tintInject.mjs — INJECT color mode: the field dyes first, agents catch up (#625).
 *
 * FADE melts the whole picture (two-deck/item dissolve). INJECT stages the
 * change like a dye injection instead: on a palette change the field
 * (background) whooshes to the new palette on a fast envelope, and each
 * organism agent's tint then lerps to the new palette on its own seeded
 * delay — so the new color visibly propagates through the moving swarm
 * instead of arriving everywhere at once. (Agents = the behave.js steering
 * profiles: cruise/flock/orbit/scatter/mold — here, every resolved item.)
 *
 * Carrier: the same per-instance tint-lerp carrier as WASH (#624) — the live
 * GPU tint shader (shaders.mjs QUAD_FS, u_liveTint) lerps the per-instance
 * v_ink/v_accent we rewrite here every frame. The live atlas is keyed by
 * asset only (liveAtlas.mjs comboKey), so a palette change needs no rebake —
 * per-frame tint rewrites are just instance-attribute uploads. No extra
 * fullscreen pass, and color never touches item scale (no asset changes size,
 * ever).
 *
 * Schedule (fractions of the MIX duration, which the existing time slider owns):
 *   fieldP(t) = easeOutCubic(clamp01(t / FIELD_SPAN))          — the field's fast envelope
 *   delay_i   = LEAD + hash01(gi, seed ^ INJECT_SALT) * DELAY_SPAN
 *   p_i       = smootherstep(clamp01((t - delay_i) / ADOPT_SPAN))
 * The field completes its dye at FIELD_SPAN while the earliest agent is just
 * starting (LEAD < FIELD_SPAN, and the field is ~91% dyed when agent 0 wakes);
 * the seeded spread then carries the swarm's catch-up across the rest of the
 * mix. LEAD + DELAY_SPAN + ADOPT_SPAN === 1, so every adoption completes by
 * t=1 and the handoff to the plain new palette holds no frame.
 *
 * Same (item index, seed) replays the same propagation — deterministic,
 * rehearsable. A second palette change mid-inject re-bases from the currently
 * displayed colors (the DJ re-base, same as paletteMix and tintWash), so
 * rapid 1-4 taps converge instead of stacking.
 *
 * Color helpers (hash01, hex/lerp, smootherstep, paletteIdentity, colorMap)
 * mirror the #624 tintWash.mjs module, which is still an unmerged PR — this
 * module stays self-contained rather than depending on it. Reconcile the two
 * copies if/when both land on main.
 *
 * Pure logic, no GL: the live loop (liveLoop.mjs) and the render worker
 * (renderWorker.js) own the clock and call update() once per frame, then
 * applyInject() while an inject runs. Unit-tested in tintInject.selfcheck.mjs.
 */

/** Per-node jitter salt — a second seeded hash, like itemMorph's move pick. */
export const INJECT_SALT = 0x1e9c75;
/** Fraction of the mix the field's fast dye envelope takes to complete. */
export const INJECT_FIELD_SPAN = 0.18;
/** Fraction of the mix before the earliest agent starts adopting. */
export const INJECT_LEAD = 0.1;
/** Fraction of the mix the seeded per-agent delay spread covers. */
export const INJECT_DELAY_SPAN = 0.6;
/** Fraction of the mix each agent's own tint adoption takes. */
export const INJECT_ADOPT_SPAN = 0.3;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** xorshift-ish avalanche on (index, seed). Index-stable: same seed, same soak. */
export function hash01(i, seed) {
  let h = (Math.imul((i | 0) + 0x9e3779b9, 0x85ebca6b) ^ (seed | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

/** Smootherstep — so an agent's adoption never reads mechanical. */
export function smootherstep(t) {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Ease-out cubic — the field's fast envelope: arrives quickly, settles. */
export function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

/** The field's dye progress at mix fraction t: done by FIELD_SPAN. */
export function fieldProgress(t) {
  return easeOutCubic(t / INJECT_FIELD_SPAN);
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

/** Raw hex lerp at an already-eased t. Garbage degrades to the good side. */
export function lerpHexRaw(a, b, t) {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra) return typeof b === 'string' ? b : '#000000';
  if (!rb) return typeof a === 'string' ? a : '#000000';
  const e = clamp01(t);
  return rgbToHex([ra[0] + (rb[0] - ra[0]) * e, ra[1] + (rb[1] - ra[1]) * e, ra[2] + (rb[2] - ra[2]) * e]);
}

/**
 * Lerp two hex colors with a smootherstep ease. Garbage on either side
 * degrades to the other side — a bad swatch must never blank an item
 * mid-inject.
 */
export function lerpHex(a, b, t) {
  return lerpHexRaw(a, b, smootherstep(t));
}

/**
 * When (fraction of the mix) item `gi` starts adopting, from its seeded
 * delay. Same (gi, seed) → same delay, every time. The spread is pure seed —
 * the variety the issue's verification demands ("if the color 'arrives'
 * everywhere at once, the variety is broken").
 */
export function injectDelay(gi, seed) {
  return INJECT_LEAD + hash01(gi, (seed ^ INJECT_SALT) | 0) * INJECT_DELAY_SPAN;
}

/**
 * The per-item key for the color maps. Index-stable across the inject: a
 * palette change never reorders the resolved item arrays.
 */
export const injectKey = (layerId, index) => `${layerId}:${index}`;

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
      out.set(injectKey(layer.id, i), { color: it.color, accent: it.accent });
    }
  }
  return out;
}

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

export function createTintInject() {
  let seen = null; // palette identity string of the last update
  let active = null; // null | { startMs, durMs, seed }
  let fromColors = null; // Map<key,{color,accent}> — displayed colors at (re)start
  let fromBg = '#000000';
  let lastBg = '#000000'; // displayed bg last frame — the re-base source

  function update({ identity, mode, mixSeconds, now, seed, bg, lastResolved }) {
    const bgNow = typeof bg === 'string' ? bg : '#000000';
    if (!seen) {
      // First sighting: baseline, never inject. (Otherwise the very first
      // frame would dye the bg up from the lastBg default.)
      seen = identity;
      lastBg = bgNow;
      return { injecting: false, bg: bgNow };
    }
    const identityChanged = identity !== seen;

    if (mode !== 'INJECT') {
      // Leaving INJECT mid-soak: drop it. The resolver already hands the new
      // palette's colors to every item, so the next frame is the new picture.
      active = null;
      fromColors = null;
      seen = identity;
      lastBg = bgNow;
      return { injecting: false, bg: bgNow };
    }

    if (identityChanged) {
      // (Re)start from whatever was actually on screen last frame — the old
      // palette's colors, or mid-inject colors when taps come fast.
      fromColors = colorMap(lastResolved);
      fromBg = lastBg;
      seen = identity;
      // The MIX/time slider owns the duration: an inject never fires
      // instantly on its own — slider at 0 is the explicit hard cut.
      const durMs = Math.max(0, Number(mixSeconds) || 0) * 1000;
      if (durMs <= 0) {
        active = null;
        lastBg = bgNow;
        return { injecting: false, bg: bgNow };
      }
      active = { startMs: now, durMs, seed: (seed >>> 0) || 0 };
    }

    if (!active) {
      lastBg = bgNow;
      return { injecting: false, bg: bgNow };
    }

    const t = (now - active.startMs) / active.durMs;
    if (t >= 1) {
      active = null;
      lastBg = bgNow;
      return { injecting: false, bg: bgNow };
    }
    const out = {
      injecting: true,
      t: Math.max(0, t),
      seed: active.seed,
      fromColors,
      // The field dyes FIRST, on the fast envelope — the obvious face of the
      // change while the agents catch up underneath.
      bg: lerpHexRaw(fromBg, bgNow, fieldProgress(Math.max(0, t))),
    };
    lastBg = out.bg;
    return out;
  }

  return { update, colorMap };
}

/**
 * Rewrite per-instance tints for one inject frame. Mutates the resolved items
 * in place — they are per-frame temporaries from the resolver, safe to touch.
 * Only color/accent are rewritten: position/scale are never touched, so no
 * asset can change size. Items with no captured "from" color (joined
 * mid-inject) already carry the new palette and are left alone.
 */
export function applyInject(resolved, ev) {
  const { t, seed, fromColors } = ev;
  if (!fromColors || !Array.isArray(resolved)) return;
  let gi = 0;
  for (const layer of resolved) {
    if (!layer || layer.isFx || !Array.isArray(layer.items)) continue;
    const items = layer.items;
    for (let i = 0; i < items.length; i++, gi++) {
      const it = items[i];
      const from = fromColors.get(injectKey(layer.id, i));
      if (!from) continue;
      const p = (t - injectDelay(gi, seed)) / INJECT_ADOPT_SPAN;
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
