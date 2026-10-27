// Centralized hotkey manager
// Fixes B1: uses refs so handlers always see current state

import { useEffect, useRef } from 'react';

/**
 * Register keyboard shortcuts.
 * @param {Object<string, Function>} keyMap - { 'key': handler } e.g. { 's': onSnapshot }
 *   Handlers receive the KeyboardEvent.
 */
export function useHotkeys(keyMap) {
  const mapRef = useRef(keyMap);

  // Refs must not be written during render.
  useEffect(() => { mapRef.current = keyMap; });

  useEffect(() => {
    function onKey(e) {
      if (e.repeat) return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      // Let the browser own its own chords; we only claim Cmd/Ctrl+Z ourselves.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() !== 'z') return;
      if (e.altKey) return;
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
