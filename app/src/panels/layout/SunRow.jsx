// SUN as TE matrix + amber value buttons (#1202).
// #594 — the ONE scene sun (CHIAROSCURO). Scene-level, not per layer: it
// lights every layer's marks. Colour is a palette slot, never a free hex.
import { useStore } from '../../state/store.js';
import { LIGHT_SLOTS } from '../../data/light.js';
import { helpText } from '../../data/helpCopy.js';
import { TeaMatrix } from '../build/te/TeaMatrix.jsx';
import { ValueButton } from '../build/te/ValueButton.jsx';
import { SliderEditor } from '../build/te/editors.jsx';

// #594 — the ONE scene sun (CHIAROSCURO). Scene-level, not per layer: it lights
// every layer's marks. Colour is a palette slot, never a free hex.
const SLOT_LABEL = (s) => (s === 'white' ? 'WHITE' : s === 'ink' ? 'INK' : `S${Number(s.slice(6)) + 1}`);

export function SunRow() {
  const light = useStore((s) => s.light);
  const setLight = useStore((s) => s.setLight);
  const on = !!light;

  const btn = (label, display, key, min, max, step, hint, format) => (
    <ValueButton
      label={label}
      display={display}
      title={hint}
      onOpen={() => (
        <SliderEditor
          ariaLabel={label}
          value={light[key]}
          min={min} max={max} step={step}
          format={format}
          onChange={(v) => setLight({ [key]: v })}
        />
      )}
    />
  );

  return (
    <div className="sun-row">
      <div className="davis-label lbl" style={{ marginBottom: 2 }} title={helpText('layout-sun')}>sun</div>
      <TeaMatrix
        ariaLabel="Sun"
        columns={2}
        tone="red"
        value={on ? 'on' : 'off'}
        onChange={(id) => setLight(id === 'on')}
        options={[
          { id: 'on', label: 'ON', title: helpText('layout-sun') },
          { id: 'off', label: 'OFF', title: helpText('layout-sun') },
        ]}
      />
      {on && (
        <div className="slider-stack" style={{ marginTop: 6 }}>
          {btn('SUN X', `${Math.round(light.x)}`, 'x', -500, 1500, 1,
            'Where the sun sits across the canvas (off-canvas = a low sun from outside the frame)',
            (v) => `${Math.round(v)}`)}
          {btn('SUN Y', `${Math.round(light.y)}`, 'y', -500, 1200, 1,
            'Where the sun sits down the canvas',
            (v) => `${Math.round(v)}`)}
          {btn('HEIGHT', `${Math.round(light.height)}`, 'height', 20, 1000, 1,
            'Low = raking dawn/dusk light with a long falloff; high = flat noon',
            (v) => `${Math.round(v)}`)}
          {btn('INTENSITY', `${Math.round(light.intensity * 100)}%`, 'intensity', 0, 1, 0.01,
            'How strongly the sun lights the marks facing it',
            (v) => `${Math.round(v * 100)}%`)}
          {btn('AMBIENT', `${Math.round(light.ambient * 100)}%`, 'ambient', 0, 1, 0.01,
            'Light that reaches marks facing away — 0 is black shadow sides',
            (v) => `${Math.round(v * 100)}%`)}
          {btn('BEVEL', `${Math.round(light.bevel * 100)}%`, 'bevel', 0, 1, 0.01,
            'Edges slope from each mark\'s own shape and catch the light — 0 is flat',
            (v) => `${Math.round(v * 100)}%`)}
          {btn('SPEC', `${Math.round(light.spec * 100)}%`, 'spec', 0, 1, 0.01,
            'A tight enamel highlight where an edge faces the sun',
            (v) => `${Math.round(v * 100)}%`)}
          {btn('POOL', `${Math.round((light.pool ?? 0) * 100)}%`, 'pool', 0, 1, 0.01,
            'Zero is today\'s sun. Higher pools ink in the shadow and paper on the highlight.',
            (v) => `${Math.round(v * 100)}%`)}
          <div>
            <div className="davis-label lbl" style={{ marginBottom: 2 }}>sun colour</div>
            <TeaMatrix
              ariaLabel="Sun colour"
              value={light.slot}
              onChange={(id) => setLight({ slot: id })}
              options={LIGHT_SLOTS.map((s) => ({ id: s, label: SLOT_LABEL(s) }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
