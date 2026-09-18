# Hover help — sleeper backend

**Date:** 2026-09-18  
**Stance:** The UI stays. Help is data + `title=`. No tooltip library, no hover cards, no AI blurbs.

Already shipped: `app/src/data/helpCopy.js` + `helpCopy.selfcheck.mjs` (#158 / #222). One map feeds the `?` sheet and is *supposed* to feed hover. The gap is wiring, not a new surface.

---

## What “sleeper” means here

- Native `title` only. Browser delay is the TE pause. No custom overlay on pointer.
- Copy lives in **one** module. Hover and `?` cannot drift (selfcheck already requires the sheet to import the map).
- Sentences are short, specific, slightly rude about stale myths (see VIDEO, WEBM). That voice stays.
- New chrome does not invent inline `title="..."` strings. It takes an id from the map.

---

## Current holes (planning, not a rewrite)

1. **Map ≠ DOM.** Selfcheck proves the map is well-formed and that a few files import it. It does **not** prove every slider/pill `title` is an id from the map. Ad-hoc titles will rot (MIX vs FADE is the next one).
2. **Missing topics for work in flight.** No ids yet for: palette FADE, TAPE FULL, KC-n slots, PATCH OFF/MOD/FIELD/FEED, budget ceiling LEAN/SHOW/FULL, FLOW (#284), METABOLISM/BREATH (#287).
3. **Ghost Station / tray leftovers.** Some topic titles still say Ghost Station. Fine until copy pass; don’t restyle the sheet.
4. **No delay policy in code.** Native title is enough. Do not add JS hover timers.

---

## Engineering (small, ordered)

1. **`helpTitle(id)` helper** in `helpCopy.js` — returns the one-line `text` (or `title + ': ' + text` if a control has no visible label). Components call `helpTitle('layout-accum')`, never a raw sentence.
2. **Selfcheck: allowlist of `title=`**  
   Scan `app/src/components/**/*.jsx` for `title=`. Each value must be `helpTitle(...)`, `HELP_TOPICS`, or on a tiny allowlist (e.g. dynamic `LIVE/PAUSED` already tested). Fail CI on a new literal string.
3. **Reserve ids now** (empty text until the control ships):
   - `palette-fade` — duration of a palette switch. Not MIX.
   - `tape-full` — the room sentence.
   - `track-kc` — what a KC-n slot is.
   - `patch-off` / `patch-mod` / `patch-field` / `patch-feed`
   - `budget-lean` / `budget-show` / `budget-full`
4. **Write text when the control lands**, same PR as the chrome. Not a copy sprint.
5. **Voice rules** (for whoever types):
   - One sentence. No “empowers you to.”
   - Name the sibling control it is *not* (`Not the Ghost bar.`).
   - Name the limit (`0s cuts.`).

---

## Not this

- Tippy / Radix tooltip / hover cards
- Markdown in titles
- Tour step 5+
- Help tab as a ninth panel
- Worker / kernel topics in the performer map

---

## Tie to open issues

| When | Help id |
|---|---|
| #326 palette duration | `palette-fade` |
| #339 labels | `track-kc` |
| #342 TAPE FULL | `tape-full` |
| #343–#345 PATCH | `patch-*` |
| #292 budget knob | `budget-*` |
| #284 FLOW | `layout-flow` |
| #287 sliders | `build-metabolism`, `build-breath` |

Kernel drafts #350 / #351 stay out of hover.

---

## Done when

- `helpTitle(id)` exists.
- Selfcheck fails a stray `title="..."` literal in components.
- New performer controls in this pass land with an id, not a one-off string.
