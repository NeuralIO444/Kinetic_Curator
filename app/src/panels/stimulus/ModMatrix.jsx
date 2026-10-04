// MATRIX (#613, editable in #790) — which sound drives what, live, and yours to
// change. One row per route: pick an input (a sound or one of the seven meter
// bands), pick a target, set a depth; the LIVE bar shows what that route
// contributes right now. The rows come from the same function the live loop
// renders with (audioRoutes.mjs), so the panel can't drift from the picture.
//
// The table is scene-level (saved with the project, undoable). Untouched, it is
// today's routes; the first edit customises it; RESET goes back to the default.
import { audioMatrixRows, ROUTE_TARGETS, COARSE_INPUTS, BAND_INPUTS, MAX_ROUTES } from '../../gl/audioRoutes.mjs';
import { getShapedBands } from '../../gl/bandFeed.mjs';
import { useStore } from '../../state/store.js';
import { editableRoutes, nextRoute, patchRoute, removeRoute, routeDepthRange, defaultDepthFor } from '../../data/audioRoutes.js';

const fmt = (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(3));
const INPUT_LABEL = (id) => (id.startsWith('band.') ? `BAND ${id.slice(5).toUpperCase()}` : id.toUpperCase());
// glow is the DOM frame glow (box-shadow), not a GL glow: the picker says so.
// #790 PR5: only targets the live loop consumes get picker options — the rest
// (hue, squash, kineme, sun) land one PR each and stay out till then.
const TARGET_LABEL = { 'render.scale': 'scale', 'render.alpha': 'alpha', 'render.breath': 'breath', 'render.glow': 'frame glow', 'render.accum': 'accum trails' };
const PICKABLE_TARGETS = Object.keys(ROUTE_TARGETS).filter((id) => TARGET_LABEL[id]);

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
        <input type="range" aria-label={`Route ${index + 1} depth`} min={range.min} max={range.max} step={range.step} value={shown}
          onChange={(e) => onEdit((t) => patchRoute(t, index, { depth: Number(e.target.value) }), true)}
          onDoubleClick={() => onEdit((t) => patchRoute(t, index, { depth: defaultDepthFor(route.input, route.target) }), false)} />
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
  return (
    <div className="stim-matrix" role="table" aria-label="Modulation matrix">
      <div className="stim-matrix-head" role="row">
        <span>ROUTE</span><span>DEPTH</span><span>LIVE</span><span />
      </div>
      {table.length === 0 && <div className="stim-matrix-empty">No routes: sound drives nothing. Add one below, or click a band in the meter.</div>}
      {rows.map((row, i) => (
        <Row key={i} row={row} route={table[i]} index={i} table={table} onEdit={editAudioRoutes} />
      ))}
      <div className="stim-matrix-foot">
        <button type="button" className="chip-btn" disabled={full} onClick={() => editAudioRoutes((t) => { const r = nextRoute(t); return r ? [...t, r] : t; }, false)}
          title={full ? `A table holds at most ${MAX_ROUTES} routes` : 'Add a route'}>+ ROUTE</button>
        <button type="button" className="chip-btn" disabled={table.length === 0} onClick={() => setAudioRoutes([])}
          title={table.length === 0 ? 'Already empty' : 'Remove every route: start from scratch'}>CLEAR</button>
        <button type="button" className="chip-btn" disabled={!custom} onClick={() => setAudioRoutes(null)}
          title={custom ? 'Back to the default routes' : 'Already the default routes'}>RESET</button>
        <span className="stim-matrix-count">{table.length}/{MAX_ROUTES}</span>
        {unrouted.length > 0 && <span className="stim-matrix-unrouted" title="Inputs no route reads">not routed: {unrouted.map((id) => id.toUpperCase()).join(' · ')}</span>}
      </div>
    </div>
  );
}
