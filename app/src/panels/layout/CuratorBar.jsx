// Curator bar — the taste-guided re-roll over unlocked params.
// Rolls CURATE_CANDIDATES scenes, keeps the curator engine's pick.
// The voice popup (left of the Curator button) chooses which persona
// tastes the candidates ("off" = honest dice roll). The hint always says
// who picked. The presets popup (also left of Curator) applies a named,
// complete scene directly — a different action from taste-biased random.
import { useEffect, useMemo, useRef, useState } from 'react';
import { emit, Events } from '../../composition/eventBus.js';
import { getActiveCurator, curatorHint } from '../../curator/curate.js';
import { useStore } from '../../state/store.js';
import { getRenderProfile } from '../../curator/renderProfiles.js';
import { getPresetsByGroup } from '../../data/presets.js';
import {
  PERSONA_TASTES,
  getActivePersonaId,
  setActivePersona,
} from '../../curator/taste.js';

export function CuratorBar({ lockCount, composition }) {
  const [voice, setVoice] = useState(getActivePersonaId() ?? 'off');
  const [menuOpen, setMenuOpen] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  const presetWrapRef = useRef(null);
  const curator = getActiveCurator();
  const chainFallback = useStore((s) => s.curateChainFallback);
  const hint = curatorHint(curator, { chainFallback });
  const presetGroups = useMemo(() => getPresetsByGroup(), []);

  // Close either popup on outside click or Escape.
  useEffect(() => {
    if (!menuOpen && !presetMenuOpen) return undefined;
    const onDown = (e) => {
      if (menuOpen && wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
      if (presetMenuOpen && presetWrapRef.current && !presetWrapRef.current.contains(e.target)) setPresetMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setMenuOpen(false); setPresetMenuOpen(false); }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, presetMenuOpen]);

  const pickPreset = (p) => {
    emit(Events.LAYOUT_PRESET, p);
    setPresetMenuOpen(false);
  };

  const pickVoice = (id) => {
    setActivePersona(id === 'off' ? null : id);
    setVoice(id === 'off' ? 'off' : getActivePersonaId() ?? 'off');
    setMenuOpen(false);
  };
  const activeAlias =
    voice === 'off'
      ? 'off'
      : PERSONA_TASTES.find((p) => p.id === voice)?.alias ?? voice;
  const onCurate = () => {
    emit(Events.LAYOUT_CURATE);
    // The persona brings its palette: switch the global palette to the
    // profile's catalog entry so the color jumps with the voice. Skipped
    // when already there — repeat presses don't wipe swatch overrides or
    // stack undo entries. "off" never touches the palette.
    const profile = getRenderProfile(getActivePersonaId());
    if (profile) {
      const st = useStore.getState();
      if (st.paletteId !== profile.paletteId) st.setPaletteId(profile.paletteId);
    }
  };
  return (
    <div className="randomize-bar">
      <div className="curator-left-group">
        <div className="curator-voice-wrap" ref={presetWrapRef}>
          <button
            className="curator-voice-btn"
            onClick={() => setPresetMenuOpen((o) => !o)}
            title="Apply a named preset scene directly"
          >
            presets ▾
          </button>
          {presetMenuOpen && (
            <div className="curator-voice-menu preset-menu" role="menu">
              <div className="preset-groups">
                {presetGroups.map((g) => (
                  <div key={g.id} className="preset-group">
                    <div className="preset-group-label">{g.label}</div>
                    <div className="preset-row">
                      {g.presets.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="menuitem"
                          className={`preset-btn ${composition === p.id ? 'active' : ''}`}
                          onClick={() => pickPreset(p)}
                          title={p.desc}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="curator-voice-wrap" ref={wrapRef}>
          <button
            className="curator-voice-btn"
            onClick={() => setMenuOpen((o) => !o)}
            title="Persona voice tasting the candidates — off means a plain dice roll"
          >
            voice: {activeAlias} ▾
          </button>
          {menuOpen && (
            <div className="curator-voice-menu" role="menu">
              <button
                role="menuitem"
                className={voice === 'off' ? 'active' : ''}
                onClick={() => pickVoice('off')}
              >
                voice: off
              </button>
              {PERSONA_TASTES.map((p) => (
                <button
                  role="menuitem"
                  key={p.id}
                  className={voice === p.id ? 'active' : ''}
                  onClick={() => pickVoice(p.id)}
                >
                  voice: {p.alias}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="randomize-btn" onClick={onCurate}>
          Curator
        </button>
      </div>
      <span className="randomize-hint">{lockCount > 0 ? `${lockCount} locked · ` : ''}{hint}</span>
    </div>
  );
}
