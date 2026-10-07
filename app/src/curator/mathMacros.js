// mathMacros.js — assignable macro knobs over fine-grain sliders (#724).
//
// "Math" = secondary broad adjustment over the fine-grain sliders: one big
// knob drives many sliders at once (scale-all, shift-all, spread-everything).
// The performer assigns sliders to a named macro via learn-mode ("touch the
// thing to assign the thing" — the same interaction language as #617 MIDI
// learn, but mouse/touch, no hardware).
//
// The drive model is a RELATIVE jog, deliberately: the knob is a spring-back
// handle, not an absolute position. Turning it applies a delta to every
// assigned target proportional to that param's own range; releasing the knob
// leaves the sliders exactly where they landed. The macro can never snap a
// slider or fight a manual tweak — it is secondary, never a replacement.
// Per-target invert gives the "spread-everything" gesture.
//
// Pure module: no DOM, no store. The slice (state/slices/mathMacrosSlice.js)
// owns the live state; the project doc persists the setups (like #617's
// midiMap); the learn hook lives in AppContext's SET_LAYOUT_PARAM funnel.

import { PARAM_SPEC, RANGE_SPEC, ATLAS_AFFECTING_PARAMS } from '../data/layout-modes.js';

/** Max macro knobs on the MATH shelf. A performance surface, not a spreadsheet. */
export const MATH_MAX_MACROS = 4;
/** Max assigned sliders per macro. */
export const MATH_MAX_TARGETS = 24;
/** Max name length — the knob face is small. */
export const MATH_MAX_NAME = 24;

// Keys with no slider on any panel (spec exists as the trust boundary, #107)
// and the atlas-affecting counts (a macro sweeping COUNT would rebake the
// atlas every frame — the sliders stay human-paced).
const EXCLUDED_KEYS = new Set([
  ...ATLAS_AFFECTING_PARAMS, // count, particleCount, lsysDepth, body
  'collideMask', 'contactRadius', 'contactRestitution', 'contactRepel',
  // #1042 — PATTERN reseeds. A macro must never sweep the seed every frame; SHUFFLE is a trigger, not a scalar.
  'shuffle', 'seed',
]);

const LABELS = {
  jitter: 'JITTER', density: 'DENSITY', zTiers: 'Z TIERS', hueRotate: 'HUE ROTATE',
  phylloDivergence: 'DIVERGENCE', lsysAngle: 'L-ANGLE', growthRate: 'GROWTH RATE',
  growthBranch: 'BRANCHING', noiseFreq: 'NOISE FREQ', noiseSpeed: 'NOISE SPEED',
  brushSize: 'BRUSH SIZE', brushSpacing: 'BRUSH SPACING', fieldScale: 'FIELD SCALE',
  trailCount: 'TRAILS', wobbleAmp: 'WOBBLE AMP', wobbleFreq: 'WOBBLE FREQ',
  displacement: 'DISPLACE', swarmCohesion: 'COHESION', gravityWells: 'GRAVITY',
  damping: 'DAMPING', flap: 'FLAP', squash: 'SQUASH', crooked: 'CROOKED',
  open: 'OPEN', kinemeRate: 'KINEME RATE', kinemeBreath: 'KINEME BREATH',
  kinemeDrift: 'KINEME DRIFT', kinemePulse: 'KINEME PULSE',
  kinemeBrushWobble: 'BRUSH WOBBLE', kinemeBoilFps: 'BOIL FPS', tight: 'TIGHT',
  wind: 'WIND', behaveSep: 'SEP', behaveAli: 'ALI', behaveCoh: 'COH',
  behaveSepR: 'SEP R', behaveAliR: 'ALI R', behaveCohR: 'COH R',
  behaveWind: 'B WIND', behaveOrbit: 'ORBIT', behaveAttract: 'ATTRACT',
  metabolism: 'METABOLISM', breath: 'BREATH', graze: 'GRAZE',
  accumulationFade: 'ACCUM FADE', leaveFade: 'LEAVE FADE', tunnelFade: 'TUNNEL FADE',
  prismFade: 'PRISM FADE', flowFade: 'FLOW FADE', echoes: 'ECHOES',
  accumulationOptics: 'OPTICS', accumulationTunnel: 'TUNNEL',
  accumulationPrism: 'PRISM', accumulationFlow: 'FLOW', accumulationWetness: 'WETNESS',
  audioModDepth: 'MOD DEPTH', audioScaleMod: 'SCALE MOD', audioAlphaMod: 'ALPHA MOD',
  audioAttackMs: 'ATTACK', audioDecayMs: 'DECAY', audioSwell: 'SWELL',
  lifeDrift: 'LIFE DRIFT', parallax: 'PARALLAX',
  scale: 'SCALE', rotate: 'ROTATE', alpha: 'ALPHA',
};

function fallbackLabel(key) {
  return String(key).replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

/**
 * The learnable target registry: every continuous numeric param with a
 * slider, minus the excluded keys. { key, label, min, max, isRange, int }.
 * Frozen — the registry is a contract, not state.
 */
export const LEARNABLE_TARGETS = (() => {
  const out = [];
  for (const [key, spec] of Object.entries(PARAM_SPEC)) {
    if (EXCLUDED_KEYS.has(key)) continue;
    out.push(Object.freeze({
      key,
      label: LABELS[key] || fallbackLabel(key),
      min: spec.min, max: spec.max,
      isRange: false, int: !!spec.int,
    }));
  }
  for (const [key, spec] of Object.entries(RANGE_SPEC)) {
    if (EXCLUDED_KEYS.has(key)) continue;
    out.push(Object.freeze({
      key,
      label: LABELS[key] || fallbackLabel(key),
      min: spec.min, max: spec.max,
      isRange: true, int: false,
    }));
  }
  return Object.freeze(out);
})();

const TARGET_BY_KEY = new Map(LEARNABLE_TARGETS.map((t) => [t.key, t]));

/** The registry entry for a param key, or null when the key isn't learnable. */
export function getTargetSpec(key) {
  return TARGET_BY_KEY.get(key) || null;
}

/** A fresh macro record. The id is supplied by the caller (genId in the slice). */
export function createMacro(id, name) {
  return {
    id: String(id),
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, MATH_MAX_NAME) : 'MACRO',
    targets: [],
  };
}

function sanitizeTarget(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const spec = getTargetSpec(raw.key);
  if (!spec) return null;
  return { key: spec.key, invert: raw.invert === true };
}

function sanitizeMacro(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  if (!id) return null;
  const targets = [];
  if (Array.isArray(raw.targets)) {
    for (const t of raw.targets) {
      if (targets.length >= MATH_MAX_TARGETS) break;
      const clean = sanitizeTarget(t);
      if (clean && !targets.some((x) => x.key === clean.key)) targets.push(clean);
    }
  }
  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, MATH_MAX_NAME)
      : 'MACRO',
    targets,
  };
}

/**
 * Sanitize the persisted setups: hostile docs collapse to the known target
 * set, unknown keys drop, caps apply. Always an array.
 */
export function sanitizeMathMacros(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const m of raw) {
    if (out.length >= MATH_MAX_MACROS) break;
    const clean = sanitizeMacro(m);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    out.push(clean);
  }
  return out;
}

/** Add a macro record (already created via createMacro). Returns a new array. */
export function addMacro(macros, macro) {
  const list = Array.isArray(macros) ? macros : [];
  if (list.length >= MATH_MAX_MACROS) return list;
  if (!macro || typeof macro.id !== 'string' || list.some((m) => m.id === macro.id)) return list;
  return [...list, sanitizeMacro(macro) || createMacro(macro.id, macro.name)];
}

/** Remove a macro by id. Returns a new array (or the same one when untouched). */
export function removeMacro(macros, id) {
  const list = Array.isArray(macros) ? macros : [];
  const next = list.filter((m) => m.id !== id);
  return next.length === list.length ? list : next;
}

/** Rename a macro. Blank names are refused — the knob face needs a name. */
export function renameMacro(macros, id, name) {
  const list = Array.isArray(macros) ? macros : [];
  const clean = typeof name === 'string' ? name.trim().slice(0, MATH_MAX_NAME) : '';
  if (!clean) return list;
  let changed = false;
  const next = list.map((m) => {
    if (m.id !== id || m.name === clean) return m;
    changed = true;
    return { ...m, name: clean };
  });
  return changed ? next : list;
}

/**
 * Assign a param key to a macro (the learn-mode "wiggle"). Idempotent:
 * wiggling an assigned slider again changes nothing. Unknown keys and
 * unknown macros are refused — garbage never assigns.
 */
export function assignTarget(macros, macroId, key) {
  const list = Array.isArray(macros) ? macros : [];
  const spec = getTargetSpec(key);
  if (!spec) return list;
  let changed = false;
  const next = list.map((m) => {
    if (m.id !== macroId) return m;
    if (m.targets.some((t) => t.key === key)) return m;
    if (m.targets.length >= MATH_MAX_TARGETS) return m;
    changed = true;
    return { ...m, targets: [...m.targets, { key, invert: false }] };
  });
  return changed ? next : list;
}

/** Drop a param from a macro. */
export function unassignTarget(macros, macroId, key) {
  const list = Array.isArray(macros) ? macros : [];
  let changed = false;
  const next = list.map((m) => {
    if (m.id !== macroId) return m;
    const targets = m.targets.filter((t) => t.key !== key);
    if (targets.length === m.targets.length) return m;
    changed = true;
    return { ...m, targets };
  });
  return changed ? next : list;
}

/** Flip a target's direction — the "spread-everything" half of the gesture. */
export function toggleInvert(macros, macroId, key) {
  const list = Array.isArray(macros) ? macros : [];
  let changed = false;
  const next = list.map((m) => {
    if (m.id !== macroId) return m;
    const targets = m.targets.map((t) => {
      if (t.key !== key) return t;
      changed = true;
      return { ...t, invert: !t.invert };
    });
    return changed ? { ...m, targets } : m;
  });
  return changed ? next : list;
}

function clampNum(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function shiftValue(cur, shift, spec) {
  if (Array.isArray(cur)) {
    // Range params (scale/rotate/alpha): shift both ends, spread preserved —
    // the same "move the whole range" the dual slider's middle grab does.
    return cur.map((v) => {
      const n = Number(v);
      const moved = clampNum(Number.isFinite(n) ? n + shift : shift, spec.min, spec.max);
      return moved;
    });
  }
  const n = Number(cur);
  const base = Number.isFinite(n) ? n : spec.min;
  const moved = clampNum(base + shift, spec.min, spec.max);
  return spec.int ? Math.round(moved) : moved;
}

/**
 * Compute the new param values for one macro-knob gesture step. `delta` is
 * in knob units (1.0 = one full sweep); each target moves through its own
 * range proportionally. Locked params are skipped — a lock is the
 * performer's taste. Returns a { key: value } patch (empty when nothing
 * moves); the caller writes it through the normal param path so validation
 * and undo still apply.
 */
export function drivePatch(layoutParams, targets, delta, lockedParams) {
  const patch = {};
  if (!delta || !Array.isArray(targets) || targets.length === 0) return patch;
  const params = layoutParams || {};
  const locked = lockedParams || {};
  for (const t of targets) {
    const spec = getTargetSpec(t.key);
    if (!spec) continue;
    if (locked[t.key]) continue;
    const dir = t.invert ? -1 : 1;
    const shift = delta * (spec.max - spec.min) * dir;
    if (!(spec.key in params)) continue;
    patch[spec.key] = shiftValue(params[spec.key], shift, spec);
  }
  return patch;
}
