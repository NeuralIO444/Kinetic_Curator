// WetLabBeastStrip.jsx — #2232 step 7: KIN and CUR for beasts, under the WetLab's bank rail (beside + BEAST).
//
// The same two buttons as the creature strip, run over the beast adapter (deal/beastAdapter.mjs): KIN deals a hand of six
// Strandbeest linkages; the lead beast lands in the asset pool at once (a pool tile, like ASSEMBLE A BEAST makes), and the
// other five wait here, walking, one tap to bank. CUR narrows from the beast last banked or tapped: three close
// neighbours, best gait first, the pick marked. ASSEMBLE A BEAST stays where it was.
//
// The hand is a pure function of (project seed, press number, width); only the press numbers are held here. The tiles walk:
// one shared clock turns every tile's crank, and stands still for a viewer who asked the system for less motion.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store.js';
import { OVERLAY_CAP } from '../assets/overlay.js';
import {
  BEAST_SCOPES,
  BEAST_KIN_DEFAULT_SCOPE,
  CUR_CAPS,
  beastKinPress,
  beastCurPress,
  beastSubject,
  beastKey,
  nextBeastScope,
  walkPath,
  unkeptBeastIds,
} from './beastDeal.mjs';
import { nextCurCap, CUR_DEFAULT_CAP } from './wetLabDeal.mjs';

const label = (scope) => (BEAST_SCOPES.find((s) => s.id === scope) || BEAST_SCOPES[0]).label;
const WALK_FPS = 20;

/** One shared walking clock, in seconds; 0 and still when there is nothing to draw or the viewer prefers less motion. */
function useWalkClock(active) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function')
      return undefined;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = 0;
    let start = null;
    let last = -Infinity;
    const frame = (now) => {
      if (start === null) start = now;
      if (now - last >= 1000 / WALK_FPS) {
        last = now;
        setT((now - start) / 1000);
      }
      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(raf);
  }, [active]);
  return t;
}

export function WetLabBeastStrip({ onKeep } = {}) {
  const seed = useStore((s) => s.seed);
  const customAssets = useStore((s) => s.customAssets);
  const enabledAssets = useStore((s) => s.enabledAssets);
  const note = useStore((s) => s.beastDealNote);
  const bankBeast = useStore((s) => s.bankDealtBeast);
  const removeAsset = useStore((s) => s.removeCustomAsset);
  const [scope, setScope] = useState(BEAST_KIN_DEFAULT_SCOPE);
  const [pressN, setPressN] = useState(0);
  const [hand, setHand] = useState(null); // null = not pressed yet; else measure sets
  const [handKind, setHandKind] = useState('kin');
  const [picked, setPicked] = useState(null); // CUR's marked pick (a beast key)
  const [cap, setCap] = useState(CUR_DEFAULT_CAP);
  const [curN, setCurN] = useState(0);
  const [lastId, setLastId] = useState(null); // the beast last banked or tapped: CUR narrows from it
  const [dealtIds, setDealtIds] = useState([]); // what this strip banked this session (the "unkept" pool)
  const standing = useMemo(() => new Set((customAssets || []).map((a) => a && a.id)), [customAssets]);
  const subject = beastSubject(customAssets, lastId);
  const unkept = unkeptBeastIds(dealtIds, customAssets, enabledAssets);
  const t = useWalkClock(!!hand && hand.length > 0);

  // `chosen`: the artist tapped this tile. The lead a KIN press lands by itself is not a keep (#2283): only a choice
  // fills the ladder's pips.
  const tap = (m, chosen = false) => {
    bankBeast(m);
    const st = useStore.getState().beastDealNote;
    if (chosen && st && st.status === 'banked' && onKeep) onKeep();
    if (st && (st.status === 'banked' || st.status === 'already')) {
      if (st.status === 'banked') setDealtIds((ids) => (ids.includes(st.id) ? ids : [...ids, st.id]));
      setLastId(st.id);
    }
  };
  const press = () => {
    const h = beastKinPress({ scope, seed, press: pressN });
    setHand(h);
    setHandKind('kin');
    setPicked(null);
    setPressN(pressN + 1);
    // the lead beast lands in the pool at once, like a KINETIC deal on the main stage; the rest wait in the hand
    if (h.length) tap(h[0]);
  };
  const narrowPress = () => {
    const r = beastCurPress({ subject: subject && subject.measures, cap, seed, press: curN });
    setHand(r.hand);
    setHandKind('cur');
    setPicked(r.picked ? beastKey(r.picked) : null);
    setCurN(curN + 1);
  };
  const clearUnkept = () => {
    for (const id of unkept) removeAsset(id);
    setDealtIds((ids) => ids.filter((id) => !unkept.includes(id)));
  };

  return (
    <div style={strip} data-testid="beast-strip">
      <span style={ctl}>
        <span style={tag}>beasts</span>
        <span style={ctlRow}>
          <button
            type="button"
            className="chip-btn act"
            data-testid="beast-scope"
            title="How far a dealt beast may stray from the wild type: TAME a little (like ASSEMBLE A BEAST) · LOOSE · WILD · FERAL the whole range. Tap to step."
            onClick={() => setScope(nextBeastScope(scope))}
          >
            {label(scope)}
          </button>
          <button
            type="button"
            className="chip-btn act"
            style={kinBtn}
            data-testid="beast-kin"
            title="Deal a hand of beasts at this width; the first one lands in the asset pool"
            onClick={press}
          >
            KIN
          </button>
        </span>
        <span style={ctlRow}>
          <button
            type="button"
            className="chip-btn act"
            data-testid="beast-cur-cap"
            title="How close CUR's neighbours stay to the beast it narrows from: TIGHT changes at most 10% of its measures, NEAR 25%, LOOSE 50%. Tap to step."
            onClick={() => setCap(nextCurCap(cap))}
          >
            {(CUR_CAPS.find((c) => c.id === cap) || CUR_CAPS[1]).label}
          </button>
          <button
            type="button"
            className="chip-btn act"
            style={kinBtn}
            data-testid="beast-cur"
            disabled={!subject}
            title={
              subject
                ? 'Deal three close neighbours of the beast you last banked; the one with the steadiest gait is marked'
                : 'Press KIN or ASSEMBLE A BEAST first — CUR narrows from a beast in the pool'
            }
            onClick={narrowPress}
          >
            CUR
          </button>
        </span>
      </span>
      <div style={scroll}>
        <div style={row} data-testid="beast-hand">
          {hand === null && (
            <span style={hint}>press KIN — a beast lands in the pool, the rest of the hand walks here</span>
          )}
          {hand !== null && hand.length === 0 && (
            <span style={hint}>
              {handKind === 'cur'
                ? 'no neighbour came up within that closeness — press again, or loosen it'
                : 'nothing walked at this width — press again, or narrow it'}
            </span>
          )}
          {(hand || []).map((m) => {
            const key = beastKey(m);
            const d = walkPath(m, t);
            const on = standing.has(key);
            return (
              <button
                key={key}
                type="button"
                style={{ ...tile, ...(on ? tileOn : null) }}
                data-testid="beast-tile"
                aria-pressed={on}
                title={`${key} · ${m.legCount} legs${key === picked ? ' · CUR’s pick' : ''} · tap to ${on ? 'select' : 'bank'} it`}
                onClick={() => tap(m, true)}
              >
                <svg viewBox="4 34 80 28" width="68" height="24" style={{ display: 'block', margin: '6px auto' }}>
                  {d && <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
                </svg>
                {key === picked && (
                  <span style={pickMark} data-testid="beast-pick">
                    pick
                  </span>
                )}
                <span style={tileId}>{on ? 'banked' : key.replace('user:', '')}</span>
              </button>
            );
          })}
        </div>
      </div>
      <span style={ctl}>
        <button
          type="button"
          className="chip-btn act"
          data-testid="beast-clear"
          disabled={unkept.length === 0}
          title="Remove the beasts this strip banked that you have not turned on for the stage"
          onClick={clearUnkept}
        >
          clear unkept{unkept.length ? ` · ${unkept.length}` : ''}
        </button>
        <span style={status} role="status" data-testid="beast-deal-note">
          {note &&
            note.status === 'pool-full' &&
            `the asset pool is full (${OVERLAY_CAP}) — clear unkept, or remove an import`}
          {note && note.status === 'nobody' && 'that beast could not be drawn — pick another'}
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
const ctlRow = { display: 'flex', gap: 4 };
const pickMark = {
  position: 'absolute',
  top: 2,
  left: 3,
  fontSize: 8,
  letterSpacing: '0.08em',
  color: 'var(--accent)',
};
const tag = { fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)' };
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
