# Asset tab — heading, UVs, channels

Studio surface in the screenshot: ASSETS pool, tags, H/M/L weights, DUP, drop SVG. Planning only. Do not implement instead of #387.

Companions: ENGINE_PLAN (C heading, D mask tint), path/01-body, KC1_LAYERS (MOD/FIELD/FEED), SHELL_BRAND.

## 0. What the tab already is

- Catalog + enable + weight. That is the *casting* desk.
- Draw path: SVG → atlas cell `asset|ink|accent` → textured quad × opacity.
- Rotation today: layout `rotate` range + organism heading with `MAX_TURN_DEG` per frame. `motionSmoothing` unread.
- Color today: baked hex. Spine D will be R=ink G=accent mask.
- PATCH lives on the **track**, not the glyph. An asset cannot MOD another track by itself.

The tab is not a material editor. Making it one is how Studio eats Perform.

## 1. The four ideas, ranked

### A. Orient to motion — **body, not Assets**

Already spine **C**. Heading spring follows `vx,vy`. Asset-tab job is a **face flag**, not a new integrator.

```text
face:  none | velocity | random | layout
```

Default `velocity` for organic/petal/leaf; `none` for dots/stamps. Category can set the default; DUP copy keeps it.

Do not put a heading slider on every tile. One LAYOUT/organism knob (`motionSmoothing`) + per-asset face bit.

TE: one switch. Davis: moths that do not face the wind are paper.

### B. UV scroll — **shader, after D**

Quads already have UVs into an atlas cell. Scroll = instance `uShift, vShift` added in `QUAD_VS`, wrapped inside the cell (not across the atlas — that bleeds neighbors).

Drive from:

- clock (`beatIndex` / `phase`) for a pulse
- speed × heading for "water along the wing"
- FEED sample if the **track** is patched (not the glyph)

Needs spine D's mask atlas so you are scrolling coverage, not a baked hex that fights MIX.

TE: one SCROLL amount on the category or the voice, not 205 tiles. Davis: ACCUM + a slow UV crawl is the HYPE trail trick. Do not invent a second particle.

Cell padding must exist or wrap artifacts show. Baker change = stills hash risk. Live-only first.

### C. Gradient — **already two channels if D lands**

Ink/accent *is* a 2-stop gradient across the glyph if the SVG is authored as R vs G coverage. A third "gradient ramp texture" is a second atlas.

Do this instead:

- Author plates with R=body G=vein / rim (organic row in the screenshot is perfect for that).
- Voice palette supplies the two hexes. MIX lerps them.
- Optional later: instance `rampT` (0..1) to slide the mix along the glyph, clock-slaved.

A full gradient editor in ASSETS is Photoshop. Park.

### D. Multi-channel → MOD / FEED — **split the noun**

Two different objects:

| Object | Channels | Drives |
|--------|----------|--------|
| **Glyph mask** (atlas) | R ink, G accent, (later) B extra, A coverage | How the *pixel* looks |
| **Organism sample** (SoA) | heading, speed, life, scale | What PATCH already reads via track MOD |

Do **not** let a single leaf tile open a PATCH row. MOD/FIELD/FEED stay track-level. The leaf contributes to the track's field because it *is* a particle on that track.

What *is* new and good: bake **B** as a useful extra (emission / thickness / "vein") so FEED or ACCUM optics can sample something other than luminance. That is one extra atlas channel after D is stable — call it **M3**, not "PBR."

H/M/L on the tile is already a channel (pick weight). Do not add metallic/roughness.

## 2. Room review

### Teenage Engineering

The ASSETS tab is a locker. H/M/L and tags are the right density. 205 tiles with UV + heading + gradient + PATCH each is a DAW mixer.

Keep:

- Face: none / velocity (icon on the tile, two states).
- Category default for that flag.
- DUP copies flags.
- Drop SVG stays drop SVG.

Kill: per-tile UV sliders, per-tile MOD target, a material inspector under every blob.

If scroll exists, it is a **voice** or **track** knob (SCROLL 0..1) that all enabled glyphs on that track obey. The locker does not grow a third row of knobs.

### Joshua Davis

The organic set in the shot wants to *behave like plates of an organism*, not like icons. Facing velocity is the difference between a sticker pack and a school of fish.

Two-channel plates (body / vein) plus ACCUM is how HYPE reads as material. UV crawl on a petal is weather, not a texture artist demo — clock or curl, one rate.

Multi-channel that "drives FEED" is the right instinct if it means **the flock's motion is the field**. It is the wrong instinct if it means each SVG publishes a bus. One weather, four tracks. Glyphs are the cast.

Do not author 205 unique materials. Author 12 plates well, tag them, weight them.

## 3. Roadmap (after the spine)

```text
C     heading spring                 (#389)     face-velocity becomes true
D     R/G mask tint                  (#390)     gradient-as-two-inks
M1    face flag on asset def         after C    tile icon + category default
M2    UV shift in QUAD_VS            after D    track/voice SCROLL only
M3    optional B channel             after M2   emission / vein for ACCUM
never per-tile PATCH, PBR stack, gradient editor, hb.wasm
```

Studio uses the locker to pick the cast. Perform never opens this tab.

## 4. Asset def (additive, when M1 ships)

```text
{
  id, tags, weight,           // already
  face: 'none' | 'velocity',  // M1
  // not on the tile:
  // uvSpeed, ramp, modTarget
}
```

Voice / track may set `scrollUv: [u,v] per second` once M2 exists.

## 5. Do not

- Start M1–M3 before C and D.
- Scroll UVs across atlas cell borders.
- Put FEED strength on a leaf.
- A second texture per asset (normal maps, etc.).
- Rename H/M/L — it already works.
