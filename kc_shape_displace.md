# Shape displace — design, scope, codebase research

*2026-10-07. Read against `NeuralIO444/Kinetic_Curator` at `09e5000b`. Design note, not a patch. Matt merges.*

Want: a face, creature, or shape displaces the overall animation. The body is the force. The proposed object is a math-layer item with an image slot.

## 1. Verdict

Do not add this as a thirteenth MATH op.

MATH tracks already exist (`type: 'math'`, #1010, closed). They are tone grades on the FX fold: one texture, pure ALU, no history, never inside ACCUM. An image slot is a second texture. #1010's own stop line is "if the build needs anything beyond the existing fold + effect contract, stop and re-spec." Quantize's time-hold was already cut for needing a second texture.

The image slot belongs **on** the MATH track, not **in** the tone catalog. The track already has the grammar (add, hide, solo, opacity, cap 4, `M n` label). The slot is a sibling of `effects`, consumed as a field, not as a fragment shader.

Pixel shove of the finished composite is the wrong read. That is FX `displace`, and it is already shipped. This want is the field moving — shards, flock, mold — around a silhouette.

## 2. What the repo already has

Four displacement-shaped things. None of them is "a picture shoves the agents."

| Path | Where | What it does | Why it is not this |
|---|---|---|---|
| Baked placement warp | `app/src/engine/placement.js` | fBm added into the seed slice when `layoutParams.displacement > 0`. Hashed by `geometrySignature`. | Writing it moves goldens, SNAP, still bytes. Kernel K1. |
| Live warp | `app/src/gl/liveResolve.mjs` | `(fBm3D(ntLive) − fBm3D(nt0)) × displacement`, phase-integrated. Skipped on stills / `slowRender`. | Weather, not a body. One-writer file. |
| FX `displace` | `app/src/fx/fxFilters.js`, `app/src/gl/effects/fxShaders.mjs` | Turbulence → displacement map on the composite. `{scale, seed}`. | Pixel stamp. Non-deterministic (`feTurbulence`). No image input. |
| FEED flow | `app/src/engine/kernel/tracks/feedOps.js` | `lumaToGrad` / `lumaToCurl` from a luma grid. Default op `curl`. | The math we want. Today the luma is last frame's positions, delay-1, not an image slot. |

Related, do not confuse:

- **FIELD patch** (`trackGraph.js`): source points attract/repel target points. Soft well, hop-clamped to 4 px. Agents, not a mask.
- **MOD patch**: agitation writes glow / fade / displace knobs. Not applied on the live hop path yet (`docs/NOISE_AND_LAYERS.md` §2.6).
- **Scent** (`engine/kernel/field/scent.js`): 64×36 diffusion grid. The grid budget to copy.
- **PATTERN tracks** (#1097): content-group, no snapshot, never owns BUILD. Not an adjustment layer.
- **Standing bar** in `docs/NOISE_AND_LAYERS.md` §4: no new panel, no fifth content track, no noise-layer type. A slot on an existing MATH track does not break that. A new track type would.

## 3. MATH contract, quoted so the cut stays honest

From `app/src/fx/mathFilters.js` and #1010:

- Catalog is tone only: gain, lift, contrast, saturate, threshold, quantize, knee, tempTint, vignette, channelMix, hueRotate, levelsFixed.
- Default chain on a new track: GAIN → CONTRAST.
- Every `math: true` op is tier 3, single texture.
- Math ops never sit in the ACCUM echo path. A selfcheck asserts no math kind is referenced from `gl/accum.mjs`.
- Fold order is an invariant (`app/src/state/layerOrder.js`, #1048): every FX before every MATH. Tone grades last. A spatial offset that ran inside that fold would shove pixels after the grade, which is the FX job, and would fight the dither-last rule.
- `MAX_MATH_TRACKS = 4`. Cap is shared with the tape pre-flight (`isTapeFull`).
- Solo of a MATH track hides content and FX and shows the grade over mid-grey. A displace slot must not hijack that solo. Solo stays a tone readout.

So the slot is data on the layer. The tone chain stays the tone chain.

## 4. Proposed object

A MATH track gains an optional `driver`. Empty driver is today's track.

```js
{
  type: 'math',
  effects: [ /* existing tone ops, unchanged */ ],
  driver: {
    image: { id, name },          // slot. empty → pass off
    op: 'push',                   // push | pull | ridge | curl
    amount: 40,                   // px. 0 → identity
    falloff: 0.35,                // reach, 0..1 of the frame
    softness: 1,                  // blur passes before the gradient, 0..3
    threshold: 0.5                // alpha, else luma
  }
}
```

`driver` is not an entry in `MATH_EFFECT_DEFS`. Sanitize it beside `sanitizeMathEffects`, fail closed: unknown op dropped, amount clamped, missing image → null driver.

### Image slot

v1 sources, in order:

1. Dropped still (face photo, creature drawing, glyph). Alpha if present, else luminance vs `threshold`. No recognition model. The shape is the mask.
2. A cast asset rasterized to the same grid. SVG symbols already exist; this is a rasterize step, not a new asset type.

Not v1: a drawn outline, a live camera, a content track used as the mask (that is FEED, and it is delay-1 positions today).

### Ops

Reuse `lumaToFlow` rather than a new gradient. It already returns a float grid of `{dx, dy}`.

| Op | Field | Read |
|---|---|---|
| `push` | `lumaToGrad`, sign out of the body | Shards slide off the silhouette. |
| `pull` | negated grad | Field gathers into the face or creature. |
| `ridge` | grad, multiplied by edge (high gradient, low interior) | Outline shoves. Fill is quiet. Eyes stay a pool only if the mask has holes. |
| `curl` | `lumaToCurl` | Motion braids around the body. Divergence-free. The flock read. |

`amount` 0 returns zero and does not allocate. Hidden MATH track skips the driver the same way it skips the grade.

### Where it applies

Post-geometry offset, same stage as the live warp delta: after `buildPlacements`, before morph. Order and count preserved. Stills and `slowRender` skip it — same gate as warp (`docs/kinetics/fields.md` I3). The seed slice stays the golden.

This is not a fragment pass in `gl/renderer.mjs`. Putting it there would displace the finished picture, including the tone grade, and would need the second texture #1010 refused.

Opacity on the MATH track stays wet/dry for the tone chain. It does not scale the driver. The driver has its own amount. Two knobs, two jobs.

## 5. Invariants

- I1. No `driver`, or `amount` 0, or hidden track → zero offset.
- I2. Length and per-index identity unchanged. The #444 class: an order flip here is a morph-pair bug.
- I3. Still / `slowRender` frame equals the seed slice. Driver not sampled.
- I4. Finite outputs. NaN or empty mask reads as outside.
- I5. Same mask + same params → same vectors. No wall-clock RNG.
- I6. Driver does not write `layoutParams.displacement`, `geometrySignature`, or the tone `effects` array.
- I7. Tone catalog unchanged. `mathShaders.selfcheck` tier-3 pin still holds, because this op is not in it.

## 6. Cost

One 64×36 float grid, same budget as scent. Rebuilt when the image, threshold, or softness changes. Not per frame. Sample is bilinear.

Declare it on the tape. An empty-looking MATH track with a driver is not free — `docs/NOISE_AND_LAYERS.md` §2.5 already says weather tracks must show on the counter. Tier 0, CPU, beside scent. Not a tier-3 fullscreen pass.

## 7. UI

No new panel. The MATH inspector (`app/src/panels/build/MathEffectEditor.jsx`) gains a DRIVER block under the tone chain: slot, op, amount, falloff. Pipeline PROCESS can show a one-line readout (driver name, op, amount) next to EDGE AA. It does not own the slot.

Empty slot reads "no driver — tone only." Amount 0 reads "driver held."

## 8. Conflicts to keep visible

- **#1010 stop line.** A shader op with a second texture is out. The slot dodges that by not being a shader op. If a later pass wants the silhouette visible in the composite, that is a different issue (a stamp), and it belongs on FX.
- **#1048 fold order.** Driver offset runs before the fold, so FX-before-MATH still means the tone grade is last. Do not reorder tracks to "make displace happen after grade."
- **MATH solo.** Solo shows the grade over grey. Driver does not run in that solo, or the grey plate would swim and the readout would lie.
- **One-writer.** `liveResolve.mjs` owns world noise, warp, prune. First PR does not touch it.
- **Goldens.** `EXPECTED_HASH_DISPLACEMENT` must not move. Never inject the mask into `placement.js`.

## 9. Phases

1. **Kernel.** `app/src/engine/kernel/field/shapeDisplace.mjs`. Input: luma or alpha grid + params. Output: per-sample `{dx, dy}` via `lumaToFlow`, plus ridge mask. Selfcheck for I1, I2, I4, I5. No `liveResolve` edit. No layer edit.
2. **Slot data.** `driver` on the MATH layer, sanitizer, project round-trip. Inspector block. Default null. Still no resolve wiring — the slot stores and displays.
3. **Wire.** One-writer follow-up in `liveResolve`: sample the driver after placements, before morph, behind amount 0. Stills gate. Tape line.
4. **Cast raster.** Optional. Dropped still is enough for the face / creature read.

Each phase is its own PR. `Closes` only the issue that phase owns.

## 10. Killed

- A thirteenth tone op named displace.
- Writing the mask into `layoutParams.displacement`.
- Reusing FX `displace` as the body. It has no image input and is outside the determinism contract.
- A new track type, a fifth KC slot, a new panel, a node graph.
- A face-recognition model. The mask is the picture.
- Running the driver inside ACCUM feedback. Same scar as hue rotate: a force in the echo ratchets.

## 11. File map

| File | Role in this cut |
|---|---|
| `app/src/fx/mathFilters.js` | Tone catalog stays. Sanitizer learns `driver` in phase 2, not a new kind. |
| `app/src/panels/build/MathEffectEditor.jsx` | Slot + op + amount. |
| `app/src/state/slices/layersSlice.js` | `type: 'math'` already. `addMathLayer` copies `driver` on duplicate. |
| `app/src/state/layerOrder.js` | Do not touch. FX before MATH stays. |
| `app/src/engine/kernel/tracks/feedOps.js` | `lumaToGrad` / `lumaToCurl` — call, don't fork. |
| `app/src/engine/kernel/field/scent.js` | Grid size precedent (64×36). |
| `app/src/engine/kernel/field/shapeDisplace.mjs` | New. Phase 1. |
| `app/src/gl/liveResolve.mjs` | Phase 3 only. One-writer. |
| `app/src/engine/placement.js` | Untouched. Goldens. |
| `app/src/gl/effects/mathShaders.mjs` | Untouched. No new shader. |
| `docs/KC1_LAYERS.md` §6 | FEED was "sample a picture as the displacement field." This slot is that picture, held on the MATH track. |
| `docs/NOISE_AND_LAYERS.md` §4 | Bar against a noise-layer type. This note does not add one. |
| `docs/kinetics/fields.md` | I3 stills gate, I6 order. Warp extraction (§6) is a neighbor, not a blocker. |

## 12. Acceptance

- Drop a face on a MATH track, op `pull`, amount 40: the live field gathers into the head. Amount 0: the picture you had.
- Op `ridge` on a creature: motion rides the outline, interior is quiet.
- Op `curl`: flock braids around the body, does not sink into the chest.
- Hide the MATH track: offset gone, tone grade gone, zero cost.
- SNAP / still matches the seed slice with the driver armed.
- Tone chain on the same track still grades. Gain −3 darkens the plate; it does not move a shard.
- `npm run selfcheck` green. Tier-3 math pin unchanged. No math kind string added to `accum.mjs`.
