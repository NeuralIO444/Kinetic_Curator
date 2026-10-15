// censusReadout.mjs — #1507 (Explorer E3): the dev-panel census readout's
// view models.
//
// A READOUT, not a measurement surface (Matt's scope addition to #1507):
// every number below is reshaped from an artifact the E1/E2 stages
// produced — the coverage census (E1a), the parameter census (E1b), a
// miner run folder (E2) — and nothing here measures anything. There are
// deliberately NO imports from coverageReport/censusReport/miner: the
// readout renders identically from the same artifacts on every load
// because it cannot compute a different answer.
//
// Artifact kinds (scripts/censusSnapshot.mjs writes the first two; the
// miner's exploreRun.mjs writes the third):
//   coverage: { kind:'kc-census-coverage', dice, keeps, keepsNote }
//   census:   { kind:'kc-census-params',   params, reach }
//   run:      run.json + finalists.json + candidates.json (a run folder)
import { cornerWord } from './provenance.mjs';

export const COVERAGE_KIND = 'kc-census-coverage';
export const CENSUS_KIND = 'kc-census-params';

// E1a's two-tier alarm: a family at zero is a reported fact; at ≤10% of
// its library it is near-zero (the audit's seed-luck lesson: judge ≤3,
// never an absolute zero).
export const alarmFor = (reached, total) => {
  if (!(total > 0)) return null;
  if (reached === 0) return 'zero';
  if (reached / total <= 0.1) return 'low';
  return null;
};

const cutRows = (cuts) => (cuts || []).map((c) => ({
  name: c.name,
  inLibrary: c.inLibrary ?? 0,
  inCandidates: c.inCandidates ?? 0,
  inTray: c.inTray ?? 0,
  alarm: alarmFor(c.inTray ?? 0, c.inLibrary ?? 0),
}));

/** E1a tray coverage + keeps coverage, display-ready. */
export function coverageView(artifact) {
  if (!artifact || artifact.kind !== COVERAGE_KIND) return null;
  const dice = artifact.dice ?? {};
  const keeps = artifact.keeps ?? {};
  const categories = cutRows(dice.categories);
  const packs = cutRows(dice.packs);
  const alarms = [...categories, ...packs].filter((r) => r.alarm);
  return {
    rolls: dice.rolls ?? 0,
    library: dice.library ?? { assets: 0, palettes: 0, layouts: 0 },
    trayDistinct: dice.tray?.distinct ?? 0,
    trayNever: dice.tray?.neverCount ?? 0,
    top15Share: dice.tray?.top15Share ?? 0,
    categories,
    packs,
    alarms,
    layoutsReached: dice.layoutsReached ?? 0,
    layoutsTotal: (dice.layouts ?? []).length,
    layouts: (dice.layouts ?? []).map((l) => ({ layout: l.layout, trios: l.trios ?? 0 })),
    keeps: {
      total: keeps.keeps ?? 0,
      withCast: keeps.withCast ?? 0,
      castless: keeps.castless ?? 0,
      distinctCategories: keeps.distinctCategories ?? 0,
      distinctPalettes: keeps.distinctPalettes ?? 0,
      distinctLayouts: keeps.distinctLayouts ?? 0,
      categories: keeps.categories ?? [],
      palettes: keeps.palettes ?? [],
      layouts: keeps.layouts ?? [],
    },
    keepsNote: typeof artifact.keepsNote === 'string' ? artifact.keepsNote : null,
  };
}

/** E1b headline: the parameter census + render reachability, display-ready. */
export function censusView(artifact) {
  if (!artifact || artifact.kind !== CENSUS_KIND) return null;
  const p = artifact.params ?? {};
  const r = artifact.reach ?? {};
  return {
    params: {
      total: p.total ?? 0,
      moves: p.moves ?? 0,
      dead: Array.isArray(p.dead) ? p.dead : [],
      notHeadless: Array.isArray(p.notHeadless) ? p.notHeadless : [],
      dish: p.dish ?? 0,
    },
    reach: {
      assetsMeasured: r.assetsMeasured ?? 0,
      assetsUnreached: Array.isArray(r.assetsUnreached) ? r.assetsUnreached : [],
      palettesDistinct: r.palettesDistinct ?? 0,
      palettesTotal: r.palettesTotal ?? 0,
      layoutsDistinct: r.layoutsDistinct ?? 0,
      layoutsTotal: r.layoutsTotal ?? 0,
    },
  };
}

/**
 * Explorer yield by corner from a run's own records (spec §6): finalists
 * over candidates per corner. Tallies of artifact data — the same rows
 * the candidate tray shows, in readout form.
 */
export function yieldByCornerView({ candidates, finalists } = {}) {
  const byCorner = new Map();
  const bump = (corner, field) => {
    const k = typeof corner === 'string' && corner ? corner : 'wilderness';
    if (!byCorner.has(k)) byCorner.set(k, { corner: k, label: cornerWord(k), candidates: 0, finalists: 0 });
    byCorner.get(k)[field]++;
  };
  for (const c of candidates || []) bump(c?.corner ?? c?.record?.provenance?.corner, 'candidates');
  for (const f of finalists || []) bump(f?.provenance?.corner, 'finalists');
  const rows = [...byCorner.values()]
    .map((r) => ({ ...r, yieldPct: r.candidates ? r.finalists / r.candidates : 0 }))
    .sort((a, b) => b.finalists - a.finalists || b.candidates - a.candidates || a.corner.localeCompare(b.corner));
  return {
    rows,
    totalCandidates: rows.reduce((s, r) => s + r.candidates, 0),
    totalFinalists: rows.reduce((s, r) => s + r.finalists, 0),
  };
}

/**
 * XGBoost T2 — the taste-agreement section model: censusReport's
 * tasteAgreement result reshaped for display, nothing recomputed
 * (this module's law). An absent agreement stays absent, with its
 * reason carried through — the readout never papers over a missing
 * or unusable tree head.
 */
export function agreementView(agreement) {
  if (!agreement || agreement.present !== true) {
    return { present: false, reason: agreement?.reason ?? 'not measured' };
  }
  return {
    present: true,
    headKind: agreement.headKind,
    tasteVersion: agreement.tasteVersion,
    fidelity: agreement.fidelity,
    keepsMean: agreement.keeps.mean,
    keepsN: agreement.keeps.n,
    passesMean: agreement.passes.mean,
    passesN: agreement.passes.n,
    auc: agreement.auc,
    unscored: agreement.unscored,
  };
}
