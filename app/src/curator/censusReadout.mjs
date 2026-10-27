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
//
// One view below breaks the artifact pattern on purpose (#1592): the
// shelf readout's input is the LIVE shelf state (records + history
// ledger), because the shelf's census is a telemetry read of the
// instrument as it stands, not of a snapshot file. It keeps the same
// discipline — a pure tally of the records handed to it.
import { cornerWord } from './provenance.mjs';
import { STAGE_BUDGET, FILL_RULES, stageSlotsUsed } from './shelf.mjs';
import { RULE_ORDER, tableName, DEFAULT_SHELF_PREFS } from './shelfPrefs.mjs';
import { anchorAccount, DEFAULT_EXPORT_PREFS } from './shelfDisk.mjs';

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

const cutRows = (cuts) =>
  (cuts || []).map((c) => ({
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
 * Keeps K4 (#1592) — the census shelf readout: the shelf explains
 * itself in the census. Unlike the artifact views above, its input is
 * the LIVE shelf state (records, stage ids, the §5 history ledger,
 * the disk stub index, the preferences in force) handed in by the
 * panel — but the discipline is the same as every view in this module:
 * a tally of records, nothing measured, nothing graded. Every figure
 * below traces to a ledger record, a record stamp, or stage
 * membership; a keep counts as staged when the ledger dealt/swapped/
 * crowned it onto the stage, its stagedCount stamp (the ledger's own
 * cache, spec §5) says so, or it stands on the stage now.
 *
 * Honest-signals law (issue #1592): an empty shelf returns words, not
 * zeros with confidence; a rule that dealt nothing shows its zero;
 * the fill window is stated, never implied.
 */
export const SHELF_CENSUS_FILL_WINDOW = 10;
export const SHELF_CENSUS_TAIL = 8;

export function shelfCensusView({
  keeps = [],
  stageIds = [],
  history = [],
  historyShed = 0,
  stubs = {},
  diskRecords = {},
  prefs = null,
  exportPrefs = null,
  labels = {},
} = {}) {
  const p = prefs || DEFAULT_SHELF_PREFS;
  const xp = exportPrefs || DEFAULT_EXPORT_PREFS;
  const inApp = new Map((keeps || []).map((k) => [k.id, k]));
  const stageSet = new Set(stageIds || []);
  const acct = anchorAccount({ stubs, diskRecords, inAppIds: new Set(inApp.keys()) });

  // Ledger evidence: who has ever been staged, and the move totals.
  const ledgerStaged = new Set();
  const moves = { crowns: 0, swaps: 0, exports: 0, imports: 0 };
  const fills = [];
  for (const r of history || []) {
    if (!r || typeof r !== 'object') continue;
    if (r.kind === 'fill') {
      fills.push(r);
      for (const s of r.slots || []) if (s && s.keepId) ledgerStaged.add(s.keepId);
    } else if (r.kind === 'swap') {
      moves.swaps++;
      if (r.inId) ledgerStaged.add(r.inId);
    } else if (r.kind === 'crown') {
      moves.crowns++;
      if (r.tier === 'stage' && r.keepId) ledgerStaged.add(r.keepId);
    } else if (r.kind === 'export') moves.exports++;
    else if (r.kind === 'import') moves.imports++;
  }

  // The population: every known keep exactly once. In-app records
  // first; a disk keep reads from its record when one is in hand,
  // else from its stub (the index card — never a second record).
  const population = [];
  const seen = new Set();
  const entryFor = (id, rec, location) => ({
    id,
    label: labels[id] || rec?.label || id,
    keptAt: Number.isFinite(rec?.keptAt) ? rec.keptAt : null,
    stagedCount: Number.isFinite(rec?.stagedCount) ? rec.stagedCount : null,
    lastStagedAt: Number.isFinite(rec?.lastStagedAt) ? rec.lastStagedAt : null,
    location,
    onStage: stageSet.has(id),
    staged: stageSet.has(id) || ledgerStaged.has(id) || (Number.isFinite(rec?.stagedCount) && rec.stagedCount >= 1),
  });
  for (const k of keeps || []) {
    if (!k || seen.has(k.id)) continue;
    seen.add(k.id);
    population.push(entryFor(k.id, k, 'app'));
  }
  for (const [id, stub] of Object.entries(stubs || {})) {
    if (!stub || seen.has(id)) continue;
    seen.add(id);
    const rec = (diskRecords || {})[id] || stub;
    population.push(entryFor(id, rec, stub.missing ? 'missing' : 'disk'));
  }

  const total = population.length;
  if (total === 0) {
    return {
      empty: true,
      emptyLine: 'the shelf is empty — no keeps in the app, none on disk. Crown a keep and it lands here.',
      tiers: null,
      fills: null,
      neglect: null,
      wiring: [],
      moves,
      anchor: { partial: acct.partial, unread: acct.unread.length },
    };
  }

  // ── tier counts (live) ──
  const stageKeeps = population.filter((e) => e.onStage);
  const allRecords = [...(keeps || []), ...Object.values(diskRecords || {}).filter((k) => k && !inApp.has(k.id))];
  const slotsUsed = stageSlotsUsed(allRecords, stageIds);
  const tiers = {
    stage: stageKeeps.length,
    slotsUsed,
    slotsBudget: STAGE_BUDGET,
    collection: population.filter((e) => !e.onStage && e.location === 'app').length,
    disk: acct.known,
    diskRead: acct.loaded,
    diskUnread: acct.unread.length,
    diskMissing: population.filter((e) => e.location === 'missing').length,
    total,
    softBound: p.collectionSoftBound,
    inApp: inApp.size,
    overBy: Math.max(0, inApp.size - p.collectionSoftBound),
  };

  // ── fill-rule distribution over the last N fills ──
  const windowFills = fills.slice(-SHELF_CENSUS_FILL_WINDOW);
  const distinctDealt = new Set();
  const ruleRows = FILL_RULES.map((rule) => {
    let dealt = 0;
    let fillsDealt = 0;
    let undealt = 0;
    for (const f of windowFills) {
      const n = (f.slots || []).filter((s) => s && s.rule === rule).length;
      dealt += n;
      if (n > 0) fillsDealt++;
      if ((f.undealt || []).includes(rule)) undealt++;
    }
    return { rule, dealt, fillsDealt, undealt };
  });
  for (const f of windowFills) for (const s of f.slots || []) if (s && s.keepId) distinctDealt.add(s.keepId);
  const fillsView = {
    window: SHELF_CENSUS_FILL_WINDOW,
    counted: windowFills.length,
    total: fills.length,
    none: windowFills.length === 0,
    rows: ruleRows,
    slotsTotal: ruleRows.reduce((n, r) => n + r.dealt, 0),
    distinctDealt: distinctDealt.size,
    lastTable: windowFills.length ? windowFills[windowFills.length - 1].table || '' : '',
  };

  // ── neglect coverage + the longest-unstaged tail ──
  // The tail reads neglect the way the fill's neglected rule does
  // (shelfFill's byNeglect): least-staged first, then longest since
  // last staged, then oldest kept. On-stage keeps are not the tail.
  const stagedEver = population.filter((e) => e.staged).length;
  const tail = population
    .filter((e) => !e.onStage)
    .sort(
      (a, b) =>
        (a.stagedCount ?? 0) - (b.stagedCount ?? 0) ||
        (a.lastStagedAt ?? -Infinity) - (b.lastStagedAt ?? -Infinity) ||
        (a.keptAt ?? -Infinity) - (b.keptAt ?? -Infinity) ||
        (a.id < b.id ? -1 : 1),
    )
    .slice(0, SHELF_CENSUS_TAIL)
    .map((e) => ({
      id: e.id,
      label: e.label,
      keptAt: e.keptAt,
      stagedCount: e.stagedCount,
      lastStagedAt: e.lastStagedAt,
      neverStaged: !e.staged,
      location: e.location,
    }));
  const neglect = {
    population: total,
    stagedEver,
    neverStaged: total - stagedEver,
    coverage: total ? stagedEver / total : null,
    tail,
    tailTotal: population.filter((e) => !e.onStage).length,
  };

  // ── the wiring: every setting the stack introduced, its value in
  // force, and its footprint in the ledger (the census discipline —
  // a knob with no footprint anywhere is a knob to name, not hide).
  const wiring = [
    {
      key: 'table',
      setting: `sway table ${tableName(p)} — ${RULE_ORDER.map((r) => `${r} ${p.table[r]}`).join(' · ')}`,
      footprint: fillsView.none
        ? 'no fills in the ledger yet — the table has dealt nothing'
        : `${fillsView.slotsTotal} slots dealt across the last ${fillsView.counted} fills (${fillsView.distinctDealt} distinct keeps)`,
    },
    {
      key: 'recencyWindow',
      setting: `recency window ${p.recencyWindow} fills`,
      footprint: fillsView.none
        ? 'no fills yet — suppression has had nothing to rotate'
        : `${fillsView.distinctDealt} distinct keeps reached the stage in the window — the rotation the window produces`,
    },
    {
      key: 'collectionSoftBound',
      setting: `collection soft bound ${p.collectionSoftBound}`,
      footprint:
        tiers.overBy > 0
          ? `the shelf stands at ${tiers.inApp} in-app — ${tiers.overBy} over the bound (K3's export is the release valve)`
          : `the shelf stands at ${tiers.inApp} in-app — under the bound`,
    },
    {
      key: 'export',
      setting: `export on soft bound: ${xp.onSoftBound} · folder ${xp.folder} · stills ${xp.includeStills ? 'in' : 'out'}`,
      footprint: `${moves.exports} exports · ${moves.imports} imports in the ledger`,
    },
  ];

  return {
    empty: false,
    emptyLine: null,
    tiers,
    fills: fillsView,
    neglect,
    wiring,
    moves,
    // #1645 — the history window, stated: how much of the ledger the
    // readout can see, and how much the cap has shed beyond it.
    historyCount: (history || []).length,
    historyShed: Number.isInteger(historyShed) && historyShed > 0 ? historyShed : 0,
    anchor: { partial: acct.partial, unread: acct.unread.length },
  };
}

/**
 * #1627 S2 — the three-reads section model: censusReport.readsMetric's
 * rows reshaped for display, nothing recomputed (this module's law).
 * An absent reads artifact stays absent — the readout never invents a
 * balance the meter did not measure.
 */
export function readsView(reads) {
  if (!Array.isArray(reads) || reads.length === 0) {
    return { present: false, reason: 'not measured', rows: [] };
  }
  const rows = reads.map((r) => ({
    scene: r.scene,
    verdict: r.verdict,
    big: r.shares?.big ?? 0,
    mid: r.shares?.mid ?? 0,
    fine: r.shares?.fine ?? 0,
    marks: r.marks ?? 0,
  }));
  return {
    present: true,
    rows,
    bald: rows.filter((r) => r.verdict === 'bald').map((r) => r.scene),
    mud: rows.filter((r) => r.verdict === 'mud').map((r) => r.scene),
    balanced: rows.filter((r) => r.verdict === 'balanced').map((r) => r.scene),
    topHeavy: rows.filter((r) => r.verdict === 'top-heavy').map((r) => r.scene),
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
