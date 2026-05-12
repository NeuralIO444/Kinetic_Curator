// Centralized hotkey manager
// Fixes B1: uses refs so handlers always see current state

import { useEffect, useRef, useCallback } from 'react';

/**
 * Register keyboard shortcuts.
 * @param {Object<string, Function>} keyMap - { 'key': handler } e.g. { 's': onSnapshot }
 *   Handlers receive the KeyboardEvent.
 */
export function useHotkeys(keyMap) {
  const mapRef = useRef(keyMap);
  mapRef.current = keyMap; // always current — fixes stale closure

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      const handler = mapRef.current[e.key] || mapRef.current[e.key.toLowerCase()];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
