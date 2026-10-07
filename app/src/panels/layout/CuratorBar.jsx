// Curator bar — the taste-guided re-roll over unlocked params.
// Rolls CURATE_CANDIDATES scenes, keeps the curator engine's pick.
// The voice popup (left of the Curator button) chooses which persona
// tastes the candidates ("off" = honest dice roll). The hint always says
// who picked. #716: lives in the top bar (global verb), so it reads its own
// state and the hint rides the Curator button's tooltip. The looks popup (#735: Looks, never "presets", on the face) (also left of Curator) applies a named,
// complete scene directly — a different action from taste-biased random.
import { useEffect, useMemo, useRef, useState } from 'react';
import { emit, on, Events } from '../../composition/eventBus.js';
import { getActiveCurator, curatorHint } from '../../curator/curate.js';
import { useStore } from '../../state/store.js';
import { getRenderProfile } from '../../curator/renderProfiles.js';
import { getPresetsByGroup } from '../../data/presets.js';
import {
  voiceOptions,
  getActivePersonaId,
  setActivePersona,
} from '../../curator/taste.js';
import { getLoisVerdict } from '../../curator/loisRank.js';
import { KineticButton } from './KineticButton.jsx';
import { ExpandLabel } from '../../components/ExpandLabel.jsx';
import { useTapOpen } from '../../hooks/useTapOpen.js';
import { useColdOpen } from '../../hooks/useColdOpen.js';
import { TAP_PULSE_MS } from '../../hooks/coldOpen.mjs';
import { useInvite } from '../../hooks/useInvite.js';
import { BeatButton } from '../../components/BeatButton.jsx';

export function CuratorBar() {
  const composition = useStore((s) => s.layoutParams.composition);
  useStore((s) => s.curatePress); // re-read the LOIS line after a pick
  const lockCount = useStore((s) => Object.values(s.lockedParams || {}).filter(Boolean).length);
  const [voice, setVoice] = useState(getActivePersonaId() ?? 'off');
  const [menuOpen, setMenuOpen] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  // #1103 — LOOKS and VOICE rest as [L] / [V]. Once opened to the full word they cool down to a
  // 3-letter form ([LOK] / [VOI]) for the rest of the session: a button you have used stays more readable.
  const [looksUsed, setLooksUsed] = useState(false);
  const [voiceUsed, setVoiceUsed] = useState(false);
  const looksTap = useTapOpen();
  const voiceTap = useTapOpen();
  const curTap = useTapOpen();
  const cold = useColdOpen(); // #1103 — [KINETIC] and [CURATOR] show their full names for the first ~2 s
  const wrapRef = useRef(null);
  const presetWrapRef = useRef(null);
  useStore((s) => s.tasteRev); // #762: re-resolve the engine when a taste is imported/cleared
  const curator = getActiveCurator();
  const chainFallback = useStore((s) => s.curateChainFallback);
  const hint = curatorHint(curator, { chainFallback });
  const presetGroups = useMemo(() => getPresetsByGroup(), []);
  // #946 — START: CHAOS / FIXED. What a cold launch opens on: one full
  // wild roll (default), or the deterministic factory opener for
  // performance situations that need a known first frame.
  const startupMode = useStore((s) => s.startupMode);
  const setStartupMode = useStore((s) => s.setStartupMode);

  // #1103 — every Curator roll (the button, and anything else that emits LAYOUT_CURATE) flashes CURATOR's full
  // name, then it cools down. Subscribed to the event, not the click, so a roll from anywhere is acknowledged.
  const pulseCurator = curTap.pulse;
  const [curShimmer, curUsed] = useInvite('curator'); // #1103 — same sheen as KINETIC, until it is pressed
  useEffect(() => on(Events.LAYOUT_CURATE, () => { pulseCurator(TAP_PULSE_MS); curUsed(); }), [pulseCurator, curUsed]);

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
  const voices = voiceOptions();
  const activeAlias =
    voice === 'off'
      ? 'off'
      : voices.find((p) => p.id === voice)?.alias ?? voice;
  const loisLine = voice === 'lois' ? getLoisVerdict() : '';
  const onCurate = () => {
    emit(Events.LAYOUT_CURATE);
    emit(Events.ROLL_GUARD, { kind: 'curate' }); // #1107: look at the frame it landed
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
    <div className="curator-left-group kc-topbar-curator">
        {/* #946 — START mode toggle: what a cold launch opens on. Sits left of KIN: [logo] [START] [KIN]. */}
        <button
          type="button"
          className="start-mode-btn act"
          data-mode={startupMode}
          onClick={() => setStartupMode(startupMode === 'chaos' ? 'fixed' : 'chaos')}
          title={
            startupMode === 'chaos'
              ? 'START: K.O.Z. (Kinetic Operation Zone) — every cold launch opens on one full wild roll. Click for a fixed, deterministic opener.'
              : 'START: FIXED — every cold launch opens on the factory default scene. Click for chaos.'
          }
          aria-label={`Start mode ${startupMode}. Activate to switch to ${startupMode === 'chaos' ? 'fixed' : 'chaos'}`}
        >
          start: {startupMode === 'chaos' ? 'k.o.z.' : 'fixed'}
        </button>
        {/* #942 — KINETIC: storm generator after the START toggle. */}
        <KineticButton />
        <div className="curator-voice-wrap" ref={presetWrapRef}>
          <button
            className="curator-voice-btn xl act"
            data-open={looksTap.open ? 'true' : undefined}
            onClick={() => { setPresetMenuOpen((o) => !o); setLooksUsed(true); }}
            onMouseLeave={() => setLooksUsed(true)}
            onBlur={() => setLooksUsed(true)}
            {...looksTap.props}
            aria-label="Looks — pick a complete layout"
            aria-haspopup="menu"
            aria-expanded={presetMenuOpen}
            title="Apply a Look — layout only; your palette and marks stay put"
          >
            <ExpandLabel mode="swap" short={looksUsed ? 'lok' : 'l'} full="looks ▾" />
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
            className="curator-voice-btn xl act"
            data-open={voiceTap.open ? 'true' : undefined}
            onClick={() => { setMenuOpen((o) => !o); setVoiceUsed(true); }}
            onMouseLeave={() => setVoiceUsed(true)}
            onBlur={() => setVoiceUsed(true)}
            {...voiceTap.props}
            aria-label={`Voice: ${activeAlias}. Persona voice tasting the candidates`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Persona voice tasting the candidates — off means a plain dice roll"
          >
            <ExpandLabel mode="swap" short={voiceUsed ? 'voi' : 'v'} full={`voice: ${activeAlias} ▾`} />
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
              {voices.map((p) => (
                <button
                  role="menuitem"
                  key={p.id}
                  className={voice === p.id ? 'active' : ''}
                  onClick={() => pickVoice(p.id)}
                  title={p.heuristic ? 'Hand-tuned rank: glance, distance from the pile, boldness. Not a trained eye.' : undefined}
                >
                  voice: {p.title || p.alias}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={`randomize-btn xl act${curShimmer ? ' xl-shimmer' : ''}`} onClick={onCurate}
          data-open={curTap.open || cold ? 'true' : undefined}
          {...curTap.props}
          aria-label="Curator — roll a taste-guided scene over the unlocked parameters"
          title={`${lockCount > 0 ? `${lockCount} locked · ` : ''}${hint}`}>
          <ExpandLabel short="cur" full="curator" />
        </button>
        {/* #1103 — BEAT sits right of CURATOR: the verbs, then the clock they run on. [•B] opens to BEAT · 120. */}
        <BeatButton />
        {loisLine && (
          <span className="lois-verdict" title={hint}>{loisLine}</span>
        )}
    </div>
  );
}
