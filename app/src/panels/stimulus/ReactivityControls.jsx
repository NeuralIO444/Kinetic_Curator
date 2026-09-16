import { emit, Events } from '../../composition/eventBus.js';
import { ModSlider } from './ModSlider.jsx';

export function ReactivityControls({ depth, scaleMod, alphaMod, life }) {
  return (
    <div style={{ padding: '6px', border: '1px solid var(--line-2)', marginBottom: '6px', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ fontSize: '9px', color: 'var(--dim)', letterSpacing: '0.1em', marginBottom: '6px' }} title="Live node multiply from the mic. Does not tick the Davis phrase clock.">REACTIVITY / LIFE</div>

      <ModSlider label="DEPTH" value={depth} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioModDepth', value: v })} hint="How hard the mic pushes scale/alpha. Not the Davis bar." />
      <ModSlider label="SCALE" value={scaleMod} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioScaleMod', value: v })} hint="Bands → node size. Phrase CLOCK is a separate counter." />
      <ModSlider label="ALPHA" value={alphaMod} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioAlphaMod', value: v })} hint="Bands → opacity pulse." />
      <ModSlider label="LIFE" value={life} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'lifeDrift', value: v })} hint="Slow LFO while RUN is on. Independent of phrase and evolve." />
    </div>
  );
}
