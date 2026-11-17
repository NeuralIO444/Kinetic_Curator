// WetLabDealStrip.jsx — #2232 steps 3 and 4: the WetLab's KIN and CUR strip. The auto-generate: press KIN, get a hand of creatures,
// tap one to bank it, then modify it with the lab's own tools. Hand-picking (assemble / breed) stays where it was.
//
// It runs the KINETIC engine over the creature adapter (deal/); this file is only the surface. The hand is a pure
// function of (project seed, press number, bank, width), so nothing but the press number is held here — a lab opened
// again deals the same first hand. A tap banks through the store's one door (bankDealtCreature → bankCreature).
//
// CUR (step 4) is the fine step: from the creature on the lab's stage, a hand of three neighbours within a closeness
// (TIGHT / NEAR / LOOSE), ordered best first with the pick marked. Tapping one banks it beside its source and it takes
// the stage, so CUR walks on from there. Taste only orders and marks; any neighbour can be tapped.
import { useMemo, useState } from 'react';
import { useStore } from '../state/store.js';
import { ASSETS } from '../data/assets/index.js';
import { lookName, MAX_CREATURE_RECORDS } from '../engine/creatureAssembler.js';
import { OVERLAY_CAP } from '../assets/overlay.js';
import {
  CUR_CAPS,
  CUR_DEFAULT_CAP,
  curPress,
  nextCurCap,
  CREATURE_SCOPES,
  KIN_DEFAULT_SCOPE,
  dealLibrary,
  kinPress,
  nextKinScope,
  unkeptIds,
  bodySvgOf,
} from './wetLabDeal.mjs';
import { creatureFigureSvg } from './wetLabLogic.mjs';
import { ladderBodyPool, ladderOverlay, ladderPartIds } from './ladderPools.mjs'; // #2304

const label = (scope) => (CREATURE_SCOPES.find((s) => s.id === scope) || CREATURE_SCOPES[0]).label;

export function WetLabDealStrip({ subject = null, onTap, onKeep }) {
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
  const [handKind, setHandKind] = useState('kin'); // which button dealt the hand on show: 'kin' | 'cur'
  const [picked, setPicked] = useState(null); // CUR's marked pick (a record id) in a CUR hand
  const [cap, setCap] = useState(CUR_DEFAULT_CAP);
  const [curN, setCurN] = useState(0); // CUR's own press counter
  const [dealtIds, setDealtIds] = useState([]); // what this strip banked this session (the "unkept" pool)
  const constructRecords = useStore((s) => s.constructRecords);
  const shapeShelf = useStore((s) => s.shapeShelf);
  const library = useMemo(() => dealLibrary(ASSETS, customAssets), [customAssets]);
  // #2304 — the ladder (spec §14): bodies come only from banked constructs once there are three; parts come from the
  // stage plus every banked construct and every kept shape. The construct tiles are drawn from their records.
  const ladderTiles = useMemo(() => {
    const byId = new Map(library.map((a) => [a.id, a]));
    return ladderOverlay({ constructRecords, svgOf: (id) => (byId.get(id) || {}).svg }).filter((t) => !byId.has(t.id));
  }, [library, constructRecords]);
  const bodyPool = useMemo(
    () => ladderBodyPool({ library, constructRecords, svgOf: (id) => (library.find((a) => a.id === id) || {}).svg }),
    [library, constructRecords],
  );
  const drawable = useMemo(() => [...library, ...ladderTiles], [library, ladderTiles]);
  const labOverlay = useMemo(() => [...(customAssets || []), ...ladderTiles], [customAssets, ladderTiles]);
  const banked = new Set((bank || []).map((r) => r.id));
  const unkept = unkeptIds(dealtIds, bank, enabledAssets);
  // the whole creature at rest on each tile — its body and the parts Davis would deal from the stage as it stands
  const stageIds = Object.keys(enabledAssets || {}).filter(
    (id) => enabledAssets[id] && id !== 'creature' && library.some((a) => a.id === id),
  );
  const partIds = ladderPartIds({ stageIds, constructTileIds: ladderTiles.map((t) => t.id), shelf: shapeShelf });
  const stageKey = partIds.join('|');
  const figures = useMemo(() => {
    const m = new Map();
    for (const rec of hand || []) {
      const body = drawable.find((a) => a.id === rec.body);
      let svg;
      try {
        svg = body ? creatureFigureSvg(rec, body, partIds, { seed, library: drawable, overlay: labOverlay }) : null;
      } catch {
        svg = null; // a tile that cannot be composed falls back to its body drawing
      }
      m.set(rec.id, svg);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand, drawable, seed, labOverlay, stageKey]);

  const press = () => {
    const r = kinPress({ scope, seed, press: pressN, library: bodyPool, assetAttach, bank });
    setHand(r.hand);
    setHandKind('kin');
    setPicked(null);
    setPressN(pressN + 1);
    // the lead creature lands on the stage at once, like a KINETIC deal on the main stage; the rest wait in the hand
    if (r.hand.length) tap(r.hand[0]);
  };
  const narrowPress = () => {
    const r = curPress({ subject, cap, seed, press: curN, library: bodyPool, assetAttach, bank });
    setHand(r.hand);
    setHandKind('cur');
    setPicked(r.picked ? r.picked.id : null);
    setCurN(curN + 1);
  };
  // `chosen`: the artist tapped this tile. The lead a KIN press lands by itself banks too, but it is not a keep:
  // only a choice fills the ladder's pips (#2283), so pressing KIN three times cannot open a rung.
  const tap = (rec, chosen = false) => {
    bankDealt(rec);
    const st = useStore.getState().creatureDealNote;
    if (chosen && st && st.status === 'banked' && onKeep) onKeep();
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
        <span style={ctlRow}>
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
        <span style={ctlRow}>
          <button
            type="button"
            className="chip-btn act"
            data-testid="cur-cap"
            title="How close CUR's neighbours stay to the creature on the stage: TIGHT changes at most 10% of its genes, NEAR 25%, LOOSE 50%. Tap to step."
            onClick={() => setCap(nextCurCap(cap))}
          >
            {(CUR_CAPS.find((c) => c.id === cap) || CUR_CAPS[1]).label}
          </button>
          <button
            type="button"
            className="chip-btn act"
            style={kinBtn}
            data-testid="cur-press"
            disabled={!subject}
            title={
              subject
                ? 'Deal three close neighbours of the creature on the stage; the one CUR would pick is marked'
                : 'Bank or select a creature first — CUR narrows from the one on the stage'
            }
            onClick={narrowPress}
          >
            CUR
          </button>
        </span>
      </span>
      <div style={scroll}>
        <div style={row} data-testid="kin-hand">
          {hand === null && (
            <span style={hint}>press KIN — a creature lands on the stage, the rest of the hand waits here</span>
          )}
          {hand !== null && hand.length === 0 && (
            <span style={hint}>
              {handKind === 'cur'
                ? 'no neighbour came up within that closeness — press again, or loosen it'
                : 'nothing viable came up at this width — press again'}
            </span>
          )}
          {(hand || []).map((rec) => {
            const figure = figures.get(rec.id);
            const svg = figure || bodySvgOf(rec, drawable);
            const on = banked.has(rec.id);
            return (
              <button
                key={rec.id}
                type="button"
                style={{ ...tile, ...(on ? tileOn : null) }}
                data-testid="kin-tile"
                aria-pressed={on}
                title={`${rec.id} · ${lookName(rec.look) || rec.look}${rec.id === picked ? ' · CUR’s pick' : ''} · tap to ${on ? 'select' : 'bank'} it`}
                onClick={() => tap(rec, true)}
              >
                {svg ? (
                  <svg
                    viewBox={figure ? '-20 -20 140 140' : '0 0 100 100'}
                    width="52"
                    height="52"
                    data-figure={figure ? 'full' : 'body'}
                    style={{ display: 'block', margin: '0 auto' }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                ) : (
                  <span style={{ display: 'block', height: 52, lineHeight: '52px', color: 'var(--dim)' }}>—</span>
                )}
                {rec.id === picked && (
                  <span style={pickMark} data-testid="cur-pick">
                    pick
                  </span>
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
const ctlRow = { display: 'flex', gap: 4 };
const pickMark = {
  position: 'absolute',
  top: 2,
  left: 3,
  fontSize: 8,
  letterSpacing: '0.08em',
  color: 'var(--accent)',
};
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
