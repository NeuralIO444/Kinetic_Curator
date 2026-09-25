# Davis + Stimuli Panel Plan

*GHOST STATION (P07) and STIMULI (P06), brought up to BUILD's polish
standard. Feedback, not more controls.*

## Why

Both panels are control panels, not instruments. They show what the performer
*set*; neither shows what's *happening*. PLAY feels alive because the canvas
moves. The fix is feedback: the ledger ticking, the meter breathing, the
mapping glowing. Reference patterns: Resolume (dual input/output indicators,
dashboard macros, explicit FFT routing), VDMX (uniform receivers, meter as
first-class citizen), TouchDesigner (named signal paths), Ableton (MIDI learn
as a mode, macro knobs), Lightroom (P/X/U culling).

## Ghost Station — home of the composition machine

**Identity, stated:** the Davis dynamic is *the curator* — "what's worth
keeping?" This panel performs the HYPE *practice* (hand assets in, rule +
chance out, keep the hit), not a literal HYPE API. This **explicitly
overturns #104's "HYPE API: out of scope forever-on-this-panel" ruling** —
the reversal is conscious: the panel owns the composition-machine practice,
never anyone's pixels, never a framework port.

### Sections (top to bottom)

**CURATE** — the panel's heart, currently missing.
- CuratorBar moves here from BUILD: taste re-roll, voice/persona selector,
  presets popup, lock count.
- Keep/pass ledger: kept count, passed count, curator confidence, curator
  latency (state already carries all four). Ticks live while EVOLVE runs.
- Culling keys: P = keep, X = pass, U = unflag on the current candidate
  (Lightroom pattern). Filter-to-kept. The ledger never destroys — the
  farm/tray owns destruction.
- Favorites read here as the kept collection (bottom tray stays canonical
  per #310).

**GENERATE** — the machine.
- EVOLVE/STOP with progress feedback: generation #, current candidate seed,
  seconds-per-generation, candidates-seen counter.
- NEW SEED + sub-seed stream surgery (SPATIAL / COLOR / ASSET / NOISE + ↺),
  grouped under one label.

**PERFORM** — play it live.
- ACCUM gestures (FREEZE/THAW, CLEAR, SWELL) when ACCUM is on.
- Phrase clock status readout (controls stay in PLAY per #248 — this panel
  reports, it doesn't duplicate).
- MIDI learn lives here.

**MIDI** — Web MIDI API, learn-as-mode (Ableton pattern): arm it, click a
control, wiggle a knob. Uniform on every mappable control (VDMX receivers
pattern). Triggers (note on): EVOLVE toggle, NEW SEED, FREEZE, SWELL, CLEAR,
phrase reset, keep (P), pass (X). CC mapping for macro-level targets. One
modulation pipeline — MIDI and audio feed the same targets (Resolume
pattern). Mappings persist in the project doc. **OSC explicitly parked.**

### What leaves the panel

Nothing is deleted. BehaveReadout stays (organism modes) — but the panel no
longer hollows out when it's hidden, because CURATE is the mode-independent
heart.

## Stimuli — sound in

**Identity, stated:** STIMULI is *sound in*. Not control (that's MIDI in
Davis), not settings — the living ear of the instrument.

### Sections (top to bottom) — hierarchy inverted

**METER** (hero, was footer) — large waveform + spectrum bars with peak-hold
+ beat pulse. Named bands: Sub / Bass / Mud / Mids / Edge / Presence / Air.
Source label always visible: MIC / FILE / ENVELOPE.

**MATRIX** (was invisible) — live rows: `BASS ▸ scale 62%`, band → target
with current live amount, updating in real time. Resolume dual-indicator
pattern: raw depth *and* live modulated value, side by side.

**FEEL** — vibe presets over raw sliders: **Gentle / Punchy / Violent**,
macro presets over the 8 reactivity params with per-param curves (Ableton
macro pattern). One gesture, total feel change. The 8 raw sliders survive
behind an "Advanced" disclosure.

**SOURCE** — mic / file / envelope sidecar. File sampling on the
kc-audio-envelope/1 sidecar schema (#236): pre-analyzed audio ships
deterministic envelopes with the file.

**Prerequisite: #503 first.** The live envelope is shaped twice per frame
(hook + loop) — sampling means nothing until the live path stops lying.

## BUILD density audit

BUILD is ModeGrid + CuratorBar + ParamBlock (~21 lockable sliders) +
ToggleRow + LayerStack. It reads as two panels wearing one tab.

- **CuratorBar → Davis** (above). The single move slims BUILD and gives
  Davis its heart. Locks live in the store, so the move is clean.
- **ParamBlock: group, don't cut.** Collapsible FORM / MOTION / SWARM /
  BODY / FIELD groups. The locks are the taste mechanism; the TE aesthetic
  is honest limitation, not fewer knobs.
- **ToggleRow stays** — the scene's render switches; BUILD is their home.
- **LayerStack stays** (it *is* building) but gets a real section boundary
  — it was a whole panel once and currently reads as a smuggled second tab.

Net: BUILD becomes modes → params (grouped) → render switches → layers.
One job — *author the scene*.

## Build order

1. **#503 fix** — the live envelope stops lying. Prerequisite for everything
   audio; small, honest, first. (Existing issue, no new filing.)
2. **Stimuli meter-as-hero + modulation matrix** — biggest visual win,
   UI-only (reads existing audioBands).
3. **CuratorBar → Davis + keep/pass ledger** — the identity fix for both
   panels in one move.
4. **Vibe presets** (Gentle/Punchy/Violent macros) + Advanced disclosure.
5. **Davis regrouping**: GENERATE / CURATE / PERFORM, EVOLVE progress,
   culling keys (P/X/U).
6. **MIDI learn** — Web MIDI, learn-as-mode, triggers + CC, persisted.
7. **Envelope sidecar file sampling** (kc-audio-envelope/1).

## Deliberately not

A literal HYPE API (framework port = architecture cosplay); OSC (parked);
VST hosting; color scopes in Stimuli (STAGE territory); ledger deletions
(Lightroom rule); a node-graph modulation editor; cutting ParamBlock
sliders to "fix" density.

## Scope note

This stretches the scope lock: new surface (MIDI, ledger, matrix), not
polish. The call is that GHOST STATION and STIMULI were never finished as
instruments — this completes their locked-scope jobs (perform, capture)
rather than adding new ones. Recorded here so it's conscious, not drift.

## Build record

Tracked per-phase in open issues (2–7 below; phase 1 is #503). Rules: one
fix per PR; selfcheck per behavior; no golden moves; MIDI mappings
round-trip through the project doc like every other field; `Closes #N`
lines; Matt merges.
