# K1 — the resolver seam for a GPU dish fluid

Status: **shipped OFF by default (slices 3a–4c, #2186); rulings below adopted 2026-11-15.** Section 4 records what actually landed and what did not. The text below is the original proposal. Follows K0 (`K0_TAKE_SEMANTICS.md`, ruled 2026-11-15) and K1 stage 1 (#2195: the GPU Gray-Scott kernel exists, wired to nothing, matches the JS kernel to float noise). Wiring it in crosses the K0 R3 decision seam, so this names every reader of the fluid and what each must become. Verified against main by grep, not memory.

## 1. Who reads the fluid today

The fluid steps inside the resolver (`engine/dishFluidStage.mjs`) and publishes `density` (96×54). Three readers:

| # | Reader | What it does with density | Tier today | Under a GPU sim |
|---|---|---|---|---|
| 1 | **Culture births** — `dishFluidCouple.injectFluidBirths`, called from `dishLifeStage` before each generation | Deals dead→alive births from a seeded draw where density > 0.25. The culture is hashed in the take chain. | D (exact, derived) | A discrete decision from a Tier S field. **R3: must be stamped.** |
| 2 | **Bone pull** — `dishFluidPull`, via `creatureRig` / the pose seam | Bends creature/beast joints toward magnets where density at the bone's cell clears the floor. Result is inside the resolver's pose output. | D (the code says "a take replays the pull exactly") | A *continuous* Tier S value feeding resolver output. **R3: must become post-contract, or its inputs stamped.** |
| 3 | **Field body** — the channel from #2178 (`dishFluidChannel`, FIELD_VS) | Seats ~8k marks from the density texture. | P (already presentation) | Reads the GPU texture directly: **no readback, an improvement.** |

The reverse direction (culture level → fluid feed) already exists in the kernel and in stage 1 as a uniform texture; it moves one-frame-late on the same terms as today.

## 2. Proposed seam (each is a ruling)

**S1 — Births (reader 1): stamp the result, not the field.** The GPU density is read back once per published step; `injectFluidBirths` runs on that readback as now, but the **born-cell indices per generation are recorded as a Tier D input** (sparse list, a handful of indices per generation). On replay the recorded births are applied and the density is never consulted. Cost: take bytes ≈ births per generation; the culture chain stays exact everywhere. *Recommend.* Alternative (record a quantized 5 KB density snapshot every published step) is simpler but ~100× the bytes.

**S2 — Bone pull (reader 2): stamp the bone-cell densities.** The pull's only fluid input is density at each bone's cell. Record those few bytes per frame as inputs; the pose seam reads the recorded values, so the resolver stays exact and the *look* follows the live GPU field on the recording device. Alternative: make the pull post-contract (the renderer displaces bones after the contract) — truer to R3's "continuous sim visuals act post-contract" but a larger change in `creatureRig`/the expansion. *Recommend S2-stamp for K1, revisit post-contract later.* I'm less sure of this one than S1; the bone path touches the pose seam, which I have only read, not changed.

**S3 — Field body (reader 3): sample the GPU texture directly.** Delete the pack-and-upload (`packFieldDensity` path) for the GPU case; FIELD_VS reads the sim texture. Zero CPU, zero readback.

**S4 — Readback.** One async `readPixels` into a PBO with a fence, 96×54×RG32F = 41 KB, consumed one frame (or two) late. The system already runs on a one-frame-behind discipline, so this matches today's timing rather than adding latency. The stall cost needs measuring on stage/iPad hardware; I can only prove it on software GL here.

**S5 — Seeding and replay.** The JS `createFluid` seeds the field (hash-derived, exact everywhere) and uploads it; a seek back inside a cycle re-seeds and re-runs from the seed. The JS kernel stays the reference backend (R4) and the player honours the recorded `simBackends`.

## 3. Questions for Matt

1. **S1** — stamp born cells (recommended) or a density snapshot?
2. **S2** — stamp bone-cell densities now (recommended) or move the pull post-contract first?
3. **S4** — OK to take the readback measurement on stage hardware before enabling anything, with the GPU fluid shipping OFF by default like WS3/WS4?

Nothing changes on stage until these are ruled and the wiring PR merges OFF-by-default.

## 4. What shipped (K1 slices 3a–4c)

Rulings: S1 stamp born cells, S2 stamp bone-cell densities, S3/S4 GPU fluid OFF by default until readback is measured on stage hardware (#2183).

- **S1 as ruled.** `dishLifeStage` records births (`recordBirths` / `birthLog`) and replays them (`replayBirths`); step order is replay, then record, then live injection. Replay needs no fluid.
- **S2 refined.** Instead of bone-cell bytes, the recorded input is the whole sparse field: `input.dishFluidCells` = `{step, idx:Uint16Array, q:Uint8Array}`, cells above the 0.25 birth floor at 8 bits (`engine/dishFluidCells.mjs`). Births, the plan density and the bone pull all read it, so live == replay through the JSON input log. Matches `FLUID_BIRTH_FLOOR` / `MATTER_DENSITY_FLOOR`, so nothing below the floor can matter.
- **Seam.** `dishFluidStage.apply` accepts `ctx.external = {step, density}` and skips the JS step/seek; `liveResolve` unpacks cells once per distinct object. Malformed cells are inert.
- **Host.** `gl/gpuFluidHost.mjs` steps the GPU kernel to the stamp's step, reads density back through a PBO + fence (newest completed read, discarded across a reseed), and `liveLoop` packs and feeds it. Gated by `window.__KC_GPU_FLUID` (OFF); any failure flips the flag off and the JS fluid resumes.
- **Stamp.** A take containing `dishFluidCells` stamps `simBackends.fluid = gpu.gs.v1` (`simLaw` decisions-exact). `gpu.gs.v1` is runnable on replay because replay uses the recorded field, not a GPU. JS stays the reference (R4).

Not done: **S3** (the field body still reads the packed density, not the sim texture directly) and the **stage-hardware readback measurement** (#2183, Matt). Until that is measured the flag stays OFF.
