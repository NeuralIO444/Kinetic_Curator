// data/canon/styles.js — #2044 (Canon S1): the ONE style declaration.
//
// Before this file a "style" was a word typed out four times: STYLES in data/assetStyle.js, STYLE_LOOK_GROUPS in
// data/styleLooks.js, the keys of FAMILY_PAIRING in data/voiceDeck.js, and each chapter's pointer lists in
// data/chapters.js. They agreed because selfchecks pinned them, not because anyone imported one declaration.
// This is that declaration. Those four stores now import their vocabulary from here (canon.selfcheck pins it),
// and data/canon/index.js resolves a whole style — its looks, voices and palettes — from this record.
//
// A record carries:
//   id, label  — the style id every catalogue already speaks, and its menu label
//   identity   — the art-history anchor: movement, period, place, the figures the style is drawn from, and a
//                one-line statement of the language. NAMES POLICY (curator/personaTastes.js): real names are
//                lineage kept in code; the product surface shows `label` only, never `identity.figures`.
//   assets     — `note` is the asset-side reading of the style (what STYLE_RULES sorts into it); `families` are
//                the asset families the style claims outright (the slot authored material joins by — #1854)
//   lookGroup  — present when the style is a Look group on the LOOKS menu; `rank` is its menu position
//   pairing    — the asset categories its voice family wears (the old FAMILY_PAIRING row); null when the style
//                has no voice family of its own
//
//   bus        — #2049: the record's declared relationship to the core event bus, in the bus's own channel
//                names (composition/eventBus.js Events — decisions, never frames). `listens`: the decisions the
//                record attends to; `announces`: what it publishes when it takes the stage. The declaration is
//                the wiring: curator/canonBus.mjs subscribes exactly what a record lists and nothing else, so
//                editing a record's `bus` changes what it is connected to — no driver is written per record.
//
// LEAF MODULE: no imports, on purpose. Every catalogue imports this; it imports none of them.
// Declaration order is the asset-style order (the order STYLES has always had) — reordering is a data change.

/**
 * #2049 — the bus binding every style declares unless its record says otherwise. Channel names are the bus's
 * own (composition/eventBus.js Events; canonBus.selfcheck pins each one against that table):
 *   listens   kinetic:tap, layout:preset, layout:curate — the decisions that change what is on stage
 *             clock:bar — the downbeat (how long it has stood, in bars)
 *             audio:onset — a hit, heard while it stands
 *   announces canon:stand — published once, when the style takes the stage
 */
export const CANON_STYLE_BUS = Object.freeze({
  listens: Object.freeze(['kinetic:tap', 'layout:preset', 'layout:curate', 'clock:bar', 'audio:onset']),
  announces: Object.freeze(['canon:stand']),
});

const bus = (b) =>
  b
    ? Object.freeze({
        listens: Object.freeze([...(b.listens || [])]),
        announces: Object.freeze([...(b.announces || [])]),
      })
    : CANON_STYLE_BUS;

const style = (r) =>
  Object.freeze({
    ...r,
    bus: bus(r.bus),
    identity: Object.freeze({ ...r.identity, figures: Object.freeze([...r.identity.figures]) }),
    assets: Object.freeze({ note: r.assets.note, families: Object.freeze([...r.assets.families]) }),
    lookGroup: r.lookGroup ? Object.freeze({ ...r.lookGroup }) : null,
    pairing: r.pairing ? Object.freeze([...r.pairing]) : null,
  });

export const CANON_STYLES = Object.freeze(
  [
    {
      id: 'swiss',
      label: 'Swiss',
      identity: {
        movement: 'International Typographic Style',
        period: '1950s–1960s',
        place: 'Zürich and Basel',
        figures: ['Josef Müller-Brockmann', 'Armin Hofmann', 'Emil Ruder'],
        note: 'Grid discipline, type-led, flush and objective.',
      },
      assets: { note: 'grid discipline, type-led, solid primitives', families: [] },
      lookGroup: { rank: 2 },
      pairing: ['geometric', 'linework'],
    },
    {
      id: 'bauhaus',
      label: 'Bauhaus',
      identity: {
        movement: 'Bauhaus',
        period: '1919–1933',
        place: 'Weimar, Dessau, Berlin',
        figures: ['Wassily Kandinsky', 'László Moholy-Nagy', 'Herbert Bayer', 'Anni Albers'],
        note: 'Primary geometry, constructed, weighted.',
      },
      assets: { note: 'primary geometry: circle / square / triangle / wedge', families: [] },
      lookGroup: { rank: 3 },
      pairing: ['geometric', 'radial'],
    },
    {
      id: 'japanese',
      label: 'Japanese',
      identity: {
        movement: 'Edo-period print and ink painting (ukiyo-e, Rinpa, sumi-e)',
        period: '17th–19th century',
        place: 'Japan',
        figures: ['Katsushika Hokusai', 'Utagawa Hiroshige', 'Ogata Kōrin'],
        note: 'Ma (the held empty), asymmetry, a brush that stops early.',
      },
      assets: { note: 'ma and asymmetry: sprig, branch, petal, the single ring', families: [] },
      lookGroup: { rank: 0 },
      pairing: ['floral', 'organic', 'radial'],
    },
    {
      id: 'grunge',
      label: 'Grunge',
      identity: {
        movement: 'Grunge typography and the photocopied flyer',
        period: '1990s',
        place: 'United States (Seattle, California)',
        figures: ['David Carson', 'Art Chantry'],
        note: 'Photocopy contrast, distress, torn geometry.',
      },
      assets: { note: 'distress: stamps, scribble, photocopy, torn fragments', families: [] },
      lookGroup: { rank: 1 },
      pairing: ['stamps', 'fragments', 'scanlines'],
    },
    {
      id: 'engraved',
      label: 'Engraved',
      identity: {
        movement: 'Natural-history engraving and lithography',
        period: '19th century (Kunstformen der Natur, 1899–1904)',
        place: 'Germany',
        figures: ['Ernst Haeckel'],
        note: "The specimen plate, the copper line, the naturalist's drawer.",
      },
      assets: { note: 'Haeckel plates: fine-line natural history', families: [] },
      lookGroup: { rank: 6 },
      pairing: ['radial', 'linework'],
    },
    {
      id: 'techno',
      label: 'Techno',
      identity: {
        movement: 'Techno and interface graphics',
        period: '1990s',
        place: 'United Kingdom and Germany',
        figures: ['The Designers Republic'],
        note: 'The readout as ornament: HUD, circuit trace, crystal, scan.',
      },
      assets: { note: 'HUD, circuitry, crystal, scan', families: [] },
      lookGroup: null,
      pairing: null,
    },
    {
      id: 'pixel',
      label: 'Pixel',
      identity: {
        movement: 'Bitmap graphics',
        period: '1970s–1980s',
        place: 'Japan and the United States',
        figures: ['Susan Kare'],
        note: 'The 8-bit grid: every mark is a count of squares.',
      },
      assets: { note: 'the 8-bit grid', families: [] },
      lookGroup: null,
      pairing: null,
    },
    {
      id: 'organic',
      label: 'Organic',
      identity: {
        movement: 'Biomorphism',
        period: '1930s–1950s',
        place: 'Paris',
        figures: ['Jean Arp', 'Joan Miró'],
        note: 'Grown, not drawn: blob, cell, root, colony.',
      },
      assets: { note: 'blob, cell, root, colony', families: [] },
      lookGroup: null,
      pairing: null,
    },
    {
      id: 'op',
      label: 'Op Art',
      identity: {
        movement: 'Op Art',
        period: '1960s (The Responsive Eye, 1965)',
        place: 'London, Paris, New York',
        figures: ['Bridget Riley', 'Victor Vasarely', 'Jesús Rafael Soto', 'Carlos Cruz-Diez'],
        note: 'Optical vibration, repetition, figure/ground flips.',
      },
      assets: { note: 'optical: halftone, concentric, hatch, moiré', families: [] },
      lookGroup: { rank: 4 },
      pairing: ['radial', 'dots', 'linework'],
    },
    {
      id: 'memphis',
      label: 'Memphis',
      identity: {
        movement: 'Memphis Group',
        period: '1981–1987',
        place: 'Milan',
        figures: ['Ettore Sottsass', 'Nathalie Du Pasquier'],
        note: 'Loud, playful, squiggles and confetti on pastel.',
      },
      assets: { note: 'confetti, squiggle, zigzag, star', families: [] },
      lookGroup: { rank: 5 },
      pairing: ['geometric', 'dots', 'linework'],
    },
    {
      // #1854 — the primitive chapter (BOOK S1b). No named figures: the makers are unknown, and none is invented.
      id: 'marks',
      label: 'Marks',
      identity: {
        movement: 'Upper Palaeolithic cave marks',
        period: 'c. 40,000–10,000 BCE',
        place: 'Franco-Cantabrian caves (Lascaux, Chauvet, Altamira)',
        figures: [],
        note: 'Pigment on a wall, almost no motion, most of the ground left empty.',
      },
      assets: { note: 'the primitive chapter: pigment, tally, hand', families: ['marks'] },
      lookGroup: { rank: 7 },
      pairing: ['stamps', 'linework', 'dots'],
    },
  ].map(style),
);

/** Every style id, in declaration order — the vocabulary data/assetStyle.js exports as STYLES. */
export const CANON_STYLE_IDS = Object.freeze(CANON_STYLES.map((s) => s.id));

const BY_ID = new Map(CANON_STYLES.map((s) => [s.id, s]));

/** The declared record for a style id, or null. (The resolved view — looks, voices, palettes — is canon/index.js.) */
export function canonStyleRecord(id) {
  return BY_ID.get(id) || null;
}

/** True when `id` is a Canon style. */
export function isCanonStyle(id) {
  return BY_ID.has(id);
}

/** The styles that are Look groups, in LOOKS-menu order — what data/styleLooks.js exports as STYLE_LOOK_GROUPS. */
export const CANON_LOOK_GROUP_STYLES = Object.freeze(
  CANON_STYLES.filter((s) => s.lookGroup).sort((a, b) => a.lookGroup.rank - b.lookGroup.rank),
);

/** The `{ id, label }` rows of the style Look groups, in menu order. */
export function canonLookGroups() {
  return CANON_LOOK_GROUP_STYLES.map((s) => ({ id: s.id, label: s.label }));
}

/** Each voice family's asset pairing, keyed by style id, in menu order — data/voiceDeck.js's FAMILY_PAIRING. */
export function canonFamilyPairing() {
  return Object.fromEntries(CANON_LOOK_GROUP_STYLES.filter((s) => s.pairing).map((s) => [s.id, s.pairing]));
}

/**
 * A chapter's pointer lists, derived from the Canon style it stands on: its look group, its asset style and
 * families, its voice style. data/chapters.js spreads this instead of retyping the id four times.
 */
export function canonChapterAxes(styleId) {
  const s = canonStyleRecord(styleId);
  if (!s) throw new Error(`canonChapterAxes: unknown style ${styleId}`);
  return {
    lookGroups: s.lookGroup ? [s.id] : [],
    assetStyles: [s.id],
    assetFamilies: [...s.assets.families],
    voiceStyles: [s.id],
  };
}
