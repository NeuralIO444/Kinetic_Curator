/**
 * glBoundary.selfcheck.mjs — the #1239 acceptance bar, enforced in CI.
 *
 * "No kernel file imports from gl/": the kernel must stay pure and
 * worker-safe, so no module under app/src/engine/kernel/ may statically
 * import (or dynamically import / require / re-export from) anything under
 * app/src/gl/.
 *
 * This is a SOURCE grep, not a one-time edit: any future kernel→gl arrow
 * fails the build here. It scans every .js/.mjs under the kernel directory
 * (including this file's own directory — this selfcheck itself imports
 * nothing from gl/).
 */
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const KERNEL_DIR = dirname(fileURLToPath(import.meta.url));

// Matches a module specifier inside a static import, an export...from, or a
// dynamic import()/require() call: from '...gl/...' / import('...gl/...').
const SPEC_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bexport\s+[^'"]*?\s+from\s*)['"]([^'"]+)['"]/g;

function glSpecifier(spec) {
  // A specifier is a gl/ import when it names the gl tree: bare 'gl/...' or
  // any relative path whose segments include 'gl' (e.g. '../../gl/foo.mjs').
  return /(^|\/)gl\//.test(spec);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.m?js$/.test(name)) yield p;
  }
}

const offenders = [];
for (const file of walk(KERNEL_DIR)) {
  const text = readFileSync(file, 'utf8');
  let m;
  SPEC_RE.lastIndex = 0;
  while ((m = SPEC_RE.exec(text)) !== null) {
    if (glSpecifier(m[1])) {
      offenders.push(`${relative(KERNEL_DIR, file)} → '${m[1]}'`);
    }
  }
}

assert.equal(
  offenders.length,
  0,
  `kernel→gl imports found (#1239 boundary violated):\n  ${offenders.join('\n  ')}`
);
console.log('[selfcheck] kernel/gl boundary OK — no kernel file imports from gl/');
