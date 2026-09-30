// light.js — #594 the CHIAROSCURO sun. Scene-level, and exactly ONE.
//
// ONE sun, never three-point. There is no light array and no per-layer light
// on purpose: the rule holds because the data cannot express a second light.
// Want a rim or fill? Propose it on #594 first — do not add a second field.
//
// Browser-safe, pure. Shared by the store (setLight), the project document
// (parse/serialize), and the scene contract (the GL quad shader's uniforms).
// `null` means off, and off is byte-identical everywhere: the project omits
// the key, the contract omits the key, the shader multiplies by exactly 1.0.

export const LIGHT_SLOTS = Object.freeze(['white', 'ink',
  'swatch0', 'swatch1', 'swatch2', 'swatch3', 'swatch4', 'swatch5', 'swatch6', 'swatch7']);

/** A fresh sun: upper-left, low enough to rake, warm white. */
export const LIGHT_DEFAULT = Object.freeze({
  x: 220, y: 140, height: 260, intensity: 0.8, ambient: 0.35, slot: 'white',
  bevel: 0.6, spec: 0.3, // #594 PR2: bevel 0 = the flat per-instance light of PR1
});

const RANGES = {
  x: [-500, 1500], // the sun may sit off-canvas: a low sun from outside the frame
  y: [-500, 1200],
  height: [20, 1000],
  intensity: [0, 1],
  ambient: [0, 1],
  bevel: [0, 1],
  spec: [0, 1],
};

const clamp = (v, [lo, hi], def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};

/**
 * Normalize a raw light. Returns null (off) for anything that is not an
 * object — fail-closed, like every other document field. Missing numbers
 * take the defaults; an unknown slot falls back to white.
 */
export function sanitizeLight(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const k of Object.keys(RANGES)) out[k] = clamp(raw[k], RANGES[k], LIGHT_DEFAULT[k]);
  out.slot = LIGHT_SLOTS.includes(raw.slot) ? raw.slot : 'white';
  return out;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The sun's colour from a palette slot — always harmonious, never a free hex. */
export function lightColor(slot, palette) {
  if (slot === 'ink') return hexToRgb(palette?.ink);
  const m = /^swatch(\d)$/.exec(slot || '');
  if (m) {
    const sw = palette?.swatches?.[Number(m[1])];
    return sw ? hexToRgb(sw) : [1, 1, 1];
  }
  return [1, 1, 1];
}

/**
 * The scene contract's form: numbers + a resolved colour, or null when off.
 * The contract omits its `light` key when this is null (hash stability).
 */
export function contractLight(raw, palette) {
  const l = sanitizeLight(raw);
  if (!l) return null;
  return {
    x: l.x, y: l.y, height: l.height,
    intensity: l.intensity, ambient: l.ambient,
    bevel: l.bevel, spec: l.spec,
    color: lightColor(l.slot, palette),
  };
}
