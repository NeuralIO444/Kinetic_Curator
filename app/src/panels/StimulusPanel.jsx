import { useState, useEffect } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { useCollapse } from '../hooks/useCollapse.js';
import { WaveformMeter } from '../components/WaveformMeter.jsx';
import * as A from '../state/actions.js';

export function StimulusPanel() {
  const { state, dispatch } = useApp();
  const { webcamEnabled, audioEnabled, motionEnergy, audioGain, audioSource, audioMonitor, beatPulse, audioBands } = state;
  const { open, toggle } = useCollapse(false);

  const [devices, setDevices] = useState([]);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devs => {
      setDevices(devs.filter(d => d.kind === 'audioinput'));
    }).catch(() => {});
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    dispatch({ type: A.SET_AUDIO_SOURCE, payload: { type: 'file', url, name: file.name } });
  };

  const handleDeviceChange = (e) => {
    if (e.target.value !== 'file') {
      dispatch({ type: A.SET_AUDIO_SOURCE, payload: { type: 'device', id: e.target.value } });
    }
  };

  return (
    <div className="panel panel-stimulus">
      <PanelHeader tag="P06" title="STIMULUS" subtitle={webcamEnabled || audioEnabled ? 'active' : 'idle'} collapsed={!open} onToggle={toggle} />
      {open && (
        <div className="stim-body">
          <div className="stim-toggle-row">
            <button
              className={`stim-toggle ${webcamEnabled ? 'on' : ''}`}
              style={webcamEnabled ? { background: '#00ff88', borderColor: '#00ff88' } : {}}
              onClick={() => dispatch({ type: A.SET_WEBCAM_ENABLED, payload: !webcamEnabled })}
            >
              🎥 VIDEO {webcamEnabled ? 'ON' : 'OFF'}
            </button>
            <button
              className={`stim-toggle ${audioEnabled ? 'on' : ''}`}
              style={audioEnabled ? { background: '#00d9ff', borderColor: '#00d9ff' } : {}}
              onClick={() => dispatch({ type: A.SET_AUDIO_ENABLED, payload: !audioEnabled })}
            >
              🎤 AUDIO {audioEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div style={{ padding: '8px', border: '1px solid var(--line-2)', marginBottom: '8px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '9px', color: 'var(--dim)', letterSpacing: '0.1em' }}>AUDIO SRC</span>
              <button 
                className={`micro-btn ${audioMonitor ? 'active' : ''}`} 
                onClick={() => dispatch({ type: A.SET_AUDIO_MONITOR, payload: !audioMonitor })}
                style={audioMonitor ? { background: '#00ff88', color: '#000', borderColor: '#00ff88' } : {}}
              >
                {audioMonitor ? '🔊 MON ON' : '🔈 MON OFF'}
              </button>
            </div>
            
            <select 
              value={audioSource.type === 'device' ? audioSource.id : 'file'} 
              onChange={handleDeviceChange}
              style={{ width: '100%', marginBottom: '8px', background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '4px', fontSize: '11px' }}
            >
              <option value="default">Default Mic</option>
              {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 5)}...`}</option>)}
              {audioSource.type === 'file' && <option value="file">File: {audioSource.name}</option>}
            </select>

            <input type="file" accept="audio/*" onChange={handleFileChange} style={{ fontSize: '10px', color: 'var(--dim)', width: '100%' }} />
            
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--dim)', letterSpacing: '0.1em', marginBottom: '4px' }}>
                <span>GAIN</span>
                <span>{audioGain.toFixed(2)}x</span>
              </div>
              <input 
                type="range" min="0" max="5" step="0.1" 
                value={audioGain} 
                onChange={e => dispatch({ type: A.SET_AUDIO_GAIN, payload: parseFloat(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div className="stim-meters">
            <MeterRow label="MOTION" value={motionEnergy} color="#00ff88" />
            <div style={{ height: '8px' }} />
            <WaveformMeter audioBands={audioBands} beatPulse={beatPulse} />
          </div>
        </div>
      )}
    </div>
  );
}

function MeterRow({ label, value, color }) {
  const pct = Math.min(100, Math.max(0, (value || 0) * 100));
  return (
    <div className="stim-meter-row">
      <span className="stim-meter-label">{label}</span>
      <div className="stim-meter-track">
        <div className="stim-meter-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontSize: '10px', color: 'var(--ink)', textAlign: 'right' }}>{pct.toFixed(0)}%</span>
    </div>
  );
}
