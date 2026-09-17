# Shimmer: UI attention cues driven by the taste model

Planning pass — September 17, 2026. Research only, no code.
Companion: `docs/MLX_OPPORTUNITIES.md` opportunity #8.

## The idea in one paragraph

Your taste model learns what you keep. Shimmer lets the instrument show you
what it thinks — not as numbers, scores, or popups, but as light. Buttons
breathe a little brighter when the model predicts you'll like the move behind
them. You can ignore it completely and lose nothing, follow it when you're
curious, or learn its habits and play *against* it like an instrument. The
whole concept stands or falls on one law:

**The tuner rule: shimmer is a readout, not a reward.** A guitar tuner tells
the truth about the string; a slot machine lies to keep you pulling. Shimmer
intensity must always be an honest function of predicted taste — never
gamified, never teasing, never celebrating anything except your own explicit
keeps. The moment it optimizes for clicks instead of taste, it's a casino.

---

## 1. Precedents worth stealing

**Mirror's Edge — Runner Vision.** Traversal objects glow the signature red,
diegetically — the guidance lives in the *material of the thing*, not a badge
slapped on top. Steal: shimmer should be a property of the button (luster,
glow), never an icon overlay. And Runner Vision has an off switch from day
one — so does shimmer.

**Ghost of Tsushima — guiding wind.** No waypoint marker; wind gusts flow
through grass *in a direction*, saying "over there-ish," never "here exactly."
Steal: for SUGGEST mode, an ambient drift toward high-taste regions beats
spotlighting one button. Caution from the research: the wind only works
because the player first *chose* a destination. Shimmer should mostly respond
to the current canvas state, not pitch random favorites unprompted.

**Journey — the weenie.** One bright beam on a distant mountain, almost always
visible; no words, no compass. Steal: one persistent quiet signal beats many
local hints — a single softly-pulsing panel section (the region with the most
taste-mass right now) plus restraint everywhere else. Caution: Journey's goal
is fixed; your taste drifts. Keep shimmer slow-moving relative to the model —
scores update in the background, glow changes gradually, never jumps.

**Left 4 Dead — the AI Director.** The beloved moments are the ones where it
*withholds* — "it's quiet… too quiet." Steal: shimmer needs a REST phase.
Deliberate windows where nothing glows, so you reclaim agency and the next
suggestion actually lands. Silence is the default; shimmer is the exception.

**Ableton Push — Scale mode.** Chromatic mode shows every note but lights
in-key ones brighter. Everything stays playable; in-taste controls just glow.
Steal the exact gradient: dim, don't disable. Never remove an option because
the model scored it low. Caution: players who lean on In-Key mode long-term
start sounding like In-Key mode. If SUGGEST is always on, your output
converges on the model's taste. REMIND mode exists precisely to counter this.

**Resolume — Auto Pilot.** Each clip/layer can auto-advance, scoped per layer,
flippable live with one switch. VJs call it "for the bathroom break" —
automation is a confession of absence. Steal: per-section shimmer modes
(SUGGEST on palettes, off on EVOLVE), one global intensity knob, instantly
killable. Iron law: **shimmer lights, never touches.** The day it auto-applies
a mutation, it stops being an instrument.

**Biofeedback instruments (Nevermind, Vessels, the Encephalophone).** The
deepest validation of your "play it like an effects pedal" instinct: MIT
Media Lab's Vessels turned the performer's own nervous system into an
instrument through daily practice — virtuosity lived in *the loop*, not the
UI. And the Encephalophone showed beautiful feedback teaches faster than raw
signal display — the shimmer *being* a shimmer (not a score readout) is doing
real cognitive work. Caution: virtuosity took daily practice; you need the
loop legible in the first 10 minutes. Make the mapping obvious early, subtle
later.

**Calm technology (Weiser & Brown).** Information should live in the periphery
and move to the center only when summoned. Steal the three zones: ambient
glow (periphery), brighten on hover (center, summoned), one distinct
escalation channel for the rare strong signal. And the hard budget: at any
moment, **≤20% of controls shimmering, silence the default.** If everything
glows faintly, it's wallpaper, not calm.

Every domain converged on the same five rules: suggest, never act · keep the
full action space available · slow-moving signals, fast interactions ·
explanation on summon, never pushed · explicit cold-start and off states.

---

## 2. Concrete interaction designs

### Design 1 — Breath (the default SUGGEST behavior)
Ghost Station buttons (EVOLVE targets, palette chips, preset buttons) get a
slow ambient glow — brightness breathing at ~0.1 Hz, phase-offset per button
so the panel looks like embers, not a metronome. Intensity follows the
candidate's *percentile* through a compressive curve, quantized to ~4
perceptible levels; below-median scores get nothing. Scores compute once per
session, never per frame. The breath is free-running — deliberately *not*
beat-synced, so nobody reads causation into it ("the music likes this").

### Design 2 — Tap on the shoulder (REMIND)
REMIND is an event, not a state. A section untouched for N minutes that the
taste vector scores highly gets **one** slow swell-and-release — a tap on the
shoulder — then a long cooldown. Continuous pulsing on an untouched control
is nagging; one tap is a friend waving. This is the anti-nag design and the
load-bearing counterweight to SUGGEST: three of four research domains named
model-driven convergence as the top risk, and REMIND is what fights it.

### Design 3 — LISTEN (playing it)
Hold SHIFT (or a dedicated LISTEN toggle) and shimmer amplifies ~3× — the
panel goes from ambient to explicit, like cupping your ear. Release and it
recedes. This is how you *ask* the instrument its opinion mid-set without it
shouting unprompted. Pair it with hover: hovering a shimmering control shows
not just why, but a **preview thumbnail** — the nearest kept render resembling
that candidate. The honest explanation is "this, because of these."

### Design 4 — DUET (the brave one)
A call-and-response mode, opt-in per set: every Nth Evolve (say every 8th, on
the phrase clock), the highest-scoring mutation target pulses brightly for one
phrase-cycle. Hit EVOLVE inside the window and that target is taken; miss it
and it passes silently — no punishment, no repeat-nag. The instrument
proposes, you dispose. This is the closest to playing shimmer as an
instrument because it creates *rhythmic interplay*. Risk: it can feel like
the machine performing you. Mitigations: opt-in, generous window, misses are
free, and it never fires twice in a row.

### Design 5 — Taste weather (the quiet-mode representation)
Instead of per-button shimmer: a slow gradient wash behind the Ghost Station
section whose drift reflects overall alignment between current params and the
taste vector — "you're in warm territory" vs "you've drifted cold." Less
actionable, more atmospheric. This doubles as the QUIET mode: when shimmer is
off, the weather remains as a single ambient signal. One metaphor, never
broken: shimmer always means "taste resonance" — never loading, error, or
"new feature."

**Intensity mapping, stated once:** never raw scores. Percentile rank within
the candidate set, compressive curve, ~4 levels, dead zone below median.
Percentiles are stable across model versions; raw dot products are
meaningless numbers that drift. Scarcity is the design — most buttons stay
dark.

---

## 3. The feedback-loop problem

The fear: shimmer → clicks → model trains on clicks → model predicts
shimmer-following → your range narrows while everyone feels the system is
"getting better at reading you." This is the documented *exposure-bias /
Matthew-effect* collapse in recommender systems, and the design has to assume
it will happen unless structurally prevented.

**Two ledgers, physically separated.**
- `performed` — what you touched during a live set, with timestamps and the
  shimmer state at touch time. Context for analysis. **Never a label.**
- `kept` — favorites / HITS / exported-and-kept, judged *after* the set,
  cool-headed, in the cold curation flow. **The only training labels.**

Time-separation is the mechanism: performance is hot, curation is cold. If
you favorite something two hours after the set while reviewing stills, that's
clean signal no matter how you found it.

**Gaming vs genuine exploration — the operational tell.** A shimmer-chased
click followed by an immediate revert is ambiguous (gaming? model wrong?) —
treat it as neither, log it, move on. A shimmer-chased click that leads to a
3-minute exploration ending in a favorite is not gaming at all — that's
*discovery*, the system working. It counts as a keep like any other. The rule:
**labels come from keeps; keeps come from outside performance time.**

**Exploration budget (non-negotiable).** Reserve ~15% of shimmer for
*low-score, high-uncertainty* candidates — wild cards, visually distinct from
confident suggestions (different texture: dotted/intermittent pulse vs steady
glow). Prefer candidates the model is *uncertain* about over uniformly random
ones; a brand-new preset family deserves exploration, a 500-times-seen palette
doesn't. Wild cards must be marked as wild cards, or their clicks poison the
labels anyway. Uncertainty should read as *frontier* (inviting), never as
apology — "uncharted on purpose," not "I'm probably wrong."

**Measure collapse, don't assume it away.** Track: diversity of candidates
ever crossing the shimmer threshold (shrinking = collapse); *shimmer lift*
(clicks on high-shimmer buttons vs their baseline — huge lift with flat
keep-rate means the cue drives clicks without driving taste: dial it down);
"followed shimmer" rate climbing toward 100% is an alarm, not a success
metric. The metric is keep-rate. Never click-through-rate. That's the casino
line, stated as law.

---

## 4. Trust calibration

**Earned loudness.** Cold start: shimmer begins as a whisper — max intensity
capped ~30%, only the top 5% of candidates shimmer, and until N keeps exist
the panel says "learning your taste" instead of glowing confidently. The cap
lifts as predictions validate against keeps: track shimmer precision
(shimmer-led touches that became keeps vs baseline). Beat baseline by a
margin across several sets → raise the cap. The instrument earns the right to
shimmer louder.

**When it's wrong — fail visibly and cheaply.** The model *will* be wrong;
taste drifts, sets have themes. Being wrong must cost nothing: shimmer never
blocks, never modals, never "are you sure?" And when a strongly-shimmered move
flops (you pass immediately after clicking), the cue should visibly deflate
in-session — a system that shows it noticed its own miss preserves trust;
a confidently-wrong system with no visible seam teaches "ignore the shimmer"
after one betrayal. Confidence is a *texture* (steady saturated glow vs
flickering desaturated shimmer), never a number.

**The track record, ambiently.** A tiny persistent element — the taste
weather — reflects recent hit-rate. Stormy when the model's been wrong lately.
You calibrate reliance at a glance, no dashboard.

**Off-ramps, three levels.** QUIET (weather only) · OFF (no shimmer, zero
compute, the instrument is exactly the same instrument) · per-section kill
switch. Plus a session-end single question in the *cold* flow — "how was the
shimmer tonight?" — never mid-set. Mid-set feedback is contaminated; cold
feedback is data.

---

## 5. Accessibility

- **Motion:** all pulse frequencies well below 3 Hz (breath at 0.1 Hz);
  `prefers-reduced-motion` collapses shimmer to a *static* encoding of the
  same information (steady border weight), not "feature off." A visible
  on-page Shimmer toggle is also required — many users don't know the OS
  setting exists.
- **Color:** shimmer intensity is never color-only. Pair glow with a second
  channel (border thickness / a small glyph count like ◆◆◇ on focus), and
  wild cards get a different *pattern*, not just a different hue. A user with
  monochromacy looking at a screenshot must still rank three buttons.
- **Screen readers:** never announce the animation (no live-region firehose —
  the motion itself is `aria-hidden`). Expose the *information* on demand:
  each candidate carries an `aria-describedby` ("model suggestion: strong
  match" / "wild-card exploration") available on focus, plus one static
  summary line in the panel ("3 strong model suggestions, 1 wild card") that
  updates silently. Keyboard parity throughout — every shimmered action
  reachable by keyboard with a focus indicator independent of the shimmer.
- **Photosensitivity:** no strobing, ever; test suspect patterns against the
  3-flashes-per-second threshold.

---

## 6. Technical shape

The plan's sketch validates, with one improvement.

- **What ships:** not vectors — *scores*. The sidecar (which already emits
  `taste.npz` from the linear probe) writes a tiny `scores.json` per
  taste-vector version: `{candidateId: percentile}` for palettes, presets, and
  the Evolve target pool. The browser stores kilobytes and does zero math
  beyond a lookup. No MLX in the browser, no live sidecar needed mid-set, no
  latency problem. The model stays private to the local install; only
  percentiles cross the boundary.
- **Novel candidates** (palettes you author mid-session): no shimmer until
  the sidecar scores them. Honest limitation, fine for v1 — better than
  guessing.
- **Refresh points:** session start (load scores.json) · taste-vector update
  (sidecar writes new file; app hot-reloads or prompts). Never per frame.
  REMIND timers are local wall-clock — no ML involved.
- **Public demo vs local:** the Tier 0 / Tier 1+ split already in the
  architecture decides this. Public Pages demo: shimmer off by default, or a
  clearly-labeled frozen sample; the toggle shows a "local install" note.
  Local install: live scores.json from the sidecar. This respects the rule
  that precomputed data — not models — crosses the boundary.
- **Logging (for §3):** log candidate id, shown percentile, and outcome
  (touched / passed / kept-later) per session. This is the dataset that makes
  shimmer lift, collapse metrics, and earned-loudness computable.

Effort stays S–M once the taste model exists: it's a JSON file, a CSS
animation, and a hover-copy addition.

---

## 7. Hover help: what it actually says

Rules: past-tense evidence, never mind-reading · always defeasible · no
exclamation marks, no "I," no Clippy. The copy must never read as correction
("is my taste wrong?" is the documented biofeedback anxiety — the words must
never invite it).

- SUGGEST: *"Shimmer — your kept renders lean warm and dense, and this
  palette sits in your top 10%. The model's guess, not an order."*
- REMIND: *"ORIGIN — untouched for 22 minutes. Your taste vector scores its
  current state high. A tap on the shoulder, not an order."*
- WILD CARD: *"Wild card — the model has no read on this one. Uncharted on
  purpose."*
- LOW CONFIDENCE: texture does the talking (flickering, desaturated); copy
  stays the same honest frame: *"…on thin evidence — 6 keeps in this family."*
- AGAINST-THE-MODEL (honored path): when you pick a low-shimmer move and keep
  it, the cold flow notes it plainly: *"Kept against the shimmer. Noted."*
  Provocation is first-class — speedrunning has a glitchless category; you
  get an honored against-the-model path.

---

## 8. Failure modes and dark patterns — explicitly never

1. **Variable-reward shimmer.** "Sometimes a low-score move shimmers anyway
   to keep you clicking" is slot-machine logic. Never.
2. **Near-miss teasing.** No "warm/cold," no almost-glowing buttons. A move
   earns its shimmer or it doesn't.
3. **Celebrating predictions.** The strongest feedback belongs to *your*
   explicit endorsements (HITS). Model shimmer is a quiet glow; your HIT is
   the fanfare. Never let a prediction borrow your celebration — that's the
   "losses disguised as wins" trick, the darkest analog on the list.
4. **Amplifying under immersion.** When you're deep in a set and
   self-monitoring drops, shimmer should get *quieter*, not louder. The
   instrument recedes in the zone; it never steers there.
5. **Authority creep.** No auto-Evolve toward shimmer, no sorting or
   filtering options by score (that hides the unshimmered — the panel must
   stay complete). Suggest, never act.
6. **Convergence without counterweight.** SUGGEST without REMIND and wild
   cards narrows your range while feeling like it's "learning you." The
   exploration budget is a diversity requirement, not a nicety.
7. **One signal, one meaning.** Shimmer = taste resonance. Never also
   loading, error, or "new feature." Break the metaphor and the instrument
   becomes unreadable.

---

## 9. Recommended first prototype — "the whisper"

Smallest thing that could prove the concept in a live set:

One surface — the EVOLVE target chips in Ghost Station. Scores from the
existing taste vector (or a stub vector for the dry run). CSS glow breathing
at 0.1 Hz, intensity from score percentile, top 30% of candidates only, max
intensity capped dim. Hold SHIFT = LISTEN (amplify ~3×). Hover = the honest
why-copy from §7. Log every touch with its shown percentile. After the set,
in the cold flow, one question: *did any shimmer-led move become a keep —
and did you reach for it, or ignore it?*

No model retraining in the prototype. The question isn't "is the model
good" — it's "does ambient guidance change how a set feels?" If you find
yourself playing the glow — or deliberately playing against it — the concept
is real and v2 earns its build. If you forget it's there, it stays a whisper
until the model earns louder.

---

*Sources: Mirror's Edge Runner Vision; Ghost of Tsushima guiding wind;
Journey / Disney "weenie" (Chen); Left 4 Dead AI Director (Booth, GDC 2009);
Dark Souls world cueing; Ableton Push Scale mode; Rekordbox Related Tracks;
Resolume Auto Pilot; Nevermind (Flying Mollusk); Vessels (Trevor, MIT Media
Lab); the Encephalophone (Frontiers in Human Neuroscience); Weiser & Brown,
"Designing Calm Technology"; Amber Case, Calm Technology; Dixon et al. 2010
(LDWs); Graydon et al. 2018; Mansoury et al. (popularity-bias amplification);
epsilon-greedy / bandit exploration literature; Dietvorst, Simmons & Massey
2015 (algorithm aversion); Logg, Minson & Moore 2019 (algorithm appreciation);
WCAG 2.2.2 / 1.4.1 / 2.3.1.*
