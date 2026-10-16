// The ONE scene sun's controls (#594, CHIAROSCURO) — the anchor tenant of
// the CHIAROSCURO section (#1587). Scene-level, not per layer: it lights
// every layer's marks. Colour is a palette slot, never a free hex.
//
// #1587 relocated these controls from the Appearance shelf's sun row into
// the CHIAROSCURO floating editor. Pure relocation: same store field
// (state.light), same events (LIGHT_SET), same ranges/steps/defaults —
// only the rendering changed. The editors are the house RangeRow in its
// row form, inline at editor scale (the strata-block editor pattern),
// instead of value buttons popping the panel dock: the editor floats over
// the canvas, so its controls live inside it.
import { useStore } from '../../state/store.js';
import { LIGHT_SLOTS, LIGHT_DEFAULT } from '../../data/light.js';
import { helpText } from '../../data/helpCopy.js';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';
import { RangeRow } from '../../components/RangeRow.jsx';
import { emit, Events } from '../../composition/eventBus.js';

const SLOT_LABEL = (s) => (s === 'white' ? 'WHITE' : s === 'ink' ? 'INK' : `S${Number(s.slice(6)) + 1}`);

export function SunControls() {
  const light = useStore((s) => s.light);
  const on = !!light;

  const row = (label, key, min, max, step, hint, format) => (
    <RangeRow
      label={label}
      ariaLabel={label}
      value={light[key]}
      min={min} max={max} step={step}
      readout={format(light[key])}
      defaultValue={LIGHT_DEFAULT[key]}
      hint={hint}
      onChange={(v) => emit(Events.LIGHT_SET, { [key]: v })}
    />
  );

  return (
    <div className="sun-controls">
      <TeaMatrix
        ariaLabel="Sun"
        columns={2}
        tone="red"
        value={on ? 'on' : 'off'}
        onChange={(id) => emit(Events.LIGHT_SET, id === 'on')}
        options={[
          { id: 'on', label: 'ON', title: helpText('layout-sun') },
          { id: 'off', label: 'OFF', title: helpText('layout-sun') },
        ]}
      />
      {on && (
        <div className="slider-stack" style={{ marginTop: 6 }}>
          {row('SUN X', 'x', -500, 1500, 1,
            'Where the sun sits across the canvas (off-canvas = a low sun from outside the frame)',
            (v) => `${Math.round(v)}`)}
          {row('SUN Y', 'y', -500, 1200, 1,
            'Where the sun sits down the canvas',
            (v) => `${Math.round(v)}`)}
          {row('HEIGHT', 'height', 20, 1000, 1,
            'Low = raking dawn/dusk light with a long falloff; high = flat noon',
            (v) => `${Math.round(v)}`)}
          {row('INTENSITY', 'intensity', 0, 1, 0.01,
            'How strongly the sun lights the marks facing it',
            (v) => `${Math.round(v * 100)}%`)}
          {row('AMBIENT', 'ambient', 0, 1, 0.01,
            'Light that reaches marks facing away — 0 is black shadow sides',
            (v) => `${Math.round(v * 100)}%`)}
          {row('BEVEL', 'bevel', 0, 1, 0.01,
            'Edges slope from each mark\'s own shape and catch the light — 0 is flat',
            (v) => `${Math.round(v * 100)}%`)}
          {row('SPEC', 'spec', 0, 1, 0.01,
            'A tight enamel highlight where an edge faces the sun',
            (v) => `${Math.round(v * 100)}%`)}
          {row('POOL', 'pool', 0, 1, 0.01,
            'Zero is today\'s sun. Higher pools ink in the shadow and paper on the highlight.',
            (v) => `${Math.round(v * 100)}%`)}
          <div>
            <div className="davis-label lbl" style={{ marginBottom: 2 }}>sun colour</div>
            <TeaMatrix
              ariaLabel="Sun colour"
              value={light.slot}
              onChange={(id) => emit(Events.LIGHT_SET, { slot: id })}
              options={LIGHT_SLOTS.map((s) => ({ id: s, label: SLOT_LABEL(s) }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
