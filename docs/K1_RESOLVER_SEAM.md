# K1 — the resolver seam for a GPU dish fluid

Status: **proposal for Matt's ruling** (no code). Follows K0 (`K0_TAKE_SEMANTICS.md`, ruled 2026-11-15) and K1 stage 1 (#2195: the GPU Gray-Scott kernel exists, wired to nothing, matches the JS kernel to float noise). Wiring it in crosses the K0 R3 decision seam, so this names every reader of the fluid and what each must become. Verified against main by grep, not memory.

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
