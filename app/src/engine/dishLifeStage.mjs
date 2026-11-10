// dishLifeStage.mjs — DISH LIFE slice 3c (#1923): the culture on the resolver's stage. Pure of DOM and clocks.
//
// The resolver is a pure function of the recorded input stream, so the culture lives HERE, driven only by the
// per-frame stamp the live loop writes on the input — `input.dishLife = { wakeMs, gen, shed }` (absent = no
// culture). The stamp is data in the recorded stream (KC-1 DS rule 10): a take that contains a culture phase
// replays it exactly, and a frame with no stamp is byte-identical to a build without this module.
//
//   WAKE      the first frame carrying a new wakeMs freezes the scene: every visible layer's marks (minus terrain)
//             become the seed (dishLifeSeed), the nearest-mark assignment is built once (dishLifeRender), and a
//             culture is created at generation 0.
//   ADVANCE   each frame steps the culture toward the stamped generation, bounded by the stamped shed level
//             (catch up / trickle / hold). A stamp BEHIND the culture (a replay seeking back) rebuilds from the
//             frozen seed — the generation g a replay shows is always the same culture.
//   DRAW      the frame is the dissolving scene plus the live cells, as ordinary placement items on the TOP content
//             layer; other layers' marks are inside the seed and leave their layer. Nothing is edited in place:
//             layers get new item arrays, so a touch restores every layer exactly.
//   TERRAIN   marks flagged held/locked (a held FIELD poem, a locked look) are bedrock: never seeded, never
//             consumed, drawn exactly as dealt, and the colonies grow around them.
//   OFF       no stamp = no work: the stage drops any state and returns without touching a layer.
//   FIELD     #1994 (Stage Coupling Phase 1): a stamp with mode 'field' runs the same build/step machinery —
//             seeded from the same marks, bedrock and shed honoured identically — but NEVER draws: no dissolve,
//             no cell stamps, no specks, no layer touched. The culture's published field (level / activity) is
//             mirrored onto the stage's stable `publishedField` object for consumers to read; that is the
//             mode's whole output. The render assignment (nearest) is never built for it.
//   SEED      #1923 Phase 4: a field stamp carrying `seed` is the performer's "seed from stage" press —
//             a boundary that arrives early. The holder rebuilds from THIS frame's scene under the SAME
//             wake (the cycle clock is never rewritten: wakeMs stays the pure function of loop time the
//             Phase 3 key proof rests on), and the rebuilt culture catches up to the stamp's generation
//             under the same shed bound as any catch-up — so under CULTURE HELD the press LANDS at
//             generation 0 and waits, and on an empty stage it unpublishes, exactly as a boundary does.
//             Each press inside one wake bumps the build's seed EPOCH (0 = the wake's own seed): the
//             epoch rides the publication so the TIDES key can tell a pre-press grid from a post-press
//             one at the same (wake, generation) — within a wake, (epoch, gen) names the grid.

import { createCulture, stepCulture, setBedrock, restoreCultureGrid, CULTURE_RULE } from './dishLife.mjs';
import { seedFromMarks, coverageField } from './dishLifeSeed.mjs';
import { nearestMarks, cultureFrame, speckItems } from './dishLifeRender.mjs';
import { cultureSampler, envelope } from './dishLifeQuiet.mjs';
import { injectFluidBirths } from './dishFluidCouple.mjs'; // #1997 — the ferrofluid's bias on this culture's births

/** Culture grid resolution (the spike's grid). */
export const STAGE_COLS = 96;
export const STAGE_ROWS = 54;
/** Most generations stepped in one frame, by governor shed level 0/1/2: catch up, trickle, hold. */
export const SHED_STEPS = Object.freeze([4, 1, 0]);

/** A mark that is terrain: a held FIELD poem, a locked look. */
/** A tertiary speck this stage drew (never a seed, never a mark). */
export const isSpeck = (it) => !!it && typeof it.key === 'string' && it.key.startsWith('speck:');
export const isTerrain = (it) => !!it && (it.held === true || it.locked === true || it.life === 'bedrock');
/**
 * #2010 P4 — POEM ↔ LIFE (D3, ruled 2026-11-06: armed-only, off by default). A FIELD poem's stamps (key `field-…`;
 * the culture's own cells are `life:…`) meet the culture only when the poem's record says so:
 *   life 'bedrock' → terrain (above): life flows around the words, which stay exactly as dealt
 *   life 'seed'    → an ordinary mark: the garden blooms from the words and its decay eats them
 *   unarmed        → a BYSTANDER: drawn exactly as dealt on its own layer, never seeded, never consumed, and the
 *                    colonies grow over the ground it stands on (it is not bedrock — nothing was armed)
 */
const isPoemStamp = (it) => !!it && typeof it.key === 'string' && it.key.startsWith('field-');
export const isBystander = (it) => isPoemStamp(it) && !it.life && !isTerrain(it);
/** Marks that keep their own layer, exactly as dealt: terrain and bystanders. */
const stays = (it) => isTerrain(it) || isBystander(it);

// the frozen seed keeps the WHOLE mark (shallow copy): the dissolving scene is drawn from it, and the cells inherit
// every field of the nearest one (glass/plate/wash/stipple/matParams/key…), so a wake never pops the Look
const freeze = (it) => ({ ...it });

const contentLayers = (layers) =>
  Array.isArray(layers) ? layers.filter((e) => e && !e.isFx && !e.isPattern && Array.isArray(e.items)) : [];

export function createDishLifeStage({ cols = STAGE_COLS, rows = STAGE_ROWS, rule = CULTURE_RULE } = {}) {
  let st = null; // { wakeMs, W, H, marks, nearest, culture, frameGen, frame, quiet, fieldOn }
  // #1997 — the ferrofluid's bias on this culture's births, handed in per frame by the resolver
  // (setFluidBias): the fluid stage's published density from the LAST applied frame (one frame
  // behind) + the stamped coupling strength. Null = no bias: the step loop below is then the
  // pre-#1997 loop, number for number. biasUsed records that this wake's steps consumed a bias:
  // the bias input CHANGES while it acts (the fluid keeps stepping), so the culture's state is
  // no longer a replay of its seed marks alone — the snapshot then carries the state grid
  // itself as a rider (the fluidGrid key), the terrain rider's precedent applied to state.
  let fluidBias = null;
  let biasUsed = false;
  const biasSeed = () => ((Math.floor(st.wakeMs) | 0) ^ 0x85ebca6b) | 0;

  // #1994 — the field mode's publication surface: ONE stable object for the stage's whole life. Its fields are
  // re-pointed at the live culture's published arrays on every field-mode frame (never copied — the core's
  // read-this-frame contract applies: level/activity ARE the culture's arrays, read them the frame you get
  // them). Inactive (active:false, arrays null) whenever no field-mode culture is running, so a consumer can
  // never read a retained previous frame.
  // #1997 — this stage's own culture publication for the ferrofluid's coupling read (the fluid
  // stage is a consumer like any other): ONE stable object, re-pointed at the live culture's
  // published arrays whenever a culture stands in this stage, inactive otherwise. The resolver
  // captures it BEFORE this frame's apply, so the fluid reads the culture one frame behind.
  const culturePublication = { active: false, cols: 0, rows: 0, gen: -1, level: null, activity: null };
  function syncCulturePublication() {
    if (st && st.culture) {
      const f = st.culture.field;
      culturePublication.active = true;
      culturePublication.cols = f.cols;
      culturePublication.rows = f.rows;
      culturePublication.gen = f.gen;
      culturePublication.level = f.level;
      culturePublication.activity = f.activity;
    } else {
      culturePublication.active = false;
      culturePublication.cols = 0;
      culturePublication.rows = 0;
      culturePublication.gen = -1;
      culturePublication.level = null;
      culturePublication.activity = null;
    }
  }

  const publishedField = {
    active: false,
    cols: 0,
    rows: 0,
    gen: -1,
    wakeMs: null,
    // #1923 Phase 4 — the seed epoch beside the wake and generation (see SEED in the header): 0 is
    // the wake's own seed; each "seed from stage" press inside the wake increments it. Mirrored only
    // while a field culture runs; 0 whenever nothing is published.
    seedEpoch: 0,
    level: null,
    activity: null,
  };
  function syncPublished() {
    if (st && st.fieldOn) {
      const f = st.culture.field;
      publishedField.active = true;
      publishedField.cols = f.cols;
      publishedField.rows = f.rows;
      publishedField.gen = f.gen;
      // #1923 Phase 3 (QA follow-up) — the wake rides the publication beside the generation: gen
      // restarts at 0 every cycle, so the generation alone does not name a culture; the wake does.
      // The TIDES snapshot (dishLifeCouple.fieldLevelGrid) carries it into the pattern frame key.
      publishedField.wakeMs = st.wakeMs;
      publishedField.seedEpoch = st.seedEpoch | 0;
      publishedField.level = f.level;
      publishedField.activity = f.activity;
    } else {
      publishedField.active = false;
      publishedField.cols = 0;
      publishedField.rows = 0;
      publishedField.gen = -1;
      publishedField.wakeMs = null;
      publishedField.seedEpoch = 0;
      publishedField.level = null;
      publishedField.activity = null;
    }
  }

  const geom = (W, H) => ({ canvasW: W, canvasH: H, cols, rows });

  function build(wakeMs, marks, W, H, bedrock, withNearest = true, terrain = []) {
    biasUsed = false; // #1997 — a new seed has consumed no fluid bias yet
    const seed = seedFromMarks(marks, { ...geom(W, H), bedrock });
    st = {
      wakeMs,
      W,
      H,
      marks,
      seededKeys: new Set(marks.map((m) => m.key).filter((k) => typeof k === 'string')), // #2010 P4 — what this seed took
      // #1923 Phase 3 — the terrain the seed was derived against, frozen like the marks: a snapshot must
      // restore the SAME bedrock the live build used, or a restored culture grows over ground the live
      // one treated as locked (the restore path used to rebuild with no bedrock at all and diverged
      // from the first stepped generation whenever terrain stood on the stage).
      terrain: (terrain || []).map(freeze),
      nearest: withNearest ? nearestMarks(marks, geom(W, H)) : null,
      culture: createCulture({ cols, rows, rule, bedrock, seed: seed.cells }),
      // #1923 Phase 4 — every build starts as its wake's own seed (epoch 0); apply() raises the
      // epoch when the build is a "seed from stage" press inside a standing wake, and the seek-back
      // rebuild / restore() preserve the epoch of the seed they rebuild.
      seedEpoch: 0,
      frameGen: -1,
      frame: null,
    };
  }

  const bedrockOf = (terrain, W, H) => {
    if (!terrain.length) return null;
    const cov = coverageField(terrain, geom(W, H));
    const b = new Uint8Array(cols * rows);
    let any = false;
    for (let i = 0; i < b.length; i++) if (cov[i] > 0) ((b[i] = 1), (any = true));
    return any ? b : null;
  };

  /**
   * Apply the frame's stamp to the resolved layers. Mutates the layer entries' `items` (new arrays) when a culture
   * is showing and returns true; returns false (touching nothing) when there is no stamp or nothing to seed.
   */
  function apply(dl, layers, W, H, { specks = true } = {}) {
    if (!dl || typeof dl !== 'object' || !Number.isFinite(dl.wakeMs)) {
      st = null;
      syncPublished();
      syncCulturePublication();
      return false;
    }
    const content = contentLayers(layers);
    if (!content.length) {
      // #1994: a field stamp with no scene to seed — no field is running, so nothing may stay published
      if (dl.mode === 'field') {
        st = null;
        syncPublished();
        syncCulturePublication();
      }
      return false;
    }
    const fieldMode = dl.mode === 'field';
    const needNearest = !fieldMode; // field mode never renders: the nearest-mark assignment is never built for it
    // #1923 Phase 4 — the "seed from stage" press: a field stamp carrying `seed` while a field
    // culture stands in the SAME wake forces the wake build below on this frame's scene — an early
    // boundary. A press on the boundary frame itself is absorbed by the boundary's own build (the
    // epoch stays 0: the wake's seed IS the press frame's scene), and a press while another mode's
    // culture stands is inert — the trigger seeds the field culture only.
    const seedPress =
      fieldMode && dl.seed === true && !!st && !!st.fieldOn && st.wakeMs === dl.wakeMs && st.W === W && st.H === H;
    const prevEpoch = st ? st.seedEpoch | 0 : 0;
    const rebuild =
      !st || st.wakeMs !== dl.wakeMs || st.W !== W || st.H !== H || (needNearest && !st.nearest) || seedPress;
    // #2010 P4 (review) — the poem's meeting with the culture is a BOUNDARY act (F6): a mark the standing seed took is
    // the seed's for the whole wake, however its record changes under it. Without this, tapping the life chip (or
    // HOLD) mid-wake would re-class a seeded stamp as a bystander/terrain and draw it a second time beside its
    // dissolving copy; the change lands at the next wake or press, like every other boundary.
    const seeded = rebuild ? null : st.seededKeys;
    const stay = (it) => stays(it) && !(seeded && isPoemStamp(it) && seeded.has(it.key));
    const stayByLayer = content.map((e) => e.items.filter(stay));
    const terrain = [].concat(...stayByLayer).filter(isTerrain); // bedrock is terrain only — a bystander blocks nothing
    const bedrock = bedrockOf(terrain, W, H);
    if (rebuild) {
      const marks = [];
      for (const e of content) for (const it of e.items) if (it && !stays(it) && !isSpeck(it)) marks.push(freeze(it));
      if (!marks.length) {
        // #1994: a field stamp with no seedable marks — no field is running, so nothing may stay published
        if (fieldMode) {
          st = null;
          syncPublished();
          syncCulturePublication();
        }
        return false;
      }
      build(dl.wakeMs, marks, W, H, bedrock, needNearest, terrain);
      if (seedPress) st.seedEpoch = prevEpoch + 1; // the press's build supersedes the wake's seed
    } else {
      setBedrock(st.culture, bedrock);
      st.terrain = terrain.map(freeze); // the snapshot records the terrain the culture currently lives under
    }
    const quiet = dl.mode === 'quiet';
    st.quiet = quiet ? { strength: Number(dl.strength) || 0, cycleGens: Number(dl.cycleGens) || undefined } : null;
    const target = Math.max(0, Math.floor(Number(dl.gen) || 0));
    if (target < st.culture.gen) {
      // a replay seeking back: rebuild from the frozen seed, so generation g is always the same culture
      // #1923 Phase 4 — the rebuild is the SAME seed (possibly a press's), so its epoch is preserved:
      // the epoch names which seed of the wake this is, and seeking does not change the seed.
      const epoch = st.seedEpoch | 0;
      build(dl.wakeMs, st.marks, W, H, bedrock, needNearest, terrain);
      st.seedEpoch = epoch;
    }
    const shed = Math.max(0, Math.min(SHED_STEPS.length - 1, Number(dl.shed) | 0));
    // #1997 — the ferrofluid's birth bias lands before each generation it feeds (one frame
    // behind: fluidBias is the density published at the last applied frame). No bias handed in
    // → the loop is the pre-#1997 loop verbatim.
    for (let n = 0; st.culture.gen < target && n < SHED_STEPS[shed]; n++) {
      if (fluidBias) {
        injectFluidBirths(st.culture, fluidBias.density, fluidBias.strength, biasSeed());
        biasUsed = true;
      }
      stepCulture(st.culture);
    }
    st.fieldOn = fieldMode ? { cycleGens: Number(dl.cycleGens) || undefined } : null;
    syncPublished();
    syncCulturePublication();
    if (fieldMode) return true; // #1994: the field is published — no layer touched, nothing drawn, ever
    if (quiet) {
      // the secondary read: the culture is a field (field()) the marks read. The tertiary read: a few faint specks in
      // the gaps between marks ride the top content layer — added to it, never taking a mark's place.
      const speckList = specks
        ? speckItems(st.culture, st.marks, st.nearest, {
            ...geom(W, H),
            strength: st.quiet.strength,
            envelope: envelope(st.culture.gen, st.quiet.cycleGens),
          })
        : [];
      if (speckList.length) {
        const top = content[content.length - 1];
        top.items = top.items.filter((it) => !isSpeck(it)).concat(speckList); // never stack on a previous frame's specks
      }
      return true;
    }
    if (st.frameGen !== st.culture.gen) {
      st.frame = cultureFrame(st.marks, st.culture, st.nearest, geom(W, H));
      st.frameGen = st.culture.gen;
    }
    // draw: terrain stays on its own layer exactly as dealt; the culture frame rides the TOP content layer
    content.forEach((e, i) => {
      const own = stayByLayer[i];
      e.items = i === content.length - 1 ? own.concat(st.frame) : own;
    });
    return true;
  }

  return {
    apply,
    /** #1994 — the field mode's stable publication object (see syncPublished above). Read-only for consumers. */
    publishedField,
    /**
     * #1997 — this stage's culture publication for the ferrofluid's coupling read: the live
     * culture's published field (level / activity) on a stable object, or inactive when no
     * culture stands here. The resolver captures it before the frame's apply — one frame behind.
     */
    cultureField() {
      return culturePublication;
    },
    /**
     * #1997 — hand the culture its ferrofluid birth bias for the coming apply: the fluid
     * stage's published density (dish grid) + the stamped coupling strength. Null / strength 0
     * clears it, and a cleared bias leaves the step loop the pre-#1997 loop, number for number.
     */
    setFluidBias(density, strength) {
      fluidBias =
        density && density.length === cols * rows && Number(strength) > 0
          ? { density, strength: Math.min(1, Number(strength)) }
          : null;
    },
    reset() {
      st = null;
      syncPublished();
      syncCulturePublication();
    },
    /**
     * #1923 — the quiet culture's read-only sampler for the marks (the Kineme culture source), or null when no quiet
     * culture is running. It is the FIELD of the last applied frame: the marks read it one frame behind, which is
     * deterministic (the stamp stream decides it) and invisible (the culture moves at generation speed).
     */
    field() {
      return st && st.quiet ? cultureSampler(st.culture, { canvasW: st.W, canvasH: st.H, ...st.quiet }) : null;
    },
    get generation() {
      return st ? st.culture.gen : -1;
    },
    get active() {
      return !!st;
    },
    /** JSON-safe snapshot for a take that begins mid-culture (the #1367 surface). null when nothing is running. */
    snapshot() {
      return st
        ? {
            wakeMs: st.wakeMs,
            W: st.W,
            H: st.H,
            marks: st.marks.map((m) => ({ ...m })),
            // #1923 Phase 3 — OPTIONAL rider, present only while terrain stands: the terrain marks the
            // seed was derived against, so restore() rebuilds the same bedrock. Snapshots taken before
            // this rider (or on terrain-free stages) carry no key and restore exactly as they always did.
            ...(st.terrain && st.terrain.length ? { terrain: st.terrain.map((m) => ({ ...m })) } : {}),
            // #1923 Phase 4 — OPTIONAL rider, present only while a "seed from stage" press stands in
            // this wake (epoch > 0): restore() must keep the epoch, or a restored publication would
            // name its post-press grids with the wake seed's epoch and the TIDES key could collide
            // with a pre-press grid at the same generation. Epoch-0 snapshots carry no key and
            // restore exactly as they always did.
            ...(st.seedEpoch ? { seedEpoch: st.seedEpoch } : {}),
            gen: st.culture.gen,
            ...(st.quiet ? { quiet: { ...st.quiet } } : {}), // #1923 — the secondary read's dial rides the snapshot
            ...(st.fieldOn ? { field: { ...st.fieldOn } } : {}), // #1994 — so does field mode's cycle
            // #1997 — OPTIONAL riders, present only while this wake's steps consumed a
            // ferrofluid birth bias: the culture's state grid itself, and its field's activity
            // trace. The bias input changed while it acted (the fluid kept stepping), so the
            // state is not a replay of the seed marks — the grid rides, and restore() loads it
            // verbatim (the terrain rider's precedent applied to state). Snapshots taken with
            // the fluid off carry neither key and restore exactly as they always did.
            ...(biasUsed
              ? { fluidGrid: Array.from(st.culture.cur), fluidActivity: Array.from(st.culture.field.activity) }
              : {}),
          }
        : null;
    },
    /** Restore a snapshot(): rebuild from the frozen seed and step to the recorded generation. */
    restore(snap) {
      st = null;
      syncPublished();
      syncCulturePublication();
      if (!snap || !Array.isArray(snap.marks) || !snap.marks.length) return;
      const wasField = !!(snap.field && typeof snap.field === 'object');
      // #1923 Phase 3 — rebuild against the snapshot's terrain (absent = a pre-rider snapshot: no
      // bedrock, exactly the historical restore). Without it the restored seed paints over locked
      // ground and the culture diverges from the live one it claims to continue.
      const terrain = Array.isArray(snap.terrain) ? snap.terrain.map((m) => ({ ...m })) : [];
      build(
        snap.wakeMs,
        snap.marks.map((m) => ({ ...m })),
        snap.W,
        snap.H,
        bedrockOf(terrain, snap.W, snap.H),
        !wasField,
        terrain,
      );
      // #1997 — a snapshot whose culture grew under a ferrofluid bias carries its state grid
      // (fluidGrid): load it verbatim and set the generation, instead of replaying the seed
      // (absent = a snapshot the fluid never biased: the historical replay below, verbatim).
      const hasFluidGrid = Array.isArray(snap.fluidGrid) && snap.fluidGrid.length === cols * rows;
      const fluidActivity =
        hasFluidGrid && Array.isArray(snap.fluidActivity) && snap.fluidActivity.length === cols * rows
          ? snap.fluidActivity
          : null;
      if (hasFluidGrid && restoreCultureGrid(st.culture, snap.fluidGrid, fluidActivity)) {
        st.culture.gen = snap.gen | 0;
        st.culture.field.gen = st.culture.gen;
        biasUsed = true;
      } else {
        for (let g = 0; g < (snap.gen | 0); g++) stepCulture(st.culture);
      }
      // #1923 Phase 4 — the seed epoch rides the snapshot (absent = a pre-Phase-4 snapshot: epoch 0,
      // the wake's own seed — exactly the historical restore).
      st.seedEpoch = Number.isInteger(snap.seedEpoch) && snap.seedEpoch > 0 ? snap.seedEpoch : 0;
      if (snap.quiet && typeof snap.quiet === 'object') {
        st.quiet = { strength: Number(snap.quiet.strength) || 0, cycleGens: Number(snap.quiet.cycleGens) || undefined };
      }
      if (wasField) st.fieldOn = { cycleGens: Number(snap.field.cycleGens) || undefined };
      syncPublished();
      syncCulturePublication();
    },
  };
}
