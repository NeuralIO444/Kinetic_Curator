import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.js';
import { emit, Events } from '../../composition/eventBus.js';
import { CANVAS_PRESETS, CANVAS_FPS, INSTRUMENT_CANVAS, ledRaster } from '../../data/canvasPresets.js';

// module-level so their identity is stable (the load effect lists `load`): canvas setup rides the bus
const apply = (id) => emit(Events.CANVAS_PRESET, { id });
const save = (label) => emit(Events.CANVAS_PRESET_SAVE, { label });
const remove = (id) => emit(Events.CANVAS_PRESET_DELETE, { id });
const rename = (id, label) => emit(Events.CANVAS_PRESET_RENAME, { id, label });
const load = () => emit(Events.CANVAS_PRESETS_LOAD);
const setFps = (fps) => emit(Events.CANVAS_FPS, { fps });
const setLock = (on) => emit(Events.CANVAS_ASPECT_LOCK, { on });
const swap = () => emit(Events.CANVAS_SWAP);
const setSize = (w, h, presetId) => emit(Events.CANVAS_SIZE, { w, h, presetId });

export function SetupBlock() {
  const w = useStore((s) => s.canvasW);
  const h = useStore((s) => s.canvasH);
  const fps = useStore((s) => s.canvasFps);
  const presetId = useStore((s) => s.canvasPresetId);
  const lock = useStore((s) => s.canvasAspectLock);
  const mine = useStore((s) => s.userCanvasPresets);
  const actual = `${INSTRUMENT_CANVAS.w}×${INSTRUMENT_CANVAS.h}`;
  const authored = `${w}×${h}`;
  const differ = authored !== actual;
  const [cab, setCab] = useState({ w: 4, h: 3, px: 128 });
  const [name, setName] = useState('My wall');
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="pipeline-setup">
      <div className="pipeline-section-label ttl" style={{ marginTop: 2 }}>
        canvas
      </div>
      <div className="pipeline-row">
        <span className="lbl" style={{ flex: 1, fontSize: 11 }}>
          canvas preset
        </span>
        <select value={presetId} onChange={(e) => apply(e.target.value)} style={{ maxWidth: 180 }}>
          {CANVAS_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.group} · {p.label}
            </option>
          ))}
          {(mine || []).map((p) => (
            <option key={p.id} value={p.id}>
              Mine · {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="pipeline-row">
        <span style={{ fontSize: 11 }}>W×H</span>
        <input
          type="number"
          value={w}
          style={{ width: 64, fontSize: 11 }}
          onChange={(e) => {
            const nw = Number(e.target.value);
            const nh = lock ? Math.round(nw * (h / w)) : h;
            setSize(nw, nh);
          }}
        />
        <span>×</span>
        <input
          type="number"
          value={h}
          style={{ width: 64, fontSize: 11 }}
          onChange={(e) => {
            const nh = Number(e.target.value);
            const nw = lock ? Math.round(nh * (w / h)) : w;
            setSize(nw, nh);
          }}
        />
        <button type="button" className={`act chip-btn${lock ? ' active' : ''}`} onClick={() => setLock(!lock)}>
          lock
        </button>
        <button type="button" className="chip-btn act" onClick={swap}>
          swap
        </button>
      </div>
      <div className="pipeline-row" title="Capture timestep. Live raf still follows the display.">
        <span className="lbl" style={{ flex: 1, fontSize: 11 }}>
          capture fps
        </span>
        <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
          {CANVAS_FPS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="pipeline-row">
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, fontSize: 11 }} />
        <button type="button" className="chip-btn act" onClick={() => save(name || 'My wall')}>
          save
        </button>
        {String(presetId).startsWith('mine-') && (
          <>
            <button type="button" className="chip-btn act" onClick={() => rename(presetId, name || 'My wall')}>
              rename
            </button>
            <button type="button" className="chip-btn act" onClick={() => remove(presetId)}>
              delete
            </button>
          </>
        )}
      </div>
      <div className="pipeline-hint" style={{ fontSize: 10, opacity: 0.7 }}>
        {authored} at {fps}fps · {Math.round((w * h * fps) / 1e6)} Mpx/s
        {differ ? ` · not the ${actual} instrument` : ''}
      </div>
      <div className="pipeline-section-label ttl" style={{ marginTop: 6 }}>
        led
      </div>
      <div
        className="pipeline-row"
        title="Cabinets across and down, times pixels per cabinet. Writes the native raster."
      >
        <span className="lbl" style={{ fontSize: 11 }}>
          cabinets
        </span>
        <input
          type="number"
          value={cab.w}
          style={{ width: 48, fontSize: 11 }}
          onChange={(e) => setCab({ ...cab, w: Number(e.target.value) })}
        />
        <span>×</span>
        <input
          type="number"
          value={cab.h}
          style={{ width: 48, fontSize: 11 }}
          onChange={(e) => setCab({ ...cab, h: Number(e.target.value) })}
        />
        <span style={{ fontSize: 10 }}>px</span>
        <input
          type="number"
          value={cab.px}
          style={{ width: 56, fontSize: 11 }}
          onChange={(e) => setCab({ ...cab, px: Number(e.target.value) })}
        />
        <button
          type="button"
          className="chip-btn act"
          onClick={() => {
            const r = ledRaster(cab.w, cab.h, cab.px);
            setSize(r.w, r.h);
          }}
        >
          set size
        </button>
      </div>
      <div className="pipeline-hint" style={{ fontSize: 10, opacity: 0.7 }}>
        Syphon still does not send a frame from the browser.
      </div>
    </div>
  );
}
