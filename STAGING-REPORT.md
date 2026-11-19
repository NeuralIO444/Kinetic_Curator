# STAGING REPORT — #2381 Persona Kernel P1: `kc-persona/1` records + registry

Branch `kc-2381-persona-kernel`, based on origin/main `2f706d51`. One PR, not merged by the builder.

## What was built

- **`app/src/personas/` — 19 pure record modules**, one per persona, each exporting a single `record`
  in the `kc-persona/1` shape (spec §2): `lois`, `davis`, `queen`, `governor` (the cast), `carson`,
  `greiman`, `ashworth` (doctrines), `te` (kind `voice`, the third Mind persona), `taste` (kind `judge`,
  owns hierarchy), and the ten voice personas whose tastes `personaTastes.js` used to carry inline
  (`davis` + `molnar`, `mohr`, `benjamin`, `reas`, `haeckel`, `oxman`, `stock`, `anadol`, `menkman`).
  Slots filled only where the tree already states the fact: identity (real name, ISO dates, provenance,
  surface callsign — `null` for the QUEEN and the GOVERNOR, who are never named), lens, taste (the
  19-feature weights + rationale + Canon style id where one exists in the Canon: HAECKEL → `engraved`;
  personas without a Canon style carry `null` — no mapping was invented), principle, lexicon (a pointer
  to signed copy — no new lines), states, power, head, relations, and a `doctrine` slot for the three
  doctrines.
- **`app/src/personas/registry.mjs`** — gathers the records, deep-freezes them, and validates every
  record against the schema (`validatePersonaRecord` / `validatePersonaRegistry`, exported). Validation
  problems are data (`PERSONA_PROBLEMS`), not a throw at import: the selfcheck pins the list empty, so
  drift fails the suite and CI rather than breaking the live instrument.
- **`curator/personaTastes.js` and `curator/doctrines.mjs` are now readers of the registry.** Their
  exports keep the same names, shapes, values and freezing as before (see the deep-equal proof below).
  GREIMAN's record carries her doctrine slot from day one, but `doctrines.mjs` deliberately projects
  only CARSON and ASHWORTH — she joins `DOCTRINES` in P5, so `DOCTRINE_IDS`, `isDoctrine('greiman')`
  and `doctrineOfMode('greiman')` are exactly what they were.
- **`app/src/personas/personaKernel.selfcheck.mjs`** (new suite, added to `app/selfcheck.manifest`):
  schema/drift validation incl. a "validator bites" test, the cast and kinds, the callsign law, the
  tastes/doctrines reader projections, weight keys ⊆ the 19 features, Canon style ids resolve, and
  **`docs/characters/*.md` names/dates match the records** (dates parsed out of the four character
  files and compared against the records' ISO dates). 10 checks, all passing.

## Deep-equal proof (acceptance)

Method: a scratch harness in /tmp (not in the tree) imports `curator/personaTastes.js` and
`curator/doctrines.mjs` from a tree root and dumps canonical JSON of `TASTE_FEATURES`, `PERSONA_TASTES`,
`personaTasteIds()`, `getPersonaTaste()` for every id (+ a missing id), `DOCTRINES`, `DOCTRINE_IDS`,
`isDoctrine` over a probe set, `doctrineMode` over representative draws (incl. standing-mode and
unknown-doctrine cases), `doctrineOfMode` over all modes, and the frozen-ness of `DOCTRINES`, its
entries, its mode arrays and `DOCTRINE_IDS`.

- Before: dumped from the pristine worktree at origin/main `2f706d51` before any edit.
- After: dumped from the finished branch (and re-dumped after prettier formatting).
- Result: **`diff` of before/after dumps is empty — byte-identical**, both times.

## Verification (publish ritual, all in the worktree's `app/`)

- `npm install`: done (the one-line `package-lock.json` churn it produced was reverted — not this change).
- Full selfcheck sweep (continue-on-error over the whole manifest, Playwright chromium installed first):
  **752 pass / 3 fail**. The same sweep on the pre-change base was 751 pass / 3 fail (the +1 is the new
  personaKernel suite). The 3 failures are the known sandbox-environmental signatures, each **re-run and
  confirmed failing identically on a clean detached checkout of origin/main `2f706d51`**:
  `swarmWasm` (no Rust toolchain/cargo in the sandbox, exit 1), `rollSafety` (headless Playwright crash,
  exit 1), `accum` (V8 heap OOM abort, exit 134, identical stack frames). None is from this change.
- `npm run lint`: **0 errors** (11 warnings, all pre-existing, none in touched files).
- `npm run format:check`: **pass** (the new files were prettier-formatted; deep-equal re-proven after).
- `npm run build`: **pass** (only the pre-existing ineffective-dynamic-import warnings).
- Manifest validation via `scripts/runSelfcheck.mjs`'s own `manifestProblems`: **no problems**; the new
  suite is listed exactly once.

## Not done (by design)

- No behaviour change anywhere: no surface strings re-pointed (the callsign sweep is P3), no tuning
  table (P2), GREIMAN not wired into `DOCTRINES` (P5), no Archive (P4).
- No character files were edited; TE and TASTE got records only, per spec §5 (no new character files,
  no copy).

## Open questions / notes for the coordinator

- **GREIMAN's full name and dates appear nowhere in the repo.** Her record names her `Greiman` with a
  provenance saying exactly that; the Archive phase (spec §4b: backstories are sourced fact, never
  invented) is the place to source them. Dates for CARSON and ASHWORTH are likewise unstated in the
  repo and are `null` in their records. Not a blocker for P1 — the schema requires `identity`, and
  `born`/`died` are nullable by design — but flagging it rather than filling it in from memory.
- The voice personas' records carry `born`/`died` as `null` for the same reason: neither
  `personaTastes.js` nor the persona source files state dates.
