// usePanelResize — drag-to-resize panels vertically
import { useRef, useState, useCallback } from 'react';

export function usePanelResize(defaultHeight, { min = 80, max = 600 } = {}) {
  const [height, setHeight] = useState(defaultHeight);
  const dragRef = useRef({ active: false, startY: 0, startH: 0 });

  const onPointerDown = useCallback((e) => {
    dragRef.current = { active: true, startY: e.clientY, startH: height };
    e.target.setPointerCapture(e.pointerId);
    e.stopPropagation();
  }, [height]);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    const delta = e.clientY - dragRef.current.startY;
    setHeight(Math.max(min, Math.min(max, dragRef.current.startH + delta)));
  }, [min, max]);

  const onPointerUp = useCallback((e) => {
    dragRef.current.active = false;
    e.target.releasePointerCapture(e.pointerId);
  }, []);

  const handleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };

  return { height, handleProps };
}
