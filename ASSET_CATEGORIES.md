# KineticCurator Asset Categories

This document describes the visual asset categories used in the KineticCurator system. Categories are used to filter and weight assets during composition generation, enabling different aesthetic modes.

## Core Categories

### `organic`
Flowing, natural shapes with soft edges and curved boundaries.
- **Use in presets:** PRAYSTATION, DRIP FIELD, EYE ARCHIPELAGO, MEINESZ BLOOM
- **Visual traits:** Glyphs, blooms, soft stamps
- **Example assets:** Flowing tendrils, botanical shapes, amoeba-like forms

### `radial`
Circular or center-radiating patterns with symmetrical or concentric structure.
- **Use in presets:** PRAYSTATION, EYE ARCHIPELAGO, MEINESZ BLOOM
- **Visual traits:** Circles, spirals, star bursts, concentric rings
- **Example assets:** Radial grids, iris patterns, sunburst shapes

### `geometric`
Hard-edged, angular, rule-based shapes with straight lines and sharp corners.
- **Use in presets:** KNOT GRID, FUJIMOTO PRISM, HALFTIME GLITCH
- **Visual traits:** Polygons, grids, tessellations, crystalline structures
- **Example assets:** Cubes, tessellating tiles, angular segments

### `linework`
Thin, delicate line-based structures; emphasis on stroke over fill.
- **Use in presets:** DRIP FIELD, KNOT GRID, FUJIMOTO PRISM
- **Visual traits:** Hairlines, vector outlines, skeletal structures
- **Example assets:** Graph patterns, wireframes, hair-thin lattices

### `dots`
Discrete point-based or stippled visual elements.
- **Use in presets:** DRIP FIELD
- **Visual traits:** Small marks, particles, spray effects
- **Example assets:** Dot grids, particle clusters, spray patterns

### `stamps`
Recognizable, solid glyph-like marks that read as distinct objects.
- **Use in presets:** PRAYSTATION, EYE ARCHIPELAGO
- **Visual traits:** Icons, glyphs, pictorial marks
- **Example assets:** Small pictograms, symbolic shapes, badge-like forms

### `floral`
Botanical or flower-inspired organic structures.
- **Use in presets:** KNOT GRID
- **Visual traits:** Petals, branching, leaf patterns
- **Example assets:** Flower silhouettes, leaf arrays, botanical grids

> **Note on experimental categories below.** The current SVG library only ships assets in the seven core categories above. The four experimental categories (`crystalline`, `biosynthetic`, `fragments`, `scanlines`) are referenced by presets but currently fall through to the full asset pool at render time — the visual mood for those presets comes from the parameter tuning (count, scale, palette shift) rather than category-restricted picks. Authoring true assets for these categories is a known follow-up.

## Experimental Categories (Rendah Mag Aesthetic)

### `crystalline`
Prismatic, laser-like geometric structures; sharp, refractive.
- **Use in presets:** FUJIMOTO PRISM, HALFTIME GLITCH
- **Aesthetic origin:** Shohei Fujimoto kinetic laser installations
- **Visual traits:** Angular shards, faceted planes, refraction patterns
- **Example assets:** Prism fragments, laser beam lines, faceted polygons

### `biosynthetic`
Procedurally organic forms that appear grown or evolved; blend of organic and structured.
- **Use in presets:** MEINESZ BLOOM
- **Aesthetic origin:** Lisa Meinesz bio-synthetic sculptures
- **Visual traits:** Hybrid organic/geometric, procedural growth, membrane-like
- **Example assets:** Cellular structures, grown geometries, hybrid membrane forms

### `fragments`
Broken, glitched, or fractured pieces; suggests digital or physical breakage.
- **Use in presets:** HALFTIME GLITCH
- **Aesthetic origin:** DNB/bass music visual language
- **Visual traits:** Shattered edges, digital artifacts, fragmented silhouettes
- **Example assets:** Broken tiles, glitch blocks, fragmented letters

### `scanlines`
Horizontal striations or scan-like patterns; evokes CRT/digital decay.
- **Use in presets:** HALFTIME GLITCH
- **Aesthetic origin:** Halftime drum & bass visual aesthetic
- **Visual traits:** Horizontal lines, screen scan patterns, interlacing
- **Example assets:** Scan grids, interlaced bars, stripe patterns

## Weight & Density Attributes

Each asset also carries complementary metadata:

- **weight:** `light`, `medium`, `heavy` — affects scale bias
- **density:** `sparse`, `medium`, `dense` — affects placement frequency

Example asset definition:
```json
{
  "id": "prism-001",
  "category": "crystalline",
  "weight": "light",
  "density": "sparse",
  "path": "assets/crystalline/prism-001.svg"
}
```

## Preset → Category Mapping

| Preset | Primary Categories | Aesthetic |
|--------|-------------------|-----------|
| **PRAYSTATION** | organic, radial, stamps | Classic glyph bloom |
| **DRIP FIELD** | linework, organic, dots | Loose flowing marks |
| **EYE ARCHIPELAGO** | radial, organic, stamps | Centered cluster |
| **KNOT GRID** | geometric, linework, floral | Tight grid structure |
| **FUJIMOTO PRISM** | geometric, linework, crystalline | Sharp laser scan |
| **MEINESZ BLOOM** | organic, radial, biosynthetic | Grown organic form |
| **HALFTIME GLITCH** | geometric, fragments, scanlines | Digital breakage |
| **BITSHIFTER CHAOS** | geometric, crystalline, fragments | CA + bitwise color mutation |
| **CA GROWTH** | organic, geometric, biosynthetic | Conway-style emergent growth |
| **ORBIT OF INFLUENCE** | radial, organic, stamps | 3 invisible planets, 50 painters with brush sizes (J. Davis 2023) |
| **GHOST RECOIL ABACUS TOTEM** | geometric, fragments, stamps | Layered totem, shader-glitch recoil (NoPattern × J. Davis) |

## Adding New Assets

When adding SVG assets to `KineticCuratorSketch/data/`:

1. Name the file with category prefix: `organic-flow-001.svg`, `crystalline-prism-002.svg`
2. Define it in the asset pool with category, weight, and density
3. Ensure asset fits the category's visual definition
4. Test with presets that include that category

## Color Usage

Categories interact with **palette shifts**:

- **zone:** Cycles colors per placement (works well with `geometric`, `crystalline`)
- **band:** Distributes colors by vertical position (works well with `organic`, `biosynthetic`)
- **split:** Alternates between complementary pairs (works well with `fragments`, `scanlines`)
