# STAGING REPORT — Motion Core P7, step 3.3: the re-pipe + the Davis source deal (#2119)

**Branch:** `kc-2119-step33` (local only — not pushed, no PR; the coordinator publishes after QA)
**Base:** `c9eb09d2` (current main; PR #2179 / step 3.2 merged there)
**Commits:** `c6d784b3` (1/2 — the golden pin, committed before any production change) + the build commit carrying this report (2/2).

Step 3.3 is the last P7 step. It re-pipes `expandCreatureInstances` through step 3.1's `poseFigure`
for tree, linkage and mobile figures, retires step 3.2's stated limitation for placed mobiles, and
implements the Davis source deal of spec §8 **as ruled** (§11 ruling 1, comment 6887439992: the
palette is the kinemes the stage is already running).

---

## 1. What was built

**The pin (commit 1, before the change).** `app/src/gl/creatureRepipe.selfcheck.mjs` +
`app/src/gl/fixtures/creatureRepipe.expansions.json` (~201 KB), generated from pre-re-pipe code by
the suite's own EMIT mode, so generator and checker cannot drift. Scenarios: golden expansions for
every existing creature/beast fixture (the assembled creature of `creatureRig.selfcheck`'s record —
org_blob_01 body, H + 2 L points + knee point, seed 1851; figurePartKineme's founder tile; the
wild-type beast of `beastRig.selfcheck`) across live t, frozen, variety-mood, roam-off and bare
variants, plus a creature scene's contract hash (sha256 of `serializeSceneContract`, seed 7,
creature + beast + two marks, no kineme assignments). Manifest +1 line (683 → 684 suites);
`package.json` untouched.

**The re-pipe (`app/src/engine/creatureRig.js`, `app/src/gl/sceneContract.js`).**
`expandCreatureInstances` gains two opts, both handed in by the scene-contract seam:

- `poseFigure` — when present, all three figure kinds pose through it: tree/mobile via an
  *effective rig* (below), linkage via `poseFigure(linkage, t, { drive: 1, crank, motion, … })`
  with roam, crank and the heading transform composed around it exactly as before. When absent,
  the expansion calls `poseRig` / `poseLinkage` exactly as it always has.
- `sourcePalette` — Davis's palette for the deal (below), resolved by the seam; null/empty deals
  nothing.

**The Davis deal (§8 as ruled).** New exported `dealBoneSource(palette, seed, hand, boneHand)`:
`palette[floor(u01('davis-motion|<seed>|<hand>|<boneHand>') × len) % len]`, null on an empty
palette. Bone hands follow the part deal's grammar: head → `'h'`, a limb chain → `'l<chain>'` (a
whole chain takes one source), a linkage bar → its bar name (beam included, matching the
sanitizer's motion-map domain). `effectiveFigureRig` / `effectiveLinkageMotion` build the posed
figure: recorded motion always wins (precedence record → deal → native); dealt entries are
`{ source }` only; copies are built only when something actually changes, and the record's rig is
never mutated — the deal is derived in the expansion and never stored back. Under `frozen`, the
effective figure carries **no** motion at all: sources are never evaluated on a frozen frame (§7's
shed ladder), which is load-bearing, not cosmetic — a phased kineme at t = 0 is not at rest (the
anchor-law exception), so merely posing at t = 0 would not give a frozen figure its rest pose.

**The palette (seam, §11 ruling 1).** The union of the kineme ids the stage is already running,
resolved per contract build from the placed instances: each instance's own asset kineme
(`sanitizeAssetKineme(doc.assetKineme)` + `getAssetKineme`, singles and stacks) and each distinct
placed asset's region assignment (`regionAssignmentFor` against `doc.regionKinemes` + the overlay
record) — sorted, mapped to `kineme:<id>`. Layer spin is excluded: its ids are synthetic
per-variant records (`rotate-spin@<rev>@<variant>`), not library sources a bone can name.

**LOIS.** Nothing new needed wiring: step 3.1's `poseFigure` already resolves Lois's face through
its own `gaitFor` read (`gaitNameOf(opts)`), and the expansion passes `doc.loisFace` through as
`opts.face` on the tree/mobile path. The re-pipe keeps the legacy `gaitFor(face)` for the fallback
path. The new suite pins both halves of the law (see §4).

**The new suite** (`creatureRepipe.selfcheck`, 13 groups): the goldens byte-identical through the
legacy call shape **and** through `poseFigure`; the contract hash identical; the dealer unit
(determinism, palette membership, spread over seeds); deal determinism at expansion with the
record provably unmutated; precedence (a recorded `kineme:rock` head and a recorded gait root are
byte-identical dealt-or-not, a bare bone is not); LOIS (a gait bone answers the face; a kineme
bone's *delta from its gait-shaped rest* is face-independent); re-deal on new seed (≥ 2 signatures
over seeds 1–30) and copy agreement (two instances, same key/seedOffset → identical part
rotations); frozen = rest for dealt and recorded figures; a placed mobile through the seam equals
`poseFigure` from the authored rest (and differs from the legacy gait-posed mobile — the 3.2
limitation, retired); a contract-level deal (an `assetKineme` assignment changes the creature's
parts, deterministically) and contract-level precedence (a fully-recorded figure is identical with
and without a running kineme).

## 2. Survey findings (premise-checks against current main)

- **What 3.1 already wired:** `poseFigure` is complete for all three kinds — tree (native pass
  returns `poseRig`'s own objects; foreign/amount bones compose locally), linkage (a foreign delta
  composes onto the bar itself, per ruling Q4; the native array is returned untouched when no
  foreign delta exists; null stillbirth preserved), mobile (poses from the **authored rest** —
  `poseRig` at t = 0 would bend the hang, measured −26° in 3.2). LOIS was already wired inside it.
  Roam already lived in `expandBeast`. So 3.3's creatureRig work was exactly: effective-rig
  construction + the deal + swapping the two pose calls.
- **Wiring is injection, not import** — two independent reasons. (a) A direct import of
  `motionCore/rigSources.js` into `creatureRig.js` is a TDZ cycle: `rigSources.js` reads
  `LOIS_GAITS` at module top level while importing `poseRig`/`gaitFor`/`LOIS_GAITS` *from*
  `creatureRig.js`; suites entering through `creatureRig.js` first would hit a ReferenceError.
  (b) Two standing import-census scans (below) forbade production importers of the adapters. The
  seam (`sceneContract.js`) therefore imports `poseFigure` + side-effect-imports
  `kinemeSources.js` (registration is the consuming seam's job — step 3.1's staging report
  instructs exactly this) and passes both opts in — the same injection shape as the existing
  `fitOf` opt. Callers that don't pass them (wet-lab preview, cultivate sketch, direct suite
  calls) keep the exact legacy pose calls.
- **Fixture-name collision:** `gl/fixtures/creatureRepipe.kcperf` + `.PROVENANCE.md` already exist
  — they are the **#1694 replay-gate fixture** (`creatureGate.selfcheck` verifies its checkpoints;
  it was not touched and still verifies). The §9 goldens therefore live in a new file,
  `creatureRepipe.expansions.json`, in the same directory.
- **LOIS composition law (measured, not assumed):** a foreign bone composes over the
  **gait-shaped rest** (3.1's composition), so Lois's face legitimately re-bases a figure under a
  kineme bone; the kineme's own delta from that rest is face-independent. The suite asserts the
  delta law.
- **Region defaults are real stage kinemes:** the `creatureRig.selfcheck` stage runs `bend`
  (line_squiggle_03) and `rock`/`pulse` (flora_flower_01) from baked region defaults — see the
  re-pin in §3.
- **Cost tier:** no new tier. The palette is computed once per contract build from the placed
  instances; the deal is a hash per bone hand at contract time; `poseFigure`'s memo stands.
  Nothing was added to any per-frame path. `liveLoop.mjs`, `liveResolve.mjs`, `particles.js`
  untouched, as required.

## 3. Every re-pin, with justification (no assertion weakened)

1. **`creatureAssembler.selfcheck` reader-scan allowlist +1** (`gl/creatureRepipe.selfcheck.mjs`,
   in the pin commit): the scan requires every src file mentioning `creatureRecords`/
   `creatureAssembler` to be allowlisted; the pin suite bakes fixtures through `creatureTile` — a
   test, not a stage reader. The 3.1/3.2 precedent.
2. **`kinemeSources.selfcheck` importer census** re-pinned from "only itself" to exactly
   `['engine/motionCore/kinemeSources.js', 'gl/sceneContract.js']`: the seam is now the one
   production importer, by design (registration is the seam's job). The census stays exact — any
   further importer still fails it. The suite's own header announced this step as the census's
   expiry.
3. **`rigSources.selfcheck` import census** re-pinned to also exclude `gl/sceneContract.js` (the
   seam importing the adapter is the re-pipe itself); the "only selfchecks import the rig adapter"
   invariant becomes "only selfchecks and the contract seam". Same exactness, updated domain.
4. **`creatureRig.selfcheck` 'shed' group — "frozen = the rest pose":** the comparison's live
   t = 0 side previously equalled the rest pose because both sides posed natively. Under ruling 1
   that premise is exactly what 3.3 changes: this stage runs bend/rock/pulse in its flora and
   squiggle region defaults, so a live t = 0 contract now poses the creature's bare bones on dealt
   sources at their phases — not rest (measured: `a#l0.0` rotation 218.156 live vs 210.389 frozen).
   The assertion is unchanged; the comparison contract now tombstones those region defaults off
   (stage, pile and part deal identical), so it still compares frozen against a live t = 0 contract
   whose stage runs nothing. Cause comment written at the assertion, in the suite's standing
   re-pin style.
5. **Development-time correction inside the new suite (not a shipped re-pin):** my first LOIS
   assertion (a kineme bone's absolute pose is face-independent) failed on the true composition
   law in §2; it was rewritten to assert delta-invariance. Recorded here so the change of mind is
   on the record.

## 4. Verification

- **Named suites, post-change:** creatureRig (after re-pin 4), creatureRole, beastRig, beastRoam,
  beastTrace, mobileFigure, figurePose, figurePartKineme, rigSources, kinemeSources,
  creatureAssembler, allEraGolden (byte-identical), creatureGate — all green. New suite 13/13.
- **Full manifest sweep (684 suites), continue-on-error:**
  - **Baseline** (pin-commit tree = base production code, run before any production edit):
    **681 pass / 3 fail** — `swarmWasm` (fails with "build-wasm: cargo not found on PATH": the
    sandbox has no Rust toolchain), `rollSafety`, `accum` (browser-section, sandbox Playwright
    cache churn — the standing environmental class).
  - **Post-change:** **681 pass / 3 fail — the identical three.** No other failure anywhere in
    the manifest. (Sandbox note: the sweep shells were OOM-killed twice by the cell; the
    post-change run was completed in three chunks with persistent logs, all 684 suites accounted
    for.)
- **`npm run lint`:** 0 errors (11 pre-existing warnings, none in touched files).
  **`npm run format:check`:** clean (the new suite file was prettier-formatted; suite re-verified
  13/13 after). **`npm run build`:** green (6.26 s; no @resvg eager-graph failure — the injection
  wiring keeps the Node-only chain out of the entry graph).

## 5. Captures

`captures-2119-step33/` — a dealt creature at t = 0, 0.8 and 1.7 (SVG + PNG), rendered from the
real modules: `buildSceneContract` (palette resolution + expansion through `poseFigure`) for the
marks; `dealBoneSource` + `poseFigure` for the dashed-red skeleton annotation (the product never
draws bones; the annotation is the harness's). The creature is the assembled fixture (no recorded
motion anywhere) on a stage running `rock` (geo_hex_01) and `pulse` (org_petal_01); scene seed 3,
chosen so the three hands split across the palette:

| bone hand | bones | dealt source |
|---|---|---|
| `h` (head) | `h` | `kineme:pulse` |
| `l0` (chain 0) | `l0.0`, `l0.1` | `kineme:rock` |
| `l1` (chain 1) | `l1.0`, `l1.1`, `l1.2` | `kineme:rock` |

Family hand: `user:cr-a2cbeae6`. At t = 0 the parts sit at their phased poses (a dealt kineme bone
is not at rest at t = 0 — the anchor-law exception); the limbs visibly swing between t = 0.8 and
t = 1.7 under rock while the head rides pulse.

## 6. Stated limitations

- **Fallback callers pose natively.** Only the scene-contract seam passes `poseFigure`/palette;
  the wet-lab preview, the cultivate sketch and direct suite calls keep the legacy pose calls and
  never deal. That is the injection design (and what keeps every pre-existing suite byte-stable),
  but it means previews do not show dealt motion.
- **A dealt `scatter` is a still bone.** Bones carry no break-up vector (`brk`), so a bone dealt
  `kineme:scatter` evaluates to a zero delta. Harmless, but Davis can deal a dud when scatter is
  the stage's only running kineme.
- **The palette reads assignments, not the governor's per-frame budget picks.** A kineme assigned
  to a placed asset or region deals even on frames where the region budget would shed it; the
  deal is a property of the stage's assignments, resolved once per contract build.
- **Mobiles are never dealt** — their bones always carry recorded motion (the sanitizer's door
  guarantees it), so the deal has nothing to fill. They do pose through the mobile path now
  (authored rest), which is the 3.2 limitation this step retires.
- **Davis's mood does not extend to sources.** Spec §8 varies his *part* deal by mood; nothing in
  §8 or the rulings extends `variety` to the source deal, so it is not applied there.
