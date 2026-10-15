// Line UV strips — frame-exact cell animation for the waveform lines (#1435 R4).
// The line-family counterpart of assets-micro-hud-strips.js: same authored
// track, same laws. Cell 0 is always the canonical frame — the asset's own
// svg, verbatim, so its bake is bit-identical to the pre-R4 single-cell
// bake; shed and freeze pin cell 0. The asset id never changes — only the
// UV window moves.
//
// The roll: each later frame is the same wave translated along the stroke's
// length (line_squiggle_01: 7 frames x 8 units = its 56-unit wavelength;
// line_squiggle_02: 8 x 4 = its 32-unit wavelength), so the last frame steps
// exactly back onto frame 0 and the loop is seamless. Every frame draws
// each hump of the wave that intersects the box's coverage window, capped
// so ink never comes within ~6 units of a frame edge (the mic_wave rule:
// mip filtering across a frame boundary must not reach ink) — consecutive
// frames are exact translates of each other over the covered band, which
// the regionLines selfcheck pins on rasters.
export const LINE_STRIPS = {
  'line_squiggle_01': [
    `<path d="M6 50 Q20 20 34 50 T62 50 T90 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-30 50 Q-16 80 -2 50 Q12 20 26 50 Q40 80 54 50 Q68 20 82 50 Q96 80 110 50 Q124 20 138 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-38 50 Q-24 80 -10 50 Q4 20 18 50 Q32 80 46 50 Q60 20 74 50 Q88 80 102 50 Q116 20 130 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-18 50 Q-4 20 10 50 Q24 80 38 50 Q52 20 66 50 Q80 80 94 50 Q108 20 122 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-26 50 Q-12 20 2 50 Q16 80 30 50 Q44 20 58 50 Q72 80 86 50 Q100 20 114 50 Q128 80 142 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-34 50 Q-20 20 -6 50 Q8 80 22 50 Q36 20 50 50 Q64 80 78 50 Q92 20 106 50 Q120 80 134 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-42 50 Q-28 20 -14 50 Q0 80 14 50 Q28 20 42 50 Q56 80 70 50 Q84 20 98 50 Q112 80 126 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  ],
  'line_squiggle_02': [
    `<path d="M6 50 Q14 30 22 50 T38 50 T54 50 T70 50 T86 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-30 50 Q-22 30 -14 50 Q-6 70 2 50 Q10 30 18 50 Q26 70 34 50 Q42 30 50 50 Q58 70 66 50 Q74 30 82 50 Q90 70 98 50 Q106 30 114 50 Q122 70 130 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-34 50 Q-26 30 -18 50 Q-10 70 -2 50 Q6 30 14 50 Q22 70 30 50 Q38 30 46 50 Q54 70 62 50 Q70 30 78 50 Q86 70 94 50 Q102 30 110 50 Q118 70 126 50 Q134 30 142 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-38 50 Q-30 30 -22 50 Q-14 70 -6 50 Q2 30 10 50 Q18 70 26 50 Q34 30 42 50 Q50 70 58 50 Q66 30 74 50 Q82 70 90 50 Q98 30 106 50 Q114 70 122 50 Q130 30 138 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-42 50 Q-34 30 -26 50 Q-18 70 -10 50 Q-2 30 6 50 Q14 70 22 50 Q30 30 38 50 Q46 70 54 50 Q62 30 70 50 Q78 70 86 50 Q94 30 102 50 Q110 70 118 50 Q126 30 134 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-30 50 Q-22 70 -14 50 Q-6 30 2 50 Q10 70 18 50 Q26 30 34 50 Q42 70 50 50 Q58 30 66 50 Q74 70 82 50 Q90 30 98 50 Q106 70 114 50 Q122 30 130 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-34 50 Q-26 70 -18 50 Q-10 30 -2 50 Q6 70 14 50 Q22 30 30 50 Q38 70 46 50 Q54 30 62 50 Q70 70 78 50 Q86 30 94 50 Q102 70 110 50 Q118 30 126 50 Q134 70 142 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M-38 50 Q-30 70 -22 50 Q-14 30 -6 50 Q2 70 10 50 Q18 30 26 50 Q34 70 42 50 Q50 30 58 50 Q66 70 74 50 Q82 30 90 50 Q98 70 106 50 Q114 30 122 50 Q130 70 138 50" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  ],
};
