# Keeps shelf design — Matt's ruling, 2026-10-14

Resolves the open call left by E3 (#1507): the shipped keeps store caps at 200 with
**silent tail eviction** (davisSlice `slice(-KEEPS_MAX)`) — crown #201 and the oldest
keep vanishes, and because the Queen's kept-taste centroid and the taste-training
ledger both read the keeps list, the eviction also silently shifts her anchor.

Matt's ruling (his words: "i like 1 + 3", plus his own framing): the 16 he sees in the
Looks menu up top is the **stage**; per session those 16 can be **swapped out**; the
full 200+ collection stays **explorable** — he feels he keeps seeing the same things,
which the dice audit backs (only ~208 of 294 assets ever reach the tray; keeps
surfacing is recency-only).

## The design

- **Stage — 16.** What the Looks menu shows. The performing canon: scarce, deliberate.
  The Queen leans on these; the tray surfaces these.
- **Swap is a deliberate act.** Per session, Matt promotes any collection keep onto
  the stage and demotes one back. Crown never auto-rotates the stage.
- **Collection — everything else, explorable.** Browsable/searchable in-app (the
  whole shelf, not a recency slice). Crown with a full stage lands here with a
  deadpan note ("on the shelf — swap it in"), never refused, never lost.
- **Disk backing (the "+3").** The collection exports to the loot folder (#1479
  `looks/`) instead of being deleted: the in-app cap stops being a cliff. Overflow
  lives as files, re-importable. Silent eviction dies — replaced by export.
- **Consumers:** Queen centroid anchors on the stage (collection keeps count as
  demonstrated taste for training, stage carries the live lean); taste training
  reads stage + collection; census counts both shelves.

## The fill — trio + sway table (Matt's amendment, 2026-10-14)

The stage is NOT filled by recency or by hand alone. The **Kinetic button** fills it
from the **whole collection (200+)**, and the trio does the filling, each by their own
logic — "combining 3 artists to create something new" (Matt):

- **Davis drafts wide** — novelty/distance from the kept corpus.
- **Lois cuts** — her render gates (E4 machinery) judge the candidates.
- **The Queen tilts** — toward demonstrated taste, bounded as always.
- **The sway table breaks the rules** — a visible table of slot rules reserving
  stage slots for the neglected (never staged), the wild (far from taste), and
  flat rule-breaks. Recently-staged keeps are suppressed; never-staged boosted —
  the direct cure for "I feel like I see the same thing."

**Weirdness dial: FULL WEIRD (Matt, 2026-10-14) — half the stage (8 of 16 slots)
is reserved for rule-breaking picks**; the other 8 are trio-consensus. Hand-swaps
remain available after any fill. The same trio-fill idea extends to Voices and
Curator surfaces where a set gets chosen (Looks first).

## Status

Ruling recorded; **not yet filed as an issue** (awaits Matt's word to file/build).
Supersedes the E3 tray-level budget as the end state — the tray's mined-crown
accounting (hand 1 / mined 2 slots) folds into the stage budget when this builds.
