// #716 Part 2 — live-glyph motion tiles. Pose is a pure function of the
// same value the slider writes. No clock, no second source of truth.

export function motionUnit(value, min, max) {
  const lo = Number(min);
  const hi = Number(max);
  const v = Number(value);
  if (!Number.isFinite(v) || !Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) return 0;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

export function motionReadout(value, step = 0.1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const s = Number(step);
  const decimals = s < 0.1 ? 2 : s < 1 ? 1 : 0;
  return n.toFixed(decimals);
}

// wind leans, breath swells, life wanders, flap opens. Degrees / unitless.
export function motionPose(kind, value, min, max) {
  const t = motionUnit(value, min, max);
  if (kind === 'wind') return { lean: -32 + t * 64 };
  if (kind === 'breath') return { scale: 0.45 + t * 0.7 };
  if (kind === 'life') return { drift: t };
  if (kind === 'flap') return { flap: -22 + t * 44 };
  return {};
}
