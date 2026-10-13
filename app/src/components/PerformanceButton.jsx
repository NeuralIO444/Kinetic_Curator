// PerformanceButton.jsx — #1353 step 4: the footer control for recording a performance.
// Two states, one button: `rec` starts a take; while recording it reads `● stop ↓` and a click ends the take and
// downloads the .kcperf file. The file replays to the same frames (performanceFile.selfcheck); there is no in-app
// playback this cycle. The frame count in the tooltip is a measurement, read from the recorder.
import { useEffect, useState } from 'react';
import { isRecordingPerformance, performanceFrames, startPerformance, stopPerformance } from '../gl/performanceCapture.mjs';
import { getStressState, setStressTap } from '../curator/stressLive.js';
import { createStressRecorder } from '../curator/stressRecord.js';
import { createFormationRecorder } from '../curator/formation.js';
import { resetFormation, setFormationTap, setShiftTap } from '../curator/formationLive.js';
import { createShiftRecorder } from '../curator/davisShift.js';

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
  // The recorder is a module singleton with no subscription API: while a take runs, poll its frame count.
  useEffect(() => {
    if (!recording) return undefined;
    const id = setInterval(() => setFrames(performanceFrames()), 500);
    return () => clearInterval(id);
  }, [recording]);

  const onClick = async () => {
    if (!recording) {
      if (startPerformance({ sections: { stress: stressSection, formation: formationSection, davis: davisSection } })) { setFrames(0); setRecording(true); }
      return;
    }
    setRecording(false);
    const take = await stopPerformance();
    if (take) downloadBytes(take.bytes, take.filename);
  };

  return (
    <button
      type="button"
      className={`micro-btn${recording ? ' active' : ''}`}
      aria-pressed={recording}
      style={recording ? undefined : { opacity: 0.45 }}
      title={recording
        ? `Recording a performance: ${frames} frames. Click to stop and download it.`
        : 'Record a performance: your session as a small file that replays to the same frames.'}
      onClick={onClick}
    >
      {recording ? '● stop ↓' : 'rec'}
    </button>
  );
}
