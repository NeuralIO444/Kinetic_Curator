# Hierarchical asset composition ("biologies from parts") — research
2026-10-08 · for KC-1 · homage only: techniques fair game, no one's code/art ships

## The problem in one line
KC-1 places a flat list of independent marks. There is no way to say "this wing belongs to that body, so when the body turns the wing turns too." Everything Matt wants — moths from scales, plants from segments, creatures from parts — needs parent-child hierarchy.

## 1. Scene graphs: the composition law
Every game engine does hierarchy the same way: a child's world transform is its parent's world transform composed with its own local transform.

- `World(child) = World(parent) × Local(child)` — matrices multiply root-to-leaf.
- In 2D we don't need matrices at all. A transform is just (position, rotation, scale), and composition is arithmetic:
  - world position = parent position + rotate(parent rotation) applied to (parent scale × (anchor + local offset))
  - world rotation = parent rotation + local rotation
  - world scale = parent scale × local scale
- Moving a parent moves its whole subtree for free. This is the entire trick, and it's about ten lines of arithmetic per item.

Sources: scene-graph transform composition is documented identically across engine writeups — e.g. https://github.com/tommyradan/alphaengine/blob/HEAD/docs/scene_graph.md ("`transform.get_world_matrix()` composes `parent.world * local` up the chain") and https://github.com/kotoba-lang/scene-graph ("composing each entity's local transform matrix with its parent's already-computed world matrix").

**Maps to KC-1:** items already carry exactly (x, y, scale, rotation). The hierarchy pass computes composed values with the same fields — the renderer never learns hierarchy exists. Flat instances in, flat instances out.

## 2. Spore: parts with degrees of freedom, animation derived from structure
Spore's creature creator is the closest thing to what Matt described. The mechanisms worth stealing:

- **Rigblocks**: hand-crafted body parts that snap onto a creature, each with defined degrees of freedom — scale, stretch, transform in pre-defined ways. Parts are *assets with attachment behavior*, not meshes.
- **Metaballs**: the body/limb masses defined by math functions that merge when close — the continuous counterpart to discrete parts.
- **Procedural animation from structure**: the game generates walk cycles, eating, fighting from the creature's assembled skeleton. Nobody hand-animates a seven-legged creature; the animation *derives* from what got attached.
- **Tiny data**: a creature is defined in ~1KB — parts + transforms + parameters, not geometry. (GameSpy, "Will Wright Presents Spore," http://www.gamespy.com/articles/595/595975p3.html ; rDrama technical breakdown, https://rdrama.net/h/vidya/post/278987/how-will-you-create-the-universe/6596007)

**Maps to KC-1:** our "rigblocks" are the asset drawer parts with named anchors (attach points). Our "~1KB creature" is the biology recipe: root asset + child descriptors, a few dozen lines of data. We steal the *part-attachment* idea, not the procedural locomotion — that's out of scope for v1 (see §6).

## 3. Parametric L-systems: productions that instantiate geometry
Lindenmayer/Prusinkiewicz L-systems are usually taught as turtle-graphics lines. The grown-up version — parametric L-systems with modules — is different: the string rewrite produces *modules with parameters*, and each module is geometrically interpreted as an instanced piece of geometry (a leaf mesh, a petal, a segment with length/angle/width).

- A production like `B(s) → ...` carries real values; the turtle interpretation step turns modules into placed geometry, not just line segments. (Prusinkiewicz, *The Algorithmic Beauty of Plants*; the parametric-turtle summary at https://www.cs.swarthmore.edu/~adanner/cs40/docs/l-sys.sig95.pdf)
- Production systems like L-Studio/VLab and PlantGL (https://inria.hal.science/hal-00850782/document) treat the plant as bracketed-string rewriting where brackets are literally the parent-child stack — `[` pushes a child context, `]` pops back to the parent.
- The hair-on-plants work (Fuhrer et al., https://algorithmicbotany.org/papers/modeling-hairy-plants.pdf) shows modules controlling per-instance properties (length, curl, density) along a structure — the direct ancestor of "scales scattered on a wing."

**Maps to KC-1:** our existing `lsystem` sampler already walks the turtle and tracks branch depth. The upgrade is one conceptual step: each `F` instantiates a *part* (asset chosen by depth: trunk → twig → leaf) instead of emitting a *point*, and the `[`/`]` stack becomes the parent stack. The tested walk code is reused untouched.

## 4. No Man's Sky: blueprints as guardrails on randomness
Hello Games' creature system mixes random parts from a library, then auto-adjusts the skeleton so the result is believable (a tiny body can't carry a giant head — weight/skeleton balancing). The key invention is the **silhouette/blueprint**: a fish blueprint constrains part selection so the result reads as *fish*, not chaos. Art director Grant Duncan's line: real animal skeletons are template-like; the blueprint is "the basic foundational essence."

- "Procedural generation is gardening" — the algorithm executes a design space the artists defined; pure randomness would be useless. (Lot's Wife / VG247 summaries of Murray's GDC talk: https://lotswife.com.au/infinite-worlds-procedural-generation-in-no-mans-sky/ , https://www.vg247.com/how-hello-games-built-the-no-mans-sky-universe)
- Creature descriptors tag parts (head, limb, fin); assembly pulls from descriptor pools. (Kotaku/3dgamedevblog breakdown: https://kotaku.com/a-look-at-how-no-mans-skys-procedural-generation-works-1787928446)

**Maps to KC-1:** the biology recipe IS the blueprint. A `moth` recipe constrains assembly (body → wings at anchors → scales on wings) so every seed still reads as moth. Randomness lives *inside* the blueprint (which scale variant, exact scatter), never outside it. This is also the answer to "how do we keep generative biologies from looking like accidents."

## 5. Skeletal/bone hierarchies: the contrast — when hierarchy is overkill
Game skeletons (bones + skinning) solve a different problem: deforming *one continuous mesh* per frame on the GPU. They need bone-weight vertex attributes, per-frame matrix palettes, and skinning shaders.

KC-1 needs none of that. Our marks are independent instances, not one mesh. Composition happens once at placement time on the CPU; the renderer draws flat instances afterward. We want the *hierarchy* (parent→child transforms) without the *rig* (no bones, no skinning, no per-frame matrix updates, no vertex attributes). This is a deliberate simplification and it's why the feature is cheap: ~10 lines of arithmetic per item, zero GPU cost, zero shader changes.

## 6. What to steal vs. what to avoid

Steal:
- Scene-graph composition law (parent × local), in 2D triple arithmetic — the whole mechanism.
- Spore's rigblocks: parts as assets with anchors and transform freedoms; creatures as tiny data (~1KB recipes).
- Parametric L-systems: productions instantiate geometry modules; brackets are the parent stack.
- NMS blueprints: constrain every generative assembly with a named recipe so variation stays inside a readable silhouette.
- Deterministic seeded streams per (parent, child-index) — same discipline as the existing voronoi sampler's own stream.

Avoid:
- Per-frame hierarchy evaluation. Ours is placement-time; the renderer stays flat. (A bone system would be overkill by an order of magnitude.)
- Spore-style procedural locomotion for v1. Motion comes later as hierarchy-aware KINEME drivers reading per-item hierarchy metadata — the items carry `_hier: {depth, anchorId, rootKey}` from day one so that door stays open.
- Baked part geometry. Parts are asset IDs + transforms (per the #1079 lesson: procedural, no baked-texture dependencies).
- Letting children escape the item budget. Hierarchy multiplies items exactly like mirror does — the expansion factor is computed from the recipe *before* placement and the base count is divided down. Same lesson as mirror-XY.
