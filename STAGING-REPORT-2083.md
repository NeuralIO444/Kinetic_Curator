# STAGING REPORT — #2083 panelGraph stripper regex-literal fix

Issue: #2083 — "panelGraph pin: comment stripper desyncs on regex literals
(/\/*/) — a hidden import can slip the fail-closed walk"
Branch: `panelgraph-stripper-fix`, stacked on `4ea1e134` (#2078) over
`9e095f26` (#2077) over main `2a1c7ba7`. Committed locally only; not pushed,
no PR (coordinator publishes after the stack ahead merges).
Selfcheck-only change: zero behavior change to the shipped app. One file
changed: `app/src/composition/panelGraph.selfcheck.mjs` (+148/−5).

## 1. What shipped

The panel-graph pin's comment stripper (`stripComments`) had no
regex-literal state: a comment-like sequence inside a regex literal
flipped it into comment state and blanked real code up to the next `*/`,
hiding a real `import('./censusReport.mjs')` from the fail-closed walk.

The stripper now has a real regex state, driven by the
previous-significant-token heuristic **ported from
`purity.selfcheck.mjs`** (`REGEX_OK_BEFORE` / `REGEX_OK_KEYWORDS` copied
verbatim — a `/` opens a regex unless the previous significant token
could end an expression). PanelGraph's stripper keeps its own contract
(string literals kept verbatim, because specifiers live in them); regex
literals are likewise copied verbatim once recognised. One strengthening
over the purity precedent: a postfix `++`/`--` is tracked as
operand-ending, so `a++ / b` can never be misread as a regex opening.
Inside the regex state, escapes are honoured and a `/` inside a `[...]`
character class does not close the literal; an unterminated regex bails
at the newline instead of swallowing the file (same bail as purity's
`skipRegex`).

Why this option over the minimum desync-detection: the heuristic's
residual misreads fail in the safe direction for this pin. A division
misread as a regex copies its region verbatim (nothing is blanked in the
regex state — the worst case is a real comment inside such a region
staying visible, a loud false positive). A regex misread as division
requires a regex where JS grammar says only division can follow an
operand, which cannot occur in valid code. The dangerous direction —
real code blanked — is closed.

The stripper's header prose now states exactly what the code does: it no
longer claims "regex-aware enough"; it says string- and regex-aware,
names the heuristic and its source, and records the #2083 hole it closes.

Assertion D (extractor self-tests) gained samples pinning the fix, in
the existing style:

1. **The exact T7 sample** from the issue — trap regex `/\/*/` + hidden
   `import('./censusReport.mjs')` + `/* trailer */`: the specifier is
   now SEEN (`specs: ['./censusReport.mjs']`).
2. `//` inside a regex — `const slashes = /[/]{2}/;` (slashes in a
   character class) with a same-line import after it: import seen.
3. Division chains — `a / b / c` opens no literal state; next line's
   import seen.
4. Division after `)` plus a REAL block comment containing a ghost
   import: the comment still strips, the real import after it is seen.
5. Regexes after `return` (`/a\/b/`), after `(` (`/^\//`), after `,`
   (`/x*/`): each recognised as a literal; the following import seen.
6. A plain block comment with a ghost import still strips exactly as
   before.

The pre-existing D negatives (substituted template literal and
non-literal `import()`/`require()` arguments → fail-closed count 1)
are unchanged and still pass.

## 2. Purity audit — purity does NOT share the hole (evidence, no change)

`app/src/engine/kernel/purity.selfcheck.mjs`'s blanker is already
regex-literal aware: `regexStart()` / `skipRegex()` (its lines 100–168)
implement the same previous-significant-token heuristic, and its
`stripComments` calls `regexStart` before treating a `/` as a comment
opener. panelGraph's stripper was a divergent older copy that had lost
that state.

Empirical proof, not just a read: a scratch copy of the kernel directory
with the same trap shape appended to a kernel file (a hidden
`import("../gl/hidden.mjs")` behind `/\/*/` in `bake/swarmWasm.mjs`)
makes purity FAIL, naming the offender —

```
AssertionError: kernel purity violated …:
  bake/swarmWasm.mjs imports '../gl/hidden.mjs' (forbidden: app/src/gl/)
```

— where the same trap against the OLD panelGraph suite passed silently
(§3). Per the acceptance line, since purity does not share the stripper
shape, no fix or samples land there; `purity.selfcheck.mjs` is untouched
and its suite passes (§4).

## 3. The hole, reproduced and closed

- **Before (old suite, scratch worktree at `4ea1e134`)**: with the issue's
  trap lines appended to `src/curator/megamindSurfacesLive.js`, the old
  pin PASSED — `panel graph OK — 640 modules`, exit 0 — while a real
  censusReport import sat hidden in a walked file. Hole reproduced
  exactly as QA described.
- **After (this branch, same trapped file)**: the pin FAILS, exit 1 —
  `src/curator/censusReport.mjs imports forbidden Node-only package
  '@resvg/resvg-js' — chain: src/panels/MegaMindPanel.jsx ->
  src/curator/megamindSurfacesLive.js -> src/curator/censusReport.mjs`.
  The walk now sees the import, follows it, and fails closed with the
  chain named. (Trap reverted with `git checkout` after each run.)
- **Clean tree**: the pin passes at the unchanged module count — see §4.

Old-vs-new stripper output compared over all 1,475 `.js`/`.mjs`/`.jsx`
files under `app/src`: 72 files' stripped output differs. The
differences inspected (representative walked production files, plus the
selfcheck files that dominate the list) fall into two classes, both
cases where the OLD stripper was already desynced by a regex literal on
today's tree and the new one is correct:

- `src/curator/megamindVisionLive.js:96` — `/^image\//` contains `//`
  (escaped slash + closing slash); the old stripper blanked the rest of
  that line. Benign only because the blanked tail held no specifier.
- `src/curator/variants.mjs` (also fxFilters.js, ingest.js, …) — regexes
  containing raw quotes (`/\bd\s*=\s*"([^"]*)"/`) flipped the old
  stripper into a string state, after which it stopped stripping real
  comments (a `/**` block at variants.mjs:399 was copied, not blanked).

None of the differences changes the walk's verdict on this tree: 640
modules, nothing unresolved, nothing unextractable, no forbidden module
reachable — identical outcome, now reached without desyncs.

## 4. Verification (own runs, on this tree)

- `panelGraph.selfcheck.mjs` — **pass, 640 modules** walked from 3 panel
  roots; extractor self-tests passed (now including the §1 samples). The
  expected count is untouched — the suite source contains no count edit;
  640 is its printed walk size, same as before the change.
- `purity.selfcheck.mjs` (unchanged) — pass.
- MegaMind family: megamindLink 21/21, megamindVoice 17/17,
  megamindVision 16/16, megamindEmbed 163/163, megamindRecap 12/12.
- devPanel — pass (runtime-gate wording intact).
- Lint: **0 errors** (11 warnings, pre-existing, same count as the
  #2077/#2088 trees). `format:check`: clean.
- Full manifest sweep not run locally for this selfcheck-only change;
  CI's sweep on the eventual PR is the full check.

## 5. Scope notes

- No non-selfcheck source file was touched; `purity.selfcheck.mjs`
  untouched per §2.
- Known residual, unchanged from before and out of this issue's scope:
  template-literal interpolations are still treated as opaque literal
  text by the stripper (a regex containing a backtick inside a `${…}`
  could desync the template state) — the header prose claims nothing
  about interpolations, and no walked file exercises the shape.
