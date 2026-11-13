# Kineme phrases — motion sequenced on the bar (Motion Core P6, #2118, step 1)

Status: **SPEC ONLY — nothing is built.** This stops for Matt's ruling on the starter phrases and the open items (§12). Epic
#2109; phase 0 (the motion map, `motion-map.md`), phase 2a (#2113, the CPU reference), P4 (#2116, break-up) and P5 (#2117,
stacking) are merged, so step 2 is unblocked once this is approved. Paths are under `app/src/`. Every claim below was
re-read on `main` @ `58c7f11e`; none of it was run except the throwaway check in §11 (not committed).

## 0. Rulings this spec follows (Matt, 2026-11-11, on #2118)

- **Tempo (§6): snap to beats.** Inside a phrase, each kineme's period rounds to a whole number of beats at the current
  BPM, so motion lands on the music. The rounding rule is nearest whole beat, minimum one; when the BPM changes mid-step
  the cycle re-anchors without a jump, the way `createKinemeClock` re-anchors a rate change. A kineme played outside a
  phrase keeps its own period in seconds, as today.
- **Unison (§4): staggered.** Each mark starts the phrase at a seed-hashed bar offset, so step changes ripple through a
  field of marks.

The alternatives the issue asked to be laid out (free-running periods, unison starts) are **not** laid out: the rulings
above replace them.

## 1. What exists today (verified)

- A kineme is one periodic cycle: a record `{ id, kind, period, amp }` in the library (`data/kinemes.js:23`), `period` in
  seconds. The library: `spin` 4.0, `rock` 2.4, `pulse` 1.6, `blink` 1.0, `bob` 3.0, `bend` 3.6, `scatter` 3.2
  (`regionOnly`). Stacks (#2117) are a second frozen list in the same id namespace, resolved by `getAssetKineme`;
  `getKineme` stays single-only.
- The shader evaluates one slot per instance: `ph = fract(u_kinemeTime / per + phase)` (transcribed at
  `engine/motionCore/kinemeSources.js:163`), where `u_kinemeTime` is the **kineme clock** — `createKinemeClock`
  (`data/kinemes.js:184`), an anchored fold whose rate change re-anchors at the current motion time so the clock never
  jumps; its whole state is two anchors and a rate, carried as plain JSON (`snapshotState` / `restoreState`, :199).
- The contract builds the 16-slot table in `kinemeFields` (`gl/sceneContract.js:749`): instance kinemes first, region
  slots append after (:777), `KINEME_TABLE_MAX = 16` (`data/kinemes.js:76`). Over the cap, an instance kineme is skipped
  (the mark is still) and a region gets slot 0 (renders merged, at rest). A stack takes **one** slot whose entry carries
  a parallel `b` member (:765). An instance's phase is `kinemePhase(seedOffset, key)` (`data/kinemes.js:171`, a hash in
  thousandths); a region instance's phase is `kinemePhase(asset, regionId)`.
- The **musical clock** already exists and is deterministic on loop time: `gl/musicalClock.mjs` integrates beat position
  (`pos += dt · bpm / 60000`), so a tempo change bends the future and never jumps the past (:7). `BEATS_PER_BAR = 4`
  (:10); `bar`, `beat` are 0-based, `phase` is 0..1 within the beat; a loop restart resets `pos` to 0 (:43). It is driven
  from `App.jsx:138` (`observeClock(loopTimeMs, beatBpm)`), published as `clock:beat` / `clock:bar`, and read live via
  `getMusicalTime()` → `{ pos, bar, beat, phase, bpm }` (`composition/clockLive.js:17`). The bus envelope is stamped with
  `{ bar, beat, phase, bpm }`, so a take records the clock's inputs.
- Motion Core already knows the bar as a time base: `TIME_BASES` includes `'bars'` (`engine/motionCore/index.js:47`) and
  `timeFor` derives it from a clock view's bar / beat / phase (:146). Sources register as `{ id, family, timeBase,
costTier, evaluate, anchorNodes }`; the kineme library's sources are `kineme:<id>`, family `kineme`, timeBase `kineme`
  (`engine/motionCore/kinemeSources.js:117`).
- The contract's doc is built per frame in `gl/liveLoop.mjs:1065` — a literal that carries `kinemeTime` from
  `kinemeClock.at(...)` (:1074), `assetKineme`, `regionKinemes`, and the governor state. Nothing in the doc carries the
  musical position today (§8).

## 2. The record

A phrase is a library entry with its own id, in the same id namespace as the singles and the stacks, in a third frozen
list beside them (`data/kinemes.js`):

```js
export const KINEME_PHRASES = Object.freeze([
  {
    id: "lookout",
    steps: [
      { kineme: "blink", bars: 2 },
      { kineme: "spin", bars: 2 },
    ],
  },
  // …the starter set, §9
]);
```

- A step is `{ kineme, bars }`: a **single** kineme id and a whole number of bars. Resolution order in `getAssetKineme`
  becomes single → stack → phrase, returning `{ id, kind: 'phrase', steps }` for a phrase id; the three lists' ids are
  disjoint (a selfcheck holds it, as it holds the stack rules). `getKineme` is unchanged, so the region paths that must
  refuse non-singles today keep their behaviour until §8 extends them deliberately.
- **Referenced like any id:** `assetKineme: { mic_arrow: 'lookout' }`, and a region map may name one too:
  `regionKinemes: { some_asset: { r3: 'tide' } }`. No new doc field.
- **Sanitizers.** `sanitizeAssetKineme` accepts a phrase id iff it is in `KINEME_PHRASES` **and no step member is
  `regionOnly`** — the same rule that refuses `scatter` on a whole mark today, applied to the phrase's members (a whole
  mark cannot play scatter, so it cannot play a phrase containing one). `sanitizeRegionKinemes` accepts a phrase id iff
  it is in `KINEME_PHRASES`; members may include `scatter`, because the region path satisfies `regionOnly`.
- **Record validity is a selfcheck, not runtime** (the stack rule): every step names a known single kineme (not a stack,
  not a phrase — no nesting), `bars` is an integer in range. Caps are proposed in §12 (steps ≤ 8, bars 1–16 per step,
  total ≤ 64 bars); the frozen list is ours, so a bad record cannot ship past the suite.
- **Old documents load unchanged** — they only ever hold single or stack ids. A new document naming a phrase id loads
  in an old build as an unknown id, which the sanitizers already drop (mark still / region merged): the same degrade as
  any unknown id.
- **A stack as a step member is not in v1.** A step is one kineme; the fade (§5) already pairs two kinemes for a beat,
  and a stack step would make the fade a four-kineme blend at twice the table pressure. §12 leaves it as Matt's call
  for later.

## 3. Resolution is pure

The active step is a function of `(phrase, bar, mark identity)` only — mark identity enters solely through the offset
hash (§4). It is computed in `kinemeFields` at contract time and never stored; the instance carries only the resolved
slot, recomputed on every contract exactly as today's slot assignment is.

```
totalBars(P) = Σ steps[i].bars
localBar     = mod(bar − offsetBars(mark), totalBars)        // bar: the musical clock's 0-based bar
stepAt(P, localBar): walk the cumulative bars → { index, stepStartBar, barsIntoStep }
```

- `stepStartBar` is in phrase-local bars; the step's first beat in musical position is
  `(bar − barsIntoStep) · BEATS_PER_BAR`. The within-step cycle position and the fade read the clock's beat, phase and
  bpm from the same contract-time musical view (§8) — still nothing stored.
- **A clock restart restarts every phrase.** The musical clock returns `bar` to 0 when the loop restarts
  (`musicalClock.mjs:43`), so a restarted take walks every phrase from its first step — the issue's "restart at bar 0".
- **Same-kineme neighbours merge for evaluation.** Consecutive steps naming the same kineme — including across the
  loop seam, and a one-step phrase looping onto itself — evaluate as one step: no fade (§5) and the cycle anchor (§6)
  sits at the merged step's first bar. The record stays as written; the merge is an evaluation rule, so a one-step
  phrase is exactly "this kineme, snapped to beats, looping".

## 4. Per-mark offset — staggered (ruled)

```
offsetBars(mark) = floor(phase01 · totalBars)      phase01 = the mark's existing kinemePhase
```

- For an instance, `phase01 = kinemePhase(seedOffset, key)`; for a region, `kinemePhase(asset, regionId)` — the exact
  values their cycle phases already use, so a mark's offset and its cycle phase never disagree about identity. No new
  hash, no new per-instance data.
- Offsets are **whole bars**: every mark stays on the bar grid, just not on the same bar. They spread over the phrase's
  full length — for a 4-bar phrase, phases 0, 0.37 and 0.999 give offsets 0, 1 and 3, and the step sequences over bars
  0–7 are `00110011`, `10011001`, `01100110` (§11): a step change ripples through the field one bucket at a time instead
  of landing everywhere at once.

## 5. No pop at a step change — the envelope

Snap-to-beats does **not** put a kineme at rest at a step boundary in general: a step of 8 beats against a 5-beat
snapped cycle ends mid-cycle. So the blend carries the boundary, which is the branch of the issue's condition this
design takes ("both at rest **or** the blend continuous").

- The fade occupies the **last beat of the outgoing step**. Let `q` be the musical clock's phase within that beat, and
  the fade weight the raised cosine `w(q) = 0.5 · (1 − cos(π · q))` (the envelope family scatter uses; zero slope at
  both ends, so the blend has no velocity kink either).
- Poses follow the CPU reference's semantics (`kinemeSources.js`), blended per accumulator:

```
pose = compose( fade(P_out, 1 − w), fade(P_in, w) )          during the fade beat
fade(P, w) = { dx: w·P.dx,  dy: w·P.dy,  dRot: w·P.dRot,
               sx: 1 + w·(P.sx − 1),  sy: 1 + w·(P.sy − 1),  dAlpha: w·P.dAlpha }
```

- `P_out` is evaluated at its own cycle position (§6, anchored at its step's first beat). `P_in` is evaluated at the
  cycle position its anchor gives it: its step starts at the boundary, so during the fade beat its position is
  `fract((posBeats − boundaryBeats) / beatsPerCycle_in)`, in the last `1 / beatsPerCycle_in` of its cycle — it fades in
  on the tail of its cycle and wraps to 0 at the boundary, and since the pose is periodic in the cycle position, the
  wrap is not a cut.
- **Continuity is by construction:** at `w = 0` the blend is exactly `P_out` (`fade(P_in, 0)` is the identity pose), at
  `w = 1` exactly `P_in`, and `P_out`, `P_in` and `w` are each continuous in `t`. §11 samples the worst case.
- Same-kineme neighbours (§3) do not fade — there is no boundary in substance.
- **GPU note.** The contract is rebuilt per frame, so `w` is contract-time data: during a fade beat the pair rides the
  slot's existing stack entry (`a` + `b`, §1) with the two amps pre-scaled by `(1 − w)` and `w`. That reproduces the
  law exactly for the amp-driven accumulators (spin / osc / pulse / bob / scatter). **Blink is the one exception:** its
  shader visibility is a 0/1 duty gate, and stacking multiplies the two gates, which is not the `dAlpha` cross-fade
  above. Step 2 either gates a fading pair's alpha in the shader or lets a blink member cut at its boundary — §12 asks;
  the pose law above is the arbiter either way (the P2a bargain: the CPU reference defines it, the shader matches it).

## 6. Tempo — snap to beats (ruled)

Inside a phrase, a step's kineme does not run at its library period in seconds. It runs at a whole number of beats:

```
secPerBeat            = 60 / bpm
beatsPerCycle(k, bpm) = max(1, round(period_k · bpm / 60))     // nearest whole beat, minimum one
snapped period (s)    = beatsPerCycle · 60 / bpm               // what the table entry carries, as today
```

- Rounding is `Math.round` (half up; every library period is positive). The minimum is load-bearing: a kineme shorter
  than half a beat still gets a whole beat — nothing cycles inside a beat, so motion lands on the music and never
  between beats.
- At 120 BPM the library snaps to: spin 8 beats (4.00 s, exact), rock 5 (2.50 s), pulse 3 (1.50 s), blink 2 (1.00 s,
  exact), bob 6 (3.00 s, exact), bend 7 (3.50 s), scatter 6 (3.00 s). At 90 BPM: 6 / 4 / 2 / 2 / 5 / 5 / 5 beats. Full
  table in §11.
- **Cycle position (the law).** Within a step, the kineme's cycle position is counted in beats from the step's first
  beat: `c = fract((posBeats − anchorBeat) / beatsPerCycle + anchorCycle)`, with the anchor at the step's first beat
  and `anchorCycle = 0`. The shader's form is preserved — `ph = fract(c + phase01)` with the instance's seed phase
  added, as today — so copies of one asset still never move in lockstep within the step.
- **A BPM change cannot jump the cycle.** `posBeats` is the musical clock's integrated position, which a tempo change
  bends but never moves (§1), so while `beatsPerCycle` is unchanged, `c` is continuous for free. When the new BPM
  rounds to a **different** `beatsPerCycle` mid-step, the bare formula would jump (§11: rock at beat 6.3 of its step,
  120 → 100 BPM, `c` 0.260 → 0.575). So the resolver carries a small fold built exactly like `createKinemeClock`
  (`data/kinemes.js:184`): state `(anchorBeat, anchorCycle, beatsPerCycle)`; whenever the bpm-derived
  `beatsPerCycle` differs from the fold's, it re-anchors — `anchorCycle ← c(now)`, `anchorBeat ← posBeats(now)` — and
  the future runs at the new rate from the current position. No jump; the same bargain the kineme clock makes with a
  rate change, and the ruling's own words.
- The fold's state is plain JSON numbers with `snapshotState` / `restoreState` in the kineme clock's shape, so a take
  carries it the same way (#1367). Its inputs — loop time and the bpm sequence — are the same recorded inputs the
  musical clock already folds (the envelope stamps carry `bpm`), so a replayed take re-derives the same anchors and
  the same step sequence: the issue's acceptance, by construction.
- **Outside a phrase, nothing changes:** a kineme reached directly (single, stack member, region assignment) keeps its
  own period in seconds, exactly as today. The snap applies only to a kineme reached through a phrase step.
- Steps are counted in bars of the musical clock (`BEATS_PER_BAR = 4`); nothing in the record counts beats, so a
  future meter change moves the grid, not the records.

## 7. Table budget

- Steady state, a phrase mark costs what a single-kineme mark costs: **one slot**, its active step's kineme, shared
  with every other mark on the same step. During its fade beat the pair rides that slot's `b` member (§5), so a fading
  mark still costs one slot — but the slot's _entry_ is the pair, so distinct entries in a frame are: each distinct
  active kineme, plus each distinct fade pair in progress. The library has 7 singles, so all first steps and all
  active steps together can name at most 7 + 7 entries; fade pairs add more only in a scene running several phrases
  with several offset buckets mid-fade in the same frame.
- **Allocation order in `kinemeFields`** (phrase entries join the existing first pass, in instance order): single and
  stack entries as today, interleaved with phrase **first steps**; then phrase active steps; then fade pairs; region
  slots follow in their existing pass, with a region phrase's first step allocated before its active step inside that
  pass.
- **Over budget (the issue's rule): drop to the phrase's first step, never a blank.** A phrase mark whose active step
  or fade pair got no entry plays its phrase's first step at full amp, unfaded — the first-step entries are allocated
  ahead of actives and pairs precisely so the fallback exists. A phrase mark ends up with no slot only when a
  single-kineme mark in its place would also have been skipped by today's cap — a phrase never makes a mark blanker
  than the kineme it replaces. A region phrase over budget degrades the same way (first step if it has a slot, else
  today's slot 0: merged, at rest).

## 8. The contract seam, the ladder, and Motion Core registration

- **Where the bar comes from.** `kinemeFields` needs the musical view at contract time. The doc gains one field,
  `musical: { pos, bar, beat, phase, bpm }`, which the resolver reads **only when a phrase id is present** in the
  resolved maps and never carries onto the scene object. A phrase-less doc therefore builds a byte-identical contract,
  hash and all (the issue's acceptance: goldens identical for scenes with no phrase).
- **Who writes it — flagged, not hidden.** The doc literal is built in `gl/liveLoop.mjs:1065`, a one-writer file the
  issue's ground rules put off limits. Step 2's loop change is one field in that literal, sourced from
  `getMusicalTime()` (`composition/clockLive.js:17`), and — like the break-up spec's trigger fold — **it needs the
  one-writer owner's eye**. This spec does not pretend the seam is free.
- **Stills and exports** build contracts with no `musical` field (`exportStill.mjs`, `accumStill.mjs`, `candidate.mjs`
  call the same builder). The resolver then reads the still position: bar 0, beat 0, phase 0, bpm 120 (the musical
  clock's own initial tempo). A still of a phrase scene shows each mark at its offset's step at cycle position 0 —
  deterministic, and at rest for a phase-0 mark, per the anchor law.
- **Freeze, collapse, reduced motion:** no new path. When the kineme table does not ride the contract (reduced motion,
  the freeze rung), phrase marks are still, exactly like single-kineme marks; the musical clock may keep counting but
  nothing reads it. Region phrases shed with the region ladder (budget 0 → slot 0 → merged at rest).
- **Registration (the issue's step-2 requirement).** One Motion Core source per phrase: id `kineme-phrase:<id>`,
  family `kineme`, `timeBase: 'bars'`, registered beside the kineme sources. Its `evaluate(node, tBars, ctx)` is the
  CPU reference for §§3–6 — the blended pose, with `ctx` carrying the clock view (bpm for the snap, beat phase for the
  fade). Anchor nodes are declared phase-0 only, like the kineme sources: a phased mark starts at its offset bar by
  design, and its rest is the phase-0 node at bar 0.
- **Cost tier.** `registerCostTier('motionCore/kineme-phrase', { tier: 0, … })`: contract-time arithmetic — one
  cumulative walk (≤ 8 steps), one hash, one fold update per phrase instance per contract. The GPU cost is the
  existing kineme evaluation (two members during a fade beat). It sheds with the existing ladder above; there is no
  phrase-only rung.

## 9. Starter phrases — three proposals for Matt

| Id        | Steps (kineme × bars)    | Reads as                                   |
| --------- | ------------------------ | ------------------------------------------ |
| `lookout` | blink 2, spin 2          | a sentry: it flickers, then sweeps         |
| `tide`    | bob 4, rock 4            | it floats for a while, then starts to sway |
| `signal`  | pulse 2, blink 2, spin 4 | an indicator: breathes, flickers, turns    |

At 120 BPM: `lookout`'s spin step is exactly one full turn (8 beats = its snapped cycle); `tide` runs 8 bars (16 s) with
its seams carried by the fade, since bob's 6-beat and rock's 5-beat cycles do not divide their steps; `signal`'s spin
step is two full turns. Ids, members, bars and the count are Matt's call — each is one line in `KINEME_PHRASES`.

## 10. Selfcheck plan for step 2 (one PR, with the build)

One new suite, one manifest line: the resolver pinned over two loops for offsets from phases 0, 0.37 and 0.999 (the §11
sequences); restart at bar 0; envelope continuity sampled across the boundary for **every ordered pair** of library
singles (the §11 method, bound = the analytic derivative bound — no discontinuity, ever); the snap table pinned at 90 /
120 / 140 BPM; a BPM step-change mid-step → the fold holds `c` continuous at the change and a replayed (loopMs, bpm)
sequence reproduces the step sequence and anchors exactly; document round-trip (a phrase id survives save / load, an
unknown phrase id is dropped, a `regionOnly`-member phrase is refused for `assetKineme` and accepted for
`regionKinemes`); over-budget (fill the table → the phrase mark plays its first step, and is unslotted only where a
comparable single would be); every golden identical for every scene with no phrase. Live-canvas before / after captures
in the PR.

## 11. What I measured

A throwaway float32-style emulation (not committed), with the poses transcribed from `kinemeSources.js` (not
redesigned). The snap table (`beatsPerCycle` / snapped seconds):

```
bpm  90: spin 6b/4.00s  rock 4b/2.67s  pulse 2b/1.33s  blink 2b/1.33s  bob 5b/3.33s  bend 5b/3.33s  scatter 5b/3.33s
bpm 120: spin 8b/4.00s  rock 5b/2.50s  pulse 3b/1.50s  blink 2b/1.00s  bob 6b/3.00s  bend 7b/3.50s  scatter 6b/3.00s
bpm 140: spin 9b/3.86s  rock 6b/2.57s  pulse 4b/1.71s  blink 2b/0.86s  bob 7b/3.00s  bend 8b/3.43s  scatter 7b/3.00s
```

The resolver walk for `rock 2, bob 2` (total 4 bars), steps over bars 0–7: phase 0 → offset 0 → `00110011`; phase 0.37 →
offset 1 → `10011001`; phase 0.999 → offset 3 → `01100110`. The fade across a rock → bob boundary at 120 BPM, sampled
every 0.001 beat through the fade and past the boundary: the largest pose change in any sample step is **0.0252**
(degrees / scene units) — the poses' own derivative (rock alone contributes ≈ 0.0226), i.e. there is no discontinuity;
the blend's value just before the boundary equals the incoming pose at the boundary exactly. The tempo fold: at beat
6.3 of a rock step, a 120 → 100 BPM change moves the bare formula's `c` from 0.260 to 0.575 (a 0.315-cycle jump); the
re-anchored fold's jump is **0.000**.

I did not run the shader, the contract, or the live canvas. Nothing is built.

## 12. Open for Matt (none decided here)

1. **The starter phrases (§9):** the three ids, their steps and bars — and whether three is the right count.
2. **Caps:** steps ≤ 8 per phrase, bars 1–16 per step, total ≤ 64 bars (the sanitizer / selfcheck bounds in §2).
3. **Blink in a fade (§5):** gate the fading pair's alpha in the shader so a blink cross-fades like everything else
   (recommended — it is what the pose law says), or let blink members cut at the boundary.
4. **Stack steps (§2):** excluded in v1; a step names one single kineme. Revisit if compound steps are wanted.
5. **The `musical` doc field (§8)** touches the one-writer loop literal — one field, owner's eye at build time.
