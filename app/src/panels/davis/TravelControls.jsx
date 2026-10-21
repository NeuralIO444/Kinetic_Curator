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
import { TRANSPORT_MODES } from '../../engine/travel.js';
import { DEFAULT_LAYOUT_PARAMS } from '../../data/layout-modes.js';

const MODE_TITLE = {
  still: 'STILL: marks stay where they were placed — today\'s motion exactly (breath and drift still ride on top)',
  flow: 'FLOW: each mark leaves home along the shared field, holds, and comes back on its leash',
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
              {m.toUpperCase()}
            </button>
          );
        })}
      </div>
      <div className="davis-travel-amounts">
        {amount('transportLeash', 'leash', 0.4, 'How far a mark may roam before the leash pulls it home (fraction of the canvas). 0 keeps it home')}
        {amount('transportFlow', 'flow', 1, 'Travel speed along the field. 0 keeps every mark home')}
        <RangeRow layout="stack" label="travellers" ariaLabel="travel travellers"
          value={lp.transportCeiling ?? DEFAULT_LAYOUT_PARAMS.transportCeiling} min={0} max={800} step={1}
          defaultValue={DEFAULT_LAYOUT_PARAMS.transportCeiling} readout={`${lp.transportCeiling ?? DEFAULT_LAYOUT_PARAMS.transportCeiling}`}
          hint="The most marks that may travel at once — a ceiling, not an amount: the governor decides how many actually roam under it (fewer on a busy frame or a smaller device)"
          disabled={off} disabledReason="Pick a travel mode first — STILL keeps every mark home"
          locked={locked.transportCeiling} onToggleLock={() => lock('transportCeiling')}
          onChange={(v) => set('transportCeiling', Math.round(v))} />
      </div>
    </div>
  );
}
