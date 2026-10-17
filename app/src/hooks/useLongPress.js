// useLongPress — the shift-layer gesture (#1204): press-and-hold opens a
// control's second function. The click that ends a long press is swallowed
// in the capture phase, so the host's first function never fires on
// release. 650 ms — the same hold the voice chips use (VoicesShelf), one
// hold length across the instrument.
import { useRef } from 'react';

export const LONG_PRESS_MS = 650;

/**
 * @param {() => void} onLongPress fired once when the hold completes
 * @returns pointer/click handlers to spread on the host element
 */
export function useLongPress(onLongPress, ms = LONG_PRESS_MS) {
  const timer = useRef(null);
  const fired = useRef(false);

  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onPointerDown: () => {
      fired.current = false;
      cancel();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, ms);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClickCapture: (e) => {
      if (fired.current) {
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
