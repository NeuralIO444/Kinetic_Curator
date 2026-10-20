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
//
// SLICE 3 — THE LIMB (this file's second half): the artist's L markers (slice 1: attach-point roles in
// engine/assetAttach.js, read through engine/autoAttach.js attachPointsFor — the artist's edit wins,
// auto-derived points carry no role, so an unmarked asset grows NO limb) each grow one limb on the dish
// creature: a tapering chain of smaller slime discs in the SAME particle system, compounded by the same
// solver — a root link tucks the first limb disc onto the head's rim at the anchor the L point names
// (its direction from the asset box's centre, rotated by the head's heading, so the limb rides the head
// as it turns), and chain links carry the rest. WHETHER and HOW MUCH is the dish's decision, not the
// artist's: the pin's dish pressure (`input.dishPressure`, curator/formationLive.js getDishPressures —
// the same quantized density the formation rule judged) is the limb's growth target. Growth is counted
// in frames toward that target and never runs backward in this slice: pressure 0 grows nothing (the
// control), half pressure grows half a limb, full pressure the whole chain. Withering is slice 4.
//
// SLICE 4 — THE BAND'S MATERIAL + DAVIS'S BIRTH TRAITS: the dish family joins the moth's two standing
// systems. (1) THE BAND, read as MATERIAL (the ruling: the reaction leads with material): the frame's
// pose (engine/creaturePose.js — the same blend the moth poses by, thresholds in curator/stress.js)
// drives the slime's body: its bodyScale plumps the drawn discs (1.10 at the Relax flourish, 0.93
// withered) and its dim dries them — colour mixed toward the ink, the gloss core going matte. The
// solver's declared rests do not move: a starved creature's discs shrink inside their spacing, which
// is what starving looks like. No band on the input (every older take) = no pose = the neutral
// material, byte-identical. (2) DAVIS'S TRAITS, stamped at birth like the moth's: the pin's
// `dishTraits` are read ONCE when the creature is born — body scales the disc radii the compound is
// declared from, swatch shifts the palette ranks the slime wears. A trait that changes mid-life
// changes nothing: the stamp is the animal.
import { solveDishLinks } from './dishLinks.mjs';
import { hoverPose, groundTreatment, normalizeTraits } from './creature.js';
import { creaturePose } from './creaturePose.js';
import { attachPointsFor } from './autoAttach.js';
import { hashU01 } from './kernel/rng.js';
import { encodeTyped, decodeTyped } from './kernel/stateCodec.mjs'; // #1367 — birth-state snapshots
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
  limbR: Object.freeze([10, 8.5, 7, 5.5, 4.5]), // slice 3: one limb's discs, root to tip, tapering
  limbGrowSpan: 150, // frames for a limb's growth to cross 0..1 at full pressure (counted, like every birth here)
  limbRootRest: 0.55, // the root link's rest, of (headR + limb root r): tucked onto the head's rim, not beside it
  anchorEmbed: 0.7, // the anchor sits at headR * this from the head's centre, along the L point's direction
  limbRootPull: 0.3, // per-frame spring of a limb's root disc toward its anchor point on the head
  limbRootDamp: 0.75, // velocity kept per frame by a limb root (it clings)
  limbDamp: 0.88, // velocity kept per frame by a limb disc (a little whip behind the root)
  limbMass: 0.6, // a limb disc in the solve: lighter than a body disc, it is carried
  dryMix: 0.45, // slice 4: at full wither (pose dim 0.5), the slime's colour dries this far toward the ink
  coreMatte: 0.35, // slice 4: the gloss core's alpha floor factor — a withered slime goes matte, never fully dull
});

/** One limb's disc radii, root first (slice 3). */
export const DISH_LIMB_RADII = DISH_CREATURE.limbR;
const LIMB_N = DISH_LIMB_RADII.length;

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
/** The compound's links declared from a radii set (slice 4: a trait-stamped body declares its own). */
function compoundLinks(radii) {
  const rests = radii.slice(1).map((r, i) => (radii[i] + r) * DISH_CREATURE.restOverlap);
  const out = [];
  for (let i = 0; i < radii.length - 1; i++) out.push({ a: i, b: i + 1, rest: rests[i], stiffness: 1 });
  for (let i = 0; i < radii.length - 2; i++) {
    out.push({ a: i, b: i + 2, rest: (rests[i] + rests[i + 1]) * DISH_CREATURE.braceRest, stiffness: DISH_CREATURE.braceStiffness });
  }
  return out;
}
export function dishCompoundLinks() {
  return compoundLinks(DISH_RADII);
}

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

/** Mix two #rrggbb colours, t of the second (slice 4: the slime drying toward the ink as the band dims). */
function mixHex(a, b, t) {
  if (!(t > 0)) return a;
  const ca = hexToRgb255(a); const cb = hexToRgb255(b);
  const k = Math.min(1, t);
  return rgb255ToHex([0, 1, 2].map((i) => Math.round(ca[i] + (cb[i] - ca[i]) * k)));
}

const TAU = Math.PI * 2;

/**
 * The declared links for one limb (slice 3), in the creature's own slot space (body slots first, then
 * limb j's slots at N_DISCS + j*LIMB_N): the root link onto the head, then the chain. Declared data like
 * the body's — rests from the radii, never latched from live positions.
 */
/** One limb's links declared from a head radius and a limb radii set (slice 4: trait-stamped sets). */
function limbLinks(limbIndex, headR, limbRadii) {
  const base = N_DISCS + limbIndex * LIMB_N;
  const rootRest = (headR + limbRadii[0]) * DISH_CREATURE.limbRootRest;
  const chain = limbRadii.slice(1).map((r, k) => (limbRadii[k] + r) * DISH_CREATURE.restOverlap);
  const out = [{ a: 0, b: base, rest: rootRest, stiffness: 0.9 }];
  for (let k = 0; k < LIMB_N - 1; k++) out.push({ a: base + k, b: base + k + 1, rest: chain[k], stiffness: 1 });
  // The body's own trick, reused: skip-one braces hold the chain's extension (a fold compresses a brace
  // and the solver pushes back), and one brace from the head holds the root segment's line.
  for (let k = 0; k < LIMB_N - 2; k++) {
    out.push({ a: base + k, b: base + k + 2, rest: (chain[k] + chain[k + 1]) * DISH_CREATURE.braceRest, stiffness: DISH_CREATURE.braceStiffness });
  }
  out.push({ a: 0, b: base + 1, rest: (rootRest + chain[0]) * DISH_CREATURE.braceRest, stiffness: 0.7 });
  return out;
}
export function dishLimbLinks(limbIndex) {
  return limbLinks(limbIndex, DISH_CREATURE.headR, DISH_LIMB_RADII);
}

/** One creature's state: the discs as a tiny particle system the D3 solver can read directly. */
function birthState(seed, pinIndex, pin, limbDirs, sig, rawTraits) {
  // Slice 4 — Davis's stamp, taken once, here: body scales the radii the compound is declared from,
  // swatch shifts the colour ranks. The defaults are exactly the unstamped animal.
  const tr = normalizeTraits(rawTraits);
  const radii = DISH_RADII.map((r) => r * tr.body);
  const limbRadii = DISH_LIMB_RADII.map((r) => r * tr.body);
  const rests = radii.slice(1).map((r, i) => (radii[i] + r) * DISH_CREATURE.restOverlap);
  const ang = hashU01(seed >>> 0, 'dishbody', pinIndex) * TAU; // the seeded direction the spine trails at birth
  const dx = Math.cos(ang); const dy = Math.sin(ang);
  const nSlots = N_DISCS + limbDirs.length * LIMB_N;
  const x = new Float64Array(nSlots); const y = new Float64Array(nSlots);
  let back = 0;
  for (let k = 0; k < N_DISCS; k++) {
    if (k > 0) back += rests[k - 1];
    x[k] = pin.x - dx * back; y[k] = pin.y - dy * back;
  }
  for (let s = N_DISCS; s < nSlots; s++) { x[s] = pin.x; y[s] = pin.y; } // unborn limb discs wait at the pin
  const mass = new Float64Array(nSlots);
  for (let s = 0; s < nSlots; s++) mass[s] = s === 0 ? DISH_CREATURE.headMass : s < N_DISCS ? 1 : DISH_CREATURE.limbMass;
  let links = compoundLinks(radii);
  if (limbDirs.length) {
    links = links.slice();
    for (let j = 0; j < limbDirs.length; j++) links.push(...limbLinks(j, radii[0], limbRadii));
  }
  return {
    pinX: pin.x, pinY: pin.y, age: 0, headingDeg: (ang * 180) / Math.PI + 180, sig, links,
    radii, limbRadii, swatch: tr.swatch,
    limbDirs, grown: new Float64Array(limbDirs.length), // per limb: growth 0..1, toward the pressure target
    sys: {
      n: nSlots, x, y,
      vx: new Float64Array(nSlots), vy: new Float64Array(nSlots),
      mass, alive: new Uint8Array(nSlots), spine: Array.from({ length: nSlots }, () => []),
    },
  };
}

/**
 * The host asset's L-marked attach points as unit directions from the box centre (slice 3). The
 * artist's edit wins (attachPointsFor); a point at the very centre has no direction and points down.
 * No L anywhere → no limbs: the markers choose where, or nothing grows.
 */
export function dishLimbDirs(pool, assetAttach) {
  let pts = null;
  const own = assetAttach ? assetAttach[DISH_CREATURE.asset] : undefined;
  if (Array.isArray(own)) pts = own;
  else {
    const asset = Array.isArray(pool) ? pool.find((a) => a && a.id === DISH_CREATURE.asset) : null;
    if (asset) pts = attachPointsFor(asset, assetAttach);
  }
  if (!Array.isArray(pts)) return [];
  const out = [];
  for (const p of pts) {
    if (!p || p.role !== 'L' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const dx = p.x - 50; const dy = p.y - 50;
    const m = Math.hypot(dx, dy);
    out.push(m > 1 ? { x: dx / m, y: dy / m } : { x: 0, y: 1 });
  }
  return out;
}

/**
 * The builder the resolver owns, sibling to the moth's. `append(input, entries, pool, motionFor, groundFor)`
 * adds the dish creature's discs to the TOP content layer's items, after the moths. It acts only on pins the
 * input marks hosted (`input.dishHosted`); with none, it does nothing at all (byte-identical stage).
 */

// #1367 — birth-state snapshot helpers. A birth state is plain data plus typed arrays
// (disc positions/velocities/mass/alive, per-limb growth): typed arrays ride the state
// codec (recognised on restore by the record's {kind, length, b64} shape), everything
// else deep-copies as JSON data. Restore builds a whole new state or returns null —
// the caller's swap is the commit point, so a refused restore changes nothing.
const isCodecRecord = (v) => v != null && typeof v === 'object' && typeof v.b64 === 'string' && Number.isInteger(v.length) && typeof v.kind === 'string';
const deepCopyData = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function snapDishCreatureState(st) {
  if (!st) return null;
  const out = {};
  for (const [k, v] of Object.entries(st)) {
    if (k === 'sys') continue;
    out[k] = ArrayBuffer.isView(v) ? encodeTyped(v) : deepCopyData(v);
  }
  const sys = {};
  for (const [k, v] of Object.entries(st.sys || {})) sys[k] = ArrayBuffer.isView(v) ? encodeTyped(v) : deepCopyData(v);
  out.sys = sys;
  return out;
}

function restoreDishCreatureState(rec) {
  if (!rec || typeof rec !== 'object' || !rec.sys || typeof rec.sys !== 'object') return null;
  const build = (src) => {
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      if (isCodecRecord(v)) {
        const arr = decodeTyped(v);
        if (!arr) return null;
        out[k] = arr;
      } else {
        out[k] = deepCopyData(v);
      }
    }
    return out;
  };
  const sys = build(rec.sys);
  if (!sys) return null;
  const st = build(Object.fromEntries(Object.entries(rec).filter(([k]) => k !== 'sys')));
  if (!st) return null;
  st.sys = sys;
  return st;
}

export function createDishCreatureBuilder() {
  const states = []; // per pin: birthState() | null
  let frameBodies = []; // the last appended frame's discs, per pin: [{ x, y, r, head }] | null
  let frame = 0; // slice 4 — the builder's own frame count (the pose's time), like the moth's: every append counts

  const growthOf = (st, k) => {
    const t = (st.age - k * DISH_CREATURE.stagger) / DISH_CREATURE.growFrames;
    return t <= 0 ? 0 : easeOut(Math.min(1, t));
  };

  return {
    append(input, entries, pool, motionFor = null, groundFor = null) {
      const myFrame = frame; frame += 1; // every resolver frame counts, even one that appends nothing
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
      // (Slice 4: each pin's ranks shift by its birth-stamped swatch trait — the picks happen per pin.)
      // Slice 4 — the frame's material, from the band's pose: bodyScale plumps or starves the drawn
      // discs, dim dries the slime (colour toward the ink, the gloss core matte). No band on the input:
      // no pose, the neutral material — the stage is byte-identical to the pre-slice animal.
      const pose = creaturePose({ band: input.band, stress: input.smoothed, frame: myFrame });
      const matScale = pose ? pose.bodyScale : 1;
      const matDim = pose ? pose.dim : 1;
      const dryT = (1 - matDim) * DISH_CREATURE.dryMix;
      const coreAlpha = Math.round(100 * (DISH_CREATURE.coreMatte + (1 - DISH_CREATURE.coreMatte) * matDim));
      const motion = input.reducedMotion || typeof motionFor !== 'function' ? null : motionFor(top);
      const ground = typeof groundFor === 'function' ? groundFor(top) : null;
      // Slice 3: the host asset's L anchors for this frame. A change in the set rebirths the creature,
      // like a pin move does: the limb layout is birth data, not a live edit.
      const limbDirs = dishLimbDirs(pool, input.assetAttach);
      const limbSig = limbDirs.map((d) => `${d.x.toFixed(3)},${d.y.toFixed(3)}`).join(';');
      const extra = [];
      for (let i = 0; i < pins.length; i++) {
        const pin = pins[i];
        const live = !!(hosted[i] && formed[i] && pin && Number.isFinite(pin.x) && Number.isFinite(pin.y));
        if (!live) { states[i] = null; frameBodies[i] = null; continue; }
        let st = states[i];
        if (!st || st.pinX !== pin.x || st.pinY !== pin.y || st.sig !== limbSig) { st = birthState(input.seed, i, pin, limbDirs, limbSig, input.dishTraits && input.dishTraits[i]); states[i] = st; }
        const headBase = pick(st.swatch);
        const bodyBase = pick(st.swatch + 1);
        st.age += 1;
        const sys = st.sys;
        // Born discs are alive for the solver; unborn ones wait at the head, weightless to the gate.
        for (let k = 0; k < N_DISCS; k++) sys.alive[k] = st.age > k * DISH_CREATURE.stagger ? 1 : 0;
        // Slice 3 — growth: each limb's grown fraction walks toward the pin's pressure (counted frames,
        // never backward in this slice), and a limb disc is alive once growth has crossed its band.
        const pressure = Array.isArray(input.dishPressure) ? input.dishPressure[i] : 0;
        const pTarget = pressure > 0 ? Math.min(1, pressure) : 0;
        for (let j = 0; j < st.limbDirs.length; j++) {
          if (st.grown[j] < pTarget) st.grown[j] = Math.min(pTarget, st.grown[j] + 1 / DISH_CREATURE.limbGrowSpan);
          for (let k = 0; k < LIMB_N; k++) sys.alive[N_DISCS + j * LIMB_N + k] = st.grown[j] * LIMB_N - k > 0 ? 1 : 0;
        }
        // The head's hover point: the pin, on the layer's living-motion floor, on the ground the marks obey.
        const hover = hoverPose(motion, top.morphSeed ?? input.seed, i);
        const gt = groundTreatment(ground, pin.x, pin.y, i, input.seed, input.seedOffsets || null);
        const tx = pin.x + hover.dx + gt.dx;
        const ty = pin.y + hover.dy + gt.dy;
        // PREDICT: steer the head, spring each limb's root to its anchor on the head, damp the rest,
        // integrate. The solver does the rest.
        sys.vx[0] = (sys.vx[0] + (tx - sys.x[0]) * DISH_CREATURE.headPull) * DISH_CREATURE.headDamp;
        sys.vy[0] = (sys.vy[0] + (ty - sys.y[0]) * DISH_CREATURE.headPull) * DISH_CREATURE.headDamp;
        const cosH = Math.cos((st.headingDeg * Math.PI) / 180);
        const sinH = Math.sin((st.headingDeg * Math.PI) / 180);
        for (let s = 0; s < sys.n; s++) {
          if (!sys.alive[s]) { sys.x[s] = sys.x[0]; sys.y[s] = sys.y[0]; sys.vx[s] = 0; sys.vy[s] = 0; continue; }
          if (s === 0) { /* the head: steered above */ }
          else if (s < N_DISCS) { sys.vx[s] *= DISH_CREATURE.bodyDamp; sys.vy[s] *= DISH_CREATURE.bodyDamp; }
          else {
            const j = ((s - N_DISCS) / LIMB_N) | 0; const k = (s - N_DISCS) % LIMB_N;
            if (k === 0) {
              const d = st.limbDirs[j];
              const ax = sys.x[0] + (d.x * cosH - d.y * sinH) * st.radii[0] * DISH_CREATURE.anchorEmbed;
              const ay = sys.y[0] + (d.x * sinH + d.y * cosH) * st.radii[0] * DISH_CREATURE.anchorEmbed;
              sys.vx[s] = (sys.vx[s] + (ax - sys.x[s]) * DISH_CREATURE.limbRootPull) * DISH_CREATURE.limbRootDamp;
              sys.vy[s] = (sys.vy[s] + (ay - sys.y[s]) * DISH_CREATURE.limbRootPull) * DISH_CREATURE.limbRootDamp;
            } else { sys.vx[s] *= DISH_CREATURE.limbDamp; sys.vy[s] *= DISH_CREATURE.limbDamp; }
          }
          sys.x[s] += sys.vx[s]; sys.y[s] += sys.vy[s];
        }
        // SOLVE: D3's XPBD pass over the declared compound (body links + this state's limb links).
        // It folds its corrections back into velocity.
        solveDishLinks(sys, st.links, 1);
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
          discs.push({ x: sys.x[k], y: sys.y[k], r: st.radii[k], head: k === 0 });
          if (g <= 0) continue;
          const base = k === 0 ? headBase : bodyBase;
          const [wet] = gt.recolor(base, ink);
          const color = mixHex(wet, ink, dryT); // slice 4: the band dries the slime toward the ink
          const s = (2 * st.radii[k] / 100) * g * hover.scale * matScale;
          const rot = k === 0 ? st.headingDeg : (Math.atan2(sys.y[k] - sys.y[k - 1], sys.x[k] - sys.x[k - 1]) * 180) / Math.PI;
          const put = (scaleMul, col, alpha, tag, ox = 0, oy = 0) => mine.push({
            x: sys.x[k] + ox, y: sys.y[k] + oy, scale: s * scaleMul, scaleY: s * scaleMul, rotation: rot, alpha,
            assetId: DISH_CREATURE.asset, color: col, accent: col, key: `dish:${i}:${k}:${tag}`, zTier: 0, seedOffset: 0,
            glass: false, _creature: true,
          });
          put(1.14, shade(color, 0.55), 96, 'rim');
          put(1, color, 98, 'body');
          put(0.52, shade(color, 1.5), coreAlpha, 'core', -st.radii[k] * 0.16 * g, -st.radii[k] * 0.16 * g);
          if (k === 0) {
            mine.push({
              x: sys.x[0] + Math.cos(headRad) * st.radii[0] * 0.38 * g, y: sys.y[0] + Math.sin(headRad) * st.radii[0] * 0.38 * g,
              scale: s * 0.17, scaleY: s * 0.17, rotation: 0, alpha: 100,
              assetId: DISH_CREATURE.asset, color: ink, accent: ink, key: `dish:${i}:0:eye`, zTier: 0, seedOffset: 0,
              glass: false, _creature: true,
            });
          }
        }
        // Slice 3 — DRAW the limbs: the same slime trio per disc (rim, body, gloss core), smaller and
        // wearing the spine's colour rank. A disc draws once growth has crossed its band, easing out.
        for (let j = 0; j < st.limbDirs.length; j++) {
          const [lwet] = gt.recolor(bodyBase, ink);
          const lcolor = mixHex(lwet, ink, dryT);
          for (let k = 0; k < LIMB_N; k++) {
            const p = st.grown[j] * LIMB_N - k;
            if (p <= 0) continue;
            const sIdx = N_DISCS + j * LIMB_N + k;
            const g = easeOut(Math.min(1, p));
            const s = (2 * st.limbRadii[k] / 100) * g * hover.scale * matScale;
            const px = k === 0 ? sys.x[0] : sys.x[sIdx - 1];
            const py = k === 0 ? sys.y[0] : sys.y[sIdx - 1];
            const rot = (Math.atan2(sys.y[sIdx] - py, sys.x[sIdx] - px) * 180) / Math.PI;
            const put = (scaleMul, col, alpha, tag, ox = 0, oy = 0) => mine.push({
              x: sys.x[sIdx] + ox, y: sys.y[sIdx] + oy, scale: s * scaleMul, scaleY: s * scaleMul, rotation: rot, alpha,
              assetId: DISH_CREATURE.asset, color: col, accent: col, key: `dish:${i}:limb${j}:${k}:${tag}`, zTier: 0, seedOffset: 0,
              glass: false, _creature: true,
            });
            put(1.14, shade(lcolor, 0.55), 96, 'rim');
            put(1, lcolor, 98, 'body');
            put(0.52, shade(lcolor, 1.5), coreAlpha, 'core', -st.limbRadii[k] * 0.16 * g, -st.limbRadii[k] * 0.16 * g);
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
    // #1367 — the builder's accumulative state: the per-pin birth states (XPBD disc
    // positions/velocities, growth, links, traits) and its own frame count. Typed
    // arrays ride the state codec; everything else in a birth state is plain data.
    // (frameBodies is a per-frame publication, re-earned by the next append.)
    snapshotState() { return { states: states.map(snapDishCreatureState), frame }; },
    restoreState(s) {
      if (!s || !Array.isArray(s.states) || !Number.isInteger(s.frame) || s.frame < 0) return false;
      const built = [];
      for (const rec of s.states) {
        if (rec == null) { built.push(null); continue; }
        const st = restoreDishCreatureState(rec);
        if (!st) return false; // nothing applied yet — the swap below is the commit point
        built.push(st);
      }
      states.length = 0; states.push(...built);
      frame = s.frame;
      return true;
    },
    lastBodies() { return frameBodies; },
    dispose() { states.length = 0; frameBodies = []; },
  };
}
