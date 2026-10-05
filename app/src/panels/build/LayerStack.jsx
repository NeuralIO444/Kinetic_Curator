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
import { isMathLayer, mathTrackHitsHard } from '../../fx/mathFilters.js';
import { MathEffectEditor } from './MathEffectEditor.jsx';
import { rackSlotForFxOrdinal } from '../../fx/fxTrack.js';
import { efTileFace } from '../../fx/efRackTile.mjs';
import { displayLayerName, MAX_CONTENT_TRACKS, MAX_FX_TRACKS, MAX_MATH_TRACKS } from '../../state/slices/layersSlice.js';
import { helpText } from '../../data/helpCopy.js';
import { getPatchSample, patchSampleAgeMs, formatPatchLine, PATCH_DIAG_STALE_MS, activePatchPairs, formatMatrixRow } from '../../engine/kernel/tracks/patchDiag.mjs';
import { trackNumeral, trackNumeralTitle } from './trackNumeral.mjs';

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
      <span className="fx-param-readout" style={{ width: 'auto' }}>MATRIX</span>
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

function EfGlyph({ kind }) {
  if (kind === 'displace') return <svg className="ef-glyph" viewBox="0 0 32 32" aria-hidden="true"><path d="M6 16c4-6 6 6 10 0s6-6 10 0" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
  if (kind === 'tear') return <svg className="ef-glyph" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 8h10M14 16h10M8 24h10" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
  if (kind === 'rgbSplit') return <svg className="ef-glyph" viewBox="0 0 32 32" aria-hidden="true"><path d="M10 10h8M14 16h8M10 22h8" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
  if (kind === 'halo') return <svg className="ef-glyph" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="4" fill="currentColor" /><circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>;
  if (kind === 'grain') return <svg className="ef-glyph" viewBox="0 0 32 32" aria-hidden="true"><circle cx="10" cy="12" r="1" fill="currentColor" /><circle cx="18" cy="10" r="1" fill="currentColor" /><circle cx="22" cy="18" r="1" fill="currentColor" /><circle cx="12" cy="20" r="1" fill="currentColor" /></svg>;
  if (!kind || kind === 'empty') return <svg className="ef-glyph" viewBox="0 0 32 32" aria-hidden="true"><rect x="8" y="8" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" /></svg>;
  return <svg className="ef-glyph" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

function EfTile({ slot, kind, onBypass, children }) {
  const face = efTileFace(slot, kind);
  return (
    <div className="ef-tile" title={`${slot.label} · ${face.word}`}>
      <span className="ef-abbr">{face.abbr}</span>
      {onBypass ? (
        <button type="button" className="ef-bypass" onClick={onBypass} title="Remove this effect">✕</button>
      ) : <span className="ef-bypass ef-bypass-off" aria-hidden="true" />}
      <EfGlyph kind={face.glyph} />
      <span className="ef-word">{face.word}</span>
      {children}
    </div>
  );
}

// #520 Phase 4 — rack UI: slot-driven display, one row per EF slot.
// #716 — TX-6 tile: abbreviation, ✕, glyph, one mode word.
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
    return (
      <div className="fx-editor" title={`FX ${fxOrdinal} · ${slot.label}`}>
        <EfTile slot={slot} kind={filled.kind} onBypass={() => emit(Events.FX_EFFECT_REMOVE, { layerId: layer.id, index: filledIdx })}>
          {Object.entries(def.params).map(([key, p]) => (
            <div className="fx-param" key={key}>
              <label title={p.hint}>{p.label}</label>
              <input type="range" min={p.min} max={p.max} step={p.step} value={filled.params?.[key] ?? p.def}
                onDoubleClick={() => emit(Events.FX_EFFECT_SET_PARAM, { layerId: layer.id, index: filledIdx, key, value: p.def })}
                onChange={(e) => emit(Events.FX_EFFECT_SET_PARAM, { layerId: layer.id, index: filledIdx, key, value: Number(e.target.value) })} />
              <span className="fx-param-readout">{filled.params?.[key] ?? p.def}</span>
            </div>
          ))}
        </EfTile>
      </div>
    );
  }

  const effectiveKind = slotKinds.includes(pick) ? pick : (slotKinds[0] ?? null);
  return (
    <div className="fx-editor" title={`${slot.label} · one family`}>
      <EfTile slot={slot} kind={null}>
        <span className="fx-slot-family">{slot.label}</span>
        {slot.stubs.map((s) => (
          <span key={s} className="fx-stub" title="Planned — not yet available">{s.toUpperCase()}</span>
        ))}
        {effectiveKind && (
          <>
            {slotKinds.length > 1 && (
              <select className="tg" value={effectiveKind} onChange={(e) => setPick(e.target.value)}>
                {slotKinds.map((k) => <option key={k} value={k}>{FX_EFFECT_DEFS[k].label.toUpperCase()}</option>)}
              </select>
            )}
            <button className="chip-btn" onClick={() => emit(Events.FX_EFFECT_ADD, { layerId: layer.id, kind: effectiveKind })}>
              + {slotKinds.length === 1 ? FX_EFFECT_DEFS[effectiveKind].label.toUpperCase() : 'ADD'}
            </button>
          </>
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
  const { state } = useApp(s => ({ layers: s.layers, activeLayerId: s.activeLayerId, selectedFxLayerId: s.selectedFxLayerId, selectedMathLayerId: s.selectedMathLayerId }));
  const { layers, activeLayerId, selectedFxLayerId, selectedMathLayerId } = state;
  const setLayerPatch = useStore((s) => s.setLayerPatch);
  const isAdj = (l) => isFxLayer(l) || isMathLayer(l);
  const fineClass = (l) => (isMathLayer(l) ? 'math' : isFxLayer(l) ? 'fx' : 'content');
  const contentCount = layers.filter((l) => !isAdj(l)).length;
  const fxCount = layers.filter(isFxLayer).length;
  const mathCount = layers.filter(isMathLayer).length;
  const singleTrack = contentCount < 2; // PATCH has nothing to point at (a patched row can still be set back to OFF)
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
  const ordinals = new Map(); // content ids -> KC-n, FX ids -> FX n, MATH ids -> M n (separate counters)
  const contentTargets = [];
  for (const l of layers) {
    if (isMathLayer(l)) {
      mathOrdinal += 1;
      ordinals.set(l.id, mathOrdinal);
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

  function handleMove(layer, dir) {
    const cls = fineClass(layer);
    const group = layers.filter((l) => fineClass(l) === cls); // flat order = section order
    const gi = group.findIndex((l) => l.id === layer.id);
    const ni = gi + dir;
    if (ni < 0 || ni >= group.length) return;
    const neighbor = group[ni];
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
    const cls = fineClass(layer);
    const group = layers.filter((l) => fineClass(l) === cls);
    const gi = group.findIndex((l) => l.id === layer.id);
    const isActive = layer.id === activeLayerId;
    const isFxSelected = layer.id === selectedFxLayerId;
    const isMathSelected = layer.id === selectedMathLayerId;
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
      <div key={layer.id} className={`layer-row${cls === 'content' ? ' layer-row-kc' : ''} ${isActive ? 'layer-row-active' : ''} ${fx ? 'layer-row-fx' : ''} ${isFxSelected ? 'layer-row-fx-selected' : ''} ${math ? 'layer-row-math' : ''} ${isMathSelected ? 'layer-row-math-selected' : ''} ${hitsHard ? 'layer-row-math-hard' : ''}${moveFlash?.id === layer.id ? ' layer-row-moved' : ''}`}>
        <div className="layer-row-main">
          <TrackNumeral n={ordinals.get(layer.id) || 1} kind={math ? 'math' : fx ? 'fx' : 'kc'} edited={math ? isMathSelected : fx ? isFxSelected : isActive} />
          <div className="layer-reorder">
            <button className="micro-btn" disabled={gi === 0} onClick={() => handleMove(layer, -1)}>▲</button>
            <button className="micro-btn" disabled={gi === group.length - 1} onClick={() => handleMove(layer, 1)}>▼</button>
          </div>
          {/* #1015 — transient position badge on the moved row */}
          {moveFlash?.id === layer.id && (
            <span className={`reorder-badge${fx ? ' reorder-badge-fx' : ''}`} role="status">now {moveFlash.label}</span>
          )}
          <button className="micro-btn" onClick={() => emit(Events.LAYER_TOGGLE_VISIBLE, { id: layer.id })}>{layer.visible ? '●' : '○'}</button>
          <button className="micro-btn" disabled={fx} title={fx ? 'Solo applies to KC tracks (FX never solos)' : math ? 'Solo the grade: this track alone over neutral mid-grey' : undefined} onClick={() => emit(Events.LAYER_SOLO, { id: layer.id })}>{(soloed || mathSoloed) ? 'S·' : 'S'}</button>
          {fx && <span className="fx-badge">FX</span>}
          {math && <span className="math-badge" title={hitsHard ? 'M — this track is changing the picture hard' : 'M — MATH track'}>M</span>}
          <button
            className="layer-name"
            title={(isActive && !adj) || (isFxSelected && fx) || (isMathSelected && math) ? `${label} — editing` : label}
            onClick={() => emit(math ? Events.MATH_SELECT : fx ? Events.FX_SELECT : Events.LAYER_SET_ACTIVE, { id: layer.id })}
          >
            {label}
          </button>
          <button className={`micro-btn${dupCapped ? ' dup-capped' : ''}`} disabled={dupCapped} title={dupCapped ? 'Track cap reached' : undefined} onClick={() => emit(Events.LAYER_DUPLICATE, { id: layer.id })}>DUP</button>
          <button className="micro-btn" disabled={!isAdj(layer) && contentCount <= 1} onClick={() => emit(Events.LAYER_REMOVE, { id: layer.id })}>×</button>
        </div>
        <div className="layer-row-composite">
          {adj ? (
            <span className="fx-param" style={{ flex: 1 }}><label>Blend</label><span className="fx-param-readout" style={{ width: 'auto' }}>—</span></span>
          ) : (
            <select className="tg blend-mode-select" value={layer.layerBlendMode} title={helpText('layers-blend')}
              onChange={(e) => emit(Events.LAYER_SET_BLEND_MODE, { id: layer.id, mode: e.target.value })}>
              {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}
            </select>
          )}
          <input type="range" min={0} max={1} step={0.01} value={layer.layerOpacity}
            title={math ? 'Wet/dry — how much of the grade shows. HUE ROTATE caps this track at 50%.' : undefined}
            onChange={(e) => emit(Events.LAYER_SET_OPACITY, { id: layer.id, opacity: Number(e.target.value) })} />
          <span className="layer-opacity-readout">{Math.round(layer.layerOpacity * 100)}%</span>
        </div>
        {!adj && (
          <>
          <div className="layer-row-composite" title={singleTrack ? 'PATCH needs a second KC track' : 'PATCH — FEED amount when mode is FEED'}>
            <span className="fx-param-readout" style={{ width: 'auto' }}>PATCH</span>
            <select className="tg blend-mode-select" value={patch.mode} disabled={singleTrack && patch.mode === 'off'}
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
            <select className="tg blend-mode-select" value={to || ''} disabled={singleTrack}
              onChange={(e) => setLayerPatch(layer.id, { mode: patch.mode, to: e.target.value, strength: patch.strength })}>
              {contentTargets.map((t) => (
                <option key={t.id} value={t.id} disabled={t.id === layer.id}>KC-{t.n}</option>
              ))}
            </select>
            {patch.mode === 'feed' && (
              <input type="range" min={0} max={1} step={0.01} value={patch.strength ?? 0.16}
                title={helpText('layers-patch-feed')}
                onChange={(e) => setLayerPatch(layer.id, { mode: 'feed', to, strength: Number(e.target.value) })} />
            )}
            {patch.mode === 'mod' && (
              <input type="range" min={0} max={1} step={0.01} value={patch.strength ?? 0.16}
                title={helpText('layers-patch-mod')}
                onChange={(e) => setLayerPatch(layer.id, { mode: 'mod', to, strength: Number(e.target.value) })} />
            )}
            {patch.mode === 'field' && (
              <input type="range" min={0} max={1} step={0.01} value={patch.strength ?? 0.16}
                title={helpText('layers-patch-field')}
                onChange={(e) => setLayerPatch(layer.id, { mode: 'field', to, strength: Number(e.target.value) })} />
            )}
          </div>
          <PatchDiagLine layerId={layer.id} patch={patch} srcN={ordinals.get(patch.to) ?? '?'} dstN={ordinals.get(layer.id) ?? '?'} />
          </>
        )}
        {fx && isFxSelected && <FxEffectEditor layer={layer} fxOrdinal={ordinals.get(layer.id) || 1} />}
        {math && isMathSelected && <MathEffectEditor layer={layer} mathOrdinal={ordinals.get(layer.id) || 1} />}
      </div>
    );
  }

  // #1014 (mockup C) — section header: title, n/4 count, "+" (tap = add
  // with last-used defaults, long-press = family chooser), hint line.
  function renderSectionHead({ title, count, max, hint, addTitle, addChooserLabel, addDisabled, onAdd, onOpenChooser }) {
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
      <div className="layer-section">
        {renderSectionHead({
          title: 'Content', count: contentCount, max: MAX_CONTENT_TRACKS,
          hint: 'one-tap add · long-press chooser',
          addTitle: 'Add KC track', addChooserLabel: 'choose blend',
          addDisabled: contentCount >= MAX_CONTENT_TRACKS,
          onAdd: () => emit(Events.LAYER_ADD),
          onOpenChooser: () => setChooser('content'),
        })}
        {chooser === 'content' && (
          <FamilyChooser
            section="content"
            onClose={() => setChooser(null)}
            onPick={(family) => { setChooser(null); emit(Events.LAYER_ADD, { family }); }}
          />
        )}
        <div className="layer-list">
          {layers.filter((l) => !isAdj(l)).map((layer) => renderRow(layer))}
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
          {layers.filter(isFxLayer).map((layer) => renderRow(layer))}
        </div>
      </div>
      <div className="layer-section">
        {renderSectionHead({
          title: 'Math', count: mathCount, max: MAX_MATH_TRACKS,
          addTitle: 'Add MATH track',
          addDisabled: mathCount >= MAX_MATH_TRACKS,
          onAdd: () => emit(Events.LAYER_ADD_MATH),
          onOpenChooser: null, // MATH: tap-only, unchanged add behavior
        })}
        <div className="layer-list">
          {layers.filter(isMathLayer).map((layer) => renderRow(layer))}
        </div>
      </div>
    </div>
  );
}
