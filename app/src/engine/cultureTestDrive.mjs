// cultureTestDrive.mjs — CULTURE Phase 5, slice C: the test drives as the Lab's verification line for citizens
// (the parent issues 2342 and 2343, engine side; docs/design/creature-paint-drive-spec.md §1 ruling 2: "play each Canon
// default gait (still, idle, performing) on the beat; moods from the creature's DRIVE genes … change how the gait plays").
// Pure: no DOM, no GL, no clock, no chance. It writes nothing — no world, no take, no bank, no stage (the parent issue
// 2342: "Nothing here writes a take, the bank or the stage"). It reads a Lab candidate — a body KINETIC assembled and the
// recipe DAVIS wrote, before LOIS lets it into a dish — and poses it on the bench.
//
//   T1 — CANON GAITS ON THE BEAT. cultureTestDrive(member, { kind, beats }) poses the candidate wearing its style's
//        Canon default gait of that kind (still / idle / performing; data/canon/gaits.js) through the SAME adapters and
//        evaluator the dish uses (engine/cultureGait.mjs cultureTreeOf / cultureGaitPose): a swimmer as a 'rig', the
//        strandbeest through the BEAST adapter. The clock is beats (the parent issue: "on the gait clock (beats; default
//        BPM with no audio)"): the caller counts beats; the evaluator reads them at GAIT_DEFAULT_BPM. A strandbeest's crank
//        turns on the bench at its recipe's own rate — it walks in place (advance 0, beastRoam's proof that the gait is
//        the motor). REDUCED MOTION: the rest pose, the crank at its birth phase, every pose the identity.
//   T2 — MOODS FROM DRIVE GENES. cultureMoodMultipliers(drives) is a pure, bounded, documented mapping from the WetLab
//        DRIVE genes (approval, crowding, strain, boredom; engine/creatureGenome.js, gains in [0.25, 2], 1 the species
//        norm) to multipliers on the gait's driver amounts (breath, pulse, drift), applied ONLY here (moodGait). Neutral
//        drives give exactly 1 everywhere and leave the gait itself, bit for bit. cultureMoodPresets() are the previews of
//        each drive pushed high. A citizen carries no DRIVE genes (its drives are its recipe's: wander, ground, rim), so
//        the mood is the bench's input, neutral by default — never invented from the recipe.
//   T3 — THE BABY PREVIEW is not here: a citizen's child is a blend of its parents' recipes (spec §2.8) and maybe their
//        parts (§3.3, unruled) — breeding is Phase 6. The issue's own path (creatureBreed.js breedCreature over the WetLab
//        bank) is the WetLab creature's, not a citizen's; it is carried, with the WetLab panel, buttons and e2e of T1/T2.
import { POSE_IDENTITY } from './motionCore/index.js';
import { GAIT_DEFAULT_BPM } from './gait.js';
import { canonGaits, CANON_GAIT_KINDS } from '../data/canon/gaits.js';
import { DRIVES, GENE_RANGES } from './creatureGenome.js';
import { cultureBodyRestPose } from './cultureBody.mjs';
import { cultureTreeOf, cultureGaitPose, CULTURE_GAIT_STYLES } from './cultureGait.mjs';
import { cultureBeastBones, CULTURE_BEAST_STEP_S } from './cultureBeast.mjs';
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';

/** The DRIVE genes a mood reads (the WetLab creature's; engine/creatureGenome.js DRIVES). */
export const CULTURE_MOOD_DRIVES = DRIVES;
/** The gait drivers a mood scales (the Canon gaits' drivers: breath on inner joints, pulse on leaves, drift at the root). */
export const CULTURE_MOOD_DRIVERS = Object.freeze(['breath', 'pulse', 'drift']);
/** A mood multiplier never leaves this band: a mood colours a gait, it never silences or doubles it. */
export const CULTURE_MOOD_MIN = 0.25;
export const CULTURE_MOOD_MAX = 1.75;

/**
 * THE MOOD MAP (T2): each driver's sensitivity to each drive's deviation. A drive's deviation is log2 of its gain,
 * clamped to [−1, 1] (1, the norm, is 0; 2, the gene's ceiling, is +1; ½ or less is −1). A taste call, documented,
 * tunable in iteration:
 *   approval   a creature that wants to be seen PERFORMS: more pulse, a little more breath, holds its place
 *   crowding   a creature that wants room WANDERS: more drift, a held breath
 *   strain     a strained creature is TENSE: a short breath, a sharp pulse, a restless drift
 *   boredom    a bored creature MOPES: little pulse, little breath, aimless drift
 */
export const CULTURE_MOOD_MAP = Object.freeze({
  breath: Object.freeze({ approval: 0.2, crowding: -0.2, strain: -0.4, boredom: -0.3 }),
  pulse: Object.freeze({ approval: 0.4, crowding: 0.1, strain: 0.3, boredom: -0.4 }),
  drift: Object.freeze({ approval: -0.1, crowding: 0.4, strain: 0.2, boredom: 0.4 }),
});

const NEUTRAL = Object.freeze({ breath: 1, pulse: 1, drift: 1 });

/**
 * The mood (T2): DRIVE gains → { breath, pulse, drift } multipliers. Missing or non-finite drives read as the norm (1);
 * gains are held in the gene's range first. Bounded in [CULTURE_MOOD_MIN, CULTURE_MOOD_MAX], deterministic, and the
 * neutral mood (every drive 1, or none given) is exactly 1 everywhere. Pure.
 */
export function cultureMoodMultipliers(drives = {}) {
  const dev = {};
  let any = false;
  for (const d of CULTURE_MOOD_DRIVES) {
    const raw = drives && Number.isFinite(drives[d]) ? drives[d] : 1;
    const g = Math.min(GENE_RANGES.drive.max, Math.max(GENE_RANGES.drive.min, raw));
    dev[d] = Math.max(-1, Math.min(1, Math.log2(g)));
    if (dev[d] !== 0) any = true;
  }
  if (!any) return NEUTRAL;
  const out = {};
  for (const k of CULTURE_MOOD_DRIVERS) {
    let m = 1;
    for (const d of CULTURE_MOOD_DRIVES) m += CULTURE_MOOD_MAP[k][d] * dev[d];
    out[k] = Math.min(CULTURE_MOOD_MAX, Math.max(CULTURE_MOOD_MIN, m));
  }
  return Object.freeze(out);
}

/** The mood previews (T2's "each drive pushed high"): per drive, that drive at the gene's ceiling and the rest at 1. */
export function cultureMoodPresets() {
  return Object.freeze(
    Object.fromEntries(
      CULTURE_MOOD_DRIVES.map((d) => [
        d,
        Object.freeze(Object.fromEntries(CULTURE_MOOD_DRIVES.map((e) => [e, e === d ? GENE_RANGES.drive.max : 1]))),
      ]),
    ),
  );
}

/**
 * A gait with a mood laid on: every driver amount × its driver's multiplier (a driver the mood does not name × 1);
 * structure (cascade, break-up) kept. The neutral mood returns the gait ITSELF — bit for bit. Pure.
 */
export function moodGait(gait, mult) {
  if (!gait || !mult || CULTURE_MOOD_DRIVERS.every((k) => mult[k] === 1)) return gait;
  const roles = {};
  for (const [role, r] of Object.entries(gait.roles || {}))
    roles[role] = {
      ...r,
      drivers: (r.drivers || []).map((d) => ({
        ...d,
        amount: d.amount * (Number.isFinite(mult[d.id]) ? mult[d.id] : 1),
      })),
    };
  return { ...gait, roles };
}

/** The bench: the candidate stands at the dish's centre, facing +x. */
const BENCH_X = CULTURE_SWARM_WORLD_W / 2;
const BENCH_Y = CULTURE_SWARM_WORLD_H / 2;

/**
 * THE TEST DRIVE (T1, with T2's mood): one Lab candidate (`member`: { body, recipe, phase0 }) posed on the bench at beat
 * `beats`, wearing its style's Canon default gait of `kind`. Returns { style, kind, gaitId, beats, nodes, bones? }:
 * nodes in the wearer's tree order, each { x, y, pose } (pose a Motion Core Pose; the place is the rest place); a
 * strandbeest also returns its bones (the bench pose of its linkage, the crank turned in place). Reduced motion: the
 * rest pose, the crank at birth, every pose the identity. Refused loudly: an unknown kind, a negative or non-finite
 * beat count, a plan with no Canon style, a stillborn strandbeest. Writes nothing. Pure.
 */
export function cultureTestDrive(member, { kind = 'performing', beats = 0, mood = null, reducedMotion = false } = {}) {
  if (!CANON_GAIT_KINDS.includes(kind))
    throw new Error(`cultureTestDrive: gait kind "${String(kind)}" — ${CANON_GAIT_KINDS.join(' | ')}`);
  if (!Number.isFinite(beats) || beats < 0)
    throw new Error(`cultureTestDrive: beats "${String(beats)}" — a finite count, zero or more`);
  const body = member && member.body;
  const style = body ? CULTURE_GAIT_STYLES[body.plan] : null;
  const set = style ? canonGaits(style) : null;
  if (!set) throw new Error(`cultureTestDrive: no Canon style for plan "${body ? body.plan : String(body)}"`);
  const gait = set[kind];
  const rest = cultureBodyRestPose(body, BENCH_X, BENCH_Y, 0);
  let marks;
  let tree;
  let bones = null;
  if (body.linkage) {
    // the bench citizen: its discs at rest; the crank turned in place at the recipe's own rate (none under reduced motion)
    const n = body.parts.length;
    const bodies = {
      x: Float64Array.from(rest, (p) => p.x),
      y: Float64Array.from(rest, (p) => p.y),
      alive: new Uint8Array(n).fill(1),
    };
    const sec = (beats * 60) / GAIT_DEFAULT_BPM;
    const turns = reducedMotion ? 0 : sec / (member.recipe.seasoning.timing * CULTURE_BEAST_STEP_S);
    const p0 = Number.isFinite(member.phase0) ? member.phase0 : 0;
    const c = { first: 0, n, body, plan: body.plan, linkage: body.linkage, heading: 0, pA: p0 + turns, pB: p0 + turns };
    bones = cultureBeastBones(bodies, c);
    marks = bones.map((b) => ({ x: (b.x + b.tx) / 2, y: (b.y + b.ty) / 2 }));
    tree = cultureTreeOf('beast', body.linkage);
    if (!tree) throw new Error('cultureTestDrive: a stillbirth does not drive — its linkage cannot assemble');
  } else {
    marks = rest.map((p) => ({ x: p.x, y: p.y }));
    tree = cultureTreeOf('rig', body);
  }
  const worn = reducedMotion ? null : moodGait(gait, cultureMoodMultipliers(mood || {}));
  const poses = reducedMotion
    ? marks.map(() => POSE_IDENTITY)
    : cultureGaitPose(marks, tree, worn, {
        beatTime: beats,
        bpm: GAIT_DEFAULT_BPM,
        wearerSeed: 0,
        seed: 0,
        slot: 0,
        canvasW: CULTURE_SWARM_WORLD_W,
        canvasH: CULTURE_SWARM_WORLD_H,
      });
  return {
    style,
    kind,
    gaitId: gait.id,
    beats,
    nodes: marks.map((m, k) => ({ x: m.x, y: m.y, pose: poses[k] })),
    ...(bones ? { bones } : {}),
  };
}
