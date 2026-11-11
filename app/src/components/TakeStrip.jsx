// TakeStrip (#1461 step 3) — the scrub strip for a take being played back: where you are (BAR n / m, or minutes and
// seconds for a take recorded before bars), and a drag to jump. It lives in the performing bar's gap and is absent
// when no take plays. Read from the playback holder on its own timer, never from the store; a drag only calls
// seekPlayback (a fresh resolver catches up on the next frame). Pause is STOP, as ever.
import { useEffect, useMemo, useState } from 'react';
import { getPlayback, seekPlayback, subscribePlayback } from '../gl/playback.mjs';
import { takeStripModel } from '../curator/takeStrip.mjs';
import { checkRecapRecord } from '../curator/megamindRecap.mjs';
import { ensureRecapDriver, getRecapView, subscribeRecaps } from '../curator/megamindRecapLive.js';
import { RangeRow } from './RangeRow.jsx';

// #1529 — a finished take's records, read under the strip once playback ends: the capture's own
// summary when the take carries one (a retro capture's "what just happened"), then the replay
// recap Davis and LOIS wrote from the take's log. Records only — nothing here shows mid-play.
function RecapBlock({ title, recap }) {
  if (!recap) return null;
  return (
    <div className="take-recap">
      <span className="take-recap-kind">{title}</span>
      {recap.lines.map((line, i) => (
        <span key={i} className="take-recap-line">
          {line.persona ? (
            <span className="take-recap-who">{line.persona === 'davis' ? 'DAVIS ' : 'LOIS '}</span>
          ) : null}
          {line.text}
        </span>
      ))}
    </div>
  );
}

export function TakeStrip() {
  const [pb, setPb] = useState(getPlayback());
  const [frame, setFrame] = useState(pb ? pb.frame : 0);
  const [dragging, setDragging] = useState(false);
  useEffect(
    () =>
      subscribePlayback(() => {
        const p = getPlayback();
        setPb(p);
        setFrame(p ? p.frame : 0);
      }),
    [],
  );
  // the cursor moves every frame; sample it at 10 Hz (a strip does not need 60)
  useEffect(() => {
    if (!pb) return undefined;
    const id = setInterval(() => {
      const p = getPlayback();
      if (p && !dragging) setFrame(p.frame);
    }, 100);
    return () => clearInterval(id);
  }, [pb, dragging]);
  // #1529 — the recap driver watches the same holder; it can only act once a take has ended.
  const [recapView, setRecapView] = useState(getRecapView());
  useEffect(() => {
    ensureRecapDriver();
    return subscribeRecaps(() => setRecapView(getRecapView()));
  }, []);
  const model = useMemo(() => (pb ? takeStripModel(pb.perf) : null), [pb && pb.perf]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pb || !model) return null;
  const pos = model.positionOf(frame);
  const summary = pb.ended ? checkRecapRecord(pb.perf && pb.perf.summary) : null;
  const recap =
    pb.ended && recapView && recapView.perf === pb.perf
      ? checkRecapRecord(recapView.recap)
      : pb.ended
        ? checkRecapRecord(pb.perf && pb.perf.recap)
        : null;
  return (
    <div
      className="take-strip"
      aria-label="take scrub"
      onPointerDown={() => setDragging(true)}
      onPointerUp={() => setDragging(false)}
    >
      <span className="take-strip-label">{model.labelFor(frame)}</span>
      <RangeRow
        layout="bare"
        className="take-strip-range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(pos * 1000)}
        ariaLabel={model.hasBars ? 'Scrub by bar' : 'Scrub by time'}
        onChange={(v) => {
          const f = model.frameForPosition(v / 1000);
          setFrame(f);
          seekPlayback(f);
        }}
      />
      <span className="take-strip-note">{pb.ended ? 'END' : ''}</span>
      <RecapBlock title="CAPTURE SUMMARY" recap={summary} />
      <RecapBlock title="RECAP" recap={recap} />
    </div>
  );
}
