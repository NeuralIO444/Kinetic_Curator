import { emit, Events } from '../../composition/eventBus.js';
import { ModSlider } from './ModSlider.jsx';

export function ReactivityControls({ depth, scaleMod, alphaMod, life }) {
  return (
    <div style={{ padding: '6px', border: '1px solid var(--line-2)', marginBottom: '6px', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ fontSize: '9px', color: 'var(--dim)', letterSpacing: '0.1em', marginBottom: '6px' }}>REACTIVITY / LIFE</div>

      <ModSlider label="DEPTH" value={depth} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioModDepth', value: v })} hint="Global audio → visual amount" />
      <ModSlider label="SCALE" value={scaleMod} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioScaleMod', value: v })} hint="Beat/bands → scale pulse" />
      <ModSlider label="ALPHA" value={alphaMod} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioAlphaMod', value: v })} hint="Beat → opacity pulse" />
      <ModSlider label="LIFE" value={life} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'lifeDrift', value: v })} hint="Continuous LFO drift while running" />
    </div>
  );
}
