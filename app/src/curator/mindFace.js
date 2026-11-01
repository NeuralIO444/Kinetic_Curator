// mindFace.js — #1462 follow-on (Matt, 2026-10-13): how LOIS and Davis take a `mind:request`.
//
// The face BLENDS toward the requested state at its intensity, HOLDS it for its decay (in bars), then EASES BACK to
// the honest feed's state. Canonical and invented states alike. The honest feed is never overwritten: this is an
// overlay the face components draw on top of what resolveLoisFace / resolveDavisState say, and when it ends the
// honest face is simply what remains.
//
// Musical time only (no wall clock): the overlay advances on the bar of each `mind:decision`, which is published
// every bar per persona both live and when a take replays, so a replay blends exactly as the take did.
// The rules backend never requests (mindContract.wantsStage), so on rules alone there is never an overlay.
import { on, Events } from '../composition/eventBus.js';
import { LOIS_FACES } from './loisFace.js';
import { DAVIS_STATES } from './davisState.js';

/** Bars the face takes to blend in, and to ease back out. */
export const EASE_BARS = 1;
/** decay 0 holds until the persona's next decision: one bar. */
const holdBarsOf = (decay) => Math.max(1, decay | 0);

/**
 * LOIS's micro-expressions for states she has no fixed face for (invented ones). Picked by a stable hash of
 * the state id, so the same invented state always wears the same face. Matt reviews these glyphs.
 * (CUT wore one of these until #1856 gave it a fixed face in loisFace.js — loisLook('CUT') reads the table now.)
 */
export const LOIS_EXTRA_FACES = Object.freeze([
  '( ¬‿¬ )',
  '( ─_─ )',
  '( ・_・ )',
  '( ◔_◔ )',
  '( ˘︹˘ )',
  '( ‾ ʖ‾ )',
  '( ಠ_ಠ )',
  '( ¯ ³¯ )',
]);

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** How a requested state reads on LOIS's face: { code, face, label }. */
export function loisLook(id) {
  const fixed = LOIS_FACES[id];
  if (fixed) return { code: fixed.code, face: fixed.face, label: fixed.label };
  return {
    code: String(id).toUpperCase().slice(0, 12),
    face: LOIS_EXTRA_FACES[hash(String(id)) % LOIS_EXTRA_FACES.length],
    label: '',
  };
}

/** How a requested state reads for Davis: { code, name, label } (code drives the sigil's tempo when canonical). */
export function davisLook(id) {
  const fixed = DAVIS_STATES[id];
  if (fixed) return { code: fixed.code, name: fixed.name, label: fixed.label };
  return { code: String(id).toUpperCase().slice(0, 12), name: undefined, label: '' };
}

/**
 * One persona's overlay. Pure: the caller hands it requests and bars.
 * at(bar) → null, or { id, intensity, invented, line, phase: 'in' | 'hold' | 'out', weight }
 *   weight is the target opacity of the requested face for this bar: intensity while in/holding, 0 while easing out
 *   (the component's CSS transition, one bar long, makes the change a blend rather than a cut).
 */
export function createFaceOverlay() {
  let cur = null; // { id, intensity, invented, line, from, holdTo, outTo }
  return {
    request(req, bar) {
      const s = req && req.reply && req.reply.state;
      if (!s && !(req && req.reply && req.reply.line)) return false;
      const b = Number.isInteger(bar) ? bar : Number.isInteger(req.bar) ? req.bar : 0;
      const state = s || (cur ? { id: cur.id, intensity: cur.intensity, decay: 0 } : null);
      if (!state) {
        // a line with no state: the face stays honest, the line rides along for a bar
        cur = { id: null, intensity: 0, invented: false, line: req.reply.line, from: b, holdTo: b + 1, outTo: b + 1 };
        return true;
      }
      const holdTo = b + EASE_BARS + holdBarsOf(state.decay);
      cur = {
        id: state.id,
        intensity: state.intensity,
        invented: !!req.invented,
        line: req.reply.line || null,
        from: b,
        holdTo,
        outTo: holdTo + EASE_BARS,
      };
      return true;
    },
    at(bar) {
      if (!cur || !Number.isInteger(bar)) return null;
      if (bar >= cur.outTo) {
        cur = null;
        return null;
      }
      const phase = bar < cur.from + EASE_BARS ? 'in' : bar < cur.holdTo ? 'hold' : 'out';
      if (cur.id === null)
        return phase === 'out' ? null : { id: null, intensity: 0, invented: false, line: cur.line, phase, weight: 0 };
      return {
        id: cur.id,
        intensity: cur.intensity,
        invented: cur.invented,
        line: cur.line,
        phase,
        weight: phase === 'out' ? 0 : cur.intensity,
      };
    },
    clear() {
      cur = null;
    },
  };
}

// ── live: one overlay per face, driven by the bus ───────────────────────────
const overlays = { lois: createFaceOverlay(), davis: createFaceOverlay() };
const shown = { lois: null, davis: null };
const lastBar = { lois: null, davis: null };
const listeners = new Set();
const notify = () => {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* a listener must not break the bus */
    }
  }
};

/** The overlay each face should draw right now: { lois, davis }, each null or at(bar)'s object. */
export function getMindFaces() {
  return { lois: shown.lois, davis: shown.davis };
}

export function subscribeMindFaces(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const refresh = (persona, bar) => {
  const next = overlays[persona].at(bar);
  const prev = shown[persona];
  if (JSON.stringify(next) !== JSON.stringify(prev)) {
    shown[persona] = next;
    return true;
  }
  return false;
};

/** Start listening. Returns stop(). */
export function startMindFaces() {
  const offs = [
    on(Events.MIND_REQUEST, (req) => {
      const p = req && req.persona;
      if (!overlays[p]) return; // the third never has a face request
      // released by the clock on a downbeat: the decision's own bar (the clock emits clock:bar, the personas decide,
      // then the same tick releases what they queued) — or, on replay, re-published with that bar
      const bar = Number.isInteger(req.bar) ? req.bar : (lastBar[p] ?? 0);
      if (overlays[p].request(req, bar) && refresh(p, bar)) notify();
    }),
    on(Events.MIND_DECISION, (d) => {
      const p = d && d.persona;
      if (!overlays[p] || !Number.isInteger(d.bar)) return;
      lastBar[p] = d.bar;
      if (refresh(p, d.bar)) notify();
    }),
  ];
  return () => {
    offs.forEach((f) => f());
    resetMindFaces();
  };
}

/** Forget every overlay (a take ends, a test). */
export function resetMindFaces() {
  for (const p of Object.keys(overlays)) {
    overlays[p].clear();
    shown[p] = null;
    lastBar[p] = null;
  }
  notify();
}
