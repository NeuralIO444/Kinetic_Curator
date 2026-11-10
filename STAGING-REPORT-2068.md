# STAGING REPORT — #2068: Apple Intelligence conducting (kc-mind can say `route`)

**Branch:** `feat/apple-conducting-2068` (worktree `kc-2068-build`, from origin/main @ 32347a75)
**Scope:** ONE file changed — `src-tauri/helpers/kc-mind/main.swift` (+ this report). No JS, no selfcheck,
no other file touched. Not pushed; no PR opened (coordinator's lane).

## What changed in the helper

### Schema (all inside the existing `#if !KC_NO_FM` structure; the `KC_NO_FM` path is untouched)

- **`RouteReply`** — a new `@Generable` mirroring FaceReply/MoodReply: `op` plus the union of the route fields
  (`input`, `target`, `depth`, `from`, `to`, `key`, `value`), every field except `op` optional, each with a
  `@Guide` naming its role and which ops use it.
- **`DavisReply`** — a new `@Generable` for Davis only: the same `state` / `line` FaceReply carries, plus an
  optional `route: RouteReply?`.
- **`routeOpDict(_:)`** — converts a RouteReply into the plain dict the bridge sends, carrying ONLY the op's
  own fields, and returns nil when a required field is absent (a half-said edit is never said — the app drops
  a malformed route together with the whole reply around it, so suppressing it here keeps Davis's face/line
  alive that bar while nothing unvalidated can reach the table).
- **`Minds.ask`** — Davis now generates a `DavisReply`; when the model proposes a route and it converts, the
  reply dict gains a `route` key (absent otherwise). LOIS still generates the same `FaceReply` with the same
  statements as before (the old ternary's lois value, `critique: null`, is now the constant of her branch);
  the queen's MoodReply path is byte-identical.

### Prompt / voice (same file)

- **`davisVoice`** gains the conducting brief: the show block's fields (routes / owned / flatBars / energy);
  ONE route edit per reply, landing on the next phrase boundary; the five ops with their fields; the REAL
  vocabulary — inputs `beat, level, bass, mid, treble, band.sub, band.bass, band.mud, band.mids, band.edge,
  band.pres, band.air`; targets with each one's depth range (from `gl/audioRoutes.mjs` ROUTE_TARGETS clamps,
  via `routeDepthRange`: ±clamp-max); spectrum keys map/scale/displace/colour with map an integer 0..3 and
  amounts 0..1. Targets in the show block's `owned` list are named off-limits (the app drops those proposals
  anyway; he shouldn't waste his one move). Closing line is the issue's opening job, verbatim in substance:
  mid and treble drive nothing by default — wiring them somewhere musical is his first work.
- **`loisVoice`** gains the judging line: while audio is live she reads `flatBars`; a flat show (held still,
  or a wall of noise) is a failed show → answer **BURN**, and Davis re-rolls.

## How the reply shape mirrors the validator, field by field

App side: `mindContract.js` `davis()` → `validateRouteOp(r.route)` (mindConduct.js); `false` voids the reply,
`undefined`/`null` mean "no edit", a clean object is kept with unknown keys dropped.

| op | app validates (`validateRouteOp`) | Swift emits (`routeOpDict`) |
|---|---|---|
| `add` | input ∈ ROUTE_INPUTS, target ∈ ROUTE_TARGETS, depth ∈ routeDepthRange(target) | `{op, input, target, depth}` — all three required, else nil |
| `depth` | same as add | `{op, input, target, depth}` — same |
| `remove` | input, target (depth ignored) | `{op, input, target}` — no depth emitted |
| `retarget` | input, from/to ∈ ROUTE_TARGETS, from ≠ to | `{op, input, from, to}` — from ≠ to enforced Swift-side too |
| `spectrum` | key ∈ SPECTRUM_PARAMS (`map`/`scale`/`displace`/`colour`), value a number: map an integer 0..3, amounts 0..1 | `{op, key, value}` — for `map`, `Int(value.rounded())`, so the app's `Number.isInteger` check sees a true integer |

Deliberate design point: the Swift side checks SHAPE (fields present, from ≠ to) but does NOT duplicate the
input/target vocabulary sets — those live in exactly one place (`gl/audioRoutes.mjs`), the prompt teaches them
to the model, and `validateRouteOp` remains the single fail-closed gate, as with moods and face states, which
this helper has always passed through unchecked. Depths likewise pass through in the target's natural units
and are range-checked app-side.

## Verification (this worktree, real output)

- `node app/src/curator/mindConduct.apple.selfcheck.mjs` — **6 checks passed**, and the last block now runs
  its CONTRACT assertions instead of printing PENDING: the source names `add`, `remove`, `retarget`, `depth`,
  `input`, `target`; the prompt names the band inputs (`band.mids` present literally); LOIS is told a flat
  show is BURN (`BURN` + `flat` in source). The `[pending]` line is gone.
- `node app/src/curator/mindConduct.selfcheck.mjs` — 24 checks passed.
- `node app/src/curator/mind.selfcheck.mjs` — 15 checks passed.
- `node app/src/curator/mindApple.selfcheck.mjs` — 5 checks passed.
- Grep of ALL selfchecks for other readers of the helper source found two more source-shape pins, both run:
  `directorRoom.selfcheck` (pins sharedRules' "verdict" wording — untouched) 7 checks passed;
  `mindPresence.selfcheck` (pins sharedRules' "tier" wording — untouched) 18 checks passed.
- `npm run format:check` in `app/` — pass ("All matched files use Prettier code style!").
- `npm run lint` in `app/` — exit 0, 11 warnings, all pre-existing React-hooks warnings in files this build
  does not touch (the Swift file is outside lint's scope).
- `git status` before commit: only `src-tauri/helpers/kc-mind/main.swift` modified (an `npm install`
  package-lock artifact appeared during setup and was reverted; the tree carries no trace).

## The honest remainder (owed, not claimed)

- **No Swift compiler exists in this sandbox: `main.swift` has NOT been compiled.** The code was written to
  mirror the file's existing @Generable/@Guide/actor patterns precisely, and one risky construct (a mixed
  Int/Double ternary inside a `[String: Any]` literal) was deliberately rewritten into two plain returns to
  keep the unseen compile boring — but "compiles" is asserted by nobody until a Mac says so.
- **The live proof is still owed**, exactly as the issue's done-when states: a session on a Mac with Apple
  Intelligence — build the helper via its build.sh, run the app with audio live, and watch Davis's Apple-path
  route decisions land (recorded as backend `apple`), with the rules conducting identically whenever the
  helper is unavailable. The issue stays OPEN for that Mac session; this build clears everything that can be
  cleared from a headless lane.
