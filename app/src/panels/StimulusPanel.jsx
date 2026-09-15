import { useState, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { emit, Events } from '../composition/eventBus.js';
import { SourceControls } from './stimulus/SourceControls.jsx';
import { ReactivityControls } from './stimulus/ReactivityControls.jsx';
import { MeterBlock } from './stimulus/MeterBlock.jsx';

export function StimulusPanel() {
  const { state } = useApp(s => ({
    webcamEnabled: s.webcamEnabled,
    audioEnabled: s.audioEnabled,
    motionEnergy: s.motionEnergy,
    audioGain: s.audioGain,
    audioSource: s.audioSource,
    audioMonitor: s.audioMonitor,
    beatPulse: s.beatPulse,
    audioBands: s.audioBands,
    layoutParams: s.layoutParams,
  }));
  const {
    webcamEnabled, audioEnabled, motionEnergy, audioGain, audioSource,
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

  return (
    <div className="panel panel-stimulus">
      <PanelHeader tag="P06" title="STIMULUS" subtitle={webcamEnabled || audioEnabled ? 'active' : 'idle'} />
      <div className="stim-body">
          <div className="stim-toggle-row">
            <button
              className={`stim-toggle ${webcamEnabled ? 'on' : ''}`}
              style={webcamEnabled ? { background: '#00ff88', borderColor: '#00ff88' } : {}}
              onClick={() => emit(Events.WEBCAM_TOGGLE, !webcamEnabled)}
            >
              🎥 VIDEO {webcamEnabled ? 'ON' : 'OFF'}
            </button>
            <button
              className={`stim-toggle ${audioEnabled ? 'on' : ''}`}
              style={audioEnabled ? { background: '#00d9ff', borderColor: '#00d9ff' } : {}}
              onClick={() => emit(Events.AUDIO_TOGGLE, !audioEnabled)}
            >
              🎤 AUDIO {audioEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <SourceControls
            audioSource={audioSource}
            audioGain={audioGain}
            audioMonitor={audioMonitor}
            devices={devices}
          />

          <ReactivityControls depth={depth} scaleMod={scaleMod} alphaMod={alphaMod} life={life} />

          <MeterBlock motionEnergy={motionEnergy} audioBands={audioBands} beatPulse={beatPulse} />
      </div>
    </div>
  );
}
