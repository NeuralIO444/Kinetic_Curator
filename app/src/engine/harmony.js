// Colour harmony (#56) — pure maths, no React, no store.
// Generates swatch sets that hold together, from a base colour plus a
// classical scheme. Slots the operator has locked are never touched.

/** '#rrggbb' → {h:0-360, s:0-1, l:0-1}. Assumes normalized hex. */
export function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export function hslToHex({ h, s, l }) {
  const hh = ((h % 360) + 360) % 360 / 360;
  const ss = Math.min(1, Math.max(0, s));
  const ll = Math.min(1, Math.max(0, l));
  let r, g, b;
  if (ss === 0) {
    r = g = b = ll;
  } else {
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    const seg = (t) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    r = seg(hh + 1 / 3); g = seg(hh); b = seg(hh - 1 / 3);
  }
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Hue offsets, in degrees, from the base colour. */
export const HARMONY_SCHEMES = {
  analogous: [0, 30, -30, 60, -60, 15, -15, 45],
  complementary: [0, 180, 20, 200, -20, 160, 40, 220],
  triadic: [0, 120, 240, 20, 140, 260, -20, 100],
  split: [0, 150, 210, 30, 180, 330, 15, 195],
  tetradic: [0, 90, 180, 270, 45, 135, 225, 315],
  monochrome: [0, 0, 0, 0, 0, 0, 0, 0],
};

export const SCHEME_IDS = Object.keys(HARMONY_SCHEMES);

/**
 * Build `count` swatches around `baseHex`.
 * Lightness and saturation fan out across slots so a scheme with few
 * distinct hues (monochrome especially) still yields a usable range.
 *
 * @param {string} baseHex   normalized '#rrggbb'
 * @param {string} scheme    key of HARMONY_SCHEMES
 * @param {number} count     how many swatches
 * @param {() => number} rng 0..1, for the variation that isn't structural
 */
export function buildHarmony(baseHex, scheme, count = 8, rng = Math.random) {
  const offsets = HARMONY_SCHEMES[scheme] || HARMONY_SCHEMES.analogous;
  const base = hexToHsl(baseHex);
  // A near-greyscale base gives every slot the same hue; lift it so the
  // scheme is still visible instead of silently collapsing to grey.
  const s0 = base.s < 0.15 ? 0.55 : base.s;
  const out = [];
  for (let i = 0; i < count; i++) {
    const h = base.h + offsets[i % offsets.length];
    const span = count > 1 ? i / (count - 1) : 0;
    // walk lightness 0.30 → 0.72 across the set, jitter saturation a little
    const l = 0.30 + span * 0.42 + (rng() - 0.5) * 0.06;
    const s = Math.min(1, Math.max(0.15, s0 + (rng() - 0.5) * 0.25));
    out.push(hslToHex({ h, s, l }));
  }
  return out;
}

/**
 * Apply a generated set over the current swatches, preserving locked slots.
 * @param {string[]} current
 * @param {boolean[]|object} locks  truthy at index i = keep current[i]
 */
export function applyWithLocks(current, generated, locks) {
  const isLocked = (i) => (Array.isArray(locks) ? !!locks[i] : !!(locks && locks[i]));
  return current.map((c, i) => (isLocked(i) ? c : (generated[i] ?? c)));
}
