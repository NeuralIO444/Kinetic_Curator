import { DEFAULT_LAYOUT_PARAMS, validateLayoutParams } from '../../data/layout-modes.js';
import { createGrid, stepGrid } from '../../engine/ca-engine.js';
import { pushToUndo, captureUndoEntry, entryApplies, editRestoreFields, layersRestoreFields, trimUndoStack, UNDO_KIND_LAYERS } from '../history.js';
import { RANDOMIZABLE_KEYS, randomizeKey } from '../paramUtils.js';
import { CURATE_CANDIDATES, getActiveCurator, pickCurated } from '../../curator/curate.js';
import { getCatalogPalette, normalizeHex } from '../../data/palettes.js';
import { buildHarmony, applyWithLocks } from '../../engine/harmony.js';
import { SEED_OFFSET_GROUPS, defaultSeedOffsets, normalizeSeedOffsets } from '../../engine/kernel/rng.js';
import { sanitizeMixSeconds } from '../../gl/paletteMix.mjs';

export const createLayoutSlice = (set) => ({
  seed: 0xa17e9b21,
  /**
   * Sub-seed stream offsets (#305): { spatial, color, asset, noise }, each a
   * uint32 delta mixed into its stream's channel hash. A performer re-rolls
   * one stream while the master seed's other channels stay locked. Zero is
   * the identity — saved and restored exactly like the seed itself.
   */
  seedOffsets: defaultSeedOffsets(),
  paletteId: 'praystation',
  /** null | { swatches?: string[], bg?: string, ink?: string } — never mutates catalog */
  paletteOverrides: null,
  /** Swatch slots the operator pinned; harmony/shuffle leave these alone (#56). */
  paletteLocks: {},
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  lockedParams: {},
  /**
   * Render-only overlay for ambient "life" drift (#107 §2): null, or a
   * partial { jitter?, displacement?, noiseSpeed? } that the canvas merges
   * over layoutParams for display. Deliberately outside the firewall below —
   * it never reaches layoutParams, undo, or autosave, same treatment as
   * audioBands/beatPulse. See useContinuousLife.
   */
  driftOverlay: null,
  /**
   * Render-only overlay for the performance governor's last-resort density
   * cut (#107 §5): null, or a partial { count?, mirror? } merged over
   * layoutParams for display, same mechanism as driftOverlay above. The
   * governor used to call setLayoutParam('count', ...) directly, which
   * permanently shrank the authored value — so a "FINAL · UNCAPPED" export
   * restoring "what count was before the render" restored the *degraded*
   * number, not what the operator actually set. Keeping this out of
   * layoutParams means every snapshot/export path keeps reading the true
   * authored count regardless of what the live canvas is drawing.
   */
  perfClampOverride: null,
  motionSmoothing: true,
  /**
   * VJ MIX (#278): palette-switch crossfade duration in seconds, 0–8.
   * 0 = hard cut (the old behavior). A feel preference like
   * motionSmoothing — deliberately outside the project document.
   */
  paletteMixSeconds: 2,
  caGrid: null,
  historyUndoStack: [],
  historyRedoStack: [],

  setSeed: (seed) => set((state) => ({ ...pushToUndo(state, true), seed })),
  bumpSeed: () => set((state) => ({
    ...pushToUndo(state, true),
    seed: (state.seed ^ ((Math.random() * 0xffffffff) | 0)) >>> 0,
  })),
  /**
   * Re-roll one sub-seed stream (#305): the named stream gets a fresh random
   * offset while the master seed and the other three streams stay locked.
   * Undoable, like every other seed edit.
   */
  mutateSeedOffset: (group) => set((state) => {
    if (!SEED_OFFSET_GROUPS.includes(group)) return {};
    return {
      ...pushToUndo(state, true),
      seedOffsets: {
        ...normalizeSeedOffsets(state.seedOffsets),
        [group]: ((Math.random() * 0xffffffff) | 0) >>> 0,
      },
    };
  }),
  /** Set one stream's offset explicitly (project load, recipe recall). */
  setSeedOffset: (group, value) => set((state) => {
    if (!SEED_OFFSET_GROUPS.includes(group)) return {};
    const v = Number(value);
    if (!Number.isFinite(v)) return {};
    const cur = normalizeSeedOffsets(state.seedOffsets);
    if ((v >>> 0) === cur[group]) return {};
    return {
      ...pushToUndo(state, true),
      seedOffsets: { ...cur, [group]: v >>> 0 },
    };
  }),
  /** Lock every stream back to the master seed (all offsets zero). */
  resetSeedOffsets: () => set((state) => {
    const cur = normalizeSeedOffsets(state.seedOffsets);
    if (SEED_OFFSET_GROUPS.every((g) => cur[g] === 0)) return {};
    return { ...pushToUndo(state, true), seedOffsets: defaultSeedOffsets() };
  }),
  // Switching catalog id clears overrides (AC6)
  setPaletteId: (id) => set((state) => ({
    ...pushToUndo(state, true),
    paletteId: id,
    paletteOverrides: null,
  /** Swatch slots the operator pinned; harmony/shuffle leave these alone (#56). */
  paletteLocks: {},
  })),

  setPaletteSwatch: (index, hex) => set((state) => {
    const n = normalizeHex(hex);
    if (n == null) return {};
    const base = getCatalogPalette(state.paletteId, state.userPalettes);
    if (index < 0 || index >= base.swatches.length) return {};
    const prev = state.paletteOverrides?.swatches
      ? [...state.paletteOverrides.swatches]
      : [...base.swatches];
    // Ensure length
    while (prev.length < base.swatches.length) prev.push(base.swatches[prev.length]);
    prev[index] = n;
    // If identical to catalog, collapse that slot conceptually but keep array
    const nextOverrides = {
      ...(state.paletteOverrides || {}),
      swatches: prev,
    };
    // Drop if fully matches catalog
    const matches = prev.every((s, i) => s === base.swatches[i])
      && (!nextOverrides.bg || nextOverrides.bg === base.bg)
      && (!nextOverrides.ink || nextOverrides.ink === base.ink);
    return {
      ...pushToUndo(state, true),
      paletteOverrides: matches ? null : nextOverrides,
    };
  }),

  setPaletteBg: (hex) => set((state) => {
    const n = normalizeHex(hex);
    if (n == null) return {};
    const base = getCatalogPalette(state.paletteId, state.userPalettes);
    const next = { ...(state.paletteOverrides || {}), bg: n };
    if (n === base.bg) delete next.bg;
    const empty = !next.swatches && !next.bg && !next.ink;
    return {
      ...pushToUndo(state, true),
      paletteOverrides: empty ? null : next,
    };
  }),

  setPaletteInk: (hex) => set((state) => {
    const n = normalizeHex(hex);
    if (n == null) return {};
    const base = getCatalogPalette(state.paletteId, state.userPalettes);
    const next = { ...(state.paletteOverrides || {}), ink: n };
    if (n === base.ink) delete next.ink;
    const empty = !next.swatches && !next.bg && !next.ink;
    return {
      ...pushToUndo(state, true),
      paletteOverrides: empty ? null : next,
    };
  }),

  clearPaletteOverrides: () => set((state) => {
    if (!state.paletteOverrides) return {};
    return { ...pushToUndo(state, true), paletteOverrides: null };
  }),

  setPaletteOverrides: (overrides) => set((state) => ({
    ...pushToUndo(state, true),
    paletteOverrides: overrides,
  })),

  togglePaletteLock: (index) => set((state) => ({
    paletteLocks: { ...state.paletteLocks, [index]: !state.paletteLocks[index] },
  })),

  clearPaletteLocks: () => set({ paletteLocks: {} }),

  /**
   * Regenerate unlocked swatches from a harmony scheme (#56).
   * Base colour is the first locked swatch if there is one — so locking a
   * colour you like and shuffling builds around it — else swatch 0.
   */
  applyHarmony: (scheme) => set((state) => {
    const base = getCatalogPalette(state.paletteId, state.userPalettes);
    const current = base.swatches.map((sw, i) => state.paletteOverrides?.swatches?.[i] || sw);
    const lockedIdx = Object.keys(state.paletteLocks).find((k) => state.paletteLocks[k]);
    const anchor = current[lockedIdx != null ? Number(lockedIdx) : 0] || current[0];
    const generated = buildHarmony(anchor, scheme, current.length);
    const swatches = applyWithLocks(current, generated, state.paletteLocks);
    if (swatches.every((c, i) => c === current[i])) return {};
    return {
      ...pushToUndo(state, true),
      paletteOverrides: { ...(state.paletteOverrides || {}), swatches },
    };
  }),

  setDriftOverlay: (overlay) => set({ driftOverlay: overlay }),
  setPerfClampOverride: (overlay) => set({ perfClampOverride: overlay }),

  // ── State firewall (#107 §1) ─────────────────────────────────────────────
  // Every layoutParams write in the app funnels through these two setters —
  // sliders, presets, randomize, the governor, morph lerps and evolve
  // targets. (Ambient drift used to be a seventh writer here; #107 §2 moved
  // it to driftOverlay above so it never touches this state at all.)
  // Validating here rather than at each call site is both the smaller diff
  // and the one that cannot be forgotten by the next writer.
  //
  // Out-of-range but well-formed values clamp; structurally invalid ones
  // (NaN, null, wrong type, unknown mode) are rejected and the previous value
  // is kept. See validateLayoutParams for why those are treated differently.
  setLayoutParam: (key, value) => set((state) => {
    if (state.layoutParams[key] === value) return {};
    const { params, rejected } = validateLayoutParams({ ...state.layoutParams, [key]: value });
    if (rejected.includes(key)) {
      // Keep previous state entirely: do not push an undo entry for a write
      // that did not happen, or Ctrl-Z stops lining up with what the operator
      // actually did.
      if (import.meta.env?.DEV) {
        console.warn(`[state] rejected setLayoutParam(${key}):`, value);
      }
      return {};
    }
    // A value that clamps to what is already there is not an edit. Without
    // this, holding a slider past its maximum pushes an undo entry per event
    // while the composition never changes, and Ctrl-Z then has to be pressed
    // twenty times to get anywhere.
    const cur = state.layoutParams[key];
    const nextVal = params[key];
    const unchanged = Array.isArray(nextVal) && Array.isArray(cur)
      ? nextVal.length === cur.length && nextVal.every((v, i) => Object.is(v, cur[i]))
      : Object.is(nextVal, cur);
    if (unchanged) return {};

    const undoUpdate = pushToUndo(state, false);
    const next = { ...undoUpdate, layoutParams: params };
    if (key === 'mode' && value === 'ca' && !state.caGrid) {
      next.caGrid = createGrid(40, 28);
    }
    return next;
  }),

  setLayoutParams: (params) => set((state) => {
    const { params: safe, rejected } = validateLayoutParams({ ...state.layoutParams, ...params });
    if (rejected.length === 0) return { layoutParams: safe };
    // Partial accept: a bad key in a machine-generated batch (a morph lerp
    // that produced NaN, an evolve target off the end of a range) must not
    // discard the good keys alongside it.
    const kept = { ...safe };
    for (const key of rejected) kept[key] = state.layoutParams[key];
    if (import.meta.env?.DEV) {
      console.warn('[state] rejected setLayoutParams keys:', rejected);
    }
    return { layoutParams: kept };
  }),

  setMotionSmoothing: (smoothing) => set({ motionSmoothing: smoothing }),
  /** VJ MIX (#278): palette-switch crossfade seconds, clamped 0–8. */
  setPaletteMixSeconds: (seconds) => set({ paletteMixSeconds: sanitizeMixSeconds(seconds) }),
  stepCaGrid: () => set((state) => ({
    caGrid: state.caGrid ? stepGrid(state.caGrid) : createGrid(40, 28),
  })),
  resetCaGrid: () => set({ caGrid: createGrid(40, 28) }),

  applyPreset: (preset) => set((state) => {
    const incoming = { ...preset.params, composition: preset.id };
    const merged = { ...state.layoutParams };
    let changed = false;
    for (const [k, v] of Object.entries(incoming)) {
      if (!state.lockedParams[k] && merged[k] !== v) {
        merged[k] = v;
        changed = true;
      }
    }
    if (!changed && state.layoutParams.composition === preset.id) return {};
    return { ...pushToUndo(state, true), layoutParams: merged };
  }),

  toggleParamLock: (key) => set((state) => ({
    lockedParams: { ...state.lockedParams, [key]: !state.lockedParams[key] },
  })),

  randomizeParam: (key) => set((state) => ({
    ...pushToUndo(state, true),
    layoutParams: { ...state.layoutParams, [key]: randomizeKey(key) },
  })),

  randomizeUnlocked: () => set((state) => {
    const rp = { ...state.layoutParams };
    let changed = false;
    for (const key of RANDOMIZABLE_KEYS) {
      if (!state.lockedParams[key]) {
        rp[key] = randomizeKey(key);
        changed = true;
      }
    }
    if (!changed) return {};
    return { ...pushToUndo(state, true), layoutParams: rp };
  }),

  curateUnlocked: () => set((state) => {
    // The Curator: roll CURATE_CANDIDATES scenes over the unlocked params and
    // keep the engine's pick. No trained engine on file yet -> honest dice
    // roll; the bar says so (see curator/curate.js). Locked params are never
    // touched, same as randomizeUnlocked.
    const curator = getActiveCurator();
    const unlocked = RANDOMIZABLE_KEYS.filter((key) => !state.lockedParams[key]);
    // Everything locked: no-op — no candidate differs from current state, so
    // push no undo entry (same guard as randomizeUnlocked).
    if (unlocked.length === 0) return {};
    const candidates = [];
    for (let n = 0; n < CURATE_CANDIDATES; n++) {
      const rp = { ...state.layoutParams };
      for (const key of unlocked) rp[key] = randomizeKey(key);
      candidates.push(rp);
    }
    const { index } = pickCurated(candidates, curator);
    if (index < 0) return {};
    return { ...pushToUndo(state, true), layoutParams: candidates[index] };
  }),

  // Entries are tagged with the layerId they were captured for (#92) and the
  // stack is shared across layers (never reset on switch). An 'edit' entry
  // only ever applies when its layer is active — otherwise it would restore
  // one layer's values onto a different layer, which is the exact corruption
  // this is guarding against. A mismatched top entry means "nothing to
  // undo/redo for this layer right now" — no-op, no pop. 'layers' entries
  // (layer structure actions, #223) always apply: they hold the whole
  // pre-action document, so every layer's content lands back on its own
  // layer and the structure comes with it.
  undo: () => set((state) => {
    if (state.historyUndoStack.length === 0) return {};
    const previous = state.historyUndoStack[state.historyUndoStack.length - 1];
    if (!entryApplies(previous, state.activeLayerId)) return {};
    const current = captureUndoEntry(state, previous.kind);
    const restore = previous.kind === UNDO_KIND_LAYERS
      ? { ...editRestoreFields(previous), ...layersRestoreFields(previous) }
      : editRestoreFields(previous);
    return {
      ...restore,
      historyUndoStack: state.historyUndoStack.slice(0, -1),
      historyRedoStack: trimUndoStack([...state.historyRedoStack, current]),
      // #107 §7: an in-flight morph's rAF loop calls setLayoutParams every
      // frame from its own morphFrom/morphTo/morphStart — left running, it
      // would overwrite what undo just restored within one frame. Cancel it.
      morphing: false,
      morphFrom: null,
      morphTo: null,
    };
  }),

  redo: () => set((state) => {
    if (state.historyRedoStack.length === 0) return {};
    const next = state.historyRedoStack[state.historyRedoStack.length - 1];
    if (!entryApplies(next, state.activeLayerId)) return {};
    const current = captureUndoEntry(state, next.kind);
    const restore = next.kind === UNDO_KIND_LAYERS
      ? { ...editRestoreFields(next), ...layersRestoreFields(next) }
      : editRestoreFields(next);
    return {
      ...restore,
      historyUndoStack: trimUndoStack([...state.historyUndoStack, current]),
      historyRedoStack: state.historyRedoStack.slice(0, -1),
      // #107 §7: same in-flight-morph cancellation as undo() above.
      morphing: false,
      morphFrom: null,
      morphTo: null,
    };
  }),
});
