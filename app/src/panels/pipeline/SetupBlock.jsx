import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.js';
import { CANVAS_PRESETS, CANVAS_FPS, INSTRUMENT_CANVAS, ledRaster } from '../../data/canvasPresets.js';

export function SetupBlock() {
  const w = useStore((s) => s.canvasW);
  const h = useStore((s) => s.canvasH);
  const fps = useStore((s) => s.canvasFps);
  const presetId = useStore((s) => s.canvasPresetId);
  const lock = useStore((s) => s.canvasAspectLock);
  const mine = useStore((s) => s.userCanvasPresets);
  const apply = useStore((s) => s.applyCanvasPreset);
  const save = useStore((s) => s.saveCanvasPreset);
  const remove = useStore((s) => s.deleteCanvasPreset);
  const rename = useStore((s) => s.renameCanvasPreset);
  const load = useStore((s) => s.loadUserCanvasPresets);
  const setSize = useStore((s) => s.setCanvasSize);
  const setFps = useStore((s) => s.setCanvasFps);
  const setLock = useStore((s) => s.setCanvasAspectLock);
  const swap = useStore((s) => s.swapCanvasOrientation);
  const actual = `${INSTRUMENT_CANVAS.w}×${INSTRUMENT_CANVAS.h}`;
  const authored = `${w}×${h}`;
  const differ = authored !== actual;
  const [cab, setCab] = useState({ w: 4, h: 3, px: 128 });
  const [name, setName] = useState('My wall');
  useEffect(() => { load?.(); }, [load]);

  return (
    <div className="pipeline-setup">
      <div className="pipeline-row">
        <span style={{ flex: 1, fontSize: 11 }}>CANVAS PRESET</span>
        <select value={presetId} onChange={(e) => apply(e.target.value)} style={{ fontSize: 11, maxWidth: 180 }}>
          {CANVAS_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.group} · {p.label}</option>
          ))}
          {(mine || []).map((p) => (
            <option key={p.id} value={p.id}>Mine · {p.label}</option>
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
      <div className="pipeline-row" title="Cabinets across and down, times pixels per cabinet. Writes the native raster.">
        <span style={{ fontSize: 11 }}>LED</span>
        <input type="number" value={cab.w} style={{ width: 48, fontSize: 11 }} onChange={(e) => setCab({ ...cab, w: Number(e.target.value) })} />
        <span>×</span>
        <input type="number" value={cab.h} style={{ width: 48, fontSize: 11 }} onChange={(e) => setCab({ ...cab, h: Number(e.target.value) })} />
        <span style={{ fontSize: 10 }}>px</span>
        <input type="number" value={cab.px} style={{ width: 56, fontSize: 11 }} onChange={(e) => setCab({ ...cab, px: Number(e.target.value) })} />
        <button type="button" className="chip-btn" onClick={() => {
          const r = ledRaster(cab.w, cab.h, cab.px);
          setSize(r.w, r.h);
        }}>SET SIZE</button>
      </div>
      <div className="pipeline-row">
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, fontSize: 11 }} />
        <button type="button" className="chip-btn" onClick={() => save(name || 'My wall')}>SAVE</button>
        {String(presetId).startsWith('mine-') && (
          <>
            <button type="button" className="chip-btn" onClick={() => rename(presetId, name || 'My wall')}>RENAME</button>
            <button type="button" className="chip-btn" onClick={() => remove(presetId)}>DELETE</button>
          </>
        )}
      </div>
      <div className="pipeline-hint" style={{ fontSize: 10, opacity: 0.7 }}>
        Authored {authored} · live raster follows SETUP
        {differ ? '' : ''}
        . Color space waits on #532 ACES.
      </div>
    </div>
  );
}
