// MATRIX (#613, editable in #790) — which sound drives what, live, and yours to
// change. One row per route: pick an input (a sound or one of the seven meter
// bands), pick a target, set a depth; the LIVE bar shows what that route
// contributes right now. The rows come from the same function the live loop
// renders with (audioRoutes.mjs), so the panel can't drift from the picture.
//
// The table is scene-level (saved with the project, undoable). Untouched, it is
// today's routes; the first edit customises it; RESET goes back to the default.
//
// #980 — AUTO listens to the live input and writes a starter that uses bands
// with energy. RETUNE watches for dead routes (silent input, or depth ~ 0)
// and offers a one-tap fix. Neither runs unless you tap.
import { useEffect, useRef, useState } from 'react';
import { RangeRow } from '../../components/RangeRow.jsx';
import { audioMatrixRows, ROUTE_TARGETS, COARSE_INPUTS, BAND_INPUTS, MAX_ROUTES } from '../../gl/audioRoutes.mjs';
import { getShapedBands } from '../../gl/bandFeed.mjs';
import { absorbPeaks, autoSetupRoutes, deadRouteIndexes, ENERGY_FLOOR, inputEnergy, retuneRoutes, snapshotFromReads } from '../../gl/stimuliAuto.mjs';
import { readMeterBandLevels } from '../../hooks/audioMeterTap.js';
import { useStore } from '../../state/store.js';
import { editableRoutes, nextRoute, patchRoute, removeRoute, routeDepthRange, defaultDepthFor } from '../../data/audioRoutes.js';
import { emit, Events } from '../../composition/eventBus.js';

const fmt = (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(3));
const INPUT_LABEL = (id) => (id.startsWith('band.') ? `BAND ${id.slice(5).toUpperCase()}` : id.toUpperCase());
// glow is the DOM frame glow (box-shadow), not a GL glow: the picker says so.
// #790: only targets the live loop consumes get picker options (all #790 targets shipped).
const TARGET_LABEL = { 'render.scale': 'scale', 'render.alpha': 'alpha', 'render.breath': 'breath', 'render.glow': 'frame glow', 'render.accum': 'accum trails', 'color.hue': 'hue rotate', 'clock.kinemeRate': 'kineme rate', 'light.intensity': 'light', 'render.squash': 'squash' };
const PICKABLE_TARGETS = Object.keys(ROUTE_TARGETS).filter((id) => TARGET_LABEL[id]);
const LISTEN_MS = 1500;
const LISTEN_CAP_MS = 8000;
// #980 spec item 5, voice 3: what AUTO and RETUNE both say when there is
// nothing to route. They say it and change nothing.
const NO_SIGNAL = 'no signal — turn the mic on and play something';

function Row({ row, route, index, table, onEdit }) {
  const range = routeDepthRange(route.target);
  const shown = Math.round(route.depth * 10000) / 10000; // 0.55 × 0.28 is not 0.154 in floats
  const taken = (input, target) => table.some((r, j) => j !== index && r.input === input && r.target === target);
  const fill = row.depth !== 0 ? Math.min(100, Math.abs(row.live / row.depth) * 100) : 0;
  return (
    <div className="stim-route" role="row">
      <span className="stim-route-pick">
        <select aria-label={`Route ${index + 1} input`} className="blend-mode-select" value={route.input}
          onChange={(e) => onEdit((t) => patchRoute(t, index, { input: e.target.value }), false)}>
          <optgroup label="SOUND">
            {COARSE_INPUTS.map((id) => <option key={id} value={id} disabled={taken(id, route.target)}>{INPUT_LABEL(id)}</option>)}
          </optgroup>
          <optgroup label="BANDS">
            {BAND_INPUTS.map((id) => <option key={id} value={id} disabled={taken(id, route.target)}>{INPUT_LABEL(id)}</option>)}
          </optgroup>
        </select>
        <i aria-hidden="true">▸</i>
        <select aria-label={`Route ${index + 1} target`} className="blend-mode-select" value={route.target}
          onChange={(e) => onEdit((t) => patchRoute(t, index, { target: e.target.value, depth: defaultDepthFor(route.input, e.target.value) }), false)}>
          {PICKABLE_TARGETS.map((id) => <option key={id} value={id} disabled={taken(route.input, id)}>{TARGET_LABEL[id]}</option>)}
        </select>
      </span>
      <span className="stim-route-depth" title={`effective gain ×${fmt(row.depth)} after the master DEPTH / SCALE / ALPHA knobs · double-click to reset`}>
        <RangeRow layout="bare" tone="stim" ariaLabel={`Route ${index + 1} depth`} min={range.min} max={range.max} step={range.step} value={shown}
          onChange={(v) => onEdit((t) => patchRoute(t, index, { depth: v }), true)}
          onReset={() => onEdit((t) => patchRoute(t, index, { depth: defaultDepthFor(route.input, route.target) }), false)} />
        <input type="number" aria-label={`Route ${index + 1} depth value`} min={range.min} max={range.max} step={range.step} value={shown}
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onEdit((t) => patchRoute(t, index, { depth: v }), true); }} />
      </span>
      <span className="stim-matrix-live">
        <i className="stim-matrix-bar"><b style={{ width: `${fill}%` }} /></i>
        {fmt(row.live)}
      </span>
      <button type="button" className="micro-btn stim-route-x" aria-label={`Remove route ${index + 1}`} title="Remove this route"
        onClick={() => onEdit((t) => removeRoute(t, index), false)}>×</button>
    </div>
  );
}

function readSnap() {
  const s = useStore.getState();
  const shaped = getShapedBands();
  const meter = readMeterBandLevels() || shaped;
  return snapshotFromReads({ audioBands: s.audioBands, beatPulse: s.beatPulse, meter });
}

export function ModMatrix({ audioBands, beatPulse, audioEnabled, depth, scaleMod, alphaMod, routes = null }) {
  const editAudioRoutes = useStore((s) => s.editAudioRoutes);
  const setAudioRoutes = useStore((s) => s.setAudioRoutes);
  const table = editableRoutes(routes); // the scene's table, or a copy of the default
  // the rows follow the table; bands: exactly what the loop fed
  const rows = audioMatrixRows({ ...audioBands, beatPulse }, { depth, scaleMod, alphaMod }, audioEnabled, table, getShapedBands());
  const custom = Array.isArray(routes);
  const full = table.length >= MAX_ROUTES;
  const used = new Set(table.map((r) => r.input));
  const unrouted = COARSE_INPUTS.filter((id) => !used.has(id));
  const [status, setStatus] = useState(null);
  const [advice, setAdvice] = useState(null);
  const listenRef = useRef(0);

  useEffect(() => () => { listenRef.current += 1; }, []);

  // Retune agent: while audio is on, notice routes parked on silence or depth ~ 0.
  // Suggest only — a tap applies the fix (one undo step). Nothing is cleared in
  // the effect body (react-hooks/set-state-in-effect): with audio off there is
  // no watch and the suggestion is simply not shown — derived at render below.
  useEffect(() => {
    if (!audioEnabled) return undefined;
    const id = setInterval(() => {
      const live = editableRoutes(useStore.getState().audioRoutes);
      const snap = readSnap();
      const dead = deadRouteIndexes(live, snap);
      const hot = inputEnergy('level', snap) >= ENERGY_FLOOR
        || ['beat', 'bass', 'mid', 'treble'].some((id) => inputEnergy(id, snap) >= ENERGY_FLOOR)
        || Object.values(snap.bands || {}).some((v) => v >= ENERGY_FLOOR);
      if (!hot || dead.length === 0) { setAdvice(null); return; }
      const names = dead.map((i) => INPUT_LABEL(live[i].input)).filter((v, i, a) => a.indexOf(v) === i);
      setAdvice({ dead: dead.length, names });
    }, 1000);
    return () => clearInterval(id);
  }, [audioEnabled, routes]);

  // Audio off ⇒ no watch ran, so any advice on file is stale (a 1s-old
  // suggestion at worst); the interval refreshes it as soon as audio returns.
  const shownAdvice = audioEnabled ? advice : null;

  // Masters that would bury a starter. Raised only when a starter is actually
  // applied: with audio off or with no signal, AUTO changes nothing (#980).
  const armMasters = () => {
    if (depth < 0.25) emit(Events.LAYOUT_PARAM, { key: 'audioModDepth', value: 0.65 });
    if (scaleMod < 0.2) emit(Events.LAYOUT_PARAM, { key: 'audioScaleMod', value: 0.45 });
    if (alphaMod < 0.15) emit(Events.LAYOUT_PARAM, { key: 'audioAlphaMod', value: 0.25 });
    const gain = useStore.getState().audioGain;
    if (Number.isFinite(gain) && gain < 0.4) emit(Events.AUDIO_GAIN, 1);
  };

  const autoSetup = () => {
    // #980, spec item 5: audio off or signal silent ⇒ say so plainly, change
    // nothing. The listen only runs when there is something to listen to.
    if (!audioEnabled) { setStatus(NO_SIGNAL); return; }
    const token = ++listenRef.current;
    setStatus('listening');
    setAdvice(null);
    const started = performance.now();
    let peaks = null;
    const tick = () => {
      if (token !== listenRef.current) return;
      peaks = absorbPeaks(peaks, readSnap());
      const elapsed = performance.now() - started;
      if ((autoSetupRoutes(peaks).heard && elapsed >= LISTEN_MS) || elapsed >= LISTEN_CAP_MS) {
        const built = autoSetupRoutes(peaks);
        if (!built.heard) { setStatus(NO_SIGNAL); return; } // silence: nothing to route
        armMasters();
        setAudioRoutes(built.routes);
        setStatus(`routed ${built.picked.map(INPUT_LABEL).join(' · ')}`);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const retune = () => {
    const built = retuneRoutes(table, readSnap());
    if (built.changed) setAudioRoutes(built.routes);
    setStatus(built.note);
    setAdvice(null);
  };

  return (
    <div className="stim-matrix" role="table" aria-label="Modulation matrix">
      <div className="stim-matrix-head" role="row">
        <span className="lbl">route</span><span className="lbl">depth</span><span className="lbl">live</span><span />
      </div>
      {table.length === 0 && <div className="stim-matrix-empty">No routes: sound drives nothing. Add one below, or click a band in the meter.</div>}
      {rows.map((row, i) => (
        <Row key={i} row={row} route={table[i]} index={i} table={table} onEdit={editAudioRoutes} />
      ))}
      <div className="stim-matrix-foot">
        <button type="button" className="chip-btn act" onClick={autoSetup}
          title="Listen to the live input and build a starter routing from whatever has energy. No signal: it says so and changes nothing.">auto</button>
        <button type="button" className="chip-btn act" disabled={full} onClick={() => editAudioRoutes((t) => { const r = nextRoute(t); return r ? [...t, r] : t; }, false)}
          title={full ? `A table holds at most ${MAX_ROUTES} routes` : 'Add a route'}>+ route</button>
        <button type="button" className="chip-btn act" disabled={table.length === 0} onClick={() => setAudioRoutes([])}
          title={table.length === 0 ? 'Already empty' : 'Remove every route: start from scratch'}>clear</button>
        <button type="button" className="chip-btn act" disabled={!custom} onClick={() => setAudioRoutes(null)}
          title={custom ? 'Back to the default routes' : 'Already the default routes'}>reset</button>
        <span className="stim-matrix-count">{table.length}/{MAX_ROUTES}</span>
        {unrouted.length > 0 && <span className="stim-matrix-unrouted" title="Inputs no route reads">not routed: {unrouted.map((id) => id.toUpperCase()).join(' · ')}</span>}
      </div>
      {status && <div className="stim-matrix-unrouted" role="status">{status}</div>}
      {shownAdvice && (
        <div className="stim-matrix-unrouted" role="status">
          {shownAdvice.names.join(' · ')} {shownAdvice.dead === 1 ? 'is' : 'are'} silent.
          <button type="button" className="chip-btn act" onClick={retune} title="Move dead routes onto inputs that have energy, and raise a depth of 0">retune</button>
        </div>
      )}
    </div>
  );
}
