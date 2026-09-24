// TallyLight — hardware-style curation confidence indicator (#tally).
// Teenage Engineering-inspired: monospaced segmented bar, hard cut transitions
// (no easing). Renders null when the curator model is inactive.
//
// Store fields (curatorConfidence, curatorActive) are wired when the
// ANE/CoreML pipeline lands (KC1_ARCHITECTURE_ROADMAP Phase 3).

export function TallyLight({ confidence = 0, active = false }) {
  if (!active) return null;

  // Hard cut thresholds — no interpolation, no gradients.
  const color = confidence >= 0.85 ? '#00ff88'          // neon green — high confidence hit
              : confidence >= 0.5  ? '#ffaa00'          // orange — interesting
              : 'rgba(255, 255, 255, 0.15)';            // dim — nothing notable

  // Segmented block: [ ████░░░░░░ ] 42%
  const filled = Math.round(confidence * 8);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(8 - filled);
  const pct = `${(confidence * 100).toFixed(0)}%`;

  return (
    <div className="tally-light" title={`Curation confidence: ${pct}`}>
      <span className="tally-block" style={{ color }}>
        {'[ '}{bar}{' ]'}
      </span>
    </div>
  );
}
