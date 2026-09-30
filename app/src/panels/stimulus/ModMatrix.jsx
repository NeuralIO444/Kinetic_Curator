// MATRIX (#613) — which sound drives what, live. One row per real route
// (audioRoutes.mjs, the same function the live loop renders with): the
// route's raw gain on the left, what it contributes right now on the right.
// Inputs with no route today (MID, TREBLE) are listed honestly as unrouted.
// Audio off → every live value reads 0.
import { audioMatrixRows } from '../../gl/audioRoutes.mjs';
import { getShapedBands } from '../../gl/bandFeed.mjs';

const fmt = (v) => (v >= 10 ? v.toFixed(1) : v.toFixed(3));

export function ModMatrix({ audioBands, beatPulse, audioEnabled, depth, scaleMod, alphaMod, routes = null }) {
  // #790: the rows follow the scene's route table (null = today's default routes)
  const rows = audioMatrixRows({ ...audioBands, beatPulse }, { depth, scaleMod, alphaMod }, audioEnabled, routes, getShapedBands()); // bands: exactly what the loop fed
  return (
    <div className="stim-matrix" role="table" aria-label="Modulation matrix">
      <div className="stim-matrix-head" role="row">
        <span>ROUTE</span><span>DEPTH</span><span>LIVE</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className={`stim-matrix-row ${r.target ? '' : 'unrouted'}`} role="row">
          <span className="stim-matrix-route">{r.input} ▸ {r.target || '—'}</span>
          <span className="stim-matrix-depth">{r.target ? `×${fmt(r.depth)}` : 'not routed'}</span>
          <span className="stim-matrix-live">
            {r.target && (
              <>
                <i className="stim-matrix-bar"><b style={{ width: `${r.depth > 0 ? Math.min(100, (r.live / r.depth) * 100) : 0}%` }} /></i>
                {fmt(r.live)}
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
