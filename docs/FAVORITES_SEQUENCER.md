# Favorites Sequencer — scope

The bottom HITS tray becomes a step sequencer. Favorites become cells in a bottom row; a playhead sweeps left to right; each cell fires its favorite as the playhead passes. Save a hit, design something different, save another, drag to reorder — then play the row like an arrangement.

Design only. Nothing is built, no issues filed, no PRs.

## What already exists (research)

**The tray** (`app/src/components/FavoritesTray.jsx`, rendered at the bottom above the footer in `App.jsx:252`):
- Chips show number + 4-char seed hex, HITS label, "F to save · Enter advances setlist" empty state
- Click = recall, shift-click = evolve-from, alt-click = morph-to
- 1–9 keys recall, Enter/Space/arrows step through, ‹ › buttons reorder by delta
- Shows last 12 of up to 200 favorites (sliding window)

**The two transitions already exist** (`app/src/state/slices/davisSlice.js`):
- `recallFavorite` = CUT. Instant: seed, seed offsets, layout params, palette, asset cast — all land at once.
- `morphToFavorite` = MORPH. Morphable layout keys ease over `morphDurationMs` (200–8000ms, default 1200) with ease-in-out cubic on the loop clock (a freeze holds the morph mid-flight instead of completing it invisibly). Seed, palette, and asset cast land at the end. One undo entry per morph.
- A favorite is full state: seed + stream offsets + layout params + palette id + enabled-asset cast (`captureFavorite`, `sanitizeFavorite`). Matt's guess was right.

**Clocks that exist but you can't see:**
- Phrase clock: `phraseEnabled`, length 2–64, three sources — `audio` (mic attacks via the beat arbiter), `metro` (BPM metronome, 40–240, default 120, ticked on the loop clock so freezes hold it), `euclid` (k hits spread over n steps).
- There is **no visible clock in the UI** — TapeCounter shows GPU budget, not time. The sequencer's transport is the first visible clock KC-1 gets.
- Flag: `AGENTS.md` parks the tempo clock behind spine E sign-off (`docs/TEMPO_AND_CHIPS.md`). The sequencer transport touches that parked area — scoping it here is Matt un-parking it deliberately.

**DAW patterns worth stealing (brief):** Ableton's session view (clips as cells, scenes as rows), FL Studio's per-step articulation toggles, GarageBand's left-to-right playhead. The per-gap cut/morph toggle is FL-style per-step articulation applied to transitions.

## Design

**The strip.** The tray becomes the sequencer — one surface, not two. Bottom row of cells; each cell keeps the current TE language (number + seed hex). The playhead is a highlight sweep: the current cell gets the accent outline (the tray already has a cursor outline concept — the playhead is that, driven by the clock). Between every pair of cells sits a tiny cut/morph toggle (Matt's locked decision — per-transition, not global).

**Transport.** Lives at the left of the strip: ▶/■, step-forward, loop on/off, tempo readout with tap-or-type BPM, and a clock-source picker (metro / phrase / audio / euclid). The tempo readout is the visible clock the instrument has never had. Empty strip: "F to save a hit · ▶ plays the setlist."

**On step.** The playhead fires the cell's favorite through the existing actions — cut fires `recallFavorite`, morph fires `morphToFavorite`. No new engine work; the toggle just picks which existing action runs.

**Live tweaking mid-sequence.** Tweaks ride on top; nothing locks. This falls out of the existing code: `morphToFavorite` reads the *live* layout as its morph start, so a tweak naturally becomes the new "from." A cut step wipes tweaks (that's what cut means — full recall). Honest and predictable.

**Cells.** Number + seed hex, same as today. Thumbnails are a follow-on (favorite thumbnails don't exist; project thumbnails do — #654 — so the pattern is proven, just not wired here).

**Drag-and-drop.** Pointer-based DnD onto the strip; drop index maps to the existing reorder (a direct `moveFavorite(id, toIndex)` action is cleaner than delta-chains — one small store addition). The ‹ › buttons stay as the keyboard path.

**Two edge rules the design needs:**
- Morph longer than the step interval: the new step restarts the morph (never queue, never skip — the latest step always wins).
- The 12-window vs stable steps: the sequencer plays the arranged array order, not the sliding display window. Strip shows a practical cap (16 cells suggested); overflow pages or scrolls.

## Slices (one PR each, eval loop per slice)

1. `seq-cells` — Restyle the tray as a bottom cell strip (number + seed hex cells, HITS label, transport slot reserved). No behavior change: click/keys still recall, ‹ › still reorder. Acceptance: renders, existing tray selfchecks green, screenshot.
2. `seq-dnd` — Drag-and-drop reorder onto the strip (new `moveFavorite(id, toIndex)` store action; ‹ › buttons kept). Acceptance: drop at index N moves the favorite there; order persists across reload; selfcheck on the move action.
3. `seq-transport-manual` — Transport shell: ▶/■, step-forward, loop toggle, playhead highlight driven by manual stepping. Reuses the tray's advance logic. Acceptance: stepping fires each cell in order and wraps on loop; stop holds.
4. `seq-gap-toggles` — Per-gap cut/morph toggle between cells, persisted alongside favorites in localStorage. Acceptance: toggle flips, survives reload, and the playhead fires recall vs morph-to per the toggle.
5. `seq-clocked` — Metro clock drives the playhead: tempo readout + BPM set (default 120), steps land on the beat on the loop clock (freeze-safe, same accumulator shape as the phrase metro). This is the visible clock. Acceptance: selfcheck with a fake loopClock asserts step timing ± tolerance; tempo change re-times live.
6. `seq-clock-sources` — Clock-source picker: phrase / audio / euclid step the sequencer through the existing phrase machinery. Acceptance: each source advances the playhead; euclid misses are rests.
7. `seq-morph-semantics` — Overlapping-morph rule (new step restarts), stuck-`morphing` guard, and the live-tweak contract (tweaks ride on top; cut wipes). Acceptance: rapid steps never strand `morphing: true`; selfcheck asserts tweak-then-cut vs tweak-then-morph end states.
8. `seq-strip-cap` — Strip cap + overflow (16 suggested): paging or scroll for longer setlists, playhead stable across pages. Acceptance: 20-favorite setlist plays in order; page doesn't reset the playhead.

## Resolved decisions (Matt, 2026-10-03)

1. Live tweaks **ride on top** — morph reads live layout as its start; cut wipes (that's what cut means).
2. Tempo **shares the phrase BPM** (120 default) — one tempo for everything, no separate sequencer knob.
3. Strip cap: **16 cells with paging**, playhead stable across pages.
4. Cell content: **number + seed hex** for v1 — thumbnails parked as follow-on.
5. Tempo clock **un-parked** — Matt deliberately lifts the spine-E park; the transport is KC-1's first visible clock.
6. Freeze: **hold and resume** — the playhead holds on loop-clock freeze like morphs and evolves.
