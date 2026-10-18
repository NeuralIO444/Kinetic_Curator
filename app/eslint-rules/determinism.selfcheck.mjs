// node eslint-rules/determinism.selfcheck.mjs
//
// Audit fix 4 (#1637) — the determinism lint wall, proven. Drives
// ESLint's Linter API against the production rule + allowlist:
//
//  1. one fixture per API smuggled into an engine path fails with
//     exactly one red each, carrying the plain-language law;
//  2. a clock smuggled into a UI path passes (clock scope is the
//     sim-adjacent trees), while Math.random fails everywhere in src/;
//  3. the #1637 named cases — quadtreeSignal (its clock default was
//     removed in fix 3b) and markovPick's home, curator/transitions.js
//     (its Math.random fallback was removed in fix 3a) — lint clean
//     with NO allowance: present-and-clean, recorded here, not deleted;
//  4. every allowlisted real file lints clean (exact counts, both ways);
//  5. an allowance without a written reason fails like a violation;
//  6. a stale allowance fails; a forbidden-zone call fails even with
//     an allowance.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Linter } from 'eslint';
import plugin from './determinism.mjs';
import { DETERMINISM_ALLOWLIST, DETERMINISM_FORBIDDEN, DETERMINISM_CLOCK_DIRS } from './determinism-allowlist.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const RULE_ID = 'determinism/no-unseeded-random-or-clock';
// Pin the Linter's base to the app root: its files-pattern matching is
// cwd-relative, and this suite must hold wherever the manifest runs it from.
const linter = new Linter({ cwd: join(HERE, '..') });

const productionOptions = {
  allow: DETERMINISM_ALLOWLIST,
  forbidden: DETERMINISM_FORBIDDEN,
  clockDirs: DETERMINISM_CLOCK_DIRS,
};

function lintRaw(code, filename, options = productionOptions) {
  return linter.verify(
    code,
    [
      {
        files: ['**/*.{js,mjs,jsx}'],
        plugins: { determinism: plugin },
        rules: { [RULE_ID]: ['error', options] },
        languageOptions: {
          ecmaVersion: 2023,
          sourceType: 'module',
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
      },
    ],
    { filename },
  );
}

// Only this rule's verdicts are the suite's business (a bare Linter run
// also emits unused-disable-directive notes for other rules' comments).
function lint(code, filename, options = productionOptions) {
  return lintRaw(code, filename, options).filter((m) => m.ruleId === RULE_ID);
}

const fixture = (name) => readFileSync(join(HERE, 'fixtures', name), 'utf8');
// The rule keys paths off an absolute filename's /src/ segment, exactly
// as the ESLint CLI hands it real files — so tests pass absolute paths.
const at = (rel) => join(SRC, rel);
const realFile = (rel) => readFileSync(join(SRC, rel), 'utf8');

// Allowlist shape: every entry is an exact count with a written reason.
for (const [rel, apis] of Object.entries(DETERMINISM_ALLOWLIST)) {
  for (const [api, entry] of Object.entries(apis)) {
    assert.ok(
      Number.isInteger(entry.count) && entry.count >= 1,
      `${rel} ${api}: allowance count must be a positive integer`,
    );
    assert.ok(
      typeof entry.why === 'string' && entry.why.trim().length > 0,
      `${rel} ${api}: allowance needs a written reason`,
    );
  }
}

// 1 — one red per smuggled call in an engine path.
for (const [name, api] of [
  ['smuggle-random.js', 'Math.random'],
  ['smuggle-date-now.js', 'Date.now'],
  ['smuggle-performance-now.js', 'performance.now'],
]) {
  const messages = lint(fixture(name), at('engine/fixture.js'));
  assert.strictEqual(messages.length, 1, `${name}: exactly one red, got ${JSON.stringify(messages)}`);
  assert.strictEqual(messages[0].ruleId, RULE_ID);
  assert.ok(messages[0].message.includes('Determinism law'), `${name}: message names the law`);
  assert.ok(messages[0].message.includes(api), `${name}: message names the call`);
}

// 2 — scope: clocks are free in UI paths; random is walled everywhere.
assert.deepStrictEqual(
  lint(fixture('smuggle-date-now.js'), at('panels/fixture.jsx')),
  [],
  'Date.now in a UI path is out of clock scope',
);
assert.strictEqual(
  lint(fixture('smuggle-random.js'), at('panels/fixture.jsx')).length,
  1,
  'Math.random is walled across all of src/',
);

// 3 — the named cases: present-and-clean, no allowances.
for (const rel of ['engine/kernel/sample/quadtreeSignal.js', 'curator/transitions.js']) {
  assert.ok(!(rel in DETERMINISM_ALLOWLIST), `${rel} must not need an allowance`);
  assert.deepStrictEqual(lint(realFile(rel), at(rel)), [], `${rel} lints clean (fix 3 removed its unseeded fallback)`);
}

// 4 — every allowlisted real file lints clean: exact counts, both ways.
for (const rel of Object.keys(DETERMINISM_ALLOWLIST)) {
  const raw = lintRaw(realFile(rel), at(rel));
  assert.ok(!raw.some((m) => m.fatal), `${rel}: must parse cleanly under the rule config`);
  assert.deepStrictEqual(
    raw.filter((m) => m.ruleId === RULE_ID),
    [],
    `${rel}: found counts must equal its allowance exactly`,
  );
}

// 5 — a reasonless allowance fails like a violation.
{
  const doctored = structuredClone(productionOptions);
  doctored.allow['state/id.js']['Date.now'].why = '  ';
  const messages = lint(realFile('state/id.js'), at('state/id.js'), doctored);
  assert.ok(
    messages.some((m) => m.message.includes('no written reason')),
    'a blanked reason must be reported',
  );
}

// 6a — a stale allowance fails.
{
  const doctored = structuredClone(productionOptions);
  doctored.allow['state/id.js']['Date.now'].count = 2;
  const messages = lint(realFile('state/id.js'), at('state/id.js'), doctored);
  assert.ok(
    messages.some((m) => m.message.includes('stale')),
    'an inflated allowance must be reported stale',
  );
}

// 6b — the forbidden zone honours no allowance.
{
  const doctored = structuredClone(productionOptions);
  doctored.allow['engine/kernel/fixture.js'] = {
    'Math.random': { count: 1, why: 'a test allowance that must not be honoured' },
  };
  const messages = lint(fixture('smuggle-random.js'), at('engine/kernel/fixture.js'), doctored);
  assert.strictEqual(messages.length, 1, 'forbidden zone: exactly one red even with an allowance');
  assert.ok(messages[0].message.includes('forbidden'), 'forbidden zone: message says so');
}

console.log('determinism.selfcheck: OK — the wall holds (fixtures red, named cases clean, allowlist exact)');
