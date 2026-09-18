import { useState, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { emit, Events } from '../composition/eventBus.js';
import { SourceControls } from './stimulus/SourceControls.jsx';
import { ReactivityControls } from './stimulus/ReactivityControls.jsx';
import { MeterBlock } from './stimulus/MeterBlock.jsx';

export function StimulusPanel() {
  const { state } = useApp(s => ({
    audioEnabled: s.audioEnabled,
    audioGain: s.audioGain,
    audioSource: s.audioSource,
    audioMonitor: s.audioMonitor,
    beatPulse: s.beatPulse,
    audioBands: s.audioBands,
    layoutParams: s.layoutParams,
  }));
  const {
    audioEnabled, audioGain, audioSource,
    audioMonitor, beatPulse, audioBands, layoutParams,
  } = state;

  const [devices, setDevices] = useState([]);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devs => {
      setDevices(devs.filter(d => d.kind === 'audioinput'));
    }).catch(() => {});
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

  return (
    <div className="panel panel-stimulus">
      <PanelHeader tag="P06" title="STIMULI" subtitle={audioEnabled ? 'active' : 'idle'} />
      <div className="stim-body">
          <div className="stim-toggle-row">
            {/* #310: VIDEO (soon) removed — dead control, nothing reads motionEnergy. */}
            <button
              className={`stim-toggle ${audioEnabled ? 'on' : ''}`}
              style={audioEnabled ? { background: '#00d9ff', borderColor: '#00d9ff' } : {}}
              onClick={() => emit(Events.AUDIO_TOGGLE, !audioEnabled)}
            >
              🎤 AUDIO {audioEnabled ? 'ON' : 'OFF'}
            </button>
            <button
              className={`stim-toggle ${setupOpen ? 'on' : ''}`}
              onClick={() => setSetupOpen(o => !o)}
              title="Audio setup: source mic/file, monitor, gain"
              aria-expanded={setupOpen}
            >
              ⚙ SETUP {setupOpen ? '▾' : '▸'}
            </button>
          </div>

          {setupOpen && (
            <SourceControls
              audioSource={audioSource}
              audioGain={audioGain}
              audioMonitor={audioMonitor}
              devices={devices}
            />
          )}

          <ReactivityControls depth={depth} scaleMod={scaleMod} alphaMod={alphaMod} life={life} attackMs={attackMs} decayMs={decayMs} response={response} swell={swell} audioEnabled={audioEnabled} />

          <MeterBlock audioBands={audioBands} beatPulse={beatPulse} />
      </div>
    </div>
  );
}
