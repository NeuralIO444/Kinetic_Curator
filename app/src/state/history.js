// Bounded global undo for parameter, layer, and palette actions (#223).
//
// Declared up front — the two bounds every entry lives under:
//   UNDO_MAX_DEPTH — max entries kept on the undo stack (50)
//   UNDO_MAX_BYTES — max estimated JSON bytes across the undo stack (8 MiB)
// When a push would exceed either bound, the oldest entries are evicted
// first. A single entry larger than the byte cap is still kept (one deep
// undo beats none); the depth cap always applies.
//
// Two entry kinds share the one stack:
//   'edit'   — a parameter/seed/palette edit on one layer. Undo/redo apply
//              only when that layer is active (#92: one layer's values must
//              never land on another). Mismatched top entry = no-op, no pop.
//   'layers' — a layer structure/descriptor action (add/duplicate/remove/
//              reorder, visibility, blend, opacity, FX stack). Always
//              applies: the entry holds the whole pre-action document, so
//              each layer's content is restored onto its own layer.
//
// Per-frame live tweaks (audio stimulus, beat pulse, fps, morph lerp
// frames via setLayoutParams, the running loop) never call pushToUndo —
// only discrete user actions do. Slider-driven actions pass force=false
// and share the 800ms debounce so one drag is one entry.

export const UNDO_MAX_DEPTH = 50;
export const UNDO_MAX_BYTES = 8 * 1024 * 1024;
export const UNDO_DEBOUNCE_MS = 800;

export const UNDO_KIND_EDIT = 'edit';
export const UNDO_KIND_LAYERS = 'layers';

let lastPushTime = 0;

function deep(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * Capture the undoable document state. 'edit' entries carry the active
 * layer's content; 'layers' entries carry that plus the whole layer
 * structure (layers, activeLayerId, per-layer snapshots). Field list
 * mirrors captureSnapshot in slices/layersSlice.js.
 */
export function captureUndoEntry(state, kind = UNDO_KIND_EDIT) {
  const entry = {
    kind,
    layerId: state.activeLayerId,
    seed: state.seed,
    seedOffsets: deep(state.seedOffsets),
    paletteId: state.paletteId,
    paletteOverrides: deep(state.paletteOverrides),
    layoutParams: deep(state.layoutParams),
    lockedParams: deep(state.lockedParams),
    caGrid: deep(state.caGrid),
    enabledAssets: deep(state.enabledAssets),
  };
  if (kind === UNDO_KIND_LAYERS) {
    entry.layers = deep(state.layers);
    entry.activeLayerId = state.activeLayerId;
    entry.layerSnapshots = deep(state.layerSnapshots);
  }
  // Estimated serialized size, for the byte cap. Stored on the entry so
  // totals stay exact as entries move between the undo and redo stacks.
  entry.bytes = JSON.stringify(entry).length;
  return entry;
}

/** Content signature for the no-change dedupe. */
function entrySignature(entry) {
  return JSON.stringify([
    entry.kind,
    entry.layerId,
    entry.seed,
    entry.paletteId,
    entry.paletteOverrides,
    entry.layoutParams,
    entry.lockedParams,
    entry.caGrid,
    entry.enabledAssets,
    entry.seedOffsets,
    entry.layers,
    entry.activeLayerId,
    entry.layerSnapshots,
  ]);
}

function stackBytes(stack) {
  let n = 0;
  for (const e of stack) n += e.bytes || 0;
  return n;
}

/**
 * Enforce both caps on a stack, oldest-first. Exported for the selfcheck.
 * Never drops the newest entry, even if it alone exceeds the byte cap.
 */
export function trimUndoStack(stack) {
  let trimmed = stack;
  while (trimmed.length > 1 &&
    (trimmed.length > UNDO_MAX_DEPTH || stackBytes(trimmed) > UNDO_MAX_BYTES)) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.length > UNDO_MAX_DEPTH) trimmed = trimmed.slice(-UNDO_MAX_DEPTH);
  return trimmed;
}

export function pushToUndo(state, force = false, kind = UNDO_KIND_EDIT) {
  const now = Date.now();
  if (!force && now - lastPushTime < UNDO_DEBOUNCE_MS) {
    // Debounced slider tick: not an entry, but it does invalidate redo —
    // the value moved on without a new undo point, so redo history built
    // on the old value no longer applies.
    return { historyRedoStack: [] };
  }

  const current = captureUndoEntry(state, kind);

  // Defensive: slice unit tests drive the actions with partial mock state
  // that has no history stacks — pushing there must not crash.
  const undoStack = state.historyUndoStack || [];
  const last = undoStack[undoStack.length - 1];
  if (last && entrySignature(last) === entrySignature(current)) {
    return {};
  }

  // Only slider ticks arm the debounce; a forced (structural) push resets it so the
  // next drag starts a fresh step instead of being swallowed by the last push.
  lastPushTime = force ? 0 : now;
  return {
    historyUndoStack: trimUndoStack([...undoStack, current]),
    historyRedoStack: [],
  };
}

/** A top entry applies if it is structural, or its layer is active (#92). */
export function entryApplies(entry, activeLayerId) {
  return !!entry && (entry.kind === UNDO_KIND_LAYERS || entry.layerId === activeLayerId);
}

/**
 * Content fields an 'edit' undo/redo restores. 'layers' entries restore
 * these plus the structure fields (see layoutSlice undo/redo).
 */
export function editRestoreFields(entry) {
  return {
    seed: entry.seed,
    seedOffsets: entry.seedOffsets ?? { spatial: 0, color: 0, asset: 0, noise: 0 },
    paletteId: entry.paletteId,
    paletteOverrides: entry.paletteOverrides ?? null,
    layoutParams: entry.layoutParams,
    lockedParams: entry.lockedParams,
    caGrid: entry.caGrid,
    enabledAssets: entry.enabledAssets,
  };
}

/** Structure fields a 'layers' undo/redo restores on top of the content. */
export function layersRestoreFields(entry) {
  return {
    layers: entry.layers,
    activeLayerId: entry.activeLayerId,
    layerSnapshots: entry.layerSnapshots,
  };
}
