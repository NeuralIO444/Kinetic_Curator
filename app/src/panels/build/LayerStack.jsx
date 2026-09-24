// Layer stack — #248 Phase 3: BuildPanel's second section, extracted
// verbatim from the old LayersPanel.jsx (layer rows, #341 ghost slots,
// blend mode, opacity, PATCH row, FX effect editor). No logic changed —
// same store selectors, same Events emissions.
import { useState, useEffect } from 'react';
import { useApp } from '../../state/AppContext.jsx';
import { useStore } from '../../state/store.js';
import { PanelHeader } from '../../components/PanelHeader.jsx';
import { emit, Events } from '../../composition/eventBus.js';
import { BLEND_MODES } from '../../data/layout-modes.js';
import { FX_EFFECT_DEFS, FX_MENU_KINDS, isFxLayer } from '../../fx/fxFilters.js';
import { displayLayerName, MAX_CONTENT_TRACKS, MAX_FX_TRACKS } from '../../state/slices/layersSlice.js';
import { helpText } from '../../data/helpCopy.js';
import { getPatchSample, patchSampleAgeMs, formatPatchLine, PATCH_DIAG_STALE_MS, activePatchPairs, formatMatrixRow } from '../../engine/kernel/tracks/patchDiag.mjs';

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

function FxEffectEditor({ layer }) {
  const [addKind, setAddKind] = useState(FX_MENU_KINDS[0]);
  const effects = layer.effects || [];
  return (
    <div className="fx-editor" title="Effect stack">
      {effects.map((fx, i) => {
        const def = FX_EFFECT_DEFS[fx.kind];
        if (!def) return null;
        return (
          <div className="fx-effect" key={`${fx.kind}-${i}`}>
            <div className="fx-effect-head">
              <span className="fx-effect-name" title={def.hint}>{def.label}</span>
              <button className="micro-btn" disabled={i === 0} onClick={() => emit(Events.FX_EFFECT_REORDER, { layerId: layer.id, index: i, delta: -1 })}>▲</button>
              <button className="micro-btn" disabled={i === effects.length - 1} onClick={() => emit(Events.FX_EFFECT_REORDER, { layerId: layer.id, index: i, delta: 1 })}>▼</button>
              <button className="micro-btn" onClick={() => emit(Events.FX_EFFECT_REMOVE, { layerId: layer.id, index: i })}>×</button>
            </div>
            {Object.entries(def.params).map(([key, p]) => (
              <div className="fx-param" key={key}>
                <label title={p.hint}>{p.label}</label>
                <input type="range" min={p.min} max={p.max} step={p.step} value={fx.params?.[key] ?? p.def}
                  onDoubleClick={() => emit(Events.FX_EFFECT_SET_PARAM, { layerId: layer.id, index: i, key, value: p.def })}
                  onChange={(e) => emit(Events.FX_EFFECT_SET_PARAM, { layerId: layer.id, index: i, key, value: Number(e.target.value) })} />
                <span className="fx-param-readout">{fx.params?.[key] ?? p.def}</span>
              </div>
            ))}
          </div>
        );
      })}
      <div className="fx-add-row">
        <select className="tg" value={addKind} onChange={(e) => setAddKind(e.target.value)}>
          {FX_MENU_KINDS.map((k) => <option key={k} value={k}>{FX_EFFECT_DEFS[k].label.toUpperCase()}</option>)}
        </select>
        <button className="chip-btn" onClick={() => emit(Events.FX_EFFECT_ADD, { layerId: layer.id, kind: addKind })}>+ EFFECT</button>
      </div>
    </div>
  );
}

export function LayerStack() {
  const { state } = useApp(s => ({ layers: s.layers, activeLayerId: s.activeLayerId, selectedFxLayerId: s.selectedFxLayerId }));
  const { layers, activeLayerId, selectedFxLayerId } = state;
  const setLayerPatch = useStore((s) => s.setLayerPatch);
  const contentCount = layers.filter((l) => !isFxLayer(l)).length;
  const fxCount = layers.filter(isFxLayer).length;
  const singleTrack = contentCount < 2; // PATCH has nothing to point at (a patched row can still be set back to OFF)
  const ghosts = [];
  for (let n = contentCount + 1; n <= MAX_CONTENT_TRACKS; n++) ghosts.push(n);
  // #341 — FX slots get the same dimmed-until-reached-for treatment as
  // content tracks: virtual, tap-to-arm, cost nothing until armed.
  const fxGhosts = [];
  for (let n = fxCount + 1; n <= MAX_FX_TRACKS; n++) fxGhosts.push(n);

  let contentOrdinal = 0;
  let fxOrdinal = 0;
  const ordinals = new Map(); // content ids -> KC-n, FX ids -> FX n (separate counters)
  const contentTargets = [];
  for (const l of layers) {
    if (!isFxLayer(l)) {
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

  return (
    <div className="build-layer-stack">
      <PanelHeader tag="P08" title="LAYERS" subtitle={`${contentCount} / ${MAX_CONTENT_TRACKS} tracks`}>
        {/* Gate: header ADD buttons retired — ghost slots below are premade
            and limited (tap-to-arm); the buttons duplicated them. */}
      </PanelHeader>
      <PatchMatrix layers={layers} ordinals={ordinals} />
      <div className="layer-list">
        {fxGhosts.slice().reverse().map((n) => (
          <div key={`ghost-fx-${n}`} className="layer-row" style={{ opacity: 0.35 }} onClick={() => emit(Events.LAYER_ADD_FX)}>
            <div className="layer-row-main"><button className="layer-name" type="button">FX {n}</button></div>
          </div>
        ))}
        {ghosts.slice().reverse().map((n) => (
          <div key={`ghost-kc-${n}`} className="layer-row" style={{ opacity: 0.35 }} onClick={() => emit(Events.LAYER_ADD)}>
            <div className="layer-row-main"><button className="layer-name" type="button">KC-{n}</button></div>
          </div>
        ))}
        {[...layers].reverse().map((layer, ri) => {
          const i = layers.length - 1 - ri;
          const fx = isFxLayer(layer);
          const isActive = layer.id === activeLayerId;
          const isFxSelected = layer.id === selectedFxLayerId;
          const soloed = layer.visible && layers.every((l) => l.id === layer.id || !l.visible);
          const label = displayLayerName(layer, ordinals.get(layer.id) || 1);
          const patch = layer.patch || { mode: 'off', to: null, strength: 0.16 };
          const to = (!patch.to || patch.to === layer.id) ? otherTarget(layer) : patch.to;
          return (
            <div key={layer.id} className={`layer-row ${isActive ? 'layer-row-active' : ''} ${fx ? 'layer-row-fx' : ''} ${isFxSelected ? 'layer-row-fx-selected' : ''}`}>
              <div className="layer-row-main">
                <div className="layer-reorder">
                  <button className="micro-btn" disabled={i === layers.length - 1} onClick={() => emit(Events.LAYER_REORDER, { id: layer.id, delta: 1 })}>▲</button>
                  <button className="micro-btn" disabled={i === 0} onClick={() => emit(Events.LAYER_REORDER, { id: layer.id, delta: -1 })}>▼</button>
                </div>
                <button className="micro-btn" onClick={() => emit(Events.LAYER_TOGGLE_VISIBLE, { id: layer.id })}>{layer.visible ? '●' : '○'}</button>
                <button className="micro-btn" onClick={() => emit(Events.LAYER_SOLO, { id: layer.id })}>{soloed ? 'S·' : 'S'}</button>
                {fx && <span className="fx-badge">FX</span>}
                <button className="layer-name" onClick={() => emit(fx ? Events.FX_SELECT : Events.LAYER_SET_ACTIVE, { id: layer.id })}>
                  {label}{isActive && !fx ? ' · editing' : ''}{isFxSelected && fx ? ' · editing fx' : ''}
                </button>
                <button className="micro-btn" onClick={() => emit(Events.LAYER_DUPLICATE, { id: layer.id })}>DUP</button>
                <button className="micro-btn" disabled={!isFxLayer(layer) && contentCount <= 1} onClick={() => emit(Events.LAYER_REMOVE, { id: layer.id })}>×</button>
              </div>
              <div className="layer-row-composite">
                {fx ? (
                  <span className="fx-param" style={{ flex: 1 }}><label>Blend</label><span className="fx-param-readout" style={{ width: 'auto' }}>—</span></span>
                ) : (
                  <select className="tg blend-mode-select" value={layer.layerBlendMode} title={helpText('layers-blend')}
                    onChange={(e) => emit(Events.LAYER_SET_BLEND_MODE, { id: layer.id, mode: e.target.value })}>
                    {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}
                  </select>
                )}
                <input type="range" min={0} max={1} step={0.01} value={layer.layerOpacity}
                  onChange={(e) => emit(Events.LAYER_SET_OPACITY, { id: layer.id, opacity: Number(e.target.value) })} />
                <span className="layer-opacity-readout">{Math.round(layer.layerOpacity * 100)}%</span>
              </div>
              {!fx && (
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
              {fx && isFxSelected && <FxEffectEditor layer={layer} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
