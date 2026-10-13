import { useCallback, useRef, createContext, useContext } from 'react';
import { useStore } from './store.js';
import { useShallow } from 'zustand/react/shallow';
import { applyAction } from './applyAction.js';
import { PALETTES, resolvePalette } from '../data/palettes.js';
import { ASSETS } from '../data/assets/index.js';
import { mergePool } from '../assets/overlay.js';

const RefsContext = createContext({});
const _emptySelector = () => null;

export function AppProvider({ children }) {
  const canvasRef = useRef(null);
  const glCanvasRef = useRef(null); // the visible WebGL canvas (CanvasPanel)
  const glLoopRef = useRef(null); // the live GL loop handle (capture/record source)
  return (
    <RefsContext.Provider value={{ canvasRef, glCanvasRef, glLoopRef }}>
      {children}
    </RefsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(selector) {
  const refs = useContext(RefsContext);
  const paletteId = useStore(s => s.paletteId);
  const paletteOverrides = useStore(s => s.paletteOverrides);
  const userPalettes = useStore(s => s.userPalettes);
  const paletteLocks = useStore(s => s.paletteLocks);
  const customAssets = useStore(s => s.customAssets);
  const undoStackLength = useStore(s => s.historyUndoStack ? s.historyUndoStack.length : 0);
  const redoStackLength = useStore(s => s.historyRedoStack ? s.historyRedoStack.length : 0);
  const canUndo = useStore(s => {
    const top = s.historyUndoStack && s.historyUndoStack[s.historyUndoStack.length - 1];
    // #223: 'layers' entries are structural and always apply; 'edit'
    // entries still need their layer active (#92).
    return !!top && (top.kind === 'layers' || top.layerId === s.activeLayerId);
  });
  const canRedo = useStore(s => {
    const top = s.historyRedoStack && s.historyRedoStack[s.historyRedoStack.length - 1];
    return !!top && (top.kind === 'layers' || top.layerId === s.activeLayerId);
  });
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);

  const history = {
    undo, redo,
    canUndo,
    canRedo,
    undoDepth: undoStackLength,
    redoDepth: redoStackLength,
  };

  const state = useStore(useShallow(selector || _emptySelector));

  const dispatch = useCallback((action) => applyAction(action), []);

  const palette = resolvePalette(paletteId, paletteOverrides, userPalettes);
  return {
    state, dispatch, history, palette, paletteOverrides,
    palettes: [...PALETTES, ...(userPalettes || [])],
    userPalettes: userPalettes || [],
    paletteLocks: paletteLocks || {},
    assets: mergePool(ASSETS, customAssets),
    ...refs,
  };
}
