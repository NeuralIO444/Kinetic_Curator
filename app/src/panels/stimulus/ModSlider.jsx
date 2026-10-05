export function ModSlider({ label, value, min, max, step, onChange, hint, disabled, disabledReason }) {
  // #272: audio-reactive sliders disclose when the mic is off instead of
  // silently doing nothing. UX-7: "waiting for audio," not "broken" — dim,
  // never struck through.
  const title = [hint, disabled && disabledReason ? `Waiting for audio — ${disabledReason}` : null]
    .filter(Boolean).join(' · ') || undefined;
  return (
    <div style={{ marginBottom: 6, opacity: disabled ? 0.55 : 1 }} title={title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--dim)', letterSpacing: '0.08em', marginBottom: 2 }}>
        <span>{label}</span>
        <span>{Number(value).toFixed(2)}</span>
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
