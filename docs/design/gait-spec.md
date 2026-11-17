# GAIT — motion records for kineme (spec)

Status: spec. Rulings from Matt, 2026-11-17 (Q1–Q11). Builds after recipes-v3-spec.md slices R0–R2.
Kin: docs/KINEME_SPEC.md (the driver contract), constructs spec (#2108), unification ruling (#2256), K0 take semantics.

## 1. Rulings (Matt, 2026-11-17)
1. **A gait is a portable motion record.** It's named and reusable, and any asset, construct, creature, beast or
   glyph can wear one. Gaits are stored in the project document like construct records (`gaitRecords`), and
   scene recipes reference them.
2. **Addressing is by join-tree depth:** `root`, `inner`, `leaf`. Phase cascades down the joins, so one gait
   gives follow-through and overlapping action.
3. **The field decides when a shape breaks; the gait decides how.** That means release order, scatter style,
   and the return path and easing.
4. **Who picks:** each Canon style ships default gaits as data. The QUEEN picks among them per phrase from the
   audio. DAVIS may mutate a gait into a variant. A user lock wins and survives the Trio.
5. **Constructs draw as live pieces.** Each primitive is a mark with a parent transform down the join tree.
   The governor shed is freeze → pin → collapse to the flat tile, never a pop.
6. **The clock is beats.** Periods, cascade and release count in fractions of a beat. With no audio, a gait runs
   on the kineme loop clock at a default BPM. Gait picks and swaps are recorded take events, so replay is
   identical.
7. **All kinds wear gaits, through one adapter per kind** that maps it to root/inner/leaf: construct joins, the
   creature rig, beast assembly; plain assets and glyphs are root only. Creature pose stays and layers under the
   gait.
8. **Contents:** registered kineme drivers only, with amounts, per depth role, plus structure (cascade, release
   order, scatter, return easing). A new move must land as a registered driver first.
9. **Order:** recipes-v3-spec.md R0–R2, then M1–M5.
10. **Guardrail:** when moving pieces outrank dealt shapes (breaking dealt > pieces > forces), TASTE hands it to
    the QUEEN, who steps the gait's amounts down one capped notch per phrase. LOIS may veto a break-up that
    would kill negative space. Locked gaits are never damped.
11. **Name:** GAIT (`kc-gait/1`, `gaitRecords`). "Recipe" stays reserved for the scene recipe.

## 2. Record

```js
{
  kind: 'kc-gait/1',
  id: 'gait:<fnv64 of canonical JSON>',     // content hash: same gait, same id
  name: 'swiss-tick',
  canon: 'swiss',                            // owning Canon style, or null for user/Davis gaits
  parent: null,                              // gait id when Davis mutated it
  roles: {                                   // every role optional; absent = still
    root:  { drivers: [{ id: 'rock', amount: 0.3 }], transport: { mode: 'still' } },
    inner: { drivers: [{ id: 'pulse', amount: 0.5 }] },
    leaf:  { drivers: [{ id: 'wobble', amount: 0.6 }], rhythm: 'THUMP' },
  },
  cascade: 0.125,                            // beats of phase delay per depth step
  release: { order: 'leaf-first', stagger: 0.25, scatter: 'drift' },   // used only when the field breaks the shape
  rejoin:  { ease: 'outBack', beats: 2, path: 'retrace' },
}
```

- Driver ids must resolve via `getKinemeDriver`. Unknown ids are dropped at sanitize. Amounts are clamped to each
  driver's declared range.
- `scatter` ∈ `drift | burst | follow-flow`. `ease` uses the existing motion-file easings. `path` ∈ `retrace | direct | arc`.
- Amount 0 everywhere = today's render exactly (the KINEME_SPEC hard gate).

## 3. Engine seams
- **Join-tree adapter:** `treeOf(kind, record) → { nodes:[{ id, parent, depth }] }`. `role` = 0 → root,
  max → leaf, else inner. Plain assets and glyphs return one root node.
- **Gait evaluator:** a pure `evaluateGait(soa, gait, tree, beatTime, seed)` writes driver amounts per node
  before `applyKinemeDrivers`. Phase = seed-hash phase + depth × cascade.
- **Break-up:** the field's existing "strong here" signal starts release. The gait supplies order, stagger and
  scatter. The field's exit starts the rejoin with the gait's ease and path.
- **Governor:** gait cost = the sum of its drivers' declared tiers × live piece count. Shed order is the KINEME
  order, with tile collapse as the last step before zero.
- **Take:** `GAIT_ASSIGN { target, gaitId, by: 'queen'|'davis'|'user', locked }` is a recorded event.

## 4. Issues (`queue:now` + model label)

| Slice | Label | Title | Done when |
|---|---|---|---|
| M1 | `model:sonnet` | constructs: draw as live pieces with parent transforms; governor collapses to flat tile | still frame byte-equal to the tile at rest; shed collapses without a pop; cap-ladder respected |
| M2 | `model:sonnet` | gait: `kc-gait/1` record, sanitizer, door/bank, join-tree adapter (constructs + plain assets), `evaluateGait` with beat cascade | selfcheck: same seed+gait → identical per-node amounts; amount 0 = today's render; round-trips in the project doc |
| M3 | `model:sonnet` | gait: Canon default gaits as data + QUEEN picks per phrase + user lock + `GAIT_ASSIGN` take event | replay of a take with Queen swaps is hash-identical; a lock survives the Trio's 32-bar cycle |
| M4 | `model:sonnet` | gait: break-up release order / scatter / rejoin path driven by the field's when | leaf-first release is observable in the replay; pieces rejoin to the exact rest pose |
| M5 | `model:sonnet` | gait: creature rig, beast and glyph adapters | each kind wears one shared gait; creature pose still layers under it |
| M6 | `model:sonnet` | gait: TASTE → QUEEN damp step + LOIS break-up veto, locks exempt | a fixture with pieces outranking dealt shapes damps by one capped step per phrase |
| M7 | `model:haiku` | docs: KINEME_SPEC + TAXONOMY — GAIT entry; "recipe" reserved for scene recipe | docs merged |

recipes-v3-spec.md R1 classes `gaitRecords` as **scene**, so R4 share links carry gaits.

## 5. Open (for later, not blocking M1–M2)
- How many Canon default gaits per style (3 is the suggested starting point: still, idle, performing).
- Whether DAVIS's mutations get banked automatically or only when kept.
