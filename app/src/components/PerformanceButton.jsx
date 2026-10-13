// PerformanceButton.jsx — #1353 step 4: the footer control for recording a performance.
// Two states, one button: `rec` starts a take; while recording it reads `● stop ↓` and a click ends the take and
// downloads the .kcperf file. The file replays to the same frames (performanceFile.selfcheck); `▶ take` plays one back
// through the instrument (#1461). The frame count in the tooltip is a measurement, read from the recorder.
import { useEffect, useRef, useState } from 'react';
import { isRecordingPerformance, performanceFrames, startPerformance, stopPerformance } from '../gl/performanceCapture.mjs';
import { unpackPerformance } from '../gl/performanceFile.mjs';
import { startPlayback, stopPlayback, isPlaybackActive, subscribePlayback } from '../gl/playback.mjs';
import { getStressState, setStressTap } from '../curator/stressLive.js';
import { createStressRecorder } from '../curator/stressRecord.js';
import { createFormationRecorder } from '../curator/formation.js';
import { resetFormation, setFormationTap, setShiftTap } from '../curator/formationLive.js';
import { createShiftRecorder } from '../curator/davisShift.js';
import { createClockRecorder } from '../curator/clockRecord.js';
import { useStore } from '../state/store.js';

// #1354 — the take carries its stress signals and band changes: started from the live tracker's state, fed by every
// tracker update, and stored on the performance as `stress`.
const stressSection = (getFrame) => {
  const now = getStressState();
  const rec = createStressRecorder({ initial: { smoothed: now.band === null ? null : now.smoothed, band: now.band }, getFrame });
  setStressTap((u) => rec.update(u));
  return { stop() { setStressTap(null); return rec.finish(); } };
};

// #1355 step 3 — the take carries the formation rule's signals and every `hierarchy-form` event, stored as
// `formation`. It starts from fresh formation state, as the take starts from a fresh resolver (`rec` restarts the scene).
const formationSection = (getFrame) => {
  resetFormation();
  const rec = createFormationRecorder({ getFrame });
  setFormationTap((u, events) => rec.update(u, events));
  return { stop() { setFormationTap(null); return rec.finish(); } };
};

// #1356 step 2 — the take carries every `davis-shift` (a moth's traits, made once at birth), stored as `davis`.
const davisSection = (getFrame) => {
  const rec = createShiftRecorder({ getFrame });
  setShiftTap((born) => rec.update(born));
  return { stop() { setShiftTap(null); return rec.finish(); } };
};

// #1461 step 1 — the take carries its BEAT BPM sequence (the start and every change by frame), stored as `clock`: with
// the loop time of each frame that is enough to rebuild every bar on playback.
const clockSection = (getFrame) => {
  const rec = createClockRecorder({ initialBpm: useStore.getState().beatBpm, getFrame });
  const off = useStore.subscribe((s, prev) => { if (s.beatBpm !== prev.beatBpm) rec.set(s.beatBpm); });
  return { stop() { off(); return rec.finish(); } };
};

function downloadBytes(bytes, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/gzip' }));
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export function PerformanceButton() {
  const [recording, setRecording] = useState(isRecordingPerformance());
  const [frames, setFrames] = useState(0);
  // #1461 step 2 — playing a take back (the scrub strip is step 3)
  const [playing, setPlaying] = useState(isPlaybackActive());
  const [playNote, setPlayNote] = useState('');
  const fileRef = useRef(null);
  useEffect(() => subscribePlayback(() => setPlaying(isPlaybackActive())), []);
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const perf = await unpackPerformance(new Uint8Array(await file.arrayBuffer()));
      setPlayNote(startPlayback(perf) ? '' : 'that file is not a take this build can play');
    } catch {
      setPlayNote('that file is not a take (.kcperf)');
    }
  };
  // The recorder is a module singleton with no subscription API: while a take runs, poll its frame count.
  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(() => setFrames(performanceFrames()), 500);
    return () => clearInterval(id);
  }, [recording]);

  const onClick = async () => {
    if (!recording) {
      if (startPerformance({ sections: { stress: stressSection, formation: formationSection, davis: davisSection, clock: clockSection } })) { setFrames(0); setRecording(true); }
      return;
    }
    setRecording(false);
    const take = await stopPerformance();
    if (take) downloadBytes(take.bytes, take.filename);
  };

  return (
    <>
      <button
        type="button"
        className={`perf-btn rec${recording ? ' on' : ''}`}
        aria-pressed={recording}
        disabled={playing}
        title={playing
          ? 'Playing a take: stop playback to record.'
          : recording
            ? `Recording a performance: ${frames} frames. Click to stop and download it.`
            : 'Record a performance: your session as a small file that replays to the same frames.'}
        onClick={onClick}
      >
        <span className="perf-dot" aria-hidden="true">●</span>{recording ? ' stop ↓' : ' rec'}
      </button>
      <button
        type="button"
        className={`perf-btn take${playing ? ' on' : ''}`}
        aria-pressed={playing}
        disabled={recording}
        title={playing ? 'Playing a take back. Click to return to the live instrument.' : (playNote || 'Play a take (.kcperf) back through the instrument.')}
        onClick={() => { if (playing) { stopPlayback(); setPlayNote(''); } else if (fileRef.current) fileRef.current.click(); }}
      >
        {playing ? '■ take' : '▶ take'}
      </button>
      <input ref={fileRef} type="file" accept=".kcperf,application/gzip" onChange={onFile} style={{ display: 'none' }} aria-label="Load a take" />
    </>
  );
}
