// TravelControls — #1574 travel kinemes: the DIRECTORS motion group's travel row.
//
// Controls home RULED (Matt, 2026-10-14, on #1574): playing with motion is a Directors-panel realm, and BUILD is
// crowded — the scene-level travel controls live HERE, beside the #1128 DIRECTOR pattern selector, and nowhere
// else. The values are layoutParams (recipe data: saved, crowned, replayed, censused) written through the same
// LAYOUT_PARAM door as every neighbour, so they record into takes like any hand on a dial. They edit the ACTIVE
// stratum, like the pattern selector beside them.
//
// Discrete choices (the transport mode) render TE (DS rule 2); the amounts are the house slider (RangeRow).
import { useApp } from '../../state/AppContext.jsx';
import { emit, Events } from '../../composition/eventBus.js';
import { RangeRow } from '../../components/RangeRow.jsx';
import { TRANSPORT_MODES, PATH_KINDS } from '../../engine/travel.js';
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';

const MODE_TITLE = {
  auto: 'AUTO: each mark\'s family decides — linework flows, glyphs travel the path below, heavy solids stay home',
  still: 'STILL: marks stay where they were placed — today\'s motion exactly (breath and drift still ride on top)',
  flow: 'FLOW: each mark leaves home along the shared field, holds, and comes back on its leash',
  path: 'PATH: every mark travels the path family below — orbit, spiral, sweep or lissajous',
};
const MODE_LABEL = { auto: 'AUTO', still: 'STILL', flow: 'FLOW', path: 'PATH' };
const PATH_LABEL = { orbit: 'ORBIT', spiral: 'SPIRAL', sweep: 'SWEEP', lissajous: 'LISSAJOUS' };
const PATH_TITLE = {
  orbit: 'ORBIT: the stratum swirls around the dish centre',
  spiral: 'SPIRAL: each mark circles on a breathing radius',
  sweep: 'SWEEP: marks run a shared lane across the stratum and wrap',
  lissajous: 'LISSAJOUS: a two-sine weave',
};

const pct = (v) => `${Math.round(v * 100)}`;

export function TravelControls() {
  const { state } = useApp((s) => ({ layoutParams: s.layoutParams, lockedParams: s.lockedParams }));
  const lp = state.layoutParams || {};
  const locked = state.lockedParams || {};
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const mode = TRANSPORT_MODES.includes(lp.transport) ? lp.transport : 'still';
  const off = mode === 'still';
  const pathKind = PATH_KINDS.includes(lp.transportPath) ? lp.transportPath : 'orbit';
  const pathOff = mode === 'still' || mode === 'flow';
  const amount = (key, label, max, hint) => (
    <RangeRow layout="stack" label={label} ariaLabel={`travel ${label}`}
      value={lp[key] ?? DEFAULT_LAYOUT_PARAMS[key]} min={0} max={max} step={0.01}
      defaultValue={DEFAULT_LAYOUT_PARAMS[key]} readout={pct(lp[key] ?? DEFAULT_LAYOUT_PARAMS[key])}
      hint={hint} disabled={off} disabledReason="Pick a travel mode first — STILL keeps every mark home"
      locked={locked[key]} onToggleLock={() => lock(key)}
      onChange={(v) => set(key, v)} />
  );
  return (
    <div className="davis-travel">
      <div className="davis-actions davis-actions-travel" role="group" aria-label="travel mode">
        <i className="lbl" title="Travel kinemes: marks that leave home and come back">travel</i>
        {TRANSPORT_MODES.map((m) => {
          const on = mode === m;
          return (
            <button key={m} type="button" className={`big-btn ${on ? 'active' : ''}`} aria-pressed={on}
              aria-label={`${m} travel`} title={MODE_TITLE[m]}
              onClick={() => set('transport', m)}>
              {MODE_LABEL[m]}
            </button>
          );
        })}
      </div>
      {/* #1575 — the PATH family: used by PATH, and by AUTO for the glyph family */}
      <div className="davis-actions davis-actions-travel" role="group" aria-label="travel path">
        <i className="lbl" title="The path family PATH (and AUTO's glyphs) travel">path</i>
        {PATH_KINDS.map((k) => {
          const on = pathKind === k;
          return (
            <button key={k} type="button" className={`big-btn ${on ? 'active' : ''}`} aria-pressed={on}
              aria-label={`${k} path`} title={pathOff ? 'Pick PATH or AUTO to use a path family' : PATH_TITLE[k]}
              disabled={pathOff} onClick={() => set('transportPath', k)}>
              {PATH_LABEL[k]}
            </button>
          );
        })}
      </div>
      <div className="davis-travel-amounts">
        {amount('transportLeash', 'leash', 0.4, 'How far this stratum\'s marks may roam before the leash pulls them home (fraction of the canvas). Per stratum: the ground can stay tight while the front roams. 0 keeps them home')}
        {amount('transportFlow', 'flow', 1, 'Travel speed along the field. 0 keeps every mark home')}
        <RangeRow layout="stack" label="travellers" ariaLabel="travel travellers"
          value={lp.transportCeiling ?? DEFAULT_LAYOUT_PARAMS.transportCeiling} min={0} max={800} step={1}
          defaultValue={DEFAULT_LAYOUT_PARAMS.transportCeiling} readout={`${lp.transportCeiling ?? DEFAULT_LAYOUT_PARAMS.transportCeiling}`}
          hint="The most marks that may travel at once — a ceiling, not an amount: the governor decides how many actually roam under it (fewer on a busy frame or a smaller device)"
          disabled={off} disabledReason="Pick a travel mode first — STILL keeps every mark home"
          locked={locked.transportCeiling} onToggleLock={() => lock('transportCeiling')}
          onChange={(v) => set('transportCeiling', Math.round(v))} />
        {/* #1576 — parallax drift and the surge depth: independent of the travel mode (a STILL scene can drift) */}
        <RangeRow layout="stack" label="drift" ariaLabel="travel drift"
          value={lp.transportParallax ?? 0} min={0} max={1} step={0.01} defaultValue={0}
          readout={pct(lp.transportParallax ?? 0)}
          hint="Parallax drift: the whole stratum slides slowly through space, front tiers faster than the ground. 0 = off"
          locked={locked.transportParallax} onToggleLock={() => lock('transportParallax')}
          onChange={(v) => set('transportParallax', v)} />
        <RangeRow layout="stack" label="surge" ariaLabel="travel surge"
          value={lp.transportSurge ?? 0} min={0} max={1} step={0.01} defaultValue={0}
          readout={pct(lp.transportSurge ?? 0)}
          hint="How far this stratum answers a surge when one comes: marks draw back, come forward, and go home. 0 = never"
          locked={locked.transportSurge} onToggleLock={() => lock('transportSurge')}
          onChange={(v) => set('transportSurge', v)} />
      </div>
    </div>
  );
}
