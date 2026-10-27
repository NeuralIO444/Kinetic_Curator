// MAP row — field→channel mapping (#1199), home per #1204: an
// Appearance-family scene control, NOT a MATH op. It sat in the §④
// Appearance row until 2026-10-16; it now renders inside the
// CHIAROSCURO floating editor (§④'s own editor), below the sun + hue
// — the same control, same state, same events, same stored keys.
// Field tile → channel tile → amount.
// A MATH-stratum modulation: data (noise/density) drives visual channels
// (stroke weight, saturation, scale). It remaps marks; it emits none.
// All-off is the no-op — the render is untouched until the map is set.
import { emit, Events } from '../../composition/eventBus.js';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';
import { ValueButton } from '../build/te/ValueButton.jsx';
import { SliderEditor } from '../build/te/editors.jsx';
import { helpText } from '../../data/helpCopy.js';

// Tile vocab mirrors FIELDMAP_FIELDS / FIELDMAP_CHANNELS in
// engine/fieldMap.mjs (written literally: #1029 keeps casing in CSS,
// so no .toUpperCase() in JSX).

const FIELD_TILES = [
  { id: 'off', label: 'OFF', title: 'No field — the map is off' },
  { id: 'noise', label: 'NOISE', title: 'Perlin noise field, seeded — strokes thicken along the noise' },
  { id: 'density', label: 'DENSITY', title: 'Local mark density — channels follow crowded and sparse regions' },
];

const CHANNEL_TILES = [
  { id: 'off', label: 'OFF', title: 'No channel — the map is off' },
  { id: 'weight', label: 'WEIGHT', title: 'Stroke weight: thin→thick along the field' },
  { id: 'saturation', label: 'SAT', title: 'Muted→saturated along the field (composes with the palette)' },
  { id: 'scale', label: 'SCALE', title: 'Scale: small→large along the field' },
];

export function MapRow({ layoutParams, lockedParams }) {
  const set = (key, value) => emit(Events.LAYOUT_PARAM, { key, value });
  const lock = (key) => emit(Events.LAYOUT_LOCK, { key });
  const amount = layoutParams.fieldMapAmount ?? 0;

  return (
    <div className="map-row">
      <div className="davis-label lbl" style={{ marginBottom: 2 }} title={helpText('layout-map')}>
        map
      </div>
      <div className="map-tiles">
        <TeaMatrix
          ariaLabel="Field"
          options={FIELD_TILES}
          value={layoutParams.fieldMapField ?? 'off'}
          onChange={(id) => set('fieldMapField', id)}
        />
        <span className="map-arrow" aria-hidden="true">
          →
        </span>
        <TeaMatrix
          ariaLabel="Channel"
          options={CHANNEL_TILES}
          value={layoutParams.fieldMapChannel ?? 'off'}
          onChange={(id) => set('fieldMapChannel', id)}
        />
        <ValueButton
          label="AMOUNT"
          display={`${Math.round(amount * 100)}%`}
          title="How hard the field drives the channel — 0 is the map off"
          locked={lockedParams.fieldMapAmount}
          onToggleLock={() => lock('fieldMapAmount')}
          onOpen={() => (
            <SliderEditor
              ariaLabel="Map amount"
              value={amount}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => set('fieldMapAmount', v)}
            />
          )}
        />
      </div>
    </div>
  );
}
