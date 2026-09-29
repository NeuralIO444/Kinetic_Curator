#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
F="$ROOT/app/src/state/slices/layersSlice.js"
python3 - "$F" << 'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = '''  reorderLayer: (id, delta) => set((state) => {
    const i = state.layers.findIndex((l) => l.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= state.layers.length) return {};
    const layers = [...state.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers };
  }),
'''
new = '''  reorderLayer: (id, delta) => set((state) => {
    const i = state.layers.findIndex((l) => l.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= state.layers.length) return {};
    // #732 — FX tracks stay above KC tracks. Array is bottom→top.
    const a = state.layers[i];
    const b = state.layers[j];
    if (isFxLayer(a) !== isFxLayer(b)) return {};
    const layers = [...state.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    return { ...pushToUndo(state, true, UNDO_KIND_LAYERS), layers };
  }),
'''
if old in t:
    p.write_text(t.replace(old, new, 1))
    print('patched', p)
elif 'FX tracks stay above KC' in t:
    print('already patched')
else:
    raise SystemExit('reorderLayer block not found')
PY
rm -f "$ROOT/app/src/state/slices/layersSlice.reorder-note.md"
