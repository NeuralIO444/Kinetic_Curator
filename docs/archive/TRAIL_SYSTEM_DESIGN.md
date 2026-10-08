# TRAIL SYSTEM (#560) — review + design for current KC-1

**Status:** design and scope only. Nothing built, no PRs filed.
**Reviewed against:** origin/main @ `88d819e` (2026-10-03).
**Issue:** #560 — TRAIL SYSTEM: echo-leave + emitter modes (LEAVE/RIBBON/COMET) + live ECHOES.

---

## 1. Verdict — what is genuinely missing

Less than the issue's queue-sync note suggests. The remaining work is **three small slices and four questions**, not a rebuild:

| # | Missing piece | Size |
|---|---|---|
| 1 | Trail-mode copy is not in the single-source `helpCopy` map (issue's PR4 requires it) | XS |
| 2 | COMET has no head-bright boost — the chip and tooltip promise "a bright head", the render only shortens the tail | S |
| 3 | Trail CLEAR is one-click destructive — #560's own comment says to follow #571's confirm pattern; #571 closed with a count-stating confirm and the trail CLEAR never got one | S |

Everything else in the issue is either on main, superseded by later architecture, or a question for Matt.

---

## 2. Review — what exists on main (verified in code, not from memory)

**PR1 — trail field + parity (done, #854).**
`src/gl/trailMode.mjs`: `TRAIL_MODES = ['accum','echo','leave','ribbon','comet']`,
`resolveTrail()` fail-closes unknown values to `'accum'`. Default `trail: 'accum'`
in `src/data/layout-modes.js`. Saved projects without the field render
pixel-identical — the issue's Learn requirement holds.

**PR2 — LEAVE + CLEAR (done, #855; shed named by #900).**
`accum.mjs` `step()`: when `leave && keep >= 1` the fade pass is replaced by a
plain copy — the stamps hold, no new shader, no new FBO (the issue's "OVER_FS
reused, zero new shaders" constraint holds; the "one new FBO" budget was never
spent). `begin()` wipes both pair buffers and resets the echo ring — CLEAR
wipes both buffers as specified. `accum/leave` is registered tier 1, so the
governor's tier-1 shed covers it: a shed loses the stamps, they auto-recover —
disclosed in the cost-tier note, not engineered around, exactly as the issue
specified. LEAVE FADE slider (0 = hold, higher = decay) plus TUNNEL/PRISM/FLOW
FADE sliders give the performer the "dim the feedback in LEAVE" control the
issue asked for, as opt-in fades rather than forced dims (see §5).

**PR3 — RIBBON + COMET + live ECHOES (done as fade laws, `57d92a5`, Oct 2).**
This is the slice the queue-sync note calls "not done". What actually landed:
- RIBBON = `keep` floored at 0.96 (long hold) + flow floor 0.012 (always some advection).
- COMET = `keep` capped at 0.72 (short tail).
- ECHOES = live 0–4 slider driving the B3 echo ring in the live loop (resolution-gated at ≥2048px, as specified).

What did **not** land: the literal "path polyline stamps" (no RIBBON_FS exists —
and see §5 for why that's fine), and COMET's "head-bright" (only the short tail
is real).

**PR4 — UI selector (done) + copy (missing).**
The ToggleRow carries LEAVE / RIBBON / COMET chips, the ECHOES slider, LEAVE
FADE, and the TUNNEL/PRISM/FLOW FADE sliders. Gestures (FREEZE / CLEAR / SWELL)
live in the Davis panel's GHOST STATION row, as specified. **Gap:** the chips
use hardcoded `title` attributes; the issue says "helpCopy single-source" and
`src/data/helpCopy.js` has no trail-mode entries. That's slice 1.

**Already satisfied from the issue's comments:**
- #806 clock: freeze holds the buffer (`liveLoop.mjs` skips render + step when
  frozen — the trail does not fade on wall time); pause rolls `loopTimeMs`
  back so nothing lump-sums on thaw. Decay is per presented frame on the loop
  clock. Done.
- #815: closed — one shared light recipe, grain sits after the trail. The "do
  not fork a second fade law" constraint is live and the design below respects
  it.
- #571: closed with a count-stating confirm pattern for snapshot CLEAR. The
  trail CLEAR did not adopt it (slice 3).

---

## 3. Design — the remaining pieces in current KC-1

### 3.1 Kineme reconciliation: no new emitter animation

The issue predates kineme (#781). The reconciliation is clean because the trail
system is a **frame-history buffer**, not an emitter: it never moves anything
itself. Emitter motion comes from the scene (swarm physics, kineme drift/breath
drivers, behave pills), all of which already ride the shared loop clock with
freeze semantics. There is no bespoke trail animation to migrate.

Kineme's own contract — "animates existing parameters, never invents render
features" — also answers the reverse question: no kineme driver is needed for
trails. A future driver could breathe a trail *parameter* (e.g. FADE half-life),
but that is a new feature, out of scope here.

Freeze/thaw and shed are already consistent across the two systems: kineme
freeze holds the pose, trail freeze holds the buffer, both on the loop clock;
kineme sheds by its ladder (hold boil → hold all → pin to rest → zero amounts),
trails shed tier-1 with disclosed stamp loss. No interaction, no conflict.

### 3.2 RIBBON: the fade-law + smear composition IS the ribbon

The issue's "path polyline stamps" plus "RIBBON_FS new" assumed a 2026-09-24
architecture. Two things changed:

1. **Velocity smear (#309) already draws the path.** Per-instance `vx`/`vy` is
   packed into the instance buffer and QUAD_VS stretches each quad along its
   own motion direction — "motion blur with zero fullscreen passes". At 60fps,
   consecutive frames' stretched sprites overlap, so the buffer receives a
   continuous ribbon, not dotted ghosts. The polyline vision is emergent from
   smear + long keep, not a new pass.
2. **A literal stamp system would violate the issue's own constraint.**
   "NOT in scope: … second particle system." Stamping polyline segments into
   the trail FBO from item positions needs a CPU→GPU position feed per frame —
   that is a second particle system wearing a trench coat.

So the shipped fade law (keep ≥ 0.96 + flow floor) composed with velocity smear
is the architecture-honest ribbon. The remaining work is not a shader: it is a
selfcheck/golden proving ribbon renders the promised look (continuous path vs.
accum's dotted ghosts at speed) and, if Matt agrees, closing the "RIBBON_FS
new" line as superseded by #309. If he wants the literal polyline vision
anyway, that is a new issue, not this one.

### 3.3 COMET: short tail is real; head-bright is the missing half

"Head-bright + hot-fade tails": the 0.72 keep cap delivers the short tail. The
bright head does not exist — the incoming frame composites at 1.0 in every
mode, so the chip's promise ("COMET keeps a bright head and a short tail") is
half-kept.

Design (respects #815 — no second fade law):
- **Head-bright:** a `u_headBoost` uniform on the shared OVER_FS, default 1.0.
  Comet sets ~1.15; every other mode passes 1.0 and renders bit-identically.
  Same program, parameterized — not a fork.
- **Hot-fade (thermal color decay):** deliberately **not** in the slice plan.
  A per-pixel keep or warm-shifted fade target inside FADE_FS is the closest
  thing to the "second fade law" #815 forbids, and the existing fade-to-paper
  + warm halation already gives tails a warm falloff. Ship head-bright, feel
  it, then decide — this is question 2 for Matt.

### 3.4 LEAVE + TUNNEL/PRISM/FLOW: the fade sliders are the evolved design

The issue said "FLOW/TUNNEL/PRISM dim in LEAVE (no-ops there, tooltip says
so)". What shipped is better: they run at full strength by default, and the
TUNNEL/PRISM/FLOW FADE sliders let the performer fade each one out. The LEAVE
chip's title discloses it ("Tunnel, prism, and flow can fade too"). No behavior
change proposed — the copy just needs to move into `helpCopy` (slice 1).

### 3.5 Stills: trail modes are live-only today

`accumStill.mjs` accepts fade/optics/tunnel/prism/flow/echoes but not
leave/ribbon/comet. LEAVE-hold across a still sequence is trivially expressible
(the flag already exists in the recipe), ribbon/comet are pure param presets.
Whether stills should carry the modes is question 3 for Matt; the slice plan
keeps stills untouched pending his answer.

### 3.6 Taxonomy check (#735)

LEAVE / RIBBON / COMET / ECHOES are system-level trail behaviors, presented as
such in the BUILD layout row. No LOOK/VOICE mislabeling. The new helpCopy
entries (slice 1) must keep it that way — group 'Build', honest verbs.

---

## 4. Scope — stacked slices (one fix per PR)

Each slice: acceptance check first, watch it fail, smallest implementation,
green, commit. No PRs filed by the builder (Matt merges).

**Slice `trail-copy` — trail modes into the single-source helpCopy map.**
- Move the LEAVE / RIBBON / COMET / ECHOES / LEAVE-FADE titles from hardcoded
  `title` attributes in `ToggleRow.jsx` into `src/data/helpCopy.js`
  (`layout-trail-leave`, `layout-trail-ribbon`, `layout-trail-comet`,
  `layout-echoes`, `layout-leave-fade`; group 'Build'), read via `helpText()`.
- Copy (draft, Matt's voice wins): LEAVE — "Hold the stamps. The trail buffer
  stops fading; CLEAR is the only erase. Fade is optional." RIBBON — "Smear
  the path into a line. Long hold plus a breath of flow — fast marks draw
  continuous ribbons." COMET — "Bright head, short tail. New marks land hot,
  the tail dies fast." ECHOES — "Live echo taps. Past frames ghost back in,
  0 is off."
- Acceptance: `helpCopy.selfcheck` covers the new ids; ToggleRow carries no
  hardcoded trail titles; hover text unchanged.

**Slice `comet-head` — the bright head.**
- Add `u_headBoost` (default 1.0) to the shared OVER_FS; `step()` uploads
  `comet ? 1.15 : 1.0`. The boost value is a named const with a comment, not
  a magic number.
- Acceptance: pixel diff — comet frame vs accum frame on identical input shows
  a brighter incoming layer and an identical tail law; all non-comet modes
  bit-identical before/after (the uniform defaults to today's render).

**Slice `clear-confirm` — #571's pattern for the destructive CLEAR.**
- The Davis CLEAR button confirms before wiping ("Wipe the trail buffer?" —
  #571's rule: the confirm states what's at stake; a count doesn't apply to
  a buffer, the irreversibility does). Cancel leaves the buffer intact.
  FREEZE and SWELL stay one-click (non-destructive).
- Acceptance: click CLEAR → confirm appears → confirm wipes, cancel preserves;
  selfcheck covers both paths.

**Slice `stills-trail` (only if Matt answers yes to question 3).**
- `--leave` / `--ribbon` / `--comet` flags in `accumStill.mjs`, threaded
  through the existing recipe params. No new stills machinery.
- Acceptance: a `--leave` still holds all frames; `--comet` still matches the
  live loop's comet recipe on the same seed.

Deliberately not in the slices: RIBBON_FS (superseded, §3.2), comet hot-fade
(Matt's call, §3.3), kineme trail drivers (new feature), PULSE (deferred by the
issue), stills parity without Matt's word.

---

## 5. Obsolete / superseded from the original issue

1. **"RIBBON_FS new"** — superseded by velocity smear (#309). The polyline
   vision is emergent from smear + long keep; a new shader would duplicate it.
2. **"FLOW/TUNNEL/PRISM dim in LEAVE (no-ops there)"** — evolved into the
   *Fade sliders (performer choice beats forced dims). Behavior stays; the
   issue text is stale.
3. **"first live ECHOES slider + loop wiring — stills-only today"** — done;
   the slider and ring are live. The stills flag (`--echoes`) also exists.
4. **"One new FBO shared by all three"** — the budget was never spent. LEAVE
   reuses the pair, echoes reuse the B3 ring. Memory still one pair-sized
   RGBA16F as the issue's Learn section requires.

---

## 6. Open questions for Matt (with recommendations)

1. **RIBBON's identity.** Is the fade-law + velocity-smear composition the
   ribbon — continuous path, no new shader — or do you want literal polyline
   stamps drawn into the buffer? *Recommend: the composition IS the ribbon.
   Literal stamps are the second particle system the issue forbids, and smear
   already draws the path.*
2. **COMET's hot-fade.** Ship head-bright + short tail and feel it, or also
   build the thermal color decay (tail cools as it dies)? *Recommend: ship
   head-bright first. The hot-fade is the only piece that touches the shared
   fade law #815 protects — earn it with eyes, not speculation.*
3. **Stills parity.** Should `--leave` / `--ribbon` / `--comet` work in
   stills/export, or are trail modes a live-performance-only system?
   *Recommend: live-only for v1. Stills are the golden path; a LEAVE still is
   just "every frame held". Revisit if you want trail stills for print.*
4. **CLEAR confirm.** Your #560 comment said to follow #571's pattern. One-click
   wipe stays (performance muscle-memory), or confirm stating the stakes?
   *Recommend: confirm — your own note called two destructive CLEARs with two
   honesty levels "how a performer loses a take".*
