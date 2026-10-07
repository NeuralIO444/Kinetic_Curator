// Layer stack — #248 Phase 3: BuildPanel's second section, extracted
// verbatim from the old LayersPanel.jsx. #1014 (mockup C rebuild): ghost
// slots are gone — each section (CONTENT / FX / MATH) gets a "+" in its
// header (tap = add with last-used defaults, long-press = family chooser).
import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../state/AppContext.jsx';
import { useStore } from '../../state/store.js';
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
import { trackNumeral, trackNumeralTitle } from './trackNumeral.mjs';
import { rowsTopFirst, moveNeighbor, canMoveUp, canMoveDown } from './layerRows.mjs';
import { PATCH_ONELINER_COPY, shouldShowPatchOneLiner, readPatchOneLinerSeen, writePatchOneLinerSeen } from './patchOneLiner.mjs';
import { RangeRow } from '../../components/RangeRow.jsx';

// #716 Part 2 — black block + white numeral heads every row. The edited
// track inverts (white block, black numeral).
function TrackNumeral({ n, kind, edited = false }) {
  const glyph = trackNumeral(n, kind);
  if (!glyph) return null;
  return (
    <span
      className={`track-numeral${edited ? ' track-numeral-edited' : ''}`}
      title={trackNumeralTitle(n, kind, { edited })}
      aria-hidden="true"
    >{glyph}</span>
  );
}

// #509 phase 3 — matrix overview: every live cross-layer link in one
// glance. Config render of store state (re-renders with layers naturally);
// liveness stays in the row lines (#507). No new panel, no new state.
function PatchMatrix({ layers, ordinals }) {
  const pairs = activePatchPairs(layers);
  if (!pairs.length) return null;
  return (
    <div className="patch-matrix" title="Patch matrix — every live cross-layer link. Edit in the rows below.">
      <span className="fx-param-readout lbl" style={{ width: 'auto' }}>matrix</span>
      {pairs.map((p) => (
        <div key={p.dstId} className="patch-diag">{formatMatrixRow(p, ordinals)}</div>
      ))}
    </div>
  );
}

// #507 — inline PATCH diagnostic: one live line under each patched row
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

// #1014 (mockup C rebuild) — per-section "+": one tap arms a track with
// last-used defaults, long-press opens the family chooser. Long-press shape
// follows VoicesShelf (650ms, pointer down/up/leave + click guard).
const LONG_PRESS_MS = 650;

function SectionAddButton({ title, chooserLabel, disabled, onAdd, onOpenChooser }) {
  const timer = useRef(null);
  const longFired = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const startPress = () => {
    if (disabled) return;
    longFired.current = false;
    clearTimeout(timer.current);
    if (!onOpenChooser) return; // MATH: tap-only — a hold still adds
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
      className="layer-add-btn"
      disabled={disabled}
      title={disabled ? 'Track cap reached' : (chooserLabel ? `${title} — tap: add · long-press: ${chooserLabel}` : title)}
      aria-label={title}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onClick={handleClick}
    >+</button>
  );
}

// #1014 (mockup C rebuild) — long-press chooser: the family/pick UI.
// CONTENT picks a blend mode. FX picks an effect kind for the NEXT track's
// family — each FX ordinal is bound to one rack family (#520/#732), so the
// chooser only offers that family's add-menu kinds (a cross-family pick
// would arm a phantom effect the row editor can't show).
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
  const { state } = useApp(s => ({ layers: s.layers, activeLayerId: s.activeLayerId, selectedFxLayerId: s.selectedFxLayerId, selectedMathLayerId: s.selectedMathLayerId, selectedPatternLayerId: s.selectedPatternLayerId }));
  const { layers, activeLayerId, selectedFxLayerId, selectedMathLayerId, selectedPatternLayerId } = state;
  const setLayerPatch = useStore((s) => s.setLayerPatch);
  const addPatternLayer = useStore((s) => s.addPatternLayer);
  const selectPatternLayer = useStore((s) => s.selectPatternLayer);
  const isAdj = (l) => isFxLayer(l) || isMathLayer(l);
  const fineClass = (l) => (isMathLayer(l) ? 'math' : isFxLayer(l) ? 'fx' : 'content');
  const contentCount = layers.filter((l) => !isAdj(l)).length;
  const fxCount = layers.filter(isFxLayer).length;
  const mathCount = layers.filter(isMathLayer).length;
  const kcCount = layers.filter(isKcLayer).length; // #1099 — a PATTERN track is content for the cap, but not a KC track
  const singleTrack = kcCount < 2; // PATCH has nothing to point at (a patched row can still be set back to OFF)
  // #1019 — PATCH one-liner for newcomers ("route one track's motion into
  // another"): visible the first time a second KC track exists, then it gets
  // out of the way. `seen` persists via localStorage (never nags on repeat
  // visits); `dismissed` is the session-only ×. The flag is written the
  // first time the line displays, so it stays up for the current session
  // until the user taps ×, but a reload never brings it back.
  const [onelinerSeen] = useState(() => readPatchOneLinerSeen());
  const [onelinerDismissed, setOnelinerDismissed] = useState(false);
  const onelinerVisible = shouldShowPatchOneLiner({ seen: onelinerSeen, dismissed: onelinerDismissed, contentCount });
  useEffect(() => {
    if (onelinerVisible) writePatchOneLinerSeen();
  }, [onelinerVisible]);
  // #1014 (mockup C rebuild) — no ghost rows: each section gets a "+".
  // `chooser` is the open family picker: 'content' | 'fx' | null.
  const [chooser, setChooser] = useState(null);
  // The next FX track's family is fixed by its ordinal (#520/#732) — the
  // chooser only offers that family's add-menu kinds.
  const nextFxOrdinal = fxCount + 1;
  const nextFxSlot = rackSlotForFxOrdinal(nextFxOrdinal);
  const nextFxKinds = (nextFxSlot?.kinds ?? []).filter((k) => FX_MENU_KINDS.includes(k));
  const nextFxSlotLabel = nextFxSlot ? `${nextFxSlot.slot} · ${nextFxSlot.label}` : 'No family';

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

  // #1015 — reorder feedback, reworked for the sectioned stack (#1014
  // mockup C): rows move within their section, so ▲▼ swap the layer with
  // its section-neighbor (same fine class) directly. The swap trades
  // ordinals, so the "now KC-2" badge reads the neighbor's old ordinal.
  // MATH rows stay flash-free, as before.
  const [moveFlash, setMoveFlash] = useState(null); // { id, label } | null
  const flashTimer = useRef(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // #1037 — rows are listed frontmost first, so ▲ means "later in the chain":
  // it trades with the neighbor at the next-HIGHER array index (layerRows.mjs).
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

  // #1014 (mockup C rebuild) — one row renderer shared by the three
  // sections. Rows sit under their section header in ascending ordinal;
  // ▲▼ move the row within its section.
  function renderRow(layer) {
    const fx = isFxLayer(layer);
    const math = isMathLayer(layer);
    const adj = fx || math;
    const wet = wetDisplay(layer); // #1023: what the renderer will honor
    const cls = fineClass(layer);
    const group = layers.filter((l) => fineClass(l) === cls);
    const gi = group.findIndex((l) => l.id === layer.id);
    const isActive = layer.id === activeLayerId;
    const isFxSelected = layer.id === selectedFxLayerId;
    const isMathSelected = layer.id === selectedMathLayerId;
    const pat = isPatternLayer(layer); // #1099
    const isPatSelected = layer.id === selectedPatternLayerId;
    const soloed = !adj && layer.visible && layers.every((l) => l.id === layer.id || isAdj(l) || !l.visible);
    const mathSoloed = math && layer.visible && layers.every((l) => l.id === layer.id || !l.visible);
    const label = displayLayerName(layer, ordinals.get(layer.id) || 1);
    const patch = layer.patch || { mode: 'off', to: null, strength: 0.16 };
    const to = (!patch.to || patch.to === layer.id) ? otherTarget(layer) : patch.to;
    const hitsHard = math && mathTrackHitsHard(layer);
    // #1015 — DUP at cap used to click through silently. Cap the button
    // instead: disabled + tooltip so the cap reads instead of swallowing
    // the click. MATH rows are out of scope — their DUP is untouched.
    const dupCapped = math ? false : fx ? fxCount >= MAX_FX_TRACKS : contentCount >= MAX_CONTENT_TRACKS;
    return (
      <div
        key={layer.id}
        className={`layer-row${cls === 'content' ? ' layer-row-kc' : ''} ${isActive ? 'layer-row-active' : ''} ${fx ? 'layer-row-fx' : ''} ${isFxSelected ? 'layer-row-fx-selected' : ''} ${math ? 'layer-row-math' : ''} ${isMathSelected ? 'layer-row-math-selected' : ''} ${pat ? 'layer-row-pattern' : ''} ${isPatSelected ? 'layer-row-pattern-selected' : ''} ${hitsHard ? 'layer-row-math-hard' : ''}${moveFlash?.id === layer.id ? ' layer-row-moved' : ''}`}
        // #1018 (F8) — the whole FX row arms the effect editor. The name
        // used to be the only affordance and it reads as a label, so the
        // editor was undiscoverable. Row-body taps anywhere on an FX row
        // emit the same FX_SELECT the name button emits; icon buttons,
        // the opacity slider, and the editor's own controls keep their
        // own handlers (the closest() bail-out). KC rows are unchanged;
        // MATH rows are out of scope (#1010).
        onClick={(e) => {
          if (!fx && !pat) return;
          if (e.target.closest('button, input, select, label, a')) return;
          if (pat) { selectPatternLayer(layer.id); return; } // #1099 — the whole PATTERN row opens its editor
          emit(Events.FX_SELECT, { id: layer.id });
        }}
        title={fx ? `Tap to open the ${label} effect editor` : pat ? `Tap to open the ${label} pattern editor` : undefined}
      >
        <div className="layer-row-main">
          <TrackNumeral n={ordinals.get(layer.id) || 1} kind={math ? 'math' : fx ? 'fx' : pat ? 'pattern' : 'kc'} edited={math ? isMathSelected : fx ? isFxSelected : pat ? isPatSelected : isActive} />
          <div className="layer-reorder">
            <button className="micro-btn" disabled={!canMoveUp(group, layer.id)} title="Move up" onClick={() => handleMove(layer, 'up')}>▲</button>
            <button className="micro-btn" disabled={!canMoveDown(group, layer.id)} title="Move down" onClick={() => handleMove(layer, 'down')}>▼</button>
          </div>
          {/* #1015 — transient position badge on the moved row */}
          {moveFlash?.id === layer.id && (
            <span className={`reorder-badge${fx ? ' reorder-badge-fx' : ''}`} role="status">now {moveFlash.label}</span>
          )}
          <button className="micro-btn" title="Toggle visibility" onClick={() => emit(Events.LAYER_TOGGLE_VISIBLE, { id: layer.id })}>{layer.visible ? '●' : '○'}</button>
          <button className="micro-btn" disabled={fx} title={fx ? 'Solo applies to KC tracks (FX never solos)' : math ? 'Solo the grade: this track alone over neutral mid-grey' : 'Solo'} onClick={() => emit(Events.LAYER_SOLO, { id: layer.id })}>{(soloed || mathSoloed) ? 'S·' : 'S'}</button>
          {fx && <span className="fx-badge">FX</span>}
          {math && <span className="math-badge" title={hitsHard ? 'M — this track is changing the picture hard' : 'M — MATH track'}>M</span>}
          <button
            className="layer-name"
            title={(isActive && !adj && !pat) || (isFxSelected && fx) || (isMathSelected && math) || (isPatSelected && pat) ? `${label} — editing` : label}
            onClick={() => (pat ? selectPatternLayer(layer.id) : emit(math ? Events.MATH_SELECT : fx ? Events.FX_SELECT : Events.LAYER_SET_ACTIVE, { id: layer.id }))}
          >
            {label}
          </button>
          <button className={`act micro-btn${dupCapped ? ' dup-capped' : ''}`} disabled={dupCapped} title={dupCapped ? 'Track cap reached' : 'Duplicate'} onClick={() => emit(Events.LAYER_DUPLICATE, { id: layer.id })}>dup</button>
          <button className="micro-btn" title="Remove track (undoable)" disabled={isKcLayer(layer) && kcCount <= 1} onClick={() => emit(Events.LAYER_REMOVE, { id: layer.id })}>×</button>
        </div>
        <div className="layer-row-composite">
          {/* #1016 — blend modes only exist on CONTENT tracks. FX/MATH
              composite via wet/dry, so the old "Blend —" cell could
              never show anything but a dash — it read as a broken
              control holding layout alignment. Replaced with the
              compact WET label (mockup C) so the slider keeps its
              address in the row. */}
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
          <span className={`layer-opacity-readout${wet.capped ? ' capped' : ''}`}>{Math.round(wet.wet * 100)}%{wet.capped ? ' max' : ''}</span>
        </div>
        {!adj && !pat && (
          <>
          <div className="layer-row-composite" title={singleTrack ? 'PATCH needs a second KC track' : 'PATCH — FEED amount when mode is FEED'}>
            <span className="fx-param-readout lbl" style={{ width: 'auto' }}>patch</span>
            <select className="blend-mode-select" value={patch.mode} disabled={singleTrack && patch.mode === 'off'}
              onChange={(e) => setLayerPatch(layer.id, { mode: e.target.value, to, strength: patch.strength })}>
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
              onChange={(e) => setLayerPatch(layer.id, { mode: patch.mode, to: e.target.value, strength: patch.strength })}>
              {contentTargets.map((t) => (
                <option key={t.id} value={t.id} disabled={t.id === layer.id}>KC-{t.n}</option>
              ))}
            </select>
            {patch.mode === 'feed' && (
              <RangeRow layout="bare" tone="build" min={0} max={1} step={0.01} value={patch.strength ?? 0.16}
                hint={helpText('layers-patch-feed')}
                onChange={(v) => setLayerPatch(layer.id, { mode: 'feed', to, strength: v })} />
            )}
            {patch.mode === 'mod' && (
              <RangeRow layout="bare" tone="build" min={0} max={1} step={0.01} value={patch.strength ?? 0.16}
                hint={helpText('layers-patch-mod')}
                onChange={(v) => setLayerPatch(layer.id, { mode: 'mod', to, strength: v })} />
            )}
            {patch.mode === 'field' && (
              <RangeRow layout="bare" tone="build" min={0} max={1} step={0.01} value={patch.strength ?? 0.16}
                hint={helpText('layers-patch-field')}
                onChange={(v) => setLayerPatch(layer.id, { mode: 'field', to, strength: v })} />
            )}
          </div>
          {/* #1019 — one plain-language PATCH line for newcomers, shown once
              (first time a second KC track exists), under the first row's
              PATCH row. × dismisses this session; localStorage keeps it
              from nagging on repeat visits. */}
          {!adj && gi === 0 && onelinerVisible && (
            <div className="patch-oneliner" role="note" title={PATCH_ONELINER_COPY}>
              <span className="patch-oneliner-text">{PATCH_ONELINER_COPY}</span>
              <button type="button" className="patch-oneliner-x" title="Got it — don't show again"
                aria-label="Dismiss PATCH hint"
                onClick={() => setOnelinerDismissed(true)}>×</button>
            </div>
          )}
          <PatchDiagLine layerId={layer.id} patch={patch} srcN={ordinals.get(patch.to) ?? '?'} dstN={ordinals.get(layer.id) ?? '?'} />
          </>
        )}
        {fx && isFxSelected && <FxEffectEditor layer={layer} fxOrdinal={ordinals.get(layer.id) || 1} />}
        {math && isMathSelected && <MathEffectEditor layer={layer} mathOrdinal={ordinals.get(layer.id) || 1} />}
        {pat && isPatSelected && <PatternEditor layer={layer} ordinal={ordinals.get(layer.id) || 1} />}
      </div>
    );
  }

  // #1014 (mockup C) — section header: title, n/4 count, "+" (tap = add
  // with last-used defaults, long-press = family chooser), hint line.
  function renderSectionHead({ title, count, max, hint, addTitle, addChooserLabel, addDisabled, onAdd, onOpenChooser, extra }) {
    return (
      <div className="layer-section-head">
        <span className="layer-section-title">{title}</span>
        <span className="layer-section-count">{count}/{max}</span>
        <SectionAddButton
          title={addTitle}
          chooserLabel={addChooserLabel}
          disabled={addDisabled}
          onAdd={onAdd}
          onOpenChooser={onOpenChooser}
        />
        {extra}
        {hint && <span className="layer-section-hint">{hint}</span>}
      </div>
    );
  }

  return (
    <div className="build-layer-stack">
      <PanelHeader tag="P08" title="LAYERS" subtitle={`${contentCount} / ${MAX_CONTENT_TRACKS} tracks`}>
        {/* Gate: header ADD buttons retired — per-section "+" buttons below
            are the add affordance (mockup C, #1014 rebuild). */}
      </PanelHeader>
      <PatchMatrix layers={layers} ordinals={ordinals} />
      {/* #1037 — sections read MATH / FX / CONTENT top to bottom: the frontmost, last-applied track is on top. */}
      <div className="layer-section">
        {renderSectionHead({
          title: 'Math', count: mathCount, max: MAX_MATH_TRACKS,
          addTitle: 'Add MATH track',
          addDisabled: mathCount >= MAX_MATH_TRACKS,
          onAdd: () => emit(Events.LAYER_ADD_MATH),
          onOpenChooser: null, // MATH: tap-only, unchanged add behavior
        })}
        <div className="layer-list">
          {rowsTopFirst(layers.filter(isMathLayer)).map((layer) => renderRow(layer))}
        </div>
      </div>
      <div className="layer-section">
        {renderSectionHead({
          title: 'FX', count: fxCount, max: MAX_FX_TRACKS,
          addTitle: 'Add FX track', addChooserLabel: 'choose effect',
          addDisabled: fxCount >= MAX_FX_TRACKS,
          onAdd: () => emit(Events.LAYER_ADD_FX),
          onOpenChooser: () => setChooser('fx'),
        })}
        {chooser === 'fx' && (
          <FamilyChooser
            section="fx"
            fxOrdinal={nextFxOrdinal}
            fxSlotKinds={nextFxKinds}
            fxSlotLabel={nextFxSlotLabel}
            onClose={() => setChooser(null)}
            onPick={(family) => { setChooser(null); emit(Events.LAYER_ADD_FX, { family }); }}
          />
        )}
        <div className="layer-list">
          {rowsTopFirst(layers.filter(isFxLayer)).map((layer) => renderRow(layer))}
        </div>
      </div>
      <div className="layer-section">
        {renderSectionHead({
          title: 'Content', count: contentCount, max: MAX_CONTENT_TRACKS,
          hint: 'one-tap add · long-press chooser',
          addTitle: 'Add KC track', addChooserLabel: 'choose blend',
          addDisabled: contentCount >= MAX_CONTENT_TRACKS,
          onAdd: () => emit(Events.LAYER_ADD),
          onOpenChooser: () => setChooser('content'),
          // #1099 — a PATTERN track is added beside the KC one, and opens its editor.
          extra: (
            <button type="button" className="micro-btn act layer-add-pattern" disabled={contentCount >= MAX_CONTENT_TRACKS}
              title={contentCount >= MAX_CONTENT_TRACKS ? 'Track cap reached' : 'Add PATTERN track — a generated tessellation, glyph poster or field'}
              onClick={() => addPatternLayer('QUILT')}>+ pattern</button>
          ),
        })}
        {chooser === 'content' && (
          <FamilyChooser
            section="content"
            onClose={() => setChooser(null)}
            onPick={(family) => { setChooser(null); emit(Events.LAYER_ADD, { family }); }}
          />
        )}
        <div className="layer-list">
          {rowsTopFirst(layers.filter((l) => !isAdj(l))).map((layer) => renderRow(layer))}
        </div>
      </div>
    </div>
  );
}
