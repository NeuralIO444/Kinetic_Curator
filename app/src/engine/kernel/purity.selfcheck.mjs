/**
 * purity.selfcheck.mjs — the #1310 acceptance bar (docs/design/worker-thread-kernel.md
 * prerequisite 2: "the worker cannot import the render layer, directly or transitively").
 *
 * Nothing under app/src/engine/kernel/ may:
 *   1. import (static, dynamic import(), require(), or export...from) anything under
 *      app/src/gl/, app/src/panels/, or app/src/components/;
 *   2. use DOM APIs (document, window, localStorage, requestAnimationFrame, ...);
 *   3. use React APIs (react imports, React.*, hook calls).
 *
 * This is a SOURCE scan, not a one-time edit: any future kernel→render-layer arrow
 * fails the build here. It scans every .js/.mjs under the kernel directory,
 * including this file's own directory. Fail-closed: offenders are named.
 *
 * Scan hygiene: comments, string literals, and regex literals are blanked before
 * matching (kernel comments legitimately mention "window", "requestAnimationFrame",
 * and "React" in prose), and the blanker is regex-literal aware so a `//` inside
 * a regex can never swallow the rest of a line.
 */
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const KERNEL_DIR = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 1. Forbidden import trees (checked against module specifiers)
// ---------------------------------------------------------------------------

/** Tree roots under app/src the kernel must never reach into. */
const FORBIDDEN_TREES = ['gl', 'panels', 'components'];

function forbiddenSpecifier(spec) {
  for (const tree of FORBIDDEN_TREES) {
    // Bare 'gl/...' or any relative path with a `gl/` segment (../../gl/x.mjs).
    if (new RegExp(`(^|/)${tree}/`).test(spec)) return `app/src/${tree}/`;
  }
  if (spec === 'react' || spec.startsWith('react/') || spec === 'react-dom' || spec.startsWith('react-dom/')) {
    return 'react';
  }
  return null;
}

// Matches a module specifier in a static import, export...from, dynamic
// import(), or require() call.
const SPEC_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bexport\s+[^'"]*?\s+from\s*)['"]([^'"]+)['"]/g;

// ---------------------------------------------------------------------------
// 2. DOM / React API usage (checked against code with comments+strings blanked)
// ---------------------------------------------------------------------------

/** DOM globals/constructor names. Word-boundary matched; `self`, `performance`,
 *  `console`, and `fetch` are deliberately excluded — all exist in workers. */
const DOM_IDENTIFIERS = [
  'document', 'window', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB',
  'history', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'Image', 'Audio',
  'OffscreenCanvas', 'WebGLRenderingContext', 'WebGL2RenderingContext',
  'CanvasRenderingContext2D', 'ImageData', 'customElements', 'getComputedStyle',
  'matchMedia', 'IntersectionObserver', 'ResizeObserver', 'MutationObserver',
  'devicePixelRatio', 'innerWidth', 'innerHeight', 'alert', 'confirm', 'prompt',
];
const DOM_RE = new RegExp(`\\b(${DOM_IDENTIFIERS.join('|')})\\b`);

/** React API usage that isn't an import: the React namespace and hook calls. */
const REACT_USAGE_RE = /\bReact\.[A-Za-z]+|\buse[A-Z][A-Za-z0-9]*\s*\(/;

// ---------------------------------------------------------------------------
// 3. Source blanker (comments, strings, regexes → spaces; code kept)
// ---------------------------------------------------------------------------

const blank = (s) => s.replace(/[^\n]/g, ' ');

// A '/' starts a regex literal (not division) when the previous significant
// token can't end an operand.
const REGEX_OK_BEFORE = new Set([',', ';', ':', '{', '}', '(', '[', '=', '!', '&', '|', '?', '+', '-', '*', '%', '^', '~', '<', '>']);
const REGEX_OK_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

function prevSig(text, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  return j;
}

function regexStart(text, i) {
  const j = prevSig(text, i);
  if (j < 0) return true;
  const c = text[j];
  if (REGEX_OK_BEFORE.has(c)) return true;
  if (/[A-Za-z_$]/.test(c)) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(text[k])) k--;
    return REGEX_OK_KEYWORDS.has(text.slice(k + 1, j + 1));
  }
  return false;
}

/** Index just past a regex literal starting at i (the opening '/'). */
function skipRegex(text, i) {
  let k = i + 1;
  let inClass = false;
  while (k < text.length) {
    const c = text[k];
    if (c === '\\') { k += 2; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      k++;
      while (k < text.length && /[a-z]/i.test(text[k])) k++;
      return k;
    } else if (c === '\n') return k; // unterminated — bail, don't swallow the file
    k++;
  }
  return k;
}

/** Index just past a '...' or "..." string starting at i (the opening quote). */
function skipString(text, i) {
  const q = text[i];
  let k = i + 1;
  while (k < text.length) {
    if (text[k] === '\\') { k += 2; continue; }
    if (text[k] === q) return k + 1;
    if (text[k] === '\n') return k; // unterminated — bail
    k++;
  }
  return k;
}

/**
 * Template literal starting at i (the opening backtick). Returns [blanked, end]:
 * literal text is blanked, ${...} interpolation code is kept (recursively blanked).
 * A nested template inside an interpolation is blanked wholesale — vanishingly rare.
 */
function skipTemplate(text, i) {
  let out = '';
  let k = i + 1; // past opening backtick
  let seg = k;   // start of the current literal-text run
  const flush = (to) => { out += blank(text.slice(seg, to)); seg = to; };
  while (k < text.length && text[k] !== '`') {
    const c = text[k];
    if (c === '\\') { k += 2; continue; }
    if (c === '$' && text[k + 1] === '{') {
      flush(k);
      let depth = 1;
      let m = k + 2;
      while (m < text.length && depth > 0) {
        const d = text[m];
        if (d === "'" || d === '"') m = skipString(text, m);
        else if (d === '`') {
          let n = m + 1;
          while (n < text.length && text[n] !== '`') { if (text[n] === '\\') n++; n++; }
          m = Math.min(n + 1, text.length);
        } else if (d === '/' && text[m + 1] === '/') {
          const nl = text.indexOf('\n', m);
          m = nl === -1 ? text.length : nl;
        } else if (d === '/' && text[m + 1] === '*') {
          const end = text.indexOf('*/', m + 2);
          m = end === -1 ? text.length : end + 2;
        } else if (d === '/' && regexStart(text, m)) m = skipRegex(text, m);
        else { if (d === '{') depth++; else if (d === '}') depth--; m++; }
      }
      out += stripCode(text.slice(k + 2, Math.max(m - 1, k + 2)));
      k = m;
      seg = k;
    } else {
      k++;
    }
  }
  flush(Math.min(k + 1, text.length));
  return [out, Math.min(k + 1, text.length)];
}

/** Source with comments, strings, and regex literals replaced by spaces. */
function stripCode(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const two = text[i + 1] !== undefined ? c + text[i + 1] : c;
    if (two === '//') {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      out += blank(text.slice(i, end));
      i = end;
    } else if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += blank(text.slice(i, stop));
      i = stop;
    } else if (c === "'" || c === '"') {
      const end = skipString(text, i);
      out += blank(text.slice(i, end));
      i = end;
    } else if (c === '`') {
      const [b, end] = skipTemplate(text, i);
      out += b;
      i = end;
    } else if (c === '/' && regexStart(text, i)) {
      const end = skipRegex(text, i);
      out += blank(text.slice(i, end));
      i = end;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Source with ONLY comments blanked (strings kept — import specifiers live in strings). */
function stripComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      out += blank(text.slice(i, end));
      i = end;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += blank(text.slice(i, stop));
      i = stop;
    } else if (c === '/' && regexStart(text, i)) {
      const end = skipRegex(text, i);
      out += ' ';
      i = end;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Walk the kernel and collect offenders
// ---------------------------------------------------------------------------

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.m?js$/.test(name)) yield p;
  }
}

const offenders = [];

for (const file of walk(KERNEL_DIR)) {
  const rel = relative(KERNEL_DIR, file);
  const text = readFileSync(file, 'utf8');

  // 4a. Forbidden import trees.
  const specText = stripComments(text);
  let m;
  SPEC_RE.lastIndex = 0;
  while ((m = SPEC_RE.exec(specText)) !== null) {
    const hit = forbiddenSpecifier(m[1]);
    if (hit) offenders.push(`${rel} imports '${m[1]}' (forbidden: ${hit})`);
  }

  // 4b. DOM / React API usage in real code (comments and strings blanked).
  const code = stripCode(text);
  const dom = code.match(DOM_RE);
  if (dom) offenders.push(`${rel} uses DOM API '${dom[1]}'`);
  const reactUse = code.match(REACT_USAGE_RE);
  if (reactUse) offenders.push(`${rel} uses React API '${reactUse[0].trim()}'`);
}

assert.equal(
  offenders.length,
  0,
  `kernel purity violated (#1310 — worker-thread-kernel.md prerequisite 2):\n  ${offenders.join('\n  ')}`,
);
console.log('[selfcheck] kernel purity OK — no imports from gl/panels/components, no DOM/React API use');
