# Dish D1 — friction + tangential impulse: the sketch

**Kinetic_Curator · 2026-10-14 · sketch only, pre-issue (issue follows on Matt's word)**
Umbrella: #1183 (one petri dish). Foundation verified in code 2026-10-14:
`app/src/engine/dishContacts.mjs` (the cross-strata pass, #1407),
`app/src/engine/dishMedium.mjs` (the medium law, #1413), the per-system
pass in `particles.js` (#167).

---

## 0. The gap, precisely

The contact pass resolves everything **along the contact normal and nowhere
else**. Depenetration pushes along `n`; the bounce impulse acts along `n`;
cling captures separating velocity along `n`; the medium's "friction" is
integrator damping — a drag on the whole velocity, blind to direction.

The relative **tangential** velocity of a contacting pair —

```
vt = (vB − vA) · t,   t = (−ny, nx)
```

— is never read anywhere in either pass. Two discs can graze at full
tangential speed and leave with every bit of it: perfect billiards, zero
surface. That is the whole gap. Friction is not a new system; it is the
missing second half of the impulse the pass already computes.

## 1. The law — friction comes from the medium, not a new knob

The petri spec already decided this (scope §6, carried in dishMedium.mjs's
header): **WETNESS = surface tension + friction**. C1 shipped the tension
half (cling) and the drag half (damping). D1 ships the surface half.

- Pair friction coefficient **μ = FRIC_MAX × fricK(pairWet)**, where
  `pairWet` is the pair's averaged wetness — the pass already computes it
  (`pairWet`, averaged across the seam on the restitution precedent) — and
  `fricK` is a new curve in `dishMedium.mjs`, smoothstep-shaped like its
  sibling `clingK`, resolved into `dishMediumFor`'s return as `fricK`.
- **Dry means bit-identical.** At `pairWet = 0`, `fricK = 0` and the
  tangential block is skipped whole — the same identity-at-zero law C1
  established ("0 is dry paper"), inherited, not re-argued. A dry dish is
  today's dish, golden for golden.
- Wet grips: a wet pair resists sliding the way the shipped fiction already
  claims (wet = holds on: cling holds the normal, friction holds the
  tangent, damping slows the glide). One knob, three consequences, no new
  parameter anywhere. (The rejected alternative — a separate friction knob
  per stratum — is in §8.)

## 2. The math — one Coulomb clamp, in the pass's own idiom

After the bounce impulse and cling have run (the pair's normal business is
finished), compute the tangential impulse that would zero the pair's
relative sliding, then clamp it to what the contact can actually transmit:

```
jtStick = −vt / wSum                      // impulse that would stop the slide
budget  = μ × (|jimp| + |jc|)             // total normal impulse this pair
                                          // exchanged this step (bounce + cling)
jt      = clamp(jtStick, −budget, +budget)
```

- If `|jtStick| ≤ budget`: the pair **grips** — relative tangential motion
  zeroes this step (static friction, emergent from the clamp, no mode
  switch, no threshold).
- Otherwise it **slides**, giving up exactly `budget` of tangential
  impulse (kinetic friction). One μ, both regimes — the deliberate
  simplification, named.
- The budget formulation matters: friction can never exceed the normal
  load the contact actually carried this step, so **friction creates no
  energy and no grip from nothing** — a pair that barely touched barely
  grips. Resting-contact friction (persistent manifolds, load from
  gravity) is a different engine's problem and stays out (§8).
- Applied mass-weighted along `t`, exactly as the normal terms apply
  along `n`. `jt` is left in scope as a named value: D2 (spin) will
  consume it as torque (`r × jt`) without recomputing the contact.

## 3. The pass changes — two call sites, law in the leaf

House pattern (B1): *particles.js and dishContacts.mjs take call sites
only; the law lives in the leaf.* `dishMedium.mjs` gains `fricK` +
`mediumFrictionBudget(μ, jnTotal)` (pure, like `mediumClingCapture`).

**Cross-strata pass** (`dishContacts.mjs`) — one block, inserted after
the cling block, before the #1410 deform feed, guarded by the medium the
pass already resolved:

```js
// D1 — friction across the seam: the tangential half of the impulse.
// Budgeted by the normal impulse this pair actually exchanged, so a
// dry pair (fricK 0, pairMed null) never enters and a light touch
// barely grips. Law in dishMedium.mjs.
if (pairMed && pairMed.fricK > 0) {
  const mu = FRIC_MAX * pairMed.fricK;
  const tx = -ny, ty = nx;
  const vt = (sysB.vx[ib] - sysA.vx[ia]) * tx + (sysB.vy[ib] - sysA.vy[ia]) * ty;
  if (vt !== 0) {
    const jt = frictionImpulse(mu, Math.abs(jimpTotal), vt, wSum);
    if (jt !== 0) {
      sysA.vx[ia] -= tx * jt * w1;  sysA.vy[ia] -= ty * jt * w1;
      sysB.vx[ib] += tx * jt * w2;  sysB.vy[ib] += ty * jt * w2;
    }
  }
}
```

(`jimpTotal` = the bounce impulse magnitude + the cling capture from the
blocks above, accumulated where they already compute `dvA/dvB`.)

**Per-system pass** (`particles.js`) — the mirror block at the analogous
point (post-impulse, post-repel, post-cling), using the system's own
resolved medium, which that pass already computes for cling. Friction
that exists only across strata would be a lie you can feel — same-kind
collisions are most of the dish. One stage, both passes, one law.

Depenetration, modes, masks, visit order, the density stamp, the ecology
and trail enrolments: **untouched**. Pair order is already canonical;
friction adds arithmetic inside a visit, never a new visit.

## 4. Downstream — this is a chemistry change, not just a feel change

Gripping pairs stay in contact longer and separate slower. Everything
that feeds on contact duration inherits the change:

- **Coalescence (#1411)** — longer contact → more merge opportunities.
- **Pigment exchange** — exchange is per-contact; grippier pairs exchange
  more per encounter.
- **Ecology (C4)** — breed/die fire on approach and mode events, which
  friction never touches (it runs after them, on velocities only) — but
  post-contact trajectories change, so encounter *rates* move.
- **Trails/currents** — deposit patterns follow the new motion.

None of that is a reason not to build it; all of it is a reason the
issue's acceptance (§6) takes those suites as **witnesses**: they re-run,
their deltas are measured and reported in the PR, and any delta beyond
noise is a flagged retune decision for Matt — not a silent side effect.
The deform feed (#1410) is the one deliberate non-witness: v1 feeds the
dent from normal Δv only, exactly as today; whether tangential drag
should shear the dent is a feel question for after D1 plays. Named, not
forgotten.

## 5. Determinism, parity, governor

- **Determinism**: pure arithmetic on state the pass already holds; no
  new state, no step counters, no randomness. Live and bake run the same
  pass (the bake driver enrols through the same gate), so bake parity is
  structural, as with C1.
- **Golden placements**: untouched — contact offsets never reach
  buildPlacements today and friction changes only velocities inside the
  pass.
- **Parity law**: wetness 0 everywhere ⇒ bit-identical engine. This is
  the acceptance gate, not a hope: the full golden set + the dry-path
  suites must pass byte-for-byte.
- **Governor**: friction declares **no cost tier and never sheds** —
  the medium's own precedent (contact law is not a finish; a shed that
  rewrote physics mid-performance would break bake parity). Cost: a few
  flops per contacting pair, only when wet.

## 6. Acceptance sketch (for the issue)

1. **Dry bit-parity**: full golden set + bake parity at WETNESS 0,
   byte-for-byte, both passes.
2. **Oblique-collision probe** (headless, seeded, the dishBake driver):
   two discs, known vt. Dry: vt out = vt in, bit-exact vs pre-D1. Wet:
   vt reduced by the predicted Coulomb amount; small-vt case grips to
   zero; KE out ≤ KE in for every probe (friction never adds energy).
3. **Slide-to-grip probe**: a disc sliding on a wet stratum decelerates
   tangentially and holds; on a dry stratum it glides unchanged.
4. **Witness suites**: coalescence, pigment, ecology, trails re-run;
   deltas reported in the PR body; any beyond-noise delta flagged as a
   retune decision, not absorbed.
5. **Determinism**: same seed, live-stepped vs baked, identical fields.

## 7. Constants

- `FRIC_MAX` — μ at full wet. Proposed **0.5** (wet paper on glass
  territory; strong enough to feel, far from a lock). One line in
  dishMedium.mjs, Matt's tune on the review lane.
- `fricK(w)` — smoothstep, the cling curve's shape. The knob's travel is
  the effect's travel, no hidden knee (the restitution curve's rule).

## 8. Rejected alternatives

- **A separate friction parameter.** Two medium knobs (wetness + friction)
  would let a Look be dry and grippy — a state the instrument's fiction
  can't explain. WETNESS is the medium; friction is one of its meanings.
- **Persistent contact manifolds / resting friction.** Real rigid-body
  engines keep contact state between steps; this dish is an impulse-per-
  encounter system by design (the non-goals: no second engine, no rigid
  stacks). The budget form gets the feel without the state.
- **Torque in D1.** Friction without spin is honest for discs whose
  rotation is presentational; D2 adds ω and consumes this stage's `jt`.
  Bundling them would double the witness surface for no extra truth.

## 9. Follow-on stages (named, not scoped here)

- **D2 — spin**: an ω column + torque from offset contacts, consuming
  D1's jt; visual rotation finally agrees with contact.
- **D3 — constraints**: distance/spring links for compound bodies
  (#1206) and stuck pairs, running after the contact pass.
- **D4 — shapes, later and only where needed**: circle-vs-AABB statics on
  the shared grid; discs stay primary.

---

## Lois pass

- **The big idea**: "Dry is billiards. Wet has skin." That's the whole
  stage in six words — if the issue can't say it that plainly, it isn't
  ready to file.
- **Turn lemons into lemonade**: the medium knob was already sold as
  "surface tension + friction" and only ever shipped tension. D1 isn't
  new scope — it's collecting a debt the docs already owe. Say so in the
  issue; owed work needs no apology and no new pitch.
- **Watch out for bores**: a friction stage whose PR leads with clamp
  math is a bore. Lead with the probe: same two discs, dry they click
  past each other, wet they *grab*. Feel first, formulas in the appendix
  where they belong.
- **Fail harder**: the risk isn't the math, it's timidity — a FRIC_MAX
  tuned so low the stage "passes" without changing anything anyone can
  feel. 0.5 is a floor for the first play, not a ceiling. If Matt can't
  feel it in ten seconds, turn it up until he can, then argue.
