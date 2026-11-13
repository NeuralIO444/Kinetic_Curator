# Figures — per-bone motion sources on one skeleton (Motion Core P7, #2119, step 2)

Status: **SPEC ONLY — nothing is built.** This stops for Matt's ruling (§11). Epic #2109; phases 1, 2a and 2b (#2112,
#2113, #2114) are merged, so step 3 is unblocked once this is approved. P6 (#2118, phrases) is still open; §2 says what
that does and does not block. Paths are under `app/src/`. Every claim below was re-read on `main` @ `58c7f11e`; nothing
was run.

## 0. Rulings this spec follows (Matt, 2026-11-11, on #2119)

- **Who picks (§8): Davis picks, Lois moves.** Davis deals each bone's motion source the same way he deals its part
  (seeded, from the stage); Lois's face still sets gait speed and amount. The artist can override a bone's source in the
  wet lab, and an override wins.
- **The mobile is built first.** It is the simplest figure and proves the API end to end. Step 3 runs in this order:
  (1) `poseFigure` honours `bone.motion` with parity to `poseRig` / `poseLinkage`; (2) **the mobile** — record kind,
  sanitizer, tile bake, one fixture, QA captures; (3) only then re-pipe `expandCreatureInstances` for existing creatures
  and beasts, goldens identical.
- The step-2 spec is still required and still stops for Matt before any build.

## 1. What exists today (verified)

- **Bones.** A creature tile's rig is `{ body, bones }`; a bone is `{ id, role, chain, parent, x, y, angle, len }` in the
  tile's 100-unit box, parents listed first, ids `h` (head) and `l<chain>.<depth>` (limbs), at most `MAX_BONES = 12`
  (`engine/creatureRig.js:43`). `buildRig` (creatureRig.js:88) derives the bones from the authoring record's ATTACH
  points (H → head, L → limb chains, plain points → knees; `engine/assetAttach.js`). `sanitizeRig` (creatureRig.js:145)
  is the trust boundary: it re-runs on every overlay load and pins the id grammar (`^(h|l\d\.\d)$`), the roles
  (`head | limb`) and the numeric bounds.
- **Beasts are rigs too.** A beast tile's rig is `{ body, bones: [], linkage }` (sanitizeRig, creatureRig.js:145): the
  Jansen linkage is the skeleton and its bars are the bones. `poseLinkage` (`engine/beastRig.js:95`) poses them; bar ids
  are `<leg>:<barName>` plus the beam (`BEAM_ID = 'beam'`, beastRig.js:34), the 12 bar names in `LINKAGE_BAR_NAMES`
  (beastRig.js:128, from `BEAST_BARS`, `engine/beastBuilder.js:72`). Parts are dealt per bar **name** — every leg wears
  the same set.
- **The seam.** At contract time `gl/sceneContract.js:715` calls `expandCreatureInstances` (`engine/creatureRig.js:507`)
  with the frame's seed, `t = doc.kinemeTime`, the governor's `frozen` / `collapsed` rungs, Lois's face (`doc.loisFace`)
  and Davis's mood (`doc.davisMood`). Tree figures pose through `poseRig` (creatureRig.js:217 — forward kinematics: a
  child hangs from its parent's tip and adds its own angle), beasts through `poseLinkage` plus the roam overlay. Davis
  deals each bone's part by seeded hash (`dealPart`, creatureRig.js:257 — keys `davis|<seed>|<hand>|…`, a chain sharing
  one hand), and the parts land behind / in front of the body by role.
- **Step 1's question, answered from the code** (the pinning selfcheck is step 1's own PR; this spec only reports the
  read): expansion runs **before** kinemes are assigned. The kineme pass (sceneContract.js:750–775) walks the
  already-expanded instances and gives each one whose asset has an `assetKineme` entry that kineme's slot, with
  `kinemePhase(inst.seedOffset, inst.key)` — and a part's key is `<body key>#<bone id>`, so a part takes **its own
  asset's kineme, at its own phase**, exactly like any ordinary instance. Region kinemes resolve per asset over the same
  expanded list (sceneContract.js:784+), and at pack time `expandRegionInstances` (`gl/renderer.mjs:718`) expands a part
  instance's regions from the part's own transform. **A creature or beast part receives its asset kineme and its region
  kinemes today.** Step 3 must keep that ordering, or parts' motion changes under it.
- **Motion Core.** The registry (`engine/motionCore/index.js`) holds one contract: a source is
  `evaluate(node, t, ctx) → pose delta` with a declared family, time base and cost tier, and registration probes the
  anchor law (rest at t = 0). Registered today: one `kineme:<id>` per library kineme **and** per P5 stack
  (`engine/motionCore/kinemeSources.js:96`), one `gait:<FACE>` per `LOIS_GAITS` entry, `linkage:jansen` and `roam:beast`
  (`engine/motionCore/rigSources.js:66, 82, 97`). Every rig and kineme source declares time base `kineme`; `timeFor`
  (index.js:122) reads that base from the clock view and throws rather than substituting another. `poseFigure`
  (rigSources.js:150) already poses a whole figure — but through **one** source family for every bone (a gait, or the
  linkage, or the roam), returning per-bone deltas (`dx, dy, dRot` plus the extension fields `dtx, dty, dlen` the Pose
  shape has no slots for). `composePose` (index.js:85) composes two deltas — offsets and rotation add, scales multiply —
  and is explicitly **not** a transform composition: a rotated parent does not rotate its child's offset. §6 leans on
  both facts.
- **Phrases do not exist yet.** `MOTION_FAMILIES` is `kineme | gait | linkage | driver | transport` (index.js:35); no
  `phrase:` source is registered on main, and #2118 (P6) is still open. §2 specifies the `phrase:<id>` string and its
  slot in the design; a figure that uses one poses only once P6 registers the sources. The epic's order (P6 before P7)
  already sequences this.
- **Constructs do not exist yet either.** #2108 (the constructs spec) is still open and unwritten. What exists is the
  machinery a construct — and therefore a mobile — is assembled from: ATTACH points on an asset (`engine/assetAttach.js`,
  at most 4, roles plain / H / L), `assembleCreature` (`engine/creatureAssembler.js:114`) producing a deterministic
  record, and `creatureTile` (creatureAssembler.js:770) baking a tile: the body asset's drawing via `creatureTileSvg`
  (creatureRig.js:72), the bones riding as data in an ordinary overlay record `{ category: 'creature', source: 'wetlab',
rig }`.

## 2. Per-bone source (the issue's §1)

A bone may carry one new field:

```js
bone.motion = { source: 'gait' | 'linkage' | 'kineme:<id>' | 'phrase:<id>', amount?: number }
```

- **`'gait'`** → the figure's gait source. The concrete source is `gait:<FACE>`, chosen at pose time by Lois's face
  through `gaitFor(face)` — exactly how the whole rig's gait is chosen today. A bone never names a face; Lois does.
- **`'linkage'`** → `linkage:jansen`. Meaningful only on a linkage figure (§6); on a tree figure the sanitizer drops it.
- **`'kineme:<id>'`** → the registered kineme source of that id — singles and P5 stacks alike (`rock` and `rock+bob` are
  both just ids to `kinemeSources`). The sanitizer validates the id against the library (`KINEMES`, `KINEME_STACKS` in
  `data/kinemes.js`) and drops an unknown one, the way `sanitizeRegionKinemes` already proves a region's id exists.
- **`'phrase:<id>'`** → P6's source, when it registers. The sanitizer can only check the string's syntax until P6 defines
  the phrase namespace; the string is valid in a record from the day this lands, and the pose waits for P6.
- **`amount`** (optional, default 1) multiplies the bone's **local** delta (§6). `amount = 0` holds the bone at its rest
  pose while its children still compose from it. The sanitizer clamps it to `[0, 2]` (§11 #3).
- **Absent is native, and native is today.** A tree bone with no `motion` is gait-driven; a bar with no `motion` is
  linkage-driven. Every record that exists today has no `motion` anywhere, so the absent path must be the only path those
  records ever take (§9's parity suites are the proof).
- **Where it is authored, where it is baked.** The artist-facing record carries a **`motion` map** keyed by bone id
  (tree figures) or bar name (linkage figures): `motion: { h: { source: 'kineme:rock' } }`. `buildRig` copies the map
  onto the bones it builds; the beast tile bake keeps it as `rig.motion` (a linkage has no baked bone records to hang
  the field on). `sanitizeRig` validates the baked form: the source string against
  `^(gait|linkage|kineme:[a-z0-9][a-z0-9+_-]*|phrase:[a-z0-9][a-z0-9+_-]*)$`, kineme ids against the library, the source
  against the figure's skeleton (a `'gait'` on a linkage figure or a `'linkage'` on a tree figure → dropped), `amount`
  finite → clamped. **An invalid entry is dropped, never the rig** — the bone falls back to absent, the same way
  `sanitizeRig` drops a malformed bone and keeps the rest.
- **The node a bone is evaluated as.** `node.key` is the bone id; `node.phase01` is
  `kinemePhase(seedOffset, '<tile key>#<bone id>')` — the same hash, the same key the part instance itself receives at
  sceneContract.js:775, so a bone and its own part, given the same kineme, move in step, and two copies of one figure
  desync exactly as much as their parts do. The anchor-law consequence, stated plainly: library kinemes are phased
  cycles, so a kineme-driven bone is at rest at t = 0 only at phase 0 — the same exception every instance kineme already
  lives with (§11 #2). Frozen frames never evaluate sources at all (the expansion poses the rest pose directly), so a
  still of a figure is its rest pose regardless.

## 3. Mixed figures (the issue's §2) — two worked records

**(a) An assembled creature whose head rocks on a kineme while Lois's gait drives the legs.** The authoring record (the
wet lab's shape — body asset, H and L points, as today) gains one map:

```js
{
  id: 'cr-1a2b3c4d', body: 'geo_circle_01',   // + head / limbs / joints from its ATTACH points, as today
  motion: { h: { source: 'kineme:rock' } },
}
```

`buildRig` bakes bones `h`, `l0.0`, `l0.1`, `l1.0`, `l1.1`, …; only `h` carries `motion`. At pose time the legs take the
native pass (§6) under whichever gait Lois's face names; the head bone's local rotation is `kineme:rock`'s `dRot` (±18°
over 2.4 s, the library's `rock`) about its joint, and its part rides the posed bone as today. Davis still deals the
head's part; the part's own asset kineme, if any, still applies after (§6's order).

**(b) A walking beast whose upper bars carry kineme-driven ornaments.** The linkage figure's map is keyed by bar name:

```js
rig: {
  body: '', linkage: { measures: { /* … */ }, phase: 0 },
  motion: { frame: { source: 'kineme:bob' } },
}
```

`frame` is the top bar (O–G; `BEAST_BARS`, beastBuilder.js:72). The linkage still solves and poses every bar (§6: a bar's
source never re-solves the skeleton); `kineme:bob`'s delta (±6 units over 3 s) applies to the **part** dealt onto the
frame bar, in the bar's frame, once per bar name — every leg's frame part bobs in step, because the deal and the delta
are both per name.

## 4. The mobile (the issue's §3)

A **figure with no gait and no linkage**: a hanging, Calder-style structure where every joint is a kineme or a phrase.
It is the moving version of a construct (#2108): where a construct joins primitives at ATTACH points and bakes them into
one still tile, a mobile keeps the joints and lets each one move.

- **Record.** A wet-lab overlay record in the creature family — `{ category: 'creature', source: 'wetlab', rig }` —
  whose rig carries `figure: 'mobile'` (§11 #6) and a `body` naming the **hub** asset, the anchor mark the structure
  hangs from; the tile draws it, exactly as a creature tile draws its body. Its bones are authored directly — there is
  no `buildRig` derivation, because there are no H/L points to derive from: each bone is
  `{ id, role, chain, parent, x, y, angle, len, motion }` in the rig's existing shape. Roots sit on the hub (their `x, y`
  are the hang points, in the tile box); children hang from their parent's tip. Rest angles are the authored hang — the
  builder points them down and out from the hub, and the record is the truth, as it is for rigs.
- **Ids and roles.** Bones reuse the rig grammar — chains `l<chain>.<depth>`, role `'limb'` (§11 #5): a hanging bar is
  structurally a limb chain to every consumer downstream (`placePart`, the expansion, the governor), and a new grammar
  would fork all of them for no new meaning. There is no head bone; a mobile has no `h`.
- **Every bone must name a source.** A mobile has no native source to fall back to, so `sanitizeFigure` (below) **drops
  a bone with no valid `motion`** — and its subtree with it, since a child cannot hang from a dropped parent (the
  parents-first rule makes this mechanical). `'gait'` and `'linkage'` are invalid on a mobile and drop the same way. A
  mobile whose bones all drop is null, like a rig with no valid bones.
- **Sanitizer.** A sibling, `sanitizeFigure`, beside `sanitizeRig` — `sanitizeRig`'s behaviour for every record that
  exists today is untouched, byte for byte; the overlay door calls `sanitizeFigure` when the raw rig carries
  `figure: 'mobile'` and `sanitizeRig` otherwise (§11 #6). It enforces the same bounds as `sanitizeRig` plus the source
  rules of §2 and the must-name-a-source rule above, and slices at the same `MAX_BONES = 12`.
- **Tile bake.** `mobileTile(record, hubAsset)` beside `creatureTile`: the tile's SVG is the hub asset's drawing through
  the same `creatureTileSvg` wrap; the bones ride as data. Parts are dealt onto the bones by Davis from the stage pile,
  exactly as creature parts are — a mobile on a bare stage wears the hub's own shape, the solo fallback the expansion
  already has.
- **Assembly from primitives.** Authoring composes the mobile from the constructs machinery that exists: a hub asset
  plus primitive assets hung at its ATTACH points (plain points are the hang points; H and L keep their creature
  meanings and are not used here). What grammar of primitives each Canon style allows a mobile is the constructs spec's
  question (#2108, unwritten) — this spec assumes any asset the wet lab can pick (§11 #9) and narrows nothing.

## 5. Break-up on a figure (the issue's §4)

Nothing new is needed, and the spec adds no path:

- A part is an ordinary instance (§1), so its regions resolve through `regionAnim` and expand at pack time from **the
  part instance's own final transform** — which already includes the bone's pose for that frame, because the contract is
  rebuilt every frame with the parts posed. A part's regions scatter while the bone still carries it, for the same
  reason a whole mark's regions scatter while the mark moves: the region instance's home is derived from its parent
  instance, not stored.
- The packed break-up vector `a_brk` is computed from the **part's own** centre and box (P4 spec §3), not the figure's —
  a part breaks up in its own frame, then rides the bone.
- Kinds: `scatter` (kind 6) is on main today; `orbit` and `assemble` are #2116's remaining kinds and reach parts when
  they reach marks — parts are not a separate case. The governor's rungs behave as they do for any mark, with one
  figure-specific consequence: `collapsed` drops the parts entirely, so a collapsed figure has no break-up because it
  has no parts (§7).

## 6. Composition order (the issue's §5)

The order is the issue's: **parent bone pose ∘ bone source ∘ part kineme ∘ region kineme.** How the four compose, given
what the code actually does:

1. **Parent bone pose ∘ bone source — `poseFigure`.** Step 3.1 grows `poseFigure(figure, t, ctx)` to read `bone.motion`;
   `ctx` gains the placed copy's `{ face, phase, seedOffset, tileKey }` beside the rig / linkage handles it already
   takes. It returns **posed bones** (joint, tip, angle, len — the shape `placePart` consumes), composed in two passes:
   - **Native pass.** Bones on the figure's native source with `amount` absent or 1, whose ancestors are all
     native-pass, are posed by the native evaluator whole-rig (`poseRig` / `poseLinkage`), exactly as today — ancestry
     included, bit-identical. On a linkage figure every bar is native-pass by construction (below).
   - **Local composition.** Any other bone composes from its parent's posed bone: its joint is its parent's posed tip (a
     root's joint is its rest joint plus its source offset); its angle is its parent's posed angle + its **rest local
     angle** (rest world angle minus the parent's rest world angle) + its source's local `dRot`; its tip follows from
     its length. A source's local delta is: for a kineme / phrase source, the source's own pose (`dRot` about the joint;
     `dx, dy` read in the parent's posed frame); for a native source off the native pass (an `amount ≠ 1`, or a foreign
     ancestor), the local form of the adapter's delta — the adapter returns world deltas, and the local rotation is the
     bone's `dRot` minus its parent's `dRot`, the local offset zero for a child (its joint rides the parent's tip by
     construction) and the joint's own delta for a root. `amount` multiplies the local delta. `composePose` is the
     operator wherever two **deltas** stack (a source over the rest pose); the parent ∘ child step itself is the FK
     placement above, because `composePose` does not rotate a child's offset by its parent — the registry says so, and
     the rig's FK is the authority here.
   - A kineme / phrase source's `sx, sy, dAlpha` do not move the bone (a bone has no scale or opacity of its own): they
     compose onto the bone's **part** placement, after the bone pose — which is where this order puts everything
     part-level anyway.
   - **Linkage figures.** The bars form a solver graph, not a tree — there is no parent chain to compose along, and a
     bar's source never re-solves the linkage. A foreign source on a bar composes onto the bar's **part**: the part's
     placement is `placePart`'s bar placement with the source's delta composed over it (offset in the bar's frame,
     rotation about the bar's centre, scale and alpha on the part). `'linkage'` or absent rides the bar exactly as
     today. The beast still walks; the ornament on the bar moves (§11 #4). The beast's roam is not a bone source and is
     untouched: it still overlays the posed linkage in the expansion, as today.
2. **Part kineme.** Unchanged: the contract's kineme pass (§1) assigns the part instance its own asset's kineme and
   phase after expansion. It composes after the bone because it is a function of the instance the bone produced.
3. **Region kineme.** Unchanged: pack-time expansion from the part instance (§5).

Parity is the contract of the whole design: a figure with no `motion` anywhere takes the native pass for every bone and
never touches local composition, so its posed bones are the native evaluator's output untouched.

## 7. Budgets (the issue's §6)

- **Bones:** `MAX_BONES = 12` per tree figure, mobiles included (the sanitizer slices). A linkage figure is 12 bar names
  - the beam, dealt and — for sources — evaluated **once per name**: a foreign bar source costs one evaluate per figure,
    not per leg. Its instances remain legs × bars + beam + trace, as today, and the governor counts them as it counts
    every part.
- **Bone-source cost:** at most 12 source evaluates per tree figure per frame (one per bone), each the tier-0 arithmetic
  of the existing adapters (`motionCore/rig-adapter`, `motionCore/kineme-adapter` — both already registered at tier 0).
  **No new cost tier.** `poseFigure`'s existing memo (one native pose per figure per t) keeps the native pass at one
  whole-rig evaluation.
- **The GPU kineme table is not involved.** Bone sources are CPU evaluations at contract time; `KINEME_TABLE_MAX = 16`
  (`data/kinemes.js:76`) still serves instance kinemes only — including the parts' own asset kinemes, whose over-cap
  fallback (the part renders still) is unchanged.
- **Region budget on parts:** the existing governor (`regionAnimBudget`), unchanged.
- **What sheds first** — the existing ladder, in its order, with the figure consequences spelled out: (1) region kinemes
  on parts (budget → slot 0; the part renders whole); (2) instance kinemes past the 16-slot table (the part renders
  still — its bone still moves it); (3) the **collapsed** rung (parts dropped: the figure is its body / hub alone, and no
  bone motion exists because no bones are placed); (4) **frozen** / reduced motion (the rest pose; sources are never
  evaluated). Bone sources shed last because they are the cheapest motion in the system — at most 12 CPU evaluates
  against per-instance GPU table work — and the ladder already reaches them only through collapse.

## 8. Who decides (the issue's §7)

Per the ruling, through existing channels only — **no new bus event, no new panel**:

- **Davis picks.** A bone with no recorded `motion` gets its source from Davis at contract time, dealt the way he deals
  parts: a seeded pick keyed on `(seed, the tile's family hand, the bone's hand)` — a chain's bones share a hand, as in
  `dealPart` — over the figure's **source palette**. Every copy of one figure on one stage is dealt the same sources (a
  species look, like its parts); a new stage or a new seed re-deals. The deal is derived where the parts are dealt, in
  the expansion, and is never stored back into the record. **What the palette contains is not ruled** (§11 #1): at its
  conservative default — the native source only — the deal always returns the native source and every figure behaves
  exactly as today.
- **Lois moves.** Lois's face arrives as `doc.loisFace` (the existing channel) and chooses the gait for every
  gait-sourced bone, setting its speed and amount through `LOIS_GAITS`, exactly as she sets the whole rig's today. A
  bone's recorded `amount` multiplies its own delta on top of that; it does not touch the gait table.
- **The artist overrides in the wet lab.** The record's `motion` map is authored there and baked onto the tile; the
  sanitizer is the door. Precedence, highest first: **the record (artist) → Davis's deal → the native default.** An
  override wins over the deal even when the palette widens.
- Davis's mood (`doc.davisMood`) varies his **part** deal today (`varietyFor`); this spec does not extend it to sources
  — that is not ruled, and §11 #1 is where a wider palette would be decided.

## 9. Selfcheck plan for step 3 (in the ruled order)

- **3.1 — `poseFigure` honours `bone.motion`.** Parity: for every fixture rig, a figure with no `motion` anywhere poses
  `Object.is`-equal per bone to `poseRig`, and a linkage figure to `poseLinkage`, over a t sweep including t = 0. One
  foreign bone: the §3(a) rig — the head's composed delta equals `kineme:rock`'s evaluate × `amount`, its native
  siblings bit-identical to the native pose; a native bone under a foreign parent composes locally and its subtree
  follows. `amount = 0` holds a bone at rest with its children composed from it. The sanitizer drops wrong-skeleton and
  unregistered sources and keeps the rig.
- **3.2 — the mobile.** `sanitizeFigure` round-trip: a valid mobile survives; a source-less bone drops with its subtree;
  a mobile with no surviving bones is null. One recorded fixture mobile: a golden tile bake (SVG + rig) and a golden
  expansion (parts dealt, posed at a fixed t; frozen → rest; collapsed → hub alone). Live-canvas QA captures in the PR,
  per the review lane.
- **3.3 — re-pipe `expandCreatureInstances`.** `gl/fixtures/creatureRepipe.*` goldens identical for every existing
  creature and beast fixture; the creature / beast suites (`creatureRig`, `creatureRole`, `beastRig`, `beastRoam`,
  `beastTrace`) unchanged and green; a creature scene's contract hash is what it was before the re-pipe.

## 10. What I measured

Nothing. No code was run, no shader, no live canvas; every claim above is a read of `main` @ `58c7f11e`, and §9 is a
plan, not a result.

## 11. For Matt's ruling (feel, and the open questions — the issue's §8)

1. **Davis's source palette** (open — not ruled): **native only** (recommend for step 3; the deal mechanism lands, the
   deal is a no-op, nothing on stage changes) vs the kinemes the stage is already running vs a palette recorded on the
   figure. Widening it is a later, separate call.
2. **A kineme bone's phase:** the part's own `kinemePhase` (recommend — bone and part in step, copies desync like their
   parts) vs phase 0 (the strict anchor law; copies of a figure sway in lockstep).
3. **`amount` bounds:** clamp `[0, 2]` (recommend). Note the consequence in §6: `amount ≠ 1` takes even a native bone
   off the native pass and composes it locally — parity for existing records is unaffected (they carry no `amount`).
4. **Beast bars:** a foreign source moves the part on the bar, never the skeleton (recommend — the only reading under
   which the beast still walks).
5. **Mobile bone grammar:** reuse `l<chain>.<depth>` + role `'limb'` (recommend) vs a new `m` grammar with its own
   sanitizer rules.
6. **Mobile record marker:** `rig.figure = 'mobile'` with a sibling `sanitizeFigure` (recommend) vs teaching
   `sanitizeRig` a second shape.
7. **A collapsed mobile** is its hub alone (recommend — the ladder's reading of collapse, §7).
8. **Phrases:** `phrase:<id>` is accepted in records as soon as step 3.1 lands; a figure using one poses only once P6
   (#2118) registers the phrase sources. (An ordering fact from the epic — needs his OK, not a choice.)
9. **A mobile's hub** (open): any asset the wet lab can pick (this spec's assumption) vs only the constructs grammar's
   primitives — #2108's spec is unwritten, and when it lands it may narrow this.

Build order after approval, as ruled: `poseFigure` honours `bone.motion`, then the mobile, then the re-pipe. One PR per
step.
