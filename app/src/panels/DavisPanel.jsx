import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { emit, on, Events } from '../composition/eventBus.js';
import { BehaveReadout } from './davis/BehaveReadout.jsx';
import { VoiceTiles } from './davis/VoiceTiles.jsx';
import { EvolveProgress } from './davis/EvolveProgress.jsx';
import { MidiSection } from './davis/MidiSection.jsx';
import { helpText } from '../data/helpCopy.js'; // #158: hover titles read the single map
import { captureFavorite } from '../state/slices/davisSlice.js';
import { LOIS_LINES } from './loisLines.mjs';
import { visibleQueue } from '../state/queueTransport.js';
import { DirectorsDuel } from './directors/DirectorsDuel.jsx';
import { CandidateTray } from './davis/CandidateTray.jsx';
import { KINEME_PATTERNS } from '../engine/kineme.js';
import { useStore } from '../state/store.js';
// #310: FavoritesList removed from the panel — the bottom tray is canonical.
// (FavoritesList.jsx stays in the tree, unreferenced.)

/** #305 — the four sub-seed streams, in the seed control area. */
const SUB_SEED_STREAMS = [
  { id: 'spatial', label: 'SPATIAL', hint: 'positions, density, attributes, swarm motion' },
  { id: 'color', label: 'COLOR', hint: 'palette slot assignment' },
  { id: 'asset', label: 'ASSET', hint: 'which asset each placement gets' },
  { id: 'noise', label: 'NOISE', hint: 'fBm displacement warp' },
];

export function DavisPanel() {
  const { state } = useApp(s => ({
    evolveMode: s.evolveMode,
    seed: s.seed,
    seedOffsets: s.seedOffsets,
    layoutParams: s.layoutParams,
    enabledAssets: s.enabledAssets,
    layers: s.layers, activeLayerId: s.activeLayerId, layerSnapshots: s.layerSnapshots, // #1131: a keep carries the stack
    phraseEnabled: s.phraseEnabled,
    phraseLength: s.phraseLength,
    phraseBeat: s.phraseBeat,
    phraseClock: s.phraseClock,
    beatBpm: s.beatBpm,
    morphing: s.morphing,
    audioEnabled: s.audioEnabled,
    audioBands: s.audioBands,
    hitCount: visibleQueue(s.favorites).length,
  }));
  const {
    evolveMode,
    seed, seedOffsets, layoutParams, enabledAssets, layers, activeLayerId, layerSnapshots,
    phraseEnabled, phraseLength, phraseBeat,
    phraseClock, beatBpm, morphing, audioEnabled,
    audioBands, hitCount,
  } = state;
  const { palette } = useApp();
  // #1355 AUTO SPAWN — the artist's creature count (a store field, set directly: a count, not a reduced param)
  const creatureCount = useStore((s) => s.creatureCount);

  // #719: the one keep capture — seed, offsets (#305), layout, palette, cast.
  const saveFavorite = () => emit(Events.DAVIS_FAVORITE, {
    action: 'add',
    favorite: captureFavorite({ seed, seedOffsets, layoutParams, enabledAssets, layers, activeLayerId, layerSnapshots }, palette.id),
  });

  const metro = phraseClock === 'metro';
  const rms = audioBands?.rms || 0;
  const noAttack = phraseEnabled && !metro && audioEnabled && phraseBeat === 0 && rms > 0.2;
  // Phase A gesture: local FREEZE toggle state (the hook resets on ACCUM
  // toggle, and this row unmounts with it, so the two stay in sync).
  const [accumFrozen, setAccumFrozen] = useState(false);
  // #617: a MIDI pad can hold FREEZE; keep the button honest about it
  useEffect(() => on(Events.ACCUM_GESTURE, (p) => { if (p && p.action === 'freeze') setAccumFrozen(!!p.value); }), []);
  const toggleFreeze = () => {
    const next = !accumFrozen;
    setAccumFrozen(next);
    emit(Events.ACCUM_GESTURE, { action: 'freeze', value: next });
  };
  const accumOn = !!layoutParams.accumulation;
  // UX-7: the gesture row stays mounted so ACCUM can be flipped from this
  // panel — but the live loop drops its own frozen flag when the ACCUM
  // session ends, so mirror that reset here or the button lies (THAW while
  // the loop is unfrozen: the two-press FREEZE trap, panel-side).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mirror of the loop's own reset
  useEffect(() => { if (!accumOn) setAccumFrozen(false); }, [accumOn]);

  // The header subtitle is unchanged (#616 only moved it out of the JSX). The
  // PERFORM readout is the phrase half of it, stated on its own.
  const phraseStatus = morphing ? 'morphing…'
    : phraseEnabled && metro ? `metro ${phraseBeat}/${phraseLength} @ BEAT ${beatBpm || 120}`
    : phraseEnabled && !audioEnabled ? 'armed · waiting for beat'
    : noAttack ? 'armed · no attack'
    : phraseEnabled ? `${phraseBeat}/${phraseLength}`
    : 'off';
  const subtitle = morphing ? 'morphing…'
    : phraseEnabled && metro ? `metro ${phraseBeat}/${phraseLength} @ BEAT ${beatBpm || 120}`
    : phraseEnabled && !audioEnabled ? 'phrase armed · waiting for beat'
    : noAttack ? 'armed · no attack'
    : phraseEnabled ? `phrase ${phraseBeat}/${phraseLength}`
    : evolveMode ? 'evolving'
    : 'paused';

  return (
    <div className="panel panel-davis">
      <PanelHeader tag="P07" title="DIRECTORS" subtitle={subtitle}>
        {/* #1355 AUTO SPAWN — how many creatures: a discrete count (the TE four). Each finds its own home in the middle of
            the dish, where it can live. 0 is the default: nothing spawns until it is raised. In the HEADER, not the body,
            so the panel's content height (it fits a 720 px window without a scroll) is untouched. */}
        <div className="header-tools" role="group" aria-label="creatures"
          title="How many moths live in the dish. Each finds its own home in the middle, where the ground is fertile and crowded.">
          <span className="lbl" aria-hidden="true">moths</span>
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} type="button" className={`chip-btn act${creatureCount === n ? ' active' : ''}`} aria-pressed={creatureCount === n}
              aria-label={n === 0 ? 'no creatures' : `${n} ${n === 1 ? 'creature' : 'creatures'}`} data-testid={`creatures-${n}`}
              onClick={() => emit(Events.CREATURE_COUNT, { n })}>
              {n}
            </button>
          ))}
        </div>
      </PanelHeader>
      <div className="davis-body">
          {/* #248 Phase 5 — MORPH EVOLVE and PHRASE LOOP moved to PLAY.
              The phrase- and morph-related state above stays selected here:
              this panel's own header subtitle still reports live phrase and
              morph status even though the controls that drive them now
              live in PLAY — cross-panel status at a glance, same as Phase 4
              left beatCollision's inputs selected here for PLAY to read. */}
          {/* #616 — the panel reads in three labelled sections. Nothing was
              removed or re-wired: same controls, same events, new headings. */}
          <div className="davis-section-label ttl">voices</div>
          {/* #717 — the flagship Voices' one home: load through the voice MIX. */}
          <VoiceTiles />
          <BehaveReadout layoutParams={layoutParams} />

          <div className="davis-label-row">
            <div className="davis-section-label ttl bare">generate</div>
            {/* #1507 — the mined tray's load control rides this existing
                label row (zero added height: the DIRECTORS panel has a
                no-scroll fit contract). The tray itself sits below
                Evolve and opens its picker on this event. */}
            <button type="button" className="micro-btn"
              title="Load a mined run folder (Look Explorer) — its finalists open below Evolve for crowning"
              onClick={() => emit(Events.EXPLORER_LOAD_RUN)}>
              load run
            </button>
          </div>
          {/* #1032 — voice 1: the unnamed-plate room. HITS carry no names, so this holds until the first keep. */}
          {hitCount === 0 && <div className="lois-line name">{LOIS_LINES.director}</div>}
          <div className="davis-actions davis-actions-3">
            <button className={`big-btn tribe-davis ${evolveMode ? 'active' : ''}`}
              onClick={() => emit(Events.DAVIS_EVOLVE, { toggle: true })}>
              {evolveMode ? 'STOP' : 'EVOLVE'}
            </button>
            <button className="big-btn act tribe-lois" onClick={saveFavorite}>favorite</button>
            <button className="big-btn act tribe-davis" onClick={() => emit(Events.DAVIS_EVOLVE, { bumpSeed: true })}>new seed</button>
          </div>

          {/* #305 — mutate one sub-seed stream. Same seed control area, no
              new panel: re-roll one stream's dice while the master seed and
              the other three streams stay locked. Highlighted = mutated. */}
          <div className="davis-actions" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}
            title="Sub-seed streams: re-roll one stream without touching the others">
            {SUB_SEED_STREAMS.map(({ id, label, hint }) => {
              const off = (seedOffsets?.[id] || 0) >>> 0;
              return (
                <button key={id} className={`micro-btn ${off ? 'active' : ''}`}
                  title={`${label} — ${hint}. Re-roll this stream's offset${off ? ` (now 0x${off.toString(16)})` : ' (locked to master seed)'}`}
                  onClick={() => emit(Events.DAVIS_MUTATE_STREAM, { group: id })}>
                  {label}
                </button>
              );
            })}
            <button className="micro-btn"
              title="Lock every stream back to the master seed (all offsets zero)"
              onClick={() => emit(Events.DAVIS_MUTATE_STREAM, { reset: true })}>
              ↺
            </button>
          </div>

          <EvolveProgress />

          {/* #1507 — the mined candidates' curation view: at rest it
              renders nothing (the panel's fit budget is spent on the
              performance surface); once a run loads from the GENERATE
              label row, its finalists render here for crowning. */}
          <CandidateTray />

          <div className="davis-section-label ttl">perform</div>
          <div className="davis-perform-row">
          <div className="davis-phrase-status" title="Phrase clock status. The controls live in PLAY; this panel only reports.">
            <i className="lbl">phrase</i><b>{phraseStatus}</b>
          </div>
          <MidiSection />
          </div>
          {/* UX-7: the gesture row is always reachable from Director — the
              ACCUM toggle lives here now, and FREEZE/CLEAR/SWELL wait on it
              (dim, never dead-looking) instead of the row vanishing. */}
          <div className="davis-section-label ttl">trails</div>
          <div className="davis-actions davis-actions-4" title="ACCUM gestures — play the trail buffer">
            <button className={`big-btn ${accumOn ? 'active' : ''}`}
              onClick={() => emit(Events.LAYOUT_PARAM, { key: 'accumulation', value: !accumOn })}
              title={helpText('layout-accum')}>
              ACCUM
            </button>
            <button className={`big-btn ${accumFrozen ? 'active' : ''}`}
              onClick={toggleFreeze}
              disabled={!accumOn}
              title={accumOn ? 'FREEZE: hold the trails mid-air — no fade, no new marks' : 'Waiting for ACCUM — turn ACCUM on to freeze the trails'}>
              {accumFrozen ? 'THAW' : 'FREEZE'}
            </button>
            <button className="big-btn"
              onClick={() => emit(Events.ACCUM_GESTURE, { action: 'clear' })}
              disabled={!accumOn}
              title={accumOn ? helpText('davis-clear') : 'Waiting for ACCUM — turn ACCUM on to clear the trails'}>
              CLEAR
            </button>
            <button className="big-btn"
              onClick={() => emit(Events.ACCUM_GESTURE, { action: 'swell' })}
              disabled={!accumOn}
              title={accumOn ? 'SWELL: breathe the trail length out and back over ~2 seconds' : 'Waiting for ACCUM — turn ACCUM on to swell the trails'}>
              SWELL
            </button>
          </div>

          {/* #1128 — the DIRECTOR's motion pattern: which way the always-on breath and drift lean. A discrete choice, so it
              renders TE (rule 2). THUMP needs a real beat; without audio it plays DRIFT, and says so.
              #1198 — ORGANIC/CADENCE switch on the rhythm placement layer (Perlin/sine over spacing, scale, rotation),
              even with every motion amount at 0. */}
          <div className="davis-actions davis-actions-motion" role="group" aria-label="motion pattern">
            <i className="lbl" title="THUMP follows a live audio beat; with none it plays DRIFT">{(layoutParams.kinemePattern === 'THUMP' && !audioEnabled) ? 'no beat' : 'motion'}</i>
            {KINEME_PATTERNS.map((p) => {
              const on = (layoutParams.kinemePattern || 'DRIFT') === p;
              return (
                <button key={p} className={`big-btn ${on ? 'active' : ''}`} aria-pressed={on} aria-label={`${p} pattern`}
                  title={p === 'DRIFT' ? 'DRIFT: the floor — marks breathe and drift as set'
                    : p === 'SWELL' ? 'SWELL: breath leads, drift steps back'
                    : p === 'ORGANIC' ? 'ORGANIC: Perlin-field rhythm over spacing, scale and rotation'
                    : p === 'CADENCE' ? 'CADENCE: sine-wave rhythm over spacing, scale and rotation'
                    : `THUMP: marks pulse on the beat${audioEnabled ? '' : ' — needs audio on; plays DRIFT until then'}`}
                  onClick={() => emit(Events.LAYOUT_PARAM, { key: 'kinemePattern', value: p })}>
                  {p}
                </button>
              );
            })}
          </div>

          {/* #1126 — the two Directors, at the foot of the panel (Matt): readout only, what the honest feed says each is doing */}
          <div className="davis-section-label ttl">the room</div>
          <DirectorsDuel />
      </div>
    </div>
  );
}
