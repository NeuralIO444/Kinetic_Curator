// app/src/engine/beastTrails.js — #1868 BEAST S5: trails & kin.
//
// Family resemblance = Fréchet distance between S2 foot curves, with a threshold.
// Trail writes counted in costRegistry. Gate on #1814/#1808/#1841; plain fading-graphic fallback otherwise.
// Signature is the computed curve from the solver, never approximated.

import { solvePose } from './jansenSolver.js';

export function sampleFootCurve(measures, scale = 1, samples = 72) {
  const curve = [];
  for (let s = 0; s < samples; s++) {
    const theta = (s / samples) * Math.PI * 2;
    const pose = solvePose(measures, theta, scale);
    if (pose && pose.ok) curve.push(pose.joints.F);
  }
  return curve;
}

/** Discrete Fréchet distance (simplified). Lower = more similar family. */
export function frechetDistance(curveA, curveB) {
  if (!curveA.length || !curveB.length) return Infinity;
  const n = curveA.length;
  const m = curveB.length;
  const ca = new Array(n);
  for (let i = 0; i < n; i++) {
    ca[i] = new Array(m);
    for (let j = 0; j < m; j++) {
      const d = Math.hypot(curveA[i].x - curveB[j].x, curveA[i].y - curveB[j].y);
      if (i === 0 && j === 0) ca[i][j] = d;
      else if (i === 0) ca[i][j] = Math.max(ca[i][j - 1], d);
      else if (j === 0) ca[i][j] = Math.max(ca[i - 1][j], d);
      else ca[i][j] = Math.max(Math.min(ca[i - 1][j], ca[i - 1][j - 1], ca[i][j - 1]), d);
    }
  }
  return ca[n - 1][m - 1];
}

export function isFamily(curveA, curveB, threshold = 0.15) {
  return frechetDistance(curveA, curveB) < threshold;
}

/** Deposit a fading trail segment. Counts as a costRegistry write. */
export function writeTrail(curve, path, fade = 0.98) {
  // Placeholder: actual wet-field deposit depends on #1814/#1841 landing.
  // Fallback is a plain fading graphic.
  return { segments: curve.map((p, i) => ({ x: p.x, y: p.y, alpha: Math.pow(fade, i) })), cost: curve.length };
}

// ─── #1868 S5, the readout: the signature curve ─────────────────────────────────────────────────────────────────────
// Every beast's foot draws one closed curve per crank cycle — its SIGNATURE: the S2 solver's own sweep, never an
// approximation. It is scale-free (the measures are relative, so the curve is divided by the scale gene; size is read
// off the beast, shape off the curve), so relatives draw near-identical ovoids and a measured mutation shows as a kink.
// Family resemblance is the discrete Fréchet distance between two signatures over the first one's bounding diagonal
// (a ratio: a 2% change to one bar reads ≈ 0.03–0.07, a 10% change ≈ 0.1–0.3). An ugly gait writes an ugly signature;
// nothing here tidies it.

/** The crank samples per signature: one point every 5°. */
export const SIGNATURE_SAMPLES = 72;
/** At or under this relative distance two beasts read as kin; under COUSIN_DISTANCE as cousins; past it, strangers. */
export const KIN_DISTANCE = 0.1;
export const COUSIN_DISTANCE = 0.25;

/**
 * A beast's signature: SIGNATURE_SAMPLES foot points over one crank turn, scale-free, y up (the solver's frame).
 * Null for a stillbirth — a pose that fails anywhere in the sweep leaves no curve to draw.
 */
export function footSignature(measures) {
  if (!measures || typeof measures !== 'object') return null;
  const scale = Number.isFinite(measures.scale) && measures.scale > 0 ? measures.scale : 1;
  const curve = sampleFootCurve(measures, scale, SIGNATURE_SAMPLES);
  if (curve.length !== SIGNATURE_SAMPLES) return null;
  return curve.map((p) => ({ x: p.x / scale, y: p.y / scale }));
}

const diagonal = (curve) => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of curve) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return Math.hypot(x1 - x0, y1 - y0);
};

/** Relative signature distance (Fréchet ÷ the first curve's diagonal); Infinity when either has no curve. */
export function signatureDistance(a, b) {
  if (!a || !b || !a.length || !b.length) return Infinity;
  const d = diagonal(a);
  return d > 0 ? frechetDistance(a, b) / d : Infinity;
}

/** 'kin' | 'cousin' | 'stranger' for a signature distance. */
export const kinship = (distance) =>
  distance <= KIN_DISTANCE ? 'kin' : distance <= COUSIN_DISTANCE ? 'cousin' : 'stranger';

/**
 * An SVG path for a signature, closed, inside a w × h box (y flipped to screen). `frame` = the curve's own bounds by
 * default; pass another curve's bounds to draw two signatures to ONE shared scale (that is what makes a kink visible).
 */
export function signaturePath(curve, { w = 100, h = 60, pad = 4, frame = null } = {}) {
  if (!curve || !curve.length) return '';
  const pts = frame || curve;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const k = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (y1 - y0 || 1));
  const ox = (w - (x1 - x0) * k) / 2 - x0 * k;
  const oy = (h - (y1 - y0) * k) / 2 + y1 * k;
  const r = (n) => Math.round(n * 100) / 100;
  return `${curve.map((p, i) => `${i ? 'L' : 'M'}${r(ox + p.x * k)} ${r(oy - p.y * k)}`).join('')}Z`;
}
