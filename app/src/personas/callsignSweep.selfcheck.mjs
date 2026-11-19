// callsignSweep.selfcheck.mjs — #2383 (Persona Kernel P3, spec ruling R6): no real names on any surface.
// Surfaces speak in callsigns only — COVER, OVERLAP, BLAST, HYBRID, SWISS GRIT; the queen and the
// governor are never named. The real names (George Lois, Joshua Davis, David Carson, April Greiman,
// Chris Ashworth, Tina Turner, David Bowie) are LINEAGE: they live in code identifiers, comments, the
// persona records' identity slots and the design docs, and they stay there. This suite guards the line
// between the two: it scans the surface sources (every .jsx, the components/panels/hooks/data trees,
// the app shell, and a named list of copy-bearing modules) with comments stripped, and fails
// on a banned name in display form — a full name in any case, or a bare surname (plus "George", the
// attested form of address) in Title or UPPER case as a whole word. Lowercase ids, class names and
// camelCase identifiers never match: they are code, not copy.
//
// Deliberate exclusions, each a ruling not an oversight:
//   · *.selfcheck.mjs — tests quote the strings they pin; they are not surfaces.
//   · src/curator/lore.json — an offline-curated provenance artifact (studio/curate-lore.py); its
//     facts DO render in the Mind panel and still name George Lois. Rewriting a curated artifact is
//     not a sweep decision — flagged as an open question in the #2383 staging report for Matt's ruling.
//   · the model prompts (curator/megamindVoice.mjs, curator/megamindSurfaces.mjs) — instructions to
//     a local model, never rendered; the P0 lane left their wording deliberately, and prompt wording
//     is behaviour, not display.
//   · curator/megamindRecap.mjs as a whole file — it interleaves three kinds of string: rendered
//     recap phrases, internal fact-matching data (the facts' `forms` arrays, which the narration
//     grounds against what the prompted model writes), and model prompts. A whole-file scan cannot
//     tell them apart, so the file is excluded here and its RENDERED phrases are pinned by name in
//     check C4 below — if a phrase regresses to a real name, C4 fails loudly.
//   · the Canon record artifacts (data/canon/baselines.js, data/canon/styles.js) as whole files —
//     curated records like the persona records: their prose (basis, identity, figures) is lineage,
//     and their DISPLAY fields (each baseline's label, each style's name) are asserted clean at
//     runtime in check C5 instead. Plus one LINEAGE FIELD inside an otherwise-scanned data module:
//     `era:` in data/palettes.js (no UI consumer reads it) — dropped line-wise; check A4 proves a
//     name in any other field of a data file still bites.
//   · the rest of composition/ — only capabilityRegistry.mjs is named into the scan, because its
//     consumer notes render (MegaMindPanel's capability table). The other composition modules'
//     note strings (e.g. eventRegistry's) are code-side documentation with no rendering consumer,
//     so a directory-wide scan would guard text no surface ever shows.
//   · ONE allowlisted string: the DIRECTORS matrix's room-3 spoken line for davis —
//     "He found his one in my compost pile. You're welcome, George." — Matt-signed authored dialogue
//     (docs/research/directors-copy-matrix-2026-10-07.md). The sweep does not rewrite signed copy; the
//     line is flagged in the staging report. The allowlist is exact-match and this suite asserts it
//     still matches exactly one string in exactly one file, so the exception cannot silently grow.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOCTRINES } from '../curator/doctrines.mjs';
import { DIRECTORS_MATRIX } from '../curator/directorsMatrix.js';
import { CANON_BASELINES } from '../data/canon/baselines.js';
import { CANON_STYLES } from '../data/canon/styles.js';
import { getPersona } from './registry.mjs';

let checks = 0;
const ok = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ok ${name}`);
};

// ── the banned set ───────────────────────────────────────────────────────────
const FULL_NAMES = ['George Lois', 'Joshua Davis', 'Tina Turner', 'David Bowie', 'David Carson', 'April Greiman', 'Chris Ashworth'];
const SURNAMES = ['Lois', 'Davis', 'Carson', 'Greiman', 'Ashworth', 'Turner', 'Bowie'];
const BANNED = [
  ...FULL_NAMES.map((n) => ({ label: n, re: new RegExp(`\\b${n}\\b`, 'i') })),
  ...SURNAMES.flatMap((s) => [
    { label: s, re: new RegExp(`\\b${s}\\b`) },
    { label: s.toUpperCase(), re: new RegExp(`\\b${s.toUpperCase()}\\b`) },
  ]),
  { label: 'George', re: /\bGeorge\b/ },
  { label: 'GEORGE', re: /\bGEORGE\b/ },
];

/** Banned display tokens in a text (comments must already be stripped). */
export function bannedIn(text) {
  return BANNED.filter(({ re }) => re.test(text)).map(({ label }) => label);
}

/** Strip // and block comments, string-aware: a comment marker inside a string or template
 *  literal is copy, not a comment, so it survives the strip and the scan sees what follows it
 *  ("verdict // Davis approves" must bite — check A5). Strings are kept verbatim: they are the
 *  surface copy being guarded. Comments are dropped: lineage lives there. A quote or slash
 *  opens a string/regex only in expression position (after an operator, opener, separator or
 *  keyword) — an apostrophe in JSX text, a division slash, a self-closing tag's slash and a
 *  closing tag's slash all follow a value and stay plain code. A backtick always opens a
 *  template (it has no other use in code). Template ${ } interpolations nest back into code. */
const code = (src) => {
  let out = '';
  let i = 0;
  const n = src.length;
  let mode = 'code'; // code | sq | dq | tpl | line | block | regex
  let inClass = false; // inside a regex [...] class
  const interp = []; // brace depth at each template ${ entry
  let braces = 0;
  const exprPosition = () => {
    const tail = out.replace(/\s+$/, '');
    if (!tail) return true;
    if (tail.endsWith('++') || tail.endsWith('--')) return false; // postfix — a value precedes
    if (tail.endsWith('=>')) return true;
    const last = tail[tail.length - 1];
    if ('(,=:[!&|?{;+-*%~^'.includes(last)) return true;
    const word = tail.match(/[A-Za-z_$][\w$]*$/);
    return !!word && /^(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)$/.test(word[0]);
  };
  while (i < n) {
    const c = src[i];
    const d = i + 1 < n ? src[i + 1] : '';
    if (mode === 'code') {
      if (c === '/' && d === '/') {
        mode = 'line';
        i += 2;
        continue;
      }
      if (c === '/' && d === '*') {
        mode = 'block';
        i += 2;
        continue;
      }
      if (c === "'" && exprPosition()) {
        mode = 'sq';
        out += c;
        i += 1;
        continue;
      }
      if (c === '"' && exprPosition()) {
        mode = 'dq';
        out += c;
        i += 1;
        continue;
      }
      if (c === '`') {
        mode = 'tpl';
        out += c;
        i += 1;
        continue;
      }
      if (c === '/' && src[i - 1] !== '<' && exprPosition()) {
        mode = 'regex';
        inClass = false;
        out += c;
        i += 1;
        continue;
      }
      if (c === '{') braces += 1;
      if (c === '}') {
        if (interp.length && braces === interp[interp.length - 1]) {
          interp.pop();
          mode = 'tpl';
          out += c;
          i += 1;
          continue;
        }
        braces -= 1;
      }
      out += c;
      i += 1;
      continue;
    }
    if (mode === 'line') {
      if (c === '\n') {
        mode = 'code';
        out += c;
      }
      i += 1;
      continue;
    }
    if (mode === 'block') {
      if (c === '*' && d === '/') {
        mode = 'code';
        i += 2;
        continue;
      }
      if (c === '\n') out += c;
      i += 1;
      continue;
    }
    if (mode === 'sq' || mode === 'dq') {
      const q = mode === 'sq' ? "'" : '"';
      out += c;
      if (c === '\\' && i + 1 < n) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      if (c === q) mode = 'code';
      i += 1;
      continue;
    }
    if (mode === 'tpl') {
      out += c;
      if (c === '\\' && i + 1 < n) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      if (c === '`') {
        mode = 'code';
        i += 1;
        continue;
      }
      if (c === '$' && d === '{') {
        out += d;
        interp.push(braces);
        mode = 'code';
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    // regex literal: copy verbatim until the closing slash outside a [...] class
    out += c;
    if (c === '\\' && i + 1 < n) {
      out += src[i + 1];
      i += 2;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) mode = 'code';
    i += 1;
  }
  return out;
};

/** The scannable text of one file: comments stripped everywhere; lineage fields dropped in data/. */
const surfaceText = (rel, raw) => {
  let text = code(raw);
  if (rel.startsWith('data/'))
    text = text
      .split('\n')
      .filter((l) => !/^\s*(figures|era):/.test(l))
      .join('\n');
  return text;
};

// ── the scan scope ───────────────────────────────────────────────────────────
const SRC = fileURLToPath(new URL('..', import.meta.url));
const APP = fileURLToPath(new URL('../..', import.meta.url));
const SURFACE_DIRS = ['components', 'panels', 'hooks', 'data'];
const EXTRA_FILES = [
  'curator/mindPresenceLive.js', // the presence LABELS (COVER / OVERLAP / III)
  'curator/directorsMatrix.js', // DIRECTORS copy: verdicts + spoken lines
  'curator/roomFeed.js', // THE ROOM transcript producers (verdict line)
  'curator/doctrines.mjs', // the doctrine readout projection
  'curator/taste.js', // the voice options + curator hint names
  'curator/curate.js', // the curator hint line
  'composition/capabilityRegistry.mjs', // consumer notes — rendered in MegaMindPanel's capability table
  'curator/shelfFill.mjs', // fill notes — rendered in ShelfDevPanel's last-fill readout
];
const ALLOWLIST = [
  {
    file: 'curator/directorsMatrix.js',
    exact: "He found his one in my compost pile. You're welcome, George.",
    why: 'Matt-signed authored dialogue (open question in the #2383 staging report)',
  },
];

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const EXCLUDED_FILES = new Set(['data/canon/baselines.js', 'data/canon/styles.js']); // Canon records — see header; display fields pinned in C5

function surfaceFiles() {
  const out = new Set();
  for (const p of walk(SRC.replace(/\/$/, ''))) {
    const rel = p.slice(SRC.length);
    if (rel.endsWith('.selfcheck.mjs') || rel.endsWith('.json') || EXCLUDED_FILES.has(rel)) continue;
    if (rel.endsWith('.jsx')) out.add(rel);
    else if (SURFACE_DIRS.some((d) => rel.startsWith(`${d}/`)) && /\.(js|mjs)$/.test(rel)) out.add(rel);
  }
  for (const f of EXTRA_FILES) out.add(f);
  return [...out].sort();
}

// ── A. the validator bites (synthetic) ───────────────────────────────────────
ok('A1: display forms bite — full names any case, surnames Title/UPPER, George as address', () => {
  assert.deepEqual(bannedIn(`title: 'LOIS · the cut'`), ['LOIS']);
  assert.deepEqual(bannedIn(`'Davis made this route.'`), ['Davis']);
  assert.deepEqual(bannedIn(`'inspired by joshua davis'`), ['Joshua Davis']);
  assert.deepEqual(bannedIn(`"You're welcome, George."`), ['George']);
  assert.deepEqual(bannedIn(`'SWISS GRIT — after Chris Ashworth'`), ['Chris Ashworth', 'Ashworth']);
});
ok('A2: code forms pass — lowercase ids, class names, camelCase identifiers, surnames inside words', () => {
  assert.deepEqual(bannedIn(`import { LoisPill } from './LoisPill.jsx'; const loisVerdict = getLoisVerdict();`), []);
  assert.deepEqual(bannedIn(`<span className="codec-who lois">cover</span>`), []);
  assert.deepEqual(bannedIn(`'DAVIS_ALONE'`), []); // an identifier-shaped token is not a display string
  assert.deepEqual(bannedIn(`data-persona="davis" data-code={face.code}`), []);
});
ok('A3: comments are lineage — a name inside a comment never bites', () => {
  assert.deepEqual(bannedIn(code(`// LOIS judges the round\nconst x = 1; /* after Joshua Davis */`)), []);
  assert.deepEqual(bannedIn(code(`const label = 'COVER'; // Davis stays in the comment only`)), []);
});
ok('A4: the data-field exclusion is narrow — figures/era pass, any other field bites', () => {
  assert.deepEqual(bannedIn(surfaceText('data/canon/styles.js', `figures: ['David Carson'],\nname: 'Ray Gun',`)), []);
  assert.deepEqual(bannedIn(surfaceText('data/palettes.js', `era: 'after Joshua Davis',\nname: 'x',`)), []);
  assert.deepEqual(bannedIn(surfaceText('data/canon/styles.js', `name: 'after Joshua Davis',`)), ['Joshua Davis', 'Davis']);
  assert.deepEqual(bannedIn(surfaceText('panels/X.jsx', `era: 'after Joshua Davis',`)), ['Joshua Davis', 'Davis']);
});

ok('A5: the stripper is string-aware — comment markers inside a string are copy and bite', () => {
  assert.deepEqual(bannedIn(code(`const s = 'verdict // Davis approves';`)), ['Davis']);
  assert.deepEqual(bannedIn(code('const t = `line /* George Lois */ tail`;')), ['George Lois', 'Lois', 'George']);
  assert.deepEqual(bannedIn(code(`const u = 'clean'; // Davis in a real comment still passes`)), []);
  // …and the slashes that are NOT regexes (JSX self-close, closing tag, division) never
  // desync the stripper — a comment after them still strips (the first-run regression).
  assert.deepEqual(bannedIn(code('const el = <Panel opts={opts} />;\nconst t = </Panel>;\nconst r = total / count; // Davis\n{/* George Lois */}')), []);
});

// ── B. the surface scan ──────────────────────────────────────────────────────
ok('B1: no banned name in display form anywhere in the surface sources', () => {
  const offenders = [];
  for (const rel of surfaceFiles()) {
    let text = surfaceText(rel, readFileSync(SRC + rel, 'utf8'));
    for (const a of ALLOWLIST.filter((x) => x.file === rel)) text = text.split(a.exact).join('');
    const hits = bannedIn(text);
    if (hits.length) offenders.push(`${rel}: ${hits.join(', ')}`);
  }
  assert.deepEqual(offenders, [], `banned names on surfaces:\n${offenders.join('\n')}`);
});
ok('B2: the app shell (index.html) carries no banned name', () => {
  assert.deepEqual(bannedIn(code(readFileSync(`${APP}index.html`, 'utf8'))), []);
});
ok('B3: the allowlist is exactly one signed line, still present verbatim in exactly its file', () => {
  assert.equal(ALLOWLIST.length, 1);
  const text = readFileSync(SRC + ALLOWLIST[0].file, 'utf8');
  assert.equal(text.split(ALLOWLIST[0].exact).length - 1, 1, 'the signed line stands verbatim, once');
});

ok('B4: the registry + shelf producers are in scope — a planted name in either file fails the scan', () => {
  const files = surfaceFiles();
  for (const rel of ['composition/capabilityRegistry.mjs', 'curator/shelfFill.mjs']) {
    assert.ok(files.includes(rel), `${rel} is scanned`);
    const planted = `${readFileSync(SRC + rel, 'utf8')}\nconst plantedNote = 'Joshua Davis approves';\n`;
    assert.deepEqual(bannedIn(surfaceText(rel, planted)), ['Joshua Davis', 'Davis'], `${rel}: the plant bites`);
  }
});

// ── C. the projected data reads in callsigns ─────────────────────────────────
ok('C1: doctrine readouts — names are callsigns, titles carry no banned name', () => {
  assert.equal(DOCTRINES.carson.name, 'BLAST');
  assert.equal(DOCTRINES.ashworth.name, 'SWISS GRIT');
  for (const [id, d] of Object.entries(DOCTRINES)) {
    assert.deepEqual(bannedIn(d.name), [], `${id} doctrine name`);
    if (d.title) assert.deepEqual(bannedIn(d.title), [], `${id} doctrine title`);
  }
});
ok('C2: the records’ doctrine slots carry the callsigns (the P5 projection reads the same slots)', () => {
  assert.equal(getPersona('carson').doctrine.name, 'BLAST');
  assert.equal(getPersona('greiman').doctrine.name, 'HYBRID');
  assert.equal(getPersona('ashworth').doctrine.name, 'SWISS GRIT');
});
ok('C3: DIRECTORS verdicts — no banned name; the solo room is OVERLAP ALONE', () => {
  const verdicts = new Set(Object.values(DIRECTORS_MATRIX).flatMap((row) => Object.values(row).map((r) => r.verdict)));
  for (const v of verdicts) assert.deepEqual(bannedIn(v), [], `verdict ${v}`);
  assert.ok(verdicts.has('OVERLAP ALONE'));
  assert.ok(!verdicts.has('DAVIS ALONE'));
});

ok('C4: the recap’s rendered phrases read in callsigns (megamindRecap.mjs, pinned by name — see header)', () => {
  const src = readFileSync(`${SRC}curator/megamindRecap.mjs`, 'utf8');
  const phraseBlock = src.slice(src.indexOf('const STATE_PHRASE'), src.indexOf('};', src.indexOf('const STATE_PHRASE')));
  assert.ok(phraseBlock.length > 0, 'STATE_PHRASE block found');
  assert.deepEqual(bannedIn(phraseBlock), [], 'STATE_PHRASE phrases carry no banned name');
  for (const pin of ['OVERLAP moved the room', "OVERLAP's proposed moves", 'OVERLAP ${byPersona.davis} · COVER ${byPersona.lois}'])
    assert.ok(src.includes(pin), `rendered recap phrase stands: ${pin}`);
});

ok('C5: the Canon records’ display fields (baseline labels, style names) carry no banned name', () => {
  for (const b of CANON_BASELINES) assert.deepEqual(bannedIn(b.label || ''), [], `baseline ${b.id} label`);
  for (const s of Object.values(CANON_STYLES)) {
    if (typeof s === 'object' && s !== null) {
      assert.deepEqual(bannedIn(s.name || ''), [], `style ${s.id} name`);
      assert.deepEqual(bannedIn(s.label || ''), [], `style ${s.id} label`);
    }
  }
});

console.log(`callsignSweep.selfcheck: ${checks} checks passed`);
