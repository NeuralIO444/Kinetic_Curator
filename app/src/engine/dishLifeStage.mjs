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

import { createCulture, stepCulture, setBedrock, CULTURE_RULE } from './dishLife.mjs';
import { seedFromMarks, coverageField } from './dishLifeSeed.mjs';
import { nearestMarks, cultureFrame, speckItems } from './dishLifeRender.mjs';
import { cultureSampler, envelope } from './dishLifeQuiet.mjs';

/** Culture grid resolution (the spike's grid). */
export const STAGE_COLS = 96;
export const STAGE_ROWS = 54;
/** Most generations stepped in one frame, by governor shed level 0/1/2: catch up, trickle, hold. */
export const SHED_STEPS = Object.freeze([4, 1, 0]);

/** A mark that is terrain: a held FIELD poem, a locked look. */
/** A tertiary speck this stage drew (never a seed, never a mark). */
export const isSpeck = (it) => !!it && typeof it.key === 'string' && it.key.startsWith('speck:');
export const isTerrain = (it) => !!it && (it.held === true || it.locked === true);

// the frozen seed keeps the WHOLE mark (shallow copy): the dissolving scene is drawn from it, and the cells inherit
// every field of the nearest one (glass/plate/wash/stipple/matParams/key…), so a wake never pops the Look
const freeze = (it) => ({ ...it });

const contentLayers = (layers) =>
  Array.isArray(layers) ? layers.filter((e) => e && !e.isFx && !e.isPattern && Array.isArray(e.items)) : [];

export function createDishLifeStage({ cols = STAGE_COLS, rows = STAGE_ROWS, rule = CULTURE_RULE } = {}) {
  let st = null; // { wakeMs, W, H, marks, nearest, culture, frameGen, frame }

  const geom = (W, H) => ({ canvasW: W, canvasH: H, cols, rows });

  function build(wakeMs, marks, W, H, bedrock) {
    const seed = seedFromMarks(marks, { ...geom(W, H), bedrock });
    st = {
      wakeMs,
      W,
      H,
      marks,
      nearest: nearestMarks(marks, geom(W, H)),
      culture: createCulture({ cols, rows, rule, bedrock, seed: seed.cells }),
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
      return false;
    }
    const content = contentLayers(layers);
    if (!content.length) return false;
    const terrainByLayer = content.map((e) => e.items.filter(isTerrain));
    const terrain = [].concat(...terrainByLayer);
    const bedrock = bedrockOf(terrain, W, H);
    if (!st || st.wakeMs !== dl.wakeMs || st.W !== W || st.H !== H) {
      const marks = [];
      for (const e of content)
        for (const it of e.items) if (it && !isTerrain(it) && !isSpeck(it)) marks.push(freeze(it));
      if (!marks.length) return false;
      build(dl.wakeMs, marks, W, H, bedrock);
    } else {
      setBedrock(st.culture, bedrock);
    }
    const quiet = dl.mode === 'quiet';
    st.quiet = quiet ? { strength: Number(dl.strength) || 0, cycleGens: Number(dl.cycleGens) || undefined } : null;
    const target = Math.max(0, Math.floor(Number(dl.gen) || 0));
    if (target < st.culture.gen) {
      // a replay seeking back: rebuild from the frozen seed, so generation g is always the same culture
      build(dl.wakeMs, st.marks, W, H, bedrock);
    }
    const shed = Math.max(0, Math.min(SHED_STEPS.length - 1, Number(dl.shed) | 0));
    for (let n = 0; st.culture.gen < target && n < SHED_STEPS[shed]; n++) stepCulture(st.culture);
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
      const own = terrainByLayer[i];
      e.items = i === content.length - 1 ? own.concat(st.frame) : own;
    });
    return true;
  }

  return {
    apply,
    reset() {
      st = null;
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
            gen: st.culture.gen,
            ...(st.quiet ? { quiet: { ...st.quiet } } : {}), // #1923 — the secondary read's dial rides the snapshot
          }
        : null;
    },
    /** Restore a snapshot(): rebuild from the frozen seed and step to the recorded generation. */
    restore(snap) {
      st = null;
      if (!snap || !Array.isArray(snap.marks) || !snap.marks.length) return;
      build(
        snap.wakeMs,
        snap.marks.map((m) => ({ ...m })),
        snap.W,
        snap.H,
        null,
      );
      for (let g = 0; g < (snap.gen | 0); g++) stepCulture(st.culture);
      if (snap.quiet && typeof snap.quiet === 'object') {
        st.quiet = { strength: Number(snap.quiet.strength) || 0, cycleGens: Number(snap.quiet.cycleGens) || undefined };
      }
    },
  };
}
