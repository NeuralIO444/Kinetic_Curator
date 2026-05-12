// WebGLCanvas — PIXI-based renderer for canvas WebGL mode
import { useEffect, useRef, useState } from 'react';
import { PixiRenderer } from '../engine/pixi-renderer.js';

export function WebGLCanvas({ items, layerRenderItems, canvasW, canvasH, zoom, pan, blendMode, blendStrength, feedback, onWheel, onPointerDown, onPointerMove, onPointerUp }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  // Re-render-triggering ready flag (state, not ref) so the viewport /
  // feedback / items effects re-fire once init resolves.
  const [ready, setReady] = useState(false);

  // Mount: init renderer once
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new PixiRenderer();
    rendererRef.current = renderer;

    renderer.init(canvas, canvasW, canvasH).then(() => {
      if (cancelled) return;
      setReady(true);
    });

    return () => {
      cancelled = true;
      setReady(false);
      renderer.destroy();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize when canvas dimensions change
  useEffect(() => {
    if (!ready) return;
    const r = rendererRef.current;
    if (r) r.resize(canvasW, canvasH);
  }, [canvasW, canvasH, ready]);

  // Update viewport (zoom/pan) — gated on `ready` so the first frame after
  // mount isn't silently dropped while PIXI.init() is still resolving.
  useEffect(() => {
    if (!ready) return;
    const r = rendererRef.current;
    if (r) r.setViewport({ zoom, panX: pan.x, panY: pan.y, canvasW, canvasH });
  }, [zoom, pan.x, pan.y, canvasW, canvasH, ready]);

  // Update feedback config — same readiness gate as viewport.
  useEffect(() => {
    if (!ready) return;
    const r = rendererRef.current;
    if (r && feedback) r.setFeedback(feedback);
  }, [feedback, ready]);

  // Update items + layer items. The renderer's internal `renderToken` already
  // makes stale async texture loads no-op, so we can fire-and-forget here.
  useEffect(() => {
    if (!ready) return;
    const r = rendererRef.current;
    if (!r) return;
    r.update(items, { blendMode, blendStrength });
    if (layerRenderItems) r.updateLayers(layerRenderItems);
  }, [items, layerRenderItems, blendMode, blendStrength, ready]);

  return (
    <canvas
      ref={canvasRef}
      className="canvas-webgl"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
