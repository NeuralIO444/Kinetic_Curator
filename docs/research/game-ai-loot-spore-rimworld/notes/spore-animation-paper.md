# SIGGRAPH 2008: "Real-time Motion Retargeting to Highly Varied User-Created Morphologies" (Hecker, Raabe, Enslow, DeWeese, Maynard, van Prooijen, Maxis/EA)
URL: http://ChrisHecker.com/images/c/cb/Sporeanim-siggraph08.pdf (index fetch, 2026-10-09)
Status: read lines 0-1245 of 1665 (authoring, variants, gaits, IK solver)

## Character model (Sec 1.2)
- Player-built creatures = bodies, meshes, textures. Typically 20-80 bodies.
- Bodies hold position/rotation transforms, bounding boxes, parent-child hierarchy — like bones.
- Bodies carry tags called "capabilities" or "caps" (e.g. grasper for a hand body) that give semantics to the animation system.
- Bodies have standardized "deform curves" (open/close mouths, ears droop, toes bend) so parts respond uniformly; deforms are opaque to animation system.
- Character bodies form a directed acyclic graph; a serial chain of spine bodies is the root of the tree. Root body of the tree is chosen by heuristic: max incident leg limbs + position.
- Rest pose = transforms at creation time; no standard T-pose is assumed — assumed "reasonable" (not hyper-extended, not curled in a ball).

## Authoring: Spasm tool + semantic specification (Sec 3)
- Animators pose/key/curve-edit in OpenGL tool "Spasm", like Maya. Animations contain arbitrary channels.
- For each channel, animator tells Spasm WHICH parts to select and WHICH ASPECTS of motion matter (semantic info).
- This builds an invertible function G: specialized pose on a specific character <-> generalized, character-independent space (and back via S = G^-1).
- Selection via context queries: HasGraspers, HasFeet, FrontMost/BackMost/RightMost extent queries, limb modifier (walk up to first spine-capable body ~ clavicle/shoulder/hip), setspace.
- Multiple "branched" animations as last resort (e.g. tool use branched on has-graspers vs uses-mouth); costs content.
- Generalize: motion recorded in morphology-independent form preserving structural relationships + style.

## Playback (Sec 4)
- Runtime: generalized curves specialized via S + "variants" combinatorics -> pose goals -> IK solver.
- "Variants": compute how many ways an animation can play on a character. Game code picks which variant at runtime by arbitrary criteria (e.g. which grasper is closest to fruit, which isn't holding something).
- Sagittal mirroring: animations authored with arbitrary chirality are auto-mirrored at variant generation.
- Variant product: modified cartesian product of selected bodies, with same-side/opposite-side constraints.

## Gait synthesis (Sec 4.2)
- A "leg" = a path through the tree of connected limb segments with a FOOT body at the leaf and a spine segment at the base (= "hip").
- Legs clustered into groups of roughly equal length. Group length ratios approximated by SMALL RATIONAL NUMBERS; ratios set the relative frequency of the gait cycle per group.
- Foot/hip posing: feet in a leg group ordered per unique hip; cyclic foot movements via "duty factor" (fraction of gait cycle foot is on ground) and "step trigger" (offset from cycle start when foot begins its cycle).
- Hips translated/rotated as feet move -> torso motion. Foot flight path controlled by animator-authored arc parameters or graphical editor in normalized space, then scaled by leg length.
- Gait styles: authored speed->gait-parameter mappings for 1-6 feet; styles for >=7 feet generated procedurally. Movement speed interpolates between authored velocity parameter sets. Multiple styles can layer (e.g. 2 short legs running while 4 long legs trot); limp/lumber for special effects.
- No feet: heuristic decides float vs crawl; crawling converts spine bodies into pseudo-feet with inch-worm gait.
- Goal: feet must not slip; leg movement plausible given character translation/rotation.

## Particle IK solver (Sec 4.3)
- Skeleton treated as 3DOF particles + 1DOF length constraints; iterative constraint solver, two-phase: (1) spine, (2) limbs (spine fixed).
- Spine: particles only at IK branch points (where >1 child has IK or limb attaches); interior bodies reconstructed via quintic Hermite spine splines + frame transport. Anti-buckling: compare neighboring spine-constraint angles; if buckled, blend toward root-relative rest pose.
- Length constraints can stretch/compress (soft constraints) for organic feel. Mass values per constraint endpoint = ad-hoc tuning (not physical).
- "Aim preconditioner": limb sub-tree distorted toward goals before constraint iterations -> natural poses; favors rotation at shoulders/hips. Gracful failure: out-of-workspace goals -> reach rather than hyperextend.
- Rejected fancier solvers (CCD, Jacobian, constrained dynamics) as slower and harder to tune; chose simple, ad-hoc-tunable architecture.

## Jiggles — passive secondary animation (Sec 4.4)
- Sub-trees that "don't have IK" (not selected by any animation) get a highly-damped pseudo-physical dynamics simulator ("Jiggles"), based on heuristic flexibility/placement/type. Passive: does not feed back to rest of character; keeps animator motion authoritative while non-keyed parts respond plausibly.

## Testing
- Players "amazed" when their created character comes alive; editor plays animations as soon as player adds feet, mouths, graspers. Animators learn system; build intuition about which motions generalize over weeks.
