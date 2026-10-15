# The Keeps Machinery — foundation spec

**Kinetic_Curator · 2026-10-14 · design/spec only, nothing built or filed**

Implements Matt's rulings of 2026-10-14 (the keeps-shelf session): the 16 in the
Looks menu is a **stage**, the full collection stays **explorable**, overflow
**exports to the loot folder** instead of being deleted, the stage is filled by
the **trio** under a **sway table** that deliberately breaks its own rules, and
the weirdness dial is set to **FULL WEIRD — half the stage breaks the rules**.
Companion note: `keeps-shelf-design-2026-10-14.md` (the ruling in short form).
This document is the foundation: the data model, the fill machinery, the memory
it needs, and the contracts everything else hangs from.

Marking: **[Ruled]** = Matt's words. **[Proposed]** = my design under those
rulings, his to strike.

---

## 0. The problem this replaces

Today `keeps` is one flat list (`kc:keeps:v1`, same record shape as favorites)
capped at 200 by `slice(-KEEPS_MAX)` in davisSlice: crown past the cap and the
oldest keep **silently vanishes** — and because `queenLean.keptCentroid(keeps)`
and the taste-training ledger read that list, the deletion silently moves the
Queen's taste anchor too. Surfacing is recency-only, which is why the same
keeps rotate through the menu while most of the collection is never seen again
(the dice audit's complaint, one level up). Three failures, one root: **the
shelf has no structure** — no distinction between the working set and the
collection, no memory of what has been shown, and a cap enforced by silent
loss.

## 1. Foundation laws

1. **Nothing is ever silently lost.** No eviction, export, refusal, or demotion
   happens without a visible, deadpan line in the surface where it happened.
   This law outranks every convenience below. **[Ruled — the ruling's core]**
2. **Scarcity lives on the stage, abundance in the collection.** The 16 is
   small on purpose; the collection is not scarce and must never pretend to
   be. **[Ruled]**
3. **The trio fills; the artist overrules.** A fill is a proposal the artist
   can hand-swap slot by slot afterward. The machinery never locks him out of
   his own shelf. **[Ruled — hand-swaps survive every fill]**
4. **The sway table is a table.** Its slot rules are data — visible in the dev
   panel, versioned with the code, changeable in one place. No hidden dice
   inside the dice. (DS: honest signals only.)
5. **Provenance is forever.** A keep's origin (hand / mined run / variant
   recipe / corner) rides the record through every tier and onto disk
   unchanged (#1140 shape + E3/E5 extensions). A tier move is not a new keep.
6. **Consumers read tiers, not the raw list.** The Queen, the Director, and
   taste training each state which tiers they read and at what weight, in
   their own contracts (§6). Nobody reaches around the tiers.

## 2. The three tiers

### 2.1 Stage — 16 slots **[Ruled]**
- What the Looks menu shows. The performing canon for the session.
- Stored as an ordered list of keep ids (order = menu order). Slots are
  addressable: a fill writes slots, a swap exchanges a stage slot with a
  collection keep.
- The stage is a *view with membership*, not a copy: the keep record lives
  once, in the collection's store; the stage holds ids. **[Proposed]** —
  one record, one truth; tier moves can never fork a keep's data.

### 2.2 Collection — everything kept **[Ruled]**
- Every crowned keep that is not on stage. Browsable and searchable in-app
  (the ASSETS drawer grows a shelf view: search by name, family, palette,
  origin; sort by kept date, last-staged, never-staged). "Explorable" is a
  surface requirement, not a sort order.
- Soft bound **[Proposed]**: 400 records in-app. Past it, §2.3 engages —
  export, never deletion.

### 2.3 Disk — the loot folder **[Ruled]**
- Overflow exports to the loot folder (#1479 layout: `looks/<keep-id>.json`,
  loot-root-relative references only, the keep record verbatim + its baked
  still when one exists).
- Exported keeps stay listed in the collection view, marked as on-disk;
  promoting one to the stage re-imports it transparently. Export is a
  *location*, not a graveyard.
- Export order **[Proposed]**: longest-unstaged first; a keep staged within
  the current session is never exported under the artist.

### 2.4 The keep record
Unchanged #1140 shape + the shipped extensions (E3 provenance incl.
`explorerProvenance`, E5 variant recipes). Two additive fields the machinery
needs, both optional-on-legacy (absent = unknown, never invented):
- `stagedCount` / `lastStagedAt` — maintained by the shelf-history ledger
  (§5), cached on the record for the collection view's sorts.
- `tier` is NOT a record field — it is derived from stage membership and
  disk location. One truth, per Law 5/§2.1. **[Proposed]**

## 3. The fill machinery — the Kinetic button

Pressing **Kinetic** with the shelf in focus refills the stage from the whole
collection (200+ eligible, disk included). The fill is a pipeline of three
voices and one table. **[Ruled: the trio fills; the table breaks the rules]**

### 3.1 Davis drafts
Davis proposes a wide candidate pool from the collection: stratified across
families and origins (the miner's quota discipline, reused), weighted toward
distance from the current stage and from the kept-centroid — novelty first.
Pool size **[Proposed]**: 48 candidates for 16 slots.

### 3.2 Lois gates
Every candidate passes LOIS's render gates (the E4 machinery: presence,
contrast, exposure, promise vs recipe density) against its baked still or a
fresh bake. A candidate that fails is out of this fill — the table below may
not resurrect a failed render. (Lois judges *renders*, never taste.) Keeps
without a still get a bake on demand; a bake failure is a pass-out, recorded,
not an error.

### 3.3 The Queen tilts
The surviving pool is tilted toward demonstrated taste: distance to
`keptCentroid` over **stage + collection** (her anchor reads the whole
collection of taste, per §6) — closer ranks higher for the consensus slots.
Her bound is unchanged: demonstrated taste only, identity below MIN_KEEPS.

### 3.4 The sway table **[Ruled: FULL WEIRD — 8 of 16 slots break the rules]**

The 16 slots are dealt by the table, in this order:

| Slots | Rule | Filled by |
|---|---|---|
| 1–8 | **Consensus** | Davis-drafted, Lois-passed, Queen-ranked — the trio agreeing |
| 9–11 | **Neglected** | Lois-passed keeps with the longest never-staged / least-staged history (§5) |
| 12–13 | **Wild** | The Lois-passed candidates *farthest* from the kept-centroid — Davis's instinct, Queen's leash off |
| 14–15 | **Lois's choice** | Her highest gate margins in the pool, taste ignored entirely |
| 16 | **Contrarian** | The Lois-passed candidate most unlike the other 15 as dealt — maximum internal friction |

- **Recency suppression [Proposed]**: a keep on the current stage, or staged
  in either of the two previous fills, cannot take a consensus slot. It may
  still be hand-swapped in, and the neglected/wild rules may take it only if
  the eligible pool runs dry (recorded when it happens).
- The table is data (Law 4): slot counts live in **one preferences document
  in the loot folder** (§3.5) — not in the app UI, not in code. The dev panel
  is a builder surface the end user never sees; it shows the table in force
  and, after each fill, which rule dealt each slot (the fill receipt, §5),
  read-only. Turning the dial = editing the document: e.g. "balanced" moves
  slots 12–16 back to consensus.
- Determinism: a fill is seeded (session seed + fill counter) and replays
  exactly from the shelf-history record, like every other KC-1 system.

### 3.5 The preferences document — settings live in the loot folder **[Ruled — Matt, 2026-10-14]**

The end user never sees a dev panel, so the dial is not a UI control at all:
the sway table and its sibling settings live in a **human-editable
preferences document in the loot folder** (`preferences.json` at the loot
root, beside `loot.json`), edited in any text editor, owned by the user like
everything else in that folder.

- **Contents (v1)**: the sway table (slot counts per rule + the recency
  window), the collection soft bound (§2.2 — default 400, now simply the
  shipped default of an editable setting), and export behavior (still
  location + marking). Namespaced keys (`shelf.*`) so other settings can move
  into the same document later by the same mechanism — Matt's "maybe other
  settings," answered with a door, not a sprawl.
- **Read semantics [Proposed]**: read on launch and on the loot folder's
  existing watch/rescan; an edit takes effect on the **next fill**, never
  mid-fill. A fill receipt (§5) records the table version in force.
- **Bad edits are honest**: an invalid value clamps to the nearest valid one
  and the correction is named in a visible line (dev panel + the loot
  folder's log surface when it exists); a missing or unparseable file falls
  back to the shipped defaults (FULL WEIRD) and says so. Never a crash,
  never a silent ignore — Law 1 applies to settings too.
- **Defaults ship in code** so the instrument works with no loot folder at
  all; the document, when present, overrides. First loot setup writes the
  document with the defaults spelled out, ready to edit.

### 3.6 Hand-swap **[Ruled]**
After any fill — or instead of one — the artist swaps any stage slot with
any collection keep. A swap is a first-class history event (§5) and the
swapped-out keep's `lastStagedAt` still updates: being chosen *against* is
also information, but it never feeds the Queen (Law: taste learns from keeps,
not clicks — swaps move membership, they do not retrain anything).

## 4. Crown flows

- **Hand crown (dice/perform)**: stage has a free slot → the keep takes it.
  Stage full → the keep lands in the collection with the deadpan line
  *"on the shelf — swap it in."* Never refused, never silently dropped.
  **[Ruled]**
- **Mined crown (E3 tray)**: the tray's shipped budget accounting (hand 1 /
  mined 2 stage slots, refusal copy at a full mined budget) folds into this
  model unchanged in spirit: mined keeps compete for stage slots under the
  same budget, overflow to the collection with the same line. The E3 tray
  refusal ("shelf full — 16 looks kept; free one first") is replaced by the
  collection landing + line, since refusal-with-loss is what Law 1 kills.
  **[Ruled — Matt, 2026-10-14: "Collection landing + line, for all crowns."
  The refusal copy dies for every crown kind, hand and mined alike.]**
- **Variant crown (E5)**: already lands in the collection store
  (budget-exempt); under this model that reads as: variants are born in the
  collection and reach the stage by fill or swap like anything else. Their
  Davis-made origin is exactly what the wild/neglected rules exist to
  surface. No change needed. **[Proposed]**

## 5. The memory — shelf-history ledger

The sway table's rules (neglect, recency) need memory the current store
doesn't keep. One append-only ledger, same discipline as the taste ledgers:

- Record kinds: `fill` (seed, table version, per-slot rule + keep id),
  `swap` (out id, in id), `crown` (keep id, landed tier), `export` /
  `import` (keep id, path). kc-voice-style flat records; no timestamps
  invented for legacy state.
- It is the fill's replay source and the dev panel's fill receipt: after a
  fill, the artist can read exactly why each slot holds what it holds,
  rule by rule. **A fill that can't explain itself doesn't ship.**
  (Honest-signals law, applied to curation.)
- `stagedCount`/`lastStagedAt` on keep records are caches of this ledger,
  rebuildable from it at any time.

## 6. Consumer contracts

- **The Queen (queenLean)**: anchor centroid reads stage + collection at
  full weight (demonstrated taste is demonstrated taste, wherever it sits);
  disk-exported keeps count too — export is a location, not a forgetting.
  What changes vs today: the anchor can no longer be moved by a silent
  deletion, because there are none.
- **Taste training (#1173 / MLX)**: reads keeps + passes ledgers as today,
  across all tiers; tier is not a training feature.
- **The Director**: unchanged. (The stage is a shelf, not a scene.)
- **Census**: gains a shelf readout — tier counts, fill-rule distribution
  over the last N fills, neglect coverage (share of the collection staged at
  least once). The explorer's census tab is its natural home. **[Proposed]**

## 7. Migration from `kc:keeps:v1`

- All existing keeps → collection. Stage := the 16 most recently kept
  (matches today's recency-surfaced menu, so the first open after migration
  looks familiar), the rest start unstaged with `stagedCount` absent
  (= never staged, honestly unknown rather than zero).
- Favorites (`kc:favorites:v1`) are untouched — a different surface with its
  own cap problem, explicitly out of scope here, named so it isn't forgotten.
- Migration is a sanitize-path version step (the layout-modes clamp pattern),
  idempotent, and covered by a round-trip suite (RA6 method).

## 8. Phasing (issue sketch — files on Matt's word)

- **K1 — Tiers + migration.** Stage membership, collection store, migration,
  collection shelf view (browse/search/sort), hand-swap, crown-flow lines.
  No fill yet — the Kinetic button keeps today's behavior until K2.
- **K2 — The fill.** Shelf-history ledger, Davis draft + Lois gate + Queen
  tilt pipeline, the sway table at FULL WEIRD, fill receipt in the dev
  panel.
- **K3 — Disk.** Loot-folder export/import, collection soft bound, on-disk
  marking; lands with or after the #1479 folder machinery it depends on.
- **K4 — Readouts.** Census shelf tab (tier counts, rule distribution,
  neglect coverage).

Kill criteria: K1 dies if migration can't be proven lossless on the real
record shapes (legacy keeps without keptAt/provenance); K2 dies if the Lois
gate can't run at fill time without freezing the UI (→ pre-baked stills
only, gates at bake time, table reads stored verdicts — the E4 ledger
already makes this fallback cheap).

## 9. Open questions for Matt

1. ~~Mined-crown overflow~~ — RULED 2026-10-14: collection landing + line
   for all crowns (§4).
2. ~~Collection soft bound~~ — resolved by §3.5: the bound is a loot
   preferences setting; 400 is only its shipped default.
3. ~~Dial persistence~~ — RULED 2026-10-14: no UI dial; the sway table lives
   in the loot folder's preferences document (§3.5). The dev panel only
   reads and reports.

---

## Lois pass (blunt, per the 9-rule lens)

- **Rule 1 (the big idea)**: The big idea is not the shelves. It's "the shelf
  explains itself." Sixteen slots, each with a reason a human can read. Lead
  with that or it's plumbing.
- **Rule 3 (turn lemons into lemonade)**: The 200-cap silent deletion was the
  lemon; the fill receipt is the lemonade — the bug's opposite, marketed as a
  feature: *every Look on your stage can tell you why it's there.*
- **Rule 5 (watch out for bores)**: A collection view that is a sorted list
  is a bore and will be ignored, and then the whole "explorable" ruling is
  theater. The shelf view needs the census trick: show what's *never been
  staged* like it matters — because in this design it literally deals slots.
- **Rule 6 (the 3-second rule)**: "Stage / collection / disk" — three words,
  three places, passes. "Sway table" passes. "Contrarian slot" passes and
  it's the one he'll brag about.
- **Rule 7 (when the client says go)**: He said go on every component in the
  ruling session. The only place this spec hesitates is §4's mined-crown
  copy change — that's not hesitation, that's a client asset (his deadpan
  copy) being revised; flagging it was correct.
- **Rule 9 (fail harder)**: The risk isn't building this — it's building it
  timidly, with the wild slots quietly reined in during implementation
  because consensus "looks better in review." The dial is FULL WEIRD. If the
  first fills don't make him say "what is *that* doing there?" at least
  twice, the build failed even if every suite is green.

---

## 10. Audit addendum — gaps, sharp edges, opportunities (2026-10-14)

Asked by Matt after the rulings: what are we missing? Coordinator's audit of
this spec against the shipped system. Findings, not yet rulings.

**Sharp edges (fix in the K-issues):**
- **S1 The performing Look is unpinned.** A fill or swap can remove the Look
  currently loaded and performing. The performing Look must be pinned to the
  deck: fills deal around it, swaps refuse-with-a-line on that slot.
- **S2 Favorites have the same disease.** `kc:favorites:v1` caps at 200 with
  the same silent `slice(-MAX)`. Out of scope in §7, but Law 1 cannot hold
  for keeps and not for favorites; at minimum the cap must stop being silent.
- **S3 Chronic swap-outs loop.** The fill ignores hand-swap history, so the
  table can re-deal a keep the artist keeps removing. Swap-outs must feed
  the fill's own suppression (never the Queen's taste — §3.6 stands) or the
  neglected rule becomes a nag.
- **S4 Small-collection degradation.** The table assumes abundance. With 20
  keeps, rules go unfilled; the receipt must say which rules dealt nothing
  rather than quietly dealing consensus twice.
- **S5 Disk-tier reads degrade.** The Queen's anchor counts exported keeps;
  when the loot folder isn't connected (web, no folder access), the anchor
  reads stage+collection only and the receipt/dev readout says the anchor is
  partial. Never a silent partial.
- **S6 iCloud conflict copies.** A `preferences (conflicted copy).json` in
  the loot root is ignored and named; the canonical file wins,
  deterministically.
- **S7 Fills need an undo.** Every other store mutation rides the undo
  stack; a fill is one undo step (the history ledger already makes it
  representable).

**Opportunities (name them now, build them when they earn it):**
- **O1 Crown-time stills.** Every crown bakes a still at crown time. Fills
  then read stills instead of baking 48 on demand (~25s at measured bake
  rates), the collection view becomes a visual wall instead of a list, and
  loot exports always carry their image. This is the single highest-leverage
  addition to the spec.
- **O2 The fill receipt as a session card.** The receipt (16 stills + the
  rule that dealt each) exported to the loot folder is a setlist — and the
  natural seed for replay recaps (#1529).
- **O3 Presets are files.** Because the table is a document, presets are
  documents: FULL WEIRD ships as one; "canon" and "balanced" as examples.
  Users can hand each other a weirdness. No code, no UI — culture via files.
- **O4 The pattern generalizes.** Matt's original framing had the trio
  filling "Looks and Voices, and Curator." A stage + a table is a reusable
  shape; the Voices row is the named next surface, not v1 scope.

**The core API (Matt: "core api visible?"):** yes — one small named surface,
or every consumer keeps reaching into the store the way E3/E5 had to.
`curator/shelf` (working name): `stage()`, `collection()`, `crown()`,
`fill(seed)`, `swap()`, `export()`, `history()` + the table read from the
preferences document. Fills/swaps/crowns also ride the event bus as records
(the EXPLORER_LOAD_RUN precedent) so replay and MegaMind see them live; the
ledger (§5) is the durable form. Visible to users as: the dev-panel table +
receipt (builders), the census shelf tab (K4), and the preferences document
itself (owners). No public/external API — KC-1 ships no cloud; kc-voice/1
and the bus remain the only seams.
