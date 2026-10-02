import { useStore } from '../../state/store.js';
import { RangeRow } from '../../components/RangeRow.jsx';
import { LIGHT_DEFAULT, LIGHT_SLOTS } from '../../data/light.js';
import { helpText } from '../../data/helpCopy.js';

// #594 — the ONE scene sun (CHIAROSCURO). Scene-level, not per layer: it lights
// every layer's marks. Colour is a palette slot, never a free hex.
const SLOT_LABEL = (s) => (s === 'white' ? 'WHITE' : s === 'ink' ? 'INK' : `S${Number(s.slice(6)) + 1}`);

export function SunRow() {
  const light = useStore((s) => s.light);
  const setLight = useStore((s) => s.setLight);
  const on = !!light;
  return (
    <div className="sun-row">
      <div className="toggle-row">
        <button type="button" className={`tg ${on ? 'tg-on' : ''}`} title={helpText('layout-sun')}
          aria-pressed={on} onClick={() => setLight(!on)}>
          <span className="tg-box">{on ? '◉' : '○'}</span>SUN
        </button>
      </div>
      {on && (
        <>
          <RangeRow label="SUN X" value={Math.round(light.x)} min={-500} max={1500}
            hint="Where the sun sits across the canvas (off-canvas = a low sun from outside the frame)"
            onChange={(v) => setLight({ x: v })} defaultValue={LIGHT_DEFAULT.x} />
          <RangeRow label="SUN Y" value={Math.round(light.y)} min={-500} max={1200}
            hint="Where the sun sits down the canvas"
            onChange={(v) => setLight({ y: v })} defaultValue={LIGHT_DEFAULT.y} />
          <RangeRow label="HEIGHT" value={Math.round(light.height)} min={20} max={1000}
            hint="Low = raking dawn/dusk light with a long falloff; high = flat noon"
            onChange={(v) => setLight({ height: v })} defaultValue={LIGHT_DEFAULT.height} />
          <RangeRow label="INTENSITY" value={light.intensity} min={0} max={1} step={0.01}
            hint="How strongly the sun lights the marks facing it"
            onChange={(v) => setLight({ intensity: v })} defaultValue={LIGHT_DEFAULT.intensity} />
          <RangeRow label="AMBIENT" value={light.ambient} min={0} max={1} step={0.01}
            hint="Light that reaches marks facing away — 0 is black shadow sides"
            onChange={(v) => setLight({ ambient: v })} defaultValue={LIGHT_DEFAULT.ambient} />
          <RangeRow label="BEVEL" value={light.bevel} min={0} max={1} step={0.01}
            hint="Edges slope from each mark's own shape and catch the light — 0 is flat"
            onChange={(v) => setLight({ bevel: v })} defaultValue={LIGHT_DEFAULT.bevel} />
          <RangeRow label="SPEC" value={light.spec} min={0} max={1} step={0.01}
            hint="A tight enamel highlight where an edge faces the sun"
            onChange={(v) => setLight({ spec: v })} defaultValue={LIGHT_DEFAULT.spec} />
          <RangeRow label="POOL" value={light.pool ?? 0} min={0} max={1} step={0.01}
            hint="Zero is today's sun. Higher pools ink in the shadow and paper on the highlight."
            onChange={(v) => setLight({ pool: v })} defaultValue={0} />
          <div className="chip-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
            <span style={{ fontSize: 10, marginRight: 4 }}>sun colour</span>
            {LIGHT_SLOTS.map((s) => (
              <button key={s} type="button" className={`chip-btn ${light.slot === s ? 'active' : ''}`}
                aria-pressed={light.slot === s} onClick={() => setLight({ slot: s })}>{SLOT_LABEL(s)}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
