# STAGING REPORT — CULTURE Phase 5, slice B: the moth, flagship citizen, and gait

One slice, one PR. Behind the `cultureDish` gate. Zero live-stage change.

## Shipped
- The moth (second citizen): assembled body plan (head, 3-part spine, 2 wings of 3 segments, 2 antennae of 2; 4 sockets, cap 4, each born occupied, each accepting a declared limb kind), DAVIS recipe, LOIS-gated, cast fresh through the Lab roster door, living in the dish (soil, fields, hand current, drives). Deterministic and hashed. Limb kinds carry a paddle weight and a beat count (dish: 1 and 1, bit for bit slice A).
- Gait as CULTURE's (engine/cultureGait.mjs): rig/creature/beast/glyph adapters on the live gait evaluator (gait.js untouched), construct/asset delegated; QUEEN picks per phrase by Canon style; TASTE -> damp step (-25% a phrase, floor 25%, +25% recovery, locked exempt); LOIS break-up veto (protected = cell under 10% ink, pull-back in sixteenths).
- Fix-forward from slice A QA: loisGate refusal test (sticker, two shapes) and the twin-drift assertion decoupled from the soil. No tolerance weakened.

## Design calls (coordinator-style defaults, unruled)
- Phrase = PHRASE_BARS x 4 beats (the QUEEN's own, pinned to paceLive). Beat clock from the room bpm; no room reading means no assignment (still), consistent with "no audio = still".
- TASTE outranks when more than half the ink (by radius) has left its own footprint; exactly half does not.
- Damp eased over one beat; level in [0.25, 1]; notches 0..3.
- Glyph is root only; beast tree follows the linkage construction (beam root).
- Gait is a pose offset and never writes a body; rides the world hash; dormant on an uncast world.
- The shell's birth cast (useCultureWorld) now includes a moth (loud re-pin, see below).

## Loud re-pins (changed laws)
1. cultureLab roster-aware cast (sheet shape) and group-count label.
2. cultureCitizens limb tips now carry kind weight/beat (dish unchanged numerically).
3. useCultureWorld birth cast sheet = dish + moth.

## Findings
- The "muscle-less twin barely drifts" premise was soil-coupled. Soil-free, an inert body still drifts at about half the swimmer's rate; the assertion was decoupled, not loosened.
- A suite of mine imported the house construct set; constructHouse's importer rule caught it; fixed by a hand-built construct fixture.

## Verification
- Mutations (each applied alone, reverted, all KILLED): damp step .25->.5, floor .25->.1, notch +2, locked exemption removed, ink floor 0, veto removed, loisGate without body faults, socket-cap check removed, occupant-kind check removed, moth wing socket dropped, wing accepting antenna, cast-once guard removed.
- Sweep: sweep-culture-p5b.log, 817 suites; see its tail. A/B against detached origin/main 214d376: rollSafety fails identically (standing); accum passes alone on both (parallel-load flake); constructHouse was mine, fixed.
- Live stage gate off, byte-identical to origin/main: all modes sha256 e853fb6a95dd48123ac40c5a1447b958e9c07145e10bff6a829b13187915a78c; grid x60 2b86ae62...ff7dd8; swarm x60 9a068d05...002c7278; swarm-scatter x60 e7d50793...bbd927d4; serializeProject 9d7d6f7dd7d7f870022a337d1abf110d22516e39cf35038c2b341557497552fd; motion sources 23 (3dba183385f52bd7), cost tiers 56 (d1d2d69ecaa40b64) equal to main. Live gait suites pass unmodified.

## Open question for the coordinator
Confirm the moth stays in the gate's birth cast. Recommendation: keep.

## Slice C carries
Strandbeest (#1863), test drives (#2342-#2344), the live-audio bridge into the room door. Phase 6 owns feeding, predation, breeding, growth.
