// TakeStrip (#1461 step 3) — the scrub strip for a take being played back: where you are (BAR n / m, or minutes and
// seconds for a take recorded before bars), and a drag to jump. It lives in the performing bar's gap and is absent
// when no take plays. Read from the playback holder on its own timer, never from the store; a drag only calls
// seekPlayback (a fresh resolver catches up on the next frame). Pause is STOP, as ever.
import { useEffect, useMemo, useState } from 'react';
import { getPlayback, seekPlayback, subscribePlayback } from '../gl/playback.mjs';
import { takeStripModel } from '../curator/takeStrip.mjs';

export function TakeStrip() {
  const [pb, setPb] = useState(getPlayback());
  const [frame, setFrame] = useState(pb ? pb.frame : 0);
  const [dragging, setDragging] = useState(false);
  useEffect(() => subscribePlayback(() => { const p = getPlayback(); setPb(p); setFrame(p ? p.frame : 0); }), []);
  // the cursor moves every frame; sample it at 10 Hz (a strip does not need 60)
  useEffect(() => {
    if (!pb) return undefined;
    const id = setInterval(() => { const p = getPlayback(); if (p && !dragging) setFrame(p.frame); }, 100);
    return () => clearInterval(id);
  }, [pb, dragging]);
  const model = useMemo(() => (pb ? takeStripModel(pb.perf) : null), [pb && pb.perf]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pb || !model) return null;
  const pos = model.positionOf(frame);
  return (
    <div className="take-strip" aria-label="take scrub">
      <span className="take-strip-label">{model.labelFor(frame)}</span>
      <input
        type="range" className="take-strip-range" min={0} max={1000} step={1}
        value={Math.round(pos * 1000)}
        aria-label={model.hasBars ? 'Scrub by bar' : 'Scrub by time'}
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        onChange={(e) => {
          const f = model.frameForPosition(Number(e.target.value) / 1000);
          setFrame(f);
          seekPlayback(f);
        }}
      />
      <span className="take-strip-note">{pb.ended ? 'END' : ''}</span>
    </div>
  );
}
