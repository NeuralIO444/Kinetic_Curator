// determinism-allowlist.mjs — the reasoned exemptions for the determinism
// lint rule (eslint-rules/determinism.mjs), KC-1's same-seed law as data.
//
// Every entry names a file (relative to src/), an API, the EXACT count of
// occurrences the rule must find, and why the call is legitimate. The rule
// enforces the counts both ways: a new call fails, and a stale allowance
// (calls removed, entry left behind) fails too — so this list cannot rot
// into a blanket exemption. An entry without a written reason fails like
// a violation (#1637).
//
// The Math.random entries carry over verbatim from the regex guard this
// rule replaces (#553's mathRandomGuard selfcheck, retired by audit fix 4
// / #1637). The clock entries are audit fix 4's census of the sim-adjacent
// trees (engine/, gl/, biology/, curator/, data/, state/, fx/): injectable
// `now` seams, record stamps, identity minting, and measurement — each
// verified at its call site. UI trees (components/, panels/, hooks/,
// loot/, dev/) are out of clock scope: their clocks are interaction
// timing, not replay inputs.

export const DETERMINISM_CLOCK_DIRS = [
  'engine/', 'gl/', 'biology/', 'curator/', 'data/', 'state/', 'fx/',
];

// No allowance is honoured for these paths (Math.random): the sim, the
// kernel, placement, the GL layer — carried over from the #553 guard.
export const DETERMINISM_FORBIDDEN = [
  '^engine/particles\\.js$',
  '^engine/buildPlacements\\.js$',
  '^engine/kernel/',
  '^gl/(?!debug/)',
];

export const DETERMINISM_ALLOWLIST = {
  // ── Math.random — carried over from the #553 guard ──────────────────────
  'curator/dice.js': {
    'Math.random': { count: 1, why: 'rollDice default rng param; the performer gesture lands its crown in layoutParams.mode / enabledAssets / the keep ledger + crown log — audit 3f (#1677): classified intentional performer die; the default IS the product (the dice tray passes no rng by design; miner/coverageReport pass seeded streams)' },
  },
  'state/paramUtils.js': {
    'Math.random': { count: 2, why: 'randomizeKey default rng param + morph dice; result lands in layoutParams (#1550: the validating door deduped two call sites into rollKeyInSpec — 4 → 2) — audit 3f (#1677): classified intentional; the module documents the split (CURATE passes a seeded stream, dice buttons keep Math.random); landings proven by writePathHonesty.selfcheck (generateLayoutTargets) and state/diceLanding.selfcheck (randomizeParam)' },
  },
  'state/slices/davisSlice.js': {
    'Math.random': { count: 1, why: 'EVOLVE palette dice; result lands in paletteId — landing proven by state/diceLanding.selfcheck (audit 3e, #1675)' },
  },
  'state/slices/layoutSlice.js': {
    'Math.random': { count: 7, why: 'bumpSeed / mutateSeedOffset dice + #942 kineticRoll die + seed roll + #944 weather dice (3: sun intensity/ambient, glow); every result lands in seed / paletteId / layoutParams / enabledAssets / layers / light — landings proven by state/diceLanding.selfcheck (audit 3e, #1675)' },
  },
  'state/slices/layersSlice.js': {
    'Math.random': { count: 4, why: 'layer id suffix (identity, not sim) + new-layer seed dice (lands in the snapshot) + #1097 PATTERN track seed dice (addPatternLayer, shufflePattern: SHUFFLE writes a stored uint32 into layer.pattern.seed, serialized and undoable) — landings proven by state/diceLanding.selfcheck (audit 3e, #1675)' },
    'Date.now': { count: 1, why: 'makeLayerId timestamp prefix — identity, not sim (the id is stored with the layer)' },
  },
  'components/paletteWing.mjs': {
    'Math.random': { count: 1, why: 'randomSeedHex default rng param; the generated set lands in paletteOverrides — audit 3f (#1677): classified intentional generate-button entropy (see 3c, #1671); removing it would kill the generate button' },
  },
  'components/PaletteWing.jsx': {
    'Math.random': { count: 1, why: 'randomScheme default rng param (#953 generate dice); the set lands in paletteOverrides (undoable, serialized) — audit 3f (#1677): classified intentional generate-button entropy (see 3c, #1671)' },
  },

  // ── Clocks — audit fix 4 census of the sim-adjacent trees ───────────────
  'curator/diceCrowns.js': {
    'Date.now': { count: 1, why: 'crown record timestamp fallback when a stored crown lacks ts — ledger metadata, never a sim input' },
  },
  'curator/director.js': {
    'Date.now': { count: 1, why: 'createDirector injectable now seam, defaulting to the wall clock — room-timing telemetry; tests and callers inject' },
  },
  'curator/directorSense.mjs': {
    'Date.now': { count: 1, why: 'createIntensityTracker injectable now seam, defaulting to the wall clock — audio-intensity timing telemetry' },
  },
  'curator/loisActivity.js': {
    'Date.now': { count: 1, why: 'injectable now seam, defaulting to the wall clock — LOIS activity stamps (persona telemetry)' },
  },
  'curator/mindLive.js': {
    'performance.now': { count: 2, why: 'the Mind presence driver\u2019s live timing source (a typeof guard + one call) — persona telemetry; never feeds the sim' },
  },
  'curator/mindPresenceLive.js': {
    'Date.now': { count: 1, why: 'createPresenceDriver injectable now seam, defaulting to the wall clock — presence-timing telemetry' },
  },
  'engine/kernel/tracks/patchDiag.mjs': {
    'Date.now': { count: 3, why: 'diagnostic sample stamps + patchSampleAgeMs injectable now default — dev diagnostics, never sim input' },
  },
  'gl/liveLoop.mjs': {
    'performance.now': { count: 15, why: 'the loop\u2019s clock SOURCE: reads performance.now to produce loopTimeMs / driver time and frame-timing stats for everything downstream. Downstream code uses loop time, never the wall clock (audit fixes 3b/3d) — the source itself has to read it. Audit fix 5 (#1680) removed the #268 swell\u2019s two reads (17 → 15): the envelope now runs on loopTimeMs' },
  },
  'gl/parity/costBench.mjs': {
    'Date.now': { count: 4, why: 'cost benchmark harness timing (Node-side cross-check; frames themselves are timed page-side) — measurement only; labels datasets, never ships in the sim' },
  },
  'gl/debug/costTiers.measure.mjs': {
    'Date.now': { count: 2, why: 'GL debug measurement harness — times renders, never feeds the sim' },
  },
  'gl/debug/diagnostics.mjs': {
    'performance.now': { count: 4, why: 'GL debug diagnostics timing — measurement only' },
  },
  'gl/debug/gpuTimer.mjs': {
    'performance.now': { count: 3, why: 'GPU timer measurement (debug) — times GL work, never feeds the sim' },
  },
  'gl/debug/measureWingWarp.mjs': {
    'Date.now': { count: 2, why: 'wing-warp measurement harness (debug) — timing only' },
    'performance.now': { count: 2, why: 'wing-warp measurement harness (debug) — timing only' },
  },
  'state/bundle.js': {
    'Date.now': { count: 2, why: 'bundle exportedAt stamp + bundleFilename injectable now default — export metadata, not sim state' },
  },
  'state/history.js': {
    'Date.now': { count: 1, why: 'pushToUndo debounce clock — undo coalescing is interaction timing, not sim time' },
  },
  'state/id.js': {
    'Date.now': { count: 1, why: 'id minting — identity, not sim' },
  },
  'state/slices/exportSlice.js': {
    'Date.now': { count: 1, why: 'mined-asset id minting — identity, not sim' },
  },
  'state/slices/paletteLibrarySlice.js': {
    'Date.now': { count: 1, why: 'user palette id minting — identity, not sim' },
  },
  'state/slices/voiceSlice.js': {
    'Date.now': { count: 4, why: 'user-voice record stamps and ids (createdAt, uv- ids) — shelf metadata; the file says it itself: a stamp for the shelf, not a clock the sim reads' },
  },
};
