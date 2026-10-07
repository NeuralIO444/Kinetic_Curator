import { useCallback, useEffect, useRef, useState } from 'react';
import { hold } from './coldOpen.mjs';

// Touch has no hover, and this is a stage instrument (#1103): a touch on an expanding button
// opens it, and it closes by itself after `ms`. Mouse and keyboard keep using :hover / :focus.
//
// `pulse(ms)` opens it for a moment on demand, whatever the pointer is doing: a KINETIC tap from the K key,
// or a CURATOR roll, flashes the full name and then cools down, so the press is acknowledged even with the
// pointer nowhere near the button.
export function useTapOpen(ms = 1500) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const pulse = useCallback((dur = ms) => {
    setOpen(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), hold(dur));
  }, [ms]);
  return {
    open,
    pulse,
    props: {
      onPointerDown: (e) => { if (e.pointerType === 'touch') pulse(ms); },
    },
  };
}
