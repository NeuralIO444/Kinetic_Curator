# STAGING REPORT — Phase 2 S5: band poses, hysteresis, telemetry hookup

Branch `ember/skeleton-s5` on `d8009ee9` (the S1 publish tip). LOCAL ONLY — no push, no PR.
Contract: `skeleton-creature-plan-2026-10-16.md` S5 + ruling 8 (four poses), issues #1635
(telemetry) and #1636 (hysteresis) as consumer contracts, `docs/design/creatures-spec.md`.

## Recovered-build note (read first)

This slice was built three times. The original builder and the first recovery builder both died
in runtime restarts with their work uncommitted; the surviving tree was audited claim-by-claim
against git by the final builder, every claim re-run rather than trusted, and committed as
`1fde45d8`. The audit found the recovered work sound and unusually complete; nothing in it was
discarded. One gap was found and closed by the coordinator-role completion commit `020d8bf1`:
the recovered code stopped at the builder seam — the pose consumed `input.band`/`input.smoothed`,
but no live code stamped them, so no live frame could ever pose. The completion stamps them
(see Wiring). The stale draft report in the tree was S1's report left over from the base branch;
this document replaces it and describes only the final, verified state.

## What shipped

- **`app/src/engine/creaturePose.js`** (new) — the posture as a pure function of the band
  reader's filtered outputs. Four poses (ruling 8): **open** (Relax), **neutral** (Normal),
  **withered** (Tighten — chains curl via `chainCurlDeg`, segments thin via `wingScale` 0.88,
  and the material dims furthest, `dim` 0.5, per the starve-and-wither ruling: material leads),
  and the Relax **display flourish** (deep-Relax only, a frame-indexed sway: ±7° over a 96-frame
  period, hind pair in counterphase). Blending rides the reader's SMOOTHED stress with a
  smoothstep easing (`POSE_BLEND` 0.06) straddling the reader's own edges — **imported**
  (`RELAX_BELOW`/`TIGHTEN_ABOVE` from `curator/stress.js`), never re-stated; a source-scan
  selfcheck asserts no `0.28`/`0.72` literals and no band computation in the module. The flourish,
  the one discrete move, is gated on the reader's band itself, so hysteresis holding a band holds
  the flourish off. Time is a frame index everywhere; junk/absent band or stress returns `null`
  (no pose), which is what keeps every pre-S5 take byte-identical.
- **`app/src/engine/creature.js`** — the builder counts its own frames (the pose's time), computes
  the frame's one pose from the resolver input, applies it to the skeleton pose (scales multiply
  the traits, direction deltas add, curl rides `chainCurlDeg`), and publishes it per pin via
  `lastPoses()`. With no band on the input the skeleton pose object is exactly the pre-S5 object —
  no `chainCurlDeg` key at all (asserted against S1's recorded world hash `7944cd55`).
- **`app/src/engine/skeleton.js`** — one additive pose field, `chainCurlDeg`: per-segment chain
  curl added progressively along each chain. Absent/0 (every pre-S5 caller) is exactly the frame
  S1 built; S1's goldens stand unmodified.
- **Hysteresis — one place, consumed not duplicated (#1636).** It already lives in the band
  reader and nowhere else: `createStressTracker` in `curator/stress.js` applies
  `HYSTERESIS_GAP` 0.04 straddling both edges (leaving a band requires clearing the edge by half
  the gap). S5 changed nothing there; it proves the consumption: driven through the REAL reader,
  a slow sweep crosses each edge in each direction with exactly one band transition per crossing,
  and a signal parked oscillating ±0.01 at either edge holds its band for 480–600 frames with
  zero band events while the posture on top breathes < 0.5° instead of strobing
  (`creaturePose.selfcheck` §6). The width's reasoning is #1636's own: 0.04 is wide enough to
  swallow the ±0.01 park and the EMA's residue, narrow enough that a genuine crossing registers
  within a few frames of the plain edge.
- **Telemetry (#1635).** Three pieces, all in the existing shapes — no new log, no new event core:
  (1) `curator/stressLive.js` counts the session's **occupancy** (frames presented in each band)
  and **crossings** from the tracker's own band as frames present, riding `getStressState()`;
  the selfcheck asserts occupancy sums to the frame count and counters zero with the state on
  stop. (2) `curator/stressRecord.js` gains `expandStressRecord(record)` — the per-frame
  `{frame, stress, band}` readback of the SAME recorded take (the runs + starting state are the
  storage; this is the reading); the selfcheck asserts the expansion's band sequence and
  occupancy tally match the record's own claims exactly. (3) `curator/StressReadout.jsx` gains
  one session line (R/N/T frames + crossings) on the existing `?debug=stress` readout — mounted
  only under `DEBUG_STRESS` in `App.jsx`, dev-flag terms, UI freeze honoured; nothing
  performer-facing was added anywhere in this slice.
- **Wiring (completion commit `020d8bf1`).** `gl/liveLoop.mjs` stamps `band` + `smoothed` from
  `getStressState()` on every resolver input, next to `wantSkeletons` — the input log records
  inputs exactly, so a take now records its postures and replays them bit for bit; pre-S5 takes
  carry no band and replay as no-pose. `gl/liveResolve.mjs` publishes the frame's poses via
  `getLastPoses()` next to `getLastSkeletons()` — the read S2's skinning and S4's material
  (the pose's `dim` above all) consume. Stale "nothing consumes the band" comments in
  `stressLive.js`/`App.jsx` corrected.

## The clip (done-bar proxy) and what remains for hardware

The plan's done-bar is the 8-second wither-and-recover clip, byte-identical on desktop and iPad.
Sandbox proxy, asserted in `creaturePose.selfcheck` §8: 480 frames (8 s at 60) driven through
the REAL reader (default smoothing + hysteresis) and the REAL builder — signal ramps
Normal → Tighten (0.95 hold) → back. The band crosses into Tighten exactly once and back once;
pose plateaus are neutral/withered/neutral where the script says; the recovered frames 460–479
reproduce frames 100–119 hash-for-hash (the recover is exact, not approximate); the chained
frame-sequence hash is pinned at **`4c71aad3`** and reproduced on the final tree. Because the
sequence is a pure function of the scripted signals, any two machines running it produce this
hash — parity of the DATA is proven here. What remains for real hardware, honestly: rendering
this sequence on the iPad (pixels, GPU frame time under the pose load), the feel of the flourish
and wither at real frame rates, and #1635's own second half — ≥5 real sessions of occupancy
evidence and the keep-or-retune decision on the 0.28/0.72 edges. None of that is claimed here.

## Verification

- Family, re-run on the final tree after all commits: `creaturePose` OK · `skeleton` OK ·
  `creature` exit 0 · `stressLive` OK · `stressRecord` OK · `mathRandomGuard` OK (15 files /
  25 sites, unchanged) · `liveResolve` OK · `liveResolve.determinism` OK · `performanceFile` OK ·
  `performanceCapture` OK · `inputLog` OK · `performanceCreatures` OK.
- Full manifest sweep (449 suites) on the final tree: **439 PASS, 10 exceptions, every one
  proven base-identical on a pristine `d8009ee9` checkout by a solo run** (same assertion text,
  or same non-completion, or a worse number on base):
  - `kernel/bake/swarmWasm` FAIL — its verify needs cargo, absent in this sandbox (S1-proven).
  - `fx/rollSafety` TIMEOUT at the 600 s sweep cap — non-completion on both trees (S1-proven);
    CI is authoritative.
  - `gl/parity` FAIL — identical assertion ("should report GL parity result", line 91) on base.
  - `gl/debug` FAIL — identical Playwright `page.goto` timeout to 127.0.0.1 (line 44) on base;
    the sandbox blocks localhost browser navigation.
  - `gl/composite`, `gl/accum`, `gl/canvasSizes`, `gl/phase6`, `assets/regionBake` TIMEOUT —
    pristine base also fails to complete (exit 124 at a 280 s cap, each).
  - `gl/vortex` FAIL — identical wall-clock timing assertion on both trees; the S5 tree's step
    measured 3.651 ms against base's 9.823 ms.
  - `gl/resolverProbe` — a wall-clock budget suite (four-creature mean ≤ 5 ms): FAILED under
    peak sandbox load in an early family batch on both trees (base 15.611 ms, S5 10.891/9.563 ms)
    and PASSED in the final sweep. CI is authoritative for all timing suites.
  - Process note, stated plainly: the sweep's first run reached suite ~376 before a service
    restart wiped its /tmp results file; the exception proofs above are solo runs whose outputs
    were observed directly, and suites 370–449 were re-run fresh afterward (80/80 PASS, records
    kept) so every manifest suite has a verdict on the final tree.
- `npm run build` — green. ESLint — 0 errors on every touched file (3 warnings in `App.jsx`,
  identical on base; pre-existing).

## Design calls flagged for review

- **Feel constants in `creaturePose.js`** — `POSE_BLEND` 0.06, `FLOURISH_CEILING` 0.16 /
  `FLOURISH_FLOOR` 0.06, flourish sway 7° / 96 frames, withered `dim` 0.5, curl 10°/segment.
  These are the posture's character, named in one place for Matt's eye to move; the selfchecks
  pin the STRUCTURE (endpoints exact, partitions, gates), not the taste.
- **The liveLoop stamp** (completion commit) — the recovered builder deliberately stopped at
  the seam; finishing the hookup was judged the slice's own contract ("telemetry hookup", and a
  pose no live frame can reach is half a slice). It is a separate commit so it can be lifted out
  cleanly if Matt prefers the seam-only landing.
- **Poses publish even when `wantSkeletons` is off** — the pose is cheap arithmetic; the
  skeleton is the cost. `lastPoses()` is therefore always current on a banded frame, and S2/S4
  never need to re-derive it.
- **No GPU cost registered** — S5 is CPU arithmetic only (one pose per frame, shared by all
  moths); nothing draws. The 2.0 ms creature budget still starts binding at S2/S4, as S1's
  report said.
