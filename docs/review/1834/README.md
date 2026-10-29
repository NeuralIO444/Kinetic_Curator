# #1834 evidence — FEEDS ACCUM: the BUILD flag + project JSON round-trip

## The control in place

- `build-feeds-accum.png` — the BUILD layer stack, captured headless
  from the built app (vite preview + Playwright, real UI clicks only:
  ADD STRATUM added the second CONTENT stratum, the ≈ toggle on the
  front stratum was clicked, then the other stratum was selected so
  the flagged block collapsed). Stratum 1 shows the toggle struck
  through and dimmed (`.feed-off`) and its collapsed summary confesses
  **"no feed · wet 100%"**; stratum 2's toggle is in the live state.
- `build-panel-full.png` — the same moment at full frame: BUILD panel
  open, the stage mid-render. (The footer reads PERF PAUSED — the
  headless watchdog re-tripped while the screenshot was taken, after
  the frame had drawn; the panel state the still evidences is
  unaffected.)

## The round-trip measurements

From `feedsAccumSurface.selfcheck` (12 cases, all green; the suite
drives the real bus → wire → dispatch → store chain):

- Toggle on a content stratum: the store layer gains `feedsAccum:
  false`; toggle again: the key is **absent** — never spelled `true`
  anywhere in the system.
- Serialize with one stratum flagged: the document contains exactly
  **one** `"feedsAccum"` key, on the flagged stratum only. Serialize
  all-on: the document contains **no** `feedsAccum` anywhere — every
  existing project saves exactly as before the flag existed.
- Round trip: serialize → parse → apply → serialize — the layers
  array is **byte-identical** (the normalize carry assigns the key
  last, where the toggle appends it).
- Load edges: `feedsAccum: true`, a non-boolean, and flags on FX/MATH
  layers all load as absence (on); only exactly `false` on a
  content/pattern layer survives.
- The round-tripped document builds the contract slice 2 proved:
  the flag reaches `buildSceneContract`, and `accumFeedSelection`
  names exactly the feeding strata.
