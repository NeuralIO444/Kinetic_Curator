import { emit, Events } from '../../composition/eventBus.js';
import { RangeRow } from '../../components/RangeRow.jsx';
import { MotionTile } from '../../components/MotionTile.jsx';
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

// STIMULI's one slider (#1027): the stack layout in the STIMULI tone. A control waiting on
// the mic is dim, never struck through (UX-7), and says what it is waiting for.
function AudioSlider({ unit, value, ...rest }) {
  const readout = unit === 'ms' ? `${Math.round(value)} ms` : Number(value).toFixed(2);
  return <RangeRow layout="stack" tone="stim" value={value} readout={readout} disabledLabel="Waiting for audio" {...rest} />;
}

function ResponsePicker({ value, onChange, disabled, disabledReason }) {
  const hint = `Envelope shape — ${RESPONSE_HINTS[value] ?? ''}`;
  // UX-7: "waiting for audio," not "broken" — dim, never struck through.
  const title = [hint, disabled && disabledReason ? `Waiting for audio — ${disabledReason}` : null]
    .filter(Boolean).join(' · ') || undefined;
  return (
    <div style={{ marginBottom: 6, opacity: disabled ? 0.55 : 1 }} title={title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--dim)', letterSpacing: '0.08em', marginBottom: 2 }}>
        <span>RESPONSE</span>
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
  // so they say so. UX-7: "waiting for audio," not "broken." LIFE is a slow
  // LFO independent of audio; it stays live.
  const disabledReason = 'enable the mic to drive this';
  return (
    <div style={{ padding: '6px', border: '1px solid var(--line-2)', marginBottom: '6px', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ fontSize: '9px', color: 'var(--dim)', letterSpacing: '0.1em', marginBottom: '6px' }} title="Live node multiply from the mic. Does not tick the Ghost Station phrase clock.">REACTIVITY / LIFE</div>

      <AudioSlider label="DEPTH" value={depth} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioModDepth', value: v })} hint="How hard the mic pushes scale/alpha. Not the Ghost bar."
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <AudioSlider label="SCALE" value={scaleMod} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioScaleMod', value: v })} hint="Bands → node size. Phrase CLOCK is a separate counter."
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <AudioSlider label="ALPHA" value={alphaMod} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioAlphaMod', value: v })} hint="Bands → opacity pulse."
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <MotionTile kind="life" label="life" value={life} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'lifeDrift', value: v })}
        hint="Slow LFO while RUN is on. Independent of phrase and evolve." />

      <div style={{ fontSize: '9px', color: 'var(--dim)', letterSpacing: '0.1em', margin: '8px 0 6px' }} title="Attack/decay ballistics shape the mic envelope before it drives anything — smoothing jittery transient-snapping into a heavy, fluid weight.">ENVELOPE</div>

      <AudioSlider unit="ms" label="ATTACK" value={attackMs} min={0} max={500} step={5}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioAttackMs', value: v })}
        hint="How fast the envelope opens on a transient. Low = snappy, high = heavy."
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <AudioSlider unit="ms" label="DECAY" value={decayMs} min={0} max={2000} step={10}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioDecayMs', value: v })}
        hint="How fast the envelope falls after the hit. Long = fluid, lingering gestures."
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <ResponsePicker value={response}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioResponse', value: v })}
        disabled={!audioEnabled} disabledReason={disabledReason} />
      <AudioSlider label="SWELL" value={swell} min={0} max={1} step={0.05}
        onChange={v => emit(Events.LAYOUT_PARAM, { key: 'audioSwell', value: v })}
        hint="How hard the music swells GLOW. 0 = the music never moves the glow — the washout control for loud passages at high glow."
        disabled={!audioEnabled} disabledReason={disabledReason} />
    </div>
  );
}
