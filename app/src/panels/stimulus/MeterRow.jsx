export function MeterRow({ label, value, color }) {
  const pct = Math.min(100, Math.max(0, (value || 0) * 100));
  return (
    <div className="stim-meter-row">
      <span className="stim-meter-label">{label}</span>
      <div className="stim-meter-track">
        <div className="stim-meter-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontSize: '10px', color: 'var(--ink)', textAlign: 'right' }}>{pct.toFixed(0)}%</span>
    </div>
  );
}
