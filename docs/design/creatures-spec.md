# Creatures: the as-built spec (Phases 3 and 4)

**Status:** as built, 2026-10-13. This is the one place that says how a creature gets from "the artist raised a number" to
pixels, and what every number is. It is derived from the code and its checks; where this page and the code disagree, the
code and its selfchecks win and this page is the bug.
**Plans it came from:** [`wet-lab-plan.md`](wet-lab-plan.md) (Phase 3), [`influences-plan.md`](influences-plan.md) (Phase 4).
**Roadmap:** [`../ROADMAP_PETRI_DISH.md`](../ROADMAP_PETRI_DISH.md).

## 1. What a creature is

A **moth**: a body, two wings (the limbs) joined at the body's ATTACH points, and scales (the hands) scattered on each
wing. With a crowded place it grows a second, smaller pair of hind wings. It is built from three existing built-in assets
(`org_pod_02` body, `org_leaf_02` wing, `geo_diamond_01` scale) by `engine/hierarchy.js`, drawn as ordinary marks on the top
content layer, live canvas only (exports and stills carry no pins, so they are byte-identical). The base type never leaves
the set: every value that shapes it is clamped to a hard range.

## 2. The chain, one frame

```
artist: DIRECTORS header "moths 0..4"  ->  store.creatureCount            (saved with the project when > 0)
                                              |
   spawnLive.observeSpawn  (frame tap)  ->  store.dishPins = homes        (the artist never places one)
                                              |
   liveLoop builds the resolver input:  dishPins, dishFormed, dishLimbs, dishTraits, assetAttach
                                              |
   liveResolve.resolveLayers  ->  (placement as usual)  ->  creatures.append(...)   top content layer, drawn last
                                              |
   frame tap, AFTER the resolve:  observeDish, observeFormation (-> formed, limbs, traits for the NEXT frame), observeSpawn
```

Two rules make this replayable:

1. **Every decision rides the next frame's resolver input** (`dishFormed`, `dishLimbs`, `dishTraits`, `dishPins`). The
   resolver is a pure function of its input sequence, so a recorded take replays the same moths; the decisions are in the
   take, not recomputed (`gl/performanceCreatures.selfcheck.mjs` proves it and proves that editing them is caught).
2. **Nothing reads a clock or a random source.** Windows are counted in frames; rolls come from the document's seed streams.

## 3. The modules

| Module | Role | Pure? |
|---|---|---|
| `curator/spawn.js` | Choose homes: the middle region, fertile and crowded, spaced, nearest the centre | yes |
| `curator/spawnLive.js` | Keep homes steady between frames; retry; give up a home that never forms | module state |
| `curator/formation.js` | The rule: fertility above the band's bar AND density above its bar, held 30 frames; the fertility field; the take's record | yes |
| `curator/formationLive.js` | Run the rule, the limbs and Davis's shifts from the frame tap; expose `getFormedPins / getLimbPairs / getPinTraits` | module state |
| `curator/dishPressure.js` | How crowded the dish is around each pin (marks within a radius, excluding creatures' own marks) | yes |
| `curator/limbs.js` | One pair or two, from the crowd, with hysteresis | yes |
| `curator/davisShift.js` | Davis rolls a moth's traits once, at birth, bounded and banded | yes |
| `curator/roomWidth.js` | The room's own `kin_weight` narrows Davis's shifts | yes |
| `engine/creature.js` | Build a moth from traits, limbs, hover and ground; the builder the resolver owns | yes (own ages) |
| `engine/hierarchy.js` | Parent-child assembly into the flat item list, with a depth cap and a global budget | yes |
| `engine/autoAttach.js`, `assetAttach.js` | Attach points from an asset's shape; the artist's edits win | yes |
| `gl/resolveTap.mjs` | The taps and the providers (`setFormedProvider`, `setLimbsProvider`, `setTraitsProvider`) | module state |

## 4. Every number (named constants, tuned from `?debug=stress`)

| Where | Constant | Value |
|---|---|---|
| spawn | middle region | the central 60% of the canvas (`0.2 .. 0.8` each way) |
| spawn | spacing of homes | 0.32 of the shorter side (about one moth's width) |
| spawn | candidate step / margin over the rule's bars | 0.03 of the shorter side / +0.02 |
| spawn | widening stages when too few homes are found | spacing x0.75; region 0.1..0.9; whole dish 0.04..0.96 at x0.6 |
| spawn | retry / patience | every 30 frames / 180 frames unformed, then re-chosen |
| max creatures | the TE four | 4 |
| dish pressure | radius / saturation | 0.12 of the shorter side / 24 marks |
| formation | hold | 30 consecutive frames, then formed until its pin moves or is removed |
| formation | bars (attraction, density) RELAX / NORMAL / TIGHTEN | 0.47, 0.25 / 0.55, 0.40 / 0.61, 0.60 |
| limbs | grow at / after | crowd >= 0.6 / 45 frames |
| limbs | shed at / after | crowd <= 0.3 / 90 frames |
| limbs | most | 2 pairs (four wings) |
| traits | spread, wing size, body size, swatch rank | +-18 deg, 0.8..1.25, 0.85..1.2, rank 0..3 |
| Davis | shift width by band RELAX / NORMAL / TIGHTEN | 1 / 0.65 / 0.35 of each range |
| room | width | `clamp(kin_weight / 1.5, 0.25, 1)`; no room = 1 |
| hover | reach / tilt / breath | 0.06 x DRIFT x shorter side / 12 deg x DRIFT / 0.09 x BREATH (anchored: on the pin at rest) |
| moth | body / wing / scale size | 1.7 / 1.7 / 0.26 (canvas px per asset unit) |
| moth | scales per wing / per hind wing | 10 / 6 |
| moth | wing spread / flap | 58 deg / +-9 deg every 1.7 s of the loop clock |
| moth | hind wings | 0.78 of a fore wing, 122 deg out, 0.45 of the way down the body, beating at 0.7 in counterphase |
| moth | grow in / second pair in or out | 45 frames / 45 frames |
| moth | halo | 1.14 x, in the tile's own colour when a ground dial is on, else the palette's bg |

## 5. What shapes a moth, and by whom

| Shape | Source |
|---|---|
| where it lives | spawn: fertility (the seed's hidden field) and crowd, in the middle first |
| whether it forms | the formation rule, per band |
| pairs of wings | the crowd at its home, over a held run |
| spread, wing size, body size, wing colour | Davis, once, at birth; the band sets the width, the room narrows it, and the Queen's hidden hand nudges the centre toward the last 3 kept moths (8-keep gate, never shown) |
| where the wings join | the body's ATTACH points: the shape's own, or the artist's edits from the wet lab (EDIT) |
| how it sits in the picture | the layer's GROUND / EDGE / SNAP / SHADOW dials, the same functions the marks use |
| how it moves | the layer's living-motion floor (DRIFT, BREATH, KINEME RATE, pause, shed), plus its own wing beat |

## 6. What is honest about it

- A creature is placed only where it can **form** (the same two conditions the rule uses). Fewer qualifying spots means
  fewer creatures: it never puts one where it would sit unformed.
- The bars to form are never relaxed to meet a count.
- Nothing about the Queen appears here: her influence (Phase 4 step 5) is unnamed and unsurfaced.

## 7. Known limits

- **Worker mode** (`?worker=1`, opt-in) carries only `dishPins`: no formation, no creatures, no limbs, no traits. The full
  list of what the worker path lacks is pinned in `gl/resolverInputParity.selfcheck.mjs`.
- A busy middle region overlaps moths a little at a count of 4; scaling them down as the count rises is a possible tune.
- One creature type (the moth). The Queen's "order the four base types at a head" has nothing to order until types 2 to 4 exist.

## 8. The check map

| Behaviour | Check |
|---|---|
| homes: region, spacing, widening, steadiness, patience | `curator/spawn.selfcheck.mjs` |
| homes are plain data, both render paths carry them | `curator/dishPins.selfcheck.mjs` |
| the rule, its record, its replay | `curator/formation.selfcheck.mjs` |
| limbs: thresholds, hysteresis, live tap | `curator/limbs.selfcheck.mjs` |
| Davis's shifts and the room | `curator/davisShift.selfcheck.mjs`, `curator/roomWidth.selfcheck.mjs` |
| the moth: geometry, traits, hover, ground, limbs | `engine/creature.selfcheck.mjs` |
| the whole thing, recorded and replayed | `gl/performanceCreatures.selfcheck.mjs` |
| cost and leak | `gl/resolverProbe.selfcheck.mjs` |
| worker parity | `gl/resolverInputParity.selfcheck.mjs` |
