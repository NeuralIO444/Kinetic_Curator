// personaNightly.selfcheck.mjs — Persona Adapters A3 (#2396): the nightly retrain clock.
//
// Drives the REAL wrapper / install / uninstall CLIs in a sandbox HOME, against fixture
// takes + ledgers in a fixture app-data dir, with the trainer's fit provided by a stub
// `xgboost` module on PYTHONPATH (CI has no xgboost — the same seam A2's selfcheck uses:
// the stub fits ONE decision stump over the numeric columns and returns its dump as JSON
// strings, exactly as the real Booster does; everything else in the chain — extractor,
// rows, the trainer's split/score/beat-the-old/store, the app's own verify walk — is the
// production code). One block per ruling:
//
//   Q7/Q5  install seeds the canonical taste, renders a valid plist, and runs the full
//          dry-run BEFORE loading: the dry-run ships into its scratch copies only — the
//          canonical taste keeps NO personas section and NO store appears beside it;
//   night  the wrapper's chain ships davis|solo v1 into the canonical taste + store, the
//          seed's own head survives untouched, verify reports PASS in the log;
//   Q4/watermark  a second night on the same corpus ships nothing: taste, store and
//          history are byte-identical and the report says skipped-watermark;
//   Q7     a later dry-run previews faithfully (skipped-watermark, because the store copy
//          carries the watermark) and leaves the real taste + store byte-identical;
//   uninstall removes the plist and leaves the whole data home byte-identical — twice;
//   honesty  a missing trainer in the checkout fails the night loudly (named in the log);
//          an install whose python3 cannot import xgboost fails before writing anything;
//   lock   a live lock stands the night down (exit 3); a stale lock is broken and the
//          night runs.
// Run: node studio/personaNightly.selfcheck.mjs (also in app/selfcheck.manifest as ../studio/…)
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES_VERSION } from '../app/src/curator/recipeFeatures.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = dirname(here);
const LABEL = 'com.neuralio.kineticcurator.persona-retrain';

// ── the stub xgboost: one decision stump, fit for real on the trainer's matrix ──────────
const STUB_XGBOOST = `
import json

class DMatrix:
    def __init__(self, X, label=None, weight=None, feature_names=None):
        self.X = X
        self.label = label
        self.weight = weight
        self.feature_names = list(feature_names or [])
        self.rows = len(X)

class _Booster:
    def __init__(self, tree):
        self._tree = tree
    def get_dump(self, dump_format="json"):
        return [json.dumps(self._tree)]
    def predict(self, data, output_margin=False):
        return [0.0] * data.rows

def _side_leaf(pos, neg):
    if pos > neg:
        return 2.0
    if neg > pos:
        return -2.0
    return 0.0

def train(params, dtrain, num_boost_round=0):
    X, y, w = dtrain.X, dtrain.label, dtrain.weight
    best = None
    for j, name in enumerate(dtrain.feature_names):
        if not name.startswith("num."):
            continue
        vals = sorted({row[j] for row in X})
        if len(vals) < 2:
            continue
        for a, b in zip(vals, vals[1:]):
            thr = (a + b) / 2.0
            yp = yn = np_ = nn = 0.0
            for row, yi, wi in zip(X, y, w):
                if row[j] < thr:
                    if yi == 1:
                        yp += wi
                    else:
                        yn += wi
                else:
                    if yi == 1:
                        np_ += wi
                    else:
                        nn += wi
            score = max(yp, yn) + max(np_, nn)
            if best is None or score > best[0]:
                best = (score, name, thr, _side_leaf(yp, yn), _side_leaf(np_, nn))
    if best is None:
        return _Booster({"nodeid": 0, "leaf": 0.0})
    _, name, thr, yes_leaf, no_leaf = best
    return _Booster({
        "nodeid": 0, "split": name, "split_condition": thr, "yes": 1, "no": 2, "missing": 1,
        "children": [{"nodeid": 1, "leaf": yes_leaf}, {"nodeid": 2, "leaf": no_leaf}],
    })
`;

// ── fixtures: 90 kept takes (hot stress) + 90 passed takes (cold stress), one davis solo ──
// each — 180 labeled davis|solo turns whose label the stress pressure separates cleanly.
const TURNS = [
  [0, 0, 'in', 'governor', null],
  [0, 0, 'solo', 'davis', { len: 4, cap: 0.5 }],
  [100, 1, 'out', 'governor', null],
];
const stress = (init, sig) => ({
  version: 1,
  initial: { smoothed: init, band: 'relax' },
  runs: [[0, sig, sig, sig, 600]],
  bands: [],
  occupancy: { relax: 0, normal: 0, tighten: 0 },
});
const ledgerLine = (seed) =>
  JSON.stringify({
    seed,
    recipe: { layoutParams: null, paletteId: null },
    timestamp: '2026-11-01T10:00:00.000Z',
    keepContext: null,
    projectRef: null,
  });

const sandbox = mkdtempSync(join(tmpdir(), 'persona-nightly-'));
const root = join(sandbox, 'home');
const appData = join(root, 'Library', 'Application Support', 'com.neuralio.kineticcurator');
const takesDir = join(appData, 'takes');
const ledgersDir = join(appData, 'ledgers');
const dataHome = join(appData, 'adapters');
const laDir = join(root, 'Library', 'LaunchAgents');
const plistPath = join(laDir, `${LABEL}.plist`);
const stubDir = join(sandbox, 'stub');
mkdirSync(takesDir, { recursive: true });
mkdirSync(ledgersDir, { recursive: true });
mkdirSync(stubDir, { recursive: true });
writeFileSync(join(stubDir, 'xgboost.py'), STUB_XGBOOST);
{
  const keeps = [];
  const passes = [];
  for (let i = 0; i < 90; i++) {
    const seed = 5000 + i;
    const take = { format: 'kc-performance', version: 3, frames: 1000, band: { version: 1, seed, turns: TURNS }, stress: stress(0.85, 0.9) };
    writeFileSync(join(takesDir, `keep-${seed}.json`), JSON.stringify(take));
    keeps.push(ledgerLine(seed));
  }
  for (let i = 0; i < 90; i++) {
    const seed = 6000 + i;
    const take = { format: 'kc-performance', version: 3, frames: 1000, band: { version: 1, seed, turns: TURNS }, stress: stress(0.15, 0.0) };
    writeFileSync(join(takesDir, `pass-${seed}.json`), JSON.stringify(take));
    passes.push(ledgerLine(seed));
  }
  writeFileSync(join(ledgersDir, 'keeps.jsonl'), keeps.join('\n') + '\n');
  writeFileSync(join(ledgersDir, 'passes.jsonl'), passes.join('\n') + '\n');
}
const seedTaste = {
  kind: 'kc-taste',
  version: 1,
  featuresVersion: FEATURES_VERSION,
  head: { terms: {}, num: {}, bias: 0, fidelity: 0.595, fitOn: 12 },
};
const seedPath = join(sandbox, 'seed-taste.json');
writeFileSync(seedPath, JSON.stringify(seedTaste));

// ── helpers ──────────────────────────────────────────────────────────────────────────────
const whichSync = (name) => {
  for (const dir of (process.env.PATH || '').split(':')) {
    const p = join(dir, name);
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      /* not here */
    }
  }
  return name;
};
const PYTHON3 = whichSync('python3');
const baseEnv = { ...process.env, HOME: root, PYTHONPATH: stubDir };
const run = (cmd, args, env = baseEnv) => {
  const r = spawnSync(cmd, args, { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.error, undefined, `${cmd} ${args.join(' ')}: spawn error ${r.error}`);
  return r;
};
const nightlyEnv = {
  ...baseEnv,
  KC_CHECKOUT: repo,
  KC_NODE: process.execPath,
  KC_PYTHON3: PYTHON3,
  KC_ADAPTERS_HOME: dataHome,
  KC_TAKES_DIR: takesDir,
  KC_LEDGERS_DIR: ledgersDir,
};
const runNightly = (args = []) => run('bash', [join(here, 'personaNightly.sh'), ...args], nightlyEnv);
const logText = () => readFileSync(join(dataHome, 'nightly.log'), 'utf8');
const plistJson = (path) => {
  const r = run('python3', [
    '-c',
    'import plistlib, json, sys\nwith open(sys.argv[1], "rb") as fh:\n    print(json.dumps(plistlib.load(fh)))',
    path,
  ]);
  assert.equal(r.status, 0, `plistlib must parse ${path}: ${r.stderr}`);
  return JSON.parse(r.stdout);
};
const hashTree = (dir) => {
  const h = createHash('sha256');
  const walk = (d, rel) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p, `${rel}${name}/`);
      else {
        h.update(rel + name);
        h.update(readFileSync(p));
      }
    }
  };
  walk(dir, '');
  return h.digest('hex');
};
const hashFile = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// ── A: the plist template parses, carries the ruled keys, and stays a template ───────────
{
  const p = plistJson(join(here, 'launchd', `${LABEL}.plist`));
  assert.equal(p.Label, LABEL);
  assert.deepEqual(p.StartCalendarInterval, { Hour: 3, Minute: 30 }, 'Q2: 03:30 nightly');
  assert.ok(p.ProgramArguments[1].endsWith('studio/personaNightly.sh'));
  assert.ok(p.StandardOutPath.endsWith('/launchd.log') && p.StandardErrorPath.endsWith('/launchd.log'));
  const raw = readFileSync(join(here, 'launchd', `${LABEL}.plist`), 'utf8');
  for (const token of ['__CHECKOUT__', '__NODE__', '__PYTHON3__', '__DATA_HOME__', '__TAKES_DIR__', '__LEDGERS_DIR__'])
    assert.ok(raw.includes(token), `template keeps the ${token} placeholder`);
  assert.ok(!raw.includes('/Users/'), 'the template never bakes in a guessed user path');
  console.log('  [A] plist template: parses, 03:30, placeholders intact');
}

// ── B: install — seed, render, dry-run BEFORE load; the dry-run touches nothing real ─────
{
  const r = run('bash', [
    join(here, 'personaNightlyInstall.sh'),
    '--home', root, '--taste', seedPath, '--checkout', repo,
    '--node', process.execPath, '--python3', PYTHON3, '--no-load',
  ]);
  assert.equal(r.status, 0, `install must succeed:\n${r.stdout}\n${r.stderr}`);
  assert.ok(existsSync(plistPath), 'the rendered plist lands in the sandbox LaunchAgents');
  const raw = readFileSync(plistPath, 'utf8');
  for (const token of ['__CHECKOUT__', '__NODE__', '__PYTHON3__', '__DATA_HOME__', '__TAKES_DIR__', '__LEDGERS_DIR__'])
    assert.ok(!raw.includes(token), `rendered plist: ${token} substituted`);
  const p = plistJson(plistPath);
  assert.equal(p.EnvironmentVariables.KC_CHECKOUT, repo);
  assert.equal(p.EnvironmentVariables.KC_ADAPTERS_HOME, dataHome);
  assert.equal(p.EnvironmentVariables.KC_TAKES_DIR, takesDir);
  assert.equal(readFileSync(join(dataHome, 'taste.json'), 'utf8'), JSON.stringify(seedTaste), 'the seed is the canonical taste, byte for byte');
  const log = logText();
  assert.ok(log.includes('DRY-RUN'), 'install ran the dry-run (Q7)');
  assert.ok(log.includes('davis|solo: shipped -> v1'), 'the dry-run prints what would ship');
  assert.ok(!existsSync(join(dataHome, 'persona-heads')), 'Q7: no store beside the real taste after a dry-run');
  assert.ok(
    existsSync(join(dataHome, 'scratch', 'dry-run', 'persona-heads', 'davis', 'solo', 'v1.json')),
    'the dry-run shipped into its scratch store copy instead',
  );
  console.log('  [B] install: seeded, rendered, dry-run proven, nothing loaded, nothing real touched');
}

// ── C: night 1 — the chain ships for real; the seed's own head survives; verify PASSes ───
let tasteAfterNight1;
{
  const r = runNightly();
  assert.equal(r.status, 0, `night 1 must succeed:\n${r.stdout}\n${r.stderr}`);
  tasteAfterNight1 = readFileSync(join(dataHome, 'taste.json'));
  const taste = JSON.parse(tasteAfterNight1.toString('utf8'));
  assert.equal(taste.head.fidelity, 0.595, "the seed's own taste head is untouched by the ship");
  const entry = taste.personas.davis.solo;
  assert.equal(entry.version, 1);
  assert.equal(entry.labeledTurns, 180, 'Q6: all labeled turns, train + held-out');
  assert.ok(entry.heldOut >= 0.3, `the shipped head clears the bar: ${entry.heldOut}`);
  const stored = JSON.parse(readFileSync(join(dataHome, 'persona-heads', 'davis', 'solo', 'v1.json'), 'utf8'));
  assert.deepEqual(stored, entry, 'the store artifact is the shipped entry exactly');
  const report = JSON.parse(readFileSync(join(dataHome, 'last-report.json'), 'utf8'));
  assert.equal(report.entries.find((e) => e.id === 'davis' && e.kind === 'solo').verdict, 'shipped');
  assert.ok(logText().includes('VERIFY: PASS'), 'Q4: the verify alarm ran and passed, in the log');
  console.log('  [C] night 1: davis|solo v1 shipped, store + report written, VERIFY: PASS logged');
}

// ── D: night 2 — no new labels, no train: everything byte-identical ──────────────────────
{
  const storeHash = hashTree(join(dataHome, 'persona-heads'));
  const historyHash = hashFile(join(dataHome, 'persona-heads', 'history.jsonl'));
  const r = runNightly();
  assert.equal(r.status, 0, `night 2 must succeed:\n${r.stdout}\n${r.stderr}`);
  assert.ok(readFileSync(join(dataHome, 'taste.json')).equals(tasteAfterNight1), 'taste byte-identical on a no-growth night');
  assert.equal(hashTree(join(dataHome, 'persona-heads')), storeHash, 'store byte-identical');
  assert.equal(hashFile(join(dataHome, 'persona-heads', 'history.jsonl')), historyHash, 'a watermark skip is not a judged attempt — history untouched');
  const report = JSON.parse(readFileSync(join(dataHome, 'last-report.json'), 'utf8'));
  assert.equal(report.entries.find((e) => e.id === 'davis' && e.kind === 'solo').verdict, 'skipped-watermark');
  console.log('  [D] night 2: skipped-watermark — taste, store, history byte-identical');
}

// ── E: a dry-run previews faithfully and leaves the real taste + store byte-identical ────
{
  const tasteHash = hashFile(join(dataHome, 'taste.json'));
  const storeHash = hashTree(join(dataHome, 'persona-heads'));
  const logBefore = logText().length;
  const r = runNightly(['--dry-run']);
  assert.equal(r.status, 0, `dry-run must succeed:\n${r.stdout}\n${r.stderr}`);
  assert.equal(hashFile(join(dataHome, 'taste.json')), tasteHash, 'Q7: dry-run leaves the canonical taste byte-identical');
  assert.equal(hashTree(join(dataHome, 'persona-heads')), storeHash, 'Q7: dry-run leaves the store byte-identical');
  const section = logText().slice(logBefore);
  assert.ok(section.includes('DRY-RUN'), 'the dry-run logs its own section');
  assert.ok(section.includes('skipped-watermark'), 'the preview is faithful: the store copy carries the watermark, so nothing would ship');
  console.log('  [E] dry-run: faithful preview, real taste + store byte-identical');
}

// ── F: uninstall removes the schedule and nothing else — and is idempotent ───────────────
{
  const tasteHash = hashFile(join(dataHome, 'taste.json'));
  const storeHash = hashTree(join(dataHome, 'persona-heads'));
  const r = run('bash', [join(here, 'personaNightlyUninstall.sh'), '--home', root]);
  assert.equal(r.status, 0, `uninstall must succeed:\n${r.stdout}\n${r.stderr}`);
  assert.ok(!existsSync(plistPath), 'the plist is removed');
  assert.equal(hashFile(join(dataHome, 'taste.json')), tasteHash, 'uninstall never touches the canonical taste');
  assert.equal(hashTree(join(dataHome, 'persona-heads')), storeHash, 'uninstall never touches the store (rollback history is precious)');
  const r2 = run('bash', [join(here, 'personaNightlyUninstall.sh'), '--home', root]);
  assert.equal(r2.status, 0, 'a second uninstall is a no-op success');
  console.log('  [F] uninstall: plist gone, data home byte-identical, idempotent');
}

// ── G: failure honesty — a missing trainer; an install with no xgboost ───────────────────
{
  const emptyCheckout = join(sandbox, 'empty-checkout');
  mkdirSync(emptyCheckout, { recursive: true });
  const bad = run('bash', [join(here, 'personaNightly.sh')], { ...nightlyEnv, KC_CHECKOUT: emptyCheckout });
  assert.notEqual(bad.status, 0, 'a checkout without the chain must fail the night');
  assert.ok(
    logText().includes(`expected chain file missing: ${emptyCheckout}/studio/labelExtractor.mjs`),
    'the failure names the first missing chain file in the log (Q6)',
  );

  const root2 = join(sandbox, 'home2');
  const r2 = run('bash', [
    join(here, 'personaNightlyInstall.sh'),
    '--home', root2, '--taste', seedPath, '--checkout', repo,
    '--node', process.execPath, '--python3', '/bin/false', '--no-load',
  ]);
  assert.notEqual(r2.status, 0, 'install must refuse a python3 that cannot import xgboost');
  assert.ok(r2.stdout.includes('xgboost'), 'the refusal names xgboost');
  assert.ok(!existsSync(join(root2, 'Library', 'LaunchAgents', `${LABEL}.plist`)), 'a refused install writes no plist');
  assert.ok(
    !existsSync(join(root2, 'Library', 'Application Support', 'com.neuralio.kineticcurator', 'adapters', 'taste.json')),
    'a refused install seeds nothing — the checks precede every write',
  );
  console.log('  [G] honesty: missing trainer fails loudly; xgboost-less install refuses before writing');
}

// ── H: the lock — a live lock stands the night down; a stale one is broken ───────────────
{
  const lock = join(dataHome, '.nightly.lock');
  mkdirSync(lock, { recursive: true });
  writeFileSync(join(lock, 'pid'), String(process.pid));
  const r = runNightly();
  assert.equal(r.status, 3, `a live lock stands the night down with exit 3, got ${r.status}`);
  assert.ok(logText().includes('SKIPPED'), 'the stood-down night is on the record');
  writeFileSync(join(lock, 'pid'), '2147483646');
  const r2 = runNightly();
  assert.equal(r2.status, 0, `a stale lock is broken and the night runs:\n${r2.stdout}\n${r2.stderr}`);
  assert.ok(!existsSync(lock), 'the lock is released after the run');
  console.log('  [H] lock: live lock → exit 3 + SKIPPED logged; stale lock broken, night ran');
}

rmSync(sandbox, { recursive: true, force: true });
console.log('personaNightly.selfcheck: all blocks passed');
