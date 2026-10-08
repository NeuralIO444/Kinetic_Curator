// hitName.js — a setlist hit's name, from its seed (#1124).
//
// The HITS pill shows a name, not hex. 256 words, so two of them cover the whole 4-hex seed space (65,536
// combinations): the pill shows the first word, the hover card the pair. Same seed, same name, every reload,
// nothing stored. The words are plain, deadpan, uppercase and at most six letters (KC-1 DS: deadpan copy).
const WORDS = (
  'EMBER NOIR BLOOM ASH VELVET DRIFT HALO ONYX PALE RUST GLOW MOSS ' +
  'AMBER BRINE CHALK CINDER CLAY CLOUD COBALT CORAL CREST DAWN DUNE DUSK ' +
  'EBONY FERN FLINT FOG FROST GLASS GRAIN GRAVEL HAZE HIVE IVORY JADE ' +
  'KELP LACE LARCH LEAD LINEN LUNAR MARSH MIST NAVY OCHRE OPAL ORBIT ' +
  'PEARL PLUM POLAR QUARTZ RAVEN REED RIDGE RIVER RUBY SABLE SAGE SALT ' +
  'SAND SLATE SMOKE SNOW SOOT STONE STORM TALC TAR TEAL TIDE TIN ' +
  'UMBER VAPOR VINE WAX WHEAT WILLOW WOOL ZINC ARCH ASPEN ATLAS BASALT ' +
  'BEACON BIRCH BLAZE BOG BRASS BREEZE BRICK BROOK CAIRN CANYON CEDAR CLIFF ' +
  'COAL COVE CRYPT CYPRUS DELTA DENIM DIM DOVE DUST EARTH ECHO ELM ' +
  'FABLE FALL FIELD FJORD FLAX FLOE FLUX FOAM FORGE FROND GALE GLEN ' +
  'GLOOM GORSE GROVE GUST HEATH HEDGE HOLLOW HUSK ICE INK IRIS IRON ' +
  'ISLE IVY JET KNOLL LAGOON LAVA LEAF LEDGE LICHEN LIME LOAM LOCH ' +
  'LODE LOTUS MAPLE MARL MEADOW MESA MIRE MOOR MURAL NIGHT NOON OAK ' +
  'OASIS OCEAN OLIVE ONION OTTER OXIDE PEAK PEAT PETAL PINE PLAIN POND ' +
  'PRISM PUMICE QUILL RAIN RAZOR REEF RILL ROOT ROSE RUIN RUNE SCREE ' +
  'SEDGE SHADE SHALE SHARD SHORE SILK SILT SKY SLEET SLOPE SPORE SPRIG ' +
  'SPRUCE STEAM STEEL STILL STRAW SWAMP TAIGA TERRA THAW THORN TIMBER TUNDRA ' +
  'TWIG VALE VAULT VEIL VERGE VIOLET WAVE WEAVE WIND WOLD YARN YEW ZENITH ' +
  'BASIN BERYL BRAID CARBON CHROME COMET CROWN DAISY DEPTH DIRT EAVES EMERY FLARE FLEECE GARNET GLINT SLAB HERON INLET JASPER KILN LUSTER MARBLE MOTH NETTLE ORCHID PLUME QUAIL RIFT SIGNAL TOPAZ TRACE VELDT WHARF WREN ZEPHYR DOME PIER SPIRE'
).trim().split(/\s+/);

export const HIT_WORDS = Object.freeze(WORDS);

/** "5m" / "2h" / "3d": how long ago a keep was captured, from its stored time (ms epoch or null = unknown). */
export function hitAge(capturedMs, nowMs) {
  if (!Number.isFinite(capturedMs) || !Number.isFinite(nowMs) || nowMs < capturedMs) return null;
  const m = Math.floor((nowMs - capturedMs) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

/**
 * The pill name for a seed: the high byte of its 16-bit hex picks the first word, the low byte the second.
 * @returns {{ short: string, full: string, hex: string }} short = the pill's word, full = both words, hex = the
 *   4-hex seed the name stands for (shown only on the hover card).
 */
export function hitName(seed) {
  const n = Number(seed) >>> 0;
  const v = n & 0xffff;
  return {
    short: HIT_WORDS[v >> 8],
    full: `${HIT_WORDS[v >> 8]} ${HIT_WORDS[v & 255]}`,
    hex: v.toString(16).padStart(4, '0'),
  };
}
