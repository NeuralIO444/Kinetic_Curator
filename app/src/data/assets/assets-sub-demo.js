// Sub-animation demo pack — 3 micro-HUD-style assets with rigs.
// anim_dial_01: needle spins (static face + spin layer)
// anim_chevrons_01: chevrons chase via phase-offset blink
// anim_dot_01: dot pulses (static accent ring + pulse layer)
// Base `svg` is the rig sampled at t=0 (pool thumbnails); frames bake via
// expandSubFrames() in subAnim.mjs. Colors: var(--ink) / var(--accent).
import { sampleRig } from '../../assets/subAnim.mjs';

const I = 'var(--ink)';
const A = 'var(--accent)';

// ---- anim_dial_01 ----
const DIAL_PERIOD = 2.4;
const DIAL_FRAMES = 12;
const dialFace =
  `<circle cx="50" cy="50" r="34" fill="none" stroke="${I}" stroke-width="4"/>` +
  [
    [80, 50, 74, 50], [71.2, 71.2, 67, 67], [50, 80, 50, 74], [28.8, 71.2, 33, 67],
    [20, 50, 26, 50], [28.8, 28.8, 33, 33], [50, 20, 50, 26], [71.2, 28.8, 67, 33],
  ].map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${I}" stroke-width="4"/>`).join('') +
  `<circle cx="50" cy="50" r="4" fill="${A}"/>`;
const dialNeedle =
  `<line x1="50" y1="50" x2="50" y2="22" stroke="${A}" stroke-width="5" stroke-linecap="round"/>` +
  `<line x1="50" y1="50" x2="50" y2="62" stroke="${A}" stroke-width="5" stroke-linecap="round"/>`;
const dialRig = [
  { svg: dialFace, anim: null },
  { svg: dialNeedle, anim: { kind: 'spin' } },
];

// ---- anim_chevrons_01 ----
const CHEV_PERIOD = 1.2;
const CHEV_FRAMES = 6;
const chevRig = [24, 44, 64].map((x, i) => ({
  svg: `<path d="M${x} 32 L${x + 14} 50 L${x} 68" fill="none" stroke="${i === 2 ? A : I}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  anim: { kind: 'blink', phase: i / 3 },
}));

// ---- anim_dot_01 ----
const DOT_PERIOD = 1.6;
const DOT_FRAMES = 8;
const dotRig = [
  { svg: `<circle cx="50" cy="50" r="22" fill="none" stroke="${A}" stroke-width="3"/>`, anim: null },
  { svg: `<circle cx="50" cy="50" r="12" fill="${I}"/>`, anim: { kind: 'pulse', amp: 0.3 } },
];

export const ASSETS_SUB_DEMO = [
  {
    id: 'anim_dial_01', category: 'geometric', tags: ['animated', 'hud', 'micro', 'dial', 'gauge'],
    weight: 'light', density: 'sparse', scale: [0.2, 0.6], rotate: 'fixed',
    svg: sampleRig(dialRig, 0, DIAL_PERIOD),
    sub: { frames: DIAL_FRAMES, period: DIAL_PERIOD, rig: dialRig },
  },
  {
    id: 'anim_chevrons_01', category: 'geometric', tags: ['animated', 'hud', 'micro', 'chevron', 'direction'],
    weight: 'light', density: 'sparse', scale: [0.2, 0.6], rotate: 'fixed',
    svg: sampleRig(chevRig, 0, CHEV_PERIOD),
    sub: { frames: CHEV_FRAMES, period: CHEV_PERIOD, rig: chevRig },
  },
  {
    id: 'anim_dot_01', category: 'geometric', tags: ['animated', 'hud', 'micro', 'dot', 'pulse'],
    weight: 'light', density: 'sparse', scale: [0.2, 0.6], rotate: 'fixed',
    svg: sampleRig(dotRig, 0, DOT_PERIOD),
    sub: { frames: DOT_FRAMES, period: DOT_PERIOD, rig: dotRig },
  },
];
