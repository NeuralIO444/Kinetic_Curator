// AppContext — single context provider replacing all prop drilling
// Components use `useApp()` to get state + dispatch + history

import { createContext, useContext, useRef, useMemo } from 'react';
import { reducer, createInitialState } from './reducer.js';
import { useHistory } from './history.js';
import { PALETTES } from '../data/palettes.js';
import { ASSETS } from '../data/assets/index.js';

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch, history] = useHistory(reducer, () => createInitialState(ASSETS));
  const canvasRef = useRef(null);
  const svgRef = useRef(null);

  const palette = useMemo(
    () => PALETTES.find(p => p.id === state.paletteId) || PALETTES[0],
    [state.paletteId],
  );

  const value = useMemo(
    () => ({ state, dispatch, history, palette, palettes: PALETTES, assets: ASSETS, canvasRef, svgRef }),
    [state, history, palette],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/** Hook: access state + dispatch + history from any component */
export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be inside <AppProvider>');
  return ctx;
}
