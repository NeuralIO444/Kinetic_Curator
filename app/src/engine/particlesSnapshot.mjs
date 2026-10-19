// particlesSnapshot.mjs — #1367: the ParticleSystem state snapshot.
//
// Split out of particles.js (2,000 lines; this keeps the snapshot surface reviewable on
// its own). The system snapshot is the state a mid-session take must carry for one swarm
// layer: every simulation column, the JS-side arrays, the scalars init/update maintain,
// the dish bond + coalescence maps, and the system's own scent field when it has one
// (a system driven without the resolver's shared field grows its own, particles.js:1144).
//
// NOT state, deliberately excluded: _noise (rebuilt from _noiseSeed), _layout (the last
// update's input reference — the next input replaces it), _grid/_cellStart/_fill (per-step
// scratch, rebuilt by the step that reads them), _coalesceFields (a pure compose of the
// coalesce pairs — nulled on restore, recomposed on demand), _trig (a function table —
// carried as its mode name and re-resolved).
//
// Restore is atomic: every record decodes and validates before any field is written, so
// a refused restore leaves the system exactly as it was.

import { encodeTyped, decodeTyped } from './kernel/stateCodec.mjs';
import { NATIVE_TRIG } from './kernel/trig.mjs';
import { SCENT_COLS, SCENT_ROWS } from './kernel/field/scent.js';

// The column tables ARE _allocate/_ensureCapacity's enumeration — if a column is ever
// added there it must be added here too (the resolver snapshot proof exercises breed,
// death, bonds and coalescence precisely so a missing column diverges loudly).
const F64_COLS = [
  'x', 'y', 'vx', 'vy', 'ax', 'ay', 'mass', 'contactTrim',
  'deformMem', 'deformMemX', 'deformMemY', 'deformAmt', 'deformAxisX', 'deformAxisY',
  'ecoCrowd', 'omega', 'theta', 'scale', 'baseScale', 'rotation', 'alpha', 'phase', 'u',
  'seedOffset', 'phaseOffset', 'driftMul', 'speedMul', 'noiseSeed',
  'energy', 'drive', 'lorenzX', 'lorenzY', 'lorenzZ', 'leakRgb',
];
const I32_COLS = ['assetIndex', '_cellOf', '_order'];
const U8_COLS = ['alive', 'cgroup', 'grazer'];
const ALL_COLS = [...F64_COLS, ...I32_COLS, ...U8_COLS];

const SCALARS = [
  'n', 'canvasW', 'canvasH', '_step', '_breedSeq', '_authoredCount', '_floatCount',
  '_noiseSeed', '_colorSig', '_lastBehave', '_deformOn', '_coalesceOn', '_pigmentOn',
];

const deepCopy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function snapshotParticleSystem(sys) {
  const cols = {};
  for (const name of ALL_COLS) cols[name] = encodeTyped(sys[name]);
  const scalars = {};
  for (const name of SCALARS) scalars[name] = sys[name] === undefined ? null : sys[name];
  return {
    cap: sys._cap,
    cols,
    scalars,
    trig: sys._trig === NATIVE_TRIG ? 'native' : 'det', // only two trig tables exist (kernel/trig.mjs)
    behaveEase: deepCopy(sys._behaveEase ?? null),
    color: deepCopy(sys.color),
    colorSlot: deepCopy(sys.colorSlot),
    spine: deepCopy(sys.spine),
    dead: [...sys._dead],
    bonds: sys._dishBonds
      ? {
          dwell: [...sys._dishBonds.dwell.entries()].map(([k, v]) => [k, { ...v }]),
          formed: [...sys._dishBonds.formed.entries()].map(([k, v]) => [k, { ...v }]),
        }
      : null,
    coalesce: sys._coalesce
      ? { step: sys._coalesce.step, pairs: [...sys._coalesce.pairs.entries()].map(([k, v]) => [k, { ...v }]) }
      : null,
    scent: sys._scent ? sys._scent.snapshotCells() : null,
  };
}

export function restoreParticleSystem(sys, snap, { createNoise, createScentField, resolveTrig }) {
  if (!snap || typeof snap !== 'object' || !snap.cols || typeof snap.cols !== 'object') return false;
  if (!Number.isInteger(snap.cap) || snap.cap < 0) return false;
  // Decode everything first (atomicity): any mismatch refuses the whole restore.
  const decoded = {};
  for (const name of ALL_COLS) {
    const fresh = decodeTyped(snap.cols[name]);
    if (!fresh) return false;
    const want = name === 'leakRgb' ? snap.cap * 3 : snap.cap;
    if (fresh.length !== want) return false;
    if (fresh.constructor !== sys[name].constructor) return false;
    decoded[name] = fresh;
  }
  let trig;
  try {
    trig = resolveTrig(snap.trig === undefined ? 'native' : snap.trig);
  } catch {
    return false;
  }
  if (snap.scent != null) {
    const sc = decodeTyped(snap.scent);
    if (!sc || sc.length !== SCENT_COLS * SCENT_ROWS || sc.constructor !== Float64Array) return false;
  }
  // Apply.
  for (const name of ALL_COLS) sys[name] = decoded[name];
  sys._cap = snap.cap;
  // The *On switches (and _floatCount before the first init) use `undefined` as a real
  // value ("never seen"); JSON carries it as null, so map it back for exactly those keys.
  const UNDEF_OK = new Set(['_deformOn', '_coalesceOn', '_pigmentOn', '_floatCount']);
  for (const name of SCALARS) {
    if (name in (snap.scalars || {})) sys[name] = snap.scalars[name] === null && UNDEF_OK.has(name) ? undefined : snap.scalars[name];
  }
  sys._trig = trig;
  sys._noise = createNoise(sys._noiseSeed || 444);
  sys._layout = null;
  sys._behaveEase = deepCopy(snap.behaveEase ?? null);
  sys.color = deepCopy(snap.color) || [];
  sys.colorSlot = deepCopy(snap.colorSlot) || [];
  sys.spine = deepCopy(snap.spine) || [];
  sys._dead = Array.isArray(snap.dead) ? [...snap.dead] : [];
  sys._grid = null;
  sys._coalesceFields = null;
  sys._dishBonds = snap.bonds
    ? {
        dwell: new Map((snap.bonds.dwell || []).map(([k, v]) => [k, { ...v }])),
        formed: new Map((snap.bonds.formed || []).map(([k, v]) => [k, { ...v }])),
      }
    : null;
  sys._coalesce = snap.coalesce
    ? { step: snap.coalesce.step | 0, pairs: new Map((snap.coalesce.pairs || []).map(([k, v]) => [k, { ...v }])) }
    : null;
  if (snap.scent != null) {
    if (!sys._scent) sys._scent = createScentField();
    sys._scent.restoreCells(snap.scent); // pre-validated above (kind + length); cannot fail on this record
  } else {
    sys._scent = null;
  }
  return true;
}
