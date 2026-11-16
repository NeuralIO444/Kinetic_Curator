// WetLabDealStrip.jsx — #2232 step 3: the WetLab's KIN strip. The auto-generate: press KIN, get a hand of creatures,
// tap one to bank it, then modify it with the lab's own tools. Hand-picking (assemble / breed) stays where it was.
//
// It runs the KINETIC engine over the creature adapter (deal/); this file is only the surface. The hand is a pure
// function of (project seed, press number, bank, width), so nothing but the press number is held here — a lab opened
// again deals the same first hand. A tap banks through the store's one door (bankDealtCreature → bankCreature).
import { useMemo, useState } from 'react';
import { useStore } from '../state/store.js';
import { ASSETS } from '../data/assets/index.js';
import { lookName, MAX_CREATURE_RECORDS } from '../engine/creatureAssembler.js';
import { OVERLAY_CAP } from '../assets/overlay.js';
import {
  CREATURE_SCOPES,
  KIN_DEFAULT_SCOPE,
  dealLibrary,
  kinPress,
  nextKinScope,
  unkeptIds,
  bodySvgOf,
} from './wetLabDeal.mjs';

const label = (scope) => (CREATURE_SCOPES.find((s) => s.id === scope) || CREATURE_SCOPES[0]).label;

export function WetLabDealStrip({ onTap }) {
  const seed = useStore((s) => s.seed);
  const bank = useStore((s) => s.creatureRecords);
  const customAssets = useStore((s) => s.customAssets);
  const assetAttach = useStore((s) => s.assetAttach);
  const enabledAssets = useStore((s) => s.enabledAssets);
  const note = useStore((s) => s.creatureDealNote);
  const bankDealt = useStore((s) => s.bankDealtCreature);
  const removeRecord = useStore((s) => s.removeCreatureRecord);
  const [scope, setScope] = useState(KIN_DEFAULT_SCOPE);
  const [pressN, setPressN] = useState(0); // the lab's press counter: the nth press is the nth hand, re-derivable
  const [hand, setHand] = useState(null); // null = not pressed yet
  const [dealtIds, setDealtIds] = useState([]); // what this strip banked this session (the "unkept" pool)
  const library = useMemo(() => dealLibrary(ASSETS, customAssets), [customAssets]);
  const banked = new Set((bank || []).map((r) => r.id));
  const unkept = unkeptIds(dealtIds, bank, enabledAssets);

  const press = () => {
    const r = kinPress({ scope, seed, press: pressN, library, assetAttach, bank });
    setHand(r.hand);
    setPressN(pressN + 1);
  };
  const tap = (rec) => {
    bankDealt(rec);
    const st = useStore.getState().creatureDealNote;
    if (st && (st.status === 'banked' || st.status === 'already')) {
      setDealtIds((ids) => (ids.includes(rec.id) ? ids : [...ids, rec.id]));
      if (onTap) onTap(rec.id);
    }
  };
  const clearUnkept = () => {
    for (const id of unkept) removeRecord(id);
    setDealtIds((ids) => ids.filter((id) => !unkept.includes(id)));
  };

  return (
    <div style={strip} data-testid="kin-strip">
      <span style={ctl}>
        <button
          type="button"
          className="chip-btn act"
          data-testid="kin-scope"
          title="How wide the deal reaches: OFF the curated sets · WEAK the whole library · MED also breeds from the bank (three or more) · KOZ adds extra mutation. Tap to step."
          onClick={() => setScope(nextKinScope(scope))}
        >
          {label(scope)}
        </button>
        <button
          type="button"
          className="chip-btn act"
          style={kinBtn}
          data-testid="kin-press"
          title="Deal a hand of creatures at this width"
          onClick={press}
        >
          KIN
        </button>
      </span>
      <div style={scroll}>
        <div style={row} data-testid="kin-hand">
          {hand === null && <span style={hint}>press KIN — a hand of creatures to pick from</span>}
          {hand !== null && hand.length === 0 && (
            <span style={hint}>nothing viable came up at this width — press again</span>
          )}
          {(hand || []).map((rec) => {
            const svg = bodySvgOf(rec, library);
            const on = banked.has(rec.id);
            return (
              <button
                key={rec.id}
                type="button"
                style={{ ...tile, ...(on ? tileOn : null) }}
                data-testid="kin-tile"
                aria-pressed={on}
                title={`${rec.id} · ${lookName(rec.look) || rec.look} · tap to ${on ? 'select' : 'bank'} it`}
                onClick={() => tap(rec)}
              >
                {svg ? (
                  <svg
                    viewBox="0 0 100 100"
                    width="44"
                    height="44"
                    style={{ display: 'block', margin: '0 auto' }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                ) : (
                  <span style={{ display: 'block', height: 44, lineHeight: '44px', color: 'var(--dim)' }}>—</span>
                )}
                <span style={tileId}>{on ? 'banked' : rec.id}</span>
              </button>
            );
          })}
        </div>
      </div>
      <span style={ctl}>
        <button
          type="button"
          className="chip-btn act"
          data-testid="kin-clear"
          disabled={unkept.length === 0}
          title="Remove the creatures this strip banked that you have not turned on for the stage"
          onClick={clearUnkept}
        >
          clear unkept{unkept.length ? ` · ${unkept.length}` : ''}
        </button>
        <span style={status} role="status" data-testid="kin-note">
          {note && note.status === 'full' && `the bank is full (${MAX_CREATURE_RECORDS}) — clear unkept or remove one`}
          {note &&
            note.status === 'pool-full' &&
            `the asset pool is full (${OVERLAY_CAP}) — clear unkept, or remove an import or a creature`}
          {note && note.status === 'nobody' && 'that creature could not be drawn — pick another'}
          {note && note.status === 'id-taken' && 'an import already holds that name — pick another'}
        </span>
      </span>
    </div>
  );
}

const strip = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderTop: '1px solid var(--line)',
  flex: '0 0 auto',
};
const ctl = { display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto', alignItems: 'stretch' };
const kinBtn = { fontWeight: 700, letterSpacing: '0.08em' };
const scroll = { flex: '1 1 auto', minWidth: 0, overflowX: 'auto' };
const row = {
  display: 'flex',
  gap: 6,
  width: 'max-content',
  minHeight: 72,
  alignItems: 'center',
  margin: '0 auto',
  padding: '2px 0',
};
const hint = { color: 'var(--dim)', fontSize: 10, letterSpacing: '0.06em' };
const tile = {
  position: 'relative',
  width: 76,
  padding: '4px 2px',
  background: 'transparent',
  border: '1px solid var(--line)',
  color: 'var(--ink)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const tileOn = { borderColor: 'var(--accent)' };
const tileId = {
  display: 'block',
  fontSize: 8,
  color: 'var(--dim)',
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const status = { fontSize: 9, color: 'var(--dim)', maxWidth: 160 };
