// useColumnResize — draggable column dividers for 3-column grid
import { useRef, useState, useCallback } from 'react';
import { resizeFractions } from './columnResizeMath.mjs';

/**
 * Manages widths of N columns with draggable dividers between them.
 * @param {number[]} initialFractions - initial width fractions (must sum to 1)
 * @param {number} minPx - minimum column width in pixels
 */
export function useColumnResize(initialFractions = [0.32, 0.34, 0.34], minPx = 200) {
  const [fractions, setFractions] = useState(initialFractions);
  const containerRef = useRef(null);
  const dragRef = useRef({ active: false, index: -1, startX: 0, startFractions: [] });

  const onDividerPointerDown = useCallback(
    (index, e) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        active: true,
        index,
        startX: e.clientX,
        startFractions: [...fractions],
      };
      e.target.setPointerCapture(e.pointerId);
    },
    [fractions],
  );

  const onDividerPointerMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d.active || !containerRef.current) return;

      const containerWidth = containerRef.current.offsetWidth;
      const deltaFraction = (e.clientX - d.startX) / containerWidth;
      const minFraction = minPx / containerWidth;

      // The shift/minimum/rejection math is columnResizeMath's (pinned);
      // null = both sides can't hold the minimum, layout stays untouched.
      const next = resizeFractions(d.startFractions, d.index, deltaFraction, minFraction);
      if (next) setFractions(next);
    },
    [minPx],
  );

  const onDividerPointerUp = useCallback((e) => {
    dragRef.current.active = false;
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  // Double-click to reset
  const onDividerDoubleClick = useCallback(() => {
    setFractions(initialFractions);
  }, [initialFractions]);

  const dividerProps = useCallback(
    (index) => ({
      onPointerDown: (e) => onDividerPointerDown(index, e),
      onPointerMove: onDividerPointerMove,
      onPointerUp: onDividerPointerUp,
      onPointerCancel: onDividerPointerUp,
      onDoubleClick: onDividerDoubleClick,
    }),
    [onDividerPointerDown, onDividerPointerMove, onDividerPointerUp, onDividerDoubleClick],
  );

  const gridTemplate = fractions.map((f) => `${(f * 100).toFixed(2)}%`).join(' 6px ');

  return { containerRef, fractions, gridTemplate, dividerProps };
}
