// TE button matrix — the ONE discrete-choice component (#1202).
//
// Everything discrete renders ink/red (KC-1 DS #1121 r5): quiet ink outline
// at rest, hard inverted (ink fill) when selected, or the one red when
// tone="red". Amber never marks a discrete state (r6).
export function TeaMatrix({ options, value, onChange, tone = 'ink', ariaLabel, columns }) {
  return (
    <div
      className="te-matrix"
      role="group"
      aria-label={ariaLabel}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((opt) => {
        const id = typeof opt === 'string' ? opt : opt.id;
        const label = typeof opt === 'string' ? opt : (opt.label ?? opt.id);
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            className={`te-cell${selected ? ' sel' : ''}${tone === 'red' && selected ? ' sel-red' : ''}`}
            aria-pressed={selected}
            title={typeof opt === 'string' ? undefined : opt.title}
            onClick={() => onChange(id)}
          >
            {typeof opt !== 'string' && opt.glyph && (
              <span className="te-glyph" aria-hidden="true">{opt.glyph}</span>
            )}
            <span className="te-cell-label">{label}</span>
            {typeof opt !== 'string' && opt.pips !== undefined && (
              <span className="te-pips" aria-hidden="true">
                {[1, 2, 3].map((n) => <i key={n} className={opt.pips >= n ? 'lit' : ''} />)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
