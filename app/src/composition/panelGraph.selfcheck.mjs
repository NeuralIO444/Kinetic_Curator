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
//      (the original chain, pinned by name);
//   D. the specifier extractor itself behaves: quoted literals, plain
//      template literals (a static specifier to Vite), and unextractable
//      arguments are each pinned against sample sources below, so the
//      extraction coverage cannot silently regress.
//
// Source scan, not an import: Node cannot load the JSX/browser graph.
// Follows the purity.selfcheck.mjs precedent (specifier regex + a
// comment stripper that keeps string literals, since specifiers live in
// strings). Fail-closed, three ways: an unresolvable relative or
// root-relative import fails the suite rather than silently pruning the
// walk; a dynamic import()/require() whose argument is a template
// literal WITH a ${…} substitution fails the suite (its target cannot
// be statically extracted); and any import()/require() whose argument
// is not a literal at all likewise fails the suite.
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
// import(), or require() call (same shape as purity.selfcheck.mjs,
// extended in the #2081 fix round: the quote class also accepts a
// backtick, because a no-substitution template literal — import(`./x`)
// — is a static specifier to Vite and must be walked like a quoted one.
// Group 1 is the quote character, group 2 the specifier text.
const SPEC_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bexport\s+[^'"`]*?\s+from\s*|\bimport\s+)(['"`])([^'"`]+)\1/g;

// Any import()/require() call site; used to fail closed when the call's
// argument is not a literal SPEC_RE could extract (see extractSpecifiers).
const CALL_RE = /\b(?:import|require)\s*\(\s*/g;

// ---------------------------------------------------------------------------
// Specifier extraction. Returns { specifiers, unextractable }: the literal
// specifiers found, plus one entry per dynamic argument that cannot be
// statically extracted (a substituted template literal, or a non-literal
// argument). Callers must treat a non-empty `unextractable` as fatal.
// ---------------------------------------------------------------------------
function extractSpecifiers(rawSrc) {
  const src = stripComments(rawSrc);
  const specifiers = [];
  const unextractable = [];
  for (const m of src.matchAll(SPEC_RE)) {
    const [, quote, spec] = m;
    if (quote === '`' && spec.includes('${')) {
      unextractable.push(`substituted template literal \`${spec}\``);
      continue;
    }
    specifiers.push(spec);
  }
  for (const m of src.matchAll(CALL_RE)) {
    const next = src[m.index + m[0].length];
    if (next !== "'" && next !== '"' && next !== '`') {
      unextractable.push(`non-literal import()/require() argument at offset ${m.index}`);
    }
  }
  return { specifiers, unextractable };
}

// Extractor self-tests (D): pin the extraction shapes against sample
// sources so the coverage above cannot silently regress.
for (const t of [
  { src: "import x from './a.js';", specs: ['./a.js'], bad: 0 },
  { src: 'export { y } from "./b.mjs";', specs: ['./b.mjs'], bad: 0 },
  { src: "const p = import('./c.js');", specs: ['./c.js'], bad: 0 },
  { src: 'const r = require("./d.js");', specs: ['./d.js'], bad: 0 },
  { src: 'const p = import(`./e.mjs`);', specs: ['./e.mjs'], bad: 0 },
  { src: 'const p = import(`./dir-${name}.mjs`);', specs: [], bad: 1 },
  { src: 'const p = import(name);', specs: [], bad: 1 },
  { src: 'const r = require(name);', specs: [], bad: 1 },
  { src: "// import('./ghost.js')\nimport z from './real.js';", specs: ['./real.js'], bad: 0 },
]) {
  const got = extractSpecifiers(t.src);
  assert.deepStrictEqual(got.specifiers, t.specs, `extractor specifiers wrong for sample: ${t.src}`);
  assert.strictEqual(
    got.unextractable.length,
    t.bad,
    `extractor fail-closed count wrong for sample: ${t.src} (got ${JSON.stringify(got.unextractable)})`,
  );
}

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
const unextractable = [];
const chainTo = (abs) => {
  const parts = [];
  let cur = abs;
  while (cur) {
    parts.unshift(rel(cur));
    cur = parent.get(cur);
  }
  return parts.join(' -> ');
};
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
  const extracted = extractSpecifiers(readFileSync(file, 'utf8'));
  for (const u of extracted.unextractable) unextractable.push(`${rel(file)} -> ${u}`);
  for (const spec of extracted.specifiers) {
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
      // Root-relative (Vite public/src paths): resolve against app/ —
      // and fail closed when it does not resolve (NOTE-2, fix round).
      const target = resolveRelative(`.${spec}`, join(APP, 'index.html'));
      if (!target) {
        unresolved.push(`${rel(file)} -> '${spec}'`);
        continue;
      }
      if (!parent.has(target)) {
        parent.set(target, file);
        queue.push(target);
      }
    } else {
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      bareSpecifiers.add(pkg);
      assert.ok(
        !FORBIDDEN_SPECIFIERS.has(pkg),
        `${rel(file)} imports forbidden Node-only package '${pkg}' — chain: ${chainTo(file)}`,
      );
    }
  }
}

assert.deepStrictEqual(
  unresolved,
  [],
  `panel graph walk hit unresolvable imports (fail-closed):\n${unresolved.join('\n')}`,
);
assert.deepStrictEqual(
  unextractable,
  [],
  `panel graph walk hit import()/require() arguments it cannot statically extract (fail-closed):\n${unextractable.join('\n')}`,
);

const visited = new Set([...parent.keys()].map(rel));
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
    `no @resvg/resvg-js, censusReport, assetTraitsBake, or regionBake reachable; extractor self-tests passed`,
);
