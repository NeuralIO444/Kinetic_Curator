// CanvasPanel (P01) — live WebGL canvas (#224, PERFORM leg).
//
// One instrument: the visible canvas renders through the same WebGL2
// pipeline as the exported stills (gl/liveLoop.mjs). Layer resolution
// reuses the app's real placement + swarm logic (gl/liveResolve.mjs); the
// viewport zoom/pan and breath transforms are baked into the scene contract
// so what plays is what renders.
import { useState, useEffect, useRef } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useStore } from '../state/store.js';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCanvasViewport, CANVAS_W, CANVAS_H } from '../hooks/useCanvasViewport.js';
import { useCanvasLife } from '../hooks/useCanvasLife.js';
import { on, Events } from '../composition/eventBus.js';
import { createLiveLoop } from '../gl/liveLoop.mjs';
import { getPreset } from '../data/presets.js';

export function CanvasPanel() {
  const { palette: activePalette, canvasRef, glCanvasRef, glLoopRef } = useApp();
  const layoutParams = useStore(s => s.layoutParams);
  const layers = useStore(s => s.layers);
  const evolveMode = useStore(s => s.evolveMode);
  const beatPulse = useStore(s => s.beatPulse);
  const audioBands = useStore(s => s.audioBands);
  const running = useStore(s => s.running);
  const nodeCount = useStore(s => s.nodeCount);
  const canvasBg = useStore(s => s.canvasBg);
  const accumOn = !!layoutParams.accumulation;
  // #268: the pill must read the EFFECTIVE state — the loop computes
  // accumulation as setting AND not-shed (liveLoop buildFrame). Under LOAD
  // SHED the setting stays on while the buffer is actually off.
  const perfTier1 = useStore(s => s.perfTier1);
  const accumEffective = accumOn && !perfTier1;

  const viewport = useCanvasViewport();
  const life = useCanvasLife({ running, layoutParams, beatPulse, audioBands });
  const lifeRef = useRef(life);
  // Fresh-per-frame view of the viewport for the loop (the loop reads these
  // per render tick, so they live in a ref rather than a re-subscription).
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 }, attractor: null });
  useEffect(() => {
    lifeRef.current = life;
    viewRef.current.zoom = viewport.zoom;
    viewRef.current.pan = viewport.pan;
    viewRef.current.attractor = viewport.attractorRef;
  });

  const [glError, setGlError] = useState(null);

  // Create the loop once; it reads the store directly (no per-frame React).
  useEffect(() => {
    const canvas = glCanvasRef.current;
    const wrap = canvasRef.current;
    if (!canvas) return;
    let loop;
    try {
      loop = createLiveLoop(canvas, {
        getState: useStore.getState,
        lifeRef,
        viewRef,
        wrapEl: wrap,
      });
    } catch (e) {
      // One-shot init failure (e.g. no WebGL2) — show the message once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGlError(e.message || String(e));
      return;
    }
    loop.setBgMode(canvasBg);
    glLoopRef.current = loop;
    loop.start();
    return () => {
      loop.dispose();
      if (glLoopRef.current === loop) glLoopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #310: BG cycle moved to OUTPUT; the state lives in the store and this
  // effect keeps the live loop in sync.
  useEffect(() => {
    if (glLoopRef.current) glLoopRef.current.setBgMode(canvasBg);
  }, [canvasBg, glLoopRef]);

  // Phase A gestures (Davis panel PERFORM): FREEZE / CLEAR / SWELL act on
  // the live GL loop's ACCUM session. #268: SWELL was emitted but nothing
  // listened — it now breathes the trail length out and back over ~2s.
  useEffect(() => on(Events.ACCUM_GESTURE, (p) => {
    if (!p || typeof p !== 'object') return;
    const loop = glLoopRef.current;
    if (!loop) return;
    if (p.action === 'clear') loop.clearAccum();
    else if (p.action === 'freeze') loop.setAccumFrozen(p.value);
    else if (p.action === 'swell') loop.swellAccum();
  }), [glLoopRef]);

  const preset = getPreset(layoutParams.composition);
  let bgStyle = { background: activePalette.bg };
  if (canvasBg === 'white') bgStyle.background = '#ffffff';
  else if (canvasBg === 'transparent') bgStyle.background = 'transparent';

  return (
    <div className={`panel panel-canvas ${evolveMode ? 'evolve-active' : ''}`}>
      <PanelHeader tag="P01" title="CANVAS" subtitle={`${layoutParams.mode} · GL LIVE · ${layers.length} layer${layers.length > 1 ? 's' : ''}`}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* #310: BG cycle moved to OUTPUT. CLEAR ACCUM removed — GHOST
              STATION's gesture row is canonical. */}
          <button className="chip-btn" onClick={viewport.resetView} title="Reset View">RESET VIEW</button>
          <span className="meter-pill">{CANVAS_W}×{CANVAS_H}</span>
          {accumEffective && <span className="meter-pill" title="GPU accumulation buffer is live — trails and glow render in the canvas." style={{ color: 'var(--accent)' }}>ACCUM</span>}
          {accumOn && !accumEffective && <span className="meter-pill" title="Accumulation is switched on, but the governor has shed it to protect frame rate — it returns automatically on recovery." style={{ color: '#ffb454' }}>ACCUM HELD</span>}
          <span className="meter-pill" title="Instances drawn this frame">{nodeCount} NODES</span>
        </div>
      </PanelHeader>
      <div className={`canvas-wrap ${canvasBg === 'transparent' ? 'checkerboard' : ''}`} ref={canvasRef} style={{ position: 'relative' }}>
        <div className="canvas-bg" style={bgStyle} />
        <div className="canvas-rulers" />
        {glError ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3, padding: 24, textAlign: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>LIVE CANVAS UNAVAILABLE</div>
              <div style={{ opacity: 0.7, fontSize: 12 }}>{glError}</div>
            </div>
          </div>
        ) : (
          <canvas ref={glCanvasRef} className="canvas-gl" width={CANVAS_W} height={CANVAS_H}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 1 }}
            onWheel={viewport.onWheel} onPointerDown={viewport.onPointerDown} onPointerMove={viewport.onPointerMoveCombined}
            onPointerUp={viewport.onPointerUpCombined} onPointerCancel={viewport.onPointerUpCombined} onPointerLeave={viewport.clearAttractor} />
        )}
        <span className="canvas-corner tl">0,0</span>
        <span className="canvas-corner tr">{layoutParams.mode}{accumEffective ? ' · ACCUM' : accumOn ? ' · ACCUM HELD' : ''}</span>
        <span className="canvas-corner bl">{preset.name}</span>
        <span className="canvas-corner br">{CANVAS_W}×{CANVAS_H}</span>
      </div>
    </div>
  );
}
