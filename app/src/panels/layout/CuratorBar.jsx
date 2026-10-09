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
import { getLoisVerdict, getLoisVerdictParts } from '../../curator/loisRank.js';
import { getPersonaTaste } from '../../curator/personaTastes.js';
import { verdictDetent, voiceBreathS, voiceLevel, litPills } from '../../curator/topbarTaste.mjs';
import { loisActivity } from '../../curator/loisActivity.js';
import { KineticButton } from './KineticButton.jsx';
import { ExpandLabel } from '../../components/ExpandLabel.jsx';
import { useTapOpen } from '../../hooks/useTapOpen.js';
import { useColdOpen } from '../../hooks/useColdOpen.js';
import { TAP_PULSE_MS } from '../../hooks/coldOpen.mjs';
import { useInvite } from '../../hooks/useInvite.js';
import { BeatButton } from '../../components/BeatButton.jsx';
import { SwayMark } from '../../components/SwayMark.jsx';

export function CuratorBar() {
  const composition = useStore((s) => s.layoutParams.composition);
  useStore((s) => s.curatePress); // re-read the LOIS line after a pick
  const lockCount = useStore((s) => Object.values(s.lockedParams || {}).filter(Boolean).length);
  const armedMode = useStore((s) => s.armedMode);
  const armedMotion = useStore((s) => s.armedMotion);
  const clearRollScope = useStore((s) => s.clearRollScope);
  const keepsCount = useStore((s) => s.keeps?.length ?? 0);
  const favoritesCount = useStore((s) => s.favorites?.length ?? 0);
  const [voice, setVoice] = useState(getActivePersonaId() ?? 'off');
  // #1122 — the look this button applied; dirty = composition moved since.
  const [appliedLook, setAppliedLook] = useState(null);
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
    setAppliedLook({ id: p.id, name: p.name }); // #1122 — L tracks what it applied
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
  // #1122 — affective grammar derivations. Every one traces to a real signal:
  const lookState = !appliedLook ? 'none' : composition === appliedLook.id ? 'clean' : 'dirty';
  const lookName = appliedLook?.name ?? '';
  const voiceOn = voice !== 'off';
  const driftW = voiceOn ? getPersonaTaste(voice)?.weights?.drift : undefined;
  const breathS = voiceBreathS(driftW);
  // #1122: V breathes only after the voice rolled, then decays to still. Read the honest feed once a second.
  const [voiceLvl, setVoiceLvl] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror of the feed, read on mount and each second
    if (!voiceOn) { setVoiceLvl(0); return undefined; }
    const tick = () => setVoiceLvl(voiceLevel(loisActivity.snapshot().lastRollAgoMs));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [voiceOn]);
  const curDetent = voice === 'lois' ? verdictDetent(getLoisVerdictParts()) : 0;
  const armed = armedMode != null || armedMotion != null;
  // Precedence keeps the bar quiet: CUR > locks > V > L; over the cap, the
  // lowest-precedence lit accents go subdued. (KIN heat and the ◆ diamond
  // manage their own decay/silence in their components.)
  const lit = litPills({ cur: curDetent > 0, locks: lockCount > 0, voice: voiceOn, look: lookState !== 'none' });
  // An accent that is lit but lost the precedence cut renders subdued.
  const subdued = (key, isLit) => (isLit && !lit.has(key) ? 'true' : undefined);

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

  // #1122 — the lock pill: its own bordered pill now (mockup ■ slot; BEAT owns
  // "b" in the app). A real button only when armed (tap to disarm); otherwise
  // a quiet status readout.
  const lockPillInner = (
    <>
      <span className={`tb-locksq${lockCount > 0 ? ' fill' : ''}`} aria-hidden="true" />
      {lockCount > 0 && <span className="tb-micro">{lockCount}</span>}
      {armed && <span className="tb-nub" aria-hidden="true" />}
    </>
  );
  const lockTitle = armed
    ? 'roll scope armed — tap to disarm'
    : lockCount > 0 ? `${lockCount} locked param${lockCount === 1 ? '' : 's'}` : 'no locked params';
  return (
    <div className="curator-left-group kc-topbar-curator">
        {/* #946 — START mode toggle: what a cold launch opens on. Sits left of KIN: [logo] [START] [KIN].
            The ::before square is the ■ marker — accent-filled in CHAOS. */}
        <button
          type="button"
          className="tb-pill start-mode-btn act"
          data-mode={startupMode}
          onClick={() => setStartupMode(startupMode === 'chaos' ? 'fixed' : 'chaos')}
          title={
            startupMode === 'chaos'
              ? 'START: K.O.Z. (Kinetic Operation Zone) — every cold launch opens on one full wild roll. Click for a fixed, deterministic opener.'
              : 'START: FIXED — every cold launch opens on the factory default scene. Click for chaos.'
          }
          aria-label={`Start mode ${startupMode}. Activate to switch to ${startupMode === 'chaos' ? 'fixed' : 'chaos'}`}
        >
          <span className="tb-start-key">start: </span>{startupMode === 'chaos' ? 'k.o.z.' : 'fixed'}
        </button>
        <span className="tb-sep" aria-hidden="true" />
        {/* #942 — KINETIC: storm generator after the START toggle. */}
        <KineticButton />
        <div className="curator-voice-wrap" ref={presetWrapRef}>
          <button
            className="tb-pill curator-voice-btn xl act"
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
            {/* #1122 — L is structure → TE: hollow / solid-red / half-fill + look name */}
            <span className={`tb-looksq ${lookState}`} data-subdued={subdued('look', lookState !== 'none')} aria-hidden="true" />
            <ExpandLabel mode="swap" short={looksUsed ? 'lok' : 'l'} full="looks ▾" />
            {lookState !== 'none' && <span className="tb-micro">{lookName}</span>}
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
            className="tb-pill curator-voice-btn xl act"
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
            {/* #1122 — V is drift → Davis: the circle breathes at the persona's drift
                rate; hollow and dark when off */}
            <span className={`tb-voice${voiceOn ? ' on' : ''}${voiceLvl ? ` lvl${voiceLvl}` : ''}`} data-subdued={subdued('voice', voiceOn)}
              style={voiceOn ? { animationDuration: `${breathS.toFixed(1)}s` } : undefined} aria-hidden="true" />
            <ExpandLabel mode="swap" short={voiceUsed ? 'voi' : 'v'} full={`voice: ${activeAlias} ▾`} />
            {voiceOn && <span className="tb-micro">{voice}</span>}
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
        <button className={`tb-pill randomize-btn xl act${curShimmer ? ' xl-shimmer' : ''}`} onClick={onCurate}
          data-open={curTap.open || cold ? 'true' : undefined}
          {...curTap.props}
          aria-label="Curator — roll a taste-guided scene over the unlocked parameters"
          title={`${lockCount > 0 ? `${lockCount} locked · ` : ''}${hint}`}>
          {/* #1122 — CUR is verdict → TE: detent-step diamond + keep/favorite ledger.
              The ledger stays silent at 0/0 (silence is default); it appears with the first keep. */}
          <span className={`tb-curdia v${curDetent}`} data-subdued={subdued('cur', curDetent > 0)} aria-hidden="true" />
          <ExpandLabel short="cur" full="curator" />
          {(keepsCount > 0 || favoritesCount > 0) && (
            <span className="tb-micro" title={`${keepsCount} keeps / ${favoritesCount} favorites`}>{keepsCount}/{favoritesCount}</span>
          )}
        </button>
        <span className="tb-sep" aria-hidden="true" />
        {armed ? (
          <button
            type="button"
            className="tb-pill lock-pill act"
            data-subdued={subdued('locks', true)}
            title={lockTitle}
            aria-label="disarm roll scope"
            onClick={(e) => { e.stopPropagation(); clearRollScope(); }}
          >
            {lockPillInner}
          </button>
        ) : (
          <span className="tb-pill" data-subdued={subdued('locks', lockCount > 0)}
            title={lockTitle} role="img" aria-label={lockTitle}>
            {lockPillInner}
          </span>
        )}
        {/* #1103 — BEAT sits right of the locks: the verbs, then the clock they run on. [•B] opens to BEAT · 120. */}
        <BeatButton />
        {/* #1258 — the presence mark sits immediately right of BEATS. Never named: no title, no tooltip, no label. */}
        <SwayMark />
        {loisLine && (
          <span className="lois-verdict" title={hint}>{loisLine}</span>
        )}
    </div>
  );
}
