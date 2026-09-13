import { useState, useEffect } from 'react';
import { emit, Events } from '../../composition/eventBus.js';

export function SourceControls({ webcamEnabled, audioEnabled, audioSource, audioGain, audioMonitor, devices }) {
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    emit(Events.AUDIO_SOURCE, { type: 'file', url, name: file.name });
  };

  const handleDeviceChange = (e) => {
    if (e.target.value !== 'file') {
      emit(Events.AUDIO_SOURCE, { type: 'device', id: e.target.value });
    }
  };

  return (
    <div style={{ padding: '6px', border: '1px solid var(--line-2)', marginBottom: '6px', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '9px', color: 'var(--dim)', letterSpacing: '0.1em' }}>AUDIO SRC</span>
        <button
          className={`micro-btn ${audioMonitor ? 'active' : ''}`}
          onClick={() => emit(Events.AUDIO_MONITOR, !audioMonitor)}
          style={audioMonitor ? { background: '#00ff88', color: '#000', borderColor: '#00ff88' } : {}}
        >
          {audioMonitor ? '🔊 MON ON' : '🔈 MON OFF'}
        </button>
      </div>

      <select
        value={audioSource.type === 'device' ? audioSource.id : 'file'}
        onChange={handleDeviceChange}
        style={{ width: '100%', marginBottom: '6px', background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '3px', fontSize: '10px' }}
      >
        <option value="default">Default Mic</option>
        {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 5)}...`}</option>)}
        {audioSource.type === 'file' && <option value="file">File: {audioSource.name}</option>}
      </select>

      <input type="file" accept="audio/*" onChange={handleFileChange} style={{ fontSize: '9px', color: 'var(--dim)', width: '100%' }} />

      <div style={{ marginTop: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'var(--dim)', letterSpacing: '0.1em', marginBottom: '3px' }}>
          <span>GAIN</span>
          <span>{audioGain.toFixed(2)}x</span>
        </div>
        <input
          type="range" min="0" max="5" step="0.1"
          value={audioGain}
          onChange={e => emit(Events.AUDIO_GAIN, parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}
