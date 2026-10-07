// Voice dish (#734, CHIP_LAB C1) — edit a copy of a flagship Voice and save it
// as a NEW user voice. Factory voices are sealed: the draft starts at the
// factory numbers (resolveVoiceState returns fresh objects) and SAVE only
// forks (forkVoice). Loading the fork uses the normal voice MIX — the dish is
// not a second mixer. Visible knobs are the performer's handful; MORE is the
// rest of the existing genome (params, FX, the four asset toggles), no new keys.
import { useState } from 'react';
import { useStore } from '../../state/store.js';
import { resolveVoiceState } from '../../data/voices.js';
import { PARAM_SPEC } from '../../data/layout-modes.js';
import { MAX_USER_VOICES } from '../../state/slices/voiceSlice.js';
import { RangeRow } from '../../components/RangeRow.jsx';

const VISIBLE = [
  { key: 'count', label: 'COUNT' },
  { key: 'lifeDrift', label: 'LIFE' },
  { key: 'wind', label: 'WIND' },
  { key: 'flap', label: 'FLAP' },
];
const stepOf = (spec) => (spec.int ? 1 : Math.max(0.01, Math.round(((spec.max - spec.min) / 100) * 1000) / 1000));

export function VoiceDish({ voice, onClose }) {
  const [draft, setDraft] = useState(() => resolveVoiceState(voice));
  const userVoices = useStore((s) => s.userVoices);
  const forkVoice = useStore((s) => s.forkVoice);
  const loadVoice = useStore((s) => s.loadVoice);
  const full = userVoices.length >= MAX_USER_VOICES;

  const setParam = (k, v) => setDraft((d) => ({ ...d, params: { ...d.params, [k]: v } }));
  const setFx = (k, v) => setDraft((d) => ({ ...d, fx: { ...d.fx, [k]: v } }));
  const assetIds = Object.keys(draft.assets || {});
  const numericParam = (k) => PARAM_SPEC[k] && typeof draft.params[k] === 'number';

  const save = () => {
    const id = `uv-${Date.now().toString(36)}`;
    forkVoice({ id, name: voice.title, state: draft });
    if (useStore.getState().userVoices.some((v) => v.id === id)) loadVoice(id);
    onClose();
  };

  const knob = (k, label) => {
    const spec = PARAM_SPEC[k];
    return (
      <RangeRow key={k} label={label} value={draft.params[k]} min={spec.min} max={spec.max} step={stepOf(spec)}
        onChange={(v) => setParam(k, v)} defaultValue={resolveVoiceState(voice).params[k]} />
    );
  };

  return (
    <div className="voice-dish" role="group" aria-label={`Edit ${voice.title}`}>
      <div className="voice-dish-head">
        <span>✎ {voice.title}</span>
        <span className="voice-dish-note">edits a copy — factory stays sealed</span>
      </div>
      {VISIBLE.map(({ key, label }) => knob(key, label))}
      <RangeRow label="BLEND S" value={draft.blendSeconds} min={0.1} max={30} step={0.1}
        onChange={(v) => setDraft((d) => ({ ...d, blendSeconds: v }))} defaultValue={resolveVoiceState(voice).blendSeconds} />
      <RangeRow label="GRAIN" value={draft.fx.grain} min={0} max={1} step={0.01}
        onChange={(v) => setFx('grain', v)} defaultValue={resolveVoiceState(voice).fx.grain} />
      <div className="voice-dish-assets" title="The voice's cast">{assetIds.join(' · ') || 'all assets'}</div>

      <details className="voice-dish-more">
        <summary className="ttl">more</summary>
        {Object.keys(PARAM_SPEC).filter((k) => numericParam(k) && !VISIBLE.some((v) => v.key === k))
          .map((k) => knob(k, k.toUpperCase()))}
        <RangeRow label="GLOW" value={draft.fx.glow} min={0} max={1} step={0.01} onChange={(v) => setFx('glow', v)} />
        <RangeRow label="CONTRAST" value={draft.fx.contrast} min={0.25} max={3} step={0.05} onChange={(v) => setFx('contrast', v)} />
        <div className="chip-row">
          {['vignette', 'posterize', 'edge'].map((k) => (
            <button key={k} type="button" className={`chip-btn ${draft.fx[k] ? 'active' : ''}`} aria-pressed={!!draft.fx[k]}
              onClick={() => setFx(k, !draft.fx[k])}>{k}</button>
          ))}
        </div>
        {assetIds.length > 0 && (
          <div className="chip-row">
            {assetIds.map((id) => (
              <button key={id} type="button" className={`chip-btn ${draft.assets[id] ? 'active' : ''}`} aria-pressed={!!draft.assets[id]}
                onClick={() => setDraft((d) => ({ ...d, assets: { ...d.assets, [id]: !d.assets[id] } }))}>{id}</button>
            ))}
          </div>
        )}
      </details>

      <div className="voice-dish-actions">
        <button type="button" className="big-btn" disabled={full} onClick={save}
          title={full ? `MY VOICES is full (${MAX_USER_VOICES})` : 'Save this copy as a new voice in MY VOICES and load it'}>
          {full ? 'MY VOICES FULL' : 'SAVE AS VOICE'}
        </button>
        <button type="button" className="big-btn act" onClick={onClose}>cancel</button>
      </div>
    </div>
  );
}
