// Undo stack helpers for layout/seed/palette changes

let lastPushTime = 0;

export function pushToUndo(state, force = false) {
  const now = Date.now();
  const current = {
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
