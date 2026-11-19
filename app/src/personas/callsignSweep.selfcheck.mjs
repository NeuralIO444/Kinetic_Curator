// callsignSweep.selfcheck.mjs — #2383 (Persona Kernel P3, spec ruling R6): no real names on any surface.
// Surfaces speak in callsigns only — COVER, OVERLAP, BLAST, HYBRID, SWISS GRIT; the queen and the
// governor are never named. The real names (George Lois, Joshua Davis, David Carson, April Greiman,
// Chris Ashworth, Tina Turner, David Bowie) are LINEAGE: they live in code identifiers, comments, the
// persona records' identity slots and the design docs, and they stay there. This suite guards the line
// between the two: it scans the surface sources (every .jsx, the components/panels/hooks/data trees,
// the app shell, and a named list of copy-bearing modules) with comments stripped, and fails
// on a banned name in display form — a full name in any case, or a bare surname (plus "George", the
// attested form of address) in Title or UPPER case as a whole word. Lowercase ids, class names and
// camelCase identifiers never match: they are code, not copy. ONE lowercase form does bite: a
// surname's possessive ("lois's choice") — an apostrophe-s can never be part of an identifier, a
// class name or a data id, so wherever it survives the comment strip it is copy (check A6, B5).
//
// Round 3 closes the class that escaped twice more: a bare LOWERCASE surname standing as a word
// in rendered copy ("lois grudge · …", "davis · role deal", "… 3 lois · …"). Lowercase is also
// the A2 code register (persona ids, keys, class fragments), so a tree-wide lowercase ban would
// false-positive on data. The scoping: the rule applies to STRING LITERALS ONLY, and only
// inside a named set of copy-producer files (LITERAL_PRODUCER_FILES, check B6) — modules whose
// literals are display copy by construction, each annotated with its render path. Inside a
// literal, a surname counts only when it stands as a prose word: not fused into an id token (a
// neighbouring word char or one of - . / : exempts it — "davis-role-deal", "lois.vision" and
// "narration.davisReason" stay data), and a literal that is id-shaped overall is data outright.
// The rendered producers' actual outputs are pinned too (check C6), so the lines themselves —
// not just their source files — are held to the standard.
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
import { CHAPTERS, chapterLooks } from '../data/chapters.js';
import { GRUDGE_PERMABAN_MIN_CUTS, createGrudgeTally, genreOfLook, grudgeSummary } from '../curator/loisGrudge.mjs';
import { loisSummary } from '../curator/tasteHead.js';
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

// ── the possessive set ───────────────────────────────────────────────────────
// A surname's lowercase possessive ("lois's") is copy, never code: no identifier, class name or
// data id can contain an apostrophe, so the A2 lowercase exemption cannot cover it. Title/UPPER
// possessives ("Davis's") already bite through the bare-surname patterns above; this set closes
// the lowercase form, applied to the same comment-stripped scan text as BANNED.
const POSSESSIVES = SURNAMES.map((s) => {
  const p = `${s.toLowerCase()}'s`;
  return { label: p, re: new RegExp(`\\b${s.toLowerCase()}['’]s\\b`) };
});

/** Banned lowercase-possessive tokens in a text (comments must already be stripped). */
export function possessiveIn(text) {
  return POSSESSIVES.filter(({ re }) => re.test(text)).map(({ label }) => label);
}

// ── the lowercase-word rule (round 3) ────────────────────────────────────────
/** The static text of every string literal in a comment-stripped source, one entry per
 *  literal (a template's static segments are joined with '\n', so a word at a segment edge
 *  still counts as standing). Same state machine shape as code() above: quotes open only in
 *  expression position, template ${ } interpolations nest back into code (a nested literal
 *  inside an interpolation is its own entry), regex contents are not literals and are
 *  skipped. Run it on code()'s output, never on raw source. */
const literalsOf = (text) => {
  const lits = [];
  let i = 0;
  const n = text.length;
  let mode = 'code'; // code | sq | dq | tpl | regex
  let inClass = false;
  const interp = [];
  let braces = 0;
  const stack = []; // open literals: { kind, buf }
  const exprPosition = () => {
    const tail = text.slice(0, i).replace(/\s+$/, '');
    if (!tail) return true;
    if (tail.endsWith('++') || tail.endsWith('--')) return false;
    if (tail.endsWith('=>')) return true;
    const last = tail[tail.length - 1];
    if ('(,=:[!&|?{;+-*%~^'.includes(last)) return true;
    const word = tail.match(/[A-Za-z_$][\w$]*$/);
    return !!word && /^(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)$/.test(word[0]);
  };
  while (i < n) {
    const c = text[i];
    const d = i + 1 < n ? text[i + 1] : '';
    if (mode === 'code') {
      if (c === "'" && exprPosition()) {
        stack.push({ kind: 'sq', buf: '' });
        mode = 'sq';
        i += 1;
        continue;
      }
      if (c === '"' && exprPosition()) {
        stack.push({ kind: 'dq', buf: '' });
        mode = 'dq';
        i += 1;
        continue;
      }
      if (c === '`') {
        stack.push({ kind: 'tpl', buf: '' });
        mode = 'tpl';
        i += 1;
        continue;
      }
      if (c === '/' && text[i - 1] !== '<' && exprPosition()) {
        mode = 'regex';
        inClass = false;
        i += 1;
        continue;
      }
      if (c === '{') braces += 1;
      if (c === '}') {
        if (interp.length && braces === interp[interp.length - 1]) {
          interp.pop();
          mode = 'tpl';
          i += 1;
          continue;
        }
        braces -= 1;
      }
      i += 1;
      continue;
    }
    if (mode === 'sq' || mode === 'dq') {
      const q = mode === 'sq' ? "'" : '"';
      if (c === '\\' && i + 1 < n) {
        stack[stack.length - 1].buf += c + text[i + 1];
        i += 2;
        continue;
      }
      if (c === q) {
        lits.push(stack.pop().buf);
        mode = 'code';
        i += 1;
        continue;
      }
      stack[stack.length - 1].buf += c;
      i += 1;
      continue;
    }
    if (mode === 'tpl') {
      if (c === '\\' && i + 1 < n) {
        stack[stack.length - 1].buf += c + text[i + 1];
        i += 2;
        continue;
      }
      if (c === '`') {
        lits.push(stack.pop().buf);
        mode = 'code';
        i += 1;
        continue;
      }
      if (c === '$' && d === '{') {
        stack[stack.length - 1].buf += '\n';
        interp.push(braces);
        mode = 'code';
        i += 2;
        continue;
      }
      stack[stack.length - 1].buf += c;
      i += 1;
      continue;
    }
    // regex literal: skip until the closing slash outside a [...] class
    if (c === '\\' && i + 1 < n) {
      i += 2;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) mode = 'code';
    i += 1;
  }
  return lits;
};

const ID_SHAPED = /^[\w.\-/:]+$/; // id charset, no spaces: an id, key, class fragment or event name
/** Bare lowercase surnames standing as prose words inside ONE string literal. A literal
 *  that is id-shaped overall is data outright (the A2 hard case: 'lois' as a persona id or
 *  key). Inside a prose literal, a surname fused into a token — a neighbouring word char or
 *  one of - . / : — is still data ("davis-role-deal", "narration.davisReason"); bounded by
 *  whitespace or copy punctuation it is a name on a surface and it bites. */
export function lowercaseWordIn(literal) {
  if (ID_SHAPED.test(literal)) return [];
  return SURNAMES.map((s) => s.toLowerCase()).filter((s) =>
    new RegExp(`(?<![\\w\\-./:])${s}(?![\\w\\-./:])`).test(literal),
  );
}

/** Every banned form inside one literal, all case classes (for the named producer files). */
const literalHits = (literal) => [...bannedIn(literal), ...possessiveIn(literal), ...lowercaseWordIn(literal)];

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
  'curator/loisGrudge.mjs', // grudgeSummary — rendered in DataExportRow's Pipeline readout
  'curator/hornFaces.js', // #2388: the horn tiles' labels and state words — rendered in THE ROOM's strip
  'curator/hornLines.mjs', // #2388: the horns' chat lines (unsigned drafts) — rendered in THE ROOM's transcript once signed
];
// The round-3 lowercase-word rule's scope: files whose string literals are display copy by
// construction, each with the render path that makes it so. Whole-file scanning stays B1's job;
// these files additionally have every string literal held to the copy standard (check B6).
const LITERAL_PRODUCER_FILES = [
  'curator/loisGrudge.mjs', // grudgeSummary() → DataExportRow's Pipeline readout ({grudgeLine})
  'curator/tasteHead.js', // loisSummary() → the store's loisStatus → DataExportRow; its import errors → DataExportRow's message line
  'curator/megamindSurfacesLive.js', // driver error lines → MegaMindPanel's {sv.error} readout
  'state/slices/davisSlice.js', // shelfNotice producers → ShelfView's notice band
  'data/helpCopy.js', // help titles + texts → hover title attributes and the ? overlay
  'curator/hornFaces.js', // #2388: horn tile labels and state words → the strip (HornStrip.jsx)
  'curator/hornLines.mjs', // #2388: horn chat lines → the transcript (roomFeed bandLinesFrom)
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
ok('A6: lowercase possessives bite — they cannot be code; callsign possessives and code forms pass', () => {
  assert.deepEqual(possessiveIn(`"lois's choice: dealt unjudged keeps"`), ["lois's"]);
  assert.deepEqual(possessiveIn(`'davis's novelty order'`), ["davis's"]);
  assert.deepEqual(possessiveIn('`after ashworth’s hybrid`'), ["ashworth's"]); // curly apostrophe too
  // callsign possessives are the CORRECT surface form — they never bite:
  assert.deepEqual(possessiveIn(`"COVER's choice" · 'OVERLAP's proposed moves'`), []);
  // the A2 code forms carry no possessive, so the exemption stands untouched:
  assert.deepEqual(possessiveIn(`import { LoisPill } from './LoisPill.jsx'; const loisVerdict = getLoisVerdict();`), []);
  assert.deepEqual(possessiveIn(`data-persona="davis" data-code={face.code}`), []);
  // a possessive inside a comment is lineage — stripped before the scan, it passes:
  assert.deepEqual(possessiveIn(code(`const x = 1; // lois's gait, in a comment only`)), []);
});
ok('A7: the lowercase-word rule bites prose words in literals — id-shaped and fused forms stay data', () => {
  // the three shapes that escaped in the wild:
  assert.deepEqual(lowercaseWordIn('lois grudge · none — he has cut nothing yet'), ['lois']);
  assert.deepEqual(lowercaseWordIn('davis · role deal'), ['davis']);
  assert.deepEqual(lowercaseWordIn('the trio dealt a new stage — 2 consensus · 3 lois · 1 contrarian'), ['lois']);
  assert.deepEqual(lowercaseWordIn('no davis citation stands'), ['davis']);
  // the A2 hard cases — persona ids and fused tokens are data, never copy:
  assert.deepEqual(lowercaseWordIn('lois'), []);
  assert.deepEqual(lowercaseWordIn('davis'), []);
  assert.deepEqual(lowercaseWordIn('davis-role-deal'), []);
  assert.deepEqual(lowercaseWordIn('lois.vision'), []);
  assert.deepEqual(lowercaseWordIn('narration.davisReason'), []);
  assert.deepEqual(lowercaseWordIn('davis-label lbl'), []); // a class list: fused, not a name
  // callsign copy is the correct form and never bites:
  assert.deepEqual(lowercaseWordIn('COVER grudge · none — he has cut nothing yet'), []);
  assert.deepEqual(lowercaseWordIn('overlap · role deal'), []);
  // the extractor sees literals, not code: identifiers and comments contribute nothing.
  const src = `const lois = getPersona('lois');\nconst line = 'lois grudge · planted'; // davis in a comment\nconst key = \`davis:\${slot}:x\`;`;
  const lits = literalsOf(code(src));
  assert.ok(lits.includes('lois grudge · planted'), 'the prose literal is extracted');
  assert.deepEqual(lits.flatMap((l) => lowercaseWordIn(l)), ['lois'], 'only the prose literal bites');
});

// ── B. the surface scan ──────────────────────────────────────────────────────
ok('B1: no banned name in display form anywhere in the surface sources', () => {
  const offenders = [];
  for (const rel of surfaceFiles()) {
    let text = surfaceText(rel, readFileSync(SRC + rel, 'utf8'));
    for (const a of ALLOWLIST.filter((x) => x.file === rel)) text = text.split(a.exact).join('');
    const hits = [...bannedIn(text), ...possessiveIn(text)];
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

ok('B5: a planted lowercase possessive in a named copy-bearing file fails — and the real files are clean', () => {
  const plants = [
    ['curator/shelfFill.mjs', `\nconst plantedNote = "lois's choice: planted";\n`, ["lois's"]],
    ['composition/capabilityRegistry.mjs', `\nconst plantedNote = "davis's pick: planted";\n`, ["davis's"]],
  ];
  for (const [rel, plant, want] of plants) {
    const raw = readFileSync(SRC + rel, 'utf8');
    assert.deepEqual(possessiveIn(surfaceText(rel, raw)), [], `${rel}: the unmodified file is possessive-clean`);
    assert.deepEqual(possessiveIn(surfaceText(rel, raw + plant)), want, `${rel}: the plant bites`);
  }
});

ok('B6: the named copy-producer files — every string literal is held to the copy standard, all case classes', () => {
  const offenders = [];
  for (const rel of LITERAL_PRODUCER_FILES) {
    for (const lit of literalsOf(code(readFileSync(SRC + rel, 'utf8')))) {
      const hits = literalHits(lit);
      if (hits.length) offenders.push(`${rel}: ${hits.join(', ')} in ${JSON.stringify(lit.slice(0, 60))}`);
    }
  }
  assert.deepEqual(offenders, [], `banned names in producer literals:\n${offenders.join('\n')}`);
});
ok('B7: loisGrudge is in the surface scan — and planted lowercase copy in a producer file fails', () => {
  assert.ok(surfaceFiles().includes('curator/loisGrudge.mjs'), 'loisGrudge.mjs is scanned');
  const plants = [
    ['curator/loisGrudge.mjs', `\nconst plantedLine = 'lois grudge · planted';\n`, ['lois']],
    ['state/slices/davisSlice.js', `\nconst plantedLine = 'the trio dealt · 3 lois · planted';\n`, ['lois']],
    ['data/helpCopy.js', `\nconst plantedTitle = 'davis · planted role';\n`, ['davis']],
  ];
  for (const [rel, plant, want] of plants) {
    const raw = readFileSync(SRC + rel, 'utf8');
    assert.deepEqual(
      literalsOf(code(raw)).flatMap((l) => lowercaseWordIn(l)),
      [],
      `${rel}: the unmodified file is lowercase-word clean`,
    );
    assert.deepEqual(
      literalsOf(code(raw + plant)).flatMap((l) => lowercaseWordIn(l)),
      want,
      `${rel}: the plant bites`,
    );
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

ok('C6: the rendered producers’ actual outputs read in callsigns (grudgeSummary, loisSummary — every branch)', () => {
  const clean = (line) => {
    assert.deepEqual(bannedIn(line), [], `banned form in: ${line}`);
    assert.deepEqual(possessiveIn(line), [], `possessive in: ${line}`);
    assert.deepEqual(lowercaseWordIn(line), [], `lowercase name in: ${line}`);
  };
  // grudgeSummary's three branches, built from the real book like loisGrudge's own suite:
  let genred = null;
  for (const c of CHAPTERS) {
    for (const look of chapterLooks(c.id)) {
      if (genreOfLook(c.id, look.id) && !genred) genred = { chapterId: c.id, lookId: look.id };
    }
  }
  assert.ok(genred, 'a genred look exists in the real book');
  const tally = createGrudgeTally({ now: () => 5_000_000 });
  const none = grudgeSummary(tally.snapshot());
  tally.noteCut(genred);
  const tallied = grudgeSummary(tally.snapshot());
  for (let k = 1; k < GRUDGE_PERMABAN_MIN_CUTS; k++) tally.noteCut(genred);
  const banned = grudgeSummary(tally.snapshot());
  for (const line of [none, tallied, banned]) {
    assert.ok(line.startsWith('COVER grudge · '), `grudge line reads COVER: ${line}`);
    clean(line);
  }
  // loisSummary's branches (the Pipeline status line in the same readout):
  const untrained = loisSummary(null);
  const trained = loisSummary({ lois: { labels: { favorites: 12, keeps: 28 }, head: { fidelity: 0.62 } } });
  for (const line of [untrained, trained]) {
    assert.ok(line.startsWith('COVER · '), `taste line reads COVER: ${line}`);
    clean(line);
  }
});

console.log(`callsignSweep.selfcheck: ${checks} checks passed`);
