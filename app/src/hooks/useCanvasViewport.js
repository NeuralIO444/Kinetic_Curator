// useCanvasViewport — zoom, pan, wheel, drag, attractor for CanvasPanel

import { useState, useRef, useCallback } from 'react';
import { nextZoom, panFromDrag, attractorPoint } from './viewportMath.mjs';

export const CANVAS_W = 1000;
export const CANVAS_H = 700;

export function useCanvasViewport(canvasW = CANVAS_W, canvasH = CANVAS_H) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ active: false, pointerId: null, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const attractorRef = useRef(null);
  // #270: pinch is explicitly DISABLED, not implemented. touch-action:none
  // (canvas.css) already stops the browser's pinch-zoom; here we keep only
  // the first pointer as the pan driver so a second finger can never
  // re-base the drag mid-gesture (the erratic two-finger pan). Any extra
  // pointers are ignored until the pan ends.

  const onWheel = useCallback((e) => {
    setZoom((z) => nextZoom(z, e.deltaY));
  }, []);

  const onPointerDown = useCallback(
    (e) => {
      if (e.target.closest('.canvas-resize-handle')) return;
      if (dragRef.current.active) return; // extra finger mid-pan: ignore
      dragRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      e.target.setPointerCapture(e.pointerId);
    },
    [pan.x, pan.y],
  );

  const onPointerMove = useCallback((e) => {
    // Only the pan-initiating pointer moves the view; other fingers ignored.
    if (!dragRef.current.active || e.pointerId !== dragRef.current.pointerId) return;
    const d = dragRef.current;
    setPan(panFromDrag(d.startPanX, d.startPanY, d.startX, d.startY, e.clientX, e.clientY));
  }, []);

  const onPointerUp = useCallback((e) => {
    if (e.pointerId !== dragRef.current.pointerId) return; // not the pan pointer
    dragRef.current.active = false;
    dragRef.current.pointerId = null;
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const updateAttractor = useCallback(
    (e) => {
      if (dragRef.current.active) return;
      const rect = e.currentTarget.getBoundingClientRect();
      // #454 degenerate-rect guard lives in viewportMath.attractorPoint:
      // a zero-size rect yields null ("no attractor this frame"), never a
      // NaN-poisoned point for the physics.
      attractorRef.current = attractorPoint(e.clientX, e.clientY, rect, pan.x, pan.y, zoom, canvasW, canvasH);
    },
    [pan.x, pan.y, zoom, canvasW, canvasH],
  );

  const clearAttractor = useCallback(() => {
    attractorRef.current = null;
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const onPointerMoveCombined = useCallback(
    (e) => {
      if (dragRef.current.active) onPointerMove(e);
      else updateAttractor(e);
    },
    [onPointerMove, updateAttractor],
  );

  const onPointerUpCombined = useCallback(
    (e) => {
      clearAttractor();
      onPointerUp(e);
    },
    [clearAttractor, onPointerUp],
  );

  return {
    zoom,
    pan,
    setPan,
    setZoom,
    dragRef,
    attractorRef,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    updateAttractor,
    clearAttractor,
    resetView,
    onPointerMoveCombined,
    onPointerUpCombined,
  };
}
