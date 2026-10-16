// Layer stack — #1203 block-stacking strata roster rebuild.
//
// The dish's strata render as chunky vertical blocks, FRONT at the top,
// GROUND at the bottom: "stack order is depth". Each block carries a left
// type stripe (MATH red / CONTENT teal / FX purple), a positional number
// chip, ▲▼●S, a type tag, the name, DUP/×, and a one-line amber param
// summary when collapsed. Tap a block to expand it inline — the expanded
// block shows the same editors the old rows showed (wet, blend, PATCH,
// the FX/MATH/PATTERN editors). Between two blocks the edge stripe splits
// into a mix seam: a double line, one line per adjacent stratum's type
// color, crossfading vertically (same-type seams continue unbroken) — the
// visual statement of #1183's one-dish doctrine.
//
// Pure UI restructure: the roster data model is untouched. Reorder still
// trades within a type (canTrade: content never crosses the adjustment
// line, FX never crosses MATH), so ▲▼ move a stratum past its nearest
// same-type neighbor toward FRONT/GROUND.
import { useState, useEffect, useRef, Fragment } from 'react';
import { useApp } from '../../state/AppContext.jsx';
import { PanelHeader } from '../../components/PanelHeader.jsx';
import { emit, Events } from '../../composition/eventBus.js';
import { BLEND_MODES } from '../../data/layout-modes.js';
import { FX_EFFECT_DEFS, FX_MENU_KINDS, availableFxKinds, isFxLayer } from '../../fx/fxFilters.js';
import { isMathLayer, mathTrackHitsHard, wetDisplay } from '../../fx/mathFilters.js';
import { MathEffectEditor } from './MathEffectEditor.jsx';
import { rackSlotForFxOrdinal } from '../../fx/fxTrack.js';
import { efTileFace } from '../../fx/efRackTile.mjs';
import { displayLayerName, isPatternLayer, isKcLayer, MAX_CONTENT_TRACKS, MAX_FX_TRACKS, MAX_MATH_TRACKS } from '../../state/slices/layersSlice.js';
import { PatternEditor } from './PatternEditor.jsx';
import { helpText } from '../../data/helpCopy.js';
import { getPatchSample, patchSampleAgeMs, formatPatchLine, PATCH_DIAG_STALE_MS, activePatchPairs, formatMatrixRow } from '../../engine/kernel/tracks/patchDiag.mjs';
import { rowsTopFirst, moveNeighbor, canMoveUp, canMoveDown } from './layerRows.mjs';
import { trackNumeral, trackNumeralTitle } from './trackNumeral.mjs';
import { PATCH_ONELINER_COPY, shouldShowPatchOneLiner, readPatchOneLinerSeen, writePatchOneLinerSeen } from './patchOneLiner.mjs';
import { strataSummary, trimNum } from './strataSummary.mjs';
import { RangeRow } from '../../components/RangeRow.jsx';

// #716 Part 2 — black block + white numeral heads every block. The edited
// block inverts (white block, black numeral). #1203: the numeral is the
// stratum's stack position (FRONT = 1), per the mockup's 1..n chips.
function TrackNumeral({ n, kind, edited = false, title }) {
  const glyph = trackNumeral(n, kind);
  if (!glyph) return null;
  return (
    <span
      className={`track-numeral${edited ? ' track-numeral-edited' : ''}`}
      title={title ?? trackNumeralTitle(n, kind, { edited })}
      aria-hidden="true"
    >{glyph}</span>
  );
}

// #1203 — the block stack's type language. MATH red, CONTENT teal, FX
// purple. Pattern tracks are CONTENT-family strata (teal stripe, CONTENT
// tag) — they are ground in the dish, not a fourth type.
const STRATA_COLORS = Object.freeze({ math: '#E5486F', content: '#4FD1C5', fx: '#8B7CF6' });
const STRATA_LABEL = Object.freeze({ math: 'MATH', content: 'CONTENT', fx: 'FX' });

// #509 phase 3 — matrix overview: every live cross-layer link in one
// glance. Config render of store state (re-renders with layers naturally);
// liveness stays in the row lines (#507). No new panel, no new state.
function PatchMatrix({ layers, ordinals }) {
  const pairs = activePatchPairs(layers);
  if (!pairs.length) return null;
  return (
    <div className="patch-matrix" title="Patch matrix — every live cross-layer link. Edit in the blocks below.">
      <span className="fx-param-readout lbl" style={{ width: 'auto' }}>matrix</span>
      {pairs.map((p) => (
        <div key={p.dstId} className="patch-diag">{formatMatrixRow(p, ordinals)}</div>
      ))}
    </div>
  );
}

// #507 — inline PATCH diagnostic: one live line under each patched block
// (TapeCounter 1Hz-poll shape). Module buffer, never the store.
function PatchDiagLine({ layerId, patch, srcN, dstN }) {
  // All impure reads (module buffer, clock, formatter) live in the effect —
  // render only reads the resulting string (react-hooks/purity).
  const [line, setLine] = useState(null);
  const mode = patch?.mode;
  const to = patch?.to;
  const strength = patch?.strength;
  // Interval body is inline (TapeCounter shape): named updaters and
  // effect-body setState trip set-state-in-effect; inline arrows read as
  // deferred by construction. First paint shows nothing for ≤1s — same as
  // the waiting state.
  useEffect(() => {
    const id = setInterval(() => {
      if (!mode || mode === 'off' || !to) { setLine(null); return; }
      const sample = getPatchSample(layerId);
      const age = patchSampleAgeMs(layerId);
      const s = Number.isFinite(Number(strength)) ? Number(strength) : 0.16;
      if (!sample && age > PATCH_DIAG_STALE_MS) {
        setLine({
          text: `KC-${srcN} → KC-${dstN} · ${String(mode).toUpperCase()} · ${s.toFixed(2)} · waiting`,
          title: 'Patch link armed — no samples yet (loop paused or still baking)',
        });
        return;
      }
      const text = formatPatchLine({ srcN, dstN, mode, strength: strength ?? 0.16, sample, now: Date.now() });
      setLine(text ? { text, title: 'Live patch amounts — pull/hop are post-clamp px per frame' } : null);
    }, 1000);
    return () => clearInterval(id);
  }, [layerId, mode, to, strength, srcN, dstN]); // primitives only: an object/Map dep restarts the timer on every render
  if (!line) return null;
  return <div className="patch-diag" title={line.title}>{line.text}</div>;
}

// #1046 — the editor is a header strip plus its controls, sized to its content.
// The old tile reserved a glyph row and a mode-word row, so a two-slider effect
// sat in a tall near-empty box. The header (abbreviation, mode word, ✕) is also
// what announces "the editor opened".
function EfTile({ slot, kind, onBypass, children }) {
  const face = efTileFace(slot, kind);
  return (
    <div className="ef-tile" title={`${slot.label} · ${face.word}`}>
      <div className="ef-head">
        <span className="ef-abbr">{face.abbr}</span>
        <span className="ef-word">{face.word}</span>
        {onBypass && <button type="button" className="ef-bypass" onClick={onBypass} title="Remove this effect">✕</button>}
      </div>
      {children}
    </div>
  );
}

// #520 Phase 4 — rack UI: slot-driven display, one row per EF slot.
// #716 — TX-6 tile; #1046 — header strip, no glyph, nothing but controls below.
function FxEffectEditor({ layer, fxOrdinal }) {
  const [pick, setPick] = useState(null);
  const slot = rackSlotForFxOrdinal(fxOrdinal);
  const effects = layer.effects || [];
  if (!slot) return null;
  const filledIdx = effects.findIndex((fx) => slot.kinds.includes(fx.kind));
  const filled = filledIdx >= 0 ? effects[filledIdx] : null;
  const slotKinds = slot.kinds.filter((k) => availableFxKinds(effects).includes(k) || (filled && filled.kind === k));

  if (filled) {
    const def = FX_EFFECT_DEFS[filled.kind];
    if (!def) return null;
    const paramCount = Object.keys(def.params).length;
    return (
      <div className="fx-editor" title={`FX ${fxOrdinal} · ${slot.label}`}>
        <EfTile slot={slot} kind={filled.kind} onBypass={() => emit(Events.FX_EFFECT_REMOVE, { layerId: layer.id, index: filledIdx })}>
          {Object.entries(def.params).map(([key, p]) => (
            <div className="fx-param" key={key}>
              <label title={p.hint}>{p.label}</label>
              <RangeRow layout="bare" tone="build" min={p.min} max={p.max} step={p.step} value={filled.params?.[key] ?? p.def}
                onReset={() => emit(Events.FX_EFFECT_SET_PARAM, { layerId: layer.id, index: filledIdx, key, value: p.def })}
                onChange={(v) => emit(Events.FX_EFFECT_SET_PARAM, { layerId: layer.id, index: filledIdx, key, value: v })} />
              <span className="fx-param-readout">{filled.params?.[key] ?? p.def}</span>
            </div>
          ))}
          {/* An effect with almost nothing to set says so plainly, never a void. */}
          {paramCount <= 1 && <div className="fx-note">{paramCount === 0 ? 'no controls' : 'no other controls'}</div>}
        </EfTile>
      </div>
    );
  }

  // Empty slot: one clear call to action, never a bare "empty" and a dead control.
  const effectiveKind = slotKinds.includes(pick) ? pick : (slotKinds[0] ?? null);
  return (
    <div className="fx-editor" title={`${slot.label} · one family`}>
      <EfTile slot={slot} kind={null}>
        {effectiveKind ? (
          <>
            {slotKinds.length > 1 && (
              <select aria-label={`Choose ${slot.label} effect`} value={effectiveKind} onChange={(e) => setPick(e.target.value)}>
                {slotKinds.map((k) => <option key={k} value={k}>{FX_EFFECT_DEFS[k].label.toUpperCase()}</option>)}
              </select>
            )}
            <button className="chip-btn" onClick={() => emit(Events.FX_EFFECT_ADD, { layerId: layer.id, kind: effectiveKind })}>
              + ADD {FX_EFFECT_DEFS[effectiveKind].label.toUpperCase()}
            </button>
          </>
        ) : (
          <div className="fx-note">nothing to add to this slot yet</div>
        )}
        {slot.stubs.length > 0 && (
          <div className="fx-note" title="Planned — not yet available">planned: {slot.stubs.join(', ')}</div>
        )}
      </EfTile>
    </div>
  );
}

// #1203 — the mix seam: in the gap between two blocks the edge stripe splits
// into a DOUBLE LINE, one line per adjacent stratum's type color, the two
// lines crossfading into each other vertically. Same-type seams (teal→teal)
// continue unbroken as a single line.
function MixSeam({ upperFine, lowerFine }) {
  const cA = STRATA_COLORS[upperFine];
  const cB = STRATA_COLORS[lowerFine];
  if (cA === cB) {
    return (
      <div className="mix-seam" title="Same-type seam — the stripe continues unbroken">
        <span className="mix-line mix-line-single" style={{ background: cA }} />
      </div>
    );
  }
  return (
    <div className="mix-seam" title={`Mix seam — ${STRATA_LABEL[upperFine]} bleeds into ${STRATA_LABEL[lowerFine]}`}>
      <span className="mix-line" style={{ background: `linear-gradient(to bottom, ${cA}, ${cB})` }} />
      <span className="mix-line mix-line-b" style={{ background: `linear-gradient(to bottom, ${cB}, ${cA})` }} />
    </div>
  );
}

// #1203 — one-tap add · long-press chooser. Long-press shape follows the old
// per-section "+" (650ms, pointer down/up/leave + click guard).
const LONG_PRESS_MS = 650;
const LAST_ADD_KEY = 'kc:strata-last-add';
const ADD_TYPES = Object.freeze(['content', 'fx', 'math', 'pattern']);
const ADD_TYPE_LABEL = Object.freeze({ content: 'CONTENT', fx: 'FX', math: 'MATH', pattern: 'PATTERN' });

function StrataAddSlot({ title, hint, disabled, onAdd, onOpenChooser }) {
  const timer = useRef(null);
  const longFired = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const startPress = () => {
    if (disabled) return;
    longFired.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      longFired.current = true;
      onOpenChooser();
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(timer.current);
  const handleClick = () => {
    if (longFired.current) { longFired.current = false; return; }
    onAdd();
  };
  return (
    <button
      type="button"
      className="strata-add"
      disabled={disabled}
      title={title}
      aria-label="Add stratum — tap: add · long-press: choose type"
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onClick={handleClick}
    >
      <span className="strata-add-label">+ ADD STRATUM</span>
      <span className="strata-add-hint">{hint}</span>
    </button>
  );
}

// #1203 — long-press chooser, first the stratum type, then (for FX and
// CONTENT) the existing family pickers. MATH and PATTERN add immediately —
// MATH is tap-only by design, a PATTERN always arms as QUILT ground.
// Capped types disable with the reason instead of swallowing the tap.
function TypeChooser({ onPick, onClose, hasRoom }) {
  return (
    <>
      <button type="button" className="layer-chooser-backdrop" aria-label="Close chooser" tabIndex={-1} onClick={onClose} />
      <div className="layer-chooser" role="dialog" aria-label="Choose stratum type">
        <div className="layer-chooser-title">Choose stratum type</div>
        <div className="layer-chooser-group">
          {ADD_TYPES.map((t) => {
            const room = hasRoom(t);
            return (
              <button key={t} type="button" className="layer-chooser-item" disabled={!room}
                title={room ? `Add ${ADD_TYPE_LABEL[t]} stratum` : 'Track cap reached'}
                onClick={() => onPick(t)}>
                {ADD_TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// #1014 (mockup C rebuild) — long-press chooser: the family/pick UI.
// CONTENT picks a blend mode. FX picks an effect kind for the NEXT track's
// family — each FX ordinal is bound to one rack family (#520/#732), so the
// chooser only offers that family's add-menu kinds (a cross-family pick
// would arm a phantom effect the block editor can't show).
function FamilyChooser({ section, fxOrdinal, fxSlotKinds, fxSlotLabel, onPick, onClose }) {
  const label = section === 'content' ? 'Choose blend for the new KC track' : `Choose effect for FX ${fxOrdinal}`;
  return (
    <>
      <button type="button" className="layer-chooser-backdrop" aria-label="Close chooser" tabIndex={-1} onClick={onClose} />
      <div className="layer-chooser" role="dialog" aria-label={label}>
        <div className="layer-chooser-title">{label}</div>
        {section === 'content' ? (
          <div className="layer-chooser-group">
            {BLEND_MODES.map((m) => (
              <button key={m} type="button" className="layer-chooser-item" onClick={() => onPick(m)}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        ) : (
          <div className="layer-chooser-group">
            <div className="layer-chooser-group-label">{fxSlotLabel}</div>
            {fxSlotKinds.length === 0 && (
              <div className="layer-chooser-empty">This family has no live effects yet — the track arms empty.</div>
            )}
            {fxSlotKinds.map((k) => (
              <button key={k} type="button" className="layer-chooser-item" onClick={() => onPick(k)}>
                {FX_EFFECT_DEFS[k].label.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function LayerStack() {
  const { state } = useApp(s => ({ layers: s.layers, activeLayerId: s.activeLayerId, selectedFxLayerId: s.selectedFxLayerId, selectedMathLayerId: s.selectedMathLayerId, selectedPatternLayerId: s.selectedPatternLayerId, layoutParams: s.layoutParams }));
  const { layers, activeLayerId, selectedFxLayerId, selectedMathLayerId, selectedPatternLayerId, layoutParams } = state;
  // #1409 (petri dish A3) — the DISH controls. The switch and the two
  // contact knobs are layout params (scene/Look state, PARAM_SPEC is the
  // trust boundary), edited through the same LAYOUT_PARAM bus event as
  // every other param control — which is also what makes the honest feed
  // record them as the artist's hand, never the system's.
  const setParam = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const dishOn = layoutParams?.dish !== false;
  const dishRadius = layoutParams?.contactRadius || 0;
  const dishRestitution = layoutParams?.contactRestitution ?? 0.5;
  const dishRepel = layoutParams?.contactRepel ?? 0;
  const dishTempo = layoutParams?.dishTempo ?? 0;
  const isAdj = (l) => isFxLayer(l) || isMathLayer(l);
  const fineClass = (l) => (isMathLayer(l) ? 'math' : isFxLayer(l) ? 'fx' : 'content');
  const contentCount = layers.filter((l) => !isAdj(l)).length;
  const fxCount = layers.filter(isFxLayer).length;
  const mathCount = layers.filter(isMathLayer).length;
  const kcCount = layers.filter(isKcLayer).length; // #1099 — a PATTERN track is content for the cap, but not a KC track
  const singleTrack = kcCount < 2; // PATCH has nothing to point at (a patched block can still be set back to OFF)
  // #1019 — PATCH one-liner for newcomers ("route one track's motion into
  // another"): visible the first time a second KC track exists, then it gets
  // out of the way. `seen` persists via localStorage (never nags on repeat
  // visits); `dismissed` is the session-only ×. The flag is written the
  // first time the line displays, so it stays up for the current session
  // until the user taps ×, but a reload never brings it back.
  const [onelinerSeen] = useState(() => readPatchOneLinerSeen());
  const [onelinerDismissed, setOnelinerDismissed] = useState(false);
  const onelinerArmed = shouldShowPatchOneLiner({ seen: onelinerSeen, dismissed: onelinerDismissed, contentCount });
  // #1203 — the dashed ADD STRATUM slot. `chooser` is the open picker:
  // 'type' (stratum type) → 'fx' | 'content' (family). Tap replays the last
  // added type (localStorage, default CONTENT); MATH and PATTERN add
  // immediately from the type chooser.
  const [chooser, setChooser] = useState(null);
  const [lastAddType, setLastAddType] = useState(() => {
    try {
      const v = localStorage.getItem(LAST_ADD_KEY);
      return ADD_TYPES.includes(v) ? v : 'content';
    } catch { return 'content'; }
  });
  const recordAddType = (t) => {
    setLastAddType(t);
    try { localStorage.setItem(LAST_ADD_KEY, t); } catch { /* private mode */ }
  };
  // The next FX track's family is fixed by its ordinal (#520/#732) — the
  // chooser only offers that family's add-menu kinds.
  const nextFxOrdinal = fxCount + 1;
  const nextFxSlot = rackSlotForFxOrdinal(nextFxOrdinal);
  const nextFxKinds = (nextFxSlot?.kinds ?? []).filter((k) => FX_MENU_KINDS.includes(k));
  const nextFxSlotLabel = nextFxSlot ? `${nextFxSlot.slot} · ${nextFxSlot.label}` : 'No family';

  const doAdd = (t) => {
    recordAddType(t);
    if (t === 'math') emit(Events.LAYER_ADD_MATH);
    else if (t === 'fx') emit(Events.LAYER_ADD_FX);
    else if (t === 'pattern') emit(Events.PATTERN_ADD, { mode: 'QUILT' });
    else emit(Events.LAYER_ADD);
  };
  const typeHasRoom = (t) => (t === 'fx' ? fxCount < MAX_FX_TRACKS : t === 'math' ? mathCount < MAX_MATH_TRACKS : contentCount < MAX_CONTENT_TRACKS);
  const addTarget = typeHasRoom(lastAddType) ? lastAddType : ADD_TYPES.find(typeHasRoom) || null;

  let contentOrdinal = 0;
  let fxOrdinal = 0;
  let mathOrdinal = 0;
  let patternOrdinal = 0; // #1097 — PT-n, its own counter: a PATTERN track is not a KC track or a PATCH target
  const ordinals = new Map(); // content ids -> KC-n, FX ids -> FX n, MATH ids -> M n (separate counters)
  const contentTargets = [];
  for (const l of layers) {
    if (isMathLayer(l)) {
      mathOrdinal += 1;
      ordinals.set(l.id, mathOrdinal);
    } else if (isPatternLayer(l)) {
      patternOrdinal += 1;
      ordinals.set(l.id, patternOrdinal);
    } else if (!isFxLayer(l)) {
      contentOrdinal += 1;
      ordinals.set(l.id, contentOrdinal);
      contentTargets.push({ id: l.id, n: contentOrdinal });
    } else {
      fxOrdinal += 1;
      ordinals.set(l.id, fxOrdinal);
    }
  }
  // #457 — the target is a stable layer id, not an ordinal: an ordinal
  // silently retargets when hide/solo/reorder/remove elsewhere in the
  // stack changes what sits at that position (liveResolve.mjs resolves
  // patch.to the same way).
  function otherTarget(layer) {
    const hit = contentTargets.find((t) => t.id !== layer.id);
    return hit ? hit.id : null;
  }

  // #1015 — reorder feedback: ▲▼ trade the block with its nearest same-type
  // neighbor toward FRONT (higher array index) or GROUND. Same-class rule
  // as before (#732/#1048): content never crosses the adjustment line, FX
  // never crosses MATH — the stack renders one list but the dish's fold
  // order invariants hold.
  const [moveFlash, setMoveFlash] = useState(null); // { id, label } | null
  const flashTimer = useRef(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  useEffect(() => {
    if (onelinerArmed) writePatchOneLinerSeen();
  }, [onelinerArmed]);

  function handleMove(layer, dir) {
    const cls = fineClass(layer);
    const group = layers.filter((l) => fineClass(l) === cls); // array order, bottom→top
    const neighbor = moveNeighbor(group, layer.id, dir);
    if (!neighbor) return;
    emit(Events.LAYER_SWAP_POSITIONS, { idA: layer.id, idB: neighbor.id });
    if (isMathLayer(layer)) return;
    const newOrdinal = ordinals.get(neighbor.id) || 1;
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setMoveFlash({ id: layer.id, label: cls === 'fx' ? `FX ${newOrdinal}` : `KC-${newOrdinal}` });
    flashTimer.current = setTimeout(() => setMoveFlash(null), 1600);
  }

  // #1203 — one block renderer for the whole stack. Blocks read frontmost
  // first (the array's end is the dish's front). Collapsed: header + the
  // amber one-liner. Expanded (tap): the block's real controls — wet,
  // blend, PATCH, the FX/MATH/PATTERN editors.
  function renderBlock(layer, position, stackSize) {
    const fx = isFxLayer(layer);
    const math = isMathLayer(layer);
    const pat = isPatternLayer(layer);
    const adj = fx || math;
    const fine = fineClass(layer); // pattern → 'content'
    const wet = wetDisplay(layer); // #1023: what the renderer will honor
    const wetPct = Math.round(wet.wet * 100);
    const group = layers.filter((l) => fineClass(l) === fine);
    const isActive = layer.id === activeLayerId;
    const isFxSelected = layer.id === selectedFxLayerId;
    const isMathSelected = layer.id === selectedMathLayerId;
    const isPatSelected = layer.id === selectedPatternLayerId;
    const expanded = math ? isMathSelected : fx ? isFxSelected : pat ? isPatSelected : isActive;
    const soloed = !adj && layer.visible && layers.every((l) => l.id === layer.id || isAdj(l) || !l.visible);
    const mathSoloed = math && layer.visible && layers.every((l) => l.id === layer.id || !l.visible);
    const label = displayLayerName(layer, ordinals.get(layer.id) || 1);
    const patch = layer.patch || { mode: 'off', to: null, strength: 0.16 };
    const to = (!patch.to || patch.to === layer.id) ? otherTarget(layer) : patch.to;
    const hitsHard = math && mathTrackHitsHard(layer);
    // #1015 — DUP at cap used to click through silently. Cap the button
    // instead: disabled + tooltip so the cap reads instead of swallowing
    // the click. MATH blocks are out of scope — their DUP is untouched.
    const dupCapped = math ? false : fx ? fxCount >= MAX_FX_TRACKS : contentCount >= MAX_CONTENT_TRACKS;
    // #1409 — a KC block's collapsed line carries the Look's dish state
    // (off, or on-and-armed); FX/MATH/PATTERN blocks never enrol, so the
    // dish says nothing on them.
    const summary = expanded ? '' : strataSummary(layer, fine, wetPct,
      (!adj && !pat) ? { on: dishOn, armed: dishRadius > 0 } : undefined);
    const selectIt = () => (pat ? emit(Events.PATTERN_SELECT, { id: layer.id }) : emit(math ? Events.MATH_SELECT : fx ? Events.FX_SELECT : Events.LAYER_SET_ACTIVE, { id: layer.id }));
    const color = STRATA_COLORS[fine];
    // #1019 — the PATCH one-liner lives under the first KC block's PATCH
    // section, and only once that block is open (the flag is consumed on
    // display, never on arm).
    const isFirstKc = !adj && !pat && layers.filter(isKcLayer)[0]?.id === layer.id;
    const showOneliner = isFirstKc && expanded && onelinerArmed;
    return (
      <div
        key={layer.id}
        className={`strata-block strata-${fine}${pat ? ' strata-pattern' : ''}${expanded ? ' strata-expanded' : ''}${hitsHard ? ' strata-math-hard' : ''}${moveFlash?.id === layer.id ? ' strata-moved' : ''}`}
        style={{ '--strata-flash': color }}
        // #1018 (F8) — the whole block header opens the editor, so the
        // block reads as tappable. Icon buttons and the name keep their
        // own handlers (the closest() bail-out); the body's sliders and
        // selects are outside the header and never arm anything.
        onClick={(e) => {
          if (!e.target.closest('.strata-head')) return;
          if (e.target.closest('button, input, select, label, a')) return;
          selectIt();
        }}
        title={expanded ? `${label} — editing` : `Tap to edit ${label}`}
      >
        <span className="strata-stripe" style={{ background: color }} aria-hidden="true" />
        <div className="strata-head">
          <TrackNumeral n={position} kind={math ? 'math' : fx ? 'fx' : pat ? 'pattern' : 'kc'} edited={math ? isMathSelected : fx ? isFxSelected : pat ? isPatSelected : isActive} title={`Stratum ${position} of ${stackSize} — ${label}${expanded ? ' — editing' : ''}`} />
          <div className="strata-move">
            <button className="micro-btn" disabled={!canMoveUp(group, layer.id)} title="Move toward FRONT" onClick={() => handleMove(layer, 'up')}>▲</button>
            <button className="micro-btn" disabled={!canMoveDown(group, layer.id)} title="Move toward GROUND" onClick={() => handleMove(layer, 'down')}>▼</button>
          </div>
          {/* #1015 — transient position badge on the moved block */}
          {moveFlash?.id === layer.id && (
            <span className={`reorder-badge${fx ? ' reorder-badge-fx' : ''}`} role="status">now {moveFlash.label}</span>
          )}
          <button className="micro-btn" title="Toggle visibility" onClick={() => emit(Events.LAYER_TOGGLE_VISIBLE, { id: layer.id })}>{layer.visible ? '●' : '○'}</button>
          <button className="micro-btn" disabled={fx} title={fx ? 'Solo applies to KC tracks (FX never solos)' : math ? 'Solo the grade: this track alone over neutral mid-grey' : 'Solo'} onClick={() => emit(Events.LAYER_SOLO, { id: layer.id })}>{(soloed || mathSoloed) ? 'S·' : 'S'}</button>
          <span className="strata-type" style={{ background: color }}>{STRATA_LABEL[fine]}</span>
          <button
            className="strata-name"
            title={expanded ? `${label} — editing` : label}
            onClick={selectIt}
          >
            {label}
          </button>
          <button className={`act micro-btn${dupCapped ? ' dup-capped' : ''}`} disabled={dupCapped} title={dupCapped ? 'Track cap reached' : 'Duplicate'} onClick={() => emit(Events.LAYER_DUPLICATE, { id: layer.id })}>dup</button>
          <button className="micro-btn" title="Remove track (undoable)" disabled={isKcLayer(layer) && kcCount <= 1} onClick={() => emit(Events.LAYER_REMOVE, { id: layer.id })}>×</button>
        </div>
        {!expanded && summary && (
          <div className="strata-summary" title="Tap the block to edit">{summary}</div>
        )}
        {expanded && (
          <div className="strata-body">
            <div className="strata-composite">
              {/* #1016 — blend modes only exist on CONTENT tracks. FX/MATH
                  composite via wet/dry, so the old "Blend —" cell could
                  never show anything but a dash — it read as a broken
                  control holding layout alignment. Replaced with the
                  compact WET label so the slider keeps its address. */}
              {!adj && (
                <select className="blend-mode-select" value={layer.layerBlendMode} title={helpText('layers-blend')}
                  onChange={(e) => emit(Events.LAYER_SET_BLEND_MODE, { id: layer.id, mode: e.target.value })}>
                  {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}
                </select>
              )}
              {adj && <span className="wet-label lbl">wet</span>}
              <RangeRow layout="bare" tone="build" min={0} max={wet.cap} step={0.01} value={wet.wet}
                hint={math ? 'Wet/dry — how much of the grade shows. HUE ROTATE caps this track at 50%.' : undefined}
                onChange={(v) => emit(Events.LAYER_SET_OPACITY, { id: layer.id, opacity: v })} />
              <span className={`layer-opacity-readout${wet.capped ? ' capped' : ''}`}>{wetPct}%{wet.capped ? ' max' : ''}</span>
            </div>
            {!adj && !pat && (
              <>
              <div className="strata-composite" title={singleTrack ? 'PATCH needs a second KC track' : 'PATCH — FEED amount when mode is FEED'}>
                <span className="fx-param-readout lbl" style={{ width: 'auto' }}>patch</span>
                <select className="blend-mode-select" value={patch.mode} disabled={singleTrack && patch.mode === 'off'}
                  onChange={(e) => emit(Events.LAYER_PATCH, { id: layer.id, patch: { mode: e.target.value, to, strength: patch.strength } })}>
                  <option value="off">OFF</option>
                  {/* #346 — MOD/FIELD/FEED icons: Block Elements / Geometric Shapes
                      dither characters (▨▒▤), approximating the TE dot-matrix/LCD
                      pixel-icon texture with plain Unicode text — no new asset
                      pipeline, still the app's existing single-character convention
                      (◆■◇▸◎⬇◈◉◐), just a chunkier sub-family for these three. */}
                  <option value="mod">⊗ MOD</option>
                  <option value="field">✦ FIELD</option>
                  <option value="feed">↻ FEED</option>
                </select>
                <select className="blend-mode-select" value={to || ''} disabled={singleTrack}
                  onChange={(e) => emit(Events.LAYER_PATCH, { id: layer.id, patch: { mode: patch.mode, to: e.target.value, strength: patch.strength } })}>
                  {contentTargets.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.id === layer.id}>KC-{t.n}</option>
                  ))}
                </select>
                {patch.mode === 'feed' && (
                  <RangeRow layout="bare" tone="build" min={0} max={1} step={0.01} value={patch.strength ?? 0.16}
                    hint={helpText('layers-patch-feed')}
                    onChange={(v) => emit(Events.LAYER_PATCH, { id: layer.id, patch: { mode: 'feed', to, strength: v } })} />
                )}
                {patch.mode === 'mod' && (
                  <RangeRow layout="bare" tone="build" min={0} max={1} step={0.01} value={patch.strength ?? 0.16}
                    hint={helpText('layers-patch-mod')}
                    onChange={(v) => emit(Events.LAYER_PATCH, { id: layer.id, patch: { mode: 'mod', to, strength: v } })} />
                )}
                {patch.mode === 'field' && (
                  <RangeRow layout="bare" tone="build" min={0} max={1} step={0.01} value={patch.strength ?? 0.16}
                    hint={helpText('layers-patch-field')}
                    onChange={(v) => emit(Events.LAYER_PATCH, { id: layer.id, patch: { mode: 'field', to, strength: v } })} />
                )}
              </div>
              {/* #1019 — one plain-language PATCH line for newcomers, shown once
                  (first time a second KC track exists), under the first KC
                  block's PATCH section. × dismisses this session; localStorage
                  keeps it from nagging on repeat visits. */}
              {showOneliner && (
                <div className="patch-oneliner" role="note" title={PATCH_ONELINER_COPY}>
                  <span className="patch-oneliner-text">{PATCH_ONELINER_COPY}</span>
                  <button type="button" className="patch-oneliner-x" title="Got it — don't show again"
                    aria-label="Dismiss PATCH hint"
                    onClick={() => setOnelinerDismissed(true)}>×</button>
                </div>
              )}
              <PatchDiagLine layerId={layer.id} patch={patch} srcN={ordinals.get(patch.to) ?? '?'} dstN={ordinals.get(layer.id) ?? '?'} />
              {/* #1409 (petri dish A3) — DISH: the per-Look switch for the
                  shared cross-strata grid (#1407) plus its two knobs.
                  Radius is NOT here: it is A2's law (voice-set anchor ×
                  live scale × asset trim), not a performance knob. OFF is
                  the old ghost stack preserved as a choice; each stratum's
                  own #167 contacts keep working either way. */}
              <div className="strata-composite" title="DISH — one shared contact grid across strata: bodies push each other instead of ghosting. Per-Look; OFF restores the ghost stack.">
                <span className="fx-param-readout lbl" style={{ width: 'auto' }}>dish</span>
                <select className="blend-mode-select" value={dishOn ? 'on' : 'off'}
                  onChange={(e) => setParam('dish', e.target.value === 'on')}>
                  <option value="on">ON</option>
                  <option value="off">OFF</option>
                </select>
                {dishOn && (
                  <>
                    <span className="fx-param-readout lbl" style={{ width: 'auto' }}>bounce</span>
                    <RangeRow layout="bare" tone="build" min={0} max={1} step={0.01} value={dishRestitution}
                      hint="BOUNCE — contact restitution across strata: 0 sticks, 1 is fully elastic"
                      onReset={() => setParam('contactRestitution', 0.5)}
                      onChange={(v) => setParam('contactRestitution', v)} />
                    <span className="fx-param-readout">{trimNum(dishRestitution)}</span>
                  </>
                )}
              </div>
              {dishOn && (
                <div className="strata-composite" title="REPEL — personal-space force: same-group neighbours push apart before they touch">
                  <span className="fx-param-readout lbl" style={{ width: 'auto' }}>repel</span>
                  <RangeRow layout="bare" tone="build" min={0} max={5} step={0.05} value={dishRepel}
                    hint="REPEL — personal-space force gain vs same-group neighbours"
                    onReset={() => setParam('contactRepel', 0)}
                    onChange={(v) => setParam('contactRepel', v)} />
                  <span className="fx-param-readout">{trimNum(dishRepel)}</span>
                </div>
              )}
              {dishOn && (
                <div className="strata-composite" title="TEMPO — the dish's thermal energy (petri spec §4): Brownian jitter on every body in the dish. Hot never settles; 0 is the cold dish, exactly as before. DENSITY (the Layout %) is the dish's crowding pressure on REPEL.">
                  <span className="fx-param-readout lbl" style={{ width: 'auto' }}>tempo</span>
                  <RangeRow layout="bare" tone="build" min={0} max={1} step={0.01} value={dishTempo}
                    hint="TEMPO — thermal energy: Brownian jitter amplitude in the dish"
                    onReset={() => setParam('dishTempo', 0)}
                    onChange={(v) => setParam('dishTempo', v)} />
                  <span className="fx-param-readout">{trimNum(dishTempo)}</span>
                </div>
              )}
              {dishOn && dishRadius === 0 && (
                <div className="fx-note" title="The dish is on, but no stratum in this Look carries a contact radius — voices set the radius, and at radius 0 the grid never arms">idle — contact radius 0</div>
              )}
              </>
            )}
            {fx && isFxSelected && <FxEffectEditor layer={layer} fxOrdinal={ordinals.get(layer.id) || 1} />}
            {math && isMathSelected && <MathEffectEditor layer={layer} mathOrdinal={ordinals.get(layer.id) || 1} />}
            {pat && isPatSelected && <PatternEditor layer={layer} ordinal={ordinals.get(layer.id) || 1} />}
          </div>
        )}
      </div>
    );
  }

  // #1203 — the stack reads FRONT → GROUND: the array's end is the dish's
  // front, so the whole list renders frontmost-first as one continuous
  // stack (the old MATH/FX/CONTENT sections were a grouping of this same
  // order — the fold invariants in state/layerOrder.js hold it).
  const stack = rowsTopFirst(layers);
  const stackSize = stack.length;
  const strataCap = MAX_CONTENT_TRACKS + MAX_FX_TRACKS + MAX_MATH_TRACKS;
  const addTitle = addTarget
    ? `Add ${ADD_TYPE_LABEL[addTarget]} stratum — tap · long-press: choose type`
    : 'All strata caps reached';

  return (
    <div className="build-layer-stack">
      <PanelHeader tag="P08" title="LAYERS" subtitle={`${stackSize} / ${strataCap} strata`}>
        {/* Gate: header ADD buttons retired — the dashed ADD STRATUM slot
            below is the add affordance (#1203 block stack). */}
      </PanelHeader>
      <div className="strata-depth-head" title="The stack order is the dish's depth: the top block is the frontmost stratum.">▲ FRONT — stack order is depth — GROUND ▼</div>
      <PatchMatrix layers={layers} ordinals={ordinals} />
      <div className="strata-list">
        {stack.map((layer, i) => (
          <Fragment key={layer.id}>
            {i > 0 && <MixSeam upperFine={fineClass(stack[i - 1])} lowerFine={fineClass(layer)} />}
            {renderBlock(layer, i + 1, stackSize)}
          </Fragment>
        ))}
      </div>
      <div className="strata-add-wrap">
        <StrataAddSlot
          title={addTitle}
          hint="one-tap add · long-press chooser"
          disabled={!addTarget}
          onAdd={() => addTarget && doAdd(addTarget)}
          onOpenChooser={() => setChooser('type')}
        />
      </div>
      {chooser === 'type' && (
        <TypeChooser
          onClose={() => setChooser(null)}
          hasRoom={typeHasRoom}
          onPick={(t) => {
            if (t === 'fx') { setChooser('fx'); return; }
            if (t === 'content') { setChooser('content'); return; }
            setChooser(null);
            doAdd(t);
          }}
        />
      )}
      {chooser === 'fx' && (
        <FamilyChooser
          section="fx"
          fxOrdinal={nextFxOrdinal}
          fxSlotKinds={nextFxKinds}
          fxSlotLabel={nextFxSlotLabel}
          onClose={() => setChooser(null)}
          onPick={(family) => { setChooser(null); recordAddType('fx'); emit(Events.LAYER_ADD_FX, { family }); }}
        />
      )}
      {chooser === 'content' && (
        <FamilyChooser
          section="content"
          onClose={() => setChooser(null)}
          onPick={(family) => { setChooser(null); recordAddType('content'); emit(Events.LAYER_ADD, { family }); }}
        />
      )}
      <div className="strata-foot">
        <span>TAP = EDIT · HOLD = 2ND FN</span>
        <span>#1203 ROSTER</span>
      </div>
    </div>
  );
}
