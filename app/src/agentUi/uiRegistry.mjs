// agentUi/uiRegistry.mjs — issue 2509: the agent UI registry.
//
// The ONE registry of the performed UI surface (the Astryx pattern, loot issue 2444; Matt's
// ruling 2026-11-24: ship the manifest in the live build so agents can drive the real UI).
// This module is the single source both outputs are generated from:
//   1. the shipped manifest — buildManifest() below, exposed on the window hook by
//      uiBridge.mjs (window.__KC_UI__), readable by an agent on the hosted build;
//   2. the standing stress script — app/e2e/agent-stress.mjs consumes the shipped manifest
//      from the running build, never a second hand-maintained list.
//
// Every entry names a primary control as it is presented on the performed surface, what it
// does in plain words, and its lawful channel: the exact bus event / store action / dispatch
// type / module function the control itself calls (its `source` component is pinned by
// uiRegistry.selfcheck.mjs). The bridge performs ONLY those channels — reach and legibility,
// never new authority. No persona internals are described beyond what the panels show.
//
// Entry shape:
//   id       unique, panel-prefixed ('build.count')
//   panel    one of PANELS
//   label    the control's label as shown (families describe the repeated pattern)
//   kind     button | toggle | segmented | slider | select | dialog | readout
//   does     plain words
//   options  the exact values the control can emit (segmented / select / cycle)
//   stops    for segmented+exact-editor params: the OFF/LOW/MID/HIGH values the segments emit
//   range    { min, max, step } for sliders, in the channel's emitted units
//   walk     explicit actuation values for the stress script when generic extremes don't fit
//   channel  how the bridge performs it (absent = no lawful bridge channel: local/readout)
//     { kind:'bus', event, payload }        emit(Events[event], payload) — the panels' own entry
//     { kind:'bus', emits:[{event,payload}] }  controls that emit a fixed sequence
//     { kind:'store', action, args }        useStore.getState()[action](...args)
//     { kind:'apply', type, fields }        applyAction({ type, ...fields }) — the dispatch funnel
//     { kind:'module', module, export, args }  an app module function the control itself calls
//     { kind:'recipe', recipe }             a named bridge recipe for state-derived payloads,
//                                           built from the same module helpers the panel uses
//   reads    dotted store-state paths the control reflects ('layoutParams.count'), or
//            'module:<module>#<export>' for module-held state; the bridge reads these back
//            around every actuation so a caller can verify the change landed
//   stress   'walk' (script actuates across the range) | 'probe' (script reads only) |
//            'skip' (script does not touch it; `note` says why)
//   family   true when one entry describes a control repeated by data (per asset, per layer…);
//            the bridge takes the instance key as act's `param`
//   note     omissions, partial channels, gating — stated, never silent
//
// Payload/args templates: '$value' = the actuation value, '$toggle' = negation of the first
// read, '$param' = the family instance key, '$param.a.b' / 'x$param' for composed templates.
//
// Value lists: wherever the app keeps a control's options as a module export, the entry
// IMPORTS that export (KINEME_PATTERNS, DOCTRINE_IDS, SCOPE_CYCLE, BLEND_MODES, …) — never
// a copied literal. Layout-param stops and ranges are pinned against the app's own
// PARAM_STOPS / PARAM_SPEC tables by uiRegistry.selfcheck.mjs. The few remaining literals
// are enumerations that exist only inside the control's own source component (covered by
// the source pin), or panel-offered subsets of a module list, noted on the entry.

import { LAYOUT_MODES, SYMMETRY_MODES, BEHAVE_MODES, MIRROR_STATES, BLEND_MODES } from '../data/layout-modes.js';
import { MOTION_MODES } from '../data/voices.js';
import { CANVAS_PRESETS, CANVAS_FPS, STAGE_MODES } from '../data/canvasPresets.js';
import { ALL_CATEGORIES } from '../data/categories.js';
import { QUEUE_SECONDS_MIN, QUEUE_SECONDS_MAX, QUEUE_BEATS_MIN, QUEUE_BEATS_MAX } from '../state/queueTransport.js';
import { KINEME_PATTERNS, TRANSPORT_MODES, PATH_FAMILIES } from '../engine/kineme.js';
import { DOCTRINE_IDS } from '../curator/doctrines.mjs';
import { SCOPE_CYCLE } from '../state/kineticScope.mjs';
import { BEAT_PRESETS } from '../gl/beatClock.mjs';
import { BALLISTICS_CURVES } from '../gl/audioBallistics.mjs';
import { SCHEME_IDS } from '../engine/harmony.js';
import { FIELDMAP_FIELDS, FIELDMAP_CHANNELS } from '../engine/fieldMap.mjs';
import { FIELD_CYCLE_DETENTS } from '../engine/dishLifeField.mjs';
import { STRATUM_ROTATIONS } from '../state/stratumRotation.js';
import { RECIPE_OFFSET_CHANNELS } from '../state/recipes.js';
import { FEEL_PRESETS } from '../data/feels.js';
import { LIGHT_SLOTS } from '../data/light.js';
import { WET_STOPS } from '../panels/build/blockStops.mjs';
import { STAGE_MAPPINGS } from '../panels/pipeline/stageMapping.mjs';

export const AGENT_UI_SCHEMA = 'kc-agent-ui/1';

const ids = (list) => Object.freeze(list.map((m) => (typeof m === 'string' ? m : m.id)));

export const PANELS = Object.freeze([
  Object.freeze({
    id: 'topbar',
    label: 'Top bar',
    where: 'START / KINETIC / Looks / Taste / Curator / beat / palettes / mode + motion strips',
  }),
  Object.freeze({ id: 'canvas', label: 'P01 CANVAS', where: 'the live stage panel and its header' }),
  Object.freeze({
    id: 'assets',
    label: 'P02 ASSET POOL',
    where: 'the asset pool: filters, bulk switches, per-asset tiles',
  }),
  Object.freeze({
    id: 'inspector',
    label: 'Asset inspector',
    where: 'the single-asset inspector and the multi-select bulk bar',
  }),
  Object.freeze({ id: 'shelf', label: 'KEEPS SHELF', where: 'the keeps collection: stage slots, fill, recall' }),
  Object.freeze({ id: 'build', label: 'P03 BUILD', where: 'layout params, strata, swarm, accum, sun, macros' }),
  Object.freeze({ id: 'play', label: 'P04 PLAY', where: 'the hits queue transport and the evolve / phrase drivers' }),
  Object.freeze({ id: 'pipeline', label: 'P05 PIPELINE', where: 'capture, render, export, stage output setup' }),
  Object.freeze({ id: 'stimuli', label: 'P06 STIMULI', where: 'audio input and the modulation matrix' }),
  Object.freeze({ id: 'directors', label: 'P07 DIRECTORS', where: 'voices, evolve, trails, travel, MIDI' }),
  Object.freeze({
    id: 'dev',
    label: 'DEV tools',
    where:
      'the DEV tab family: X-RAY, GOV TUNE, SHADER LAB, BIOLOGY, UNITS, KERNEL, MIND, CENSUS, TASTE, SHELF, MEGAMIND, PERSONA TUNE, HEADS',
  }),
  Object.freeze({
    id: 'wetlab',
    label: 'WetLab',
    where: 'the creature lab dialog: assemble, breed, genome, lineage, deal strips',
  }),
  Object.freeze({ id: 'studio', label: 'Asset Studio', where: 'the hand-drawn asset editor dialog' }),
  Object.freeze({
    id: 'transport',
    label: 'Bottom transport bar',
    where: 'RUN, takes, budget, undo, dish life, ferrofluid, constructs, hits',
  }),
]);

const bus = (event, payload) => Object.freeze({ kind: 'bus', event, ...(payload !== undefined ? { payload } : {}) });
const busMulti = (pairs) =>
  Object.freeze({
    kind: 'bus',
    emits: Object.freeze(pairs.map(([event, payload]) => bus(event, payload))),
  });
const store = (action, args) =>
  Object.freeze({ kind: 'store', action, ...(args ? { args: Object.freeze(args) } : {}) });
const apply = (type, fields) => Object.freeze({ kind: 'apply', type, ...(fields ? { fields } : {}) });
const mod = (module, exportName, args) =>
  Object.freeze({ kind: 'module', module, export: exportName, ...(args ? { args: Object.freeze(args) } : {}) });
const recipe = (name) => Object.freeze({ kind: 'recipe', recipe: name });
const lp = (key, value = '$value') => bus('LAYOUT_PARAM', { key, value });
const rng = (min, max, step) => Object.freeze({ min, max, step });
const R = (...keys) => Object.freeze(keys);

const ctl = (id, panel, label, kind, does, extra = {}) =>
  Object.freeze({ id, panel, label, kind, does, stress: 'walk', ...extra });

// A BUILD layout-param row: segmented OFF/LOW/MID/HIGH stops plus the exact-editor dialog,
// both emitting LAYOUT_PARAM for the same key. `extra.stops` + `extra.range` describe the two.
const lpRow = (id, label, key, does, extra = {}) =>
  ctl(`build.${id}`, 'build', label, 'segmented', does, {
    channel: lp(key),
    reads: R(`layoutParams.${key}`),
    source: 'panels/layout/LayoutSliders.jsx',
    ...extra,
  });

const UI_CONTROLS_1 = Object.freeze([
  // ── topbar ────────────────────────────────────────────────────────────────
  ctl(
    'topbar.start-scope',
    'topbar',
    'START scope',
    'button',
    'Cycles how much of the instrument the startup deal may touch: off, weak, medium, chaos.',
    {
      channel: bus('STARTUP_MODE', { mode: '$value' }),
      options: SCOPE_CYCLE,
      reads: R('startupMode'),
      source: 'panels/layout/CuratorBar.jsx',
    },
  ),
  ctl(
    'topbar.kinetic',
    'topbar',
    'KINETIC',
    'button',
    'The big deal button: rolls the next pass (look, voice, curator or full chaos) — which pass fires is routed by the tap-heat the button reads locally.',
    {
      stress: 'probe',
      note: 'The routing lives in component-local heat state (panels/layout/kineticHeat.mjs) over four store passes; a stateless bridge call cannot reproduce the route honestly, so no channel is registered.',
      source: 'panels/layout/KineticButton.jsx',
    },
  ),
  ctl(
    'topbar.look-preset',
    'topbar',
    'Looks menu — a preset',
    'button',
    'Applies one composition preset (a Look) from the Looks menu.',
    {
      family: true,
      channel: recipe('loadLookPreset'),
      reads: R('layoutParams.composition'),
      source: 'panels/layout/CuratorBar.jsx',
      note: 'act param = the preset id; the bridge resolves it to the same preset object the menu passes, from data/presets.js.',
    },
  ),
  ctl(
    'topbar.taste-voice',
    'topbar',
    'Taste menu — a voice',
    'select',
    'Chooses the standing taste voice (a persona alias, or off for honest dice).',
    {
      family: true,
      channel: mod('curator/taste.js', 'setActivePersona', ['$param']),
      reads: R('module:curator/taste.js#getActivePersonaId'),
      source: 'panels/layout/CuratorBar.jsx',
      note: 'act param = the persona id, or null for off. Held in curator/taste.js, not the store — the same module call the menu makes.',
    },
  ),
  ctl(
    'topbar.curate',
    'topbar',
    'CUR (curator)',
    'button',
    'Asks the curator for the next deal: emits the curate and roll-guard events.',
    {
      channel: busMulti([
        ['LAYOUT_CURATE', undefined],
        ['ROLL_GUARD', { kind: 'curate' }],
      ]),
      reads: R('curatePress'),
      stress: 'probe',
      note: 'Partial channel: after the emits, the component may also set a palette derived by curatePaletteTarget from live phase/profile reads — that helper lives inside CuratorBar.jsx and is not exported, so the bridge performs the two emits the control always makes and not the conditional follow-up.',
      source: 'panels/layout/CuratorBar.jsx',
    },
  ),
  ctl('topbar.beat-preset', 'topbar', 'Beat presets', 'segmented', 'Sets the beat clock to a preset tempo.', {
    family: true,
    channel: bus('BEAT_BPM', { bpm: '$param' }),
    options: BEAT_PRESETS,
    reads: R('beatBpm'),
    source: 'components/BeatButton.jsx',
    note: 'act param = the preset bpm.',
  }),
  ctl('topbar.beat-exact', 'topbar', 'Exact BPM', 'slider', 'Sets the beat clock to an exact tempo.', {
    channel: bus('BEAT_BPM', { bpm: '$value' }),
    range: rng(30, 300, 1),
    reads: R('beatBpm'),
    source: 'components/BeatButton.jsx',
  }),
  ctl('topbar.beat-pulse', 'topbar', 'Beat pulse', 'toggle', 'Turns the metronome pulse on or off.', {
    channel: bus('BEAT_METRO', { on: '$toggle' }),
    reads: R('beatMetro'),
    source: 'components/BeatButton.jsx',
  }),
  ctl(
    'topbar.color-mode',
    'topbar',
    'FADE / WASH / INJECT',
    'segmented',
    'How a palette change lands: cross-fade, wash, or instant inject.',
    {
      channel: bus('PALETTE_COLOR_MODE', { mode: '$value' }),
      options: Object.freeze(['FADE', 'WASH', 'INJECT']),
      reads: R('colorMode'),
      source: 'components/PaletteStrip.jsx',
    },
  ),
  ctl(
    'topbar.palette-chip',
    'topbar',
    'Palette chip',
    'button',
    'Chooses the standing palette from the chip strip (keys 1–4 pick the visible chips).',
    {
      family: true,
      channel: bus('PALETTE_SET_ID', { id: '$param' }),
      reads: R('paletteId'),
      source: 'components/PaletteStrip.jsx',
      note: 'act param = a palette id from data/palettes.js.',
    },
  ),
  ctl(
    'topbar.palette-swatch',
    'topbar',
    'Palette swatch colour',
    'slider',
    'Recolours one swatch of the active palette (an override on the standing palette).',
    {
      family: true,
      channel: bus('PALETTE_SWATCH', { index: '$param', hex: '$value' }),
      reads: R('paletteOverrides'),
      stress: 'probe',
      note: 'act param = swatch index, value = a hex colour. The palette itself is a derived read; the override lands in paletteOverrides. The palette reset control clears overrides.',
      source: 'components/PaletteStrip.jsx',
    },
  ),
  ctl(
    'topbar.swatch-lock',
    'topbar',
    'Swatch lock pip',
    'toggle',
    'Locks one swatch so shuffles and harmonies leave it alone.',
    {
      family: true,
      channel: bus('PALETTE_LOCK', { index: '$param' }),
      reads: R('paletteLocks'),
      source: 'components/PaletteStrip.jsx',
      note: 'act param = swatch index.',
    },
  ),
  ctl(
    'topbar.palette-bg',
    'topbar',
    'Palette background colour',
    'slider',
    'Sets the palette background colour (an override).',
    {
      channel: bus('PALETTE_BG', { hex: '$value' }),
      reads: R('paletteOverrides'),
      stress: 'probe',
      note: 'value = a hex colour; the override lands in paletteOverrides.',
      source: 'components/PaletteStrip.jsx',
    },
  ),
  ctl('topbar.palette-ink', 'topbar', 'Palette ink colour', 'slider', 'Sets the palette ink colour (an override).', {
    channel: bus('PALETTE_INK', { hex: '$value' }),
    reads: R('paletteOverrides'),
    stress: 'probe',
    note: 'value = a hex colour; the override lands in paletteOverrides.',
    source: 'components/PaletteStrip.jsx',
  }),
  ctl(
    'topbar.palette-reset',
    'topbar',
    'Palette reset (↻)',
    'button',
    'Clears every override on the standing palette.',
    {
      channel: bus('PALETTE_CLEAR_OVERRIDES'),
      reads: R('paletteOverrides'),
      source: 'components/PaletteStrip.jsx',
    },
  ),
  ctl(
    'topbar.palette-shuffle',
    'topbar',
    'Palette shuffle (⟳)',
    'button',
    'Shuffles the palette through a harmony scheme.',
    {
      channel: bus('PALETTE_HARMONY', { scheme: '$value' }),
      options: SCHEME_IDS,
      reads: R('paletteOverrides'),
      source: 'components/PaletteStrip.jsx',
      note: 'value = the harmony scheme; on the panel the scheme comes from the lab select beside the button.',
    },
  ),
  ctl(
    'topbar.palette-save',
    'topbar',
    'Palette lab — save',
    'button',
    'Saves the current palette into your palettes under a name.',
    {
      channel: bus('PALETTE_SAVE', { name: '$value' }),
      reads: R('userPalettes'),
      stress: 'probe',
      note: 'value = the name; on the panel the name comes from the lab text input.',
      source: 'components/PaletteWing.jsx',
    },
  ),
  ctl(
    'topbar.saved-palette-delete',
    'topbar',
    'Saved palette delete (×)',
    'button',
    'Deletes one of your saved palettes.',
    {
      family: true,
      channel: bus('PALETTE_DELETE', { id: '$param' }),
      reads: R('userPalettes'),
      stress: 'skip',
      note: 'Destructive to the performer’s saved palettes; the 2026-11-24 session exercised it by hand.',
      source: 'components/PaletteWing.jsx',
    },
  ),
  ctl(
    'topbar.mode-arm',
    'topbar',
    'Mode chips (rand / grid / phi / phyllo)',
    'toggle',
    'Arms a layout mode into the roll scope: the next KINETIC roll may land on it. Tap again to disarm.',
    {
      family: true,
      channel: store('toggleArmMode', ['$param']),
      options: ids(LAYOUT_MODES.slice(0, 4)),
      reads: R('armedMode'),
      source: 'components/ModeStrip.jsx',
      note: 'act param = the mode id.',
    },
  ),
  ctl(
    'topbar.motion-arm',
    'topbar',
    'Motion chips',
    'toggle',
    'Arms a motion into the roll scope: the next KINETIC roll may land on it. Tap again to disarm.',
    {
      family: true,
      channel: store('toggleArmMotion', ['$param']),
      options: ids(MOTION_MODES),
      reads: R('armedMotion'),
      source: 'components/ModeStrip.jsx',
      note: 'act param = the motion id.',
    },
  ),
  ctl(
    'topbar.roll-scope-clear',
    'topbar',
    'Clear roll scope (✕)',
    'button',
    'Disarms every armed mode and motion at once.',
    {
      channel: bus('ROLL_SCOPE_CLEAR'),
      reads: R('armedMode', 'armedMotion'),
      source: 'components/ModeStrip.jsx',
    },
  ),
  ctl(
    'topbar.help-dialog',
    'topbar',
    '? / ≡ (Help, Keys, Settings, About)',
    'dialog',
    'Opens the help overlay: help, key list, settings (incl. the DEV mode switch, registered under dev.gate), about.',
    {
      stress: 'skip',
      note: 'Open state is App-local React state with no store/bus channel; the overlay’s one stateful switch (DEV mode) is registered separately as dev.gate.',
      source: 'App.jsx',
    },
  ),

  // ── transport ─────────────────────────────────────────────────────────────
  ctl(
    'transport.run',
    'transport',
    'RUN / STOP',
    'toggle',
    'Runs or stops the live loop. RUN after a watchdog stop is the documented manual resume.',
    {
      channel: bus('RUN_SET', { running: '$toggle' }),
      reads: R('running'),
      source: 'components/MasterBar.jsx',
    },
  ),
  ctl('transport.frame-lock', 'transport', '30FPS', 'toggle', 'Locks the frame rate to 30 fps.', {
    channel: store('setFrameLock', ['$toggle']),
    reads: R('frameLock'),
    source: 'components/MasterBar.jsx',
  }),
  ctl(
    'transport.budget',
    'transport',
    'Budget FULL / SHOW / LEAN',
    'segmented',
    'The performance budget ceiling: how much the governor may spend before it sheds.',
    {
      channel: busMulti([
        ['EXPORT_QUALITY', '$value'],
        ['EXPORT_AUTO_QUALITY', true],
      ]),
      options: Object.freeze(['high', 'balanced', 'performance']),
      reads: R('quality', 'qualityCeiling', 'autoQuality'),
      source: 'components/BudgetKnob.jsx',
      note: 'Option values are the quality tier ids; the labels shown are FULL (high), SHOW (balanced), LEAN (performance). Choosing sets qualityCeiling (the performer\u2019s ceiling) and the live tier together; quality alone is the live tier the governor sheds underneath the ceiling.',
    },
  ),
  ctl('transport.undo', 'transport', 'Undo (↶)', 'button', 'Steps one change back.', {
    channel: store('undo'),
    source: 'components/MasterBar.jsx',
    note: 'The bar reaches undo through the AppContext history object; the store action is the same state change.',
  }),
  ctl('transport.redo', 'transport', 'Redo (↷)', 'button', 'Steps one undone change forward again.', {
    channel: store('redo'),
    source: 'components/MasterBar.jsx',
    note: 'Same history funnel as undo.',
  }),
  ctl(
    'transport.rec',
    'transport',
    'REC (performance take)',
    'button',
    'Records a performance take (.kcperf) and downloads it on stop.',
    {
      stress: 'skip',
      note: 'Runs the performance-capture module and downloads a file on stop; file IO, exercised by hand in the 2026-11-24 session.',
      source: 'components/PerformanceButton.jsx',
    },
  ),
  ctl(
    'transport.take-play',
    'transport',
    'TAKE (play a take)',
    'button',
    'Loads a .kcperf take file and plays it back.',
    {
      stress: 'skip',
      note: 'File picker plus the playback module; file IO.',
      source: 'components/PerformanceButton.jsx',
    },
  ),
  ctl(
    'transport.last-3m',
    'transport',
    'LAST 3M (↺)',
    'button',
    'Saves the last three minutes of performance as a take file.',
    {
      stress: 'skip',
      note: 'Downloads a file via the capture module; file IO.',
      source: 'components/PerformanceButton.jsx',
    },
  ),
  ctl(
    'transport.dish-life',
    'transport',
    'DISH LIFE',
    'toggle',
    'Turns dish life (the living culture in the dish) on or off.',
    {
      channel: store('setDishLife', ['$toggle']),
      reads: R('dishLife'),
      source: 'components/DishLifeChip.jsx',
      note: 'The chip also mirrors the choice into a localStorage pref for next boot; the bridge performs the store change, which is the live state change.',
    },
  ),
  ctl(
    'transport.dish-strength',
    'transport',
    'Dish life strength',
    'slider',
    'How strongly dish life pushes on the marks.',
    {
      channel: store('setDishLifeStrength', ['$value']),
      range: rng(0.05, 1, 0.05),
      reads: R('dishLifeStrength'),
      source: 'components/DishLifeChip.jsx',
    },
  ),
  ctl(
    'transport.dish-coupling',
    'transport',
    'Dish life coupling',
    'slider',
    'How tightly the marks couple to the dish-life field.',
    {
      channel: store('setDishLifeCoupling', ['$value']),
      range: rng(0, 1, 0.05),
      reads: R('dishLifeCoupling'),
      source: 'components/DishLifeChip.jsx',
    },
  ),
  ctl(
    'transport.dish-assets',
    'transport',
    'Dish life on-the-marks',
    'slider',
    'How much dish life acts directly on the marks themselves.',
    {
      channel: store('setDishLifeAssets', ['$value']),
      range: rng(0, 1, 0.05),
      reads: R('dishLifeAssets'),
      source: 'components/DishLifeChip.jsx',
    },
  ),
  ctl(
    'transport.dish-seed',
    'transport',
    'Dish life SEED',
    'button',
    'Pulses a fresh seed into the dish-life culture.',
    {
      channel: store('pulseDishLifeSeed'),
      source: 'components/DishLifeChip.jsx',
    },
  ),
  ctl(
    'transport.dish-cycle',
    'transport',
    'Dish life CYCLE',
    'button',
    'Cycles how many generations a dish-life cycle runs.',
    {
      channel: store('setDishLifeCycleGens', ['$value']),
      options: FIELD_CYCLE_DETENTS,
      reads: R('dishLifeCycleGens'),
      source: 'components/DishLifeChip.jsx',
    },
  ),
  ctl('transport.ferro', 'transport', 'Ferrofluid', 'toggle', 'Turns the ferrofluid force on or off.', {
    channel: store('setDishFluid', ['$toggle']),
    reads: R('dishFluid'),
    source: 'components/FerroFluidChip.jsx',
    note: 'The chip also mirrors the choice into a localStorage pref; the bridge performs the store change.',
  }),
  ctl('transport.ferro-flow', 'transport', 'Ferrofluid FLOW', 'slider', 'The ferrofluid flow strength.', {
    channel: store('setDishFluidFlow', ['$value']),
    range: rng(0, 1, 0.05),
    reads: R('dishFluidFlow'),
    source: 'components/FerroFluidChip.jsx',
  }),
  ctl(
    'transport.ferro-pull',
    'transport',
    'Ferrofluid PULL',
    'slider',
    'How hard the magnets pull the ferrofluid body.',
    {
      channel: store('setDishFluidPull', ['$value']),
      range: rng(0, 1, 0.05),
      reads: R('dishFluidPull'),
      source: 'components/FerroFluidChip.jsx',
    },
  ),
  ctl(
    'transport.ferro-couple',
    'transport',
    'Ferrofluid COUPLE',
    'slider',
    'How strongly the ferrofluid couples to the culture.',
    {
      channel: store('setDishFluidCouple', ['$value']),
      range: rng(0, 1, 0.05),
      reads: R('dishFluidCouple'),
      source: 'components/FerroFluidChip.jsx',
    },
  ),
  ctl(
    'transport.ferro-magnets',
    'transport',
    'Ferrofluid MAGNETS',
    'toggle',
    'Arms magnet placement: taps on the dish place magnets.',
    {
      channel: store('setDishFluidMagnetArm', ['$toggle']),
      reads: R('dishFluidMagnetArm'),
      source: 'components/FerroFluidChip.jsx',
    },
  ),
  ctl('transport.constructs', 'transport', 'CONSTRUCTS', 'toggle', 'Lets banked constructs lead on the stage.', {
    channel: store('setConstructLead', ['$toggle']),
    reads: R('constructLead'),
    source: 'components/ConstructsChip.jsx',
  }),
  ctl(
    'transport.hit-recall',
    'transport',
    'Hit pill',
    'button',
    'Recalls a hit (a kept favourite) onto the stage and jumps the queue to it.',
    {
      family: true,
      channel: busMulti([
        ['DAVIS_FAVORITE', { action: 'recall', favorite: '$param.favorite' }],
        ['QUEUE_INDEX', { index: '$param.index' }],
        ['QUEUE_JUMP', undefined],
      ]),
      reads: R('queueIndex'),
      stress: 'probe',
      note: 'act param = { favorite, index } — the favourite object itself, read from state (bridge.state). Shift/Alt variants (evolve-from, morph-to) ride the same pill and are described in the session report; the plain recall is the registered channel.',
      source: 'components/FavoritesTray.jsx',
    },
  ),
  ctl('transport.hit-duplicate', 'transport', 'Hit duplicate (⧉)', 'button', 'Duplicates a hit in the setlist.', {
    family: true,
    channel: bus('DAVIS_FAVORITE', { action: 'duplicate', id: '$param' }),
    reads: R('favorites'),
    stress: 'probe',
    note: 'act param = the hit id. Mutates the performer’s list, so the standing script only probes it.',
    source: 'components/FavoritesTray.jsx',
  }),
  ctl(
    'transport.hit-delete',
    'transport',
    'Hit delete (×)',
    'button',
    'Removes a hit from the setlist (the keep itself stays).',
    {
      family: true,
      channel: bus('DAVIS_FAVORITE_REMOVE', { id: '$param' }),
      stress: 'skip',
      note: 'Destructive to the setlist with no confirmation on the panel; exercised by hand in the session.',
      source: 'components/FavoritesTray.jsx',
    },
  ),
  ctl(
    'transport.hit-clear',
    'transport',
    'Hits clear',
    'button',
    'Clears every hit from the setlist, behind a confirm prompt.',
    {
      channel: bus('DAVIS_FAVORITE', { action: 'clear' }),
      stress: 'skip',
      note: 'Destructive and confirm-gated on the panel; the bridge does not stand in for the performer’s confirm.',
      source: 'components/FavoritesTray.jsx',
    },
  ),
]);

// ── canvas / assets / inspector / shelf (appended chunk) ────────────────────
// (kept inside the same frozen array via UI_CONTROLS.push-free composition below)

export const UI_CONTROLS_2 = Object.freeze([
  // ── canvas ────────────────────────────────────────────────────────────────
  ctl(
    'canvas.bg',
    'canvas',
    'BG (background cycle)',
    'button',
    'Cycles the stage background: palette colour, transparent (checkerboard), white.',
    {
      channel: bus('CANVAS_BG_CYCLE'),
      reads: R('canvasBg'),
      source: 'panels/CanvasPanel.jsx',
    },
  ),
  ctl('canvas.reset-view', 'canvas', 'Reset view', 'button', 'Resets the stage view (zoom and pan) to fit.', {
    stress: 'skip',
    note: 'Drives the panel-local viewport hook (useStageViewport) with no store/bus channel; zoom and pan are pointer gestures on the stage surface.',
    source: 'panels/CanvasPanel.jsx',
  }),
  ctl(
    'canvas.readouts',
    'canvas',
    'NODES / FPS pills',
    'readout',
    'Live stage readouts: node count and frames per second. The bridge stage() read returns these from the store.',
    {
      stress: 'probe',
      note: 'A readout: it changes no state, so there is no channel; the bridge stage() read is how an agent reads what it shows.',
      source: 'panels/CanvasPanel.jsx',
    },
  ),

  // ── assets ────────────────────────────────────────────────────────────────
  ctl(
    'assets.cat-filter',
    'assets',
    'Category filter chips',
    'segmented',
    'Filters the tile grid to one asset category (or all, or yours).',
    {
      family: true,
      channel: bus('ASSETS_CAT_FILTER', '$param'),
      options: Object.freeze(['all', 'user', ...ALL_CATEGORIES]),
      reads: R('catFilter'),
      source: 'panels/AssetPoolPanel.jsx',
      note: 'act param = the category id; the bus payload is the bare category string, exactly as the chip emits it.',
    },
  ),
  ctl(
    'assets.all-on',
    'assets',
    'ALL ON',
    'button',
    'Enables every asset (in the narrowed filter, the panel enables exactly the shown set).',
    {
      channel: bus('ASSETS_TOGGLE_ALL', true),
      reads: R('enabledAssets'),
      stress: 'probe',
      note: 'Registered channel is the un-narrowed emit; when a search/filter narrows the grid the panel instead emits ASSETS_BULK with the shown ids — same funnel, filter-dependent payload.',
      source: 'panels/AssetPoolPanel.jsx',
    },
  ),
  ctl(
    'assets.all-off',
    'assets',
    'ALL OFF',
    'button',
    'Disables every asset (in the narrowed filter, exactly the shown set).',
    {
      channel: bus('ASSETS_TOGGLE_ALL', false),
      reads: R('enabledAssets'),
      stress: 'probe',
      note: 'Same narrowing caveat as ALL ON.',
      source: 'panels/AssetPoolPanel.jsx',
    },
  ),
  ctl(
    'assets.category-weight',
    'assets',
    'Category weight L / M / H',
    'segmented',
    'Sets how heavily one category weighs in the deals.',
    {
      family: true,
      channel: bus('ASSETS_CATEGORY_WEIGHT', { category: '$param', weight: '$value' }),
      options: Object.freeze(['light', 'medium', 'heavy']),
      stress: 'probe',
      note: 'act param = the category the panel has selected (its local selection state); value = the weight class.',
      source: 'panels/AssetPoolPanel.jsx',
    },
  ),
  ctl('assets.search', 'assets', 'Search', 'select', 'Narrows the tile grid by name search.', {
    channel: bus('ASSETS_SEARCH', '$value'),
    reads: R('search'),
    source: 'panels/AssetPoolPanel.jsx',
    note: 'A text field registered as a value control: act value = the search string (empty clears).',
  }),
  ctl(
    'assets.facet-filter',
    'assets',
    'Facet filter chips',
    'toggle',
    'Narrows the grid by tag facet (form / family / vibe / medium).',
    {
      stress: 'probe',
      note: 'Panel-local filter state with no store/bus channel; the narrowing is view-only.',
      source: 'panels/AssetPoolPanel.jsx',
    },
  ),
  ctl('assets.role-filter', 'assets', 'Role filter chips', 'toggle', 'Narrows the grid by pool role (POOL / WILD).', {
    stress: 'probe',
    note: 'Panel-local filter state, view-only.',
    source: 'panels/AssetPoolPanel.jsx',
  }),
  ctl('assets.tile-toggle', 'assets', 'Asset tile (tap)', 'toggle', 'Enables or disables one asset in the pool.', {
    family: true,
    channel: bus('ASSETS_TOGGLE', { id: '$param' }),
    reads: R('enabledAssets'),
    source: 'panels/AssetPoolPanel.jsx',
    note: 'act param = the asset id (data/assets.js).',
  }),
  ctl(
    'assets.tile-solo',
    'assets',
    'Asset tile solo (⌥-tap / SOLO)',
    'button',
    'Solos one asset: it alone stays enabled.',
    {
      family: true,
      channel: bus('ASSETS_SOLO', { id: '$param' }),
      reads: R('enabledAssets'),
      stress: 'probe',
      note: 'Rewrites the whole enabled set; the standing script probes it rather than churning the pool.',
      source: 'panels/AssetPoolPanel.jsx',
    },
  ),
  ctl(
    'assets.tile-weight',
    'assets',
    'Asset tile weight pip',
    'button',
    'Cycles one asset’s deal weight: light, medium, heavy.',
    {
      family: true,
      channel: bus('ASSETS_WEIGHT_CYCLE', { id: '$param' }),
      reads: R('assetWeightOverrides'),
      source: 'panels/AssetPoolPanel.jsx',
      note: 'Three actuations return to the starting class.',
    },
  ),
  ctl(
    'assets.tile-still',
    'assets',
    'Asset tile STILL pip',
    'toggle',
    'Pins one asset as a still (it stops animating).',
    {
      family: true,
      channel: bus('ASSETS_STILL_TOGGLE', { id: '$param' }),
      reads: R('assetStill'),
      source: 'panels/AssetPoolPanel.jsx',
    },
  ),
  ctl(
    'assets.tile-option',
    'assets',
    'Asset tile option pip',
    'button',
    'Cycles one declared option of an asset (the options an asset itself declares).',
    {
      family: true,
      channel: bus('ASSETS_OPTION_CYCLE', { id: '$param.id', key: '$param.key' }),
      stress: 'probe',
      note: 'act param = { id, key } — the asset id and one of its declared option keys.',
      source: 'panels/AssetPoolPanel.jsx',
    },
  ),
  ctl('assets.tile-duplicate', 'assets', 'Asset tile duplicate', 'button', 'Duplicates a user asset.', {
    family: true,
    channel: bus('ASSETS_DUPLICATE', { id: '$param' }),
    stress: 'probe',
    note: 'Creates a new user asset; probed, not churned, by the standing script.',
    source: 'panels/AssetPoolPanel.jsx',
  }),
  ctl('assets.import', 'assets', 'Import (drop / click)', 'dialog', 'Imports image files as new assets.', {
    stress: 'skip',
    note: 'File IO (drop target and hidden file input); the session’s file-picker finding lives with issue 2479’s family — the A19 note in the session report.',
    source: 'panels/AssetPoolPanel.jsx',
  }),
  ctl('assets.new-studio', 'assets', '+ NEW (Asset Studio)', 'button', 'Opens the Asset Studio to draw a new asset.', {
    stress: 'skip',
    note: 'The open state is AssetPoolPanel-local; the Studio’s own controls are registered under the studio panel.',
    source: 'panels/AssetPoolPanel.jsx',
  }),
  ctl(
    'assets.open-wetlab',
    'assets',
    'MAKE A CREATURE (WetLab)',
    'button',
    'Opens the WetLab creature dialog on a tile (or the panel button for a blank rig).',
    {
      family: true,
      stress: 'skip',
      note: 'The open state is AssetPoolPanel-local (the dialog mounts on a dynamic import); the WetLab’s own controls are registered under the wetlab panel.',
      source: 'panels/AssetPoolPanel.jsx',
    },
  ),

  // ── inspector ─────────────────────────────────────────────────────────────
  ctl(
    'inspector.weight',
    'inspector',
    'Weight (light / med / heavy)',
    'segmented',
    'Sets the inspected asset’s deal weight.',
    {
      family: true,
      channel: bus('ASSETS_BULK', { ids: ['$param'], weight: '$value' }),
      options: Object.freeze(['light', 'medium', 'heavy']),
      stress: 'probe',
      note: 'act param = the asset id. The inspector rides the bulk funnel with a one-id list — the same emit the panel makes.',
      source: 'panels/AssetInspector.jsx',
    },
  ),
  ctl('inspector.toggle', 'inspector', 'On / off', 'toggle', 'Enables or disables the inspected asset.', {
    family: true,
    channel: bus('ASSETS_TOGGLE', { id: '$param' }),
    reads: R('enabledAssets'),
    stress: 'probe',
    source: 'panels/AssetInspector.jsx',
  }),
  ctl('inspector.solo', 'inspector', 'SOLO', 'button', 'Solos the inspected asset.', {
    family: true,
    channel: bus('ASSETS_SOLO', { id: '$param' }),
    stress: 'probe',
    source: 'panels/AssetInspector.jsx',
  }),
  ctl('inspector.still', 'inspector', 'STILL', 'toggle', 'Pins the inspected asset as a still.', {
    family: true,
    channel: bus('ASSETS_STILL_TOGGLE', { id: '$param' }),
    reads: R('assetStill'),
    stress: 'probe',
    source: 'panels/AssetInspector.jsx',
  }),
  ctl('inspector.duplicate', 'inspector', 'Duplicate', 'button', 'Duplicates the inspected user asset.', {
    family: true,
    channel: bus('ASSETS_DUPLICATE', { id: '$param' }),
    stress: 'probe',
    source: 'panels/AssetInspector.jsx',
  }),
  ctl(
    'inspector.tags',
    'inspector',
    'Tag chips (confirm / reject / free / remove)',
    'button',
    'Edits the inspected asset’s tags: confirms a suggested tag, rejects it, frees a canonical tag, or removes one.',
    {
      family: true,
      channel: bus('ASSETS_TAGS', { ids: ['$param'], edit: '$value' }),
      stress: 'probe',
      note: 'act value = the edit object the chip builds ({ op, facet, tag }); the op vocabulary is the panel’s own (confirm, remove, reject, free, unfree, clear).',
      source: 'panels/AssetInspector.jsx',
    },
  ),
  ctl('inspector.rename', 'inspector', 'Rename', 'dialog', 'Renames a user asset.', {
    family: true,
    channel: bus('ASSETS_RENAME', { id: '$param', name: '$value' }),
    stress: 'skip',
    note: 'Text entry against the performer’s own assets; not churned by the standing script.',
    source: 'panels/AssetInspector.jsx',
  }),
  ctl('inspector.delete', 'inspector', 'Delete', 'button', 'Deletes a user asset, behind a confirm prompt.', {
    family: true,
    channel: bus('ASSETS_REMOVE', { id: '$param' }),
    stress: 'skip',
    note: 'Destructive and confirm-gated on the panel.',
    source: 'panels/AssetInspector.jsx',
  }),
  ctl(
    'inspector.bulk-weight',
    'inspector',
    'Bulk bar — weight for selection',
    'segmented',
    'Sets the deal weight for every selected asset at once.',
    {
      family: true,
      channel: bus('ASSETS_BULK', { ids: '$param', weight: '$value' }),
      options: Object.freeze(['light', 'medium', 'heavy']),
      stress: 'probe',
      note: 'act param = an array of asset ids.',
      source: 'panels/AssetInspector.jsx',
    },
  ),
  ctl(
    'inspector.bulk-enabled',
    'inspector',
    'Bulk bar — ALL ON / ALL OFF for selection',
    'toggle',
    'Enables or disables every selected asset at once.',
    {
      family: true,
      channel: bus('ASSETS_BULK', { ids: '$param', enabled: '$value' }),
      stress: 'probe',
      note: 'act param = an array of asset ids; value = true/false.',
      source: 'panels/AssetInspector.jsx',
    },
  ),
  ctl(
    'inspector.bulk-tags',
    'inspector',
    'Bulk bar — tag ops for selection',
    'button',
    'Applies a tag edit (confirm-all, reject-all, reset, tag-all) to every selected asset.',
    {
      family: true,
      channel: bus('ASSETS_TAGS', { ids: '$param', edit: '$value' }),
      stress: 'probe',
      note: 'act param = an array of asset ids; value = the edit object.',
      source: 'panels/AssetInspector.jsx',
    },
  ),

  // ── shelf ─────────────────────────────────────────────────────────────────
  ctl(
    'shelf.fill-stage',
    'shelf',
    'KINETIC (fill the stage)',
    'button',
    'Deals a fresh stage of keeps from the whole collection.',
    {
      channel: apply('FILL_STAGE'),
      reads: R('keepStage'),
      source: 'panels/ShelfView.jsx',
      note: 'The shelf dispatches through useApp (the applyAction funnel); the bridge uses the same funnel.',
    },
  ),
  ctl(
    'shelf.swap-in',
    'shelf',
    'Swap a keep into a stage slot',
    'button',
    'Swaps the aimed stage slot for a chosen keep.',
    {
      family: true,
      channel: apply('SWAP_STAGE_SLOT', { outId: '$param.outId', inId: '$param.inId' }),
      reads: R('keepStage'),
      stress: 'probe',
      note: 'act param = { outId, inId } — the slot’s keep id and the incoming keep id.',
      source: 'panels/ShelfView.jsx',
    },
  ),
  ctl('shelf.stage-it', 'shelf', 'Stage it', 'button', 'Promotes a keep into a free stage slot.', {
    family: true,
    channel: apply('STAGE_KEEP', { keepId: '$param' }),
    reads: R('keepStage'),
    stress: 'probe',
    source: 'panels/ShelfView.jsx',
  }),
  ctl('shelf.load', 'shelf', 'Load (recall a keep)', 'button', 'Recalls a keep’s full stage state.', {
    family: true,
    channel: apply('RECALL_FAVORITE', { favorite: '$param' }),
    stress: 'probe',
    note: 'act param = the keep (favourite) object, read from state.',
    source: 'panels/ShelfView.jsx',
  }),
  ctl('shelf.notice-dismiss', 'shelf', 'Notice dismiss (ok)', 'button', 'Dismisses the shelf notice line.', {
    channel: store('setShelfNotice', [null]),
    reads: R('shelfNotice'),
    source: 'panels/ShelfView.jsx',
  }),
  ctl(
    'shelf.local-ui',
    'shelf',
    'Open / expand / search / sort / aim',
    'dialog',
    'The shelf’s own view controls: opening the shelf, expanding rows, searching, sorting, aiming a slot.',
    {
      stress: 'skip',
      note: 'ShelfView-local React state with no store/bus channel; the state-changing shelf actions are the entries above.',
      source: 'panels/ShelfView.jsx',
    },
  ),
]);

// ── build (appended chunk) ────────────────────────────────────────────────────

export const UI_CONTROLS_3 = Object.freeze([
  ctl(
    'build.layout-mode',
    'build',
    'Layout tiles',
    'segmented',
    'Chooses the composition: how the marks are arranged on the dish.',
    {
      channel: bus('MODE_LOAD', { id: '$value' }),
      options: Object.freeze([
        'random',
        'grid',
        'fibonacci',
        'radial',
        'noise',
        'stratified',
        'flow',
        'rails',
        'layers',
        'ca',
        'orbit',
        'abacus',
        'dla',
        'eden',
        'voronoi-cells',
      ]),
      reads: R('layoutParams.mode'),
      source: 'panels/layout/CompositionTiles.jsx',
      note: 'The tiles are a subset of the full mode vocabulary (LAYOUT_MODES in data/layout-modes.js); the remaining modes arrive via voices and shape loads.',
    },
  ),
  lpRow('count', 'COUNT', 'count', 'How many marks the layout deals.', {
    stops: Object.freeze([10, 120, 240, 800]),
    range: rng(10, 800, 1),
  }),
  ctl('build.scale', 'build', 'SCALE', 'dialog', 'The size range of the marks (exact editor: X, and Y when split).', {
    channel: lp('scale'),
    reads: R('layoutParams.scale'),
    walk: Object.freeze([
      Object.freeze({ x: Object.freeze([0.05, 6]), y: Object.freeze([0.05, 6]) }),
      Object.freeze({ x: Object.freeze([1, 1]), y: Object.freeze([1, 1]) }),
    ]),
    source: 'panels/layout/LayoutSliders.jsx',
    note: 'Value is the canonical { x: [lo, hi], y: [lo, hi] } the dual editor emits; the LINKED/SPLIT pip on the panel is the same emit with x mirrored to y.',
  }),
  ctl('build.rotate', 'build', 'ROTATE', 'dialog', 'The rotation range of the marks, in degrees (exact editor).', {
    channel: lp('rotate'),
    reads: R('layoutParams.rotate'),
    walk: Object.freeze([Object.freeze([-720, 720]), Object.freeze([0, 0])]),
    source: 'panels/layout/LayoutSliders.jsx',
    note: 'Value is the [lo, hi] pair the dual editor emits.',
  }),
  ctl('build.rotate-spin', 'build', 'SPIN', 'segmented', 'Slow continuous spin of the marks.', {
    channel: lp('rotateSpin'),
    options: Object.freeze([0, 0.05]),
    reads: R('layoutParams.rotateSpin'),
    source: 'panels/layout/LayoutSliders.jsx',
    note: 'ON emits the spin start rate 0.05; the speed slider below writes the same key.',
  }),
  ctl(
    'build.spin-speed',
    'build',
    'Spin speed',
    'slider',
    'How fast the spin turns (shown inside the ROTATE editor while spin is on).',
    {
      channel: lp('rotateSpin'),
      range: rng(0, 1, 0.01),
      reads: R('layoutParams.rotateSpin'),
      source: 'panels/layout/LayoutSliders.jsx',
    },
  ),
  ctl('build.alpha', 'build', 'ALPHA', 'dialog', 'The opacity range of the marks, percent (exact editor).', {
    channel: lp('alpha'),
    reads: R('layoutParams.alpha'),
    walk: Object.freeze([Object.freeze([0, 100]), Object.freeze([20, 80])]),
    source: 'panels/layout/LayoutSliders.jsx',
    note: 'Value is the [lo, hi] pair the dual editor emits.',
  }),
  lpRow('jitter', 'JITTER', 'jitter', 'How far marks stray from their layout positions.', {
    stops: Object.freeze([0, 24, 80, 200]),
    range: rng(0, 200, 1),
  }),
  lpRow('density', 'DENSITY', 'density', 'How densely the marks pack, percent.', {
    stops: Object.freeze([10, 40, 78, 100]),
    range: rng(10, 100, 1),
  }),
  lpRow('ground', 'GROUND', 'groundLean', 'How hard marks lean on the pattern ground beneath them.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    note: 'The row is disabled on the panel unless a PATTERN layer sits below; the layout param itself always lands.',
  }),
  lpRow('edge', 'EDGE', 'groundNudge', 'How far marks are nudged along the ground’s edges.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    note: 'Same pattern-below gating as GROUND.',
  }),
  lpRow('shadow', 'SHADOW', 'groundShadow', 'How strongly the ground throws shadows onto the marks.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    note: 'Same pattern-below gating as GROUND.',
  }),
  lpRow('snap', 'SNAP', 'groundSnap', 'How hard marks snap to the ground’s grid.', {
    stops: Object.freeze([0, 0.25, 0.5, 1]),
    range: rng(0, 1, 0.01),
    note: 'Same pattern-below gating as GROUND.',
  }),
  lpRow('weather', 'WEATHER', 'weatherAir', 'How much the weather (haze) layer above pushes air through the marks.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    note: 'The row is disabled unless an FX layer with HAZE sits above; the param itself always lands.',
  }),
  lpRow('rift', 'RIFT', 'riftShear', 'How much the tear layer above shears the marks.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    note: 'The row is disabled unless an FX layer with TEAR sits above; the param itself always lands.',
  }),
  ctl(
    'build.divergence',
    'build',
    'DIVERGENCE',
    'dialog',
    'The phyllotaxis divergence angle, degrees (phyllotaxis mode only).',
    {
      channel: lp('phylloDivergence'),
      range: rng(-20, 20, 0.1),
      reads: R('layoutParams.phylloDivergence'),
      source: 'panels/layout/LayoutSliders.jsx',
    },
  ),
  ctl('build.mirror', 'build', 'Mirror', 'segmented', 'Mirrors the layout across an axis.', {
    channel: lp('mirror'),
    options: MIRROR_STATES,
    reads: R('layoutParams.mirror'),
    source: 'panels/layout/ChipRows.jsx',
  }),
  ctl(
    'build.symmetry',
    'build',
    'Symmetry',
    'segmented',
    'Repeats the layout with rotational or kaleidoscope symmetry.',
    {
      channel: lp('symmetry'),
      options: ids(SYMMETRY_MODES),
      reads: R('layoutParams.symmetry'),
      source: 'panels/layout/ChipRows.jsx',
    },
  ),
  ctl('build.bleed', 'build', 'Bleed', 'toggle', 'Lets marks bleed past the dish edge.', {
    channel: lp('bleed', '$toggle'),
    reads: R('layoutParams.bleed'),
    source: 'panels/layout/StructureToggles.jsx',
  }),
  ctl('build.overlap', 'build', 'Overlap', 'toggle', 'Lets marks overlap each other.', {
    channel: lp('overlap', '$toggle'),
    reads: R('layoutParams.overlap'),
    source: 'panels/layout/StructureToggles.jsx',
  }),
  ctl(
    'build.lock',
    'build',
    'Lock pip (▫ / ▪)',
    'toggle',
    'Locks one layout param so deals and rolls leave it alone. One pip per param row.',
    {
      family: true,
      channel: bus('LAYOUT_LOCK', { key: '$param' }),
      reads: R('lockedParams'),
      source: 'panels/layout/LayoutSliders.jsx',
      note: 'act param = the layout param key (e.g. count).',
    },
  ),
  ctl(
    'build.shapes-cycle',
    'build',
    'Shape chips (mixable)',
    'button',
    'Cycles a shape set’s mix level: off, 1, 2, 3 (up to four sets mix at once).',
    {
      family: true,
      channel: bus('SHAPES_CYCLE', { id: '$param' }),
      stress: 'probe',
      note: 'act param = the shape set id; levels are read from the live pool, not a store key the bridge can verify cheaply.',
      source: 'panels/layout/ShapesShelf.jsx',
    },
  ),
  ctl(
    'build.shapes-load',
    'build',
    'Shape chips (flagship)',
    'button',
    'Loads a flagship shape voice (swarm, hype, murmur, dark glass) outright.',
    {
      family: true,
      channel: bus('SHAPES_LOAD', { id: '$param' }),
      stress: 'probe',
      source: 'panels/layout/ShapesShelf.jsx',
    },
  ),
  ctl('build.voice-load', 'build', 'My voices — chip', 'button', 'Loads one of your saved voices.', {
    family: true,
    channel: bus('VOICE_LOAD', { id: '$param' }),
    reads: R('activeVoiceId'),
    stress: 'probe',
    note: 'The starter voice tile is walked under directors.voice-load; saved voices exist only when the performer has captured some.',
    source: 'panels/layout/VoicesShelf.jsx',
  }),
  ctl(
    'build.voice-capture',
    'build',
    'My voices — + (capture)',
    'button',
    'Captures the current look as a saved voice (up to 12).',
    {
      channel: store('captureUserVoice'),
      reads: R('userVoices'),
      stress: 'probe',
      source: 'panels/layout/VoicesShelf.jsx',
    },
  ),
  ctl(
    'build.voice-overwrite',
    'build',
    'My voices — chip (long-press)',
    'button',
    'Overwrites a saved voice with the current look.',
    {
      family: true,
      channel: store('overwriteUserVoice', ['$param']),
      stress: 'probe',
      note: 'Long-press on the panel; rewrites the performer’s saved voice.',
      source: 'panels/layout/VoicesShelf.jsx',
    },
  ),
  ctl('build.voice-rename', 'build', 'My voices — rename', 'dialog', 'Renames a saved voice.', {
    family: true,
    channel: bus('VOICE_RENAME', { id: '$param', name: '$value' }),
    stress: 'skip',
    note: 'Text entry against the performer’s own voices.',
    source: 'panels/layout/VoicesShelf.jsx',
  }),
  ctl(
    'build.voice-delete',
    'build',
    'My voices — × (delete)',
    'button',
    'Deletes a saved voice, behind a confirm prompt.',
    {
      family: true,
      channel: bus('VOICE_DELETE', { id: '$param' }),
      stress: 'skip',
      note: 'Destructive and confirm-gated on the panel.',
      source: 'panels/layout/VoicesShelf.jsx',
    },
  ),
  ctl(
    'build.voice-mix',
    'build',
    'Voice mix slider',
    'slider',
    'Blends between the standing voice and a tapped one while a mix is in flight.',
    {
      channel: bus('VOICE_MIX', { t: '$value' }),
      range: rng(0, 1, 0.001),
      reads: R('voiceMix'),
      stress: 'probe',
      note: 'Only live while a voice mix exists; the panel renders it then.',
      source: 'panels/layout/MixBar.jsx',
    },
  ),
  ctl('build.mix-resume', 'build', 'Mix resume (⏵)', 'button', 'Resumes an interrupted voice mix.', {
    channel: store('resumeVoiceMix'),
    stress: 'probe',
    source: 'panels/layout/MixBar.jsx',
  }),
  ctl('build.mix-cancel', 'build', 'Mix cancel (✕)', 'button', 'Cancels the voice mix in flight.', {
    channel: store('cancelVoiceMix'),
    reads: R('voiceMix'),
    stress: 'probe',
    source: 'panels/layout/MixBar.jsx',
  }),

  // strata (one family per repeated control; act param = the layer id unless noted)
  ctl(
    'build.layer-select',
    'build',
    'Stratum header (select)',
    'button',
    'Selects a stratum for editing; the event depends on the stratum’s own kind, exactly as the panel picks it.',
    {
      family: true,
      channel: recipe('selectLayer'),
      reads: R('activeLayerId', 'selectedFxLayerId', 'selectedMathLayerId', 'selectedPatternLayerId'),
      stress: 'probe',
      source: 'panels/build/LayerStack.jsx',
    },
  ),
  ctl(
    'build.layer-move',
    'build',
    'Stratum ▲ / ▼ (reorder)',
    'button',
    'Moves a stratum toward the front or the ground, within its own kind’s group.',
    {
      family: true,
      channel: bus('LAYER_SWAP_POSITIONS', { idA: '$param.a', idB: '$param.b' }),
      reads: R('layers'),
      stress: 'probe',
      note: 'act param = { a, b } — the stratum id and its neighbour’s id.',
      source: 'panels/build/LayerStack.jsx',
    },
  ),
  ctl('build.layer-visible', 'build', 'Stratum ● / ○ (visibility)', 'toggle', 'Shows or hides one stratum.', {
    family: true,
    channel: bus('LAYER_TOGGLE_VISIBLE', { id: '$param' }),
    reads: R('layers'),
    source: 'panels/build/LayerStack.jsx',
  }),
  ctl('build.layer-solo', 'build', 'Stratum S (solo)', 'toggle', 'Solos one stratum: the others hide.', {
    family: true,
    channel: bus('LAYER_SOLO', { id: '$param' }),
    reads: R('layers'),
    stress: 'probe',
    note: 'The channel is the panel’s own, but a walk cannot observe it: the content cap is 1 (the layers slice refuses a second KC track, always), so the only soloable content stratum is already solo by construction and both directions land on the same state. MATH strata can solo observably; the family is probed rather than walked blind.',
    source: 'panels/build/LayerStack.jsx',
  }),
  ctl(
    'build.layer-feeds-accum',
    'build',
    'Stratum ≈ FEEDS ACCUM',
    'toggle',
    'Whether this stratum feeds the accumulation trails.',
    {
      family: true,
      channel: bus('LAYER_TOGGLE_FEEDS_ACCUM', { id: '$param' }),
      reads: R('layers'),
      source: 'panels/build/LayerStack.jsx',
    },
  ),
  ctl('build.layer-duplicate', 'build', 'Stratum dup', 'button', 'Duplicates one stratum (track caps apply).', {
    family: true,
    channel: bus('LAYER_DUPLICATE', { id: '$param' }),
    reads: R('layers'),
    stress: 'probe',
    source: 'panels/build/LayerStack.jsx',
  }),
  ctl('build.layer-remove', 'build', 'Stratum × (remove)', 'button', 'Removes one stratum.', {
    family: true,
    channel: bus('LAYER_REMOVE', { id: '$param' }),
    stress: 'skip',
    note: 'Destructive to the composition; exercised by hand.',
    source: 'panels/build/LayerStack.jsx',
  }),
  ctl(
    'build.layer-blend',
    'build',
    'Stratum blend mode',
    'select',
    'How one content stratum blends with what is under it.',
    {
      family: true,
      channel: bus('LAYER_SET_BLEND_MODE', { id: '$param', mode: '$value' }),
      options: BLEND_MODES,
      reads: R('layers'),
      source: 'panels/build/LayerStack.jsx',
    },
  ),
  ctl('build.layer-wet-soak', 'build', 'Stratum WET (soak)', 'toggle', 'Soaks one stratum into the wet medium.', {
    family: true,
    channel: bus('LAYER_TOGGLE_WET_SOAK', { id: '$param' }),
    reads: R('layers'),
    source: 'panels/build/LayerStack.jsx',
  }),
  ctl(
    'build.layer-opacity',
    'build',
    'Stratum wet (opacity)',
    'segmented',
    'How opaque one soaked stratum is (its wet amount).',
    {
      family: true,
      channel: bus('LAYER_SET_OPACITY', { id: '$param', opacity: '$value' }),
      options: WET_STOPS,
      reads: R('layers'),
      source: 'panels/build/LayerStack.jsx',
      note: 'On the panel the stops scale by the stratum’s wet cap; the values here are the full-cap stops the row emits at cap 1.',
    },
  ),
  ctl(
    'build.layer-rotation',
    'build',
    'Stratum rotate',
    'segmented',
    'Rotates one whole stratum in fixed steps, degrees.',
    {
      family: true,
      channel: bus('LAYER_SET_ROTATION', { id: '$param', rotation: '$value' }),
      options: STRATUM_ROTATIONS,
      reads: R('layers'),
      source: 'panels/build/LayerStack.jsx',
    },
  ),
  ctl(
    'build.layer-patch',
    'build',
    'Stratum patch (mode / target / strength)',
    'select',
    'Patches one stratum into another: modulate, field, or feed, with a strength.',
    {
      family: true,
      channel: bus('LAYER_PATCH', { id: '$param', patch: '$value' }),
      stress: 'probe',
      note: 'act value = the whole patch object ({ mode, to, strength }); the panel’s three controls each emit it whole with one field changed.',
      source: 'panels/build/LayerStack.jsx',
    },
  ),
  ctl('build.layer-fx-add', 'build', 'FX stratum — add effect', 'button', 'Adds an effect to an FX stratum’s stack.', {
    family: true,
    channel: bus('FX_EFFECT_ADD', { layerId: '$param', kind: '$value' }),
    stress: 'probe',
    note: 'act param = the FX layer id; value = the effect kind.',
    source: 'panels/build/LayerStack.jsx',
  }),
  ctl(
    'build.layer-fx-remove',
    'build',
    'FX stratum — effect ✕',
    'button',
    'Removes one effect from an FX stratum’s stack.',
    {
      family: true,
      channel: bus('FX_EFFECT_REMOVE', { layerId: '$param', index: '$value' }),
      stress: 'skip',
      note: 'Destructive to the stratum’s effect stack; exercised by hand.',
      source: 'panels/build/LayerStack.jsx',
    },
  ),
  ctl(
    'build.layer-fx-param',
    'build',
    'FX stratum — effect param',
    'segmented',
    'Sets one parameter of one effect on an FX stratum.',
    {
      family: true,
      channel: bus('FX_EFFECT_SET_PARAM', {
        layerId: '$param.layerId',
        index: '$param.index',
        key: '$param.key',
        value: '$value',
      }),
      stress: 'probe',
      note: 'act param = { layerId, index, key }; the param vocabulary and ranges are the effect definitions’ own (FX_EFFECT_DEFS).',
      source: 'panels/build/LayerStack.jsx',
    },
  ),
  ctl(
    'build.add-stratum',
    'build',
    '+ ADD STRATUM',
    'button',
    'Adds a stratum of the last-used kind (long-press on the panel picks the kind; caps apply).',
    {
      channel: bus('LAYER_ADD'),
      reads: R('layers'),
      stress: 'probe',
      note: 'Registered channel is the content-track add (the default kind); FX / MATH / PATTERN adds emit LAYER_ADD_FX / LAYER_ADD_MATH / PATTERN_ADD from the panel’s long-press chooser. Content adds are refused at one KC track by the slice’s cap, and any add can be refused by the tape pre-flight — a lawful no-op, which is why this is probed, not walked.',
      source: 'panels/build/LayerStack.jsx',
    },
  ),
  ctl(
    'build.dish',
    'build',
    'Stratum dish ON / OFF',
    'segmented',
    'Whether the dish physics (contact) apply to a stratum.',
    {
      channel: lp('dish'),
      options: Object.freeze([true, false]),
      reads: R('layoutParams.dish'),
      source: 'panels/build/LayerStack.jsx',
      note: 'An unset dish param reads as on (the panel treats dish !== false as on); the first bridge toggle therefore writes an explicit true.',
    },
  ),
  lpRow('bounce', 'Dish bounce', 'contactRestitution', 'How bouncy dish contact is.', {
    stops: Object.freeze([0, 0.25, 0.5, 1]),
    range: rng(0, 1, 0.01),
    source: 'panels/build/LayerStack.jsx',
  }),
  lpRow('repel', 'Dish repel', 'contactRepel', 'How hard dish contact pushes marks apart.', {
    stops: Object.freeze([0, 1, 2.5, 5]),
    range: rng(0, 5, 0.05),
    source: 'panels/build/LayerStack.jsx',
  }),
  lpRow('dish-tempo', 'Dish tempo', 'dishTempo', 'How fast the dish contact sim runs.', {
    stops: Object.freeze([0, 0.3, 0.6, 1]),
    range: rng(0, 1, 0.01),
    source: 'panels/build/LayerStack.jsx',
  }),

  ctl('build.motion', 'build', 'Motion shelf', 'segmented', 'Chooses the motion the marks move with.', {
    channel: bus('MOTION_LOAD', { id: '$value' }),
    options: ids(MOTION_MODES),
    source: 'panels/layout/MotionShelf.jsx',
    note: 'A motion load rewrites several layout params at once (the motion’s genes); there is no single read key, so the bridge verifies by the stage read.',
  }),
  ctl('build.behave', 'build', 'Behave', 'segmented', 'The marks’ behaviour profile.', {
    channel: lp('behave'),
    options: BEHAVE_MODES,
    reads: R('layoutParams.behave'),
    source: 'panels/layout/ChipRows.jsx',
  }),

  // swarm physics
  lpRow('particles', 'PARTICLES', 'particleCount', 'How many particles the swarm modes carry.', {
    stops: Object.freeze([10, 80, 150, 400]),
    range: rng(10, 500, 5),
    source: 'panels/layout/SwarmSliders.jsx',
    note: 'Live in swarm / murmuration / hype modes; the param lands in every mode.',
  }),
  lpRow('cohesion', 'COHESION', 'swarmCohesion', 'How strongly swarm particles hold together.', {
    stops: Object.freeze([0, 0.2, 0.4, 0.6]),
    range: rng(0, 0.6, 0.05),
    source: 'panels/layout/SwarmSliders.jsx',
  }),
  lpRow('gravity', 'GRAVITY', 'gravityWells', 'The strength of the swarm’s gravity wells.', {
    stops: Object.freeze([0, 1, 2.5, 5]),
    range: rng(0, 5, 0.1),
    source: 'panels/layout/SwarmSliders.jsx',
  }),
  lpRow('damping', 'DAMPING', 'damping', 'How much the swarm’s motion damps (higher stops = less damping).', {
    stops: Object.freeze([0.95, 0.93, 0.89, 0.83]),
    range: rng(0.8, 0.99, 0.01),
    source: 'panels/layout/SwarmSliders.jsx',
  }),
  lpRow('noise-speed', 'NOISE SPEED', 'noiseSpeed', 'How fast the swarm’s noise field evolves.', {
    stops: Object.freeze([0.1, 0.5, 1.2, 3]),
    range: rng(0.1, 3, 0.1),
    source: 'panels/layout/SwarmSliders.jsx',
  }),

  // accum family
  ctl('build.accum', 'build', 'ACCUM', 'toggle', 'Turns accumulation trails on or off.', {
    channel: lp('accumulation', '$toggle'),
    reads: R('layoutParams.accumulation'),
    deferRestore: true,
    source: 'panels/layout/AccumFamily.jsx',
  }),
  ctl(
    'build.trail',
    'build',
    'Trail style',
    'segmented',
    'The trail shape accumulation leaves (re-tapping the lit style returns to plain accum).',
    {
      channel: lp('trail'),
      options: Object.freeze(['leave', 'ribbon', 'comet']),
      reads: R('layoutParams.trail'),
      source: 'panels/layout/AccumFamily.jsx',
    },
  ),
  lpRow('echoes', 'ECHOES', 'echoes', 'How many echo copies trail each mark.', {
    stops: Object.freeze([0, 1, 2, 4]),
    range: rng(0, 4, 1),
    source: 'panels/layout/AccumFamily.jsx',
  }),
  lpRow('accum-scan', 'SCAN', 'accumScan', 'How much the accumulation scans back through the deep past.', {
    stops: Object.freeze([0, 0.3, 0.65, 1]),
    range: rng(0, 1, 0.01),
    source: 'panels/layout/AccumFamily.jsx',
  }),
  ctl('build.deep-past', 'build', 'Deep past direction', 'segmented', 'Which way the deep-past scan reads.', {
    channel: lp('accumScanFlip'),
    options: Object.freeze([false, true]),
    reads: R('layoutParams.accumScanFlip'),
    source: 'panels/layout/AccumFamily.jsx',
    note: 'Option values are the emitted booleans; the labels shown are RIGHT (false) and LEFT (true).',
  }),
  lpRow('trail-fade', 'TRAIL FADE', 'leaveFade', 'How fast leave-trails fade.', {
    stops: Object.freeze([0, 0.05, 0.1, 0.2]),
    range: rng(0, 0.2, 0.01),
    source: 'panels/layout/AccumFamily.jsx',
  }),
  lpRow('tunnel-fade', 'TUNNEL FADE', 'tunnelFade', 'How fast tunnel trails fade.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    source: 'panels/layout/AccumFamily.jsx',
  }),
  lpRow('prism-fade', 'PRISM FADE', 'prismFade', 'How fast prism trails fade.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    source: 'panels/layout/AccumFamily.jsx',
  }),
  lpRow('flow-fade', 'FLOW FADE', 'flowFade', 'How fast flow trails fade.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    source: 'panels/layout/AccumFamily.jsx',
  }),
  lpRow(
    'accum-fade',
    'ACCUM FADE',
    'accumulationFade',
    'The accumulation half-life: how long trails persist, in frames at the stops.',
    {
      stops: Object.freeze([1, 3, 5.4, 20]),
      range: rng(1, 40, 1),
      source: 'panels/layout/AccumFamily.jsx',
      note: 'The exact editor writes through a taper over 1–40 frames; the segments emit the stop values directly.',
    },
  ),
  lpRow('glow', 'GLOW', 'accumulationOptics', 'The glow the accumulation adds.', {
    stops: Object.freeze([0, 0.04, 0.1, 0.25]),
    range: rng(0, 0.25, 0.01),
    source: 'panels/layout/AccumFamily.jsx',
  }),
  lpRow('wetness', 'WETNESS', 'accumulationWetness', 'How wet the accumulation looks.', {
    stops: Object.freeze([0, 0.15, 0.45, 1]),
    range: rng(0, 1, 0.01),
    source: 'panels/layout/AccumFamily.jsx',
  }),
  lpRow('tunnel', 'TUNNEL', 'accumulationTunnel', 'The tunnel pull inside the accumulation.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    source: 'panels/layout/AccumFamily.jsx',
  }),
  lpRow('prism', 'PRISM', 'accumulationPrism', 'The prism split inside the accumulation.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    source: 'panels/layout/AccumFamily.jsx',
  }),
  lpRow('curl', 'CURL', 'accumulationFlow', 'The curl flow inside the accumulation.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    source: 'panels/layout/AccumFamily.jsx',
  }),
  lpRow('crooked', 'CROOKED', 'crooked', 'How crooked the marks sit.', {
    stops: Object.freeze([0, 0.25, 0.55, 1]),
    range: rng(0, 1, 0.01),
    source: 'panels/layout/AppearanceSliders.jsx',
  }),
  lpRow('squash', 'SQUASH', 'squash', 'How squashed the marks are.', {
    stops: Object.freeze([0, 0.3, 0.65, 1]),
    range: rng(0, 1, 0.05),
    source: 'panels/layout/AppearanceSliders.jsx',
  }),

  // chiaroscuro / sun
  ctl('build.sun', 'build', 'Sun ON / OFF', 'toggle', 'Turns the chiaroscuro sun on or off.', {
    channel: bus('LIGHT_SET', '$toggle'),
    reads: R('light'),
    deferRestore: true,
    source: 'panels/layout/SunControls.jsx',
    note: 'The emit payload is the bare boolean, exactly as the panel emits it. The sun sliders below read through the light object this creates.',
  }),
  ctl('build.sun-x', 'build', 'SUN X', 'slider', 'The sun’s horizontal position.', {
    channel: bus('LIGHT_SET', { x: '$value' }),
    range: rng(-500, 1500, 1),
    reads: R('light.x'),
    source: 'panels/layout/SunControls.jsx',
  }),
  ctl('build.sun-y', 'build', 'SUN Y', 'slider', 'The sun’s vertical position.', {
    channel: bus('LIGHT_SET', { y: '$value' }),
    range: rng(-500, 1200, 1),
    reads: R('light.y'),
    source: 'panels/layout/SunControls.jsx',
  }),
  ctl('build.sun-height', 'build', 'HEIGHT', 'slider', 'The sun’s height above the dish.', {
    channel: bus('LIGHT_SET', { height: '$value' }),
    range: rng(20, 1000, 1),
    reads: R('light.height'),
    source: 'panels/layout/SunControls.jsx',
  }),
  ctl('build.sun-intensity', 'build', 'INTENSITY', 'slider', 'The sun’s intensity.', {
    channel: bus('LIGHT_SET', { intensity: '$value' }),
    range: rng(0, 1, 0.01),
    reads: R('light.intensity'),
    source: 'panels/layout/SunControls.jsx',
  }),
  ctl('build.sun-ambient', 'build', 'AMBIENT', 'slider', 'The ambient light level.', {
    channel: bus('LIGHT_SET', { ambient: '$value' }),
    range: rng(0, 1, 0.01),
    reads: R('light.ambient'),
    source: 'panels/layout/SunControls.jsx',
  }),
  ctl('build.sun-bevel', 'build', 'BEVEL', 'slider', 'The bevel the sun carves on the marks.', {
    channel: bus('LIGHT_SET', { bevel: '$value' }),
    range: rng(0, 1, 0.01),
    reads: R('light.bevel'),
    source: 'panels/layout/SunControls.jsx',
  }),
  ctl('build.sun-spec', 'build', 'SPEC', 'slider', 'The specular shine from the sun.', {
    channel: bus('LIGHT_SET', { spec: '$value' }),
    range: rng(0, 1, 0.01),
    reads: R('light.spec'),
    source: 'panels/layout/SunControls.jsx',
  }),
  ctl('build.sun-pool', 'build', 'POOL', 'slider', 'The pool of light around the sun.', {
    channel: bus('LIGHT_SET', { pool: '$value' }),
    range: rng(0, 1, 0.01),
    reads: R('light.pool'),
    source: 'panels/layout/SunControls.jsx',
  }),
  ctl('build.sun-colour', 'build', 'Sun colour', 'segmented', 'The sun’s colour: white, ink, or a palette swatch.', {
    channel: bus('LIGHT_SET', { slot: '$value' }),
    options: LIGHT_SLOTS,
    reads: R('light.slot'),
    stress: 'probe',
    source: 'panels/layout/SunControls.jsx',
  }),
  ctl('build.hue-rotate', 'build', 'Hue rotate (dial)', 'slider', 'Rotates every hue on the stage, degrees.', {
    channel: lp('hueRotate'),
    range: rng(0, 360, 1),
    reads: R('layoutParams.hueRotate'),
    source: 'panels/layout/ChiaroscuroSection.jsx',
  }),
  ctl(
    'build.chiaroscuro-open',
    'build',
    'CHIAROSCURO (editor)',
    'dialog',
    'Opens the floating chiaroscuro editor over the canvas.',
    {
      stress: 'skip',
      note: 'Open state is component-local; the editor’s controls are the sun and hue entries above.',
      source: 'panels/layout/ChiaroscuroSection.jsx',
    },
  ),

  // field map
  ctl('build.map-field', 'build', 'Map — field', 'segmented', 'Which field the map reads: noise or density.', {
    channel: lp('fieldMapField'),
    options: FIELDMAP_FIELDS,
    reads: R('layoutParams.fieldMapField'),
    source: 'panels/layout/MapRow.jsx',
  }),
  ctl(
    'build.map-channel',
    'build',
    'Map — channel',
    'segmented',
    'Which mark channel the field drives: weight, saturation, or scale.',
    {
      channel: lp('fieldMapChannel'),
      options: FIELDMAP_CHANNELS,
      reads: R('layoutParams.fieldMapChannel'),
      source: 'panels/layout/MapRow.jsx',
    },
  ),
  ctl('build.map-amount', 'build', 'Map — AMOUNT', 'slider', 'How strongly the field map drives the channel.', {
    channel: lp('fieldMapAmount'),
    range: rng(0, 1, 0.01),
    reads: R('layoutParams.fieldMapAmount'),
    source: 'panels/layout/MapRow.jsx',
  }),

  // math macros
  ctl(
    'build.macro-add',
    'build',
    '+ MACRO',
    'button',
    'Adds a macro knob (up to four) that can drive params by hand or by learn.',
    {
      channel: bus('MACRO_ADD'),
      reads: R('mathMacros'),
      stress: 'probe',
      source: 'panels/build/MathSection.jsx',
    },
  ),
  ctl(
    'build.macro-drive',
    'build',
    'Macro knob (drag / arrows)',
    'slider',
    'Jogs a macro: the knob’s throw drives every assigned target at once.',
    {
      family: true,
      channel: store('driveMathMacro', ['$param', '$value']),
      range: rng(-1, 1, 0.05),
      stress: 'probe',
      note: 'act param = the macro id; value = a jog delta, the same increment the drag and arrow keys produce.',
      source: 'components/MacroKnob.jsx',
    },
  ),
  ctl(
    'build.macro-learn',
    'build',
    'Macro LEARN',
    'toggle',
    'Arms learn on a macro: the next param you touch gets assigned to it.',
    {
      family: true,
      channel: store('mathLearnArm', ['$param']),
      reads: R('mathLearnArmed'),
      stress: 'probe',
      source: 'components/MacroKnob.jsx',
    },
  ),
  ctl('build.macro-rename', 'build', 'Macro name', 'dialog', 'Renames a macro knob.', {
    family: true,
    channel: bus('MACRO_RENAME', { id: '$param', name: '$value' }),
    stress: 'skip',
    note: 'Text entry.',
    source: 'components/MacroKnob.jsx',
  }),
  ctl('build.macro-remove', 'build', 'Macro × (delete)', 'button', 'Deletes a macro knob.', {
    family: true,
    channel: bus('MACRO_REMOVE', { id: '$param' }),
    stress: 'skip',
    note: 'Destructive to the performer’s macro setup.',
    source: 'components/MacroKnob.jsx',
  }),
  ctl(
    'build.macro-invert',
    'build',
    'Macro target ⇈ / ⇅ (invert)',
    'toggle',
    'Inverts one target’s direction on a macro.',
    {
      family: true,
      channel: store('mathToggleInvert', ['$param.macroId', '$param.key']),
      stress: 'probe',
      note: 'act param = { macroId, key }.',
      source: 'components/MacroKnob.jsx',
    },
  ),
  ctl('build.macro-unassign', 'build', 'Macro target × (unassign)', 'button', 'Unassigns one target from a macro.', {
    family: true,
    channel: store('mathUnassign', ['$param.macroId', '$param.key']),
    stress: 'skip',
    note: 'act param = { macroId, key }. Destructive to the macro’s assignments.',
    source: 'components/MacroKnob.jsx',
  }),
]);

// ── play + pipeline (appended chunk) ──────────────────────────────────────────

export const UI_CONTROLS_4 = Object.freeze([
  // ── play ──────────────────────────────────────────────────────────────────
  ctl(
    'play.queue-toggle',
    'play',
    'Queue play / pause',
    'toggle',
    'Plays or pauses the hits queue: the setlist deals itself, hit after hit.',
    {
      channel: bus('QUEUE_TOGGLE'),
      reads: R('queuePlaying'),
      source: 'panels/davis/QueueTransport.jsx',
      note: 'On start the transport also jumps the queue and recalls or morphs to the current hit — that choreography depends on queue state; the registered channel is the toggle the button emits first and always.',
    },
  ),
  ctl(
    'play.queue-source',
    'play',
    'Queue source TIME / BEAT',
    'segmented',
    'Whether the queue advances by the clock or by the beat.',
    {
      channel: bus('QUEUE_SOURCE', { source: '$value' }),
      options: Object.freeze(['time', 'beat']),
      reads: R('queueSource'),
      source: 'panels/davis/QueueTransport.jsx',
    },
  ),
  ctl(
    'play.hold',
    'play',
    'HOLD (seconds per hit)',
    'slider',
    'How long each hit holds before the queue moves on, seconds.',
    {
      channel: bus('QUEUE_SECONDS', { seconds: '$value' }),
      range: rng(QUEUE_SECONDS_MIN, QUEUE_SECONDS_MAX, 1),
      reads: R('queueSecondsPerHit'),
      source: 'panels/davis/QueueTransport.jsx',
    },
  ),
  ctl(
    'play.beats',
    'play',
    'BEATS (per hit)',
    'slider',
    'How many beats each hit holds when the queue runs on the beat.',
    {
      channel: bus('QUEUE_BEATS', { beats: '$value' }),
      range: rng(QUEUE_BEATS_MIN, QUEUE_BEATS_MAX, 1),
      reads: R('queueBeatsPerHit'),
      source: 'panels/davis/QueueTransport.jsx',
    },
  ),
  ctl(
    'play.evolve-target',
    'play',
    'Evolve target',
    'segmented',
    'What the evolve driver mutates: seed, layout, palette, or all.',
    {
      channel: bus('DAVIS_EVOLVE', { target: '$value' }),
      options: Object.freeze(['seed', 'layout', 'palette', 'all']),
      reads: R('evolveTarget'),
      source: 'panels/davis/EvolveControls.jsx',
    },
  ),
  ctl('play.evolve-source', 'play', 'Evolve source', 'segmented', 'Whether evolve ticks by the clock or by the beat.', {
    channel: bus('DAVIS_EVOLVE', { source: '$value' }),
    options: Object.freeze(['time', 'beat']),
    reads: R('evolveSource'),
    source: 'panels/davis/EvolveControls.jsx',
  }),
  ctl('play.evolve-interval', 'play', 'Evolve interval', 'slider', 'How often evolve ticks, milliseconds.', {
    channel: bus('DAVIS_EVOLVE', { interval: '$value' }),
    range: rng(200, 10000, 100),
    reads: R('evolveInterval'),
    source: 'panels/davis/EvolveControls.jsx',
  }),
  ctl(
    'play.beat-route',
    'play',
    'Beat route',
    'segmented',
    'Where a beat tick goes when evolve runs on the beat and the phrase clock also wants it: phrase, evolve, or both.',
    {
      channel: bus('DAVIS_EVOLVE', { beatRoute: '$value' }),
      options: Object.freeze(['phrase', 'evolve', 'both']),
      reads: R('beatRoute'),
      source: 'panels/davis/EvolveControls.jsx',
    },
  ),
  ctl('play.morph', 'play', 'MORPH', 'toggle', 'Morphs between hits instead of cutting.', {
    channel: bus('DAVIS_MORPH', { enabled: '$toggle' }),
    reads: R('morphEvolve'),
    source: 'panels/davis/MorphControls.jsx',
  }),
  ctl('play.morph-duration', 'play', 'Morph duration', 'slider', 'How long a morph takes, milliseconds.', {
    channel: bus('DAVIS_MORPH_DURATION', { duration: '$value' }),
    range: rng(300, 4000, 100),
    reads: R('morphDurationMs'),
    source: 'panels/davis/MorphControls.jsx',
  }),
  ctl('play.phrase', 'play', 'PHRASE', 'toggle', 'Turns the phrase sequencer on or off.', {
    channel: bus('DAVIS_PHRASE', { enabled: '$toggle' }),
    reads: R('phraseEnabled'),
    source: 'panels/davis/PhraseControls.jsx',
  }),
  ctl(
    'play.phrase-clock',
    'play',
    'Phrase clock',
    'segmented',
    'What clocks the phrase: the audio, the metronome, or a euclidean pattern.',
    {
      channel: bus('DAVIS_PHRASE', { clock: '$value' }),
      options: Object.freeze(['audio', 'metro', 'euclid']),
      reads: R('phraseClock'),
      source: 'panels/davis/PhraseControls.jsx',
    },
  ),
  ctl(
    'play.euclid-hits',
    'play',
    'Euclid hits',
    'slider',
    'How many hits the euclidean pattern spreads over its steps.',
    {
      channel: bus('DAVIS_PHRASE', { euclid: { beats: '$value' } }),
      range: rng(0, 32, 1),
      reads: R('euclidBeats'),
      source: 'panels/davis/PhraseControls.jsx',
    },
  ),
  ctl('play.euclid-steps', 'play', 'Euclid steps', 'slider', 'How many steps the euclidean pattern runs.', {
    channel: bus('DAVIS_PHRASE', { euclid: { steps: '$value' } }),
    range: rng(2, 32, 1),
    reads: R('euclidSteps'),
    source: 'panels/davis/PhraseControls.jsx',
  }),
  ctl('play.euclid-rotate', 'play', 'Euclid rotate', 'slider', 'Rotates the euclidean pattern by steps.', {
    channel: bus('DAVIS_PHRASE', { euclid: { rotate: '$value' } }),
    range: rng(0, 31, 1),
    reads: R('euclidRotate'),
    source: 'panels/davis/PhraseControls.jsx',
  }),
  ctl('play.phrase-length', 'play', 'Phrase length', 'slider', 'How many steps a phrase runs before it cycles.', {
    channel: bus('DAVIS_PHRASE', { length: '$value' }),
    range: rng(4, 32, 1),
    reads: R('phraseLength'),
    source: 'panels/davis/PhraseControls.jsx',
  }),
  ctl(
    'play.phrase-mode',
    'play',
    'Phrase mode',
    'segmented',
    'How the phrase advances: cycling seeds or stepping a cellular pattern.',
    {
      channel: bus('DAVIS_PHRASE', { mode: '$value' }),
      options: Object.freeze(['cycle-seed', 'step-ca']),
      reads: R('phraseMode'),
      source: 'panels/davis/PhraseControls.jsx',
    },
  ),
  ctl('play.phrase-reset', 'play', 'Phrase reset', 'button', 'Resets the phrase sequencer to its start.', {
    channel: bus('DAVIS_RESET_PHRASE'),
    source: 'panels/davis/PhraseControls.jsx',
  }),

  // ── pipeline ──────────────────────────────────────────────────────────────
  ctl('pipeline.snap', 'pipeline', 'SNAP', 'button', 'Captures a still of the stage and downloads it.', {
    stress: 'skip',
    note: 'Runs the media-export hook and downloads a file; file IO.',
    source: 'panels/pipeline/SnapRecordRow.jsx',
  }),
  ctl(
    'pipeline.rec',
    'pipeline',
    'REC (stage recording)',
    'toggle',
    'Records the stage to a WebM movie while on; stopping downloads it.',
    {
      channel: bus('EXPORT_RECORD', '$toggle'),
      reads: R('isRecording'),
      stress: 'skip',
      note: 'Starts a real media recording in the browser; the loop-capture e2e spec covers recording, so the standing script does not churn it.',
      source: 'panels/pipeline/SnapRecordRow.jsx',
    },
  ),
  ctl(
    'pipeline.export-resolution',
    'pipeline',
    'Export resolution',
    'segmented',
    'The render scale for stills and movies: 1×, 2×, or 4×.',
    {
      channel: bus('EXPORT_RESOLUTION', '$value'),
      options: Object.freeze([1, 2, 4]),
      reads: R('exportResolution'),
      source: 'panels/pipeline/RenderFinalBlock.jsx',
      note: 'The bus payload is the bare scale number, exactly as the panel emits it.',
    },
  ),
  ctl(
    'pipeline.render-still',
    'pipeline',
    'RENDER STILL',
    'button',
    'Renders and downloads a still at the export resolution.',
    {
      stress: 'skip',
      note: 'Download via the media-export hook; file IO.',
      source: 'panels/pipeline/RenderFinalBlock.jsx',
    },
  ),
  ctl('pipeline.render-movie', 'pipeline', 'RENDER MOVIE', 'button', 'Renders and downloads a movie of the loop.', {
    stress: 'skip',
    note: 'Download via the loop-capture hook; file IO.',
    source: 'panels/pipeline/RenderFinalBlock.jsx',
  }),
  ctl('pipeline.batch', 'pipeline', 'BATCH', 'button', 'Renders a batch of stills and downloads them.', {
    stress: 'skip',
    note: 'Downloads via the media-export hook; its count field is hook-local state. File IO.',
    source: 'panels/pipeline/RenderFinalBlock.jsx',
  }),
  ctl(
    'pipeline.copy-link',
    'pipeline',
    'COPY LINK',
    'button',
    'Copies a share link for the current look to the clipboard.',
    {
      stress: 'skip',
      note: 'Clipboard write; nothing in the store changes.',
      source: 'panels/pipeline/RenderFinalBlock.jsx',
    },
  ),
  ctl(
    'pipeline.export-bundle',
    'pipeline',
    'EXPORT',
    'button',
    'Exports the look bundle (recipe file) as a download.',
    {
      stress: 'skip',
      note: 'Download; file IO.',
      source: 'panels/pipeline/RenderFinalBlock.jsx',
    },
  ),
  ctl('pipeline.fxaa', 'pipeline', 'FXAA', 'segmented', 'Anti-aliasing on the stage output.', {
    channel: bus('DISPLAY_FXAA', { on: '$value' }),
    options: Object.freeze([true, false]),
    reads: R('fxaa'),
    source: 'panels/pipeline/DisplayBlock.jsx',
    note: 'Option values are the emitted booleans; labels shown are ON / OFF.',
  }),
  ctl('pipeline.gate-weave', 'pipeline', 'GATE WEAVE', 'segmented', 'Weaves the gate pattern into the stage output.', {
    channel: bus('DISPLAY_WEAVE', { on: '$value' }),
    options: Object.freeze([true, false]),
    reads: R('weave'),
    source: 'panels/pipeline/DisplayBlock.jsx',
  }),
  ctl('pipeline.exposure', 'pipeline', 'Exposure', 'slider', 'The stage exposure, in stops.', {
    channel: bus('DISPLAY_EXPOSURE', { stops: '$value' }),
    range: rng(-2, 2, 0.5),
    reads: R('exposureStops'),
    source: 'panels/pipeline/DisplayBlock.jsx',
  }),
  ctl(
    'pipeline.canvas-preset',
    'pipeline',
    'Canvas preset',
    'select',
    'Chooses a canvas size preset (stage formats and OOH boards).',
    {
      channel: bus('CANVAS_PRESET', { id: '$value' }),
      options: ids(CANVAS_PRESETS),
      reads: R('canvasPresetId'),
      source: 'panels/pipeline/SetupBlock.jsx',
      note: 'Walking this resizes the live canvas; the script restores the starting preset.',
    },
  ),
  ctl(
    'pipeline.canvas-size',
    'pipeline',
    'Canvas W × H',
    'dialog',
    'Sets an exact canvas size in pixels (clamped 256–7680 per side).',
    {
      channel: bus('CANVAS_SIZE', '$value'),
      reads: R('canvasW', 'canvasH'),
      walk: Object.freeze([Object.freeze({ w: 800, h: 600 }), Object.freeze({ w: 1000, h: 700 })]),
      source: 'panels/pipeline/SetupBlock.jsx',
      note: 'Value is the whole { w, h } payload the panel emits from its two number fields.',
    },
  ),
  ctl('pipeline.aspect-lock', 'pipeline', 'Aspect lock', 'toggle', 'Locks the canvas aspect ratio while resizing.', {
    channel: bus('CANVAS_ASPECT_LOCK', { on: '$toggle' }),
    reads: R('canvasAspectLock'),
    source: 'panels/pipeline/SetupBlock.jsx',
  }),
  ctl('pipeline.swap-orientation', 'pipeline', 'Swap orientation', 'button', 'Swaps canvas width and height.', {
    channel: bus('CANVAS_SWAP'),
    reads: R('canvasW', 'canvasH'),
    source: 'panels/pipeline/SetupBlock.jsx',
    note: 'Actuating twice returns to the starting size.',
  }),
  ctl('pipeline.capture-fps', 'pipeline', 'Capture FPS', 'select', 'The frame rate captures render at.', {
    channel: bus('CANVAS_FPS', { fps: '$value' }),
    options: CANVAS_FPS,
    reads: R('canvasFps'),
    source: 'panels/pipeline/SetupBlock.jsx',
  }),
  ctl(
    'pipeline.canvas-preset-manage',
    'pipeline',
    'Canvas preset save / rename / delete',
    'dialog',
    'Manages your own canvas presets.',
    {
      stress: 'probe',
      note: 'Name-driven (save emits CANVAS_PRESET_SAVE with the typed label; rename/delete act on the chosen user preset id). Probed as a family; the standing script does not invent preset names.',
      source: 'panels/pipeline/SetupBlock.jsx',
    },
  ),
  ctl(
    'pipeline.stage-mode',
    'pipeline',
    'Stage output mode',
    'segmented',
    'Where the stage output goes: preview, fullscreen, or syphon.',
    {
      channel: bus('STAGE_MODE', { mode: '$value' }),
      options: STAGE_MODES,
      walk: Object.freeze(['syphon', 'preview']),
      reads: R('stageMode'),
      source: 'panels/pipeline/StageBlock.jsx',
      note: 'The walk avoids fullscreen (a browser-mode change, not a state change); on the panel the fullscreen option also drives the browser fullscreen API locally.',
    },
  ),
  ctl(
    'pipeline.stage-mapping',
    'pipeline',
    'Stage mapping',
    'segmented',
    'How the stage maps to the output: fit, fill, or 1:1.',
    {
      channel: bus('STAGE_MAPPING', { mapping: '$value' }),
      options: STAGE_MAPPINGS,
      reads: R('stageMapping'),
      source: 'panels/pipeline/StageBlock.jsx',
      note: 'Mapping renders in the desktop (Tauri) stage window; the store value lands in every build.',
    },
  ),
  ctl('pipeline.test-pattern', 'pipeline', 'Test pattern', 'toggle', 'Shows the test pattern on the stage output.', {
    channel: bus('STAGE_TEST_PATTERN', { on: '$toggle' }),
    reads: R('stageTestPattern'),
    source: 'panels/pipeline/StageBlock.jsx',
  }),
  ctl('pipeline.blackout', 'pipeline', 'Blackout', 'toggle', 'Blacks out the stage output.', {
    channel: bus('STAGE_BLACKOUT', { on: '$toggle' }),
    reads: R('stageBlackout'),
    source: 'panels/pipeline/StageBlock.jsx',
  }),
  ctl('pipeline.syphon-name', 'pipeline', 'Syphon name', 'select', 'Names the syphon output stream.', {
    channel: bus('STAGE_SYPHON_NAME', { name: '$value' }),
    reads: R('syphonName'),
    stress: 'probe',
    note: 'A text field registered as a value control; the stream itself is desktop-only.',
    source: 'panels/pipeline/StageBlock.jsx',
  }),
  ctl(
    'pipeline.syphon-on',
    'pipeline',
    'Syphon on',
    'toggle',
    'Turns the syphon stream on (desktop app only; the browser shows a desktop-only readout instead).',
    {
      channel: bus('STAGE_SYPHON_ON', { on: '$toggle' }),
      reads: R('syphonOn'),
      stress: 'probe',
      source: 'panels/pipeline/StageBlock.jsx',
    },
  ),
  ctl(
    'pipeline.dev-native',
    'pipeline',
    'DEV · NATIVE buttons',
    'button',
    'Desktop-bridge diagnostics: native info, windows, stage window controls.',
    {
      stress: 'skip',
      note: 'These call the Tauri invoke bridge directly; in a browser they fail with a raw IPC error — that failure is filed as issue 2490 in the numbering of the session report. No store/bus channel exists to register.',
      source: 'panels/PipelinePanel.jsx',
    },
  ),
]);

// ── stimuli + directors (appended chunk) ──────────────────────────────────────

export const UI_CONTROLS_5 = Object.freeze([
  // ── stimuli ───────────────────────────────────────────────────────────────
  ctl(
    'stimuli.audio',
    'stimuli',
    'AUDIO',
    'toggle',
    'Turns audio input on or off (the browser asks for the microphone).',
    {
      channel: bus('AUDIO_TOGGLE', '$toggle'),
      reads: R('audioEnabled'),
      source: 'panels/StimulusPanel.jsx',
      note: 'The bus payload is the bare boolean, exactly as the panel emits it.',
    },
  ),
  ctl('stimuli.monitor', 'stimuli', 'Monitor (MON)', 'toggle', 'Monitors the audio input back through the speakers.', {
    channel: bus('AUDIO_MONITOR', '$toggle'),
    reads: R('audioMonitor'),
    source: 'panels/stimulus/SourceControls.jsx',
    note: 'The bus payload is the bare boolean.',
  }),
  ctl(
    'stimuli.source',
    'stimuli',
    'Source (device / file)',
    'select',
    'Chooses the audio source: an input device, or a file.',
    {
      channel: bus('AUDIO_SOURCE', '$value'),
      stress: 'probe',
      note: 'Value is the source object ({ type: "device", id } or { type: "file", … }); the file variant needs a real File from the picker, so the standing script only probes this.',
      source: 'panels/stimulus/SourceControls.jsx',
    },
  ),
  ctl('stimuli.choose-file', 'stimuli', 'Choose File… (audio)', 'dialog', 'Picks an audio file as the input source.', {
    stress: 'skip',
    note: 'File IO.',
    source: 'panels/stimulus/SourceControls.jsx',
  }),
  ctl(
    'stimuli.loot-source',
    'stimuli',
    'Loot library source',
    'select',
    'Plays a cached loot audio file as the input source.',
    {
      stress: 'probe',
      note: 'Picking a file runs the async loot loader (loot/lootAudio.mjs loadAudio) against the on-disk loot folder; there is no synchronous store/bus channel to register, so this is catalogued, not channeled.',
      source: 'panels/stimulus/SourceControls.jsx',
    },
  ),
  ctl(
    'stimuli.sidecar',
    'stimuli',
    'Sidecar (choose / drop)',
    'dialog',
    'Attaches a sidecar analysis file to the audio source.',
    {
      stress: 'skip',
      note: 'File IO.',
      source: 'panels/stimulus/SourceControls.jsx',
    },
  ),
  ctl('stimuli.sidecar-clear', 'stimuli', 'Sidecar clear (×)', 'button', 'Clears the attached sidecar.', {
    channel: bus('AUDIO_SIDECAR', { sidecar: null, note: '' }),
    reads: R('audioSidecar'),
    source: 'panels/stimulus/SourceControls.jsx',
  }),
  ctl('stimuli.gain', 'stimuli', 'Input gain', 'slider', 'The audio input gain.', {
    channel: bus('AUDIO_GAIN', '$value'),
    range: rng(0, 5, 0.1),
    reads: R('audioGain'),
    source: 'panels/stimulus/SourceControls.jsx',
    note: 'The bus payload is the bare number.',
  }),
  ctl(
    'stimuli.meter-route',
    'stimuli',
    'Meter (click to route)',
    'button',
    'Routes the clicked frequency band into the modulation matrix.',
    {
      stress: 'probe',
      note: 'The payload is a table-edit function built from the clicked band’s position (ModMatrix helpers); a data template cannot carry a function, so no channel is registered. The route table’s fixed-payload controls below are the bridgeable surface.',
      source: 'panels/stimulus/ModMatrix.jsx',
    },
  ),
  ctl(
    'stimuli.marks',
    'stimuli',
    'Spectrum MARKS',
    'segmented',
    'How the spectrum maps onto the marks: index, angle, position, or hash.',
    {
      channel: lp('spectrumMap'),
      options: Object.freeze([0, 1, 2, 3]),
      reads: R('layoutParams.spectrumMap'),
      source: 'panels/stimulus/SpectrumMarks.jsx',
      note: 'Option values are the emitted indices; labels shown are INDEX / ANGLE / POSITION / HASH.',
    },
  ),
  ctl('stimuli.marks-scale', 'stimuli', 'Spectrum SCALE', 'slider', 'How much the spectrum scales the marks.', {
    channel: lp('spectrumScale'),
    range: rng(0, 1, 0.05),
    reads: R('layoutParams.spectrumScale'),
    source: 'panels/stimulus/SpectrumMarks.jsx',
  }),
  ctl(
    'stimuli.marks-displace',
    'stimuli',
    'Spectrum DISPLACE',
    'slider',
    'How much the spectrum displaces the marks.',
    {
      channel: lp('spectrumDisplace'),
      range: rng(0, 1, 0.05),
      reads: R('layoutParams.spectrumDisplace'),
      source: 'panels/stimulus/SpectrumMarks.jsx',
    },
  ),
  ctl('stimuli.marks-colour', 'stimuli', 'Spectrum COLOUR', 'slider', 'How much the spectrum colours the marks.', {
    channel: lp('spectrumColour'),
    range: rng(0, 1, 0.05),
    reads: R('layoutParams.spectrumColour'),
    source: 'panels/stimulus/SpectrumMarks.jsx',
  }),
  ctl(
    'stimuli.feel',
    'stimuli',
    'FEEL presets',
    'segmented',
    'Applies a reactivity feel: gentle, punchy, or violent (rewrites the reactivity params as a set).',
    {
      channel: bus('FEEL_APPLY', { id: '$value' }),
      options: ids(FEEL_PRESETS),
      source: 'panels/stimulus/FeelPicker.jsx',
      note: 'A feel rewrites many layout params at once and has no inverse; the walk applies one and records the stage, it does not restore (a performer’s deal, like a KINETIC press).',
    },
  ),
  ctl('stimuli.route-add', 'stimuli', 'Route + (add)', 'button', 'Adds the next modulation route to the matrix.', {
    channel: recipe('routeAdd'),
    reads: R('audioRoutes'),
    source: 'panels/stimulus/ModMatrix.jsx',
    note: 'The bridge recipe emits the same AUDIO_ROUTES_EDIT payload the button builds, using the same nextRoute helper from data/audioRoutes.js.',
  }),
  ctl('stimuli.route-clear', 'stimuli', 'Route clear', 'button', 'Clears every modulation route.', {
    channel: bus('AUDIO_ROUTES_SET', { routes: [], continuous: false }),
    reads: R('audioRoutes'),
    source: 'panels/stimulus/ModMatrix.jsx',
    note: 'The reset control below restores the default table, so the walk can clear and then reset.',
  }),
  ctl('stimuli.route-reset', 'stimuli', 'Route reset', 'button', 'Restores the default modulation route table.', {
    channel: bus('AUDIO_ROUTES_SET', { routes: null, continuous: false }),
    reads: R('audioRoutes'),
    source: 'panels/stimulus/ModMatrix.jsx',
  }),
  ctl('stimuli.route-auto', 'stimuli', 'Route AUTO', 'button', 'Listens and auto-routes the loudest bands.', {
    stress: 'skip',
    note: 'Runs a live listen against the microphone signal; meaningless without real audio, and the panel shows a listening state only.',
    source: 'panels/stimulus/ModMatrix.jsx',
  }),
  ctl(
    'stimuli.route-retune',
    'stimuli',
    'Route RETUNE',
    'button',
    'Re-tunes the routes (only meaningful while audio is live).',
    {
      stress: 'probe',
      note: 'No state change without a live signal; its visible effect is a transient panel status line.',
      source: 'panels/stimulus/ModMatrix.jsx',
    },
  ),
  ctl(
    'stimuli.route-row',
    'stimuli',
    'Route row (input / target / depth / remove)',
    'select',
    'Edits one route: its input band, its target param, its depth, or removes it.',
    {
      family: true,
      stress: 'probe',
      note: 'Each row edit emits AUDIO_ROUTES_EDIT with a table-edit function built by the panel’s own helpers (patchRoute / removeRoute) over the row index — functions a data template cannot carry. The add / clear / reset controls above are the bridgeable route surface.',
      source: 'panels/stimulus/ModMatrix.jsx',
    },
  ),
  ctl('stimuli.depth', 'stimuli', 'Reactivity DEPTH', 'slider', 'The overall modulation depth.', {
    channel: lp('audioModDepth'),
    range: rng(0, 2, 0.05),
    reads: R('layoutParams.audioModDepth'),
    source: 'panels/stimulus/ReactivityControls.jsx',
    note: 'The ADVANCED reactivity rows are disabled on the panel until audio is on; the params land regardless.',
  }),
  ctl('stimuli.reactivity-scale', 'stimuli', 'Reactivity SCALE', 'slider', 'How much audio scales the marks.', {
    channel: lp('audioScaleMod'),
    range: rng(0, 2, 0.05),
    reads: R('layoutParams.audioScaleMod'),
    source: 'panels/stimulus/ReactivityControls.jsx',
  }),
  ctl('stimuli.reactivity-alpha', 'stimuli', 'Reactivity ALPHA', 'slider', 'How much audio drives mark opacity.', {
    channel: lp('audioAlphaMod'),
    range: rng(0, 2, 0.05),
    reads: R('layoutParams.audioAlphaMod'),
    source: 'panels/stimulus/ReactivityControls.jsx',
  }),
  ctl('stimuli.life', 'stimuli', 'Reactivity LIFE', 'slider', 'How much the marks drift with a life of their own.', {
    channel: lp('lifeDrift'),
    range: rng(0, 1, 0.05),
    reads: R('layoutParams.lifeDrift'),
    source: 'panels/stimulus/ReactivityControls.jsx',
  }),
  ctl('stimuli.attack', 'stimuli', 'Reactivity ATTACK', 'slider', 'The audio envelope’s attack, milliseconds.', {
    channel: lp('audioAttackMs'),
    range: rng(0, 500, 5),
    reads: R('layoutParams.audioAttackMs'),
    source: 'panels/stimulus/ReactivityControls.jsx',
  }),
  ctl('stimuli.decay', 'stimuli', 'Reactivity DECAY', 'slider', 'The audio envelope’s decay, milliseconds.', {
    channel: lp('audioDecayMs'),
    range: rng(0, 2000, 10),
    reads: R('layoutParams.audioDecayMs'),
    source: 'panels/stimulus/ReactivityControls.jsx',
  }),
  ctl('stimuli.response', 'stimuli', 'Reactivity RESPONSE', 'segmented', 'The audio response curve.', {
    channel: lp('audioResponse'),
    options: BALLISTICS_CURVES,
    reads: R('layoutParams.audioResponse'),
    source: 'panels/stimulus/ReactivityControls.jsx',
  }),
  ctl('stimuli.swell', 'stimuli', 'Reactivity SWELL', 'slider', 'How much the audio swells the marks.', {
    channel: lp('audioSwell'),
    range: rng(0, 1, 0.05),
    reads: R('layoutParams.audioSwell'),
    source: 'panels/stimulus/ReactivityControls.jsx',
  }),

  // ── directors ─────────────────────────────────────────────────────────────
  ctl(
    'directors.voice-load',
    'directors',
    'Voice tile',
    'button',
    'Loads a voice (the starter tile is always present; earned voices join it).',
    {
      family: true,
      channel: bus('VOICE_LOAD', { id: '$param' }),
      reads: R('activeVoiceId'),
      walkParam: 'swarm',
      source: 'panels/davis/VoiceTiles.jsx',
      note: 'act param = the voice id; the walk uses the starter tile (swarm).',
    },
  ),
  ctl(
    'directors.voice-mix',
    'directors',
    'Voice mix slider',
    'slider',
    'Blends between voices while a mix is in flight.',
    {
      channel: bus('VOICE_MIX', { t: '$value' }),
      range: rng(0, 1, 0.001),
      reads: R('voiceMix'),
      stress: 'probe',
      source: 'panels/layout/MixBar.jsx',
    },
  ),
  ctl('directors.mix-resume', 'directors', 'Mix resume', 'button', 'Resumes an interrupted voice mix.', {
    channel: store('resumeVoiceMix'),
    stress: 'probe',
    source: 'panels/layout/MixBar.jsx',
  }),
  ctl('directors.mix-cancel', 'directors', 'Mix cancel', 'button', 'Cancels the voice mix in flight.', {
    channel: store('cancelVoiceMix'),
    reads: R('voiceMix'),
    stress: 'probe',
    source: 'panels/layout/MixBar.jsx',
  }),
  ctl(
    'directors.load-run',
    'directors',
    'LOAD RUN',
    'button',
    'Opens the run picker: loads a saved performance run as a candidate tray.',
    {
      channel: bus('EXPLORER_LOAD_RUN'),
      stress: 'probe',
      note: 'The picker tray it opens is its own surface (candidate cards); the emit is the control’s whole store-visible action.',
      source: 'panels/DavisPanel.jsx',
    },
  ),
  ctl('directors.evolve', 'directors', 'EVOLVE', 'toggle', 'Turns the evolve driver on or off.', {
    channel: bus('DAVIS_EVOLVE', { toggle: true }),
    reads: R('evolveMode'),
    source: 'panels/DavisPanel.jsx',
    note: 'The payload is the fixed toggle flag the button emits; the handler flips evolveMode.',
  }),
  ctl(
    'directors.favorite',
    'directors',
    'FAVORITE (★)',
    'button',
    'Keeps the current stage state as a hit in the setlist.',
    {
      channel: recipe('addFavorite'),
      reads: R('favorites'),
      source: 'panels/DavisPanel.jsx',
      note: 'The bridge recipe builds the favourite with the same captureFavorite helper the panel calls, from the live state. Adds a hit; not restorable, like a performer pressing it.',
    },
  ),
  ctl(
    'directors.new-seed',
    'directors',
    'NEW SEED',
    'button',
    'Bumps the world seed: a fresh variation of everything seeded.',
    {
      channel: bus('DAVIS_EVOLVE', { bumpSeed: true }),
      reads: R('seed'),
      source: 'panels/DavisPanel.jsx',
    },
  ),
  ctl(
    'directors.mutate-stream',
    'directors',
    'Mutate streams (spatial / color / asset / noise)',
    'button',
    'Mutates one stream of the current look.',
    {
      channel: bus('DAVIS_MUTATE_STREAM', { group: '$value' }),
      options: RECIPE_OFFSET_CHANNELS,
      reads: R('seedOffsets'),
      source: 'panels/DavisPanel.jsx',
    },
  ),
  ctl('directors.mutate-reset', 'directors', 'Mutate reset', 'button', 'Resets every mutate stream offset.', {
    channel: bus('DAVIS_MUTATE_STREAM', { reset: true }),
    reads: R('seedOffsets'),
    source: 'panels/DavisPanel.jsx',
  }),
  ctl(
    'directors.behave-override',
    'directors',
    'Behave override fields',
    'slider',
    'Per-field behaviour overrides (separation, alignment, cohesion, their radii, wind, attraction) for organism modes.',
    {
      family: true,
      channel: bus('LAYOUT_PARAM', { key: 'behave$param', value: '$value' }),
      stress: 'probe',
      note: 'act param = the field suffix (Sep, Ali, Coh, SepR, AliR, CohR, Wind, Orbit, Attract — the panel capitalizes its BEHAVE_OVERRIDE_FIELDS names); each field has its own units and range on the panel, so the family is probed rather than ranged blindly.',
      source: 'panels/davis/BehaveReadout.jsx',
    },
  ),
  ctl(
    'directors.behave-reset',
    'directors',
    'Behave reset overrides',
    'button',
    'Clears every behaviour override field.',
    {
      channel: busMulti([
        ['LAYOUT_PARAM', { key: 'behaveSep', value: null }],
        ['LAYOUT_PARAM', { key: 'behaveAli', value: null }],
        ['LAYOUT_PARAM', { key: 'behaveCoh', value: null }],
        ['LAYOUT_PARAM', { key: 'behaveSepR', value: null }],
        ['LAYOUT_PARAM', { key: 'behaveAliR', value: null }],
        ['LAYOUT_PARAM', { key: 'behaveCohR', value: null }],
        ['LAYOUT_PARAM', { key: 'behaveWind', value: null }],
        ['LAYOUT_PARAM', { key: 'behaveOrbit', value: null }],
        ['LAYOUT_PARAM', { key: 'behaveAttract', value: null }],
      ]),
      reads: R('layoutParams'),
      source: 'panels/davis/BehaveReadout.jsx',
      note: 'The panel emits one LAYOUT_PARAM per override key with a null value; the bridge performs the same sequence.',
    },
  ),
  ctl(
    'directors.accum',
    'directors',
    'TRAILS — ACCUM',
    'toggle',
    'Turns accumulation trails on or off (the trails family’s own switch).',
    {
      channel: lp('accumulation', '$toggle'),
      reads: R('layoutParams.accumulation'),
      deferRestore: true,
      source: 'panels/DavisPanel.jsx',
    },
  ),
  ctl(
    'directors.accum-freeze',
    'directors',
    'TRAILS — FREEZE',
    'toggle',
    'Freezes the accumulation: the trails hold still.',
    {
      channel: bus('ACCUM_GESTURE', { action: 'freeze', value: '$value' }),
      options: Object.freeze([true, false]),
      source: 'panels/DavisPanel.jsx',
      note: 'The panel also keeps a local frozen flag for its own label; the bus gesture is the stage-visible state change.',
    },
  ),
  ctl('directors.accum-clear', 'directors', 'TRAILS — CLEAR', 'button', 'Clears the accumulated trails.', {
    channel: bus('ACCUM_GESTURE', { action: 'clear' }),
    source: 'panels/DavisPanel.jsx',
  }),
  ctl('directors.accum-swell', 'directors', 'TRAILS — SWELL', 'button', 'Swells the accumulated trails once.', {
    channel: bus('ACCUM_GESTURE', { action: 'swell' }),
    source: 'panels/DavisPanel.jsx',
  }),
  ctl('directors.motion', 'directors', 'TRAILS — motion', 'segmented', 'The kineme motion pattern the trails ride.', {
    channel: lp('kinemePattern'),
    options: KINEME_PATTERNS,
    reads: R('layoutParams.kinemePattern'),
    source: 'panels/DavisPanel.jsx',
  }),
  ctl(
    'directors.doctrine',
    'directors',
    'Poem doctrine (BLAST / SWISS GRIT / HYBRID)',
    'segmented',
    'Sets the standing poem doctrine; tapping the lit one clears it.',
    {
      channel: recipe('setDoctrine'),
      options: DOCTRINE_IDS,
      reads: R('poemDoctrine'),
      source: 'panels/DavisPanel.jsx',
      note: 'The bridge recipe calls the same treatments driver the panel calls, with by: "performer" — the panel’s own attribution.',
    },
  ),
  ctl('directors.travel', 'directors', 'Travel mode', 'segmented', 'How the stage travels: still, flow, or path.', {
    channel: lp('transport'),
    options: TRANSPORT_MODES,
    reads: R('layoutParams.transport'),
    source: 'panels/DavisPanel.jsx',
  }),
  ctl('directors.travel-path', 'directors', 'Travel path', 'segmented', 'The path shape when travel is on path mode.', {
    channel: lp('transportPath'),
    options: PATH_FAMILIES,
    reads: R('layoutParams.transportPath'),
    source: 'panels/DavisPanel.jsx',
  }),
  ctl('directors.surge', 'directors', 'Travel SURGE', 'slider', 'How hard travel surges.', {
    channel: lp('transportSurge'),
    range: rng(0, 1, 0.01),
    reads: R('layoutParams.transportSurge'),
    source: 'panels/DavisPanel.jsx',
    note: 'The panel shows 0–100; the emitted value is that divided by 100, which is the domain registered here.',
  }),
  ctl('directors.parallax', 'directors', 'Travel PARALLAX', 'slider', 'How much parallax travel carries.', {
    channel: lp('transportParallax'),
    range: rng(0, 1, 0.01),
    reads: R('layoutParams.transportParallax'),
    source: 'panels/DavisPanel.jsx',
  }),
  ctl('directors.leash', 'directors', 'Travel LEASH', 'slider', 'How far travel may roam from home.', {
    channel: lp('transportLeash'),
    range: rng(0, 400, 1),
    reads: R('layoutParams.transportLeash'),
    source: 'panels/DavisPanel.jsx',
  }),
  ctl('directors.flow', 'directors', 'Travel FLOW', 'slider', 'The travel flow amount.', {
    channel: lp('transportFlow'),
    range: rng(0, 1, 0.01),
    reads: R('layoutParams.transportFlow'),
    source: 'panels/DavisPanel.jsx',
  }),
  ctl('directors.speed', 'directors', 'Travel SPEED', 'slider', 'The travel speed.', {
    channel: lp('transportSpeed'),
    range: rng(0, 2, 0.01),
    reads: R('layoutParams.transportSpeed'),
    source: 'panels/DavisPanel.jsx',
  }),
  ctl('directors.radius', 'directors', 'Travel RADIUS', 'slider', 'The travel radius.', {
    channel: lp('transportRadius'),
    range: rng(0, 300, 1),
    reads: R('layoutParams.transportRadius'),
    source: 'panels/DavisPanel.jsx',
  }),
  ctl(
    'directors.role-deal',
    'directors',
    'Role deal (creatures take roles)',
    'toggle',
    'Lets the director deal roles to the creatures.',
    {
      channel: store('setBeastSetting', ['davisRoleDeal', '$toggle']),
      reads: R('beastSettings.davisRoleDeal'),
      source: 'components/BeastSettings.jsx',
    },
  ),
  ctl('directors.midi-open', 'directors', 'MIDI (dialog)', 'dialog', 'Opens the MIDI dialog: enable, banks, learn.', {
    stress: 'skip',
    note: 'Open state is panel-local; the dialog’s own controls are the midi entries below (they write the store directly, as the dialog does).',
    source: 'panels/davis/MidiSection.jsx',
  }),
  ctl('directors.midi-enabled', 'directors', 'MIDI enabled', 'toggle', 'Turns MIDI input on or off.', {
    channel: bus('MIDI_ENABLED', { on: '$toggle' }),
    reads: R('midiEnabled'),
    source: 'panels/davis/MidiSection.jsx',
  }),
  ctl('directors.midi-bank', 'directors', 'MIDI bank', 'select', 'Switches the active MIDI bank.', {
    channel: store('switchMidiBank', ['$value']),
    reads: R('midiActiveBank'),
    stress: 'probe',
    note: 'Value is the bank index; how many banks exist is the performer’s setup.',
    source: 'panels/davis/MidiSection.jsx',
  }),
  ctl('directors.midi-bank-add', 'directors', 'MIDI bank + (add)', 'button', 'Adds a MIDI bank.', {
    channel: store('addMidiBank'),
    reads: R('midiBanks'),
    stress: 'probe',
    source: 'panels/davis/MidiSection.jsx',
  }),
  ctl(
    'directors.midi-bank-remove',
    'directors',
    'MIDI bank remove',
    'button',
    'Removes the active MIDI bank, behind a confirm prompt.',
    {
      channel: store('removeMidiBank'),
      stress: 'skip',
      note: 'Destructive and confirm-gated on the panel.',
      source: 'panels/davis/MidiSection.jsx',
    },
  ),
  ctl('directors.midi-bank-rename', 'directors', 'MIDI bank rename', 'dialog', 'Renames the active MIDI bank.', {
    channel: store('renameMidiBank', ['$value']),
    stress: 'skip',
    note: 'The panel asks with window.prompt; text entry against the performer’s setup.',
    source: 'panels/davis/MidiSection.jsx',
  }),
  ctl(
    'directors.midi-learn',
    'directors',
    'MIDI learn (per binding)',
    'toggle',
    'Arms learn for one binding: the next MIDI control touched binds to it.',
    {
      family: true,
      channel: store('armMidiLearn', ['$param']),
      reads: R('midiLearn'),
      stress: 'probe',
      note: 'act param = the binding key. Arming waits on hardware input, so the standing script only probes it.',
      source: 'panels/davis/MidiSection.jsx',
    },
  ),
  ctl('directors.midi-learn-cancel', 'directors', 'MIDI learn cancel', 'button', 'Cancels an armed MIDI learn.', {
    channel: store('cancelMidiLearn'),
    reads: R('midiLearn'),
    source: 'panels/davis/MidiSection.jsx',
  }),
  ctl(
    'directors.midi-unbind',
    'directors',
    'MIDI unbind (per binding)',
    'button',
    'Removes one binding’s MIDI assignment.',
    {
      family: true,
      channel: store('unbindMidi', ['$param']),
      stress: 'probe',
      note: 'act param = the binding key.',
      source: 'panels/davis/MidiSection.jsx',
    },
  ),
]);

// ── dev + wetlab + studio (appended chunk) ────────────────────────────────────

export const UI_CONTROLS_6 = Object.freeze([
  // ── dev ───────────────────────────────────────────────────────────────────
  ctl(
    'dev.gate',
    'dev',
    'DEV MODE',
    'toggle',
    'Turns the DEV tools on or off (the switch lives in the ? overlay’s Settings tab; the DEV panel itself appears in the dock).',
    {
      channel: mod('composition/devMode.mjs', 'setDevMode', ['$toggle']),
      reads: R('module:composition/devMode.mjs#devModeOn'),
      source: 'components/HotkeyOverlay.jsx',
      note: 'Held by the devMode module (a localStorage-backed pref), not the store — the same module call the switch makes.',
    },
  ),
  ctl(
    'dev.tabs',
    'dev',
    'DEV tabs',
    'segmented',
    'Switches between the DEV tools: X-RAY, GOV TUNE, SHADER LAB, BIOLOGY, UNITS, KERNEL, MIND, CENSUS, TASTE, SHELF, MEGAMIND, PERSONA TUNE, HEADS.',
    {
      stress: 'skip',
      note: 'Panel-local tab state; each tab’s controls are the entries below.',
      source: 'panels/DevPanel.jsx',
    },
  ),
  ctl(
    'dev.xray',
    'dev',
    'X-RAY (readout)',
    'readout',
    'The governor event log and live governor state: sheds, recovers, watchdog trips.',
    {
      stress: 'probe',
      note: 'A readout: it changes no state; its clear/export buttons are the entries beside it.',
      source: 'panels/GovernorXrayPanel.jsx',
    },
  ),
  ctl('dev.xray-clear', 'dev', 'X-RAY — clear log', 'button', 'Clears the governor event log.', {
    channel: mod('gl/governorEventLog.mjs', 'clearGovernorEvents', []),
    source: 'panels/GovernorXrayPanel.jsx',
    note: 'The panel also bumps a local version counter to re-render; the module call is the state change.',
  }),
  ctl('dev.xray-export', 'dev', 'X-RAY — export log', 'button', 'Downloads the governor event log.', {
    stress: 'skip',
    note: 'Download; file IO.',
    source: 'panels/GovernorXrayPanel.jsx',
  }),
  ctl(
    'dev.govtune-shed',
    'dev',
    'GOV TUNE — shed fps',
    'slider',
    'The frame rate below which the governor starts shedding load.',
    {
      channel: store('setGovernorShedFps', ['$value']),
      range: rng(1, 120, 1),
      walk: Object.freeze([10, 28]),
      reads: R('governorShedFps'),
      source: 'panels/GovernorTunePanel.jsx',
      note: 'The setter enforces shed below recover; the walk values stay inside that law against the shipped recover of 120.',
    },
  ),
  ctl(
    'dev.govtune-recover',
    'dev',
    'GOV TUNE — recover fps',
    'slider',
    'The frame rate above which the governor recovers shed load.',
    {
      channel: store('setGovernorRecoverFps', ['$value']),
      range: rng(1, 120, 1),
      walk: Object.freeze([60, 120]),
      reads: R('governorRecoverFps'),
      source: 'panels/GovernorTunePanel.jsx',
    },
  ),
  ctl(
    'dev.shaderlab',
    'dev',
    'SHADER LAB (readout)',
    'readout',
    'Shader compile check, the uniform audit, and flag views over the stage shaders.',
    {
      stress: 'probe',
      source: 'panels/DevPanel.jsx',
      note: 'A readout surface: its findings are computed from the shader sources when the tab renders. The standing script covers the stage through its console and stage reads.',
    },
  ),
  ctl(
    'dev.biology-reset',
    'dev',
    'BIOLOGY — reset policy',
    'button',
    'Resets the biology policy to the shipped defaults.',
    {
      channel: mod('biology/policy.js', 'resetBiologyPolicy', []),
      source: 'panels/BiologyPanel.jsx',
    },
  ),
  ctl('dev.biology-export', 'dev', 'BIOLOGY — export policy', 'button', 'Downloads the biology policy.', {
    stress: 'skip',
    note: 'Download; file IO.',
    source: 'panels/BiologyPanel.jsx',
  }),
  ctl('dev.biology-import', 'dev', 'BIOLOGY — import policy', 'dialog', 'Imports a biology policy file.', {
    stress: 'skip',
    note: 'File IO.',
    source: 'panels/BiologyPanel.jsx',
  }),
  ctl(
    'dev.units-run',
    'dev',
    'UNITS — run / make unit',
    'button',
    'Runs the unit harness or makes a unit through the dev server.',
    {
      family: true,
      stress: 'skip',
      note: 'Dev-server only: in the hosted and preview builds the endpoint does not exist (the session’s A18 finding). No channel is registered because there is nothing lawful to call in the shipped build.',
      source: 'panels/DevPanel.jsx',
    },
  ),
  ctl('dev.kernel-tile', 'dev', 'KERNEL tiles', 'button', 'Probes one stage kernel tile and shows its field readout.', {
    family: true,
    stress: 'probe',
    note: 'The probe runs a module-local field readout and the selection is panel-local state; no store/bus state changes, so no channel is registered.',
    source: 'panels/DevPanel.jsx',
  }),
  ctl(
    'dev.mind',
    'dev',
    'MIND (readout)',
    'readout',
    'The Mind readout: what the local decision heads currently see and score.',
    {
      stress: 'probe',
      note: 'A readout: it changes no state.',
      source: 'panels/DevPanel.jsx',
    },
  ),
  ctl('dev.census-load', 'dev', 'CENSUS — load report', 'dialog', 'Loads a census report file into the census tab.', {
    stress: 'skip',
    note: 'File IO.',
    source: 'panels/DevPanel.jsx',
  }),
  ctl('dev.census', 'dev', 'CENSUS (readout)', 'readout', 'The asset census readout.', {
    stress: 'probe',
    note: 'A readout: it changes no state; loading a report file is the entry beside it.',
    source: 'panels/DevPanel.jsx',
  }),
  ctl('dev.taste', 'dev', 'TASTE (readout)', 'readout', 'The taste readout: the standing voice’s recent calls.', {
    stress: 'probe',
    note: 'A readout: it changes no state.',
    source: 'panels/DevPanel.jsx',
  }),
  ctl('dev.shelf', 'dev', 'SHELF (readout)', 'readout', 'The keeps shelf readout inside DEV.', {
    stress: 'probe',
    note: 'A readout: it changes no state; the shelf’s own actions are registered under the shelf panel.',
    source: 'panels/DevPanel.jsx',
  }),
  ctl(
    'dev.megamind-connect',
    'dev',
    'MEGAMIND — connect / model',
    'button',
    'Connects the local vision model (Ollama on this machine) and picks the model.',
    {
      stress: 'probe',
      note: 'Drives a stateful module driver against a local model server; whether it answers depends on the machine, not the build (the session’s A11 flakiness). No store/bus channel.',
      source: 'panels/DevPanel.jsx',
    },
  ),
  ctl(
    'dev.megamind-ask',
    'dev',
    'MEGAMIND — describe / narrate / see',
    'button',
    'Asks the connected model to describe or narrate the stage.',
    {
      stress: 'probe',
      note: 'Model calls through the MEGAMIND driver singletons; environment-dependent, probed only.',
      source: 'panels/DevPanel.jsx',
    },
  ),
  ctl(
    'dev.megamind-embed',
    'dev',
    'MEGAMIND — embed / surfaces',
    'button',
    'Runs the embedding and surface passes over the collection.',
    {
      stress: 'probe',
      note: 'Model calls through the MEGAMIND driver singletons; environment-dependent, probed only.',
      source: 'panels/DevPanel.jsx',
    },
  ),
  ctl(
    'dev.personatune-leaf',
    'dev',
    'PERSONA TUNE — a tuning leaf',
    'slider',
    'Tunes one number in a persona’s tuning table (the brake leaf is the walked exemplar).',
    {
      family: true,
      channel: mod('personas/tuning.mjs', 'setTuningValue', ['$param', '$value']),
      reads: R('module:personas/tuning.mjs#tuningValue'),
      walkParam: 'personas.lois.knobs.brake.at',
      walk: Object.freeze([0.9, 0.5]),
      source: 'panels/PersonaTunePanel.jsx',
      note: 'act param = the tuning path. Tuning lives in the personas/tuning module (localStorage-backed), not the store; the reset control below restores the shipped table, and the walk ends there.',
    },
  ),
  ctl(
    'dev.personatune-range',
    'dev',
    'PERSONA TUNE — a range leaf',
    'dialog',
    'Tunes a two-number range in a persona’s tuning table.',
    {
      family: true,
      stress: 'probe',
      note: 'Same module funnel as the leaf entry (setTuningValue with a [lo, hi] value); ranges vary per leaf, so the family is probed.',
      source: 'panels/PersonaTunePanel.jsx',
    },
  ),
  ctl(
    'dev.personatune-reset',
    'dev',
    'PERSONA TUNE — reset',
    'button',
    'Resets the whole persona tuning table to the shipped defaults.',
    {
      channel: mod('personas/tuning.mjs', 'resetTuning', []),
      source: 'panels/PersonaTunePanel.jsx',
    },
  ),
  ctl(
    'dev.heads-rollback',
    'dev',
    'HEADS — rollback',
    'button',
    'Rolls a decision head back to its previous version.',
    {
      family: true,
      stress: 'skip',
      note: 'Desktop-only and disabled in the browser build; takes effect on the next launch, so there is nothing to walk in the shipped web build.',
      source: 'panels/DevPanel.jsx',
    },
  ),

  // ── wetlab ────────────────────────────────────────────────────────────────
  ctl(
    'wetlab.mode',
    'wetlab',
    'WetLab modes (ASSEMBLE / BREED / GENOME / LINEAGE)',
    'segmented',
    'Switches the WetLab between its workbenches.',
    {
      stress: 'skip',
      note: 'Dialog-local tab state; the dialog itself opens from the asset pool (registered as assets.open-wetlab — its open state is panel-local too).',
      source: 'panels/WetLab.jsx',
    },
  ),
  ctl(
    'wetlab.attach',
    'wetlab',
    'Attach tools (points / head / limb)',
    'button',
    'Places attach points on the rig by clicking the dialog canvas; head and limb tools follow the clicks.',
    {
      family: true,
      stress: 'probe',
      note: 'The store call (clickAssetAttach) takes pointer coordinates and the dialog’s live points context; the bridge does not fabricate coordinates, so no channel is registered.',
      source: 'panels/WetLab.jsx',
    },
  ),
  ctl('wetlab.attach-auto', 'wetlab', 'Attach AUTO', 'toggle', 'Auto-places an asset’s attach points.', {
    family: true,
    channel: store('autoAssetAttach', ['$param']),
    reads: R('assetAttach'),
    stress: 'probe',
    note: 'act param = the asset id. Rewrites the asset’s attach points, so the standing script probes it.',
    source: 'panels/WetLab.jsx',
  }),
  ctl('wetlab.attach-clear', 'wetlab', 'Attach clear', 'button', 'Clears an asset’s attach points.', {
    family: true,
    channel: bus('ATTACH_CLEAR', { assetId: '$param' }),
    stress: 'probe',
    source: 'panels/WetLab.jsx',
  }),
  ctl(
    'wetlab.assemble',
    'wetlab',
    'ASSEMBLE (bank creature)',
    'button',
    'Assembles the rig into a creature and banks it.',
    {
      stress: 'probe',
      note: 'The store action (assembleCreature) takes the dialog’s live points, look and voice picks — performer-derived arguments the bridge cannot know. Catalogued, not channeled.',
      source: 'panels/WetLab.jsx',
    },
  ),
  ctl('wetlab.breed', 'wetlab', 'BREED', 'button', 'Breeds two chosen creatures into a child.', {
    stress: 'probe',
    note: 'breedCreature takes the dialog’s two chosen sources; performer-derived arguments, catalogued not channeled.',
    source: 'panels/WetLab.jsx',
  }),
  ctl('wetlab.cultivate', 'wetlab', 'CULTIVATE', 'button', 'Cultivates a creature with a written note.', {
    stress: 'probe',
    note: 'cultivateCreature takes the dialog’s note text; catalogued not channeled.',
    source: 'panels/WetLab.jsx',
  }),
  ctl(
    'wetlab.gene',
    'wetlab',
    'Genome editor (mutate / replace gene)',
    'button',
    'Mutates or replaces one gene of the creature in the genome editor.',
    {
      family: true,
      stress: 'probe',
      note: 'editCreatureGene takes the editor’s live gene context; catalogued not channeled.',
      source: 'panels/WetLab.jsx',
    },
  ),
  ctl(
    'wetlab.deal-strips',
    'wetlab',
    'Deal strips (KIN / CUR) + bank',
    'button',
    'Deals creature and beast strips; the bank buttons keep a dealt record (creature, beast, shape, construct).',
    {
      family: true,
      stress: 'probe',
      note: 'Dealing is dialog-local seeded state; banking calls bankDealtCreature / bankDealtBeast / keepDealtShape / bankConstruct with the dealt record — a derived argument the bridge cannot know.',
      source: 'panels/WetLab.jsx',
    },
  ),
  ctl(
    'wetlab.assemble-beast',
    'wetlab',
    'Assemble beast',
    'button',
    'Assembles the current rig as a beast and banks it.',
    {
      channel: store('assembleBeast'),
      reads: R('customAssets'),
      stress: 'probe',
      note: 'What it banks depends on the dialog’s rig context, so the standing script probes it.',
      source: 'panels/WetLab.jsx',
    },
  ),
  ctl('wetlab.remove-record', 'wetlab', 'Remove creature record', 'button', 'Removes a banked creature record.', {
    family: true,
    channel: store('removeCreatureRecord', ['$param']),
    stress: 'skip',
    note: 'Destructive to the performer’s banked creatures.',
    source: 'panels/WetLab.jsx',
  }),
  ctl('wetlab.beast-roam', 'wetlab', 'Beast ROAM', 'toggle', 'Lets banked beasts roam the dish.', {
    channel: store('setBeastSetting', ['roam', '$toggle']),
    reads: R('beastSettings.roam'),
    source: 'components/BeastSettings.jsx',
  }),
  ctl('wetlab.beast-trace', 'wetlab', 'Beast TRACE', 'toggle', 'Beasts leave traces as they move.', {
    channel: store('setBeastSetting', ['trace', '$toggle']),
    reads: R('beastSettings.trace'),
    source: 'components/BeastSettings.jsx',
  }),
  ctl('wetlab.beast-turn', 'wetlab', 'Beast turn gain', 'slider', 'How sharply beasts turn.', {
    channel: store('setBeastSetting', ['turnGain', '$value']),
    range: rng(0, 1, 0.05),
    reads: R('beastSettings.turnGain'),
    source: 'components/BeastSettings.jsx',
  }),
  ctl('wetlab.beast-ink', 'wetlab', 'Beast trace ink', 'slider', 'How dark beast traces are.', {
    channel: store('setBeastSetting', ['traceAlpha', '$value']),
    range: rng(0, 1, 0.05),
    reads: R('beastSettings.traceAlpha'),
    source: 'components/BeastSettings.jsx',
  }),
  ctl('wetlab.beast-fade', 'wetlab', 'Beast trace fade', 'slider', 'How long beast traces last.', {
    channel: store('setBeastSetting', ['traceFade', '$value']),
    range: rng(1, 30, 1),
    reads: R('beastSettings.traceFade'),
    source: 'components/BeastSettings.jsx',
  }),
  ctl('wetlab.beast-marks', 'wetlab', 'Beast trace marks', 'slider', 'How many trace marks a beast leaves.', {
    channel: store('setBeastSetting', ['traceCount', '$value']),
    range: rng(0, 24, 1),
    reads: R('beastSettings.traceCount'),
    source: 'components/BeastSettings.jsx',
  }),

  // ── studio ────────────────────────────────────────────────────────────────
  ctl(
    'studio.primitives',
    'studio',
    'Primitives (add part)',
    'button',
    'Adds a primitive part (disc, bar, ring, blob…) to the drawing.',
    {
      family: true,
      stress: 'skip',
      note: 'The Studio composes in dialog-local state; nothing reaches the store until SAVE. There is no channel to register for the local steps.',
      source: 'panels/AssetStudioModal.jsx',
    },
  ),
  ctl(
    'studio.part-edit',
    'studio',
    'Part editing (move / rotate / scale / ink / fill / dup / delete / z)',
    'button',
    'Edits the parts on the Studio canvas.',
    {
      family: true,
      stress: 'skip',
      note: 'Dialog-local composition state, like the primitives.',
      source: 'panels/AssetStudioModal.jsx',
    },
  ),
  ctl(
    'studio.merge',
    'studio',
    'Merge (ticks / subtract / melt / blend / bake)',
    'segmented',
    'How overlapping parts merge into one asset shape.',
    {
      family: true,
      stress: 'skip',
      note: 'Dialog-local composition state.',
      source: 'panels/AssetStudioModal.jsx',
    },
  ),
  ctl(
    'studio.save',
    'studio',
    'SAVE (bank asset)',
    'button',
    'Banks the composed drawing as an asset (or replaces the one being edited).',
    {
      stress: 'probe',
      note: 'Saving emits ASSETS_INGEST (or ASSETS_REPLACE when editing) with the dialog’s composed SVG — a payload only the dialog can produce. Catalogued, not channeled.',
      source: 'panels/AssetStudioModal.jsx',
    },
  ),
  ctl('studio.export', 'studio', 'Export SVG', 'button', 'Downloads the composed drawing as an SVG file.', {
    stress: 'skip',
    note: 'Download; file IO.',
    source: 'panels/AssetStudioModal.jsx',
  }),
  ctl(
    'studio.meta',
    'studio',
    'Family / id / undo / clear',
    'dialog',
    'The Studio’s housekeeping: family picker, the asset id hint, undo, clear canvas.',
    {
      stress: 'skip',
      note: 'Dialog-local state.',
      source: 'panels/AssetStudioModal.jsx',
    },
  ),
]);

// ── composition: the one registry ─────────────────────────────────────────────

export const UI_CONTROLS = Object.freeze([
  ...UI_CONTROLS_1,
  ...UI_CONTROLS_2,
  ...UI_CONTROLS_3,
  ...UI_CONTROLS_4,
  ...UI_CONTROLS_5,
  ...UI_CONTROLS_6,
]);

const BY_ID = new Map(UI_CONTROLS.map((c) => [c.id, c]));
export function controlById(id) {
  return BY_ID.get(id) ?? null;
}

// The shipped manifest: the registry's JSON form. Pure data by construction — the
// selfcheck pins that a JSON round-trip reproduces it exactly, so what an agent reads
// on the hosted build is what this module declares, byte for byte in structure.
export function buildManifest() {
  const byPanel = {};
  for (const p of PANELS) byPanel[p.id] = 0;
  for (const c of UI_CONTROLS) byPanel[c.panel] += 1;
  return {
    schema: AGENT_UI_SCHEMA,
    panels: PANELS.map((p) => ({ id: p.id, label: p.label, where: p.where, controls: byPanel[p.id] })),
    controls: UI_CONTROLS.map((c) => ({ ...c })),
    counts: { panels: PANELS.length, controls: UI_CONTROLS.length, byPanel },
  };
}

const KINDS = Object.freeze(['button', 'toggle', 'segmented', 'slider', 'select', 'dialog', 'readout']);
const CHANNEL_KINDS = Object.freeze(['bus', 'store', 'apply', 'module', 'recipe']);

function validateChannel(c, problems) {
  const ch = c.channel;
  if (!CHANNEL_KINDS.includes(ch.kind)) {
    problems.push(`${c.id}: unknown channel kind ${ch.kind}`);
    return;
  }
  if (ch.kind === 'bus') {
    const emits = ch.emits ?? [ch];
    for (const e of emits)
      if (typeof e.event !== 'string' || !e.event) problems.push(`${c.id}: bus channel without an event`);
  }
  if (ch.kind === 'store' && typeof ch.action !== 'string') problems.push(`${c.id}: store channel without an action`);
  if (ch.kind === 'apply' && typeof ch.type !== 'string') problems.push(`${c.id}: apply channel without a type`);
  if (ch.kind === 'module' && (typeof ch.module !== 'string' || typeof ch.export !== 'string'))
    problems.push(`${c.id}: module channel without module/export`);
  if (ch.kind === 'recipe' && typeof ch.recipe !== 'string')
    problems.push(`${c.id}: recipe channel without a recipe name`);
}

function validateControls(controls) {
  const problems = [];
  const panelIds = new Set(PANELS.map((p) => p.id));
  const seen = new Set();
  for (const c of controls) {
    if (seen.has(c.id)) problems.push(`duplicate control id ${c.id}`);
    seen.add(c.id);
    if (!panelIds.has(c.panel)) problems.push(`${c.id}: unknown panel ${c.panel}`);
    if (!c.label || !c.does) problems.push(`${c.id}: label and does are required`);
    if (!KINDS.includes(c.kind)) problems.push(`${c.id}: unknown kind ${c.kind}`);
    if (!['walk', 'probe', 'skip'].includes(c.stress)) problems.push(`${c.id}: unknown stress mode ${c.stress}`);
    if (c.stress === 'walk' && !c.channel) problems.push(`${c.id}: stress walk without a channel`);
    if (!c.channel && !c.note) problems.push(`${c.id}: no channel and no note explaining why`);
    if (c.channel) validateChannel(c, problems);
    if (c.reads) for (const r of c.reads) if (typeof r !== 'string' || !r) problems.push(`${c.id}: bad read path`);
  }
  for (const p of PANELS) if (!controls.some((c) => c.panel === p.id)) problems.push(`panel ${p.id} has no controls`);
  return problems;
}

export const UI_PROBLEMS = Object.freeze(validateControls(UI_CONTROLS));
