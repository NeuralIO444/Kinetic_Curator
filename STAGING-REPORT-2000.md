# STAGING REPORT — #2000 family wardrobes exclude poem-only stamps

Branch `fix/family-wardrobe-poem-only`, base origin/main 64e9387d.
Builder's record. No push, no PR — the coordinator publishes.

## What the slice does (plain language)

A family voice's wardrobe is a seeded draw of 8 asset stamps. Slice 1
(#1982) let the poem-only kana stamps into that draw's candidate pool,
and slice 2 (#1998) excluded only the kanji half, deliberately: removing
the kana half re-draws the affected wardrobes, a behaviour change of its
own. This slice makes that change on its own, as #2000 rules.

A poem-only stamp in a wardrobe is dead weight on stage: the live pool
excludes those ids even when a voice enables them (`liveResolve.mjs`,
the `POEM_ONLY_IDS` filter), so the voice silently renders on fewer
marks than it wears. Worst case, zurich wore 7 kana of 8 and rendered
on `typ_W` alone.

## The code change (one file: `app/src/data/voiceDeck.js`)

The wardrobe draw (`familyPool`, the module's only consumer of the
asset records) now reads its candidates from `wardrobeRecords` — the
asset records minus the poem-only union (`NATIVE_STAMP_IDS` from
`app/src/poets/placement.js`, kana ∪ kanji, the same set every other
surface excludes by). Concretely:

- New module constant: `wardrobeRecords = records.filter((r) =>
  !NATIVE_STAMP_IDS.has(r.id))`, with a #2000 comment.
- `familyPool`'s candidate line now draws from `wardrobeRecords`; the
  #1998 kanji-only candidate filter (`KANJI_IDS`, built from
  `ASSETS_KANJI`) is removed as subsumed, and its import is replaced by
  the `NATIVE_STAMP_IDS` import. The in-function comment records the
  lineage: #1998 excluded kanji here and left kana on purpose; #2000
  ends that status quo deliberately.
- Nothing else in the function changed: same signature, same seeded
  splice draw (`mkRng(hash('voice:' + id))`), same sort, same n = 8.

Deliberately untouched, as the issue rules:

- The full-catalogue `records` in the same module — only the draw's
  source narrows; a new derived constant carries the narrowing.
- `assetStyle.js`, `assetsWhere`/`assetRecords`, and
  `assetStyle.selfcheck` — the pool semantics they pin are unchanged.
  (Checked in the tree: the selfcheck pins `assetsWhere` behaviour on
  its own records and never calls `familyPool`, which is not exported;
  it passes unchanged, below.)
- Curated voices: flagships are the same objects (the suite's
  byte-identity hash pin holds), promoted voices never call
  `familyPool`. Neither moved.
- The catalogue, every deck, and every census outside the family
  wardrobe draw.

## A correction to the issue's census (measured, stated plainly)

The issue's preamble says 29 of 53 family voices carry kana filler and
names voices (nuba, ostracon, palaver, chantilly, ziggurat, sirocco…)
that **do not exist in the built deck**. Probed against the real
`VOICE_DECK` on clean 64e9387d, the leak is narrower and concentrated:
**6 of 53 voices — the entire swiss family — carrying 32 poem-only
slots**. The issue's headline is exact where it matters: zurich's
wardrobe on base is precisely the 8 ids the issue lists, and its
stage-mark count is 1 of 8 (see the metric note below). The fix the
issue prescribes is unchanged and is what was built; only the blast
radius in the preamble was overstated. (The brief's `familyVoice` /
`makeAssetApi` names likewise do not exist in this file — the family
construction is the `variants` map drawing through `familyPool` over
the module's `assetRecords`. The probes below read the built deck,
which is the ground truth either way.)

## Probe method

Wardrobe = the voice def's truthy asset ids (the same `wear` set
`voiceDeck.selfcheck` §3 computes). Per voice:

- `poem` — wardrobe members in `NATIVE_STAMP_IDS`.
- `path` — wardrobe members whose asset svg contains `<path`.
- `stage` — **non-poem** members whose svg contains `<path`. This is
  the decision-relevant count: poem-only members carry `<path` svgs
  too, so the raw `path` count scores zurich 8/8 on base while the live
  pool refuses every one of those ids. `stage` is what can actually
  stand as marks on an ordinary stage, and it reproduces the issue's
  headline (zurich 1 of 8) mechanically.

The suite's own coverage is the headless render in its §6 (not
importable); the suite was run in full as well, below.

## Probe — BEFORE (clean base 64e9387d)

```
hanami [japanese] wear=8 poem=0 path=3 stage=3 :: org_leaf_01 flora_branch_01 flora_palm_01 flora_sprig_01 flora_clover_01 org_petal_01 rad_radial_01 rad_petals_01
ukiyo [japanese] wear=8 poem=0 path=3 stage=3 :: flora_sprig_02 flora_palm_01 rad_radial_01 flora_sprig_01 org_petal_03 rad_petals_01 flora_flower_01 flora_bud_01
karesansui [japanese] wear=8 poem=0 path=4 stage=4 :: rad_petals_01 org_leaf_01 flora_flower_04 org_petal_03 rad_radial_02 flora_seed_01 flora_starflower_01 rad_radial_01
koi [japanese] wear=8 poem=0 path=3 stage=3 :: flora_flower_01 rad_starburst_01 flora_sprig_02 flora_clover_01 flora_seed_01 flora_sprig_01 flora_flower_02 flora_flower_03
kintsugi [japanese] wear=8 poem=0 path=5 stage=5 :: flora_flower_01 rad_radial_02 flora_vine_01 flora_pinwheel_01 flora_bud_01 flora_seed_01 org_petal_01 org_petal_02
noren [japanese] wear=8 poem=0 path=6 stage=6 :: flora_starflower_01 org_leaf_02 org_leaf_03 org_petal_03 flora_flower_02 rad_radial_02 rad_starburst_01 flora_clover_01
great-wave [japanese] wear=8 poem=0 path=4 stage=4 :: rad_petals_01 flora_palm_01 rad_starburst_01 flora_flower_04 flora_flower_01 rad_radial_02 org_leaf_03 flora_sprig_02
xerox [grunge] wear=8 poem=0 path=1 stage=1 :: scn03 stamp_num_03 stamp_letter_03 scn11 frg03 stamp_glyph_04 stamp_num_04 stamp_label_02
riso [grunge] wear=8 poem=0 path=3 stage=3 :: stamp_num_01 stamp_arrow_01 frg02 scn06 frg12 stamp_num_05 frg08 stamp_letter_02
wheatpaste [grunge] wear=8 poem=0 path=3 stage=3 :: stamp_label_01 stamp_arrow_01 frg10 stamp_glyph_05 stamp_glyph_02 scn04 frg09 frg04
tape-loop [grunge] wear=8 poem=0 path=4 stage=4 :: frg09 stamp_glyph_03 stamp_glyph_01 frg12 frg08 stamp_num_04 frg06 stamp_barcode_01
bootleg [grunge] wear=8 poem=0 path=3 stage=3 :: scn05 frg03 stamp_glyph_03 frg08 stamp_glyph_01 stamp_label_02 stamp_num_02 scn08
stencil-crew [grunge] wear=8 poem=0 path=3 stage=3 :: scn10 stamp_glyph_03 frg02 stamp_label_01 frg11 stamp_num_01 scn04 frg04
fanzine [grunge] wear=8 poem=0 path=3 stage=3 :: scn08 scn06 frg11 stamp_num_05 frg08 stamp_glyph_01 scn11 stamp_label_01
helvetica [swiss] wear=8 poem=4 path=7 stage=3 :: typ_k_sa geo_diamond_03 geo_hex_01 line_cross_01 typ_k_ri typ_k_wo typ_Q typ_h_nu
zurich [swiss] wear=8 poem=7 path=8 stage=1 :: typ_k_po typ_h_to typ_k_za typ_h_shi typ_h_mo typ_W typ_k_xu typ_h_ho
basel [swiss] wear=8 poem=5 path=7 stage=2 :: typ_h_ne typ_G typ_k_xa typ_k_gi line_curl_01 typ_k_xwa line_solid_01 typ_k_nu
plakat [swiss] wear=8 poem=7 path=8 stage=1 :: typ_K typ_k_ho typ_k_ru typ_k_me typ_h_xe typ_h_nu typ_h_o typ_h_be
linear [swiss] wear=8 poem=5 path=7 stage=2 :: typ_k_ge geo_diamond_02 typ_h_ki line_tally_01 geo_diamond_03 typ_h_ta typ_k_bu typ_h_xe
konkret [swiss] wear=8 poem=4 path=7 stage=3 :: typ_D typ_k_ne line_tally_01 typ_h_bu typ_h_zu typ_k_a line_curl_01 geo_hex_02
weimar [bauhaus] wear=8 poem=0 path=8 stage=8 :: rad_pie_01 geo_arc_01 geo_halfcircle_01 geo_concentric_tri_01 geo_tri_03 geo_tri_04 geo_parallelo_01 geo_tri_01
kandinsky [bauhaus] wear=8 poem=0 path=6 stage=6 :: geo_circle_02 rad_pie_01 geo_tri_03 geo_circle_01 geo_halfcircle_01 rad_iris_01 geo_quartercircle_01 geo_tri_04
albers [bauhaus] wear=8 poem=0 path=5 stage=5 :: geo_halfcircle_01 geo_parallelo_01 geo_concentric_tri_01 geo_circle_02 geo_tri_04 geo_tri_03 geo_circle_03 geo_square_03
moholy [bauhaus] wear=8 poem=0 path=5 stage=5 :: geo_parallelo_01 geo_tri_04 geo_tri_01 rad_iris_01 geo_square_03 geo_circle_02 geo_trapezoid_01 geo_circle_01
triadic [bauhaus] wear=8 poem=0 path=6 stage=6 :: geo_circle_01 geo_halfcircle_01 geo_trapezoid_01 geo_square_03 geo_parallelo_01 geo_quartercircle_01 geo_tri_04 geo_tri_03
bayer [bauhaus] wear=8 poem=0 path=6 stage=6 :: geo_parallelo_01 geo_circle_02 geo_tri_01 geo_square_03 geo_halfcircle_01 geo_tri_03 geo_arc_01 geo_trapezoid_01
riley [op] wear=8 poem=0 path=2 stage=2 :: line_hatch_01 rad_rings_02 rad_orbit_01 dot_confetti_02 rad_split_01 rad_target_01 rad_rings_01 rad_orbit_02
vasarely [op] wear=8 poem=0 path=2 stage=2 :: dot_confetti_02 rad_target_01 rad_orbit_dot_01 dot_field_01 rad_rings_01 rad_split_01 rad_rings_03 rad_rings_02
soto [op] wear=8 poem=0 path=2 stage=2 :: dot_confetti_02 rad_orbit_02 line_hatch_01 line_hatch_02 rad_split_01 rad_orbit_dot_01 dot_cluster_01 rad_rings_02
cruz-diez [op] wear=8 poem=0 path=2 stage=2 :: rad_target_01 dot_field_02 rad_rings_03 rad_split_01 rad_rings_02 rad_orbit_02 dot_confetti_02 line_hatch_02
interference [op] wear=8 poem=0 path=2 stage=2 :: rad_orbit_dot_01 line_hatch_01 rad_rings_03 dot_field_01 rad_orbit_02 rad_rings_01 rad_split_01 dot_confetti_02
kinetic-dot [op] wear=8 poem=0 path=1 stage=1 :: rad_orbit_01 dot_cluster_01 rad_orbit_dot_01 dot_confetti_02 dot_field_01 dot_field_02 rad_target_01 rad_rings_02
milano [memphis] wear=8 poem=0 path=6 stage=6 :: geo_star4_01 line_squiggle_03 geo_burst_02 geo_chev_01 dot_single_01 line_arrow_02 line_zigzag_01 dot_field_05
squiggle-room [memphis] wear=8 poem=0 path=5 stage=5 :: dot_field_05 line_squiggle_02 dot_speckle_01 dot_single_01 line_squiggle_03 geo_chev_02 line_loop_01 line_swoosh_02
terrazzo-floor [memphis] wear=8 poem=0 path=6 stage=6 :: line_swoosh_02 line_swoosh_01 dot_field_04 dot_speckle_01 line_spiral_01 geo_burst_02 geo_burst_01 line_scribble_01
carlton [memphis] wear=8 poem=0 path=6 stage=6 :: geo_star5_01 line_loop_01 dot_speckle_01 geo_star8_01 geo_star6_01 line_squiggle_02 line_arrow_02 dot_ring_01
confetti [memphis] wear=8 poem=0 path=3 stage=3 :: dot_field_03 dot_ring_01 geo_burst_01 geo_burst_02 geo_star8_01 dot_speckle_01 dot_field_04 dot_single_01
bel-air [memphis] wear=8 poem=0 path=5 stage=5 :: dot_field_05 line_squiggle_02 dot_ring_01 line_loop_01 line_arrow_02 geo_star8_01 line_swoosh_01 dot_speckle_01
haeckel-plate [engraved] wear=8 poem=0 path=5 stage=5 :: hae_radiolarian_02 hae_medusa_01 hae_kelp_01 hae_pollen_01 hae_tendril_01 hae_diatom_01 hae_nerve_01 hae_fern_01
radiolaria [engraved] wear=8 poem=0 path=6 stage=6 :: hae_diatom_02 hae_nerve_01 hae_sponge_01 hae_medusa_01 hae_plume_01 hae_starfish_01 hae_fern_01 hae_root_01
herbarium [engraved] wear=8 poem=0 path=6 stage=6 :: hae_mycelium_01 hae_pollen_01 hae_ammonite_01 hae_nerve_01 hae_plume_01 hae_ciliate_01 hae_fern_01 hae_diatom_01
copper-reef [engraved] wear=8 poem=0 path=6 stage=6 :: hae_coral_01 hae_ammonite_01 hae_radiolarian_02 hae_medusa_01 hae_flagella_01 hae_nerve_01 hae_pollen_01 hae_plume_01
mycelium [engraved] wear=8 poem=0 path=5 stage=5 :: hae_tendril_01 hae_plume_01 hae_ciliate_01 hae_coral_01 hae_radiolarian_02 hae_diatom_02 hae_radiolarian_01 hae_ammonite_01
plankton [engraved] wear=8 poem=0 path=6 stage=6 :: hae_fern_01 hae_mycelium_01 hae_nerve_01 hae_kelp_01 hae_flagella_01 hae_sponge_01 hae_diatom_02 hae_pollen_01
specimen [engraved] wear=8 poem=0 path=5 stage=5 :: hae_ammonite_01 hae_radiolarian_02 hae_diatom_02 hae_fern_01 hae_flagella_01 hae_pollen_01 hae_siphonophore_01 hae_tendril_01
ochre-hand [marks] wear=8 poem=0 path=8 stage=8 :: mrk_beast_01 mrk_zig_01 mrk_spiral_01 mrk_tally_02 mrk_cross_01 mrk_hand_02 mrk_rain_01 mrk_pit_01
tally-row [marks] wear=8 poem=0 path=7 stage=7 :: mrk_rain_01 mrk_tally_01 mrk_spiral_01 mrk_dots_02 mrk_cross_01 mrk_hand_01 mrk_spear_01 mrk_tally_02
ring-dance [marks] wear=8 poem=0 path=8 stage=8 :: mrk_spear_01 mrk_pit_01 mrk_spiral_01 mrk_rain_01 mrk_hand_01 mrk_zig_01 mrk_tally_01 mrk_hatch_01
dot-chant [marks] wear=8 poem=0 path=8 stage=8 :: mrk_pit_01 mrk_zig_01 mrk_rain_01 mrk_tally_02 mrk_hatch_01 mrk_hand_02 mrk_hand_01 mrk_spiral_01
rain-line [marks] wear=8 poem=0 path=7 stage=7 :: mrk_tally_01 mrk_rain_01 mrk_hand_02 mrk_hatch_01 mrk_pit_01 mrk_cross_01 mrk_dots_02 mrk_beast_01
sun-sign [marks] wear=8 poem=0 path=7 stage=7 :: mrk_dots_02 mrk_tally_01 mrk_zig_01 mrk_beast_01 mrk_spiral_01 mrk_pit_01 mrk_rain_01 mrk_hand_01
spear-sign [marks] wear=8 poem=0 path=7 stage=7 :: mrk_tally_01 mrk_beast_01 mrk_spear_01 mrk_spiral_01 mrk_dots_02 mrk_pit_01 mrk_hand_02 mrk_tally_02
pigment-pit [marks] wear=8 poem=0 path=7 stage=7 :: mrk_dots_02 mrk_hatch_01 mrk_tally_02 mrk_beast_01 mrk_spear_01 mrk_cross_01 mrk_hand_02 mrk_zig_01
voices with poem-only members: 6/53; total poem-only wardrobe slots: 32
zurich wardrobe: typ_k_po typ_h_to typ_k_za typ_h_shi typ_h_mo typ_W typ_k_xu typ_h_ho
zurich stage marks: 1 of 8
```

## Probe — AFTER (this branch)

```
hanami [japanese] wear=8 poem=0 path=3 stage=3 :: org_leaf_01 flora_branch_01 flora_palm_01 flora_sprig_01 flora_clover_01 org_petal_01 rad_radial_01 rad_petals_01
ukiyo [japanese] wear=8 poem=0 path=3 stage=3 :: flora_sprig_02 flora_palm_01 rad_radial_01 flora_sprig_01 org_petal_03 rad_petals_01 flora_flower_01 flora_bud_01
karesansui [japanese] wear=8 poem=0 path=4 stage=4 :: rad_petals_01 org_leaf_01 flora_flower_04 org_petal_03 rad_radial_02 flora_seed_01 flora_starflower_01 rad_radial_01
koi [japanese] wear=8 poem=0 path=3 stage=3 :: flora_flower_01 rad_starburst_01 flora_sprig_02 flora_clover_01 flora_seed_01 flora_sprig_01 flora_flower_02 flora_flower_03
kintsugi [japanese] wear=8 poem=0 path=5 stage=5 :: flora_flower_01 rad_radial_02 flora_vine_01 flora_pinwheel_01 flora_bud_01 flora_seed_01 org_petal_01 org_petal_02
noren [japanese] wear=8 poem=0 path=6 stage=6 :: flora_starflower_01 org_leaf_02 org_leaf_03 org_petal_03 flora_flower_02 rad_radial_02 rad_starburst_01 flora_clover_01
great-wave [japanese] wear=8 poem=0 path=4 stage=4 :: rad_petals_01 flora_palm_01 rad_starburst_01 flora_flower_04 flora_flower_01 rad_radial_02 org_leaf_03 flora_sprig_02
xerox [grunge] wear=8 poem=0 path=1 stage=1 :: scn03 stamp_num_03 stamp_letter_03 scn11 frg03 stamp_glyph_04 stamp_num_04 stamp_label_02
riso [grunge] wear=8 poem=0 path=3 stage=3 :: stamp_num_01 stamp_arrow_01 frg02 scn06 frg12 stamp_num_05 frg08 stamp_letter_02
wheatpaste [grunge] wear=8 poem=0 path=3 stage=3 :: stamp_label_01 stamp_arrow_01 frg10 stamp_glyph_05 stamp_glyph_02 scn04 frg09 frg04
tape-loop [grunge] wear=8 poem=0 path=4 stage=4 :: frg09 stamp_glyph_03 stamp_glyph_01 frg12 frg08 stamp_num_04 frg06 stamp_barcode_01
bootleg [grunge] wear=8 poem=0 path=3 stage=3 :: scn05 frg03 stamp_glyph_03 frg08 stamp_glyph_01 stamp_label_02 stamp_num_02 scn08
stencil-crew [grunge] wear=8 poem=0 path=3 stage=3 :: scn10 stamp_glyph_03 frg02 stamp_label_01 frg11 stamp_num_01 scn04 frg04
fanzine [grunge] wear=8 poem=0 path=3 stage=3 :: scn08 scn06 frg11 stamp_num_05 frg08 stamp_glyph_01 scn11 stamp_label_01
helvetica [swiss] wear=8 poem=0 path=7 stage=7 :: typ_S geo_cross_02 geo_diamond_01 geo_hex_01 typ_R typ_V line_cross_01 typ_3
zurich [swiss] wear=8 poem=0 path=6 stage=6 :: typ_Q typ_7 typ_Z typ_5 line_target_01 line_brackets_01 typ_W line_solid_01
basel [swiss] wear=8 poem=0 path=7 stage=7 :: typ_1 geo_square_02 typ_V typ_I geo_diamond_03 typ_X geo_hex_02 typ_O
plakat [swiss] wear=8 poem=0 path=8 stage=8 :: line_arrow_01 typ_J typ_S typ_M typ_8 typ_1 typ_2 line_curl_01
linear [swiss] wear=8 poem=0 path=7 stage=7 :: typ_I geo_cross_01 line_target_01 geo_hex_02 geo_cross_02 typ_8 typ_F typ_A
konkret [swiss] wear=8 poem=0 path=6 stage=6 :: geo_square_01 typ_O geo_hex_02 line_dash_02 typ_D typ_E geo_diamond_03 geo_cross_02
weimar [bauhaus] wear=8 poem=0 path=8 stage=8 :: rad_pie_01 geo_arc_01 geo_halfcircle_01 geo_concentric_tri_01 geo_tri_03 geo_tri_04 geo_parallelo_01 geo_tri_01
kandinsky [bauhaus] wear=8 poem=0 path=6 stage=6 :: geo_circle_02 rad_pie_01 geo_tri_03 geo_circle_01 geo_halfcircle_01 rad_iris_01 geo_quartercircle_01 geo_tri_04
albers [bauhaus] wear=8 poem=0 path=5 stage=5 :: geo_halfcircle_01 geo_parallelo_01 geo_concentric_tri_01 geo_circle_02 geo_tri_04 geo_tri_03 geo_circle_03 geo_square_03
moholy [bauhaus] wear=8 poem=0 path=5 stage=5 :: geo_parallelo_01 geo_tri_04 geo_tri_01 rad_iris_01 geo_square_03 geo_circle_02 geo_trapezoid_01 geo_circle_01
triadic [bauhaus] wear=8 poem=0 path=6 stage=6 :: geo_circle_01 geo_halfcircle_01 geo_trapezoid_01 geo_square_03 geo_parallelo_01 geo_quartercircle_01 geo_tri_04 geo_tri_03
bayer [bauhaus] wear=8 poem=0 path=6 stage=6 :: geo_parallelo_01 geo_circle_02 geo_tri_01 geo_square_03 geo_halfcircle_01 geo_tri_03 geo_arc_01 geo_trapezoid_01
riley [op] wear=8 poem=0 path=2 stage=2 :: line_hatch_01 rad_rings_02 rad_orbit_01 dot_confetti_02 rad_split_01 rad_target_01 rad_rings_01 rad_orbit_02
vasarely [op] wear=8 poem=0 path=2 stage=2 :: dot_confetti_02 rad_target_01 rad_orbit_dot_01 dot_field_01 rad_rings_01 rad_split_01 rad_rings_03 rad_rings_02
soto [op] wear=8 poem=0 path=2 stage=2 :: dot_confetti_02 rad_orbit_02 line_hatch_01 line_hatch_02 rad_split_01 rad_orbit_dot_01 dot_cluster_01 rad_rings_02
cruz-diez [op] wear=8 poem=0 path=2 stage=2 :: rad_target_01 dot_field_02 rad_rings_03 rad_split_01 rad_rings_02 rad_orbit_02 dot_confetti_02 line_hatch_02
interference [op] wear=8 poem=0 path=2 stage=2 :: rad_orbit_dot_01 line_hatch_01 rad_rings_03 dot_field_01 rad_orbit_02 rad_rings_01 rad_split_01 dot_confetti_02
kinetic-dot [op] wear=8 poem=0 path=1 stage=1 :: rad_orbit_01 dot_cluster_01 rad_orbit_dot_01 dot_confetti_02 dot_field_01 dot_field_02 rad_target_01 rad_rings_02
milano [memphis] wear=8 poem=0 path=6 stage=6 :: geo_star4_01 line_squiggle_03 geo_burst_02 geo_chev_01 dot_single_01 line_arrow_02 line_zigzag_01 dot_field_05
squiggle-room [memphis] wear=8 poem=0 path=5 stage=5 :: dot_field_05 line_squiggle_02 dot_speckle_01 dot_single_01 line_squiggle_03 geo_chev_02 line_loop_01 line_swoosh_02
terrazzo-floor [memphis] wear=8 poem=0 path=6 stage=6 :: line_swoosh_02 line_swoosh_01 dot_field_04 dot_speckle_01 line_spiral_01 geo_burst_02 geo_burst_01 line_scribble_01
carlton [memphis] wear=8 poem=0 path=6 stage=6 :: geo_star5_01 line_loop_01 dot_speckle_01 geo_star8_01 geo_star6_01 line_squiggle_02 line_arrow_02 dot_ring_01
confetti [memphis] wear=8 poem=0 path=3 stage=3 :: dot_field_03 dot_ring_01 geo_burst_01 geo_burst_02 geo_star8_01 dot_speckle_01 dot_field_04 dot_single_01
bel-air [memphis] wear=8 poem=0 path=5 stage=5 :: dot_field_05 line_squiggle_02 dot_ring_01 line_loop_01 line_arrow_02 geo_star8_01 line_swoosh_01 dot_speckle_01
haeckel-plate [engraved] wear=8 poem=0 path=5 stage=5 :: hae_radiolarian_02 hae_medusa_01 hae_kelp_01 hae_pollen_01 hae_tendril_01 hae_diatom_01 hae_nerve_01 hae_fern_01
radiolaria [engraved] wear=8 poem=0 path=6 stage=6 :: hae_diatom_02 hae_nerve_01 hae_sponge_01 hae_medusa_01 hae_plume_01 hae_starfish_01 hae_fern_01 hae_root_01
herbarium [engraved] wear=8 poem=0 path=6 stage=6 :: hae_mycelium_01 hae_pollen_01 hae_ammonite_01 hae_nerve_01 hae_plume_01 hae_ciliate_01 hae_fern_01 hae_diatom_01
copper-reef [engraved] wear=8 poem=0 path=6 stage=6 :: hae_coral_01 hae_ammonite_01 hae_radiolarian_02 hae_medusa_01 hae_flagella_01 hae_nerve_01 hae_pollen_01 hae_plume_01
mycelium [engraved] wear=8 poem=0 path=5 stage=5 :: hae_tendril_01 hae_plume_01 hae_ciliate_01 hae_coral_01 hae_radiolarian_02 hae_diatom_02 hae_radiolarian_01 hae_ammonite_01
plankton [engraved] wear=8 poem=0 path=6 stage=6 :: hae_fern_01 hae_mycelium_01 hae_nerve_01 hae_kelp_01 hae_flagella_01 hae_sponge_01 hae_diatom_02 hae_pollen_01
specimen [engraved] wear=8 poem=0 path=5 stage=5 :: hae_ammonite_01 hae_radiolarian_02 hae_diatom_02 hae_fern_01 hae_flagella_01 hae_pollen_01 hae_siphonophore_01 hae_tendril_01
ochre-hand [marks] wear=8 poem=0 path=8 stage=8 :: mrk_beast_01 mrk_zig_01 mrk_spiral_01 mrk_tally_02 mrk_cross_01 mrk_hand_02 mrk_rain_01 mrk_pit_01
tally-row [marks] wear=8 poem=0 path=7 stage=7 :: mrk_rain_01 mrk_tally_01 mrk_spiral_01 mrk_dots_02 mrk_cross_01 mrk_hand_01 mrk_spear_01 mrk_tally_02
ring-dance [marks] wear=8 poem=0 path=8 stage=8 :: mrk_spear_01 mrk_pit_01 mrk_spiral_01 mrk_rain_01 mrk_hand_01 mrk_zig_01 mrk_tally_01 mrk_hatch_01
dot-chant [marks] wear=8 poem=0 path=8 stage=8 :: mrk_pit_01 mrk_zig_01 mrk_rain_01 mrk_tally_02 mrk_hatch_01 mrk_hand_02 mrk_hand_01 mrk_spiral_01
rain-line [marks] wear=8 poem=0 path=7 stage=7 :: mrk_tally_01 mrk_rain_01 mrk_hand_02 mrk_hatch_01 mrk_pit_01 mrk_cross_01 mrk_dots_02 mrk_beast_01
sun-sign [marks] wear=8 poem=0 path=7 stage=7 :: mrk_dots_02 mrk_tally_01 mrk_zig_01 mrk_beast_01 mrk_spiral_01 mrk_pit_01 mrk_rain_01 mrk_hand_01
spear-sign [marks] wear=8 poem=0 path=7 stage=7 :: mrk_tally_01 mrk_beast_01 mrk_spear_01 mrk_spiral_01 mrk_dots_02 mrk_pit_01 mrk_hand_02 mrk_tally_02
pigment-pit [marks] wear=8 poem=0 path=7 stage=7 :: mrk_dots_02 mrk_hatch_01 mrk_tally_02 mrk_beast_01 mrk_spear_01 mrk_cross_01 mrk_hand_02 mrk_zig_01
voices with poem-only members: 0/53; total poem-only wardrobe slots: 0
zurich wardrobe: typ_Q typ_7 typ_Z typ_5 line_target_01 line_brackets_01 typ_W line_solid_01
zurich stage marks: 6 of 8
```

## Delta, before → after

- **Zero poem-only members in any of the 53 wardrobes** (was 6 voices,
  32 slots). Every changed wardrobe is swiss; the other 47 voices'
  wardrobes are byte-identical before/after (diffed line by line).
- Stage marks (`stage` column) for the six re-drawn voices — every one
  strictly up, none down, anywhere in the deck:

  | voice | poem before | stage before | stage after |
  |---|---|---|---|
  | helvetica | 4 | 3 | 7 |
  | zurich | 7 | 1 | 6 |
  | basel | 5 | 2 | 7 |
  | plakat | 7 | 1 | 8 |
  | linear | 5 | 2 | 7 |
  | konkret | 4 | 3 | 6 |

- **zurich, stated precisely:** 1 → 6 on the `<path` metric, 1 → 8 on
  drawable membership. Its two non-`<path` members are `line_target_01`
  (svg elements: circle, line) and `line_solid_01` (line) — ordinary
  line assets that do draw as marks on stage; they are simply not
  path-based, so the probe's `<path` proxy does not count them. All 8
  of zurich's members are now ordinary stage assets. (konkret's two
  non-`<path` members are the same kind of fact: `geo_square_01`,
  a rect, and `line_dash_02`, a line.) The number is reported as
  measured, not rounded up to the hoped-for 8 on the path metric.

## Re-pins: none

`voiceDeck.selfcheck` pins **no** wardrobe literals or per-voice
counts — its assertions are structural (deck count and kinds, flagship
byte-identity, per-voice shape/category/style truthfulness, the
headless render within tier). It passes unchanged on the re-drawn deck
(§6 included: all 72 voices render in tier). So there was nothing to
re-pin, in voiceDeck or anywhere else; the probe tables above are the
per-voice verification the re-pin discipline exists to force. No
curated-voice assertion moved.

## Verification (builder's runs on the final tree)

Suites run directly by file (`node src/<path>.selfcheck.mjs`):

- `voiceDeck` — **ok** (72 voices: 4 flagship, 15 promoted, 53 family;
  all render in tier). Run twice, including once after a sandbox
  restart, on the identical tree.
- `placement` — **560,366 passed, 0 failed** (the pinned count, exact).
- `goldenPlacement` — **OK, hash
  `e892d112b20d92b6611c0619cb6b6e2bbddb52a179d1c9dc38d3b8185690a9a2`**,
  bit-identical to base.
- `assetStyle` — ok (602 assets) · `chapters` — OK (602) · `regionBake`
  — ok · `assetPool` — ok (panel 313) · `fieldKanji` — all assertions
  passed · `fieldKana` — all assertions passed.
- **No re-pins anywhere** — every suite above passes on its base pins.

Full manifest sweep (continue-on-error loop over all 608 commands in
`app/selfcheck.manifest`): **605 passed / 3 failed**. The three failures
are the known sandbox-environment trio, proven base-identical on clean
64e9387d in a scratch worktree with its own `npm ci` — never by
assertion:

- `swarmWasm` — exit 1 on both trees, identical signature:
  `build-wasm.sh --verify` AssertionError (the checked-in kernel wasm
  does not reproduce bit-for-bit in this sandbox).
- `accum` — exit 134 on both trees, identical signature: V8
  `FATAL ERROR … JavaScript heap out of memory`.
- `rollSafety` — exit 1 on both trees. Both runs pass the identical
  checkpoint sequence (pure helpers, 300 seeded chaos rolls, every
  "why" check) and die at the same next step, the headless-GL parity
  render: base as `page.evaluate: Target crashed` (glDriver), branch
  as `page.evaluate: Error: [gl] framebuffer incomplete` (renderer
  makeTarget) — the two faces of this sandbox's software GL failing in
  the same harness. The suite's subject is FX rolls; nothing in it
  touches voice data.

Sweep note, for the record: the first sweep run was lost mid-run when
the sandbox restarted and wiped /tmp (318 pass / trio-only failures at
the wipe). The sweep was re-run end to end afterward on the final tree
with results on a durable path; the 605/3 accounting above is that
complete re-run, and the decisive suites plus the after-probe were
re-confirmed after the restart as well.

- `format:check` — clean ("All matched files use Prettier code
  style!"). Method note: this worktree's `app/node_modules` is a
  symlink to the kc-accum-a install, which has no prettier package, so
  the check was run in the scratch base worktree's full `npm ci`
  install with this branch's `voiceDeck.js` copied in — the exact file
  content, checked in a complete tree (the rest of `app/` is identical
  to base). The base file was restored afterward.
- Lint — 0 errors, 11 warnings, none in `voiceDeck.js` (the standing
  pre-existing warning profile, same count as #1998).
- e2e: all of `app/e2e/` grepped for `voiceDeck`, `zurich`,
  `wardrobe`, the swiss family-voice ids, and `family` — **no hits**;
  no browser spec pins anything this change moves.

## Live-QA script

1. Deal voices on stage: the six swiss family voices (helvetica,
   zurich, basel, plakat, linear, konkret) now wear only drawable
   marks — zurich in particular should read as a full 8-mark voice,
   not a lone W.
2. Open the ASSETS panel: records still **313**; kana/kanji stamps
   still appear only inside Teijo's native poem deals, never as
   ordinary marks.
3. Every other voice family wears and renders exactly what it did
   before this change (47 of 53 family wardrobes are byte-identical;
   curated voices untouched).
