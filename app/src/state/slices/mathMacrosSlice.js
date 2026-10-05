// mathMacrosSlice — assignable macro knobs over fine-grain sliders (#724).
//
// `mathMacros` is project data: named knobs, each ganging a set of param
// keys (with per-target invert). Saved in the project doc like #617's
// midiMap; the sanitizer in curator/mathMacros.js owns the trust boundary.
// `mathLearnArmed` is live session state: the macro id waiting for slider
// wiggles, or null. Never saved — learn is a gesture, not a document.
//
// The learn hook itself lives in AppContext's SET_LAYOUT_PARAM funnel (the
// UI-only path: panels emit LAYOUT_PARAM on slider wiggle; programmatic
// writes call setLayoutParam directly and never assign).
import { genId } from '../id.js';
import {
  createMacro, addMacro, removeMacro, renameMacro,
  assignTarget, unassignTarget, toggleInvert,
  sanitizeMathMacros, drivePatch,
} from '../../curator/mathMacros.js';

export const createMathMacrosSlice = (set, get) => ({
  mathMacros: [],
  /** Macro id with learn armed, or null. */
  mathLearnArmed: null,

  setMathMacros: (macros) => set({ mathMacros: sanitizeMathMacros(macros) }),

  addMathMacro: () => set((state) => {
    const macro = createMacro(genId(), `MACRO ${state.mathMacros.length + 1}`);
    const next = addMacro(state.mathMacros, macro);
    if (next === state.mathMacros) return {};
    return { mathMacros: next };
  }),

  removeMathMacro: (id) => set((state) => {
    const next = removeMacro(state.mathMacros, id);
    if (next === state.mathMacros) return {};
    return {
      mathMacros: next,
      mathLearnArmed: state.mathLearnArmed === id ? null : state.mathLearnArmed,
    };
  }),

  renameMathMacro: (id, name) => set((state) => {
    const next = renameMacro(state.mathMacros, id, name);
    return next === state.mathMacros ? {} : { mathMacros: next };
  }),

  /** Arm learn for a macro (or disarm when called with the armed id / null). */
  mathLearnArm: (id) => set((state) => ({
    mathLearnArmed: state.mathLearnArmed === id ? null : (id || null),
  })),
  mathLearnDisarm: () => set({ mathLearnArmed: null }),

  /**
   * A slider with `key` wiggled while learn is armed — called from
   * AppContext's SET_LAYOUT_PARAM funnel. Unknown keys refuse silently.
   */
  mathLearnAssign: (key) => set((state) => {
    if (!state.mathLearnArmed) return {};
    const next = assignTarget(state.mathMacros, state.mathLearnArmed, key);
    return next === state.mathMacros ? {} : { mathMacros: next };
  }),

  mathUnassign: (macroId, key) => set((state) => {
    const next = unassignTarget(state.mathMacros, macroId, key);
    return next === state.mathMacros ? {} : { mathMacros: next };
  }),

  mathToggleInvert: (macroId, key) => set((state) => {
    const next = toggleInvert(state.mathMacros, macroId, key);
    return next === state.mathMacros ? {} : { mathMacros: next };
  }),

  /**
   * Drive a macro's targets by a knob delta (1.0 = one full sweep). Each
   * target moves through its own range proportionally; locked params are
   * skipped. Writes go through setLayoutParam one key at a time so the
   * normal validation applies and the gesture coalesces into one undo
   * entry via the 800ms debounce — exactly like dragging the sliders.
   */
  driveMathMacro: (macroId, delta) => {
    const s = get();
    const macro = (s.mathMacros || []).find((m) => m.id === macroId);
    if (!macro || !delta) return;
    const patch = drivePatch(s.layoutParams, macro.targets, delta, s.lockedParams);
    for (const [key, value] of Object.entries(patch)) s.setLayoutParam(key, value);
  },
});
