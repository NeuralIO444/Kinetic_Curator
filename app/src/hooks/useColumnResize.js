// useColumnResize — draggable column dividers for 3-column grid
import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * Manages widths of N columns with draggable dividers between them.
 * @param {number} count - number of columns
 * @param {number[]} initialFractions - initial width fractions (must sum to 1)
 * @param {number} minPx - minimum column width in pixels
 */
export function useColumnResize(count = 3, initialFractions = [0.32, 0.34, 0.34], minPx = 200) {
  const [fractions, setFractions] = useState(initialFractions);
  const containerRef = useRef(null);
  const dragRef = useRef({ active: false, index: -1, startX: 0, startFractions: [] });

  const onDividerPointerDown = useCallback((index, e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      active: true,
      index,
      startX: e.clientX,
      startFractions: [...fractions],
    };
    e.target.setPointerCapture(e.pointerId);
  }, [fractions]);

  const onDividerPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d.active || !containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const deltaFraction = (e.clientX - d.startX) / containerWidth;
    const minFraction = minPx / containerWidth;

    const next = [...d.startFractions];
    const left = d.index;
    const right = d.index + 1;

    next[left] = d.startFractions[left] + deltaFraction;
    next[right] = d.startFractions[right] - deltaFraction;

    // Enforce minimums
    if (next[left] < minFraction) {
      next[right] += (next[left] - minFraction);
      next[left] = minFraction;
    }
    if (next[right] < minFraction) {
      next[left] += (next[right] - minFraction);
      next[right] = minFraction;
    }

    // Final clamp
    if (next[left] >= minFraction && next[right] >= minFraction) {
      setFractions(next);
    }
  }, [minPx]);

  const onDividerPointerUp = useCallback((e) => {
    dragRef.current.active = false;
    e.target.releasePointerCapture(e.pointerId);
  }, []);

  // Double-click to reset
  const onDividerDoubleClick = useCallback(() => {
    setFractions(initialFractions);
  }, [initialFractions]);

  const dividerProps = useCallback((index) => ({
    onPointerDown: (e) => onDividerPointerDown(index, e),
    onPointerMove: onDividerPointerMove,
    onPointerUp: onDividerPointerUp,
    onPointerCancel: onDividerPointerUp,
    onDoubleClick: onDividerDoubleClick,
  }), [onDividerPointerDown, onDividerPointerMove, onDividerPointerUp, onDividerDoubleClick]);

  const gridTemplate = fractions.map(f => `${(f * 100).toFixed(2)}%`).join(' 6px ');

  return { containerRef, fractions, gridTemplate, dividerProps };
}
