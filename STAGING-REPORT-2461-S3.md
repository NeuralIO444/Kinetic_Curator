# STAGING REPORT — #2461 slice 3: the persona surface registry + head-consumption registry

Branch `feat/2461-s3-registries` on origin/main 1e197415 (slices 1–2, the reach fixes for the source
issues 2158 and 2159, already merged). The program issue (2461) stays open — slices 4 and 5 remain.

## What was built

One new module, `app/src/personas/surfaceRegistry.mjs`, holding both registries the ruled spec
(Q1–Q7, 2026-11-23) calls for in slice 3, plus its drift selfcheck
`app/src/personas/surfaceRegistry.selfcheck.mjs` (12 checks, added to `app/selfcheck.manifest`).

**Surface registry** (`kc-persona-surface/1`) — 3 entries, Tier 1 only (Q2): `davis`, `lois`,
`queen`. Each entry carries, as machine-readable data extending its `kc-persona/1` record (kind and
callsign are read from that record, not restated):

- **reads** — what the persona may read, each with a source pointer (module + export) to the code
  that does the reading today: the room context and show block (all three); Davis's spectrum
  marks; LOIS's render features, vision readings and grudges; the Queen's queen-head channel,
  timing features and keep counts.
- **verbs** — what the persona may do, each sourced the same way: Davis propose-asset and
  route-edit; LOIS critique, the brake on Davis, judge-deal (keep/pass/cut) and the
  poem-revision *request*; the Queen's mood reply and her hidden sway.
- **channels** — the existing bus events (`mind:req`, `mind:reply`, `mind:decision`, and
  `mind:request` for the two directors only — `mindContract.wantsStage` is always false for the
  Queen, and the registry records her as absent from that channel) plus the model channel
  (Ollama `/api/chat` via `askPersonaReply`).
- **limits** — the bounds the existing code already enforces. Where an enforcing constant is
  exported, the registry **imports** it (reply line/decay caps, route ops and tier ops, energy
  levels, route caps, brake at/max, both judge ids, moods), so the stated limit *is* the code's
  value. Three limits are stated as data and pinned by the selfcheck against their source (below).

**Head-consumption registry** (`kc-head-consumption/1`, Q6 — registry only, no new heads) —
6 entries stating who consumes which **existing** head today:

| persona | head | kind | consumed via |
|---|---|---|---|
| davis | persona-head | solo | `personas/band.mjs` `stepBand`, via `tasteHead.steeringHeads` |
| davis | persona-head | trade | same |
| lois | persona-head | trade | same (no solo; her cut is a trade answer, not a cut head) |
| queen | queen-timing | timing | `curator/director.js` `bandTimingStep`, via `queenTimingInclination` |
| queen | queen-head | inclination | `curator/queenChannel.js` `readQueenHead` / `isLive` — hidden bias only |
| queen | shared-taste | ranking | `state/slices/davisSlice.js` `fillStage`, via `scoreLayout` — the Queen's ranking door in the shelf fill (the code's own comment; scores order, never gate or deal) |

The earn-in law the persona heads steer under (≥200 labeled turns, held-out ≥ 0.3) is stated in
`HEAD_EARN_IN`, again imported from `tasteHead.js` / `decisionFeatures.mjs`.

**Tiers (Q3):** `SURFACE_TIERS` records tiers 1–3 as a shape, with only Tier 1 `served`. No
Tier 2 or Tier 3 entries ship.

## How each entry was verified against the real code

- The selfcheck resolves **every** reads/verbs source pointer and every head consumer's `via`
  pointer to a real export in a real module (regex over the module's export declarations), and
  every bus channel name to a real event string in `eventBus.js`. A renamed or removed export
  fails the suite — the registry cannot drift silently.
- Imported limits are asserted equal to the enforcing modules' own exports, entry by entry.
- The three data-stated limits are pinned against their sources: LOIS's critique delta cap (0.25)
  and the Queen's lean keys (`wetness`, `evolve`) against `mindContract.js` source text (both are
  literals inside its validators, with no exported constant); the Queen's `minKeeps` (8) against
  `queenLean.mjs`'s `MIN_KEEPS` export.
- Persona-head entries are checked against the standing structure law itself:
  `PERSONA_HEAD_STRUCTURE[kind]` must contain the persona, and `PERSONA_HEAD_IDS` must contain it —
  no impossible head can be registered. The Queen is asserted to hold **no** personas-section head
  (the taste validator excludes her); hers are the timing head (A6) and the third head.
- Deliberately **not** registered, with reasons recorded in the module: the voice heads (held by
  the horns — no Tier 1 persona holds one), the governor cost head (a Tier 2 persona — no entry in
  v1), and `scoreBoldness` (a shared-head scorer with no live caller and no persona attribution in
  code, so registering it would invent a consumption that does not exist).
- One survey gloss was corrected by the code: the shared-head scoring inside `davisSlice.js` is
  the **Queen's ranking door** (its own comment), not Davis consumption — registered as such.

## The no-behaviour-change argument

- The registry module is imported by **nothing** in `src` — the selfcheck's E1 pin walks the tree
  and fails on any import edge to it (allowlists in two deniability suites *name* the file; text is
  not an import, and E1 checks the import graph specifically).
- No existing module's code changed. The only edits to existing files are: one added line in
  `app/selfcheck.manifest`, and the two deniability re-pins below.
- Nothing ships lit that was dark; no persona copy was added (entries carry ids and source
  pointers only).

## Re-pins (2, both deniability allowlists — law quoted, assertion strength unchanged)

The Queen's deniability suites scan the whole tree for her hidden modules' names. A registry that
honestly names her channel as a source pointer trips them, so both suites gained a **deliberate**
exception for exactly the two new registry files, with the law stated in a comment at the site:

1. `queenChannel.selfcheck.mjs` — the registry files join the allowlist. The law (module header):
   nothing about the channel may reach a UI string, log line, panel, HUD or saved file. The
   registry is none of those: it imports nothing from the channel, is imported by nothing live,
   is never rendered and never saved. The assertion (`deepEqual` hits `[]` for every other file)
   is unchanged. Precedent shape: the same list already carries deliberate additions for the sway
   module and the import-graph guard.
2. `queenLean.selfcheck.mjs` — the same two files are excepted from its identifier scan, same
   comment, same reasoning. Its scan and assertion are otherwise untouched.

`queenDeniability.selfcheck.mjs` needed **no** re-pin and passes unmodified: the registry imports
neither hidden module (the one limit that lives in a hidden module, `minKeeps`, is stated as data
and pinned against the export by the registry's own selfcheck instead), and `personas/` is not a
surface directory under its rules.

One self-pin was also corrected during the build: the registry selfcheck's E1 first matched the
*string* `surfaceRegistry`, which the two re-pinned allowlists legitimately contain; E1 now tests
the import graph (the actual claim) — a stricter, truer pin, not a weaker one.

## Verification

- `npm run lint` — 0 errors (11 warnings, all pre-existing, none in touched files).
- `npm run format:check` — clean.
- `npm run build` — green.
- Targeted suites: surfaceRegistry **12** · personaKernel 10 · personaAdapters 19 ·
  personaTuning 11 · band 35 · callsignSweep 20 · mind 16 · mindConduct 31 · queenChannel 13 ·
  queenLean 30 · queenDeniability 15 · queenTiming 6 — all green.
- Full manifest sweep (continue-on-error, log `sweep-2461-s3.log` in the worktree root):
  **815 PASS / 3 FAIL over 818 real suites**. The 3 failures are the standing sandbox-environmental
  set — swarmWasm (exit 1), rollSafety (exit 1), accum (exit 134) — **A/B-confirmed identical on
  pristine origin/main** (a `git archive` extract of origin/main run the same day produced exits
  1 / 1 / 134 for the same three suites).
- No re-pin outside the two deniability allowlists above; no dice-driven suite is affected (all
  targeted suites are deterministic).

## Not in this slice

The generated manifest and its drift selfcheck (slice 4) and the standalone MCP server (slice 5)
were not built. No manifest artifact exists in this PR.
