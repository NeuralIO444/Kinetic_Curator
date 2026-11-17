// WetLabShapeStrip.jsx — the SHAPE rung of the WetLab ladder (docs/design/wetlab-ladder-spec.md §4, §6, §12.4–12.6;
// issue #2282).
//
// KIN deals one style's primitives (ANY picks the style per press), up to six; the lead lands on the stage, as KIN
// creatures do (#2250). CUR deals the other shapes of the subject's style: the last kept shape, else the lead. Tapping a
// tile keeps it on the SHAPE shelf (saved with the project) and, when the shelf took it, fills one of the rung's pips —
// the lead a press lands is not a keep (#2283's rule). Tiles breathe slowly; under reduced motion they are still. No
// toast, no sound, no score: the rail lighting the next rung is the whole reward (spec §7).
import { useMemo, useState } from 'react';
import { useStore } from '../state/store.js';
import { ASSETS } from '../data/assets/index.js';
import { dealLibrary } from './wetLabDeal.mjs';
import {
  shapeKinPress,
  shapeCurPress,
  nextShapeScope,
  shapeSubject,
  shapeSvg,
  shapeKey,
  SHAPE_SCOPES,
  SHAPE_DEFAULT_SCOPE,
} from './shapeDeal.mjs';

const label = (scope) => (SHAPE_SCOPES.find((s) => s.id === scope) || SHAPE_SCOPES[0]).label;

// one rule, scoped to this strip: the breath, and its absence under reduced motion (DS rule 7)
const BREATH_CSS = `
@keyframes kc-shape-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.03); } }
.kc-shape-breathe { animation: kc-shape-breathe 4s ease-in-out infinite; transform-origin: 50% 50%; }
@media (prefers-reduced-motion: reduce) { .kc-shape-breathe { animation: none; } }
`;

export function WetLabShapeStrip({ onKeep } = {}) {
  const seed = useStore((s) => s.seed);
  const customAssets = useStore((s) => s.customAssets);
  const enabledAssets = useStore((s) => s.enabledAssets);
  const shelf = useStore((s) => s.shapeShelf);
  const note = useStore((s) => s.shapeShelfNote);
  const keepDealtShape = useStore((s) => s.keepDealtShape);
  const dropShelfShape = useStore((s) => s.dropShelfShape);
  const toggleAsset = useStore((s) => s.toggleAsset);

  const library = useMemo(() => dealLibrary(ASSETS, customAssets), [customAssets]);
  const [scope, setScope] = useState(SHAPE_DEFAULT_SCOPE);
  const [hand, setHand] = useState(null);
  const [handKind, setHandKind] = useState('kin');
  const [picked, setPicked] = useState(null);
  const [pressN, setPressN] = useState(0);
  const [curN, setCurN] = useState(0);

  const kept = useMemo(() => new Set((shelf || []).map((s) => shapeKey(s))), [shelf]);
  const subject = shapeSubject(shelf, hand);

  const landOnStage = (asset) => {
    if (!(enabledAssets || {})[asset]) toggleAsset(asset);
  };
  const press = () => {
    const h = shapeKinPress({ scope, seed, press: pressN, library });
    setHand(h);
    setHandKind('kin');
    setPicked(null);
    setPressN(pressN + 1);
    // the lead lands on the stage at once, like a KINETIC deal; it is not a keep
    if (h.length) landOnStage(h[0].asset);
  };
  const narrowPress = () => {
    const r = shapeCurPress({ subject, seed, press: curN, library });
    setHand(r.hand);
    setHandKind('cur');
    setPicked(r.picked ? shapeKey(r.picked) : null);
    setCurN(curN + 1);
  };
  const keep = (shape) => {
    keepDealtShape(shape);
    const st = useStore.getState().shapeShelfNote;
    if (st && st.status === 'kept' && onKeep) onKeep();
  };

  return (
    <div style={strip} data-testid="shape-strip">
      <style>{BREATH_CSS}</style>
      <span style={ctl}>
        <span style={tag}>shapes</span>
        <span style={ctlRow}>
          <button
            type="button"
            className="chip-btn act"
            data-testid="shape-scope"
            title="Which style KIN deals from: ANY picks one style per press, or step to a single style. Tap to step."
            onClick={() => setScope(nextShapeScope(scope))}
          >
            {label(scope)}
          </button>
          <button
            type="button"
            className="chip-btn act"
            style={kinBtn}
            data-testid="shape-kin"
            title="Deal a hand of one style's shapes; the first one lands on the stage"
            onClick={press}
          >
            KIN
          </button>
          <button
            type="button"
            className="chip-btn act"
            style={kinBtn}
            data-testid="shape-cur"
            disabled={!subject}
            title={
              subject
                ? 'Deal the other shapes of the style of the shape you last kept'
                : 'Press KIN first — CUR narrows from a shape'
            }
            onClick={narrowPress}
          >
            CUR
          </button>
        </span>
      </span>
      <div style={scroll}>
        <div style={row} data-testid="shape-hand">
          {hand === null && (
            <span style={hint}>press KIN — one style's shapes are dealt, the first lands on stage</span>
          )}
          {hand !== null && hand.length === 0 && (
            <span style={hint}>
              {handKind === 'cur' ? 'no other shape in that style — press KIN' : 'nothing to deal — press again'}
            </span>
          )}
          {(hand || []).map((s) => {
            const key = shapeKey(s);
            const svg = shapeSvg(library, s.asset);
            const on = kept.has(key);
            return (
              <button
                key={key}
                type="button"
                style={{ ...tile, ...(on ? tileOn : null) }}
                data-testid="shape-tile"
                data-style={s.style}
                aria-pressed={on}
                title={`${s.asset} · ${s.style}${key === picked ? ' · CUR’s pick' : ''} · tap to ${on ? 'see it is kept' : 'keep it'}`}
                onClick={() => keep(s)}
              >
                <svg
                  viewBox="0 0 100 100"
                  width="44"
                  height="44"
                  className="kc-shape-breathe"
                  style={{ display: 'block', margin: '0 auto' }}
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: svg || '' }}
                />
                {key === picked && (
                  <span style={pickMark} data-testid="shape-pick">
                    pick
                  </span>
                )}
                <span style={tileId}>{on ? 'kept' : s.style}</span>
              </button>
            );
          })}
        </div>
      </div>
      <span style={ctl}>
        <span style={tag} data-testid="shape-shelf-count">
          shelf · {(shelf || []).length}
        </span>
        <span style={shelfRow} data-testid="shape-shelf">
          {(shelf || []).map((s) => {
            const key = shapeKey(s);
            const svg = shapeSvg(library, s.asset);
            return (
              <button
                key={key}
                type="button"
                style={shelfTile}
                data-testid="shape-shelf-tile"
                title={`${s.asset} · ${s.style} · tap to take it off the shelf`}
                onClick={() => dropShelfShape(key)}
              >
                <svg
                  viewBox="0 0 100 100"
                  width="28"
                  height="28"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: svg || '' }}
                />
              </button>
            );
          })}
        </span>
        <span style={status} role="status" data-testid="shape-note">
          {note && note.status === 'shelf-full' && 'the shelf is full — take a shape off first'}
          {note && note.status === 'nobody' && 'that shape could not be kept'}
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
  minHeight: 72,
  alignItems: 'center',
  margin: '0 auto',
  padding: '2px 0',
};
const hint = { color: 'var(--dim)', fontSize: 10, letterSpacing: '0.06em' };
const tile = {
  position: 'relative',
  width: 64,
  minHeight: 64,
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
const shelfRow = { display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 240 };
const shelfTile = {
  width: 44,
  height: 44,
  padding: 7,
  background: 'transparent',
  border: '1px solid var(--line)',
  color: 'var(--ink)',
  cursor: 'pointer',
};
const status = { fontSize: 9, color: 'var(--dim)', maxWidth: 160 };
