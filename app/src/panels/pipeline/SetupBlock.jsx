import { useStore } from '../../state/store.js';
import { CANVAS_PRESETS, CANVAS_FPS, INSTRUMENT_CANVAS } from '../../data/canvasPresets.js';

export function SetupBlock() {
  const w = useStore((s) => s.canvasW);
  const h = useStore((s) => s.canvasH);
  const fps = useStore((s) => s.canvasFps);
  const presetId = useStore((s) => s.canvasPresetId);
  const lock = useStore((s) => s.canvasAspectLock);
  const apply = useStore((s) => s.applyCanvasPreset);
  const setSize = useStore((s) => s.setCanvasSize);
  const setFps = useStore((s) => s.setCanvasFps);
  const setLock = useStore((s) => s.setCanvasAspectLock);
  const swap = useStore((s) => s.swapCanvasOrientation);
  const actual = `${INSTRUMENT_CANVAS.w}×${INSTRUMENT_CANVAS.h}`;
  const authored = `${w}×${h}`;
  const differ = authored !== actual;

  return (
    <div className="pipeline-setup">
      <div className="pipeline-row">
        <span style={{ flex: 1, fontSize: 11 }}>CANVAS PRESET</span>
        <select value={presetId} onChange={(e) => apply(e.target.value)} style={{ fontSize: 11, maxWidth: 180 }}>
          {CANVAS_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.group} · {p.label}</option>
          ))}
        </select>
      </div>
      <div className="pipeline-row">
        <span style={{ fontSize: 11 }}>W×H</span>
        <input type="number" value={w} style={{ width: 64, fontSize: 11 }}
          onChange={(e) => {
            const nw = Number(e.target.value);
            const nh = lock ? Math.round(nw * (h / w)) : h;
            setSize(nw, nh);
          }} />
        <span>×</span>
        <input type="number" value={h} style={{ width: 64, fontSize: 11 }}
          onChange={(e) => {
            const nh = Number(e.target.value);
            const nw = lock ? Math.round(nh * (w / h)) : w;
            setSize(nw, nh);
          }} />
        <button type="button" className={`chip-btn${lock ? ' active' : ''}`} onClick={() => setLock(!lock)}>LOCK</button>
        <button type="button" className="chip-btn" onClick={swap}>SWAP</button>
      </div>
      <div className="pipeline-row" title="Capture timestep. Live raf still follows the display.">
        <span style={{ flex: 1, fontSize: 11 }}>CAPTURE FPS</span>
        <select value={fps} onChange={(e) => setFps(Number(e.target.value))} style={{ fontSize: 11 }}>
          {CANVAS_FPS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="pipeline-hint" style={{ fontSize: 10, opacity: 0.7 }}>
        Authored {authored}
        {differ ? ` · live raster still ${actual} until the resize engine lands` : ' · live raster matches'}
        . Color space waits on #532 ACES.
      </div>
    </div>
  );
}
