import { emit, Events } from '../../composition/eventBus.js';
import { RangeRow } from '../../components/RangeRow.jsx';
import { useStore } from '../../state/store.js';
import { parseAudioEnvelope } from '../../gl/audioEnvelopeCore.mjs';
import { sourceStatus, sidecarReason } from '../../gl/sourceStatus.mjs';
import { lostLine, selectedInputMissing } from '../../hooks/audioLoss.mjs';

export function SourceControls({ audioSource, audioLastFile, audioGain, audioMonitor, devices, audioSidecar, audioSidecarNote, audioLost = null }) {
  const status = sourceStatus(audioSource, audioSidecar, audioSidecarNote);
  // UX-7: the last loaded file survives a switch to mic (the store stashes
  // it instead of revoking the URL), so the dropdown's File: option can
  // bring it back — no need to re-pick the file.
  const fileOpt = audioSource.type === 'file' ? audioSource : audioLastFile;
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    emit(Events.AUDIO_SOURCE, { type: 'file', url, name: file.name });
  };

  // #618: a kc-audio-envelope/1 sidecar for the loaded file. Malformed files
  // are refused with a reason and the source stays on live analysis.
  const handleSidecarChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const set = useStore.getState().setAudioSidecar;
    let raw;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      set(null, sidecarReason('not-json'));
      return;
    }
    const { env, problem } = parseAudioEnvelope(raw);
    if (!env) set(null, sidecarReason(problem));
    else set({ name: file.name, env });
  };

  const handleSourceChange = (e) => {
    if (e.target.value === 'file') {
      // UX-7: the File: option is selectable — re-emit the stashed file
      // source (same shape as a fresh pick: { type:'file', url, name }).
      if (fileOpt && fileOpt.url) {
        emit(Events.AUDIO_SOURCE, { type: 'file', url: fileOpt.url, name: fileOpt.name });
      }
      return;
    }
    emit(Events.AUDIO_SOURCE, { type: 'device', id: e.target.value });
  };

  return (
    <div style={{ padding: '6px', border: '1px solid var(--line-2)', marginBottom: '6px', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span className="lbl" style={{ fontSize: '9px', color: 'var(--dim)', letterSpacing: '0.1em' }}>audio src</span>
        <button
          className={`micro-btn act ${audioMonitor ? 'active' : ''}`}
          onClick={() => emit(Events.AUDIO_MONITOR, !audioMonitor)}
          style={audioMonitor ? { background: '#00ff88', color: '#000', borderColor: '#00ff88' } : {}}
        >
          {audioMonitor ? '((·)) mon on' : '((·)) mon off'}
        </button>
      </div>

      <select
        value={audioSource.type === 'device' ? audioSource.id : 'file'}
        onChange={handleSourceChange}
        style={{ width: '100%', marginBottom: '6px', background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '3px', fontSize: '10px' }}
      >
        <option value="default">Default Mic</option>
        {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 5)}...`}</option>)}
        {selectedInputMissing(audioSource, devices) && <option value={audioSource.id}>(not connected)</option>}
        {fileOpt && fileOpt.url && <option value="file">File: {fileOpt.name}</option>}
      </select>

      {audioLost && (
        <div className="stim-source-status" role="alert" title="The chosen input is gone. Switch AUDIO on to reconnect it; KC-1 never switches to a different input by itself.">
          <span className="stim-source-tag">LOST</span>
          <span>{lostLine(audioLost.name)} · switch AUDIO on to reconnect</span>
        </div>
      )}

      <input type="file" accept="audio/*" onChange={handleFileChange} style={{ fontSize: '9px', color: 'var(--dim)', width: '100%' }} />

      {/* #618 — SOURCE, honestly: what is driving reactivity, and what is not. */}
      <div className="stim-source-status" role="status" title={status.driving}>
        <span className="stim-source-tag">{status.tag}</span>
        <span>{status.line}</span>
      </div>
      {audioSource.type === 'file' && (
        <label className="stim-sidecar-pick" title="A kc-audio-envelope/1 JSON written by studio/audio_envelope.py (librosa, Mac Studio)">
          <span className="lbl">sidecar</span>
          <input type="file" accept=".json,application/json" onChange={handleSidecarChange} style={{ fontSize: '9px', color: 'var(--dim)' }} />
          {audioSidecar && (
            <button type="button" className="micro-btn" onClick={() => useStore.getState().setAudioSidecar(null)} title="Drop the sidecar and go back to live analysis">✕</button>
          )}
        </label>
      )}

      <div style={{ marginTop: '8px' }}>
        <RangeRow layout="stack" tone="stim" label="GAIN" min={0} max={5} step={0.1}
          value={audioGain} readout={`${audioGain.toFixed(2)}x`} defaultValue={1}
          onChange={v => emit(Events.AUDIO_GAIN, v)} />
      </div>
    </div>
  );
}
