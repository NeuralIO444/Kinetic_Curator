// feels.js — STIMULI FEEL presets (#615): Gentle / Punchy / Violent.
//
// Three macro presets over the 8 reactivity params. One gesture, total feel
// change (the Ableton macro pattern); the 8 raw sliders survive behind
// "Advanced". The numbers below ARE the curves: nothing is hidden from the
// performer, and the panel prints them on hover.
//
// "vibe" on this ticket means these AUDIO macros only — never SWARM / HYPE /
// MURM (docs/TAXONOMY.md, #735).
//
// PUNCHY is the factory reactivity exactly (DEFAULT_LAYOUT_PARAMS), so a fresh
// piece reads PUNCHY and nothing moves for anyone who never touches FEEL.
// Browser-safe, pure.

/** The 8 reactivity params a feel sets, in panel order. */
export const FEEL_KEYS = Object.freeze([
  'audioModDepth', 'audioScaleMod', 'audioAlphaMod', 'lifeDrift',
  'audioAttackMs', 'audioDecayMs', 'audioResponse', 'audioSwell',
]);

export const FEEL_PRESETS = Object.freeze([
  {
    id: 'gentle', name: 'GENTLE',
    hint: 'Slow and smooth: hits swell in and linger, nothing snaps.',
    params: { audioModDepth: 0.35, audioScaleMod: 0.30, audioAlphaMod: 0.12, lifeDrift: 0.25, audioAttackMs: 120, audioDecayMs: 700, audioResponse: 'linear', audioSwell: 0.5 },
  },
  {
    id: 'punchy', name: 'PUNCHY',
    hint: 'The factory feel: fast enough to feel played, slow enough to flow.',
    params: { audioModDepth: 0.65, audioScaleMod: 0.45, audioAlphaMod: 0.25, lifeDrift: 0.35, audioAttackMs: 25, audioDecayMs: 320, audioResponse: 'exponential', audioSwell: 1 },
  },
  {
    id: 'violent', name: 'VIOLENT',
    hint: 'Everything up, hits snap to their peak: the music shoves the picture.',
    params: { audioModDepth: 1, audioScaleMod: 0.95, audioAlphaMod: 0.65, lifeDrift: 0.6, audioAttackMs: 4, audioDecayMs: 140, audioResponse: 'peak-hold', audioSwell: 1 },
  },
].map((p) => Object.freeze({ ...p, params: Object.freeze(p.params) })));

/** Which feel the live params match exactly, or 'custom' (a tweaked slider, a voice, an import). */
export function activeFeelId(layoutParams) {
  const lp = layoutParams || {};
  const hit = FEEL_PRESETS.find((f) => FEEL_KEYS.every((k) => Object.is(lp[k], f.params[k])));
  return hit ? hit.id : 'custom';
}

/** The numbers a feel sets, as a one-line readout for the hover title. */
export function feelReadout(feel) {
  const p = feel.params;
  return `depth ${p.audioModDepth} · scale ${p.audioScaleMod} · alpha ${p.audioAlphaMod} · life ${p.lifeDrift} · attack ${p.audioAttackMs}ms · decay ${p.audioDecayMs}ms · ${p.audioResponse} · swell ${p.audioSwell}`;
}
