# STAGING REPORT — #2159: the brake (plain is a cue to push)

Slice 2 of the persona-interface program (issue 2461): reach fix 2 of 2. Review lane (feel) — Matt merges.
Branch `feat/2159-the-brake` on origin/main a01942e7 (slice 1, #2158, is in that base; untouched here).

## What changed, in plain terms

When the artist has been passing a lot, LOIS's brake used to narrow Davis to only his safest moves
(bold at most 0.4) for as long as the brake stood. The #2075 diagnosis showed what that makes: LOIS calls
the show plain, Davis answers with the softest move he has, the show stays plain, and phrases go by with
nothing landing at all.

Under Matt's ruling (fix ruling 2 of 3, 2026-11-12 — "plain is a cue to push"), a flat call now gets a
bolder answer: while the brake stands, ONE bolder move stays in Davis's reach as his reply — the first
bolder candidate in his own conducting order (energy level, then the boldness band nearest the heat, then
the seed's rotation). It is not a raised ceiling: the brake still takes every other bolder move out of
reach, and if that one reply belongs to the artist (owned), no second bolder move takes its place. Every
other bound is exactly as it was — route caps, one edit per phrase, the engagement tier, artist ownership.
Conducting with no brake standing is unchanged, line for line.

## The mechanism

One file of mechanism: `app/src/curator/mindConduct.js`, inside `davisRoute`.

- Before: candidates were filtered by the brake in pool order, then sorted into his order.
- Now: his order is settled first (the same sort, unchanged), then the brake reads it — safe candidates
  stay, the first bolder candidate stays as the one reply, the rest are discarded with the `brake` skip
  trace (#2160), exactly as before.
- The exemption never depends on the trace, so the standing #2160 law still holds: the trace never changes
  what he returns (pinned over a >5,000-case grid in the suite).
- No state added, no tuning values changed (BRAKE_AT / BRAKE_MAX untouched), no new persona copy —
  nothing ships lit, nothing for the A7 queue. `davisSpectrum` is untouched: it carries no bold rating
  and the ruling is about his route conducting.

Measured on the diagnosis shape (MID energy, brake standing, his row on the table, every safe retarget
blocked — the call that returned silence under the old law): he now retargets his row to
`clock.kinemeRate` (bold 0.8, over the 0.4 cap). With every safe target owned, he answers with a bolder
add instead of holding. Across a braked grid (3 energies × 24 seeds, heat 1), 48 of 72 replies are the
bolder move; the rest are safe moves his order put first.

## Re-pins (each quotes its law; no assertion weakened)

1. `mindConduct.selfcheck.mjs`, the #1483 block — the old pin ("braked ⇒ only safe moves; nothing safe
   left ⇒ he holds") stated the law #2159 replaced. Re-pinned to the ruling: a braked call's trace names
   exactly (bolder pool − 1) `brake` skips at every energy/seed; braked replies do go bolder (the ruling
   fires, not just permits); braked with nothing safe left now answers boldly instead of holding; braked
   with everything owned still holds (the reply stays bounded by sovereignty).
2. `mindConduct.selfcheck.mjs`, new #2159 block — the #2075 stall shape gets a bolder retarget; exactly
   one bolder candidate is in reach (own the exempted one and no second takes its place); no brake ⇒ no
   brake skips.
3. `personaTuning.selfcheck.mjs`, D2 — the live-edit case was built on the old law's pick (under the
   shipped brake the pick was a safe move that lifting brake.max displaced). Re-based on a case where the
   brake still narrows under the new law: the one bolder reply (render.squash) is the artist's, so the
   shipped pick is the safe render.glow; raising `brake.max` to 1 on the same show/seed/heat moves the
   pick to the clock move, and reset restores it. The test's purpose — the mechanics read the tuning table
   live, no reload — and its assertion strength are unchanged.

## Verification

- `npm run lint`: 0 errors (11 pre-existing warnings, none in the touched files).
- `npm run format:check`: clean.
- `npm run build`: green.
- Targeted suites, all green: mindConduct 31 checks (30 before, +1 new #2159 block), personaTuning 11,
  mind 16, trioLive 37, trioAcceptance ok, trioLoadReset 7, personaKernel 10, personaAdapters 19,
  mindFace 7, mindPresence 18, callsignSweep 20, chemistry 7, queenView 8, wireFeed 24, wireLive 30.
  (All deterministic — fixed seeds, and the module is pinned pure: no clock, no randomness — so repeated
  runs are identical; no dice discipline applies.)
- Full manifest sweep (log: `sweep-2159.log` in this worktree): **812 PASS / 3 FAIL over 815 real
  suites.** The 3 failures are the standing sandbox-environmental set — swarmWasm (exit 1), rollSafety
  (exit 1), accum (abort, exit 134) — A/B-confirmed identical on pristine origin/main (kc-2158-build,
  no #2159 changes): exits 1 / 1 / 134 there too.
- One-writer files untouched: `liveLoop.mjs`, `liveResolve.mjs`, `particles.js` are not in the diff.
  Diff is 3 files: `mindConduct.js`, `mindConduct.selfcheck.mjs`, `personaTuning.selfcheck.mjs`
  (plus this report). `npm install`'s one-line package-lock churn was reverted, not committed.

## Deliberately not done

- No later #2461 slices (no registries, no manifest, no MCP work).
- No change to when the brake engages (flatBias / BRAKE_AT) or to LOIS's side of the read — the ruling
  changes Davis's reply, not her call.
- No episode bookkeeping ("one per brake episode"): the ruling grants one bolder move **in reply**, and
  a reply is one conducting decision, which already lands at most one move. The per-decision exemption is
  the smallest shape that satisfies every acceptance line.
