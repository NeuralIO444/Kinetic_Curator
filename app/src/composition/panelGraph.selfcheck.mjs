// panelGraph.selfcheck.mjs — the #2081 regression pin: the browser panel
// graph must never statically reach a Node-only module.
//
// Why this exists: in `tauri dev`, Vite's dependency optimizer walks the
// module graph of whatever the browser asks for, and it cannot pre-bundle
// @resvg/resvg-js (CommonJS that require()s a native .node binary at module
// top level) — it dies with UNLOADABLE_DEPENDENCY and the DEV panel shows
// "Importing a module script failed." The production build is unaffected
// (rolldown drops the Node-only code), so only a graph pin can hold this
// line. The original chain was megamindSurfacesLive → censusReport →
// @resvg: one pure function (tasteAgreement) living in a Node-side module.
// It now lives in tasteHead.js; censusReport re-exports it for Node-side
// consumers.
//
// What it proves, by walking the static import graph (static imports,
// export...from, dynamic import(), require) from the panel roots:
//   A. none of the forbidden modules is reachable: the bare specifier
//      '@resvg/resvg-js', and the files src/curator/censusReport.mjs,
//      src/assets/assetTraitsBake.mjs, src/assets/regionBake.mjs;
//   B. the walk is not vacuous — the MegaMind chain (MegaMindPanel,
//      megamindSurfacesLive, megamindVisionLive, tasteHead) IS reached;
//   C. megamindSurfacesLive.js carries no direct censusReport import
//      (the original chain, pinned by name).
//
// Source scan, not an import: Node cannot load the JSX/browser graph.
// Follows the purity.selfcheck.mjs precedent (specifier regex + a
// comment stripper that keeps string literals, since specifiers live in
// strings). Fail-closed: an unresolvable relative import fails the suite
// rather than silently pruning the walk.
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(APP, 'src');
const rel = (p) => relative(APP, p).split('\\').join('/');

// ---------------------------------------------------------------------------
// Comment stripping (string- and regex-aware enough for this codebase:
// string literals are KEPT — module specifiers live inside them).
// ---------------------------------------------------------------------------
function stripComments(src) {
  let out = '';
  let i = 0;
  let state = 'code'; // code | sq | dq | tpl | line | block
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1] ?? '';
    if (state === 'code') {
      if (c === '/' && n === '/') {
        state = 'line';
        out += '  ';
        i += 2;
      } else if (c === '/' && n === '*') {
        state = 'block';
        out += '  ';
        i += 2;
      } else if (c === "'") {
        state = 'sq';
        out += c;
        i += 1;
      } else if (c === '"') {
        state = 'dq';
        out += c;
        i += 1;
      } else if (c === '`') {
        state = 'tpl';
        out += c;
        i += 1;
      } else {
        out += c;
        i += 1;
      }
    } else if (state === 'line') {
      if (c === '\n') {
        state = 'code';
        out += c;
      } else {
        out += ' ';
      }
      i += 1;
    } else if (state === 'block') {
      if (c === '*' && n === '/') {
        state = 'code';
        out += '  ';
        i += 2;
      } else {
        out += c === '\n' ? '\n' : ' ';
        i += 1;
      }
    } else {
      // inside a string/template literal: copy verbatim, honour escapes
      out += c;
      if (c === '\\') {
        out += n;
        i += 2;
        continue;
      }
      if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) {
        state = 'code';
      }
      i += 1;
    }
  }
  return out;
}

// Matches a module specifier in a static import, export...from, dynamic
// import(), or require() call (same shape as purity.selfcheck.mjs).
const SPEC_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bexport\s+[^'"]*?\s+from\s*|\bimport\s+)['"]([^'"]+)['"]/g;

const FORBIDDEN_FILES = new Set([
  'src/curator/censusReport.mjs',
  'src/assets/assetTraitsBake.mjs',
  'src/assets/regionBake.mjs',
]);
const FORBIDDEN_SPECIFIERS = new Set(['@resvg/resvg-js']);

const ROOTS = ['src/composition/PanelRegistry.js', 'src/panels/DevPanel.jsx', 'src/panels/MegaMindPanel.jsx'];

const LEAF_EXT = /\.(json|css|wasm|png|jpe?g|gif|svg|webp|woff2?|ttf|md|txt)$/i;

function resolveRelative(spec, importerFile) {
  const clean = spec.split('?')[0];
  const base = resolve(dirname(importerFile), clean);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.jsx`,
    join(base, 'index.js'),
    join(base, 'index.mjs'),
    join(base, 'index.jsx'),
  ];
  for (const cand of candidates) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

// BFS over the graph, remembering each file's parent for chain reports.
const parent = new Map();
const queue = [];
const bareSpecifiers = new Set();
const unresolved = [];
for (const root of ROOTS) {
  const abs = join(APP, root);
  assert.ok(existsSync(abs), `panel graph root missing: ${root}`);
  if (!parent.has(abs)) {
    parent.set(abs, null);
    queue.push(abs);
  }
}
while (queue.length) {
  const file = queue.shift();
  if (LEAF_EXT.test(file)) continue;
  const src = stripComments(readFileSync(file, 'utf8'));
  for (const m of src.matchAll(SPEC_RE)) {
    const spec = m[1];
    if (spec.startsWith('.')) {
      const target = resolveRelative(spec, file);
      if (!target) {
        unresolved.push(`${rel(file)} -> '${spec}'`);
        continue;
      }
      if (!parent.has(target)) {
        parent.set(target, file);
        queue.push(target);
      }
    } else if (spec.startsWith('/')) {
      // Root-relative (Vite public/src paths): resolve against app/.
      const target = resolveRelative(`.${spec}`, join(APP, 'index.html'));
      if (target && !parent.has(target)) {
        parent.set(target, file);
        queue.push(target);
      }
    } else {
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      bareSpecifiers.add(pkg);
      assert.ok(!FORBIDDEN_SPECIFIERS.has(pkg), `${rel(file)} imports forbidden Node-only package '${pkg}'`);
    }
  }
}

assert.deepStrictEqual(
  unresolved,
  [],
  `panel graph walk hit unresolvable relative imports (fail-closed):\n${unresolved.join('\n')}`,
);

const visited = new Set([...parent.keys()].map(rel));
const chainTo = (abs) => {
  const parts = [];
  let cur = abs;
  while (cur) {
    parts.unshift(rel(cur));
    cur = parent.get(cur);
  }
  return parts.join(' -> ');
};
for (const abs of parent.keys()) {
  const r = rel(abs);
  assert.ok(!FORBIDDEN_FILES.has(r), `Node-only module reachable from the panel graph: ${chainTo(abs)}`);
}

// B. the walk actually traversed the MegaMind chain.
for (const must of [
  'src/panels/DevPanel.jsx',
  'src/panels/devTabs.mjs',
  'src/panels/MegaMindPanel.jsx',
  'src/curator/megamindSurfacesLive.js',
  'src/curator/megamindVisionLive.js',
  'src/curator/tasteHead.js',
]) {
  assert.ok(visited.has(must), `panel graph walk never reached ${must} — the walk is broken, not clean`);
}
assert.ok(visited.size > 100, `panel graph walk visited only ${visited.size} modules — suspiciously small`);

// C. the original chain, pinned by name.
const surfacesLive = readFileSync(join(SRC, 'curator/megamindSurfacesLive.js'), 'utf8');
assert.ok(
  !/from\s+['"]\.\/censusReport\.mjs['"]/.test(surfacesLive),
  'megamindSurfacesLive.js must not import censusReport.mjs (the #2081 chain)',
);

console.log(
  `[selfcheck] panel graph OK — ${visited.size} modules walked from ${ROOTS.length} panel roots; ` +
    `no @resvg/resvg-js, censusReport, assetTraitsBake, or regionBake reachable`,
);
