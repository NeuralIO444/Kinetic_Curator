// latestCapture.mjs — pure helpers for the LATEST readout under ESSENTIALS.
// Kept out of the .jsx so the selfcheck can run under plain node.

/** Newest snapshot (the slice appends, so it's the last one) as display fields, or null. */
export function latestCaptureView(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
  const s = snapshots[snapshots.length - 1];
  const n = snapshots.length;
  return {
    thumb: s.thumb || null,
    format: s.format || 'PNG',
    seed: typeof s.seed === 'number' ? s.seed.toString(16) : String(s.seed ?? '—'),
    resolution: s.resolution || '',
    time: s.timestamp || '',
    countLabel: `${n} kept`,
  };
}

/** Same success rule the old DIAGNOSTICS line used: "done" or a loaded project reads good. */
export function statusTone(message) {
  if (!message) return 'none';
  return message.includes('done') || message === 'Project loaded' ? 'good' : 'accent';
}
