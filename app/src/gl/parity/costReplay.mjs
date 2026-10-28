#!/usr/bin/env node
/**
 * costReplay — the T4 governor cost-head SHIP/KILL JUDGE (#1578, slice C).
 *
 * The issue's law: the head is "judged by governor replay, not MAE". This
 * script replays the measured corpus scenes through four strategies —
 *   (a)  static-reactive: today's governor, literally (no prime; the
 *        reactive ladder starts at the full rung for every scene);
 *   (a') static-tiers: the tier table's functional form — an ADDITIVE
 *        component-cost model — fit per fold and used as a prime, for the
 *        record (it carries no verdict weight: today's governor has no
 *        such prime, which is the gap the issue names);
 *   (b)  count-only and ridge baselines, fit inside the same
 *        leave-one-family-out folds Slice B used;
 *   (c)  the cost head: Slice B's per-row OUT-OF-FOLD calibrated
 *        predictions from studio/cost-head-report.json (oofCalibratedMs —
 *        the shipped artifact's runtime output for those rows). In-sample
 *        predictions are never read: grading the model's own homework is
 *        not evidence.
 * — and applies the issue's ship/kill criteria mechanically.
 *
 * Gate 0 runs FIRST (the issue: "test additivity first"): if the grid
 * corpus's labels are explained by an additive sum of component costs
 * within the pre-registered tolerance, the tier table already tells the
 * truth and the verdict is KILL on that ground alone. The replay still
 * runs for the record; it cannot override a gate-0 kill.
 *
 * The unseen-device leg: the evidence in hand contains ONE device. The
 * judge prints that leg NOT EVIDENCED — never estimated, never simulated
 * from probe scaling (labels for a device nobody measured would be
 * fabrication). SHIP requires every leg evidenced and passing, so a
 * one-device evidence base can return at best HOLD, naming the closer:
 * the same bench run on a second device.
 *
 * Replay model (every assumption stated; A1–A8 also land in the report):
 *   A1 frame cost at renderScale s = label × s² (pixel-bound: renderScale
 *      multiplies both canvas dimensions; the corpus renders are
 *      fill/pass-bound through the parity render path).
 *   A2 quality-tier steps are cost-neutral in the model (the tier steps
 *      placement/particle budgets; no measured per-tier factor exists in
 *      the repo). Conservative AGAINST priming strategies: a prime buys
 *      budget fit from renderScale alone.
 *   A3 the modelled ladder is the prime-relevant prefix of
 *      nextGovernorCut — cut 1 (renderScale 1 → .75 → .5 → .33) then
 *      cut 2 (quality high → balanced → performance). Deeper cuts are
 *      content-specific opt-ins the corpus scenes never arm; they would
 *      add identical correction capacity to every strategy.
 *   A4 restore is modelled as a bounded climb: a rung is restored only
 *      when the restored state's cost still fits the budget (the settled
 *      state is judged; the live governor's restore-on-healthy limit
 *      cycles are out of scope and symmetric across strategies).
 *   A5 retained quality of a settled state = renderScale² (the pixel
 *      fraction — measured, not assumed) × tier weight
 *      { high: 1, balanced: 0.85, performance: 0.7 } (assumed weights).
 *      "Equal retained quality" := within 5% relative.
 *   A6 scene length 30 s at the target rate; hitch exposure uses the
 *      governor's real timing (SUSTAIN_MS 1600, COOLDOWN_MS 8000 from
 *      usePerformanceGovernor.js): the first cut lands 1.6 s into an
 *      over-budget opening, each further cut 9.6 s later.
 *   A7 baseline calibration follows the trainer's law (smallest
 *      multiplier ≥ 1 covering ≥ 90% of actuals) applied to each
 *      baseline's TRAIN fold only. The head keeps its shipped pooled-OOF
 *      calibration because that is the artifact under judgment.
 *   A8 a row's label is ground truth (dataset law: median of per-rep
 *      p90s, readback-forced). Failed rows (no label) are excluded from
 *      scoring and named, never imputed.
 *   A9 baseline predictions are winsorized to each fold's TRAIN feature
 *      range (a test row's standardized value is clamped to the range
 *      the fold was fit on). Linear models extrapolate without bound —
 *      on the 6-row fold an unclamped ridge predicts e^30 ms for grid
 *      rows, a numerical accident, not a baseline. This is the head's
 *      own runtime law (range-check; trees saturate) applied to the
 *      baselines so they stay credible competitors.
 *
 * Definitions (pre-registered):
 *   budget        = 1000 / targetFps, targetFps = 30 (costHead's default).
 *   over-budget scene := the scene's OPENING state (after any prime,
 *      before reactive correction) costs more than budget. The head's
 *      claim is the first frame; a scene the ladder later rescues still
 *      opened over budget.
 *   false-cheap (verdict leg) := prediction-level P(pred < label) on
 *      out-of-fold predictions — Slice B's own metric (1 − coverage).
 *      A decision-level variant (prime said "no prime needed" while the
 *      label is over budget) is reported alongside.
 *   pinball loss  := mean τ-pinball in ms at the artifact's τ.
 *
 *   node src/gl/parity/costReplay.mjs --dataset <kc-cost-dataset.json>
 *       --out <report.json> [--head-report studio/cost-head-report.json]
 *       [--model studio/cost-head-model.json]
 *
 * Exit 0 = a judgment was reached and written (any verdict — KILL is a
 * successful judgment). Exit 1 = the evidence itself failed validation.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { initialRung, validateCostModel } from '../../hooks/costHead.mjs';
import { RENDER_SCALES } from '../../hooks/governorCuts.js';
import { validateDataset } from './costDataset.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..', '..');

// ── constants read off the real governor / evaluator ────────────────────
export const TARGET_FPS = 30; // costHead.initialRung's default targetFps
export const BUDGET_MS = 1000 / TARGET_FPS;
export const QUALITY_TIERS = ['high', 'balanced', 'performance'];
const TIER_QUALITY = { high: 1, balanced: 0.85, performance: 0.7 }; // A5
const SUSTAIN_S = 1.6; // usePerformanceGovernor SUSTAIN_MS 1600
const COOLDOWN_S = 8.0; // usePerformanceGovernor COOLDOWN_MS 8000
const SCENE_S = 30; // A6

// ── pre-registered verdict thresholds (the issue's numbers) ─────────────
export const GATE0_R2_MIN = 0.9;
export const GATE0_MEDIAN_REL_RESID_MAX = 0.1;
export const SHIP_OVERBUDGET_REDUCTION = 0.3;
export const SHIP_QUALITY_PATH_B = 0.15;
export const EQUAL_QUALITY_REL_TOL = 0.05;
export const SHIP_FALSE_CHEAP_MAX = 0.05;
export const SHIP_PINBALL_WIN = 0.15;
export const KILL_GAIN_MAX = 0.1;
const RIDGE_LAMBDA = 1.0;
const CALIBRATION_COVERAGE = 0.9; // the trainer's coverage law (A7)

// ── small numeric helpers (normal-equation OLS, no dependencies) ────────
const finite = (x) => typeof x === 'number' && Number.isFinite(x);

function solveLinear(A, b) {
  // Gaussian elimination with partial pivoting. A is n×n, b length n.
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) continue; // singular column: coefficient stays 0
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

/** Ordinary least squares with a whisper of ridge for solvability. */
export function fitOLS(X, y, ridge = 1e-8) {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < p; j++) {
      b[j] += X[i][j] * y[i];
      for (let k = 0; k < p; k++) A[j][k] += X[i][j] * X[i][k];
    }
  }
  for (let j = 0; j < p; j++) A[j][j] += ridge;
  const beta = solveLinear(A, b);
  return { beta, predict: (x) => x.reduce((s, v, j) => s + v * beta[j], 0) };
}

/** Ridge on standardized columns, log target, unpenalized intercept via centering. */
export function fitRidge(X, yLog, lambda = RIDGE_LAMBDA) {
  const n = X.length;
  const p = X[0].length;
  const mean = new Array(p).fill(0);
  const std = new Array(p).fill(1);
  for (let j = 0; j < p; j++) {
    mean[j] = X.reduce((s, row) => s + row[j], 0) / n;
    const varr = X.reduce((s, row) => s + (row[j] - mean[j]) ** 2, 0) / n;
    std[j] = Math.sqrt(varr) > 1e-9 ? Math.sqrt(varr) : 1;
  }
  const yMean = yLog.reduce((s, v) => s + v, 0) / n;
  const Xs = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  const yc = yLog.map((v) => v - yMean);
  const model = fitOLS(Xs, yc, lambda);
  // A9: the standardized train range per column; predictions clamp to it.
  const lo = new Array(p).fill(Infinity);
  const hi = new Array(p).fill(-Infinity);
  for (const row of Xs)
    for (let j = 0; j < p; j++) {
      if (row[j] < lo[j]) lo[j] = row[j];
      if (row[j] > hi[j]) hi[j] = row[j];
    }
  return {
    beta: model.beta,
    predictLog: (x) => yMean + model.predict(x.map((v, j) => Math.min(hi[j], Math.max(lo[j], (v - mean[j]) / std[j])))),
  };
}

/** τ-pinball loss of one prediction, in the units of y. */
export function pinballOne(y, yhat, tau) {
  return y >= yhat ? tau * (y - yhat) : (1 - tau) * (yhat - y);
}

/** The trainer's calibration law: smallest multiplier ≥ 1 whose calibrated
 * predictions cover ≥ target of the given actuals (A7). */
export function calibrateMultiplier(preds, actuals, target = CALIBRATION_COVERAGE) {
  const covers = (m) => preds.filter((p, i) => p * m >= actuals[i]).length / actuals.length >= target;
  if (covers(1)) return 1;
  const ratios = preds
    .map((p, i) => actuals[i] / Math.max(p, 1e-9))
    .filter((r) => r > 1)
    .sort((a, b) => a - b);
  for (const r of ratios) if (covers(r)) return r;
  return ratios.length ? ratios[ratios.length - 1] : 1;
}

// ── component extraction (the tier table's vocabulary, from the doc) ────
export function extractComponents(doc) {
  const lp = (doc && doc.layoutParams) || {};
  const swarm = lp.mode === 'swarm' ? 1 : 0;
  const bodies = swarm ? (lp.particleCount ?? lp.count ?? 0) : (lp.count ?? lp.particleCount ?? 0);
  const cast = Object.values((doc && doc.enabledAssets) || {}).filter(Boolean).length;
  let scaleMid = 1;
  const s = lp.scale;
  if (Array.isArray(s) && s.length >= 2 && finite(s[0]) && finite(s[1])) scaleMid = (s[0] + s[1]) / 2;
  else if (s && Array.isArray(s.x) && s.x.length >= 2) scaleMid = (s.x[0] + s.x[1]) / 2;
  else if (finite(s)) scaleMid = s;
  let fxDepth = 0;
  for (const layer of (doc && doc.layers) || []) for (const e of layer.effects || []) fxDepth += 1;
  const blend = lp.blendMode && lp.blendMode !== 'normal' ? 1 : 0;
  const mirror = lp.mirror && lp.mirror !== 'off' && lp.mirror !== false ? 1 : 0;
  return { bodies, cast, scaleMid, fxDepth, blend, mirror, swarm };
}

export const ADDITIVE_COLUMNS = [
  'intercept',
  'log2(bodies/48)',
  'cast-8',
  'scaleMid-1',
  'fxDepth',
  'blend!=normal',
  'mirror',
  'swarm',
];
export function additiveDesignRow(c) {
  return [1, Math.log2(Math.max(c.bodies, 1) / 48), c.cast - 8, c.scaleMid - 1, c.fxDepth, c.blend, c.mirror, c.swarm];
}

/** Gate 0: does an additive component model explain the grid labels? */
export function additivityGate(gridRows) {
  const X = gridRows.map((r) => additiveDesignRow(r.components));
  const y = gridRows.map((r) => r.labelMs);
  const { beta, predict } = fitOLS(X, y);
  const residuals = gridRows.map((r, i) => {
    const pred = predict(X[i]);
    return {
      id: r.id,
      labelMs: r.labelMs,
      additivePredMs: +pred.toFixed(4),
      residMs: +(r.labelMs - pred).toFixed(4),
      relResid: +((r.labelMs - pred) / r.labelMs).toFixed(4),
    };
  });
  const yMean = y.reduce((s, v) => s + v, 0) / y.length;
  const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const ssRes = residuals.reduce((s, r) => s + (r.labelMs - r.additivePredMs) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const absRel = residuals.map((r) => Math.abs(r.relResid)).sort((a, b) => a - b);
  const medianRelResid =
    absRel.length % 2
      ? absRel[(absRel.length - 1) / 2]
      : (absRel[absRel.length / 2 - 1] + absRel[absRel.length / 2]) / 2;
  const additive = r2 >= GATE0_R2_MIN && medianRelResid <= GATE0_MEDIAN_REL_RESID_MAX;
  return {
    rows: gridRows.length,
    columns: ADDITIVE_COLUMNS,
    coefficients: Object.fromEntries(ADDITIVE_COLUMNS.map((name, i) => [name, +beta[i].toFixed(6)])),
    r2: +r2.toFixed(4),
    medianAbsRelResid: +medianRelResid.toFixed(4),
    meanAbsRelResid: +(absRel.reduce((s, v) => s + v, 0) / absRel.length).toFixed(4),
    maxAbsRelResid: +absRel[absRel.length - 1].toFixed(4),
    rule: `additive iff R² ≥ ${GATE0_R2_MIN} AND median |residual|/label ≤ ${GATE0_MEDIAN_REL_RESID_MAX} (pre-registered)`,
    additive,
    residuals,
  };
}

// ── the replay itself ───────────────────────────────────────────────────
const stateCost = (labelMs, state) => labelMs * RENDER_SCALES[state.scaleIdx] ** 2; // A1 + A2
const stateQuality = (state) => RENDER_SCALES[state.scaleIdx] ** 2 * TIER_QUALITY[QUALITY_TIERS[state.qualityIdx]]; // A5
const FULL_STATE = { scaleIdx: 0, qualityIdx: 0 };

function primeState(predMs) {
  if (!finite(predMs)) return { ...FULL_STATE };
  const overlay = initialRung(predMs, { targetFps: TARGET_FPS });
  if (!overlay) return { ...FULL_STATE };
  const scaleIdx = overlay.renderScale !== undefined ? RENDER_SCALES.indexOf(overlay.renderScale) : 0;
  const qualityIdx = overlay.quality !== undefined ? QUALITY_TIERS.indexOf(overlay.quality) : 0;
  return { scaleIdx: scaleIdx >= 0 ? scaleIdx : 0, qualityIdx: qualityIdx >= 0 ? qualityIdx : 0 };
}

function stepDown(state) {
  if (state.scaleIdx < RENDER_SCALES.length - 1) return { ...state, scaleIdx: state.scaleIdx + 1 };
  if (state.qualityIdx < QUALITY_TIERS.length - 1) return { ...state, qualityIdx: state.qualityIdx + 1 };
  return null;
}
function stepUp(state) {
  // GOVERNOR_RESTORE_CUTS reverse order over the modelled prefix: quality
  // restores before renderScale.
  if (state.qualityIdx > 0) return { ...state, qualityIdx: state.qualityIdx - 1 };
  if (state.scaleIdx > 0) return { ...state, scaleIdx: state.scaleIdx - 1 };
  return null;
}

/** Simulate one scene under one starting state. See A1–A6. */
export function simulateScene(labelMs, startState) {
  const opensOver = stateCost(labelMs, startState) > BUDGET_MS;
  let state = { ...startState };
  let overS = 0;
  if (opensOver) {
    let first = true;
    while (stateCost(labelMs, state) > BUDGET_MS) {
      overS += first ? SUSTAIN_S : SUSTAIN_S + COOLDOWN_S;
      first = false;
      if (overS >= SCENE_S) {
        overS = SCENE_S;
        break;
      }
      const next = stepDown(state);
      if (!next) {
        overS = SCENE_S;
        break;
      }
      state = next;
    }
  }
  // Bounded restore (A4): climb only into headroom.
  for (;;) {
    const up = stepUp(state);
    if (!up || stateCost(labelMs, up) > BUDGET_MS) break;
    state = up;
  }
  return {
    opensOver,
    hitchFrames: Math.round(Math.min(overS, SCENE_S) * TARGET_FPS),
    settledScale: RENDER_SCALES[state.scaleIdx],
    settledQualityTier: QUALITY_TIERS[state.qualityIdx],
    settledQuality: +stateQuality(state).toFixed(4),
    settledCostMs: +stateCost(labelMs, state).toFixed(4),
  };
}

/** Design columns mirroring the trainer's (one-hot terms + numeric names). */
export function designColumnsFor(bags) {
  const numNames = new Set();
  const catKeys = new Set();
  for (const bag of bags) {
    for (const block of ['num', 'mech', 'probe'])
      for (const k of Object.keys(bag[block] || {})) numNames.add(`${block}.${k}`);
    for (const [k, v] of Object.entries(bag)) {
      if (['num', 'mech', 'probe'].includes(k)) continue;
      if (typeof v === 'string' || typeof v === 'boolean') catKeys.add(k);
    }
  }
  const terms = new Set();
  for (const bag of bags)
    for (const k of catKeys)
      if (k in bag) terms.add(`${k}=${bag[k] === true ? 'true' : bag[k] === false ? 'false' : String(bag[k])}`);
  const nums = [...numNames].sort();
  return { columns: [...[...terms].sort(), ...nums], numSet: new Set(nums) };
}
export function designRowFor(bag, columns, numSet) {
  return columns.map((col) => {
    if (numSet.has(col)) {
      const [block, key] = [col.slice(0, col.indexOf('.')), col.slice(col.indexOf('.') + 1)];
      const v = (bag[block] || {})[key];
      return finite(v) ? v : 0;
    }
    const eq = col.indexOf('=');
    const key = col.slice(0, eq);
    const want = col.slice(eq + 1);
    if (!(key in bag)) return 0;
    const got = bag[key] === true ? 'true' : bag[key] === false ? 'false' : String(bag[key]);
    return got === want ? 1 : 0;
  });
}

const familyOf = (id) => id.split('-', 1)[0];

/**
 * The full judgment over in-memory inputs.
 * rows: [{ id, family, labelMs, doc, features }] (measured rows only)
 * headOof: Map id -> oofCalibratedMs (from the Slice B report)
 * Returns the report object (see the committed studio report for shape).
 */
export function judge({ rows, headOof, tau, datasetMeta }) {
  const byFamily = new Map();
  for (const r of rows) {
    if (!byFamily.has(r.family)) byFamily.set(r.family, []);
    byFamily.get(r.family).push(r);
  }
  const families = [...byFamily.keys()].sort();
  const folds = families.map((fam) => ({
    heldOut: fam,
    train: rows.filter((r) => r.family !== fam),
    test: byFamily.get(fam),
  }));

  // ── Gate 0 (grid rows only: the designed experiment) ──
  const gate0 = additivityGate(rows.filter((r) => r.family === 'grid'));

  // ── per-fold baseline fits → OOF predictions ──
  const { columns, numSet } = designColumnsFor(rows.map((r) => r.features));
  const preds = { staticTiers: new Map(), countOnly: new Map(), ridge: new Map(), costHead: new Map() };
  for (const fold of folds) {
    const trainY = fold.train.map((r) => r.labelMs);
    // (a') additive form (the tier table's claim), raw-ms OLS, calibrated
    // on the train fold exactly like the baselines below (A7).
    const add = fitOLS(
      fold.train.map((r) => additiveDesignRow(r.components)),
      trainY,
    );
    const addRaw = fold.test.map((r) => Math.max(0.01, add.predict(additiveDesignRow(r.components))));
    const addTrainRaw = fold.train.map((r) => Math.max(0.01, add.predict(additiveDesignRow(r.components))));
    const addCalTrain = calibrateMultiplier(addTrainRaw, trainY);
    fold.test.forEach((r, i) => preds.staticTiers.set(r.id, addRaw[i] * addCalTrain));

    // (b1) count-only: log label ~ a + b·log(bodies).
    const cx = fold.train.map((r) => Math.log(Math.max(r.components.bodies, 1)));
    const cy = trainY.map((v) => Math.log(v));
    const cModel = fitOLS(
      cx.map((v) => [1, v]),
      cy,
    );
    const cRaw = fold.test.map((r) => Math.exp(cModel.predict([1, Math.log(Math.max(r.components.bodies, 1))])));
    const cCal = calibrateMultiplier(
      fold.train.map((r) => Math.exp(cModel.predict([1, Math.log(Math.max(r.components.bodies, 1))]))),
      trainY,
    );
    fold.test.forEach((r, i) => preds.countOnly.set(r.id, cRaw[i] * cCal));

    // (b2) ridge on the trainer's design, log target.
    const rModel = fitRidge(
      fold.train.map((r) => designRowFor(r.features, columns, numSet)),
      trainY.map((v) => Math.log(v)),
    );
    const rRaw = fold.test.map((r) => Math.exp(rModel.predictLog(designRowFor(r.features, columns, numSet))));
    const rCal = calibrateMultiplier(
      fold.train.map((r) => Math.exp(rModel.predictLog(designRowFor(r.features, columns, numSet)))),
      trainY,
    );
    fold.test.forEach((r, i) => preds.ridge.set(r.id, rRaw[i] * rCal));
  }
  for (const r of rows) preds.costHead.set(r.id, headOof.get(r.id));

  // ── replay every strategy over every scene ──
  const strategyDefs = [
    { key: 'staticReactive', name: "(a) static tiers — today's governor (no prime)", predOf: null },
    {
      key: 'staticTiers',
      name: "(a') static tiers as an additive prime (record only)",
      predOf: (r) => preds.staticTiers.get(r.id),
    },
    { key: 'countOnly', name: '(b) count-only baseline prime', predOf: (r) => preds.countOnly.get(r.id) },
    { key: 'ridge', name: '(b) ridge baseline prime', predOf: (r) => preds.ridge.get(r.id) },
    { key: 'costHead', name: '(c) cost head prime (OOF calibrated)', predOf: (r) => preds.costHead.get(r.id) },
  ];
  const strategies = {};
  for (const def of strategyDefs) {
    const perScene = rows.map((r) => {
      const pred = def.predOf ? def.predOf(r) : null;
      const sim = simulateScene(r.labelMs, def.predOf ? primeState(pred) : { ...FULL_STATE });
      return {
        id: r.id,
        labelMs: r.labelMs,
        predMs: pred !== null && pred !== undefined ? +pred.toFixed(4) : null,
        ...sim,
      };
    });
    const n = perScene.length;
    const withPred = perScene.filter((s) => s.predMs !== null);
    strategies[def.key] = {
      name: def.name,
      scenes: n,
      overBudgetScenes: perScene.filter((s) => s.opensOver).length,
      meanHitchFrames: +(perScene.reduce((s, x) => s + x.hitchFrames, 0) / n).toFixed(2),
      totalHitchFrames: perScene.reduce((s, x) => s + x.hitchFrames, 0),
      meanSettledQuality: +(perScene.reduce((s, x) => s + x.settledQuality, 0) / n).toFixed(4),
      falseCheapPredRate: withPred.length
        ? +(withPred.filter((s) => s.predMs < s.labelMs).length / withPred.length).toFixed(4)
        : null,
      decisionFalseCheapRate: def.predOf
        ? +(
            perScene.filter((s) => {
              const overlay = initialRung(s.predMs, { targetFps: TARGET_FPS });
              return overlay === null && s.labelMs > BUDGET_MS;
            }).length / n
          ).toFixed(4)
        : null,
      pinballMs: withPred.length
        ? +(withPred.reduce((s, x) => s + pinballOne(x.labelMs, x.predMs, tau), 0) / withPred.length).toFixed(4)
        : null,
      perScene,
    };
  }

  // ── verdict legs ──
  const head = strategies.costHead;
  const stat = strategies.staticReactive;
  const reduction = stat.overBudgetScenes > 0 ? 1 - head.overBudgetScenes / stat.overBudgetScenes : 0;
  const pathA =
    reduction >= SHIP_OVERBUDGET_REDUCTION &&
    head.meanSettledQuality >= stat.meanSettledQuality * (1 - EQUAL_QUALITY_REL_TOL);
  const pathB =
    head.meanSettledQuality >= stat.meanSettledQuality * (1 + SHIP_QUALITY_PATH_B) &&
    head.totalHitchFrames <= stat.totalHitchFrames;
  const legs = {
    gate0Additivity: {
      pass: !gate0.additive,
      additive: gate0.additive,
      detail: gate0.additive
        ? 'costs prove additive within tolerance — the tier table already tells the truth'
        : 'additive model does not explain the labels within tolerance',
    },
    overBudget: {
      pass: pathA || pathB,
      reduction: +reduction.toFixed(4),
      pathA: {
        pass: pathA,
        rule: `≥${SHIP_OVERBUDGET_REDUCTION * 100}% fewer over-budget scenes at equal retained quality (±${EQUAL_QUALITY_REL_TOL * 100}%)`,
      },
      pathB: { pass: pathB, rule: `≥${SHIP_QUALITY_PATH_B * 100}% more retained quality at equal hitches` },
      headOverBudget: head.overBudgetScenes,
      staticOverBudget: stat.overBudgetScenes,
      headMeanSettledQuality: head.meanSettledQuality,
      staticMeanSettledQuality: stat.meanSettledQuality,
    },
    falseCheap: {
      pass: head.falseCheapPredRate !== null && head.falseCheapPredRate <= SHIP_FALSE_CHEAP_MAX,
      rate: head.falseCheapPredRate,
      rule: `false-cheap ≤ ${SHIP_FALSE_CHEAP_MAX} after calibration (prediction-level, OOF)`,
    },
    pinball: {
      pass:
        head.pinballMs !== null &&
        head.pinballMs <= strategies.countOnly.pinballMs * (1 - SHIP_PINBALL_WIN) &&
        head.pinballMs <= strategies.ridge.pinballMs * (1 - SHIP_PINBALL_WIN),
      headPinballMs: head.pinballMs,
      countOnlyPinballMs: strategies.countOnly.pinballMs,
      ridgePinballMs: strategies.ridge.pinballMs,
      staticTiersPinballMs: strategies.staticTiers.pinballMs,
      rule: `≥${SHIP_PINBALL_WIN * 100}% pinball win over each baseline (τ=${tau}, ms)`,
    },
    device: {
      status: 'NOT EVIDENCED',
      pass: false,
      evidenced: false,
      devicesInEvidence: datasetMeta ? [datasetMeta.renderer] : [],
      detail:
        'one device in evidence; the contract judges ship on unseen-recipe × unseen-DEVICE replay. ' +
        'Labels for an unmeasured device would be fabrication, so this leg is not estimated.',
      closer:
        'run the same harness on a second device (node src/gl/parity/costBench.mjs --gpu --out <device2-dataset.json>) ' +
        'and re-run this judge with that dataset + the shipped artifact\u2019s predictMs predictions as the head leg',
    },
  };
  const killGain = reduction < KILL_GAIN_MAX && !pathB;
  const verdict = decideVerdict({ gate0, legs, killGain });
  return {
    gate0,
    strategies,
    legs,
    killGain,
    verdict,
    folds: folds.map((f) => ({ heldOut: f.heldOut, trainRows: f.train.length, testRows: f.test.length })),
  };
}

/** Mechanical verdict from the legs. Pure; the selfcheck drives it. */
export function decideVerdict({ gate0, legs, killGain }) {
  const reasons = [];
  if (gate0.additive) {
    reasons.push(
      `KILL — gate 0: costs prove additive (R² ${gate0.r2}, median |resid| ${(gate0.medianAbsRelResid * 100).toFixed(1)}% of label): the tier table already tells the truth, no model ships`,
    );
    return { verdict: 'KILL', reasons };
  }
  if (killGain) {
    reasons.push(`KILL — replay gain <${KILL_GAIN_MAX * 100}% on the evidenced legs`);
    return { verdict: 'KILL', reasons };
  }
  const failed = [];
  if (!legs.overBudget.pass) failed.push('over-budget leg');
  if (!legs.falseCheap.pass) failed.push(`false-cheap leg (rate ${legs.falseCheap.rate} > ${SHIP_FALSE_CHEAP_MAX})`);
  if (!legs.pinball.pass) failed.push('pinball leg');
  if (failed.length) {
    reasons.push(`ship criteria not all met on evidenced legs: ${failed.join('; ')}`);
  }
  if (!legs.device.evidenced) {
    reasons.push('unseen-device leg NOT EVIDENCED (one device in evidence) — ship requires it; see legs.device.closer');
  }
  if (!failed.length && legs.device.evidenced && legs.device.pass) {
    return { verdict: 'SHIP', reasons: ['every leg evidenced and passing'] };
  }
  if (!failed.length) {
    return { verdict: 'HOLD', reasons: ['all evidenced legs pass; verdict waits on the missing leg', ...reasons] };
  }
  return { verdict: 'HOLD', reasons };
}

// ── CLI ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    dataset: null,
    out: null,
    headReport: join(REPO_ROOT, 'studio', 'cost-head-report.json'),
    model: join(REPO_ROOT, 'studio', 'cost-head-model.json'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dataset') args.dataset = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--head-report') args.headReport = argv[++i];
    else if (a === '--model') args.model = argv[++i];
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!args.dataset || !args.out)
    throw new Error(
      'usage: costReplay.mjs --dataset <kc-cost-dataset.json> --out <report.json> [--head-report <json>] [--model <json>]',
    );
  return args;
}

const readJson = async (p, what) => {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (e) {
    throw new Error(`cannot read ${what} at ${p}: ${e.message}`);
  }
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataset = await readJson(args.dataset, 'dataset');
  const check = validateDataset(dataset);
  if (!check.ok) {
    console.error(
      '[costReplay] dataset FAILED schema validation — not judging:\n' + check.errors.map((e) => `  - ${e}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }
  const headReport = await readJson(args.headReport, 'Slice B report');
  const modelRaw = await readJson(args.model, 'cost model artifact');
  const vm = validateCostModel(modelRaw);
  if (!vm.ok) {
    console.error(`[costReplay] cost model artifact invalid: ${vm.error}`);
    process.exitCode = 1;
    return;
  }
  const model = vm.model;
  if (finite(headReport?.oof?.calibration) && Math.abs(headReport.oof.calibration - model.calibration) > 1e-6) {
    console.error(
      `[costReplay] report calibration ${headReport.oof.calibration} != artifact calibration ${model.calibration} — the report does not describe the shipped artifact; refusing to judge`,
    );
    process.exitCode = 1;
    return;
  }
  // Cross-check the report against the dataset (ids + labels) so a stale
  // report cannot pass silently — the verify_cost_model discipline.
  const headOof = new Map();
  const dsById = new Map(dataset.rows.map((r) => [r.id, r]));
  for (const rr of headReport.rows || []) {
    const dsRow = dsById.get(rr.id);
    if (!dsRow) {
      console.error(`[costReplay] report row ${rr.id} is not in the dataset — stale report; refusing to judge`);
      process.exitCode = 1;
      return;
    }
    if (dsRow.status === 'measured' && Math.abs(dsRow.labelMs - rr.labelMs) > 0.001) {
      console.error(
        `[costReplay] report label for ${rr.id} (${rr.labelMs}) != dataset label (${dsRow.labelMs}) — stale report; refusing to judge`,
      );
      process.exitCode = 1;
      return;
    }
    if (!finite(rr.oofCalibratedMs)) {
      console.error(
        `[costReplay] report row ${rr.id} carries no oofCalibratedMs — the judge reads OOF predictions only`,
      );
      process.exitCode = 1;
      return;
    }
    headOof.set(rr.id, rr.oofCalibratedMs);
  }
  const rows = dataset.rows
    .filter((r) => r.status === 'measured')
    .map((r) => ({
      id: r.id,
      family: familyOf(r.id),
      labelMs: r.labelMs,
      doc: r.doc,
      features: r.features,
      components: extractComponents(r.doc),
    }));
  const excluded = dataset.rows
    .filter((r) => r.status !== 'measured')
    .map((r) => ({ id: r.id, status: r.status, error: r.error || null }));
  for (const r of rows) {
    if (!headOof.has(r.id)) {
      console.error(`[costReplay] measured row ${r.id} has no OOF prediction in the report — refusing to judge`);
      process.exitCode = 1;
      return;
    }
  }

  const result = judge({ rows, headOof, tau: model.tau, datasetMeta: dataset.environment });
  const report = {
    kind: 'kc-cost-replay-report',
    issue: 1578,
    slice: 'C — governor-replay ship/kill judge',
    generatedAt: new Date().toISOString(),
    inputs: {
      dataset: {
        path: args.dataset,
        kind: dataset.kind,
        version: dataset.version,
        generatedAt: dataset.generatedAt,
        renderer: dataset.environment.renderer,
        swiftShader: dataset.environment.swiftShader,
        probeDrift: dataset.environment.probeDrift ?? null,
      },
      headReport: { path: args.headReport, calibration: headReport.oof?.calibration ?? null },
      model: {
        path: args.model,
        kind: model.kind,
        calibration: model.calibration,
        tau: model.tau,
        trees: model.trees.length,
      },
    },
    definitions: {
      budgetMs: BUDGET_MS,
      targetFps: TARGET_FPS,
      sceneLengthS: SCENE_S,
      sustainS: SUSTAIN_S,
      cooldownS: COOLDOWN_S,
      renderScales: RENDER_SCALES,
      overBudgetScene: 'opening state (after any prime, before reactive correction) costs more than budget',
      retainedQuality:
        'settled state renderScale² × tier weight {high 1, balanced 0.85, performance 0.7}; equal := within 5% relative',
      falseCheap:
        'prediction-level P(pred < label) on out-of-fold predictions (Slice B\u2019s metric); decision-level variant reported per strategy',
      pinball: `mean τ-pinball in ms at τ=${model.tau}`,
      assumptions: [
        'A1 frame cost at renderScale s = label × s² (pixel-bound scaling)',
        'A2 quality-tier steps are cost-neutral in the model (conservative against priming)',
        'A3 modelled ladder = nextGovernorCut prefix: cut 1 renderScale, then cut 2 quality',
        'A4 restore is a bounded climb into headroom; settled states are judged',
        'A5 retained-quality tier weights {1, 0.85, 0.7}; renderScale² is the measured pixel fraction',
        'A6 scene length 30 s; hitch timing from SUSTAIN_MS 1600 / COOLDOWN_MS 8000',
        'A7 baselines calibrated on their train fold only (trainer\u2019s ≥90% coverage law); the head keeps its shipped pooled-OOF calibration — the artifact under judgment',
        'A8 labels are ground truth (median of per-rep p90s); failed rows excluded and named, never imputed',
        'A9 baseline predictions winsorized to each fold\u2019s train feature range (anti-extrapolation; the head\u2019s own range-check law applied to the baselines)',
      ],
    },
    datasetRows: { scored: rows.length, excluded },
    folds: result.folds,
    gate0Additivity: result.gate0,
    strategies: result.strategies,
    legs: result.legs,
    killGain: result.killGain,
    verdict: result.verdict,
  };
  await writeFile(args.out, JSON.stringify(report, null, 2));

  const s = result.strategies;
  console.log(
    `[costReplay] ${rows.length} scenes scored (${excluded.length} excluded: ${excluded.map((e) => e.id).join(', ') || 'none'})`,
  );
  console.log(
    `[costReplay] gate 0 additivity: R² ${result.gate0.r2}, median |resid| ${(result.gate0.medianAbsRelResid * 100).toFixed(1)}% → ${result.gate0.additive ? 'ADDITIVE' : 'not additive'}`,
  );
  console.log('[costReplay] strategy            over-budget  hitch-frames(mean)  quality  false-cheap  pinball(ms)');
  for (const key of ['staticReactive', 'staticTiers', 'countOnly', 'ridge', 'costHead']) {
    const st = s[key];
    console.log(
      `[costReplay] ${key.padEnd(20)} ${String(st.overBudgetScenes).padStart(3)}/${st.scenes}        ${String(st.meanHitchFrames).padStart(6)}          ${st.meanSettledQuality}   ${st.falseCheapPredRate === null ? '   —' : st.falseCheapPredRate}        ${st.pinballMs === null ? '—' : st.pinballMs}`,
    );
  }
  console.log(`[costReplay] device leg: NOT EVIDENCED — ${result.legs.device.detail}`);
  console.log(`[costReplay] VERDICT: ${result.verdict.verdict}`);
  for (const r of result.verdict.reasons) console.log(`[costReplay]   ${r}`);
  console.log(`[costReplay] wrote ${args.out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`[costReplay] ${e.message || e}`);
    process.exitCode = 1;
  });
}
