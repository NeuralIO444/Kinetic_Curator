// engine/dishCreature.js — #1634 slice 2: the DISH creature's body. Pure but for its own per-pin state.
//
// The second family (Matt, 2026-10-16: two families — the field-formed moth line and this dish-contact line,
// distinct, neither a rebuild of the other). The approved creature-system plan, Step 7: "Skeleton bound to
// XPBD discs: the H-designated disc (or pin disc) is the head/root; spine = linked discs." This slice is the
// body itself: a formed pin becomes a HEAD disc, and a spine of body discs forms behind it, compounded by
// D3's own solver (engine/dishLinks.mjs solveDishLinks — the same XPBD pass, the same compliance law; no
// second body mechanism). Slice 3 grows the limb at the L anchor; slice 4 brings the band material reaction
// and Davis's birth traits. The skin here is the discs themselves, wearing SLIME — its debut, on the dish
// creature (ruling 7: "it is the wet one").
//
// HOSTING (the MVP rule, recorded on #1634): the FIRST formed pin hosts the dish creature; the remaining
// formed pins host moths as they always have (engine/creature.js skips a hosted pin). The decision rides
// the resolver input (`dishHosted`, computed by curator/formationLive.js from the same formed states the
// moth reads), so a take records it and replays it, exactly like dishFormed / dishLimbs / dishTraits. With
// no `dishHosted` on the input the builder does nothing and the moth is exactly as before.
//
// MOTION: the head is steered toward the pin's hover point — the SAME hover law the moth obeys
// (engine/creature.js hoverPose: the layer's living-motion floor, anchored on the pin) — and the body is
// NOT placed: it follows through the links, with momentum, drag, and the solver's velocity fold. That lag
// is the difference between a physics creature and a stamp. Everything is counted in resolver frames and
// derived from the seed: no clock, no chance, so a recorded take replays the same animal.
import { solveDishLinks } from './dishLinks.mjs';
import { hoverPose, groundTreatment } from './creature.js';
import { hashU01 } from './kernel/rng.js';
import { hexToRgb255, rgb255ToHex } from './colorHex.mjs';

export const DISH_CREATURE = Object.freeze({
  asset: 'org_blob_01', // the disc: a plump organic round, tinted by the palette like every mark
  headR: 27, // scene px: the head disc's radius — the largest, it leads
  bodyR: Object.freeze([22, 19, 16, 13]), // the spine discs, tapering to the tail
  restOverlap: 0.82, // link rest = (rA + rB) * this: discs overlap a little, so the compound reads as one animal, not beads
  braceStiffness: 0.85, // the skip-one links that hold the body's curve: stiff, not rigid
  braceRest: 0.97, // of the two chain rests they span: a touch taut, so the spine keeps a gentle arc
  headPull: 0.085, // per-frame spring of the head toward its hover point
  headDamp: 0.8, // velocity kept per frame by the head (it glides, it does not snap)
  bodyDamp: 0.9, // velocity kept per frame by a body disc (the follow-through)
  headMass: 3, // the head outweighs a body disc 3:1 in the solve: it leads, they follow
  stagger: 6, // frames between one disc's birth and the next (the body sprouts disc by disc)
  growFrames: 30, // frames for one disc to ease to full size
});

/** All disc radii, head first. */
export const DISH_RADII = Object.freeze([DISH_CREATURE.headR, ...DISH_CREATURE.bodyR]);
const N_DISCS = DISH_RADII.length;

/** Chain rests (head→1, 1→2, ...) from the overlap rule. */
export const DISH_CHAIN_RESTS = Object.freeze(
  DISH_RADII.slice(1).map((r, i) => (DISH_RADII[i] + r) * DISH_CREATURE.restOverlap),
);

/**
 * The declared links for one creature's compound, in declaration order (the solver's order): the chain,
 * then the skip-one braces. Indices are the creature's own disc slots. Rests are DECLARED data, computed
 * from the radii — never latched from live positions (dishLinks' purity rule).
 */
export function dishCompoundLinks() {
  const out = [];
  for (let i = 0; i < N_DISCS - 1; i++) out.push({ a: i, b: i + 1, rest: DISH_CHAIN_RESTS[i], stiffness: 1 });
  for (let i = 0; i < N_DISCS - 2; i++) {
    out.push({ a: i, b: i + 2, rest: (DISH_CHAIN_RESTS[i] + DISH_CHAIN_RESTS[i + 1]) * DISH_CREATURE.braceRest, stiffness: DISH_CREATURE.braceStiffness });
  }
  return out;
}
const LINKS = dishCompoundLinks();

const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);

/** How colourful a #rrggbb is: max channel minus min channel. Anything else reads 0. (The moth's rule.) */
function chroma(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return 0;
  const v = parseInt(m[1], 16);
  return Math.max((v >> 16) & 255, (v >> 8) & 255, v & 255) - Math.min((v >> 16) & 255, (v >> 8) & 255, v & 255);
}

/** Scale a #rrggbb toward black (f < 1) or white (f > 1 mixes up): the slime's shades, derived, never picked. */
function shade(hex, f) {
  const c = hexToRgb255(hex);
  const m = (v) => Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1));
  return rgb255ToHex([m(c[0]), m(c[1]), m(c[2])]);
}

const TAU = Math.PI * 2;

/** One creature's state: the discs as a tiny particle system the D3 solver can read directly. */
function birthState(seed, pinIndex, pin) {
  const ang = hashU01(seed >>> 0, 'dishbody', pinIndex) * TAU; // the seeded direction the spine trails at birth
  const dx = Math.cos(ang); const dy = Math.sin(ang);
  const x = new Float64Array(N_DISCS); const y = new Float64Array(N_DISCS);
  let back = 0;
  for (let k = 0; k < N_DISCS; k++) {
    if (k > 0) back += DISH_CHAIN_RESTS[k - 1];
    x[k] = pin.x - dx * back; y[k] = pin.y - dy * back;
  }
  return {
    pinX: pin.x, pinY: pin.y, age: 0, headingDeg: (ang * 180) / Math.PI + 180,
    sys: {
      n: N_DISCS, x, y,
      vx: new Float64Array(N_DISCS), vy: new Float64Array(N_DISCS),
      mass: Float64Array.from(DISH_RADII.map((_, k) => (k === 0 ? DISH_CREATURE.headMass : 1))),
      alive: new Uint8Array(N_DISCS), spine: DISH_RADII.map(() => []),
    },
  };
}

/**
 * The builder the resolver owns, sibling to the moth's. `append(input, entries, pool, motionFor, groundFor)`
 * adds the dish creature's discs to the TOP content layer's items, after the moths. It acts only on pins the
 * input marks hosted (`input.dishHosted`); with none, it does nothing at all (byte-identical stage).
 */
export function createDishCreatureBuilder() {
  const states = []; // per pin: birthState() | null
  let frameBodies = []; // the last appended frame's discs, per pin: [{ x, y, r, head }] | null

  const growthOf = (st, k) => {
    const t = (st.age - k * DISH_CREATURE.stagger) / DISH_CREATURE.growFrames;
    return t <= 0 ? 0 : easeOut(Math.min(1, t));
  };

  return {
    append(input, entries, pool, motionFor = null, groundFor = null) {
      frameBodies = [];
      const pins = input && input.dishPins;
      const formed = input && input.dishFormed;
      const hosted = input && input.dishHosted;
      if (!Array.isArray(pins) || !Array.isArray(formed) || !Array.isArray(hosted) || !hosted.some(Boolean)) {
        states.length = 0;
        return;
      }
      let top = null;
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e && !e.isFx && !e.isPattern && Array.isArray(e.items)) { top = e; break; }
      }
      if (!top) { states.length = 0; return; }
      const pal = top.palette || {};
      const swatches = pal.swatches || [];
      const ink = typeof pal.ink === 'string' ? pal.ink : '#101418';
      const ranked = swatches.map((c, n) => ({ c, n })).sort((a, b) => chroma(b.c) - chroma(a.c) || a.n - b.n).map((e) => e.c);
      const pick = (r) => ranked[Math.min(ranked.length - 1, Math.max(0, r))] || ink;
      // Slime's colours, all from the palette (the 4x4x4 discipline: no ad-hoc picks): the head wears the
      // most vivid swatch, the spine the next rank down; shades are derived from those two, never chosen.
      const headBase = pick(0);
      const bodyBase = pick(1);
      const motion = input.reducedMotion || typeof motionFor !== 'function' ? null : motionFor(top);
      const ground = typeof groundFor === 'function' ? groundFor(top) : null;
      const extra = [];
      for (let i = 0; i < pins.length; i++) {
        const pin = pins[i];
        const live = !!(hosted[i] && formed[i] && pin && Number.isFinite(pin.x) && Number.isFinite(pin.y));
        if (!live) { states[i] = null; frameBodies[i] = null; continue; }
        let st = states[i];
        if (!st || st.pinX !== pin.x || st.pinY !== pin.y) { st = birthState(input.seed, i, pin); states[i] = st; }
        st.age += 1;
        const sys = st.sys;
        // Born discs are alive for the solver; unborn ones wait at the head, weightless to the gate.
        for (let k = 0; k < N_DISCS; k++) sys.alive[k] = st.age > k * DISH_CREATURE.stagger ? 1 : 0;
        // The head's hover point: the pin, on the layer's living-motion floor, on the ground the marks obey.
        const hover = hoverPose(motion, top.morphSeed ?? input.seed, i);
        const gt = groundTreatment(ground, pin.x, pin.y, i, input.seed, input.seedOffsets || null);
        const tx = pin.x + hover.dx + gt.dx;
        const ty = pin.y + hover.dy + gt.dy;
        // PREDICT: steer the head, damp everything, integrate. The solver does the rest.
        sys.vx[0] = (sys.vx[0] + (tx - sys.x[0]) * DISH_CREATURE.headPull) * DISH_CREATURE.headDamp;
        sys.vy[0] = (sys.vy[0] + (ty - sys.y[0]) * DISH_CREATURE.headPull) * DISH_CREATURE.headDamp;
        for (let k = 0; k < N_DISCS; k++) {
          if (!sys.alive[k]) { sys.x[k] = sys.x[0]; sys.y[k] = sys.y[0]; sys.vx[k] = 0; sys.vy[k] = 0; continue; }
          if (k > 0) { sys.vx[k] *= DISH_CREATURE.bodyDamp; sys.vy[k] *= DISH_CREATURE.bodyDamp; }
          sys.x[k] += sys.vx[k]; sys.y[k] += sys.vy[k];
        }
        // SOLVE: D3's XPBD pass over the declared compound. It folds its corrections back into velocity.
        solveDishLinks(sys, LINKS, 1);
        // Heading: where the head is going, else where the spine says it faces. Turned toward, never snapped.
        const speed = Math.hypot(sys.vx[0], sys.vy[0]);
        let target = st.headingDeg;
        if (speed > 0.05) target = (Math.atan2(sys.vy[0], sys.vx[0]) * 180) / Math.PI;
        else if (sys.alive[1]) target = (Math.atan2(sys.y[0] - sys.y[1], sys.x[0] - sys.x[1]) * 180) / Math.PI;
        let turn = ((target - st.headingDeg + 540) % 360) - 180;
        st.headingDeg += turn * 0.18;
        const headRad = (st.headingDeg * Math.PI) / 180;
        // DRAW: three items a disc — a deepened underlay (the wet rim), the body, a bright core (the gloss) —
        // plus the head's eye. All _creature, so the animal never feeds the crowd that formed it.
        const mine = [];
        const discs = [];
        for (let k = 0; k < N_DISCS; k++) {
          const g = growthOf(st, k);
          discs.push({ x: sys.x[k], y: sys.y[k], r: DISH_RADII[k], head: k === 0 });
          if (g <= 0) continue;
          const base = k === 0 ? headBase : bodyBase;
          const [color] = gt.recolor(base, ink);
          const s = (2 * DISH_RADII[k] / 100) * g * hover.scale;
          const rot = k === 0 ? st.headingDeg : (Math.atan2(sys.y[k] - sys.y[k - 1], sys.x[k] - sys.x[k - 1]) * 180) / Math.PI;
          const put = (scaleMul, col, alpha, tag, ox = 0, oy = 0) => mine.push({
            x: sys.x[k] + ox, y: sys.y[k] + oy, scale: s * scaleMul, scaleY: s * scaleMul, rotation: rot, alpha,
            assetId: DISH_CREATURE.asset, color: col, accent: col, key: `dish:${i}:${k}:${tag}`, zTier: 0, seedOffset: 0,
            glass: false, _creature: true,
          });
          put(1.14, shade(color, 0.55), 96, 'rim');
          put(1, color, 98, 'body');
          put(0.52, shade(color, 1.5), 100, 'core', -DISH_RADII[k] * 0.16 * g, -DISH_RADII[k] * 0.16 * g);
          if (k === 0) {
            mine.push({
              x: sys.x[0] + Math.cos(headRad) * DISH_RADII[0] * 0.38 * g, y: sys.y[0] + Math.sin(headRad) * DISH_RADII[0] * 0.38 * g,
              scale: s * 0.17, scaleY: s * 0.17, rotation: 0, alpha: 100,
              assetId: DISH_CREATURE.asset, color: ink, accent: ink, key: `dish:${i}:0:eye`, zTier: 0, seedOffset: 0,
              glass: false, _creature: true,
            });
          }
        }
        frameBodies[i] = discs;
        extra.push(...mine);
      }
      states.length = pins.length;
      frameBodies.length = pins.length;
      if (extra.length) top.items = [...top.items, ...extra];
    },
    /** The last appended frame's discs per pin ([{ x, y, r, head }] | null): the suite's and a debugger's read. */
    lastBodies() { return frameBodies; },
    dispose() { states.length = 0; frameBodies = []; },
  };
}
