// History — undo/redo wrapper around the central reducer
// Wraps any reducer to add a 20-step undo/redo stack
// Usage: const [state, dispatch, { undo, redo, canUndo, canRedo, depth }] = useHistory(reducer, init)

import { useReducer, useCallback, useRef } from 'react';

const MAX_HISTORY = 20;

// Actions that should NOT create undo entries (high-frequency / ephemeral)
const SKIP_UNDO = new Set([
  'SET_FPS',
  'SET_MOTION_ENERGY',
  'SET_AUDIO_STIMULUS',
  'SET_BEAT_PULSE',
  'SET_AUDIO_BANDS',
]);

function historyReducer(wrappedReducer) {
  return function (histState, action) {
    switch (action.type) {
      case '@@UNDO': {
        if (histState.past.length === 0) return histState;
        const prev = histState.past[histState.past.length - 1];
        return {
          past: histState.past.slice(0, -1),
          present: prev,
          future: [histState.present, ...histState.future].slice(0, MAX_HISTORY),
        };
      }
      case '@@REDO': {
        if (histState.future.length === 0) return histState;
        const next = histState.future[0];
        return {
          past: [...histState.past, histState.present].slice(-MAX_HISTORY),
          present: next,
          future: histState.future.slice(1),
        };
      }
      default: {
        const newPresent = wrappedReducer(histState.present, action);
        if (newPresent === histState.present) return histState;

        // Skip undo for high-frequency actions
        if (SKIP_UNDO.has(action.type)) {
          return { ...histState, present: newPresent };
        }

        return {
          past: [...histState.past, histState.present].slice(-MAX_HISTORY),
          present: newPresent,
          future: [], // clear redo stack on new action
        };
      }
    }
  };
}

export function useHistory(reducer, initialState) {
  const wrappedReducer = useRef(historyReducer(reducer)).current;

  const [histState, rawDispatch] = useReducer(wrappedReducer, {
    past: [],
    present: typeof initialState === 'function' ? initialState() : initialState,
    future: [],
  });

  const undo = useCallback(() => rawDispatch({ type: '@@UNDO' }), []);
  const redo = useCallback(() => rawDispatch({ type: '@@REDO' }), []);

  const history = {
    undo,
    redo,
    canUndo: histState.past.length > 0,
    canRedo: histState.future.length > 0,
    undoDepth: histState.past.length,
    redoDepth: histState.future.length,
  };

  return [histState.present, rawDispatch, history];
}
