import { emit, Events } from '../../composition/eventBus.js';
import { ModSlider } from './ModSlider.jsx';
import { BALLISTICS_CURVES } from '../../gl/audioBallistics.mjs';

// #306: envelope ballistics deepen the existing REACTIVITY controls —
// attack/decay time constants, a response-curve selector, and the SWELL
// fader (how hard the music moves GLOW). All mic-driven, so all disabled
// with the mic off, same as DEPTH/SCALE/ALPHA (#272).

const RESPONSE_LABELS = {
  'linear': 'LIN',
  'exponential': 'EXP',
  'logarithmic': 'LOG',
  'peak-hold': 'PEAK',
};

const RESPONSE_HINTS = {
  'linear': 'Unchanged envelope.',
  'exponential': 'Heavy — suppresses jitter, loud hits land with weight.',
  'logarithmic': 'Lifts quiet swells so subtle music stays visible.',
  'peak-hold': 'Punchy attacks, smooth linear falloff.',
};

function MsSlider({ label, value, min, max, step, onChange, hint, disabled, disabledReason }) {
  const title = [hint, disabled && disabledReason ? `Disabled — ${disabledReason}` : null]
    .filter(Boolean).join(' · ') || undefined;
  return (
    <div style={{ marginBottom: 6, opacity: disabled ? 0.38 : 1 }} title={title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--dim)', letterSpacing: '0.08em', marginBottom: 2 }}>
        <span style={disabled ? { textDecoration: 'line-through' } : undefined}>{label}</span>
        <span>{Math.round(value)} ms</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        style={{ width: '100%' }}
      />
    </div>
  );
}

function ResponsePicker({ value, onChange, disabled, disabledReason }) {
  const hint = `Envelope shape — ${RESPONSE_HINTS[value] ?? ''}`;
  const title = [hint, disabled && disabledReason ? `Disabled — ${disabledReason}` : null]
    .filter(Boolean).join(' · ') || undefined;
  return (
    <div style={{ marginBottom: 6, opacity: disabled ? 0.38 : 1 }} title={title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--dim)', letterSpacing: '0.08em', marginBottom: 2 }}>
        <span style={disabled ? { textDecoration: 'line-through' } : undefined}>RESPONSE</span>
        <span>{RESPONSE_LABELS[value] ?? value}</span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {BALLISTICS_CURVES.map(c => (
          <button
            key={c}
            className={`micro-btn ${value === c ? 'active' : ''}`}
            onClick={() => onChange(c)}
            disabled={disabled}
            title={RESPONSE_HINTS[c]}
            style={value === c ? { background: '#00d9ff', color: '#000', borderColor: '#00d9ff' } : {}}
          >
            {RESPONSE_LABELS[c]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReactivityControls({ depth, scaleMod, alphaMod, life, attackMs, decayMs, response, swell, audioEnabled }) {
  // #272: DEPTH/SCALE/ALPHA are mic-driven — with the mic off they do nothing,
  // so they say so. LIFE is a slow LFO independent of audio; it stays live.
  const disabledReason = 'Audio is off — enable the mic';
  return (
    <div style={{ padding: '6px', border: '1px solid var(--line-2)', marginBottom: '6px', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ fontSize: '9px', color: 'var(--dim)', letterSpacing: '0.1em', marginBottom: '6px' }} title="Live node multiply from the mic. Does not tick the Ghost Station phrase clock.">REACTIVITY / LIFE</div>

      <ModSlider label="DEPTH" value={depth} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioModDepth', value: v })} hint="How hard the mic pushes scale/alpha. Not the Ghost bar."
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <ModSlider label="SCALE" value={scaleMod} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioScaleMod', value: v })} hint="Bands → node size. Phrase CLOCK is a separate counter."
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <ModSlider label="ALPHA" value={alphaMod} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioAlphaMod', value: v })} hint="Bands → opacity pulse."
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <ModSlider label="LIFE" value={life} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'lifeDrift', value: v })} hint="Slow LFO while RUN is on. Independent of phrase and evolve." />

      <div style={{ fontSize: '9px', color: 'var(--dim)', letterSpacing: '0.1em', margin: '8px 0 6px' }} title="Attack/decay ballistics shape the mic envelope before it drives anything — smoothing jittery transient-snapping into a heavy, fluid weight.">ENVELOPE</div>

      <MsSlider label="ATTACK" value={attackMs} min={0} max={500} step={5}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioAttackMs', value: v })}
        hint="How fast the envelope opens on a transient. Low = snappy, high = heavy."
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <MsSlider label="DECAY" value={decayMs} min={0} max={2000} step={10}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioDecayMs', value: v })}
        hint="How fast the envelope falls after the hit. Long = fluid, lingering gestures."
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <ResponsePicker value={response}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioResponse', value: v })}
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <ModSlider label="SWELL" value={swell} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioSwell', value: v })}
        hint="How hard the music swells GLOW. 0 = the music never moves the glow — the washout control for loud passages at high glow."
        disabled={!audioEnabled} disabledReason={disabledReason} />
    </div>
  );
}
