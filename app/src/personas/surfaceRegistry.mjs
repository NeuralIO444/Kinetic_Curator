// personas/surfaceRegistry.mjs — #2461 slice 3: the persona surface registry + the head-consumption registry.
//
// Spec: persona-interface spec 2026-11-23, Q1–Q7 ruled by Matt.
//   Q1  ONE REGISTRY, BOTH SURFACES — this file is the one in-code source both later surfaces are
//       generated from (the manifest is slice 4; the standalone MCP bridge is slice 5 — neither is built here).
//   Q2  v1 coverage is the TRIO ONLY: Davis, LOIS, Queen.
//   Q3  Tiers are adopted as shaped; Tier 2 and Tier 3 are side quests, each only when ordered. This
//       registry notes the tiers exist (SURFACE_TIERS) and ships NO Tier 2 / Tier 3 entries.
//   Q6  Heads are REGISTRY ONLY in v1: HEAD_CONSUMPTION states who consumes which EXISTING head.
//       No new head is created and no head's behaviour changes.
//
// DESCRIPTIVE ONLY — nothing in the live instrument imports this file, and no entry here is a call
// path. Every reads / verbs / channels / limits entry names the real module and export that already
// does the work (its `source`), and the numeric / enum limits are IMPORTED from those modules, never
// copied, so a limit cannot silently diverge from the code that enforces it. Three limits are
// stated as data instead, each pinned by surfaceRegistry.selfcheck.mjs against its source: LOIS's
// critique delta cap and the Queen's lean keys (literals inside mindContract's validators), and the
// Queen's minKeeps (an export of a hidden module this registry must not import — see limits.queen).
// surfaceRegistry.selfcheck.mjs also pins every named source export against its module, so the
// registry cannot drift silently from the code it describes.
//
// Persona copy law: entries carry ids and source pointers only — no persona lines, no new copy.

import { getPersona } from './registry.mjs';
import { PERSONAS as MIND_PERSONAS, CANONICAL_STATES, MOODS, MAX_LINE, MAX_DECAY_BARS } from '../curator/mindContract.js';
import { PERSONA_VOICES } from '../curator/megamindVoice.mjs';
import {
  ROUTE_OPS,
  TIER_OPS,
  ENERGY_LEVELS,
  SPECTRUM_PARAMS,
  DAVIS_MAX_ROUTES,
  PHRASE_BARS,
  BRAKE_AT,
  BRAKE_MAX,
} from '../curator/mindConduct.js';
import { MAX_ROUTES } from '../gl/audioRoutes.mjs';
import { LOIS_JUDGE_ID } from '../curator/loisJudge.mjs';
import { VISION_JUDGE_ID } from '../curator/megamindVision.mjs';
import {
  PERSONA_HEAD_IDS,
  PERSONA_HEAD_STRUCTURE,
  EARN_IN_MIN_LABELED_TURNS,
  HEAD_MIN_FIDELITY,
} from '../curator/tasteHead.js';
import { PERSONA_DECISION_KINDS } from '../curator/decisionFeatures.mjs';
import { QUEEN_TIMING_FEATURES_VERSION } from '../curator/queenTimingFeatures.mjs';

export const PERSONA_SURFACE_SCHEMA = 'kc-persona-surface/1';
export const HEAD_CONSUMPTION_SCHEMA = 'kc-head-consumption/1';

/** The tiers as ruled (Q3). Tier 1 is served in v1; Tiers 2 and 3 exist as a shape only — no entries. */
export const SURFACE_TIERS = Object.freeze([
  Object.freeze({ tier: 1, served: true, note: 'v1 live model surface — the trio (Q2)' }),
  Object.freeze({ tier: 2, served: false, note: 'side quests, each only when ordered (Q3); no entries ship in v1' }),
  Object.freeze({ tier: 3, served: false, note: 'side quests, later, verbs-as-tools (Q3); no entries ship in v1' }),
]);

const src = (module, exportName) => Object.freeze({ module, export: exportName });

// The bus channels every trio persona shares (composition/eventBus.js): a persona is asked on
// mind:req, every answer is reported on mind:reply, every decision is published on mind:decision.
// mind:request is the stage ask — mindContract.wantsStage is always false for the Queen, so she
// is not on it.
const BUS_ASK = Object.freeze({ name: 'mind:req', kind: 'bus', source: src('composition/eventBus.js', 'Events') });
const BUS_REPLY = Object.freeze({ name: 'mind:reply', kind: 'bus', source: src('composition/eventBus.js', 'Events') });
const BUS_DECISION = Object.freeze({
  name: 'mind:decision',
  kind: 'bus',
  source: src('composition/eventBus.js', 'Events'),
});
const BUS_STAGE_ASK = Object.freeze({
  name: 'mind:request',
  kind: 'bus',
  source: src('composition/eventBus.js', 'Events'),
});
const MODEL_CHAT = Object.freeze({
  name: 'ollama:/api/chat',
  kind: 'model',
  source: src('curator/megamindVoice.mjs', 'askPersonaReply'),
});

const entry = (id, extra) =>
  Object.freeze({
    schema: PERSONA_SURFACE_SCHEMA,
    id,
    tier: 1,
    kind: getPersona(id)?.kind ?? null,
    callsign: getPersona(id)?.identity?.callsign ?? null,
    ...extra,
  });

/**
 * The persona-reachable surface for Tier 1, as data. `reads` = what the persona may read,
 * `verbs` = what it may do (each through its existing channel and fail-closed validation only),
 * `limits` = the bounds the existing code already enforces.
 */
export const PERSONA_SURFACE = Object.freeze([
  entry('davis', {
    reads: Object.freeze([
      Object.freeze({
        id: 'room-context',
        source: src('curator/mindContext.js', 'buildContext'),
        note: 'the compact room summary every trio persona is asked against',
      }),
      Object.freeze({
        id: 'show-block',
        source: src('curator/mindContext.js', 'showOf'),
        note: 'energy level, routes, artist-owned targets, flat bars, brake state, spectrum summary',
      }),
      Object.freeze({
        id: 'spectrum-marks',
        source: src('curator/mindConduct.js', 'SPECTRUM_PARAMS'),
        note: 'how the stage marks listen to the spectrum (map / scale / displace / colour)',
      }),
    ]),
    verbs: Object.freeze([
      Object.freeze({
        id: 'propose-asset',
        source: src('curator/mindContract.js', 'validateReply'),
        note: 'reply.propose: add one cast asset, or nothing',
      }),
      Object.freeze({
        id: 'route-edit',
        source: src('curator/mindConduct.js', 'validateRouteOp'),
        note: 'reply.route: one route-table edit per reply, landing on a phrase boundary',
      }),
    ]),
    channels: Object.freeze([BUS_ASK, BUS_REPLY, BUS_DECISION, BUS_STAGE_ASK, MODEL_CHAT]),
    limits: Object.freeze({
      maxLine: MAX_LINE,
      maxDecayBars: MAX_DECAY_BARS,
      canonicalStates: CANONICAL_STATES.davis,
      routeOps: ROUTE_OPS,
      tierOps: TIER_OPS,
      energyLevels: ENERGY_LEVELS,
      spectrumParams: Object.freeze(Object.keys(SPECTRUM_PARAMS)),
      maxRoutes: MAX_ROUTES,
      davisMaxRoutes: DAVIS_MAX_ROUTES,
      phraseBars: PHRASE_BARS,
    }),
  }),
  entry('lois', {
    reads: Object.freeze([
      Object.freeze({
        id: 'room-context',
        source: src('curator/mindContext.js', 'buildContext'),
        note: 'the compact room summary every trio persona is asked against',
      }),
      Object.freeze({
        id: 'show-block',
        source: src('curator/mindContext.js', 'showOf'),
        note: 'flat bars and the standing show, for the flat read',
      }),
      Object.freeze({
        id: 'render-features',
        source: src('curator/loisJudge.mjs', 'judgeRender'),
        note: 'render features / stats judged under LOIS_JUDGE_ID',
      }),
      Object.freeze({
        id: 'vision-readings',
        source: src('curator/megamindVision.mjs', 'buildRenderJudgeRequest'),
        note: 'vision readings judged under VISION_JUDGE_ID (a judge id, not a decision head)',
      }),
      Object.freeze({
        id: 'grudges',
        source: src('curator/loisGrudge.mjs', 'getLoisGrudges'),
        note: 'standings / grudges tallied from cuts',
      }),
    ]),
    verbs: Object.freeze([
      Object.freeze({
        id: 'critique',
        source: src('curator/mindContract.js', 'validateReply'),
        note: 'reply.critique: one target with a small signed nudge, or none',
      }),
      Object.freeze({
        id: 'brake',
        source: src('curator/mindConduct.js', 'BRAKE_AT'),
        note: "the brake on Davis: at BRAKE_AT he holds Davis to bold at most BRAKE_MAX, plus the one bolder reply (#2159)",
      }),
      Object.freeze({
        id: 'judge-deal',
        source: src('curator/loisCut.mjs', 'judgeDeal'),
        note: 'keep / pass judgment and the cut in the review loop (ranking: loisRank.rankLois)',
      }),
      Object.freeze({
        id: 'poem-revision-request',
        source: src('curator/fieldRevision.mjs', 'judgeStandingPoem'),
        note: 'a revision REQUEST on a standing poem — LOIS requests, never writes',
      }),
    ]),
    channels: Object.freeze([BUS_ASK, BUS_REPLY, BUS_DECISION, BUS_STAGE_ASK, MODEL_CHAT]),
    limits: Object.freeze({
      maxLine: MAX_LINE,
      maxDecayBars: MAX_DECAY_BARS,
      canonicalStates: CANONICAL_STATES.lois,
      // mindContract's lois() validator refuses |delta| above this literal; the selfcheck pins
      // this number against that source text (there is no exported constant to import).
      critiqueDeltaMax: 0.25,
      brakeAt: BRAKE_AT,
      brakeMax: BRAKE_MAX,
      judgeId: LOIS_JUDGE_ID,
      visionJudgeId: VISION_JUDGE_ID,
    }),
  }),
  entry('queen', {
    reads: Object.freeze([
      Object.freeze({
        id: 'room-context',
        source: src('curator/mindContext.js', 'buildContext'),
        note: 'the mood heard in the room, from the same room summary',
      }),
      Object.freeze({
        id: 'queen-head',
        source: src('curator/queenChannel.js', 'readQueenHead'),
        note: 'the taste file’s queen head, read through the deniable channel — hidden bias only',
      }),
      Object.freeze({
        id: 'queen-timing-features',
        source: src('curator/queenTimingFeatures.mjs', 'queenTimingFeatures'),
        note: 'timing features for her timing-inclination head',
      }),
      Object.freeze({
        id: 'keeps',
        source: src('curator/queenLean.mjs', 'swayBiases'),
        note: 'keep counts — no sway below MIN_KEEPS keeps',
      }),
    ]),
    verbs: Object.freeze([
      Object.freeze({
        id: 'mood-reply',
        source: src('curator/mindContract.js', 'validateReply'),
        note: 'reply: one mood, plus optional gentle leans (wetness / evolve) — she never speaks, never sets a face, never asks the stage',
      }),
      Object.freeze({
        id: 'sway',
        source: src('curator/queenLean.mjs', 'swayBiases'),
        note: 'bounded sways delivered as hidden bias only, never surfaced',
      }),
    ]),
    channels: Object.freeze([BUS_ASK, BUS_REPLY, BUS_DECISION, MODEL_CHAT]),
    limits: Object.freeze({
      moods: MOODS,
      // mindContract's queen() validator accepts exactly these lean keys; the selfcheck pins
      // this list against that source text (there is no exported constant to import).
      leanKeys: Object.freeze(['wetness', 'evolve']),
      // The shipped tuning value queenLean.MIN_KEEPS reads (kc-persona-tuning/1, queen knobs).
      // Stated as data, not imported: the deniability law (queenDeniability.selfcheck) allows the
      // hidden modules to be imported only by their hosts, and this registry imports neither.
      // surfaceRegistry.selfcheck.mjs pins this number against queenLean's MIN_KEEPS export.
      minKeeps: 8,
      canonicalStates: Object.freeze([]),
      surfaceFacing: false,
    }),
  }),
]);

export const surfaceById = (id) => PERSONA_SURFACE.find((e) => e.id === id) ?? null;

// ── the head-consumption registry (Q6: registry only) ───────────────────────────────────────────
//
// Heads that exist today (all in curator/tasteHead.js unless noted):
//   persona-head   the taste file `personas` section — per persona, per decision kind, tree heads
//                  over the decision-feature universe; a head steers only after earn-in.
//   queen-timing   the taste file `queenTiming` section — her timing-inclination head (A6).
//   queen-head     the taste file `queen` head — the third head, read through queenChannel.
//   shared-taste   the taste file's main head (linear or xgboost-trees) — keep-probability over
//                  recipe features via scoreLayout.
// Consumption below is what the code does TODAY. Deliberately NOT registered: the voice heads
// (VOICE_HORN_IDS are the horns — no Tier 1 persona holds one), the governor cost head (Tier 2's
// persona, no entry in v1), and scoreBoldness (a shared-head scorer with no live caller and no
// persona attribution in code).

const headEntry = (persona, head, kind, consumer) =>
  Object.freeze({ schema: HEAD_CONSUMPTION_SCHEMA, persona, head, kind, consumer });

export const HEAD_CONSUMPTION = Object.freeze([
  headEntry('davis', 'persona-head', 'solo', Object.freeze({
    module: 'personas/band.mjs',
    export: 'stepBand',
    via: src('curator/tasteHead.js', 'steeringHeads'),
    note: 'an earned-in solo head’s keep-probability weighs the soloist pick',
  })),
  headEntry('davis', 'persona-head', 'trade', Object.freeze({
    module: 'personas/band.mjs',
    export: 'stepBand',
    via: src('curator/tasteHead.js', 'steeringHeads'),
    note: 'an earned-in trade head’s probabilities become the answerer’s odds',
  })),
  headEntry('lois', 'persona-head', 'trade', Object.freeze({
    module: 'personas/band.mjs',
    export: 'stepBand',
    via: src('curator/tasteHead.js', 'steeringHeads'),
    note: 'LOIS holds a trade head only — no solo, and her cut is a trade answer, not a cut head',
  })),
  headEntry('queen', 'queen-timing', 'timing', Object.freeze({
    module: 'curator/director.js',
    export: 'bandTimingStep',
    via: src('curator/tasteHead.js', 'queenTimingInclination'),
    note: 'her earned-in timing inclination scales the band-timing lean’s size, never its content',
  })),
  headEntry('queen', 'queen-head', 'inclination', Object.freeze({
    module: 'curator/queenChannel.js',
    export: 'readQueenHead',
    via: src('curator/queenChannel.js', 'isLive'),
    note: 'the third head, read only through the deniable channel; hidden bias only, never surfaced',
  })),
  headEntry('queen', 'shared-taste', 'ranking', Object.freeze({
    module: 'state/slices/davisSlice.js',
    export: 'fillStage',
    via: src('curator/tasteHead.js', 'scoreLayout'),
    note: 'the Queen’s ranking door in the shelf fill (the code’s own words): a usable main head orders the fill’s keeps — scores order, they never gate or deal',
  })),
]);

/** The earn-in law every registered persona head steers under (imported, not copied). */
export const HEAD_EARN_IN = Object.freeze({
  minLabeledTurns: EARN_IN_MIN_LABELED_TURNS,
  minFidelity: HEAD_MIN_FIDELITY,
  personaHeadIds: PERSONA_HEAD_IDS,
  personaHeadStructure: PERSONA_HEAD_STRUCTURE,
  decisionKinds: PERSONA_DECISION_KINDS,
  queenTimingFeaturesVersion: QUEEN_TIMING_FEATURES_VERSION,
});

export const headConsumptionFor = (persona) => HEAD_CONSUMPTION.filter((e) => e.persona === persona);

/** Problems with the registries as data (empty = valid). Pure; the selfcheck pins this empty. */
export function validateSurfaceRegistry() {
  const problems = [];
  const trio = [...MIND_PERSONAS].sort();
  const ids = PERSONA_SURFACE.map((e) => e.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(trio)) problems.push(`surface ids ${ids} != mindContract trio ${trio}`);
  for (const e of PERSONA_SURFACE) {
    if (e.schema !== PERSONA_SURFACE_SCHEMA) problems.push(`${e.id}: schema`);
    if (e.tier !== 1) problems.push(`${e.id}: tier must be 1 in v1`);
    if (!getPersona(e.id)) problems.push(`${e.id}: no kc-persona/1 record`);
    if (!Object.prototype.hasOwnProperty.call(PERSONA_VOICES, e.id)) problems.push(`${e.id}: no persona voice`);
    if (!e.reads.length || !e.verbs.length || !e.channels.length) problems.push(`${e.id}: empty reads/verbs/channels`);
    for (const r of [...e.reads, ...e.verbs])
      if (!r.source || !r.source.module || !r.source.export) problems.push(`${e.id}: ${r.id} has no source pointer`);
  }
  for (const e of HEAD_CONSUMPTION) {
    if (e.schema !== HEAD_CONSUMPTION_SCHEMA) problems.push(`${e.persona}/${e.head}: schema`);
    if (!ids.includes(e.persona)) problems.push(`${e.persona}/${e.head}: consumer is not a Tier 1 persona`);
    if (!e.consumer || !e.consumer.module || !e.consumer.export) problems.push(`${e.persona}/${e.head}: no consumer pointer`);
  }
  return problems;
}

export const SURFACE_PROBLEMS = Object.freeze(validateSurfaceRegistry());
