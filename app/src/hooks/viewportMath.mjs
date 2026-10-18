// viewportMath.mjs — useCanvasViewport's pure core (audit standards,
// hooks tests slice 1, #1686). Factored out of the hook verbatim so the
// math is pinnable headlessly; the hook owns state and DOM events.

/** Wheel zoom: exponential-feeling step, clamped to [0.1, 10]. */
export function nextZoom(z, deltaY) {
  return Math.max(0.1, Math.min(10, z - deltaY * 0.0015));
}

/** Pan during a drag: the drag-start pan plus the pointer's travel. */
export function panFromDrag(startPanX, startPanY, startX, startY, clientX, clientY) {
  return {
    x: startPanX + (clientX - startX),
    y: startPanY + (clientY - startY),
  };
}

/**
 * The attractor point for a pointer event: client coords → canvas
 * coords → world coords (through pan/zoom).
 *
 * #454 — a zero-size rect (mid-layout, or the canvas mid-unmount) makes
 * CANVAS_W / rect.width divide to Infinity, and Infinity - Infinity
 * downstream (particles.js's swarm attraction) is NaN; the speed clamp
 * can't bound NaN (every NaN comparison is false), so it enters
 * velocity and every subsequent position integrates to NaN. A
 * degenerate rect is "no attractor this frame" (null), never a
 * poisoned value.
 */
export function attractorPoint(clientX, clientY, rect, panX, panY, zoom, canvasW, canvasH) {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const x = (clientX - rect.left) * (canvasW / rect.width);
  const y = (clientY - rect.top) * (canvasH / rect.height);
  return { x: (x - panX) / zoom, y: (y - panY) / zoom };
}
