import { DEFAULT_LAYOUT_PARAMS, validateLayoutParams, BLEND_MODES } from '../../data/layout-modes.js';
import { createGrid, stepGrid } from '../../engine/ca-engine.js';
import {
  pushToUndo,
  captureUndoEntry,
  entryApplies,
  editRestoreFields,
  layersRestoreFields,
  shelfRestoreFields,
  trimUndoStack,
  UNDO_KIND_LAYERS,
  UNDO_KIND_SHELF,
} from '../history.js';
import { KEEPS_KEY, STAGE_KEY, SHELF_HISTORY_KEY, DISK_KEY } from './davisSlice.js';
import { RANDOMIZABLE_KEYS, randomizeKey } from '../paramUtils.js';
import { CURATE_CANDIDATES, getActiveCurator, pickCurated } from '../../curator/curate.js';
import { hasChain, markovPick } from '../../curator/transitions.js';
import { getCatalogPalette, normalizeHex, resolvePalette, paletteRollPoolIds } from '../../data/palettes.js';
import { COMPOSITION_PRESETS } from '../../data/presets.js';
import { isFxLayer, FX_MENU_KINDS } from '../../fx/fxFilters.js';
import { rollFxKinds, rollFxParams, rollBlend } from '../../fx/rollSafety.js';
import { isMathLayer } from '../../fx/mathFilters.js';
import { buildHarmony, applyWithLocks } from '../../engine/harmony.js';
import {
  SEED_OFFSET_GROUPS,
  CH,
  defaultSeedOffsets,
  normalizeSeedOffsets,
  rngForIndex,
} from '../../engine/kernel/rng.js';
import { sanitizeMixSeconds } from '../../gl/paletteMix.mjs';
import { BEAT_DEFAULT_BPM, sanitizeBeatBpm, beatSeconds, beatIsHardCut } from '../../gl/beatClock.mjs';
import { MOTION_KEYS, armedMotionParams, pinRollScope } from '../rollScope.mjs';
import { fieldFormForDeal } from '../../poets/fieldForm.js'; // #1904 — FIELD: the shuffle deals a poet
import { FEEL_PRESETS } from '../../data/feels.js';
import {
  resolveVoiceState,
  captureLiveVoiceState,
  STUB_VOICES,
  MOTION_MODES,
  SHAPE_SETS,
  SHAPE_MIX_MAX,
  MIXABLE_SHAPE_IDS,
  liveShapeLevels,
  shapeMixIds,
} from '../../data/voices.js';
import { ASSETS } from '../../data/assets/index.js';
import { dealableRecords, dealMixedPool, poolToEnabled } from '../rollPool.mjs'; // #1767: the full-library deal
import { lookPass, voicePass, curatorPass } from '../kineticSweep.mjs'; // #1772: look → voice → curator
import { scopeDecks, sanitizeScope, CURATED_SETS, SCOPE_CYCLE } from '../kineticScope.mjs'; // #1772: the START pill is the ceiling
import { dealLanding, chapterScopeDeck, effectiveChapterScope } from '../chapterWalk.mjs'; // #1855: the landing
import { openRound, openJudgement, passCut, spendCut, settle, absorbWarmTap, closeRound } from '../roundTable.mjs'; // #1856: the round (BOOK S3)
import { judgeDeal } from '../../curator/loisCut.mjs'; // #1856: LOIS judges the round's deal
import { openNarrowing, narrow, poolFor } from '../chapterNarrow.mjs'; // #1857: the funnel (BOOK S4)
import { chapterById, chapterLooks } from '../../data/chapters.js'; // #1855: the Book's registry (S1)
import { sanitizeLight, LIGHT_DEFAULT } from '../../data/light.js';
import { loopClock } from '../../gl/loopClock.js';
import { isTapeFull } from '../tapeBudget.js';
import { rollPatternLayers } from '../../pattern/patternRoll.js'; // PATTERN is part of the KIN and CURATOR systems
import { getDirector } from '../../curator/director.js'; // #1145: the room scales the candidate count
import { getPhase, PHASE_REFINE } from '../../curator/phase.js'; // #1144: refine mutates around what landed
import { mutateKey, DEFAULT_SPREAD } from '../../curator/refineMutate.js';
import { swayMagnitude, setSwayMagnitude } from '../../curator/swayView.mjs'; // #1258: publish sway for the presence mark (ephemeral, not store state)
import { loisActivity } from '../../curator/loisActivity.js'; // #1145: the honest feed
import { mkRng } from '../../engine/prng.js';
import { colorDeal, nudgeSwatches, anchorValid } from '../../curator/refineColor.js'; // #1365 Q2

/**
 * #1365 Q2 — an artist's edit builds on the live overrides minus refine's carried `weights`: the weights describe the
 * kept palette's colours, and an edit changes a colour, so they no longer do (#1049: derive them instead).
 */
const editableOverrides = (ov) => {
  if (!ov) return {};
  const { weights, ...rest } = ov; // eslint-disable-line no-unused-vars
  return rest;
};

/** One honest die for #942's naive roll — every result lands in serialized state. */
const die = (n) => (Math.random() * n) | 0;
/** #1772 — a look pass under the START pill's ceiling (kineticScope.mjs): its look deck and its pool kind. */
function scopedLook(state) {
  const d = scopeDecks(state.startupMode);
  return lookPass(state, dieRng, {
    looks: d.looks,
    pool: d.pool,
    sets: CURATED_SETS,
    records: dealableRecords(ASSETS, state.customAssets),
  });
}

/**
 * #1855 — a COLD look pass lands in a chapter first (BOOK S2): the walk deals the landing (novelty-weighted,
 * state/chapterWalk.mjs), then the look pass deals inside the landed chapter's deck ∩ the scope deck, at the
 * nearest scope where the chapter has a deck. Returns the pass result plus the landing record and the
 * session's updated coverage ledger, so the action writes them in the same single undo step as the deal.
 */
function scopedChapterLook(state) {
  const records = dealableRecords(ASSETS, state.customAssets);
  const walk = dealLanding(dieRng, { fromId: state.kineticChapterId, visits: state.kineticChapterVisits });
  const eff = effectiveChapterScope(walk.chapterId, state.startupMode, { records });
  const d = chapterScopeDeck(walk.chapterId, eff.scope, { records });
  const r = lookPass(state, dieRng, { looks: d.looks, pool: d.poolKind, sets: d.sets, records: d.records });
  const visits = {
    ...(state.kineticChapterVisits || {}),
    [walk.chapterId]: ((state.kineticChapterVisits || {})[walk.chapterId] || 0) + 1,
  };
  const landing = {
    chapterId: walk.chapterId,
    name: chapterById(walk.chapterId)?.name ?? walk.chapterId,
    path: walk.path,
    scope: sanitizeScope(state.startupMode),
    dealtScope: eff.scope,
    redealt: eff.redealt,
    seq: (state.kineticLanding?.seq || 0) + 1,
  };
  return { r, landing, visits };
}

/**
 * #1855 — the voice deck for a warm pass: the standing chapter's voices ∩ the scope deck (at the scope the
 * chapter's deals are made), or the plain scope deck when no chapter stands (a voice pass before any cold
 * flip, or after CHAOS / a launch opener left the book).
 */
function scopedChapterVoices(state) {
  if (!state.kineticChapterId) return scopeDecks(state.startupMode).voices;
  const records = dealableRecords(ASSETS, state.customAssets);
  const eff = effectiveChapterScope(state.kineticChapterId, state.startupMode, { records });
  return chapterScopeDeck(state.kineticChapterId, eff.scope, { records }).voices;
}

/** #1856 — close the standing round on its honest exit (a fresh flip, the CHAOS escape, the launch opener). */
function closeStandingRound(state, via) {
  const round = state.kineticRound;
  return round && round.phase !== 'closed' ? closeRound(round, via) : round;
}

/**
 * #1856 — the round at the voice-pass commit (BOOK S3): the deal is complete (look + voice, chapter-scoped),
 * so the table sits inside this one store update — open, LOIS's slot, her spend or her pass, and (D4, Matt
 * 2026-10-31) the automatic settle the moment the hand stands. Returns { kineticRound, layoutParams?,
 * enabledAssets?, cut } — the extra fields only when her kill redealt the hand, so the stage shows the
 * hand the record claims.
 *
 * D2 (Matt 2026-10-31) lives here, in the executor: kill only — the redeal is the sweep's own lookPass over
 * the chapter deck minus the killed look, at the scope the deal was made (walking S2's scope cycle wider
 * only when that smaller pool is empty there, and recording the scope actually used). The judge reads the
 * dealt look's own params against the deck's params (loisCut's battery form); when the standing composition
 * is not a deck member — an armed MODE or a locked composition held a foreign look — it reads the completed
 * deal's landed params against the same pile. Honesty guard: a cut whose executor cannot produce a
 * different hand (an empty smaller pool, a redeal held to the killed look) is not spent — the slot closes
 * as a pass rather than log a kill that changed nothing. A voice pass landing while an unclosed round
 * already stands is a warm tap on that round: absorbed, the record untouched.
 */
function runRound(state, r) {
  const standing = state.kineticRound;
  if (standing && standing.phase !== 'closed') return { kineticRound: absorbWarmTap(standing), cut: false };
  const landing = state.kineticLanding;
  if (!landing?.chapterId) return { kineticRound: standing ?? null, cut: false };
  const records = dealableRecords(ASSETS, state.customAssets);
  const deck = chapterScopeDeck(landing.chapterId, landing.dealtScope, { records });
  const lookId = state.layoutParams?.composition ?? null;
  const dealtLook = deck.looks.find((l) => l.id === lookId) || null;
  const deal = {
    chapterId: landing.chapterId,
    lookId,
    voiceId: r.voiceId,
    dealtScope: landing.dealtScope,
    redealt: landing.redealt,
    pool: deck.looks.map((l) => l.id),
  };
  let round = openJudgement(openRound({ seq: landing.seq, chapterId: landing.chapterId, deal }));
  const verdict = judgeDeal(
    dealtLook ? dealtLook.params : r.layoutParams,
    deck.looks.map((l) => l.params),
  );
  if (verdict.cut) {
    let scope = landing.dealtScope;
    let scopeDeck = deck;
    let pool = deck.looks.filter((l) => l.id !== lookId);
    for (let i = SCOPE_CYCLE.indexOf(scope) + 1; pool.length === 0 && i < SCOPE_CYCLE.length; i++) {
      scope = SCOPE_CYCLE[i];
      scopeDeck = chapterScopeDeck(landing.chapterId, scope, { records });
      pool = scopeDeck.looks.filter((l) => l.id !== lookId);
    }
    const redeal = pool.length
      ? lookPass({ ...state, layoutParams: r.layoutParams }, dieRng, {
          looks: pool,
          pool: scopeDeck.poolKind,
          sets: scopeDeck.sets,
          records: scopeDeck.records,
        })
      : null;
    if (redeal && redeal.lookId && redeal.lookId !== lookId) {
      const after = {
        chapterId: landing.chapterId,
        lookId: redeal.lookId,
        voiceId: r.voiceId,
        dealtScope: scope,
        redealt: true,
        pool: pool.map((l) => l.id),
      };
      round = settle(
        spendCut(round, {
          verdict: {
            reason: verdict.reason,
            gate: verdict.gate.key,
            value: verdict.gate.value,
            limit: verdict.gate.limit,
          },
          deal: after,
        }),
      );
      return {
        kineticRound: round,
        layoutParams: redeal.layoutParams,
        enabledAssets: Object.keys(redeal.enabledAssets).length ? redeal.enabledAssets : null,
        cut: !!round.cut,
      };
    }
    // the executor could not produce a different hand: the cut is not spent (see the honesty guard above)
  }
  return { kineticRound: settle(passCut(round)), cut: false };
}

/** The same honest die as a [0,1) stream, for the pure dealers (#1767) — replay comes from the stored result (#710). */
const dieRng = () => die(0x40000000) / 0x40000000;

/**
 * #1857 — the narrowing a round's settle opens: the funnel standing at notch 0 (the chapter pool),
 * anchored on the look the round settled with. Null when the settled look is not a chapter member —
 * the dealt look always is (it was dealt from the chapter deck), so null is the honest impossible,
 * never a funnel anchored on air.
 */
function notchForRound(round) {
  if (!round || !round.settled || round.phase !== 'settled') return null;
  return openNarrowing(round.chapterId, round.deal?.lookId);
}

/**
 * #1857 — the settled board's funnel for one CURATOR press (D3, Matt 2026-10-31): the standing
 * narrowing advanced one notch (the machine refuses at the floor and returns the same state — the
 * press then rolls inside the floor pool), and the look records the press's candidates may be based
 * on: poolFor intersected with the chapter deck at the scope the round's deal was made, the same
 * deck runRound dealt from — S2's scope honesty composes, it is not re-derived. A stored narrowing
 * that does not match the standing round (chapter or anchor moved) is re-opened from the round
 * rather than trusted. Null when no settled board stands — the press is then today's whole-book
 * roll, unchanged — or when the anchor is not a chapter member (see notchForRound).
 */
function settledFunnel(state) {
  const round = state.kineticRound;
  if (!round || !round.settled || round.phase !== 'settled') return null;
  const standing = state.kineticNotch;
  const base =
    standing && standing.chapterId === round.chapterId && standing.anchorLookId === round.deal?.lookId
      ? standing
      : openNarrowing(round.chapterId, round.deal?.lookId);
  if (!base) return null;
  const records = dealableRecords(ASSETS, state.customAssets);
  const deck = chapterScopeDeck(round.chapterId, round.deal.dealtScope, { records });
  const advanced = narrow(base);
  const ids = poolFor(
    advanced,
    deck.looks.map((l) => l.id),
  );
  if (!ids.length) return null;
  const idSet = new Set(ids);
  return { notch: advanced, looks: chapterLooks(round.chapterId).filter((l) => idSet.has(l.id)) };
}

/** Pick a random id from `ids`, preferring one that differs from `current`. */
function pickOtherId(ids, current) {
  if (!ids.length) return current;
  if (ids.length === 1) return ids[0];
  let next = current;
  for (let i = 0; i < 8 && next === current; i++) next = ids[die(ids.length)];
  return next;
}

/** Pick a random composition preset, preferring a different composition id. */
function pickOtherPreset(presets, currentComposition) {
  const ids = presets.map((p) => p.id);
  const id = pickOtherId(ids, currentComposition);
  return presets.find((p) => p.id === id) || presets[0];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = die(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr) {
  return arr[die(arr.length)];
}

/**
 * Open a MIX toward `merged` layout params (#284 morph-don't-cut). Live state
 * stays untouched until commitVoiceMix lands it in one undo step. Shared by
 * applyPreset and loadStubMode (#517).
 */
function openParamsMix(state, merged, { name }) {
  // Layout chips are single-axis: they morph layout params only. The current
  // palette and asset pool ride along untouched (`to.paletteId === null` makes
  // commitVoiceMix leave color state alone), so a layout chip can never swap
  // shapes or colors mid-blend. Color and shape chips are their own axes.
  const paletteSrc = resolvePalette(state.paletteId, state.paletteOverrides, state.userPalettes);
  const enabled = state.enabledAssets || {};
  const ids = Object.keys(enabled);
  const allOn = ids.length > 0 && ids.every((id) => !!enabled[id]);
  const to = {
    ...resolveVoiceState({
      params: merged,
      palette: paletteSrc,
      assets: allOn ? 'all' : { ...enabled },
      blendSeconds: 2,
    }),
    paletteId: null,
  };
  return {
    voiceMix: {
      from: captureLiveVoiceState(state),
      to,
      t: 0,
      durationMs: Math.max(200, (to.blendSeconds || 2) * 1000),
      auto: true,
      // #806: MIX dissolve is a must-loop performer — stamp in loop ms
      // (useVoiceMixDriver reads loopClock.ms), never wall clock.
      startedAt: loopClock.ms,
      targetVoiceId: null,
      targetName: name,
    },
  };
}

// #1590: a shelf undo/redo restores the shelf's three storage keys
// alongside the state (davisSlice owns the keys; its persist helpers
// are slice-local, so the restore writes them here, same JSON shape).
function persistShelfRestore(shelfBack) {
  try {
    localStorage.setItem(KEEPS_KEY, JSON.stringify(shelfBack.keeps || []));
    localStorage.setItem(STAGE_KEY, JSON.stringify(shelfBack.keepStage || []));
    localStorage.setItem(SHELF_HISTORY_KEY, JSON.stringify(shelfBack.shelfHistory || []));
    // #1591 — the disk index follows the shelf restore, so an undo
    // that returns a record to the disk tier reads consistently
    // after a reload too.
    if (shelfBack.shelfDiskStubs !== undefined) {
      localStorage.setItem(
        DISK_KEY,
        JSON.stringify({
          v: 1,
          root: shelfBack.shelfDiskRoot ?? null,
          stubs: shelfBack.shelfDiskStubs,
        }),
      );
    }
  } catch {
    /* storage full/blocked — state still restores */
  }
}

export const createLayoutSlice = (set) => ({
  seed: 0xa17e9b21,
  /**
   * Sub-seed stream offsets (#305): { spatial, color, asset, noise }, each a
   * uint32 delta mixed into its stream's channel hash. A performer re-rolls
   * one stream while the master seed's other channels stay locked. Zero is
   * the identity — saved and restored exactly like the seed itself.
   */
  seedOffsets: defaultSeedOffsets(),
  /** CURATE press counter (#518) — session-only, never serialized. */
  curatePress: 0,
  /** #1772 — the deck voice the last KINETIC voice pass dealt (so the next deals a different one). Session-only. */
  kineticVoiceId: null,
  /** #1855 — the chapter the last cold KINETIC flip landed in (BOOK S2). Session-only, never serialized. */
  kineticChapterId: null,
  /**
   * #1855 — the session coverage ledger: chapter id → landings this session. The walk's novelty term reads
   * it (state/chapterWalk.mjs); backstage-inspectable like every honest record. Session-only, never serialized.
   */
  kineticChapterVisits: {},
  /**
   * #1855 — the last landing, backstage and honest: { chapterId, name, path, scope, dealtScope, redealt, seq }.
   * `scope` is the performer's START state; `dealtScope` is where the deal was actually made — `redealt`
   * says they differ (the chapter had no deck at the performer's scope). Session-only, never serialized.
   */
  kineticLanding: null,
  /**
   * #1856 — the standing round (BOOK S3): the roundTable record { seq, chapterId, phase, deal, cut, settled,
   * log } — opened at the voice-pass commit and settled in the same update (D4); closed by the next fresh
   * flip, CHAOS roll or launch opener. S4's CURATOR pass reads this settled board. Session-only, never serialized.
   */
  kineticRound: null,
  /**
   * #1857 — the standing narrowing (BOOK S4): the chapterNarrow state of the settled board — opened
   * fresh at notch 0 when a round settles, advanced one notch per settled CURATOR press (D3, Matt
   * 2026-10-31), and cleared when the board ends: a fresh flip, a CHAOS roll or the launch opener
   * (widening is implicit in the exits — there is no widen gesture). S5 reads this record; its
   * shape is chapterNarrow's, not this file's. Session-only, never serialized.
   */
  kineticNotch: null,
  /**
   * #1772 — the last KINETIC curator pass, backstage and honest: { curator, index, moves: [{ key, from, to }] }.
   * `moves: []` means the curator passed (kept the piece as it stood). Session-only, never serialized.
   */
  kineticNudge: null,
  // #592 — did the last CURATE press fall back to an unconditioned roll?
  curateChainFallback: false,
  paletteId: 'praystation',
  /** null | { swatches?: string[], bg?: string, ink?: string } — never mutates catalog */
  paletteOverrides: null,
  /** Swatch slots the operator pinned; harmony/shuffle leave these alone (#56). */
  paletteLocks: {},
  /**
   * #1365 — has the ARTIST picked or edited the palette (strip/wing chip, swatch, bg/ink, harmony, reset)? Set only on
   * the artist's dispatch path, never by CURATOR or a voice. While true, a CURATOR press leaves the palette alone even
   * in explore. Cleared when a KINETIC roll or a project load replaces the palette. Session state: not saved, not undone.
   */
  paletteChosen: false,
  /**
   * #1365 Q2 — the palette refine varies colour around: { paletteId, overrides, keepCount, lastOverrides } or null.
   * Session state: not saved. Re-anchored whenever something other than refine changed the palette, or a keep landed.
   */
  refinePaletteAnchor: null,
  layoutParams: { ...DEFAULT_LAYOUT_PARAMS },
  lockedParams: {},
  /**
   * Render-only overlay for the performance governor's last-resort density
   * cut (#107 §5): null, or a partial { count?, mirror? } merged over
   * layoutParams for display, never touching undo or autosave. The
   * governor used to call setLayoutParam('count', ...) directly, which
   * permanently shrank the authored value — so a "FINAL · UNCAPPED" export
   * restoring "what count was before the render" restored the *degraded*
   * number, not what the operator actually set. Keeping this out of
   * layoutParams means every snapshot/export path keeps reading the true
   * authored count regardless of what the live canvas is drawing.
   */
  perfClampOverride: null,
  /** #594 — the ONE scene sun (never per layer, never a list). null = off. */
  light: null,
  motionSmoothing: true,
  /**
   * VJ MIX (#278): palette-switch crossfade duration in seconds, 0–8.
   * 0 = hard cut (the old behavior). A feel preference like
   * motionSmoothing — deliberately outside the project document.
   */
  paletteMixSeconds: 2,
  /**
   * BEAT master clock (#950): the top-bar BEAT button's BPM. The transition
   * clock derives from it — morphs are 2 beats (120 BPM → 1s). The setter
   * writes paletteMixSeconds too, so every existing consumer (liveLoop)
   * follows the master clock through the same channel; the
   * glitch ceiling maps sub-0.75s beat times to 0 (hard cut), which the
   * engine already honors as "cut".
   */
  beatBpm: BEAT_DEFAULT_BPM,
  /** #1144 — the metro pulse: the dialed BPM as a real beatPulse when audio is off. On by default (Matt, 2026-10-11):
   *  a quiet room still breathes at the dialed tempo. The artist's own switch turns it off; audio on always wins. */
  beatMetro: true,
  setBeatMetro: (on) => set({ beatMetro: !!on }),
  /**
   * Roll scope (#964): the ModeStrip MODE/MOTION chips arm a scope for the
   * next KINETIC roll instead of selecting outright. `armedMode` pins the
   * layout mode (and keeps the composition too); `armedMotion` pins the
   * motion numbers. Arms persist until disarmed — the fast,
   * performance-friendly version of the Build panel's locks.
   */
  armedMode: null,
  armedMotion: null,
  toggleArmMode: (id) => set((state) => ({ armedMode: state.armedMode === id ? null : id })),
  toggleArmMotion: (id) => set((state) => ({ armedMotion: state.armedMotion === id ? null : id })),
  clearRollScope: () => set({ armedMode: null, armedMotion: null }),
  /**
   * Sleight-of-hand v2 (#624, #625): how a palette change travels. FADE melts
   * the whole picture (two-deck dissolve); WASH soaks the new tints through
   * the marks on a center-out wavefront; INJECT dyes the field first and the
   * agents catch up. A feel preference like paletteMixSeconds —
   * deliberately outside the project document.
   */
  colorMode: 'FADE',
  shapeLevels: {}, // #733 shape mixer intensities { chipId: 1|2|3 } — live only while the pool matches (liveShapeLevels)
  caGrid: null,
  historyUndoStack: [],
  historyRedoStack: [],

  setSeed: (seed) => set((state) => ({ ...pushToUndo(state, true), seed })),
  bumpSeed: () =>
    set((state) => ({
      ...pushToUndo(state, true),
      seed: (state.seed ^ ((Math.random() * 0xffffffff) | 0)) >>> 0,
    })),
  /**
   * Re-roll one sub-seed stream (#305): the named stream gets a fresh random
   * offset while the master seed and the other three streams stay locked.
   * Undoable, like every other seed edit.
   */
  mutateSeedOffset: (group) =>
    set((state) => {
      if (!SEED_OFFSET_GROUPS.includes(group)) return {};
      return {
        ...pushToUndo(state, true),
        seedOffsets: {
          ...normalizeSeedOffsets(state.seedOffsets),
          [group]: ((Math.random() * 0xffffffff) | 0) >>> 0,
        },
      };
    }),
  /** Set one stream's offset explicitly (project load, recipe recall). */
  setSeedOffset: (group, value) =>
    set((state) => {
      if (!SEED_OFFSET_GROUPS.includes(group)) return {};
      const v = Number(value);
      if (!Number.isFinite(v)) return {};
      const cur = normalizeSeedOffsets(state.seedOffsets);
      if (v >>> 0 === cur[group]) return {};
      return {
        ...pushToUndo(state, true),
        seedOffsets: { ...cur, [group]: v >>> 0 },
      };
    }),
  /** Lock every stream back to the master seed (all offsets zero). */
  resetSeedOffsets: () =>
    set((state) => {
      const cur = normalizeSeedOffsets(state.seedOffsets);
      if (SEED_OFFSET_GROUPS.every((g) => cur[g] === 0)) return {};
      return { ...pushToUndo(state, true), seedOffsets: defaultSeedOffsets() };
    }),
  /** #1365 — the artist picked or edited the palette (called on the artist's dispatch path only). */
  markPaletteChosen: () => set((state) => (state.paletteChosen ? {} : { paletteChosen: true })),
  // Switching catalog id clears overrides (AC6)
  setPaletteId: (id) =>
    set((state) => ({
      ...pushToUndo(state, true),
      paletteId: id,
      voiceMix: null,
      activeVoiceId: null,
      paletteOverrides: null,
      /** Swatch slots the operator pinned; harmony/shuffle leave these alone (#56). */
      paletteLocks: {},
    })),

  setPaletteSwatch: (index, hex) =>
    set((state) => {
      const n = normalizeHex(hex);
      if (n == null) return {};
      const base = getCatalogPalette(state.paletteId, state.userPalettes);
      if (index < 0 || index >= base.swatches.length) return {};
      const prev = state.paletteOverrides?.swatches ? [...state.paletteOverrides.swatches] : [...base.swatches];
      // Ensure length
      while (prev.length < base.swatches.length) prev.push(base.swatches[prev.length]);
      prev[index] = n;
      // If identical to catalog, collapse that slot conceptually but keep array
      const nextOverrides = {
        ...editableOverrides(state.paletteOverrides),
        swatches: prev,
      };
      // Drop if fully matches catalog
      const matches =
        prev.every((s, i) => s === base.swatches[i]) &&
        (!nextOverrides.bg || nextOverrides.bg === base.bg) &&
        (!nextOverrides.ink || nextOverrides.ink === base.ink);
      return {
        ...pushToUndo(state, true),
        paletteOverrides: matches ? null : nextOverrides,
        voiceMix: null,
        activeVoiceId: null,
      };
    }),

  setPaletteBg: (hex) =>
    set((state) => {
      const n = normalizeHex(hex);
      if (n == null) return {};
      const base = getCatalogPalette(state.paletteId, state.userPalettes);
      const next = { ...editableOverrides(state.paletteOverrides), bg: n };
      if (n === base.bg) delete next.bg;
      const empty = !next.swatches && !next.bg && !next.ink;
      return {
        ...pushToUndo(state, true),
        paletteOverrides: empty ? null : next,
        voiceMix: null,
        activeVoiceId: null,
      };
    }),

  setPaletteInk: (hex) =>
    set((state) => {
      const n = normalizeHex(hex);
      if (n == null) return {};
      const base = getCatalogPalette(state.paletteId, state.userPalettes);
      const next = { ...editableOverrides(state.paletteOverrides), ink: n };
      if (n === base.ink) delete next.ink;
      const empty = !next.swatches && !next.bg && !next.ink;
      return {
        ...pushToUndo(state, true),
        paletteOverrides: empty ? null : next,
        voiceMix: null,
        activeVoiceId: null,
      };
    }),

  clearPaletteOverrides: () =>
    set((state) => {
      if (!state.paletteOverrides) return {};
      return { ...pushToUndo(state, true), paletteOverrides: null, voiceMix: null, activeVoiceId: null };
    }),

  setPaletteOverrides: (overrides) =>
    set((state) => ({
      ...pushToUndo(state, true),
      paletteOverrides: overrides,
      voiceMix: null,
      activeVoiceId: null,
    })),

  togglePaletteLock: (index) =>
    set((state) => ({
      paletteLocks: { ...state.paletteLocks, [index]: !state.paletteLocks[index] },
    })),

  clearPaletteLocks: () => set({ paletteLocks: {} }),

  /**
   * Regenerate unlocked swatches from a harmony scheme (#56).
   * Base colour is the first locked swatch if there is one — so locking a
   * colour you like and shuffling builds around it — else swatch 0.
   */
  applyHarmony: (scheme) =>
    set((state) => {
      const base = getCatalogPalette(state.paletteId, state.userPalettes);
      const current = base.swatches.map((sw, i) => state.paletteOverrides?.swatches?.[i] || sw);
      const lockedIdx = Object.keys(state.paletteLocks).find((k) => state.paletteLocks[k]);
      const anchor = current[lockedIdx != null ? Number(lockedIdx) : 0] || current[0];
      const generated = buildHarmony(anchor, scheme, current.length);
      const swatches = applyWithLocks(current, generated, state.paletteLocks);
      if (swatches.every((c, i) => c === current[i])) return {};
      return {
        ...pushToUndo(state, true),
        paletteOverrides: { ...editableOverrides(state.paletteOverrides), swatches },
      };
    }),

  setPerfClampOverride: (overlay) => set({ perfClampOverride: overlay }),

  // ── State firewall (#107 §1) ─────────────────────────────────────────────
  // Every layoutParams write in the app funnels through these two setters —
  // sliders, presets, randomize, the governor, morph lerps and evolve
  // targets. (Ambient drift used to be a seventh writer here; #107 §2 moved
  // it out to an overlay slot and #425 moved it into the layer resolver —
  // it is a pure function of each layer's own state now, with no store
  // slot left that could ever touch this state.)
  // Validating here rather than at each call site is both the smaller diff
  // and the one that cannot be forgotten by the next writer.
  //
  // Out-of-range but well-formed values clamp; structurally invalid ones
  // (NaN, null, wrong type, unknown mode) are rejected and the previous value
  // is kept. See validateLayoutParams for why those are treated differently.
  //
  // #280 — a manual edit during a voice MIX ends the mix and the voice chip
  // lets go: the performer's hands have it now. (commitVoiceMix writes the
  // keys directly, so landing a voice never trips this.)
  /**
   * #594 — turn the sun on/off or move it. `true` = on at the defaults (or where
   * it was), `false`/`null` = off, an object = patch. Undoable; a slider drag
   * coalesces through pushToUndo's debounce like any other param.
   */
  setLight: (patch) =>
    set((state) => {
      let next;
      if (patch === false || patch === null) next = null;
      else if (patch === true) next = sanitizeLight(state.light || LIGHT_DEFAULT);
      else next = sanitizeLight({ ...(state.light || LIGHT_DEFAULT), ...(patch || {}) });
      if (JSON.stringify(next) === JSON.stringify(state.light ?? null)) return {};
      return { ...pushToUndo(state), light: next };
    }),
  setLayoutParam: (key, value) =>
    set((state) => {
      if (state.layoutParams[key] === value) return {};
      const { params, rejected } = validateLayoutParams({ ...state.layoutParams, [key]: value });
      if (rejected.includes(key)) {
        // Keep previous state entirely: do not push an undo entry for a write
        // that did not happen, or Ctrl-Z stops lining up with what the operator
        // actually did.
        if (import.meta.env?.DEV) {
          console.warn(`[state] rejected setLayoutParam(${key}):`, value);
        }
        return {};
      }
      // A value that clamps to what is already there is not an edit. Without
      // this, holding a slider past its maximum pushes an undo entry per event
      // while the composition never changes, and Ctrl-Z then has to be pressed
      // twenty times to get anywhere.
      const cur = state.layoutParams[key];
      const nextVal = params[key];
      const unchanged =
        Array.isArray(nextVal) && Array.isArray(cur)
          ? nextVal.length === cur.length && nextVal.every((v, i) => Object.is(v, cur[i]))
          : Object.is(nextVal, cur);
      if (unchanged) return {};

      const undoUpdate = pushToUndo(state, false);
      const next = { ...undoUpdate, layoutParams: params, voiceMix: null, activeVoiceId: null };
      if (key === 'mode' && value === 'ca' && !state.caGrid) {
        next.caGrid = createGrid(40, 28, state.seed);
      }
      return next;
    }),

  /**
   * STIMULI FEEL (#615): set the 8 reactivity params to a Gentle / Punchy /
   * Violent macro in ONE undo step. Locked params are left alone (a lock is
   * the performer's taste), same as applyPreset. Unknown id is a no-op.
   */
  applyFeel: (id) =>
    set((state) => {
      const feel = FEEL_PRESETS.find((f) => f.id === id);
      if (!feel) return {};
      const merged = { ...state.layoutParams };
      let changed = false;
      for (const [k, v] of Object.entries(feel.params)) {
        if (!state.lockedParams[k] && !Object.is(merged[k], v)) {
          merged[k] = v;
          changed = true;
        }
      }
      if (!changed) return {};
      const { params, rejected } = validateLayoutParams(merged);
      if (rejected.length) return {};
      return { ...pushToUndo(state, true), layoutParams: params, voiceMix: null, activeVoiceId: null };
    }),

  setLayoutParams: (params) =>
    set((state) => {
      const { params: safe, rejected } = validateLayoutParams({ ...state.layoutParams, ...params });
      if (rejected.length === 0) return { layoutParams: safe, voiceMix: null, activeVoiceId: null };
      // Partial accept: a bad key in a machine-generated batch (a morph lerp
      // that produced NaN, an evolve target off the end of a range) must not
      // discard the good keys alongside it.
      const kept = { ...safe };
      for (const key of rejected) kept[key] = state.layoutParams[key];
      if (import.meta.env?.DEV) {
        console.warn('[state] rejected setLayoutParams keys:', rejected);
      }
      return { layoutParams: kept, voiceMix: null, activeVoiceId: null };
    }),

  setMotionSmoothing: (smoothing) => set({ motionSmoothing: smoothing }),
  /** VJ MIX (#278): palette-switch crossfade seconds, clamped 0–8. */
  setPaletteMixSeconds: (seconds) => set({ paletteMixSeconds: sanitizeMixSeconds(seconds) }),
  /**
   * BEAT master clock (#950): set the BPM. Drives paletteMixSeconds (the
   * transition clock) as 2 beats; past ~160 BPM the beat time falls through
   * the glitch ceiling and transitions hard-cut instead of morphing.
   */
  setBeatBpm: (bpm) => {
    const clean = sanitizeBeatBpm(bpm);
    const secs = beatSeconds(clean);
    set({
      beatBpm: clean,
      paletteMixSeconds: beatIsHardCut(secs) ? 0 : secs,
    });
  },
  /** Sleight-of-hand v2 (#624, #625): FADE | WASH | INJECT. Unknown values fall back to FADE. */
  setColorMode: (mode) =>
    set({
      colorMode: mode === 'WASH' || mode === 'INJECT' ? mode : 'FADE',
    }),
  stepCaGrid: () =>
    set((state) => ({
      caGrid: state.caGrid ? stepGrid(state.caGrid) : createGrid(40, 28, state.seed),
    })),
  resetCaGrid: () => set((state) => ({ caGrid: createGrid(40, 28, state.seed) })),

  applyPreset: (preset) =>
    set((state) => {
      const incoming = { ...preset.params, composition: preset.id };
      const merged = { ...state.layoutParams };
      // #964: LOOKS applies inside armed motion — a Look never stomps the
      // pinned motion numbers.
      const motionSkip = new Set(armedMotionParams(state.armedMotion) ? MOTION_KEYS : []);
      let changed = false;
      for (const [k, v] of Object.entries(incoming)) {
        if (motionSkip.has(k)) continue;
        if (!state.lockedParams[k] && merged[k] !== v) {
          merged[k] = v;
          changed = true;
        }
      }
      // Presets are layout-only: their palette / asset pairings (#284) are ignored
      // so color and shapes stay on their own chip axes.
      if (!changed && state.layoutParams.composition === preset.id) return {};
      return openParamsMix(state, merged, { name: preset.name || preset.id });
    }),

  /** #517 — a stub chip (a layout mode) rides the same MIX road as a preset. Layout axis only (#555): never touches motion, assets or palette. */
  loadStubMode: (id) =>
    set((state) => {
      const stub = STUB_VOICES.find((v) => v.id === id);
      if (!stub) return {};
      const merged = { ...state.layoutParams };
      let changed = false;
      for (const [k, v] of Object.entries({ mode: stub.id })) {
        if (!state.lockedParams[k] && merged[k] !== v) {
          merged[k] = v;
          changed = true;
        }
      }
      if (!changed) return {};
      return openParamsMix(state, merged, { name: stub.name });
    }),

  /** Motion axis (#555): a `behave` chip plus motion numbers, on the MIX road. Never touches layout, assets or palette. */
  loadMotion: (id) =>
    set((state) => {
      const motion = MOTION_MODES.find((m) => m.id === id);
      if (!motion) return {};
      const merged = { ...state.layoutParams };
      let changed = false;
      for (const [k, v] of Object.entries(motion.params)) {
        if (!state.lockedParams[k] && merged[k] !== v) {
          merged[k] = v;
          changed = true;
        }
      }
      if (!changed) return {};
      return openParamsMix(state, merged, { name: motion.name });
    }),

  /**
   * Shapes axis (#555): swap the asset pool to a curated set, once, at the press.
   * The live loop's item-morph pairs nodes across the two pools, so there is no
   * MIX and no end-of-blend pop. Never touches layout, motion or color.
   */
  loadShapeSet: (id) =>
    set((state) => {
      const def = SHAPE_SETS.find((x) => x.id === id);
      if (!def) return {};
      const known = new Set(ASSETS.map((a) => a.id));
      for (const c of state.customAssets || []) known.add(c.id);
      const map = {};
      for (const assetId of def.ids) if (known.has(assetId)) map[assetId] = true;
      if (!Object.keys(map).length) return {};
      const cur = state.enabledAssets || {};
      const curOn = Object.keys(cur).filter((k) => cur[k]);
      if (curOn.length === Object.keys(map).length && curOn.every((k) => map[k])) return {};
      return { ...pushToUndo(state, true), enabledAssets: map };
    }),

  /**
   * Tasteful dice — crown a finalist's cast. Same single-axis contract as
   * loadShapeSet: shapes only (the dice calls loadStubMode for the layout
   * axis separately), undoable, unknown ids refused, custom assets honored.
   */
  loadDiceCast: (assetIds) =>
    set((state) => {
      if (!Array.isArray(assetIds) || !assetIds.length) return {};
      const known = new Set(ASSETS.map((a) => a.id));
      for (const c of state.customAssets || []) known.add(c.id);
      const map = {};
      for (const assetId of assetIds) if (known.has(assetId)) map[assetId] = true;
      if (!Object.keys(map).length) return {};
      const cur = state.enabledAssets || {};
      const curOn = Object.keys(cur).filter((k) => cur[k]);
      if (curOn.length === Object.keys(map).length && curOn.every((k) => map[k])) return {};
      return { ...pushToUndo(state, true), enabledAssets: map };
    }),

  /**
   * Shape mixer (#733): tap a shape chip → off → 1 → 2 → 3 → off. Up to
   * SHAPE_MIX_MAX chips on; a fifth is refused (no-op, never evicts). The pool
   * becomes the union of the on-chips' sets and `shapeLevels` carries the
   * intensities the placer weights by. The last chip cannot go off — an empty
   * pool renders nothing — so at 3 it stays 3. Same single-axis contract as
   * loadShapeSet: shapes only, no MIX, never touches layout/motion/colour.
   */
  cycleShapeLevel: (id) =>
    set((state) => {
      if (!MIXABLE_SHAPE_IDS.includes(id)) return {};
      const cur = liveShapeLevels(state.shapeLevels, state.enabledAssets);
      const at = cur[id] || 0;
      const on = Object.keys(cur).filter((k) => cur[k] > 0).length;
      if (at === 0 && on >= SHAPE_MIX_MAX) return {}; // the refusal is the visible constraint
      const next = { ...cur };
      const level = (at + 1) % 4;
      if (level === 0) delete next[id];
      else next[id] = level;
      if (!Object.keys(next).length) return {}; // never empty the pool
      const known = new Set(ASSETS.map((a) => a.id));
      for (const c of state.customAssets || []) known.add(c.id);
      const map = {};
      for (const assetId of shapeMixIds(next)) if (known.has(assetId)) map[assetId] = true;
      if (!Object.keys(map).length) return {};
      return { ...pushToUndo(state, true), enabledAssets: map, shapeLevels: next };
    }),

  toggleParamLock: (key) =>
    set((state) => ({
      lockedParams: { ...state.lockedParams, [key]: !state.lockedParams[key] },
    })),

  randomizeParam: (key) =>
    set((state) => {
      const rolled = randomizeKey(key);
      if (rolled === undefined) return {}; // not a randomizable key: refuse, like every other door
      // #1550: the roll lands through the same validating door as every
      // other write — clamped to the document spec and pair-migrated by
      // validateLayoutParams, never written raw. (Before this, a density
      // of 101–120 — legal dice output, illegal document value — sat in
      // layoutParams until some later validated write happened to heal it.)
      const { params } = validateLayoutParams({ [key]: rolled });
      return {
        ...pushToUndo(state, true),
        layoutParams: { ...state.layoutParams, [key]: params[key] },
        voiceMix: null,
        activeVoiceId: null,
      };
    }),

  randomizeUnlocked: () =>
    set((state) => {
      const rp = { ...state.layoutParams };
      let changed = false;
      for (const key of RANDOMIZABLE_KEYS) {
        if (!state.lockedParams[key]) {
          rp[key] = randomizeKey(key);
          changed = true;
        }
      }
      if (!changed) return {};
      // #1550: same law as randomizeParam — the batch lands normalized.
      const { params } = validateLayoutParams(rp);
      return { ...pushToUndo(state, true), layoutParams: params, voiceMix: null, activeVoiceId: null };
    }),

  curateUnlocked: () =>
    set((state) => {
      // The Curator: roll CURATE_CANDIDATES scenes over the unlocked params and
      // keep the engine's pick. No trained engine on file yet -> honest dice
      // roll; the bar says so (see curator/curate.js). Locked params are never
      // touched, same as randomizeUnlocked.
      const curator = getActiveCurator();
      const unlocked = RANDOMIZABLE_KEYS.filter((key) => !state.lockedParams[key]);
      // Everything locked: no-op — no candidate differs from current state, so
      // push no undo entry (same guard as randomizeUnlocked).
      if (unlocked.length === 0) return {};
      // #1857 — D3 (Matt 2026-10-31): the board says which job this press does. On a SETTLED board
      // the press narrows: the funnel advances one notch and the candidates are dealt from inside
      // the narrowed pool (settledFunnel). On any other board the press is today's whole-book roll,
      // exactly as before. The funnel state advances even when the candidates cannot be re-based —
      // REFINE (it mutates the standing piece, whose composition is the anchor, a member of every
      // pool by construction) or a HELD look (a MODE armed, or the composition locked: the same hold
      // lookPass honours — a lock is never stomped) — because the funnel describes the board, and
      // the next free press deals from where it stands.
      const funnel = settledFunnel(state);
      const held = !!state.armedMode || !!state.lockedParams?.composition;
      // #518: every roll comes off one seeded stream keyed by (seed, press #), so
      // presses differ but a given (seed, offsets, press #) replays the same pick.
      const press = state.curatePress | 0;
      const rng = rngForIndex(state.seed, CH.curate, press, state.seedOffsets);
      const candidates = [];
      // #1145 — Davis's primaries: the room's kin_weight scales how many
      // candidates each CURATOR press rolls (unleashed rooms roll more,
      // settled rooms roll fewer). Silence → 1 → yesterday's 8. Deterministic
      // given the same room; a different room is a different deal.
      const tickResult = getDirector().tick({ feed: loisActivity.snapshot() });
      const kinWeight = tickResult.gains.kinWeight;
      const candidateCount = Math.max(2, Math.min(16, Math.round(CURATE_CANDIDATES * kinWeight)));
      // #592 — the discrete choices are drawn from a transition chain
      // conditioned on the value that LAST LANDED (the live layoutParams), so
      // presses relate to each other instead of being strangers. Everything
      // else still rolls uniform. Same rng, so the whole press stays one
      // seeded stream and (seed, offsets, press #) still replays exactly.
      let chainFellBack = false;
      // #1144 — REFINE: the artist just kept something and is settling it, so the pool is local mutations of the
      // live values (spread 0.10, locked by Matt 2026-10-11), not fresh dice. Only keys the dice already rolls move; composition
      // and the modifiers are never touched, so a landing cannot leave refine by changing the room. Explore and no
      // phase (null) keep yesterday's whole-range roll exactly.
      const refining = getPhase() === PHASE_REFINE;
      const refineSpread = refining ? DEFAULT_SPREAD : 0;
      for (let n = 0; n < candidateCount; n++) {
        const rp = { ...state.layoutParams };
        // #1857 — settled, exploring, look not held: the candidate is BASED on a look inside the
        // narrowed pool, drawn off the press's own seeded stream. The base deals the composition
        // (membership of a dealt candidate IS its composition — chapterNarrow) and the params the
        // look declares, locked keys excepted; the dice then roll every unlocked key the look does
        // NOT declare. Motion keys always roll: motion is the voice's axis, never taken from a look
        // (the same discipline as lookPass's merge). The taste head still only ranks the finished
        // candidates — it never filters the pool.
        const base = funnel && !refining && !held ? funnel.looks[Math.floor(rng() * funnel.looks.length)] : null;
        if (base) {
          rp.composition = base.id;
          for (const [k, v] of Object.entries(base.params || {})) {
            if (MOTION_KEYS.includes(k) || state.lockedParams[k]) continue;
            rp[k] = v;
          }
        }
        for (const key of unlocked) {
          // #1857 — a key the base look declares (and may speak for: non-motion) keeps the look's word.
          if (base && !MOTION_KEYS.includes(key) && base.params && key in base.params) continue;
          if (refining) {
            rp[key] = mutateKey(key, state.layoutParams[key], rng, refineSpread);
          } else if (hasChain(key)) {
            const step = markovPick(key, state.layoutParams[key], rng);
            if (step.fellBack) chainFellBack = true;
            rp[key] = step.value;
          } else {
            rp[key] = randomizeKey(key, rng);
          }
        }
        candidates.push(rp);
      }
      const { index } = pickCurated(candidates, curator, rng, { refine: refining });
      if (index < 0) return {};
      // #1258: publish the sway from the latest Director tick (the persona
      // picks above ticked during pickCurated) for the top-bar presence mark.
      // Ephemeral module signal, NOT store state (deniability law: she must
      // not appear in state). Written synchronously before the store commit
      // below, so the mark's re-render reads it fresh.
      setSwayMagnitude(swayMagnitude(getDirector().lastSway));
      // PATTERN tracks are curated too, on their own seeded stream keyed by the same (seed, press #): the same press
      // deals the same patterns again. (The taste engine scores layout params, not patterns: this is seeded dice.)
      const pat = rollPatternLayers(
        state.layers,
        'curate',
        rngForIndex(state.seed, CH.curate, press + 0x10000, state.seedOffsets),
      );
      // #1365 Q2 — REFINE varies colour gently around the palette that was kept: a fresh small hue + warmth deal from
      // the ANCHOR on every press (never a walk), on the colour channel keyed by (seed, press #), locked swatches held.
      // Same store update as the layout pick, so one press is still one undo step. Explore never touches it here.
      let colour = {};
      if (refining) {
        const keepCount = (state.keeps?.length ?? 0) + (state.favorites?.length ?? 0);
        const anchor = anchorValid(state.refinePaletteAnchor, state, keepCount)
          ? state.refinePaletteAnchor
          : { paletteId: state.paletteId, overrides: state.paletteOverrides, keepCount };
        const base = resolvePalette(anchor.paletteId, anchor.overrides, state.userPalettes);
        const deal = colorDeal(rngForIndex(state.seed, CH.color, press + 0x20000, state.seedOffsets), refineSpread);
        // The kept palette's swatch weights ride along (#1049 would otherwise drop them for any swatch override and
        // re-derive, which shifts WHICH colours the marks get: a bigger change than the drift itself).
        const overrides = {
          ...(anchor.overrides || {}),
          swatches: nudgeSwatches(base.swatches, deal, state.paletteLocks),
          ...(Array.isArray(base.weights) ? { weights: [...base.weights] } : {}),
        };
        colour = {
          paletteOverrides: overrides,
          refinePaletteAnchor: {
            paletteId: anchor.paletteId,
            overrides: anchor.overrides,
            keepCount,
            lastOverrides: overrides,
          },
        };
      }
      // #1550: the pick lands through the validating door, like every other
      // write of rolled values — candidates are scored as rolled, but what
      // lands is clamped to the document spec and pair-migrated.
      const { params: landedParams } = validateLayoutParams(candidates[index]);
      // #1904 — FIELD: this press is a kinetic book shuffle deal, and the
      // Director tick above already dealt (or declined) a poet. The form is
      // placed off the press's own seeded stream (the colour deal's sub-deal
      // pattern, +0x30000) and rides the landed params in this same commit;
      // a silent deal clears the standing form. Nothing else writes the
      // key, so a dealt form is HELD across voice passes until the next
      // Curator press deals again.
      const fieldDeal = fieldFormForDeal(
        tickResult.poet,
        rngForIndex(state.seed, CH.curate, press + 0x30000, state.seedOffsets),
        Number.isFinite(state.canvasW / state.canvasH) ? { aspect: state.canvasW / state.canvasH } : {},
      );
      const landed = { ...landedParams };
      if (fieldDeal) landed.fieldForm = fieldDeal;
      else delete landed.fieldForm;
      return {
        ...(pat.changed ? pushToUndo(state, true, UNDO_KIND_LAYERS) : pushToUndo(state, true)),
        ...(pat.changed ? { layers: pat.layers } : {}),
        ...colour,
        // #1857 — the advanced funnel commits with the press that advanced it (one undo step, like
        // everything else this press does). No settled board, no field: the press leaves the
        // narrowing record alone.
        ...(funnel ? { kineticNotch: funnel.notch } : {}),
        layoutParams: landed,
        curatePress: press + 1,
        // Honest flag: if any chain had no row for the current value this press
        // had no memory behind it, and the bar says so.
        curateChainFallback: chainFellBack,
      };
    }),

  /**
   * KINETIC button (#942) — naive full re-roll of the recipe. Placeholder
   * until the RULES/WEATHER/HEAT layers land (#943–#945): every tap rolls a
   * fresh seed, palette, composition preset (composition + mode + behave +
   * density/count + the designer's brief), asset pool, FX chain and blend
   * modes, in one atomic store update = one undo entry.
   *
   * Reuses the existing axes rather than inventing new ones: the preset
   * merge respects lockedParams exactly like applyPreset, the pool swap maps
   * through known ids like loadShapeSet, palette overrides clear like
   * setPaletteId (the palette crossfade rides paletteMixSeconds). Behave
   * easing (#722) and the seed phase restart (#710) live in the engine and
   * apply automatically — no special-casing here.
   *
   * UNDO_KIND_LAYERS because the roll touches layer structure (FX effects,
   * blend modes) as well as edit fields; 'layers' entries hold the whole
   * document and always apply on undo (#223).
   */
  kineticRoll: () =>
    set((state) => {
      const undo = pushToUndo(state, true, UNDO_KIND_LAYERS);

      // 1. seed — nonzero uint32. The worker rebuilds placements from it (#710:
      // same seed in → same picture out; the footer shows seed:{hex}).
      let seed = (Math.random() * 0xffffffff) >>> 0;
      if (seed === 0) seed = 1;

      // 2. palette — random id from the full roll pool (#952: all 37 system
      // palettes + saved user palettes), preferably not the current one.
      const paletteId = pickOtherId(paletteRollPoolIds(state.userPalettes), state.paletteId);

      // 3. composition — random preset (carries composition + mode + behave +
      // density/count), preferably a different composition; locked params hold.
      // #964: an armed MODE keeps the composition and pins the mode instead of
      // dealing a fresh preset — the roll reworks everything else.
      let merged;
      if (state.armedMode) {
        merged = { ...state.layoutParams };
      } else {
        const preset = pickOtherPreset(COMPOSITION_PRESETS, state.layoutParams.composition);
        merged = { ...state.layoutParams, composition: preset.id };
        for (const [k, v] of Object.entries(preset.params)) {
          if (!state.lockedParams[k] && merged[k] !== v) merged[k] = v;
        }
      }
      // #964: pin the armed roll scope over whatever the roll dealt.
      merged = pinRollScope(merged, state.armedMode, state.armedMotion);

      // 4. assets — #1767: a mixed-family pool dealt from the WHOLE library (+ the artist's imports), not one of the
      // 19 shape sets (49 of 295 assets). Same size as a set, so density/count behave as before (state/rollPool.mjs).
      const enabledAssets = poolToEnabled(dealMixedPool(dealableRecords(ASSETS, state.customAssets), dieRng).ids);

      // 5. FX + blend — one FX layer, 0–3 random menu effects with default
      // params; content layers get a random blend mode. Never strands the
      // project: an empty shape-set mapping keeps the current pool.
      let layers = state.layers;
      let fxLayer = layers.find(isFxLayer);
      let selectedFxLayerId = state.selectedFxLayerId;
      if (!fxLayer && !isTapeFull(state)) {
        // Layer id derives from the roll's own seed — unique per roll, no wall
        // clock (layoutSlice is a must-loop performer per #806).
        fxLayer = {
          id: `fx-${seed.toString(36)}`,
          name: `FX ${layers.filter(isFxLayer).length + 1}`,
          type: 'fx',
          visible: true,
          effects: [],
          layerBlendMode: 'normal',
          layerOpacity: 1,
        };
        layers = [...layers, fxLayer];
        selectedFxLayerId = fxLayer.id;
      }
      const fxKinds = shuffle(rollFxKinds(FX_MENU_KINDS)).slice(0, die(4)); // #1107: never INVERT in a roll
      const effects = fxKinds.map((kind) => ({ kind, params: rollFxParams(kind) })); // ... and a gentle HAZE
      // The LOWEST content layer composites over the bare canvas background, so it has nothing to blend
      // with and stays normal (fx/rollSafety.js says why, with the measurements).
      const bottomContent = layers.find((l) => !isFxLayer(l) && !isMathLayer(l));
      layers = layers.map((l) => {
        if (fxLayer && l.id === fxLayer.id) return { ...l, effects };
        if (!isFxLayer(l)) return { ...l, layerBlendMode: rollBlend(l === bottomContent, () => pick(BLEND_MODES)) };
        return l;
      });

      // PATTERN tracks are dealt too, from a stream derived from this roll's seed (so a roll stays one seeded event),
      // and with none on the page a chaos roll may add one (patternRoll.js).
      layers = rollPatternLayers(layers, 'chaos', mkRng((seed ^ 0x51ed270b) >>> 0 || 1), {
        canAdd: !isTapeFull({ ...state, layers }),
        makeId: () => `pt-${seed.toString(36)}`,
      }).layers;

      return {
        ...undo,
        seed,
        paletteId,
        paletteOverrides: null,
        paletteLocks: {},
        paletteChosen: false, // #1365 — the roll picked this palette, not the artist
        layoutParams: merged,
        enabledAssets: Object.keys(enabledAssets).length ? enabledAssets : state.enabledAssets,
        layers,
        selectedFxLayerId,
        voiceMix: null,
        activeVoiceId: null,
        // #1855 — CHAOS is the escape hatch out of the book: the standing piece after a chaos roll was
        // dealt from no chapter, so no chapter stands (the session coverage ledger keeps its history).
        kineticChapterId: null,
        kineticLanding: null,
        // #1856 — and the escape closes the standing round, unsettled if it never settled (roundTable).
        kineticRound: closeStandingRound(state, 'chaos'),
        // #1857 — CHAOS leaves the book, so the narrowing leaves with it (D3's implicit widening).
        kineticNotch: null,
      };
    }),

  /**
   * #1772 — KINETIC LOOK pass (tap 1 of the sweep): a fresh Look from the 64 + a pool coherent with its pairing.
   * Structure and shapes move; motion, palette and seed hold. One undo step. Pure logic: state/kineticSweep.mjs.
   * #1855 — the pass is a chapter landing (BOOK S2): the look and its pool come from the one chapter the
   * flip walked to, inside the scope ceiling — never from the whole library at once.
   */
  kineticLookPass: () =>
    set((state) => {
      // #1855 — a cold tap is a landing: the flip walks the spine and this pass deals inside the one
      // chapter it lands in (scopedChapterLook). The chapter state rides in the same store update, so a
      // tap stays one undo step (#1772's law) and the record can never disagree with the deal.
      const { r, landing, visits } = scopedChapterLook(state);
      // PATTERN tracks are structure too: a new tessellation of the same kind (what the retired RULES pass dealt).
      // The entry is a whole-document one when a track moved, an edit one otherwise.
      const pat = rollPatternLayers(state.layers, 'rules', mkRng(die(0x7fffffff) || 1));
      const next = {
        ...(pat.changed ? pushToUndo(state, true, UNDO_KIND_LAYERS) : pushToUndo(state, true)),
        ...(pat.changed ? { layers: pat.layers } : {}),
        layoutParams: r.layoutParams,
        enabledAssets: Object.keys(r.enabledAssets).length ? r.enabledAssets : state.enabledAssets,
        voiceMix: null,
        activeVoiceId: null,
        kineticChapterId: landing.chapterId,
        kineticChapterVisits: visits,
        kineticLanding: landing,
        // #1856 — a fresh flip is the settled round's only honest exit: it closes (via 'flip') in the
        // same update, and the closed record stays inspectable until the next voice pass opens a round.
        kineticRound: closeStandingRound(state, 'flip'),
        // #1857 — the flip ends the settled board, so its narrowing ends with it (D3: widening is
        // implicit in the exits; the next settled round opens a fresh funnel at notch 0).
        kineticNotch: null,
      };
      if (r.layoutParams.mode === 'ca' && !state.caGrid) next.caGrid = createGrid(40, 28, state.seed);
      return next;
    }),

  /**
   * #1772 — KINETIC VOICE pass (tap 2): a fresh voice from the 64-voice deck over the standing look. Motion + palette
   * move, and the glow only when the voice declares accumulation (#1768). Structure and the pool hold. One undo step.
   */
  kineticVoicePass: () => {
    // #1856 — if LOIS spends her cut at this commit, the feed notes it AFTER the store update lands:
    // the kill's own redeal changes the composition, and the feed's seed watcher would clear a flag
    // set inside the updater as if a fresh frame had arrived. Post-commit, the CUT flag stands until
    // the next roll or seed change (loisActivity.noteCut, frameKept's lifecycle).
    let spentCut = false;
    set((state) => {
      // #1855 — a warm tap stays inside the standing chapter: its voices ∩ the scope deck (scopedChapterVoices).
      const r = voicePass(state, dieRng, { deck: scopedChapterVoices(state) });
      // The air moves with the costume (what the retired WEATHER pass dealt): PATTERN tracks drift and mix over the
      // same picture, and the chiaroscuro sun, if it is out, moves to a new position and intensity. Off stays off.
      const pat = rollPatternLayers(state.layers, 'weather', mkRng(die(0x7fffffff) || 1));
      const light = state.light
        ? sanitizeLight({
            ...state.light,
            x: -500 + die(2001),
            y: -500 + die(1701),
            intensity: 0.3 + dieRng() * 0.7,
            ambient: 0.2 + dieRng() * 0.5,
          })
        : state.light;
      // #1856 — the deal is complete, so the table sits in this same update (runRound): open, LOIS's
      // slot, her spend (D2: kill, redeal from the chapter deck minus the killed look) or her pass,
      // and the automatic settle (D4). A kill's redeal overrides the layout and pool below.
      const round = runRound(state, r);
      spentCut = round.cut;
      // #1857 — the narrowing rides beside the round: a NEW settled round opens a fresh narrowing at
      // notch 0; an absorbed warm tap (runRound returned the standing record itself) or no round at
      // all leaves the standing narrowing exactly as it was — narrowing reads the settled board, it
      // never reopens a round (S3's absorb law, unchanged).
      const kineticNotch =
        round.kineticRound && round.kineticRound !== state.kineticRound
          ? notchForRound(round.kineticRound)
          : state.kineticNotch;
      return {
        ...(pat.changed ? pushToUndo(state, true, UNDO_KIND_LAYERS) : pushToUndo(state, true)),
        ...(pat.changed ? { layers: pat.layers } : {}),
        light,
        layoutParams: round.layoutParams ?? r.layoutParams,
        paletteId: r.paletteId,
        paletteOverrides: r.paletteOverrides,
        paletteLocks: {},
        paletteChosen: false, // #1365 — the roll picked this palette, not the artist
        ...(round.enabledAssets ? { enabledAssets: round.enabledAssets } : {}),
        kineticVoiceId: r.voiceId,
        kineticRound: round.kineticRound,
        kineticNotch,
        voiceMix: null,
        activeVoiceId: null,
      };
    });
    if (spentCut) loisActivity.noteCut();
  },

  /**
   * #1772 — the START pill's WEAK / MED launch opener: one look pass and one voice pass under that state's decks, in
   * ONE store update — one undo entry, so a restored project stays one Ctrl+Z away (#33, #946).
   */
  kineticOpenPass: () =>
    set((state) => {
      const look = scopedLook(state);
      const mid = { ...state, layoutParams: look.layoutParams };
      const voice = voicePass(mid, dieRng, { deck: scopeDecks(state.startupMode).voices });
      return {
        ...pushToUndo(state, true),
        layoutParams: voice.layoutParams,
        enabledAssets: Object.keys(look.enabledAssets).length ? look.enabledAssets : state.enabledAssets,
        paletteId: voice.paletteId,
        paletteOverrides: voice.paletteOverrides,
        paletteLocks: {},
        paletteChosen: false,
        kineticVoiceId: voice.voiceId,
        voiceMix: null,
        activeVoiceId: null,
        // #1855 — the launch opener deals the whole book, not a chapter: no chapter stands after it
        // (the first cold KINETIC tap walks and lands). The coverage ledger keeps its session history.
        kineticChapterId: null,
        kineticLanding: null,
        // #1856 — leaving the book through the opener closes the standing round (via 'opener').
        kineticRound: closeStandingRound(state, 'opener'),
        // #1857 — the opener deals the whole book: no board stands, so no narrowing stands (D3).
        kineticNotch: null,
      };
    }),

  /**
   * #1772 — KINETIC CURATOR pass (tap 3+): Davis weighs the piece as it stands against a few capped nudges
   * (≤ NUDGE_MAX_KEYS params, each ≤ NUDGE_SPREAD of its dice range) and keeps one. Keeping the standing piece is a
   * real outcome: no change, no undo entry, and `kineticNudge.moves` reads empty. The record is the backstage signal.
   */
  kineticCuratorPass: () =>
    set((state) => {
      const curator = getActiveCurator();
      const r = curatorPass(state, curator, dieRng, pickCurated);
      const kineticNudge = { curator: curator?.name ?? null, index: r.index, moves: r.moves };
      // #1856 — a warm tap lands on the table and is absorbed (roundTable.absorbWarmTap): the settled
      // round is the board this pass plays on, and the record provably does not move.
      const kineticRound = state.kineticRound ? absorbWarmTap(state.kineticRound) : state.kineticRound;
      if (!r.layoutParams) return { kineticNudge, kineticRound };
      return {
        ...pushToUndo(state, true),
        layoutParams: r.layoutParams,
        kineticNudge,
        kineticRound,
        voiceMix: null,
        activeVoiceId: null,
      };
    }),

  // Entries are tagged with the layerId they were captured for (#92) and the
  // stack is shared across layers (never reset on switch). An 'edit' entry
  // only ever applies when its layer is active — otherwise it would restore
  // one layer's values onto a different layer, which is the exact corruption
  // this is guarding against. A mismatched top entry means "nothing to
  // undo/redo for this layer right now" — no-op, no pop. 'layers' entries
  // (layer structure actions, #223) always apply: they hold the whole
  // pre-action document, so every layer's content lands back on its own
  // layer and the structure comes with it.
  undo: () =>
    set((state) => {
      if (state.historyUndoStack.length === 0) return {};
      const previous = state.historyUndoStack[state.historyUndoStack.length - 1];
      if (!entryApplies(previous, state.activeLayerId)) return {};
      const current = captureUndoEntry(state, previous.kind);
      // #1590: a 'shelf' entry restores the shelf only (a fill touched
      // nothing else) and re-persists its three storage keys.
      if (previous.kind === UNDO_KIND_SHELF) {
        const shelfBack = shelfRestoreFields(previous);
        persistShelfRestore(shelfBack);
        return {
          ...shelfBack,
          historyUndoStack: state.historyUndoStack.slice(0, -1),
          historyRedoStack: trimUndoStack([...state.historyRedoStack, current]),
        };
      }
      const restore =
        previous.kind === UNDO_KIND_LAYERS
          ? { ...editRestoreFields(previous), ...layersRestoreFields(previous) }
          : editRestoreFields(previous);
      return {
        ...restore,
        historyUndoStack: state.historyUndoStack.slice(0, -1),
        historyRedoStack: trimUndoStack([...state.historyRedoStack, current]),
        // #107 §7: an in-flight morph's rAF loop calls setLayoutParams every
        // frame from its own morphFrom/morphTo/morphStart — left running, it
        // would overwrite what undo just restored within one frame. Cancel it.
        morphing: false,
        morphFrom: null,
        morphTo: null,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.historyRedoStack.length === 0) return {};
      const next = state.historyRedoStack[state.historyRedoStack.length - 1];
      if (!entryApplies(next, state.activeLayerId)) return {};
      const current = captureUndoEntry(state, next.kind);
      // #1590: the shelf half of undo, mirrored.
      if (next.kind === UNDO_KIND_SHELF) {
        const shelfFwd = shelfRestoreFields(next);
        persistShelfRestore(shelfFwd);
        return {
          ...shelfFwd,
          historyUndoStack: trimUndoStack([...state.historyUndoStack, current]),
          historyRedoStack: state.historyRedoStack.slice(0, -1),
        };
      }
      const restore =
        next.kind === UNDO_KIND_LAYERS
          ? { ...editRestoreFields(next), ...layersRestoreFields(next) }
          : editRestoreFields(next);
      return {
        ...restore,
        historyUndoStack: trimUndoStack([...state.historyUndoStack, current]),
        historyRedoStack: state.historyRedoStack.slice(0, -1),
        // #107 §7: same in-flight-morph cancellation as undo() above.
        morphing: false,
        morphFrom: null,
        morphTo: null,
      };
    }),
});
