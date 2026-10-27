// node src/curator/ra4.selfcheck.mjs
//
// Look Explorer E3 (#1507) — RA4: the MANUAL reachability census.
// Spec §12 RA4: every real document value must be reachable from the
// manual surface — every asset selectable, every palette applicable,
// every layout loadable, every stratum type addable, every FX module
// enable-able — driven through the SAME actions the UI dispatches
// (the bus events the panels emit, the applyAction cases their buttons
// call), at store level: the deepest level that runs headlessly
// (E1a/E1b's pattern). The per-pack/per-mode e2e sample belongs to
// the localhost review lane; it is not faked here.
//
// Findings are pinned as data: the unreachable lists must be EMPTY.
// If a value goes unreachable, this suite fails loudly and the gap is
// reported — the assertion is never weakened to match a regression.
import assert from 'node:assert';

// localStorage shim BEFORE any store import (E1a's pattern).
const lsData = new Map();
globalThis.localStorage = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
};
globalThis.requestAnimationFrame = (fn) => {
  queueMicrotask(() => fn(performance.now()));
  return 1;
};

const { ASSETS } = await import('../data/assets/index.js');
const { PALETTES } = await import('../data/palettes.js');
const { STUB_VOICES } = await import('../data/voices.js');
const { FX_MENU_KINDS, availableFxKinds } = await import('../fx/fxFilters.js');
const { useStore } = await import('../state/store.js');
const { wireEventBus } = await import('../composition/wireEventBus.js');
const { applyAction } = await import('../state/applyAction.js');
const { emit, Events } = await import('../composition/eventBus.js');
const A = await import('../state/actions.js');

const lines = [];
const S = () => useStore.getState();
wireEventBus(applyAction);

// ── assets: every one selectable through the tile-click event ──────
{
  emit(Events.ASSETS_TOGGLE_ALL, false);
  const unreachable = [];
  for (const a of ASSETS) {
    emit(Events.ASSETS_TOGGLE, { id: a.id }); // AssetPoolPanel tile click
    if (!S().enabledAssets[a.id]) unreachable.push(a.id);
    emit(Events.ASSETS_TOGGLE, { id: a.id });
    if (S().enabledAssets[a.id]) unreachable.push(`${a.id} (won't deselect)`);
  }
  assert.deepStrictEqual(unreachable, [], `assets unreachable by hand: ${unreachable.join(', ')}`);
  lines.push(
    `assets: ${ASSETS.length}/${ASSETS.length} selectable + deselectable via ASSETS_TOGGLE (the pool tile's event)`,
  );
}

// ── palettes: every one applicable through the palette event ───────
{
  const unreachable = [];
  for (const p of PALETTES) {
    emit(Events.PALETTE_SET_ID, { id: p.id }); // PalettePanel swatch click
    if (S().paletteId !== p.id) unreachable.push(p.id);
  }
  assert.deepStrictEqual(unreachable, [], `palettes unreachable by hand: ${unreachable.join(', ')}`);
  lines.push(`palettes: ${PALETTES.length}/${PALETTES.length} applicable via PALETTE_SET_ID`);
}

// ── layouts: every stub voice loadable through the mode event ──────
{
  const unreachable = [];
  for (const v of STUB_VOICES) {
    emit(Events.MODE_LOAD, { id: v.id }); // mode menu pick
    S().advanceVoiceMix(1);
    S().commitVoiceMix();
    if (S().layoutParams.mode !== v.id) unreachable.push(v.id);
  }
  assert.deepStrictEqual(unreachable, [], `layouts unreachable by hand: ${unreachable.join(', ')}`);
  lines.push(`layouts: ${STUB_VOICES.length}/${STUB_VOICES.length} loadable via MODE_LOAD + the voice-mix commit`);
}

// ── strata: every layer type addable through its panel action ──────
{
  const before = S().layers.length;
  applyAction({ type: A.ADD_LAYER }); // BUILD + (content)
  applyAction({ type: A.ADD_PATTERN_LAYER, mode: 'QUILT' }); // pattern add
  applyAction({ type: A.ADD_MATH_LAYER }); // math add
  applyAction({ type: A.ADD_FX_LAYER }); // FX add (one-tap)
  const types = new Set(S().layers.map((l) => l.type));
  for (const t of ['content', 'pattern', 'math', 'fx']) {
    assert.ok(types.has(t), `stratum type ${t} is addable by hand`);
  }
  assert.ok(S().layers.length > before, 'the adds landed');
  lines.push('strata: content / pattern / math / fx all addable via their panel actions');
}

// ── FX modules: every menu kind enable-able ──────────────────────────
// The UI's two doors: the rack picker (FX_EFFECT_ADD, bounded by the
// one-kind-per-slot rack) — walk one FX layer, freeing a filled slot
// with FX_EFFECT_REMOVE (the editor's remove) when the rack requires it.
{
  const fxLayer = () => S().layers.find((l) => l.type === 'fx');
  assert.ok(fxLayer(), 'an FX layer stands from the strata walk');
  const unreachable = [];
  for (const kind of FX_MENU_KINDS) {
    let layer = fxLayer();
    let guard = (layer.effects || []).length + 1;
    while (!availableFxKinds(layer.effects).includes(kind) && guard-- > 0) {
      applyAction({ type: A.FX_EFFECT_REMOVE, layerId: layer.id, index: 0 });
      layer = fxLayer();
    }
    emit(Events.FX_EFFECT_ADD, { layerId: layer.id, kind }); // FxEffectEditor add pick
    layer = fxLayer();
    if (!(layer.effects || []).some((e) => e.kind === kind)) unreachable.push(kind);
  }
  assert.deepStrictEqual(unreachable, [], `FX kinds unreachable by hand: ${unreachable.join(', ')}`);
  lines.push(
    `FX modules: ${FX_MENU_KINDS.length}/${FX_MENU_KINDS.length} menu kinds enable-able via FX_EFFECT_ADD (${FX_MENU_KINDS.join(', ')})`,
  );
}

console.log('ra4.selfcheck (RA4 manual reachability census):');
for (const l of lines) console.log(`  ✓ ${l}`);
console.log('ra4.selfcheck: PASS — unreachable by hand: none');
