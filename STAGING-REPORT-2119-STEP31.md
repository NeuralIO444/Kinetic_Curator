# STAGING REPORT — #2119 Motion Core P7, step 3.1: `poseFigure` honours `bone.motion`

- **Branch:** `kc-2119-step31` (worktree `~/workspace/kc-2119-step31`), base = main `2f439c44`. Local commit only — no push, no PR (the coordinator publishes).
- **Scope:** step 3.1 ONLY, as reordered by Matt 2026-11-11. The mobile (3.2) and the `expandCreatureInstances` re-pipe (3.3) are NOT in this change.

## 1. Survey verdict — CLEAR, build proceeded

Read in full before building: issue #2119 (body + every comment, incl. the 2026-11-11 rulings, the step-1 result, and the nine §11 rulings of 2026-11-14 with the consolidated summary), and `docs/design/figures-spec.md` (all 307 lines). Every file:line claim re-verified on main `2f439c44`.

**(a) Where `bone.motion` is accepted into records — HERE, in 3.1, in three places** (spec §2: "The record: `bone.motion = { source, amount? }`", and §2's closing paragraph puts validation in "the rig sanitizer"):

1. `buildRig` (authoring path) copies the authoring record's `motion` map (keyed by bone id) onto the built bones it names — only the `source` field plus `amount` when present ride.
2. `sanitizeRig` (the trust boundary / door) validates the baked form: per-bone `motion` on tree rigs; on linkage rigs (which have no baked bone records) the map rides the rig itself as `rig.motion`, keyed by bar name over `LINKAGE_BAR_NAMES` + the beam.
3. `beastTile(measures)` takes no motion input — a beast record's acceptance is the door carrying `rig.motion` through `sanitizeRig`. Nothing to change there.

Validation (`sanitizeBoneMotion`, internal to `creatureRig.js`): the source must match the spec grammar `gait | linkage | kineme:<id> | phrase:<id>` (lowercase id charset); `gait` is lawful only on a tree figure, `linkage` only on a linkage figure; a `kineme:<id>` must name a real library id (singles and P5 stacks — the set is built from `KINEMES` + `KINEME_STACKS` in `data/kinemes.js`, which imports nothing, so there is no import cycle); a `phrase:<id>` is syntax-only lawful (ruling 8). `amount`, when present, must be finite and clamps to [0, 2] (ruling 3). **An invalid entry is dropped, never the rig** — the bone falls back to absent, the spec's own fall-back idiom (§2: a stillbirth "falls back to absent"). Output stays byte-identical for motion-less records: no `motion` key appears anywhere unless a valid entry exists (pinned by the new suite against the legacy 8-field bone shape).

**(b) The Davis DEAL of bone sources does NOT belong to 3.1.** Evidence: spec §8 derives the deal inside the expansion ("the expansion derives, per placed copy: the part assignment … each bone's source (from the stage's running sources…)"), and §9's step-3.1 plan names exactly two deliverables — "poseFigure honours bone.motion through the registry (composePose)" and "Parity selfcheck" — with no deal test. The expansion re-pipe is step 3.3 (§9: "the expansion calls poseFigure; goldens identical"), so the deal (writing `bone.motion` at deal time, seeded, from the stage's running kinemes per ruling Q1) lands with 3.3, where its inputs exist. Mobiles (3.2) carry authored sources, no deal either. **3.1 = pose honour + record acceptance, exactly.**

### Design readings determined from the spec (recorded here, not silently decided)

1. **Grown `poseFigure` returns posed bones**, not the P2b per-bone delta map. §6: "It returns posed bones (the shape placePart consumes)." §9's parity — "poseFigure with no bone.motion is Object.is-equal per bone to poseRig / poseLinkage" — is only satisfiable by posed bones: the P2b header itself documents rest + delta as ulp-lossy (4 of 1710 cells), so deltas cannot be Object.is-equal to a pose. The roam mode is untouched (`{ body: delta }`).
2. **Local composition's rest is the adapter's rest** — `poseRig(rig, 0, gait, phase)`. It is the only reading under which a native bone at amount 1 under a native parent composes to exactly its native pose (the §6 parity consequence), and it matches how the gait source itself defines its delta (`pose(t) − pose(0)` at the same phase).
3. **An unresolvable source falls back to absent, amount disregarded.** §2's fall-back-to-absent idiom plus §8/Q8: a phrase figure "poses only once P6 registers the phrase sources" — until then the entry waits and the bone poses natively. `poseFigure` never throws on a lawful record (the one throw kept is P2b's unknown-gait refusal).
4. **On a linkage figure, `amount` multiplies a foreign bar delta only; a native bar ignores it.** §6: "'linkage' or absent rides the bar exactly as today"; §7 evaluates only foreign bar sources. (On a tree, a native bone at amount ≠ 1 DOES leave the native pass — §6 says so explicitly — and composes locally with its gait delta scaled.)

## 2. The seam as built

**`app/src/engine/motionCore/rigSources.js`** — the registry sources are byte-for-byte P2b's (gaits, `linkage:jansen`, `roam:beast` unchanged); only `poseFigure` grew, plus private helpers:

- `readBoneMotion(motion, nativeSource)` — pose-time read of one baked entry: absent / unparseable / other-skeleton / unregistered (incl. any `phrase:<id>` today) → null (native); the figure's own native → `{ native: true }`; a registered foreign source → resolved through `getMotionSource`.
- `poseTreeFigure` — computes poseRig's pose once. A bone is on the **native pass** when its own entry is absent-or-native at amount exactly 1 AND its parent is on the pass; if every bone is on the pass, poseRig's array is returned untouched. Otherwise each off-pass bone composes in rig order from its parent's posed bone: a child's joint IS its parent's posed tip (assignment, so a source offset never moves a child's joint); its angle = parent's posed angle + its rest local angle + its local delta. A root's joint = rest joint + offset. The local delta: for a kineme source, the source's own evaluate at the part's own phase — node `{ key: boneId, seedOffset, phase01: kinemePhase(seedOffset, tileKey#boneId) }` (ruling 2 / Q2); for a native source off the pass, the adapter's local form of its world delta (own dRot − parent's dRot), via the registered `gait:<FACE>` source. `amount` (pose-time clamped [0, 2]) multiplies the local delta.
- `poseLinkageFigure` — poseLinkage's bars, with a foreign source's delta composed onto the bar itself (ruling 4 / Q4): the delta is evaluated **once per bar name** (spec §7), so every leg's bar of that name bends in step; the linkage is never re-solved. Native/absent bars and unbent bars are poseLinkage's own objects. A stillbirth still returns null, mirroring poseLinkage. The map arrives as `opts.motion` (the rig's baked `rig.motion`).
- `poseFigure(figure, t, opts)` — roam branch unchanged; tree figures dispatch on `figure.bones`, linkages on `figure.measures`. New opts: `face` (Lois's face → `gaitFor` → gait name, for 3.3's caller), `motion`, `seedOffset`, `tileKey`.
- **Registration note for 3.3:** `rigSources.js` deliberately does NOT import `./kinemeSources.js` — `kinemeSources.selfcheck.mjs` pins that the only non-selfcheck file naming kinemeSources is itself. Registration stays the consuming seam's job (the new suite imports it, as the contract's callers will). When 3.3 wires the expansion, that seam must import `./kinemeSources.js` for its side effect, exactly as `figurePose.selfcheck.mjs` does.

**`app/src/engine/creatureRig.js`** — acceptance only: the `KINEMES`/`KINEME_STACKS` import, `sanitizeBoneMotion`, the `buildRig` motion-map bake, and `sanitizeRig`'s two motion branches. `poseRig`, `expandCreatureInstances`, and every other function are untouched.

**New suite `app/src/engine/motionCore/figurePose.selfcheck.mjs`** (13 groups) + one manifest line after the kinemeSources line. `package.json` untouched. Pins: tree parity (2 rigs × all gaits × 2 phases × 5 times, per-field Object.is) and linkage parity (2 linkages × 2 drives × 5 times + crank passthrough + native-only map); the spec §3(a) worked example (kineme:rock head at its part's phase — rest joint, rest + dRot, non-head bones native, amount 2 doubles); a foreign root (kineme:bob) with native children composing locally (child joint === parent tip exactly, local-delta angle law, subtree follows); amount 0 (kineme and native); pose-time amount clamp (5 ≡ 2, −3 ≡ 0); beast bars (one evaluate per name across 8 legs, beam as its own name, rock × amount rotation, native amount ignored, phrase bar native); phrase tree fails safe; the door (buildRig bake, sanitizeRig tree + linkage validation, motion-less byte-shape); the anchor law at phase 0 (t = 0 pose deep-equals rest); determinism.

### Re-pin disclosure — `rigSources.selfcheck.mjs`

Three P2b assertions spoke poseFigure's old delta-map contract and were re-expressed at the grown posed-bones contract (each marked in place): the BURN "moves somewhere" check (now: posed bones differ from rest), the CUT t = 0 zero-delta deepEqual (now: deepEqual to poseRig's rest), and the linkage delta check (now: posed bars differ from rest bars). The unknown-gait throw pin is unchanged. **One guard was re-scoped:** the P2b "kinematic files untouched vs origin/main" git-diff guard dropped `creatureRig.js` from its list — 3.1 legitimately grows that file's acceptance under this issue, so file-identity is no longer the right pin for it; `beastRig.js` and `beastRoam.js` remain pinned, the rigSources import scan is unchanged, and poseRig's behaviour is now pinned more strongly by the figurePose parity suite (Object.is per bone across every gait). No assertion was weakened: the sources this suite exists to pin are untouched, and every re-expressed check still fails if the behaviour regresses.

## 3. Files touched

- `app/src/engine/creatureRig.js` — motion acceptance (import, `sanitizeBoneMotion`, `buildRig` bake, `sanitizeRig` branches).
- `app/src/engine/motionCore/rigSources.js` — grown `poseFigure` (+ helpers, header note). Registry sources unchanged.
- `app/src/engine/motionCore/rigSources.selfcheck.mjs` — re-pins disclosed above.
- `app/src/engine/motionCore/figurePose.selfcheck.mjs` — NEW suite.
- `app/selfcheck.manifest` — one line (the new suite).
- `STAGING-REPORT-2119-STEP31.md` — this report.

Untouched per the ground rules: `liveLoop.mjs`, `liveResolve.mjs`, `particles.js`, `package.json`, all goldens. No new cost tier: bone sources are tier-0 CPU evaluates at contract time (spec §7); poseFigure adds no per-frame or GPU work (it is not yet called by any live path — 3.3 wires that).

## 4. Visible-change verdict

**NONE for existing records.** No record in the tree carries `bone.motion` (the field is new), the deal that will write it lands in 3.3, and for motion-less figures poseFigure returns the native evaluators' output bit-for-bit (parity suite). Behaviour appears only where a record carries `bone.motion`. `poseFigure`'s only caller today is selfchecks.

## 5. Verification evidence

- **New suite:** `figurePose.selfcheck.mjs` — 13/13 groups pass.
- **Decisive neighbours, all green:** `motionCore` (9), `rigSources` (11 ok, incl. the re-pinned guard), `kinemeSources` (9), `creatureRig` (10), `beastRig` (ok), `creatureAssembler` (11), `sceneContract` (exit 0), `replayGate` (ok), `creatureGate` (ok), `allEraGolden` (exit 0 — goldens byte-identical).
- **Source-shape pin sweep:** grepped all selfchecks + `e2e/` for every touched file name (`creatureRig.js`, `rigSources.js`, `figurePose`, `selfcheck.manifest`). No e2e hits. Every selfcheck hit was run: beastRoam, beastTrace, creatureKin, creatureMoods, creatureRole, dishLinks, dishSpin, exposureModel, wetLook — all exit 0. `wetSoak` / `wetWarmup` exited 1 in a targeted run with `page.evaluate: ProgramLinkError: [gl-debug] program link failed: quad` (headless-WebGL sandbox failure) — **proven base-identical**: the same two suites on a clean detached worktree at `2f439c44` fail with the identical signature; both PASS in the full manifest sweep below.
- **Full manifest sweep** (continue-on-error loop over all 681 commands in `app/selfcheck.manifest`): **678 pass, 3 fail** — `swarmWasm`, `rollSafety`, `accum`, the known sandbox-environmental family. **Base-identical proof:** on clean `2f439c44` with the same node_modules, swarmWasm exits 1, rollSafety exits 1, accum aborts (exit 134) — identical to the branch. (The sweep shell itself was OOM-killed by the sandbox after writing its `SWEEP DONE pass=678 fail=8` line — the 5 extra "fails" are the manifest's `#` comment lines my loop naively executed; 681 real commands = 678 + 3.)
- **Lint:** `npm run lint` — 0 errors (11 pre-existing warnings in unrelated files; none in the touched files).
- **Format:** `prettier --check .` with prettier 3.9.10 (the pinned version; the binary was borrowed from the step-1 worktree because this worktree has no install of its own and the shared `~/node_modules` lacks prettier) — "All matched files use Prettier code style!"
- **Build:** `npm run build` — green (`✓ built in 3.95s`). Note: the first attempt failed resolving `@tauri-apps/api` against the shared kc263run install (stale for this base); with the step-1 worktree's install (same base era) the build is green. Not an @resvg signature, and not tree-dependent — no code was changed in response.
- **Determinism / anchor laws:** no `Date.now` / `performance.now` / `Math.random` anywhere added (the rigSources text-scan pin still passes); the anchor law is pinned at phase 0 in the new suite.
- **No pre-existing `bone.motion`:** grepped the tree — no record, fixture, or reader references the field outside this change (the `motion:` hits in `src/data/canon/` are the Canon's unrelated vocabulary).
