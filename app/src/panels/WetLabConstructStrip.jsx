// WetLabConstructStrip.jsx — the CONSTRUCT rung of the WetLab ladder (docs/design/wetlab-ladder-spec.md §13; issue #2301).
//
// KIN deals constructs built only from the artist's kept shapes of one style (the SHAPE shelf), once a style holds two
// of them; with none in play KIN is off and says what is missing. CUR deals recipes one change away from the last
// kept construct. Tapping a tile banks its record through the construct door (bankConstruct) and, when the bank grew,
// fills one of the rung's pips. Tiles settle into place on arrival and on hover; under reduced motion they are drawn
// settled. No toast, no sound, no score (spec §7).
//
// Not here (spec §13.4, checked for #2301): a KIN lead does not land on the stage. A banked construct record is never
// drawn into the asset pool today — only the house set is (engine/constructHouse.js) — so there is no tile to turn on.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import { ASSETS } from '../data/assets/index.js';
import { dealLibrary } from './wetLabDeal.mjs';
import { settledSvg } from './constructSettle.mjs';
import {
  constructKinPress,
  constructCurPress,
  nextConstructScope,
  constructSubject,
  constructStylesInPlay,
  assembleCandidate,
  constructKey,
  TOO_FEW_LINE,
  CONSTRUCT_FLOOR,
  CONSTRUCT_SCOPES,
  CONSTRUCT_DEFAULT_SCOPE,
} from './constructDeal.mjs';

const label = (scope) => (CONSTRUCT_SCOPES.find((s) => s.id === scope) || CONSTRUCT_SCOPES[0]).label;
const SETTLE_MS = 900;

const reducedMotion = () => {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
};

/** Run one settle, 0 → 1 over SETTLE_MS: every setT happens inside an animation frame, never during render. */
function animate(raf, setT) {
  cancelAnimationFrame(raf.current);
  if (reducedMotion()) {
    raf.current = requestAnimationFrame(() => setT(1));
    return;
  }
  let start = null;
  const step = (now) => {
    if (start === null) start = now;
    const u = Math.min(1, (now - start) / SETTLE_MS);
    setT(u);
    if (u < 1) raf.current = requestAnimationFrame(step);
  };
  raf.current = requestAnimationFrame(step);
}

/** One hand tile: its own settle clock, run on arrival and on hover. */
function ConstructTile({ record, svgOf, kept, picked, onKeep }) {
  const [t, setT] = useState(() => (reducedMotion() ? 1 : 0));
  const raf = useRef(0);
  const run = () => animate(raf, setT);
  useEffect(() => {
    const frame = raf; // the ref object, not its value: cleanup cancels whichever frame is pending then
    animate(frame, setT);
    return () => cancelAnimationFrame(frame.current);
  }, [record.id]);
  const svg = settledSvg(record, svgOf, t) || '';
  return (
    <button
      type="button"
      style={{ ...tile, ...(kept ? tileOn : null) }}
      data-testid="construct-tile"
      data-style={record.style}
      data-settled={t >= 1 ? 'true' : 'false'}
      aria-pressed={kept}
      title={`${record.id} · ${record.style} · ${record.parts.length} parts${picked ? ' · CUR’s pick' : ''} · tap to ${kept ? 'see it is kept' : 'keep it'}`}
      onClick={onKeep}
      onMouseEnter={run}
    >
      <svg
        viewBox="0 0 100 100"
        width="52"
        height="52"
        style={{ display: 'block', margin: '0 auto' }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {picked && (
        <span style={pickMark} data-testid="construct-pick">
          pick
        </span>
      )}
      <span style={tileId}>{kept ? 'kept' : record.style}</span>
    </button>
  );
}

export function WetLabConstructStrip({ onKeep } = {}) {
  const seed = useStore((s) => s.seed);
  const customAssets = useStore((s) => s.customAssets);
  const assetAttach = useStore((s) => s.assetAttach);
  const shelf = useStore((s) => s.shapeShelf);
  const bank = useStore((s) => s.constructRecords);
  const bankConstruct = useStore((s) => s.bankConstruct);

  const library = useMemo(() => dealLibrary(ASSETS, customAssets), [customAssets]);
  const byId = useMemo(() => new Map(library.map((a) => [a.id, a])), [library]);
  const ctx = useMemo(
    () => ({ shelf: shelf || [], findAsset: (id) => byId.get(id) || null, assetAttach: assetAttach || null }),
    [shelf, byId, assetAttach],
  );
  const svgOf = (id) => (byId.get(id) || {}).svg;

  const [scope, setScope] = useState(CONSTRUCT_DEFAULT_SCOPE);
  const [hand, setHand] = useState(null);
  const [handKind, setHandKind] = useState('kin');
  const [picked, setPicked] = useState(null);
  const [pressN, setPressN] = useState(0);
  const [curN, setCurN] = useState(0);
  const [lastKept, setLastKept] = useState(null);

  const inPlay = constructStylesInPlay(shelf);
  const banked = useMemo(() => new Set((bank || []).map((r) => r.id)), [bank]);
  const subject = constructSubject(lastKept, bank, hand);
  // a hand as records, for drawing; a recipe that no longer assembles (the shelf changed) is left out
  const records = useMemo(
    () => (hand || []).map((c) => ({ c, rec: assembleCandidate(c, ctx) })).filter((x) => x.rec),
    [hand, ctx],
  );

  const press = () => {
    setHand(constructKinPress({ scope, seed, press: pressN, ctx }));
    setHandKind('kin');
    setPicked(null);
    setPressN(pressN + 1);
  };
  const narrowPress = () => {
    const r = constructCurPress({ subject, seed, press: curN, ctx });
    setHand(r.hand);
    setHandKind('cur');
    setPicked(r.picked ? constructKey(r.picked) : null);
    setCurN(curN + 1);
  };
  const keep = (c, rec) => {
    const before = (useStore.getState().constructRecords || []).length;
    const had = banked.has(rec.id);
    bankConstruct(rec);
    const after = useStore.getState().constructRecords || [];
    setLastKept(c);
    if (!had && after.some((r) => r.id === rec.id) && after.length >= before && onKeep) onKeep();
  };

  return (
    <div style={strip} data-testid="construct-strip">
      <span style={ctl}>
        <span style={tag}>constructs</span>
        <span style={ctlRow}>
          <button
            type="button"
            className="chip-btn act"
            data-testid="construct-scope"
            title="Which style KIN builds from: ANY picks a style you have kept two shapes of, or step to one style. Tap to step."
            onClick={() => setScope(nextConstructScope(scope))}
          >
            {label(scope)}
          </button>
          <button
            type="button"
            className="chip-btn act"
            style={kinBtn}
            data-testid="construct-kin"
            disabled={!inPlay.length}
            title={inPlay.length ? 'Build a hand of constructs from your kept shapes' : TOO_FEW_LINE}
            onClick={press}
          >
            KIN
          </button>
          <button
            type="button"
            className="chip-btn act"
            style={kinBtn}
            data-testid="construct-cur"
            disabled={!subject}
            title={
              subject
                ? 'Deal three constructs one shape away from the one you kept last'
                : 'Press KIN first — CUR narrows'
            }
            onClick={narrowPress}
          >
            CUR
          </button>
        </span>
      </span>
      <div style={scroll}>
        <div style={row} data-testid="construct-hand">
          {hand === null && (
            <span style={hint}>
              {inPlay.length
                ? 'press KIN — your kept shapes join up into constructs'
                : `keep ${CONSTRUCT_FLOOR} shapes of one style on the SHAPE rung`}
            </span>
          )}
          {hand !== null && records.length === 0 && (
            <span style={hint}>
              {handKind === 'cur'
                ? 'nothing one shape away — keep another shape of this style'
                : 'nothing built — keep more shapes of one style'}
            </span>
          )}
          {records.map(({ c, rec }) => (
            <ConstructTile
              key={constructKey(c)}
              record={rec}
              svgOf={svgOf}
              kept={banked.has(rec.id)}
              picked={constructKey(c) === picked}
              onKeep={() => keep(c, rec)}
            />
          ))}
        </div>
      </div>
      <span style={ctl}>
        <span style={tag} data-testid="construct-bank-count">
          bank · {(bank || []).length}
        </span>
        <span style={status} role="status" data-testid="construct-note">
          {!inPlay.length && TOO_FEW_LINE}
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
  flexWrap: 'wrap',
};
const ctl = { display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto', alignItems: 'stretch' };
const ctlRow = { display: 'flex', gap: 4 };
const tag = { fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--dim)' };
const kinBtn = { fontWeight: 700, letterSpacing: '0.08em' };
const scroll = { flex: '1 1 auto', minWidth: 0, overflowX: 'auto' };
const row = {
  display: 'flex',
  gap: 6,
  width: 'max-content',
  minHeight: 80,
  alignItems: 'center',
  margin: '0 auto',
  padding: '2px 0',
};
const hint = { color: 'var(--dim)', fontSize: 10, letterSpacing: '0.06em' };
const tile = {
  position: 'relative',
  width: 72,
  minHeight: 72,
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
const pickMark = {
  position: 'absolute',
  top: 2,
  left: 3,
  fontSize: 8,
  letterSpacing: '0.08em',
  color: 'var(--accent)',
};
const status = { fontSize: 9, color: 'var(--dim)', maxWidth: 180 };
