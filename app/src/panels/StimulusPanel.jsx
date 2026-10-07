import { useState, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { emit, Events } from '../composition/eventBus.js';
import { SourceControls } from './stimulus/SourceControls.jsx';
import { ReactivityControls } from './stimulus/ReactivityControls.jsx';
import { FeelPicker } from './stimulus/FeelPicker.jsx';
import { MeterHero } from './stimulus/MeterHero.jsx';
import { ModMatrix } from './stimulus/ModMatrix.jsx';
import { audioInputs } from '../hooks/audioLoss.mjs';
import { RangeTone } from '../components/RangeTone.jsx';

export function StimulusPanel() {
  const { state } = useApp(s => ({
    audioEnabled: s.audioEnabled,
    audioGain: s.audioGain,
    audioSource: s.audioSource,
    audioLastFile: s.audioLastFile, // UX-7: re-selectable file source
    audioMonitor: s.audioMonitor,
    audioSidecar: s.audioSidecar, // #618
    audioSidecarNote: s.audioSidecarNote,
    audioLost: s.audioLost, // #1053
    audioRoutes: s.audioRoutes, // #790
    beatPulse: s.beatPulse,
    audioBands: s.audioBands,
    layoutParams: s.layoutParams,
  }));
  const {
    audioEnabled, audioGain, audioSource, audioLastFile,
    audioMonitor, beatPulse, audioBands, layoutParams,
    audioSidecar, audioSidecarNote, audioRoutes, audioLost,
  } = state;

  const [devices, setDevices] = useState([]);

  // #1053: keep the list current. A device plugged in after the panel opened
  // used to be missing until a reload, and an unplugged one stayed listed.
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md) return undefined;
    let alive = true;
    const refresh = () => {
      md.enumerateDevices().then(devs => { if (alive) setDevices(audioInputs(devs)); }).catch(() => {});
    };
    refresh();
    md.addEventListener?.('devicechange', refresh);
    return () => { alive = false; md.removeEventListener?.('devicechange', refresh); };
  }, []);

  const depth = layoutParams.audioModDepth ?? 0.65;
  const scaleMod = layoutParams.audioScaleMod ?? 0.45;
  const alphaMod = layoutParams.audioAlphaMod ?? 0.25;
  const life = layoutParams.lifeDrift ?? 0.35;
  // #306: envelope ballistics — deepen the existing reactivity controls.
  const attackMs = layoutParams.audioAttackMs ?? 25;
  const decayMs = layoutParams.audioDecayMs ?? 320;
  const response = layoutParams.audioResponse ?? 'exponential';
  const swell = layoutParams.audioSwell ?? 1;

  // #310: the audio source row is collapsed setup — the AUDIO toggle stays
  // in performer sight, mic/file/monitor/gain live behind SETUP.
  const [setupOpen, setSetupOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false); // #615: raw sliders collapsed by default

  return (
    <RangeTone tone="stim">
    <div className="panel panel-stimulus">
      <PanelHeader tag="P06" title="STIMULI" subtitle={audioEnabled ? 'active' : 'idle'} />
      <div className="stim-body">
          {/* Matt 2026-10-04: the AUDIO toggle is the panel's front door —
              first thing in the panel, shimmering until clicked. */}
          <div className="stim-toggle-row">
            {/* #310: VIDEO (soon) removed — dead control, nothing reads motionEnergy. */}
            <button
              className={`stim-toggle ${audioEnabled ? 'on' : 'invite'}`}
              style={audioEnabled ? { background: '#00d9ff', borderColor: '#00d9ff' } : {}}
              onClick={() => emit(Events.AUDIO_TOGGLE, !audioEnabled)}
            >
              {audioEnabled ? '◉' : '○'} AUDIO
            </button>
            <button
              className={`stim-toggle ${setupOpen ? 'on' : ''}`}
              onClick={() => setSetupOpen(o => !o)}
              title="Audio setup: source mic/file, monitor, gain"
              aria-expanded={setupOpen}
            >
              ≡ SETUP {setupOpen ? '▾' : '▸'}
            </button>
          </div>

          {setupOpen && (
            <SourceControls
              audioSource={audioSource}
              audioLastFile={audioLastFile}
              audioGain={audioGain}
              audioMonitor={audioMonitor}
              audioSidecar={audioSidecar}
              audioSidecarNote={audioSidecarNote}
              audioLost={audioLost}
              devices={devices}
            />
          )}

          {/* #613 — hierarchy inverted: the METER is the hero, the MATRIX shows
              which sound drives what, live; setup and raw knobs follow. */}
          <MeterHero />
          {/* UX-7 — FEEL macros lead: the three feels are the first thing you
              see in Stimuli, above the route table. */}
          <FeelPicker layoutParams={layoutParams} />
          <ModMatrix audioBands={audioBands} beatPulse={beatPulse} audioEnabled={audioEnabled}
            depth={depth} scaleMod={scaleMod} alphaMod={alphaMod} routes={audioRoutes} />

          {/* #615 — the eight raw sliders survive behind ADVANCED, unchanged. */}
          <details className="stim-advanced" open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}>
            <summary>ADVANCED</summary>
            <ReactivityControls depth={depth} scaleMod={scaleMod} alphaMod={alphaMod} life={life} attackMs={attackMs} decayMs={decayMs} response={response} swell={swell} audioEnabled={audioEnabled} />
          </details>

      </div>
    </div>
    </RangeTone>
  );
}
