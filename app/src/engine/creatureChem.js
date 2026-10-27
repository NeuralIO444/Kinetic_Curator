// engine/creatureChem.js — #1735: a creature's biochemistry. Drives are chemicals; the body state is a chemical state.
//
// After Creatures (1996): a Norn's drives (hunger, boredom, fear …) are chemical concentrations with their own decay and
// half-lives; EMITTERS push them in from what happens, and the body reads them back out. It ticks on its own clock,
// decoupled from the frame rate. Reward and Punishment are chemicals too — and they are MANUFACTURED BY DRIVE CHANGE
// (a drive dropping makes Reward, a drive rising makes Punishment), which is what #1736's learning feeds on.
//
// KC-1 mapping (issue #1735): a small chemical vector per creature, ticked every CHEM_TICK_FRAMES resolver frames
// (~5 Hz at 60 fps; counted, never a clock). The emitters are the dish's own honest signals:
//   approval  rises while nothing is kept, drops hard when the artist keeps (a keep is an approval-drive dropping)
//   crowding  follows the dish pressure at the creature's home
//   strain    follows the stress band (Relax low, Tighten high)
//   boredom   rises while the creature stays in one behaviour mode, eases when it changes
// Each drive's rise is scaled by its genome gain (#1734): two creatures in the same dish can want differently.
// The DOMINANT drive is read back out in the body (materialFor): a creature starved of approval withers, a strained one
// tightens, a rewarded one blooms — the legibility channel: the audience can read what the creature wants.
//
// OHSS (#1736's law, enforced here where the chemicals live): every chemical is capped at 1, the reward and punishment
// chemicals have short half-lives, they come ONLY from drive deltas, and an unchanging world (silence) makes neither.
//
// Pure: functions over a Float64Array. Same inputs, same chemistry, on every machine.

export const CHEM = Object.freeze({ approval: 0, crowding: 1, strain: 2, boredom: 3, reward: 4, punishment: 5 });
export const CHEM_SLOTS = 6;
export const DRIVE_SLOTS = Object.freeze([CHEM.approval, CHEM.crowding, CHEM.strain, CHEM.boredom]);
/** Resolver frames per chemistry tick (~5 Hz at 60 fps). */
export const CHEM_TICK_FRAMES = 12;

/** Named constants, first guesses (tuned from sessions like every creature number). Per tick unless noted. */
export const CHEM_RATES = Object.freeze({
  approvalRise: 0.01, // ~20 s from nothing to full want, at gain 1
  keepDrop: 0.75, // a keep removes this share of the approval drive
  follow: 0.15, // crowding / strain relax toward their emitter this fast
  boredomRise: 0.02, // per tick spent in the same mode
  boredomEase: 0.5, // share of boredom a mode change releases
  driveHalfLife: 60, // ticks (~12 s): every drive leaks back toward zero
  signalHalfLife: 5, // ticks (~1 s): reward and punishment are SHORT-lived (OHSS)
  manufacture: 1.5, // reward/punishment made per unit of total-drive change
});
/** Strain's target per band (the band's reaction, read as chemistry). */
export const BAND_STRAIN = Object.freeze({ relax: 0.1, normal: 0.4, tighten: 0.9 });
/** A drive dominates only above this, and above the others. */
export const DOMINANT_MIN = 0.35;

const clamp01 = (v) => (v > 1 ? 1 : v > 0 ? v : 0);
const leak = (halfLife) => Math.pow(0.5, 1 / halfLife);

export function createChem() {
  return new Float64Array(CHEM_SLOTS);
}

/** The weighted total drive: what reward and punishment are manufactured from. */
export function totalDrive(chem) {
  let s = 0;
  for (const k of DRIVE_SLOTS) s += chem[k];
  return s / DRIVE_SLOTS.length;
}

/**
 * One tick, in place. `ev`: { pressure 0..1, band, kept: boolean (a keep landed since the last tick), modeChanged:
 * boolean }. `gains`: the genome's drive gains { approval, crowding, strain, boredom } (1 = the norm).
 * Returns { reward, punishment } made on this tick (also added to the chemicals).
 */
export function tickChem(chem, ev = {}, gains = {}) {
  const R = CHEM_RATES;
  const g = (k) => (Number.isFinite(gains[k]) ? gains[k] : 1);
  const before = totalDrive(chem);
  // emitters
  chem[CHEM.approval] += R.approvalRise * g('approval');
  if (ev.kept) chem[CHEM.approval] *= 1 - R.keepDrop;
  const p = Number.isFinite(ev.pressure) ? clamp01(ev.pressure) : 0;
  chem[CHEM.crowding] += (p * g('crowding') - chem[CHEM.crowding]) * R.follow;
  const s = BAND_STRAIN[ev.band] ?? BAND_STRAIN.normal;
  chem[CHEM.strain] += (s * g('strain') - chem[CHEM.strain]) * R.follow;
  if (ev.modeChanged) chem[CHEM.boredom] *= 1 - R.boredomEase;
  else chem[CHEM.boredom] += R.boredomRise * g('boredom');
  // decay: drives leak slowly, the reinforcement chemicals fast (OHSS: short half-lives)
  const dl = leak(R.driveHalfLife);
  const sl = leak(R.signalHalfLife);
  for (const k of DRIVE_SLOTS) chem[k] = clamp01(chem[k] * dl);
  chem[CHEM.reward] *= sl;
  chem[CHEM.punishment] *= sl;
  // manufacture from the CHANGE in total drive only — a steady world makes nothing (silence is neutral)
  const delta = totalDrive(chem) - before;
  const made = { reward: 0, punishment: 0 };
  if (delta < 0) made.reward = Math.min(1, -delta * R.manufacture);
  else if (delta > 0) made.punishment = Math.min(1, delta * R.manufacture);
  chem[CHEM.reward] = clamp01(chem[CHEM.reward] + made.reward);
  chem[CHEM.punishment] = clamp01(chem[CHEM.punishment] + made.punishment);
  return made;
}

const DRIVE_NAMES = Object.freeze(['approval', 'crowding', 'strain', 'boredom']);

/** The dominant drive's name, or null when none stands out (no drive above DOMINANT_MIN). */
export function dominantDrive(chem) {
  let best = -1;
  let v = DOMINANT_MIN;
  DRIVE_SLOTS.forEach((k, n) => {
    if (chem[k] > v) {
      v = chem[k];
      best = n;
    }
  });
  return best < 0 ? null : DRIVE_NAMES[best];
}

/**
 * The body reads the chemistry: { bodyScale, dim } multipliers on the band's material (engine/dishCreature.js already
 * draws with these two). Starved of approval: withers (smaller, drier). Strained: drawn in, a little dry. Crowded:
 * drawn in. Bored: dulls. A fresh reward on top blooms (plumper, wetter) — the flourish the band reaction ruled.
 */
export function materialFor(chem) {
  const d = dominantDrive(chem);
  const level = d ? chem[CHEM[d]] : 0;
  let bodyScale = 1;
  let dim = 1;
  if (d === 'approval') {
    bodyScale -= 0.08 * level;
    dim -= 0.2 * level;
  } else if (d === 'strain') {
    bodyScale -= 0.04 * level;
    dim -= 0.1 * level;
  } else if (d === 'crowding') {
    bodyScale -= 0.05 * level;
  } else if (d === 'boredom') {
    dim -= 0.15 * level;
  }
  const bloom = chem[CHEM.reward];
  bodyScale += 0.07 * bloom;
  dim = Math.min(1, dim + 0.2 * bloom);
  return { bodyScale, dim, dominant: d };
}
