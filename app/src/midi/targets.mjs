// targets.mjs — what a MIDI control can drive (#617). The registry is the ONE list:
// the mapping sanitizer, the learn UI, the engine and the tests all read it.
//
// Two kinds:
//   trigger — fires an action. A pad (note on) or a CC rising through the half-way
//             point fires it. `hold` targets (FREEZE) are momentary: on = engage,
//             off = release, which suits a pad and needs no stored toggle state.
//   cc      — a continuous knob/fader → a parameter, scaled into the param's range.
//
// `run(ctx, value)` is pure of the DOM: it talks only through ctx (the event bus
// and the store), so the engine is testable with a fake ctx.
import { PARAM_SPEC } from '../data/layout-modes.js';
import { FEEL_PRESETS } from '../data/feels.js';
import { PALETTES } from '../data/palettes.js';
import { FLAGSHIP_VOICES } from '../data/voices.js';
import { MAX_USER_VOICES } from '../state/slices/voiceSlice.js';
import { isEarned } from '../state/earnedVoices.js';
import { captureFavorite } from '../state/slices/davisSlice.js';

// #1720 — picker targets: one key selects one palette / one voice, through the
// same events the on-screen pickers emit (PALETTE_SET_ID / VOICE_LOAD), so a
// key press and a tap are the same act. User voices have runtime ids, so they
// are reached by SLOT: voice.my.N loads the Nth voice on the performer's own
// shelf (the hand-made list, in shelf order) at the moment the key lands; an
// empty slot fires nothing.
const palettePick = (p) => ({
  id: `palette.${p.id}`, kind: 'trigger', label: `PAL ${p.name}`,
  run: (ctx) => ctx.emit(ctx.Events.PALETTE_SET_ID, { id: p.id }),
});
const voicePick = (v) => ({
  id: `voice.${v.id}`, kind: 'trigger', label: `VOICE ${v.title}`,
  run: (ctx) => ctx.emit(ctx.Events.VOICE_LOAD, { id: v.id }),
});
const userVoiceSlot = (i) => ({
  id: `voice.my.${i + 1}`, kind: 'trigger', label: `MY VOICE ${i + 1}`,
  run: (ctx) => {
    const mine = (ctx.getState().userVoices || []).filter((v) => !isEarned(v));
    if (mine[i]) ctx.emit(ctx.Events.VOICE_LOAD, { id: mine[i].id });
  },
});

const sliderCc = (key, label) => ({
  id: `param.${key}`, kind: 'cc', label,
  run: (ctx, v01) => {
    const { min, max } = PARAM_SPEC[key];
    ctx.emit(ctx.Events.LAYOUT_PARAM, { key, value: min + (max - min) * v01 });
  },
});

export const MIDI_TARGETS = Object.freeze([
  { id: 'evolve.toggle', kind: 'trigger', label: 'EVOLVE / STOP', run: (ctx) => ctx.emit(ctx.Events.DAVIS_EVOLVE, { toggle: true }) },
  { id: 'seed.new', kind: 'trigger', label: 'NEW SEED', run: (ctx) => ctx.emit(ctx.Events.DAVIS_EVOLVE, { bumpSeed: true }) },
  {
    id: 'favorite.keep', kind: 'trigger', label: 'FAVORITE (keep)',
    run: (ctx) => {
      const s = ctx.getState();
      ctx.emit(ctx.Events.DAVIS_FAVORITE, {
        action: 'add',
        favorite: captureFavorite({ seed: s.seed, seedOffsets: s.seedOffsets, layoutParams: s.layoutParams, enabledAssets: s.enabledAssets, layers: s.layers, activeLayerId: s.activeLayerId, layerSnapshots: s.layerSnapshots }, s.paletteId),
      });
    },
  },
  { id: 'accum.swell', kind: 'trigger', label: 'SWELL', run: (ctx) => ctx.emit(ctx.Events.ACCUM_GESTURE, { action: 'swell' }) },
  { id: 'accum.clear', kind: 'trigger', label: 'CLEAR trails', run: (ctx) => ctx.emit(ctx.Events.ACCUM_GESTURE, { action: 'clear' }) },
  { id: 'accum.freeze', kind: 'hold', label: 'FREEZE (hold)', run: (ctx, on) => ctx.emit(ctx.Events.ACCUM_GESTURE, { action: 'freeze', value: !!on }) },
  ...FEEL_PRESETS.map((f) => ({ id: `feel.${f.id}`, kind: 'trigger', label: `FEEL ${f.name}`, run: (ctx) => ctx.getState().applyFeel(f.id) })),
  sliderCc('audioModDepth', 'AUDIO DEPTH'),
  sliderCc('audioScaleMod', 'AUDIO SCALE'),
  sliderCc('audioAlphaMod', 'AUDIO ALPHA'),
  sliderCc('audioSwell', 'AUDIO SWELL'),
  sliderCc('lifeDrift', 'LIFE'),
  {
    id: 'evolve.interval', kind: 'cc', label: 'EVOLVE INTERVAL',
    // same 200–10000 ms range as the slider on DAVIS
    run: (ctx, v01) => ctx.emit(ctx.Events.DAVIS_EVOLVE, { interval: Math.round((200 + 9800 * v01) / 100) * 100 }),
  },
  // #1720 — the bank switch: one key flips the active bank (wrapping), so the
  // same keys do different jobs per bank. Bound like any other target, in any
  // bank; the legend shows which bank is live.
  { id: 'bank.next', kind: 'trigger', label: 'BANK NEXT', run: (ctx) => ctx.getState().cycleMidiBank() },
  ...PALETTES.map(palettePick),
  ...FLAGSHIP_VOICES.map(voicePick),
  ...Array.from({ length: MAX_USER_VOICES }, (_, i) => userVoiceSlot(i)),
].map(Object.freeze));

const BY_ID = new Map(MIDI_TARGETS.map((t) => [t.id, t]));
export const getMidiTarget = (id) => BY_ID.get(id);
