// loisJudge.mjs — #1508 (Look Explorer E4): LOIS judges renders.
//
// At the performance dice LOIS is persona-v1 (diceScorer.js): metadata
// heuristics over a candidate's recipe — roles, categories, tags. He
// never sees a picture there. At the explorer he is a critic with
// eyes: his verdicts on mined finalists are computed from the RENDER
// — the bake's measured statistics (miner.renderStats) plus the
// recipe features (recipeFeatures) — and recorded as keep/pass ledger
// signals WITH provenance (spec §4/§5/§6).
//
// The verdict is a pure function of the measured bake: same stats +
// features + fingerprint in, same verdict out. Every check reports
// its measured value against its gate, and the verdict carries
// statsProvenance — the exact figures judged, bound to the bake
// fingerprint — so any reader can re-derive the verdict from the
// evidence instead of trusting the judge.
//
// The gates are v1 critic gates, named constants below, tuned by ear
// later the way the render profiles' biases are (#518 precedent).
// What they reject is what a critic rejects on sight: an empty frame,
// a solid wall, a flat field with no contrast, a crushed or blown
// exposure, and a render that breaks its own recipe's promise (a
// high-density recipe that drew almost nothing; a whisper recipe
// that filled the frame).
//
// Where the signals live: the run's verdicts ledger (verdicts.jsonl,
// written by the run tool), NOT the taste ledgers. keeps.jsonl /
// passes.jsonl lines exist only because the artist pressed a key
// (tasteLedger's honest-signals law) and feed MLX training; a machine
// verdict wearing that shape would fake a human label. A verdict row
// is distinguishable three ways: its `judge` is 'lois-render-v1'
// (never 'persona-v1', never absent), it carries explorer provenance,
// and it has no timestamp — isLedgerRow() rejects it, which the
// selfcheck proves.

export const LOIS_JUDGE_ID = 'lois-render-v1';

// ── the gates (v1) ──────────────────────────────────────────────────
export const INK_MIN = 0.005; // below: an empty frame, not a look
export const INK_MAX = 0.85; // above: a solid wall, not a look
export const CONTRAST_MIN = 0.12; // luminance p90−p10 floor
export const MEAN_MIN = 0.03; // below: crushed to black
export const MEAN_MAX = 0.97; // above: blown to white
export const PROMISE_HIGH_INK = 0.04; // a 'high' density recipe must draw
export const PROMISE_LOW_INK = 0.65; // a 'low' density recipe must not wall

const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Judge one baked candidate's render.
 *   features:       recipeFeatures of the candidate's recipe
 *   stats:          miner.renderStats of its bake
 *   fingerprint:    the bake fingerprint (binds the verdict to the still)
 *   fontContingent: the cast carries a font-contingent text stamp (E1b F2)
 *
 * Ink is judged on the figure a viewer actually sees: for a
 * font-contingent cast that is the with-fonts measurement (the
 * font-less raster reads its stamps blank by protocol, E1b F2);
 * statsProvenance records BOTH figures and which one was judged, so
 * the basis is never hidden.
 */
export function judgeRender({ features, stats, fingerprint, fontContingent = false } = {}) {
  const s = stats || {};
  const lum = s.luminance || {};
  const judgedInk = fontContingent ? s.inkCoverageWithFonts : s.inkCoverage;
  const statsProvenance = {
    fingerprint: fingerprint ?? null,
    inkCoverage: s.inkCoverage ?? null,
    inkCoverageWithFonts: s.inkCoverageWithFonts ?? null,
    fontContingent: !!fontContingent,
    judgedInk: fontContingent ? 'with-fonts' : 'font-less',
    luminanceMean: lum.mean ?? null,
    luminanceSpread: lum.spread ?? null,
  };
  const density = features?.density ?? null;
  const checks = [
    {
      key: 'presence',
      measured: judgedInk ?? null,
      want: `${INK_MIN}..${INK_MAX}`,
      ok: Number.isFinite(judgedInk) && judgedInk >= INK_MIN && judgedInk <= INK_MAX,
    },
    {
      key: 'contrast',
      measured: lum.spread ?? null,
      want: `>= ${CONTRAST_MIN}`,
      ok: Number.isFinite(lum.spread) && lum.spread >= CONTRAST_MIN,
    },
    {
      key: 'exposure',
      measured: lum.mean ?? null,
      want: `${MEAN_MIN}..${MEAN_MAX}`,
      ok: Number.isFinite(lum.mean) && lum.mean >= MEAN_MIN && lum.mean <= MEAN_MAX,
    },
    {
      key: 'promise',
      measured: judgedInk ?? null,
      want: density === 'high' ? `ink >= ${PROMISE_HIGH_INK} at density high`
        : density === 'low' ? `ink <= ${PROMISE_LOW_INK} at density low`
          : 'density mid — no promise to keep',
      ok: density === 'high' ? (Number.isFinite(judgedInk) && judgedInk >= PROMISE_HIGH_INK)
        : density === 'low' ? (Number.isFinite(judgedInk) && judgedInk <= PROMISE_LOW_INK)
          : true,
    },
  ];
  return {
    judge: 'lois-render',
    version: 1,
    verdict: checks.every((c) => c.ok) ? 'keep' : 'pass',
    checks: checks.map((c) => ({ ...c, measured: c.measured === null ? null : round(c.measured) })),
    statsProvenance,
  };
}

/**
 * One line of the run's verdicts ledger: LOIS's keep/pass signal on a
 * mined finalist, in ledger-row spirit (seed + recipe + provenance)
 * and marked as his — `judge` names the judge, and there is no
 * timestamp: no artist pressed a key for this line, and none is
 * invented (absent stays absent).
 */
/**
 * Keeps K2 (#1590): the stored-verdict form of a gate decision — the
 * shape a keep record may carry (`gateVerdict`) so the Kinetic fill's
 * Lois gate can run on verdicts recorded at bake time (the E4
 * ledger's discipline) without re-baking at fill time. Untrusted
 * input is bounded hard: anything that is not plainly a lois-render
 * verdict drops to null (no verdict — the candidate is unjudged, not
 * failed). The fingerprint binds the verdict to the still it judged.
 */
export function sanitizeGateVerdict(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.judge !== 'lois-render') return null;
  if (raw.verdict !== 'keep' && raw.verdict !== 'pass') return null;
  const num = (v) => (Number.isFinite(v) ? round(v) : null);
  const sp = (raw.statsProvenance && typeof raw.statsProvenance === 'object') ? raw.statsProvenance : {};
  const checks = Array.isArray(raw.checks)
    ? raw.checks.slice(0, 8).map((c) => (c && typeof c === 'object' ? {
      key: typeof c.key === 'string' ? c.key.slice(0, 24) : '',
      measured: num(c.measured),
      ok: c.ok === true,
    } : null)).filter((c) => c && c.key)
    : [];
  return {
    judge: 'lois-render',
    version: 1,
    verdict: raw.verdict,
    checks,
    statsProvenance: {
      fingerprint: typeof sp.fingerprint === 'string' ? sp.fingerprint.slice(0, 80) : null,
      inkCoverage: num(sp.inkCoverage),
      inkCoverageWithFonts: num(sp.inkCoverageWithFonts),
      judgedInk: sp.judgedInk === 'with-fonts' ? 'with-fonts' : 'font-less',
      luminanceMean: num(sp.luminanceMean),
      luminanceSpread: num(sp.luminanceSpread),
    },
  };
}

/**
 * How comfortably a 'keep' verdict passed — the smallest headroom
 * across the gates whose measurements the stored provenance carries
 * (presence / contrast / exposure; the promise gate shares the
 * presence measurement). Lois's-choice slots in the fill rank by
 * this. Null when there is no passing verdict or no usable
 * measurement: unjudged is not a margin of zero, it is no margin.
 */
export function gateMargin(verdict) {
  const v = sanitizeGateVerdict(verdict);
  if (!v || v.verdict !== 'keep') return null;
  const sp = v.statsProvenance;
  const ink = sp.judgedInk === 'with-fonts' ? sp.inkCoverageWithFonts : sp.inkCoverage;
  const slacks = [];
  if (Number.isFinite(ink)) slacks.push(ink - INK_MIN, INK_MAX - ink);
  if (Number.isFinite(sp.luminanceSpread)) slacks.push(sp.luminanceSpread - CONTRAST_MIN);
  if (Number.isFinite(sp.luminanceMean)) slacks.push(sp.luminanceMean - MEAN_MIN, MEAN_MAX - sp.luminanceMean);
  if (!slacks.length) return null;
  return round(Math.min(...slacks));
}

export function loisVerdictRow(runId, finalist) {
  const rec = finalist?.record || {};
  const v = finalist?.loisVerdict || null;
  if (!v) return null;
  return {
    judge: LOIS_JUDGE_ID,
    verdict: v.verdict,
    seed: rec.seed ?? null,
    run: runId,
    recipe: {
      layoutParams: rec.config?.layout ?? null,
      paletteId: rec.config?.palette?.id ?? null,
      assets: Array.isArray(rec.config?.assets) ? [...rec.config.assets] : [],
    },
    provenance: rec.provenance ?? null,
    statsProvenance: v.statsProvenance,
  };
}
