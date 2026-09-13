export function ModSlider({ label, value, min, max, step, onChange, hint }) {
  return (
    <div style={{ marginBottom: 6 }} title={hint}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--dim)', letterSpacing: '0.08em', marginBottom: 2 }}>
        <span>{label}</span>
        <span>{Number(value).toFixed(2)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}
