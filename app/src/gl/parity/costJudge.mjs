#!/usr/bin/env node
/**
 * costJudge — the T4 governor cost-head REPLAY JUDGE (#1578).
 *
 * The ship/kill judgment for the governor cost head is made here, by replay,
 * not by MAE (issue #1578: "Ship / kill (judged by governor replay, not
 * MAE)"). The judge loads one or more kc-cost-dataset v1 artifacts (the
 * harness's measured labels), holds out recipes AND devices under the shared
 * deterministic split (below), fits the two baselines on the training cells
 * only, and replays every held-out scene through four contenders:
 *
 *   (a) today's static tiers — no prediction, the governor starts at full
 *       quality and reacts; this is the incumbent the head must beat.
 *   (b) count-only baseline — log-ms regressed on the body-count proxy alone
 *       (the FTRF paper's vertex-count-only comparator).
 *   (c) ridge baseline — ridge regression on the full numeric feature bag.
 *   (d) the cost head — a trained `xgboost-cost` artifact, scored through the
 *       REAL runtime evaluator (src/hooks/costHead.mjs validateCostModel +
 *       predictMs + initialRung). No reimplemented walk: what the judge
 *       scores is what the instrument would do.
 *
 * Replay semantics: a contender's prediction primes a starting rung via the
 * runtime's own initialRung(); the scene's measured label, scaled by the
 * rung's shed factor, is its effective first-frame cost. A scene HITCHES
 * when that effective cost exceeds the frame budget (1000/targetFps). The
 * shed rubric (quality weight + pixel factor per rung) is a declared,
 * uniform scoring rubric — see RUNG_RUBRIC — applied identically to every
 * contender; it is the judge's ruler, not a claim about the renderer.
 *
 * The replay set: no recorded cost performances exist in-repo (the
 * performanceFile machinery replays resolver inputs for determinism, not
 * frame costs), so the replay set is the harness's corpus scenes with
 * measured labels, exactly the fallback the harness slice documented.
 *
 * Verdict (issue thresholds, verbatim intent):
 *   SHIP — on unseen-recipe × unseen-device replay: ≥30% fewer over-budget
 *     scenes than static tiers at equal retained quality (operationalized:
 *     mean retained quality within 0.05 of static's), OR ≥15% more retained
 *     quality than a baseline at equal hitches; false-cheap rate ≤5% after
 *     calibration; pinball loss (τ=0.9, ms) ≥15% better than the best
 *     baseline.
 *   KILL — replay gain <10%, unseen-device false-cheap >10%, any other ship
 *     criterion unmet, no artifact, or the unseen×unseen replay not
 *     evaluable (a verdict the data cannot support is a kill, not a pass).
 *   ADDITIVE-KILL — the additivity screen (shared with the trainer) finds
 *     per-effect costs simply add on every testable device: the tier table
 *     already tells the truth and no model ships.
 *
 * Exit codes: 0 SHIP · 1 KILL · 3 ADDITIVE-KILL · 2 usage/IO error.
 *
 *   node src/gl/parity/costJudge.mjs --dataset d.json [--dataset d2.json]
 *     [--model artifact.json] [--target-fps 30] [--json]
 *
 * Determinism: no RNG, no clocks in any scored path — the split is a pure
 * function of recipe ids and device keys (FNV-1a folds), identical to the
 * trainer's (studio/train_cost_head.py); both selfchecks pin the same
 * fixture vectors.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateDataset } from './costDataset.mjs';
import { validateCostModel, predictMs, initialRung } from '../../hooks/costHead.mjs';

/* ── the shared split (trainer mirror — keep the two in lockstep) ──────── */

/** FNV-1a 32-bit over the UTF-8 bytes of `str`. Language-neutral on purpose. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(str)) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const SPLIT_FOLDS = 5;

/**
 * Deterministic grouped holdout. Held-out recipes = fold 0 of the recipe
 * ids; held-out devices = fold 0 of the device keys; with fallbacks so a
 * small universe still yields a train set (documented, never silent):
 * - recipes: if fold 0 is empty or everything, hold every 5th sorted id.
 * - devices: with ≤1 device there is no unseen-device leg (deviceLeg=false);
 *   if fold 0 is empty hold the last sorted key; if it is everything, hold
 *   all but the first sorted key.
 * Cells: train = seen recipe × seen device; cross = exactly one side held
 * (the trainer's calibration/early-stop cells); test = held × held.
 */
export function assignSplits(recipeIds, deviceKeys) {
  const recipes = [...new Set(recipeIds)].sort();
  const devices = [...new Set(deviceKeys)].sort();
  let heldRecipes = recipes.filter((r) => fnv1a(r) % SPLIT_FOLDS === 0);
  if (!heldRecipes.length || heldRecipes.length === recipes.length) {
    heldRecipes = recipes.filter((_, i) => i % SPLIT_FOLDS === SPLIT_FOLDS - 1);
  }
  const recipeLeg = heldRecipes.length > 0 && heldRecipes.length < recipes.length;
  let heldDevices = devices.filter((d) => fnv1a(d) % SPLIT_FOLDS === 0);
  let deviceLeg = true;
  if (devices.length <= 1) {
    heldDevices = [];
    deviceLeg = false;
  } else if (!heldDevices.length) {
    heldDevices = [devices[devices.length - 1]];
  } else if (heldDevices.length === devices.length) {
    heldDevices = devices.slice(1);
  }
  if (devices.length > 1) deviceLeg = heldDevices.length > 0 && heldDevices.length < devices.length;
  return {
    heldRecipes: new Set(heldRecipes),
    heldDevices: new Set(heldDevices),
    recipeLeg,
    deviceLeg,
  };
}

/** 'train' | 'cross' | 'test' for one (recipe, device) pair under a split. */
export function cellOf(split, recipeId, deviceKey) {
  const hr = split.heldRecipes.has(recipeId);
  const hd = split.heldDevices.has(deviceKey);
  if (hr && hd) return 'test';
  if (hr || hd) return 'cross';
  return 'train';
}

/** The device key of a dataset: renderer + platform — a measurement
 * environment, never a marketing name. Rows inherit their dataset's key. */
export function deviceKeyOf(dataset) {
  const env = (dataset && dataset.environment) || {};
  return `${env.renderer || 'unknown-renderer'}|${env.platform || 'unknown-platform'}`;
}

/** Flatten measured dataset rows into judge rows. Failed rows are excluded
 * (they carry no label) and counted. */
export function rowsOfDatasets(datasets) {
  const rows = [];
  let failed = 0;
  for (const ds of datasets) {
    const device = deviceKeyOf(ds);
    for (const row of ds.rows || []) {
      if (row.status !== 'measured') { failed += 1; continue; }
      rows.push({ recipeId: row.id, device, features: row.features, labelMs: row.labelMs });
    }
  }
  return { rows, failed };
}

/* ── the additivity screen (trainer mirror) ────────────────────────────── */

export const ADDITIVITY_TOLERANCE = 0.25;

/**
 * Per-effect additivity from the corpus's own one-factor ladders: price the
 * four pairwise heavy combos as base + the ladder deltas and compare with
 * what was measured. `labels` maps recipe id -> labelMs for ONE device.
 * Returns { status: 'additive' | 'non-additive' | 'indeterminate', combos }.
 * Indeterminate when the ladder rows are not all present/measured — the
 * screen never guesses.
 */
export function additivityScreen(labels) {
  const need = [
    'grid-base', 'grid-count-160', 'grid-count-480', 'grid-scale-large', 'grid-cast-24',
    'grid-fx-1', 'grid-fx-2', 'grid-fx-3', 'grid-fx-4',
    'grid-heavy-count-fx', 'grid-heavy-scale-fx', 'grid-heavy-count-scale', 'grid-heavy-all',
  ];
  for (const id of need) {
    if (typeof labels[id] !== 'number' || !Number.isFinite(labels[id])) {
      return { status: 'indeterminate', combos: [], missing: id };
    }
  }
  const B = labels['grid-base'];
  const dCount = labels['grid-count-480'] - B;
  const dScale = labels['grid-scale-large'] - B;
  const dCast = labels['grid-cast-24'] - labels['grid-count-160'];
  const e1 = labels['grid-fx-1'] - B;
  const e2 = labels['grid-fx-2'] - labels['grid-fx-1'];
  const e3 = labels['grid-fx-3'] - labels['grid-fx-2'];
  const e4 = labels['grid-fx-4'] - labels['grid-fx-3'];
  const combos = [
    { id: 'grid-heavy-count-fx', pred: B + dCount + e1 + e2 + e3, actual: labels['grid-heavy-count-fx'] },
    { id: 'grid-heavy-scale-fx', pred: B + dScale + e1 + e2, actual: labels['grid-heavy-scale-fx'] },
    { id: 'grid-heavy-count-scale', pred: B + dCount + dScale, actual: labels['grid-heavy-count-scale'] },
    { id: 'grid-heavy-all', pred: B + dCount + dScale + dCast + e1 + e2 + e3 + e4, actual: labels['grid-heavy-all'] },
  ].map((c) => ({ ...c, relErr: Math.abs(c.pred - c.actual) / c.actual }));
  const additive = combos.every((c) => c.relErr <= ADDITIVITY_TOLERANCE);
  return { status: additive ? 'additive' : 'non-additive', combos, tolerance: ADDITIVITY_TOLERANCE };
}

/** Screen every device in `rows`; the kill fires only when at least one
 * device is testable and every testable device reads additive. */
export function additivityByDevice(rows) {
  const byDevice = new Map();
  for (const r of rows) {
    if (!byDevice.has(r.device)) byDevice.set(r.device, {});
    byDevice.get(r.device)[r.recipeId] = r.labelMs;
  }
  const perDevice = new Map();
  for (const [device, labels] of byDevice) perDevice.set(device, additivityScreen(labels));
  const testable = [...perDevice.values()].filter((s) => s.status !== 'indeterminate');
  const additive = testable.length > 0 && testable.every((s) => s.status === 'additive');
  return { perDevice, additive, testableCount: testable.length };
}

/* ── baselines (fit on train cells only, inside the judge) ─────────────── */

/** Sorted union of the numeric feature names (num./mech./probe. bags). */
export function numericColumns(rows) {
  const cols = new Set();
  for (const r of rows) {
    for (const bag of ['num', 'mech', 'probe']) {
      for (const k of Object.keys(r.features[bag] || {})) cols.add(`${bag}.${k}`);
    }
  }
  return [...cols].sort();
}

export function numericValue(features, col) {
  const dot = col.indexOf('.');
  const bag = features[col.slice(0, dot)] || {};
  const v = bag[col.slice(dot + 1)];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Solve A x = b by Gaussian elimination with partial pivoting.
 * Returns null when the system is (near-)singular. */
export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Ridge regression on log-ms over standardized numeric columns.
 * Returns { predict(row) -> ms } or null when the fit is impossible.
 */
export function fitRidge(trainRows, { lambda = 1.0 } = {}) {
  if (trainRows.length < 3) return null;
  const cols = numericColumns(trainRows);
  const mean = cols.map((c) => trainRows.reduce((s, r) => s + numericValue(r.features, c), 0) / trainRows.length);
  const std = cols.map((c, i) => {
    const sd = Math.sqrt(trainRows.reduce((s, r) => s + (numericValue(r.features, c) - mean[i]) ** 2, 0) / trainRows.length);
    return sd > 1e-9 ? sd : 1;
  });
  const X = trainRows.map((r) => cols.map((c, i) => (numericValue(r.features, c) - mean[i]) / std[i]));
  const y = trainRows.map((r) => Math.log(r.labelMs));
  const p = cols.length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let n = 0; n < X.length; n++) {
    for (let i = 0; i < p; i++) {
      b[i] += X[n][i] * y[n];
      for (let j = 0; j < p; j++) A[i][j] += X[n][i] * X[n][j];
    }
  }
  for (let i = 0; i < p; i++) A[i][i] += lambda;
  const w = solveLinear(A, b);
  if (!w) return null;
  const intercept = y.reduce((s, v) => s + v, 0) / y.length - X.reduce((s, row) => s + row.reduce((t, v, i) => t + v * w[i], 0), 0) / X.length;
  return {
    columns: cols,
    predict(row) {
      let s = intercept;
      for (let i = 0; i < p; i++) s += ((numericValue(row.features, cols[i]) - mean[i]) / std[i]) * w[i];
      const ms = Math.exp(s);
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    },
  };
}

/** The count-only comparator: log-ms on the body-count proxy alone.
 * The proxy is max(num.count, num.particleCount) — static modes price
 * `count`, live modes price `particleCount`; either alone is the count a
 * count-only governor could see. Closed-form least squares. */
export function countProxy(features) {
  const num = features.num || {};
  return Math.max(num.count || 0, num.particleCount || 0);
}

export function fitCountOnly(trainRows) {
  if (trainRows.length < 3) return null;
  const xs = trainRows.map((r) => countProxy(r.features));
  const ys = trainRows.map((r) => Math.log(r.labelMs));
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const slope = sxx > 1e-12 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  return {
    predict(row) {
      const ms = Math.exp(intercept + slope * countProxy(row.features));
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    },
  };
}

/* ── replay scoring ────────────────────────────────────────────────────── */

/**
 * The declared shed rubric: what a starting rung retains and what it costs.
 * factor scales the scene's measured cost (pixel share ~ renderScale²);
 * quality is the retained-quality weight of starting there. Uniform for
 * every contender — the judge's ruler, declared here and in the header.
 */
export function rubricFor(rung) {
  if (!rung) return { quality: 1, factor: 1 };
  if (rung.renderScale >= 0.75) return { quality: 0.85, factor: rung.renderScale ** 2 };
  if (rung.renderScale >= 0.5) return { quality: 0.7, factor: rung.renderScale ** 2 };
  return { quality: 0.5, factor: rung.renderScale ** 2 };
}

/** Pinball (quantile) loss in ms at level tau. */
export function pinballLoss(pred, actual, tau = 0.9) {
  const u = actual - pred;
  return u >= 0 ? tau * u : (tau - 1) * u;
}

/**
 * Replay test rows through one contender.
 * predict(row) -> ms | null. A null prediction (or a static contender,
 * predict = null) starts at full quality: for the head that is the
 * runtime's own fallback law, counted as an abstention.
 */
export function scoreContender(testRows, predict, { targetFps = 30 } = {}) {
  const budget = 1000 / targetFps;
  let hitches = 0;
  let heavyHitches = 0;
  let heavy = 0;
  let qualitySum = 0;
  let pinballSum = 0;
  let pinballN = 0;
  let falseCheap = 0;
  let abstentions = 0;
  for (const row of testRows) {
    const pred = predict ? predict(row) : null;
    if (predict && (pred === null || pred === undefined)) abstentions += 1;
    const rung = pred ? initialRung(pred, { targetFps }) : null;
    const { quality, factor } = rubricFor(rung);
    qualitySum += quality;
    const isHeavy = row.labelMs > budget * 0.7;
    if (isHeavy) heavy += 1;
    if (row.labelMs * factor > budget) {
      hitches += 1;
      if (isHeavy) heavyHitches += 1;
    }
    if (pred) {
      pinballSum += pinballLoss(pred, row.labelMs);
      pinballN += 1;
      if (pred < row.labelMs) falseCheap += 1;
    }
  }
  const n = testRows.length;
  return {
    scenes: n,
    hitches,
    heavyHitches,
    heavy,
    quality: n ? qualitySum / n : 0,
    pinball: pinballN ? pinballSum / pinballN : null,
    falseCheapRate: pinballN ? falseCheap / pinballN : null,
    abstentions,
  };
}

/* ── the verdict ───────────────────────────────────────────────────────── */

export const SHIP_HITCH_REDUCTION = 0.3;
export const SHIP_QUALITY_TOLERANCE = 0.05;
export const SHIP_QUALITY_GAIN = 1.15;
export const SHIP_FALSE_CHEAP_MAX = 0.05;
export const KILL_FALSE_CHEAP = 0.1;
export const SHIP_PINBALL_WIN = 0.15;
export const KILL_GAIN = 0.1;

/**
 * Pure verdict math. `scores` = { static, countOnly, ridge, head } from
 * scoreContender (head null when no artifact). `ctx` = { additive,
 * testableDevices, hasModel, split, testCount }.
 * Returns { verdict: 'SHIP' | 'KILL' | 'ADDITIVE-KILL', reasons: [...] }.
 */
export function computeVerdict({ scores, ctx }) {
  if (ctx.additive) {
    return {
      verdict: 'ADDITIVE-KILL',
      reasons: [`per-effect costs add within ${(ADDITIVITY_TOLERANCE * 100).toFixed(0)}% on every testable device (${ctx.testableDevices}) — the tier table already tells the truth; no model ships`],
    };
  }
  if (!ctx.hasModel || !scores.head) {
    return { verdict: 'KILL', reasons: ['no trained cost-head artifact supplied — nothing to ship'] };
  }
  if (!ctx.testCount || !ctx.split.recipeLeg || !ctx.split.deviceLeg) {
    const why = [];
    if (!ctx.testCount) why.push('the held-out recipe × held-out device cell is empty');
    if (!ctx.split.recipeLeg) why.push('no recipe holdout');
    if (!ctx.split.deviceLeg) why.push('no unseen device (single-device data)');
    return {
      verdict: 'KILL',
      reasons: [`unseen-recipe × unseen-device replay is not evaluable: ${why.join('; ')} — a ship verdict needs evidence this data cannot give`],
    };
  }
  const head = scores.head;
  const stat = scores.static;
  const baselines = [scores.countOnly, scores.ridge].filter(Boolean);
  const reasons = [];
  let legA = false;
  let legB = false;
  let reduction = 0;
  if (stat.hitches > 0) {
    reduction = (stat.hitches - head.hitches) / stat.hitches;
    legA = reduction >= SHIP_HITCH_REDUCTION && head.quality >= stat.quality - SHIP_QUALITY_TOLERANCE;
    if (!legA) {
      if (reduction < SHIP_HITCH_REDUCTION) reasons.push(`over-budget reduction ${(reduction * 100).toFixed(1)}% < ${SHIP_HITCH_REDUCTION * 100}% at equal quality`);
      else reasons.push(`retained quality ${head.quality.toFixed(3)} is more than ${SHIP_QUALITY_TOLERANCE} below static's ${stat.quality.toFixed(3)}`);
    }
  } else {
    reasons.push('static tiers produce no over-budget scenes on the replay set — nothing for the head to win');
  }
  legB = baselines.some((b) => b.hitches === head.hitches && head.quality >= SHIP_QUALITY_GAIN * b.quality);
  if (!legA && !legB && reduction < KILL_GAIN) {
    reasons.push(`replay gain ${(reduction * 100).toFixed(1)}% < ${KILL_GAIN * 100}% (issue kill criterion)`);
  }
  let fcOk = true;
  if (head.falseCheapRate === null || head.falseCheapRate > SHIP_FALSE_CHEAP_MAX) {
    fcOk = false;
    reasons.push(`false-cheap rate ${head.falseCheapRate === null ? 'n/a' : (head.falseCheapRate * 100).toFixed(1) + '%'} exceeds the ${SHIP_FALSE_CHEAP_MAX * 100}% ship bar${head.falseCheapRate !== null && head.falseCheapRate > KILL_FALSE_CHEAP ? ` — and the ${KILL_FALSE_CHEAP * 100}% kill line` : ''}`);
  }
  let pinballOk = true;
  const basePinballs = baselines.map((b) => b.pinball).filter((x) => x !== null);
  if (head.pinball === null || !basePinballs.length || head.pinball > (1 - SHIP_PINBALL_WIN) * Math.min(...basePinballs)) {
    pinballOk = false;
    reasons.push(`pinball loss ${head.pinball === null ? 'n/a' : head.pinball.toFixed(2)} does not beat the best baseline (${basePinballs.length ? Math.min(...basePinballs).toFixed(2) : 'n/a'}) by ${SHIP_PINBALL_WIN * 100}%`);
  }
  if ((legA || legB) && fcOk && pinballOk) {
    return {
      verdict: 'SHIP',
      reasons: [
        legA
          ? `over-budget scenes down ${(reduction * 100).toFixed(1)}% vs static at retained quality ${head.quality.toFixed(3)} (static ${stat.quality.toFixed(3)})`
          : 'quality leg: ≥15% more retained quality than a baseline at equal hitches',
        `false-cheap ${(head.falseCheapRate * 100).toFixed(1)}% ≤ ${SHIP_FALSE_CHEAP_MAX * 100}%; pinball ${head.pinball.toFixed(2)} beats the best baseline by ≥${SHIP_PINBALL_WIN * 100}%`,
      ],
    };
  }
  if (!reasons.length) reasons.push('ship criteria unmet');
  return { verdict: 'KILL', reasons };
}

/* ── CLI ───────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const args = { datasets: [], model: null, targetFps: 30, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dataset') args.datasets.push(argv[++i]);
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--target-fps') args.targetFps = Number(argv[++i]);
    else if (a === '--json') args.json = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!args.datasets.length) throw new Error('at least one --dataset is required');
  return args;
}

function loadDataset(path) {
  let ds;
  try {
    ds = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`cannot read dataset ${path}: ${e.message}`);
  }
  const check = validateDataset(ds);
  if (!check.ok) throw new Error(`dataset ${path} fails the kc-cost-dataset gate: ${check.errors.join('; ')}`);
  return ds;
}

export function runJudge({ datasets, model = null, targetFps = 30 }) {
  const { rows, failed } = rowsOfDatasets(datasets);
  const split = assignSplits(rows.map((r) => r.recipeId), rows.map((r) => r.device));
  const train = rows.filter((r) => cellOf(split, r.recipeId, r.device) === 'train');
  const test = rows.filter((r) => cellOf(split, r.recipeId, r.device) === 'test');
  const screen = additivityByDevice(rows);

  let headPredict = null;
  if (model) headPredict = (row) => predictMs(model, row.features);
  const countOnly = fitCountOnly(train);
  const ridge = fitRidge(train);
  const scores = {
    static: scoreContender(test, null, { targetFps }),
    countOnly: countOnly ? scoreContender(test, countOnly.predict, { targetFps }) : null,
    ridge: ridge ? scoreContender(test, ridge.predict, { targetFps }) : null,
    head: model ? scoreContender(test, headPredict, { targetFps }) : null,
  };
  const verdict = computeVerdict({
    scores,
    ctx: {
      additive: screen.additive,
      testableDevices: screen.testableCount,
      hasModel: !!model,
      split,
      testCount: test.length,
    },
  });
  return {
    verdict,
    scores,
    split: {
      heldRecipes: [...split.heldRecipes].sort(),
      heldDevices: [...split.heldDevices].sort(),
      recipeLeg: split.recipeLeg,
      deviceLeg: split.deviceLeg,
      trainCount: train.length,
      crossCount: rows.length - train.length - test.length,
      testCount: test.length,
    },
    screen: {
      additive: screen.additive,
      perDevice: Object.fromEntries([...screen.perDevice].map(([d, s]) => [d, { status: s.status, combos: s.combos }])),
    },
    failedRows: failed,
    rowCount: rows.length,
    targetFps,
  };
}

function fmtScore(name, s) {
  if (!s) return `  ${name}: not fittable on the train cells`;
  if (!s.scenes) return `  ${name}: no replay scenes (empty test cell)`;
  const fc = s.falseCheapRate === null ? '  n/a' : `${(s.falseCheapRate * 100).toFixed(1)}%`;
  const pb = s.pinball === null ? 'n/a' : s.pinball.toFixed(2);
  return `  ${name}: hitches ${s.hitches}/${s.scenes} (heavy ${s.heavyHitches}/${s.heavy}) · retained quality ${s.quality.toFixed(3)} · false-cheap ${fc} · pinball ${pb}${s.abstentions ? ` · abstentions ${s.abstentions}` : ''}`;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[costJudge] ${e.message}`);
    process.exit(2);
  }
  let datasets;
  let model = null;
  try {
    datasets = args.datasets.map(loadDataset);
    if (args.model) {
      const raw = JSON.parse(readFileSync(args.model, 'utf8'));
      const v = validateCostModel(raw);
      if (!v.ok) throw new Error(`model ${args.model} fails the runtime gate: ${v.error}`);
      model = v.model;
    }
  } catch (e) {
    console.error(`[costJudge] ${e.message}`);
    process.exit(2);
  }
  const out = runJudge({ datasets, model, targetFps: args.targetFps });
  if (args.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`[costJudge] replay set: ${out.split.testCount} held-out scenes (recipes × devices holdout) from ${out.rowCount} measured rows${out.failedRows ? `, ${out.failedRows} failed rows excluded` : ''}; train ${out.split.trainCount}, cross ${out.split.crossCount}`);
    console.log('[costJudge] replay scenes are corpus recipes with harness labels — no recorded cost performances exist in-repo');
    for (const [device, s] of Object.entries(out.screen.perDevice)) {
      console.log(`[costJudge] additivity [${device.split('|')[0]}]: ${s.status}${s.combos.length ? ' — ' + s.combos.map((c) => `${c.id} pred ${c.pred.toFixed(1)} vs ${c.actual.toFixed(1)} (${(c.relErr * 100).toFixed(0)}%)`).join('; ') : ''}`);
    }
    console.log(fmtScore('static tiers (incumbent)', out.scores.static));
    console.log(fmtScore('count-only baseline     ', out.scores.countOnly));
    console.log(fmtScore('ridge baseline          ', out.scores.ridge));
    console.log(out.scores.head
      ? fmtScore('cost head               ', out.scores.head)
      : '  cost head               : no artifact supplied');
    for (const r of out.verdict.reasons) console.log(`[costJudge]   ${r}`);
    console.log(`VERDICT: ${out.verdict.verdict}`);
  }
  process.exit(out.verdict.verdict === 'SHIP' ? 0 : out.verdict.verdict === 'ADDITIVE-KILL' ? 3 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
