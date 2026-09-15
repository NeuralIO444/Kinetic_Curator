// Undo stack helpers for layout/seed/palette changes
//
// Each entry is tagged with the layerId it was captured for (#92). The
// stack is shared across all layers rather than reset on switch, so
// undo()/redo() in layoutSlice.js must only ever apply an entry whose
// layerId matches the currently active layer — otherwise one layer's
// values would land on another.

let lastPushTime = 0;

export function pushToUndo(state, force = false) {
  const now = Date.now();
  const current = {
    layerId: state.activeLayerId,
    seed: state.seed,
    paletteId: state.paletteId,
    paletteOverrides: state.paletteOverrides
      ? JSON.parse(JSON.stringify(state.paletteOverrides))
      : null,
    layoutParams: JSON.parse(JSON.stringify(state.layoutParams)),
  };

  if (!force && now - lastPushTime < 800) {
    return { historyRedoStack: [] };
  }

  const last = state.historyUndoStack[state.historyUndoStack.length - 1];
  if (
    last &&
    last.layerId === current.layerId &&
    last.seed === current.seed &&
    last.paletteId === current.paletteId &&
    JSON.stringify(last.paletteOverrides) === JSON.stringify(current.paletteOverrides) &&
    JSON.stringify(last.layoutParams) === JSON.stringify(current.layoutParams)
  ) {
    return {};
  }

  lastPushTime = now;
  return {
    historyUndoStack: [...state.historyUndoStack, current].slice(-50),
    historyRedoStack: [],
  };
}
