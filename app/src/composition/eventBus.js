// Typed event bus — panels emit, shell/store subscribes.
const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => {
    const set = listeners.get(event);
    if (set) {
      set.delete(fn);
      if (set.size === 0) listeners.delete(event);
    }
  };
}

export function off(event, fn) {
  const set = listeners.get(event);
  if (set) {
    set.delete(fn);
    if (set.size === 0) listeners.delete(event);
  }
}

// #1457 / #1458 — the OPT-IN event envelope. emit(event, payload) is unchanged. emit(event, payload, { cause }) also
// hands every listener a second argument, `meta`: { seq, event, cause, ...musical stamp }, so "who changed this, and
// where in the bar" has an answer. Existing listeners (payload only) are untouched; the stamp comes from the clock.
let seq = 0;
let stampProvider = null;

/** The clock publishes musical time for stamping: fn() => { loopMs, bar, beat, phase, bpm } | null. */
export function setStampProvider(fn) {
  stampProvider = typeof fn === 'function' ? fn : null;
}

/** Start the envelope's sequence over (a fresh take). */
export function resetEnvelope() {
  seq = 0;
}

export function emit(event, payload, opts) {
  const set = listeners.get(event);
  if (!set) return;
  let meta;
  if (opts) {
    let stamp;
    try {
      stamp = stampProvider ? stampProvider() : null;
    } catch {
      stamp = null;
    }
    meta = {
      seq: ++seq,
      event,
      cause: (opts && opts.cause) ?? null,
      ...(opts && opts.quantized ? { quantized: opts.quantized } : {}),
      ...(stamp || {}),
    };
  }
  for (const fn of set) {
    try {
      fn(payload, meta);
    } catch (e) {
      console.error('[eventBus]', event, e);
    }
  }
}

// #1458 — quantised emit: hold an event until the next beat or bar tick, then release it stamped with that tick.
// "Davis's new asset lands on the downbeat, not at a random moment." The clock drives releaseTick().
const pending = { beat: [], bar: [] };
/** The most events a unit may hold (a stopped clock must not grow a queue without bound). */
export const PENDING_CAP = 64;

/**
 * #1641 — events the cap has eaten, counted. The cap is right (a
 * stopped clock must not grow a queue without bound), but the drops
 * used to leave no trace even in the bus's own record. Backstage
 * data — a counter for the DEV/census surface, not a performer line.
 * Reset by clearPending (a fresh take starts a fresh count).
 */
let dropsPastCap = 0;
export function droppedPastCap() {
  return dropsPastCap;
}

/**
 * @param unit 'beat' | 'bar'
 * @returns false when the unit is unknown (nothing queued)
 */
export function emitOn(unit, event, payload, opts = {}) {
  const q = pending[unit];
  if (!q) return false;
  q.push({ event, payload, opts: { ...opts, quantized: unit } });
  while (q.length > PENDING_CAP) {
    q.shift();
    dropsPastCap++;
  }
  return true;
}

/** Release what was waiting for this tick, in the order it was queued. Called by the clock. */
export function releaseTick(unit) {
  const q = pending[unit];
  if (!q || q.length === 0) return 0;
  const batch = q.splice(0, q.length);
  for (const p of batch) emit(p.event, p.payload, p.opts);
  return batch.length;
}

/** Drop everything waiting (tests, a fresh take). */
export function clearPending() {
  pending.beat.length = 0;
  pending.bar.length = 0;
  dropsPastCap = 0; // #1641: a fresh take starts a fresh count
}

export function once(event, fn) {
  const wrap = (p) => {
    off(event, wrap);
    fn(p);
  };
  on(event, wrap);
}

export const Events = {
  DAVIS_EVOLVE: 'davis:evolve',
  DAVIS_MORPH: 'davis:morph',
  DAVIS_MORPH_DURATION: 'davis:morphDuration',
  DAVIS_PHRASE: 'davis:phrase',
  DAVIS_RESET_PHRASE: 'davis:resetPhrase',
  DAVIS_MUTATE_STREAM: 'davis:mutateStream', // #305: { group } | { reset: true }
  DAVIS_FAVORITE: 'davis:favorite',
  DAVIS_FAVORITE_REMOVE: 'davis:favoriteRemove',
  EXPLORER_LOAD_RUN: 'explorer:loadRun', // #1507: the GENERATE label row asks the candidate tray to open its run-folder picker
  ACCUM_GESTURE: 'accum:gesture', // Phase A: { action: 'freeze'|'clear'|'swell', value? }
  CANVAS_BG_CYCLE: 'canvas:bgCycle', // #310: BG cycle lives in OUTPUT now
  LAYOUT_PARAM: 'layout:param',
  LAYOUT_PRESET: 'layout:preset',
  LAYOUT_LOCK: 'layout:lock',
  LAYOUT_CURATE: 'layout:curate',
  AUDIO_TOGGLE: 'audio:toggle',
  AUDIO_GAIN: 'audio:gain',
  AUDIO_SOURCE: 'audio:source',
  AUDIO_MONITOR: 'audio:monitor',
  ASSETS_TOGGLE: 'assets:toggle',
  ASSETS_SOLO: 'assets:solo',
  ASSETS_TOGGLE_ALL: 'assets:toggleAll',
  ASSETS_SEARCH: 'assets:search',
  ASSETS_CAT_FILTER: 'assets:catFilter',
  ASSETS_WEIGHT_CYCLE: 'assets:weightCycle',
  ASSETS_OPTION_CYCLE: 'assets:optionCycle', // #1694 S2 — cycle a record-declared tile option ({ id, key })
  ASSETS_STILL_TOGGLE: 'assets:stillToggle', // #1128
  ASSETS_WEIGHT_SET: 'assets:weightSet',
  ASSETS_CATEGORY_WEIGHT: 'assets:categoryWeight',
  ASSETS_WEIGHT_CLEAR: 'assets:weightClear',
  ASSETS_DUPLICATE: 'assets:duplicate',
  ASSETS_INGEST: 'assets:ingest',
  ASSETS_REMOVE: 'assets:remove',
  ASSETS_RENAME: 'assets:rename',
  ASSETS_REPLACE: 'assets:replace',
  ASSETS_REGION_SLOT: 'assets:regionSlot',
  ASSETS_REGION_KINEME: 'assets:regionKineme', // #1434
  EXPORT_SNAPSHOT: 'export:snapshot',
  EXPORT_RECORD: 'export:record',
  EXPORT_RENDERING: 'export:rendering',
  EXPORT_BATCH_PAUSE: 'export:batchPause',
  EXPORT_RESOLUTION: 'export:resolution',
  EXPORT_CLEAR_SNAPSHOTS: 'export:clearSnapshots',
  EXPORT_QUALITY: 'export:quality',
  EXPORT_AUTO_QUALITY: 'export:autoQuality',
  EXPORT_SEED: 'export:seed',
  EXPORT_LOAD_PROJECT: 'export:loadProject',
  LAYER_ADD: 'layer:add',
  LAYER_REMOVE: 'layer:remove',
  LAYER_SET_ACTIVE: 'layer:setActive',
  LAYER_SWAP_POSITIONS: 'layer:swapPositions',
  LAYER_TOGGLE_VISIBLE: 'layer:toggleVisible',
  LAYER_TOGGLE_FEEDS_ACCUM: 'layer:toggleFeedsAccum',
  LAYER_TOGGLE_WET_SOAK: 'layer:toggleWetSoak',
  LAYER_SET_BLEND_MODE: 'layer:setBlendMode',
  LAYER_SET_OPACITY: 'layer:setOpacity',
  LAYER_DUPLICATE: 'layer:duplicate',
  LAYER_SOLO: 'layer:solo',
  LAYER_ADD_FX: 'layer:addFx',
  FX_SELECT: 'fx:select',
  FX_EFFECT_ADD: 'fx:effectAdd',
  FX_EFFECT_REMOVE: 'fx:effectRemove',
  FX_EFFECT_SET_PARAM: 'fx:effectSetParam',
  LAYER_ADD_MATH: 'layer:addMath',
  MATH_SELECT: 'math:select',
  MATH_EFFECT_ADD: 'math:effectAdd',
  MATH_EFFECT_REMOVE: 'math:effectRemove',
  MATH_EFFECT_REORDER: 'math:effectReorder',
  MATH_EFFECT_SET_KIND: 'math:effectSetKind',
  MATH_EFFECT_SET_PARAM: 'math:effectSetParam',
  MATH_EFFECT_SET_MOD: 'math:effectSetMod',
  PALETTE_SAVE: 'palette:save',
  PALETTE_DELETE: 'palette:delete',
  PALETTE_IMPORT: 'palette:import',
  PALETTE_SET_ID: 'palette:setId', // { id }
  PALETTE_SWATCH: 'palette:swatch', // { index, hex }
  PALETTE_BG: 'palette:bg', // { hex }
  PALETTE_INK: 'palette:ink', // { hex }
  PALETTE_OVERRIDES: 'palette:overrides', // { swatches?, bg?, ink? } the Wing's generate
  PALETTE_CLEAR_OVERRIDES: 'palette:clearOverrides',
  PALETTE_COLOR_MODE: 'palette:colorMode', // { mode }
  RUN_SET: 'run:set', // { running } the run / pause button
  PALETTE_LOCK: 'palette:lock',
  PALETTE_HARMONY: 'palette:harmony',
  VIEW_FULLSCREEN: 'view:fullscreen', // toggle the page fullscreen
  STAGE_MODE: 'stage:mode', // { mode } the STAGE output mode
  STAGE_BLACKOUT: 'stage:blackout', // { on }
  STAGE_TEST_PATTERN: 'stage:testPattern', // { on }
  STAGE_MAPPING: 'stage:mapping', // { mapping }
  STAGE_DISPLAY: 'stage:display', // { id } the chosen display, or null
  STAGE_ERROR: 'stage:error', // { message } or null to dismiss
  STAGE_SYPHON_ON: 'stage:syphonOn', // { on }
  STAGE_SYPHON_NAME: 'stage:syphonName', // { name }
  CANVAS_SIZE: 'canvas:size', // { w, h, presetId } the authored raster
  QUEUE_TOGGLE: 'queue:toggle', // play / pause the HITS queue
  QUEUE_PLAYING: 'queue:playing', // { on }
  QUEUE_INDEX: 'queue:index', // { index } the hit now current
  QUEUE_JUMP: 'queue:jump', // a tap-to-jump: restart the autoplay clock
  QUEUE_SOURCE: 'queue:source', // { source } autoplay clock: seconds | beats
  QUEUE_SECONDS: 'queue:secondsPerHit', // { seconds }
  QUEUE_BEATS: 'queue:beatsPerHit', // { beats }
  CANVAS_PRESET: 'canvas:preset', // { id } apply a canvas preset
  CANVAS_PRESET_SAVE: 'canvas:presetSave', // { label } save the current raster as a user preset
  CANVAS_PRESET_DELETE: 'canvas:presetDelete', // { id }
  CANVAS_PRESET_RENAME: 'canvas:presetRename', // { id, label }
  CANVAS_PRESETS_LOAD: 'canvas:presetsLoad', // read the user presets from disk
  CANVAS_FPS: 'canvas:fps', // { fps } capture fps
  CANVAS_ASPECT_LOCK: 'canvas:aspectLock', // { on }
  CANVAS_SWAP: 'canvas:swap', // swap width and height
  DISPLAY_FXAA: 'display:fxaa', // { on } per-machine FXAA
  DISPLAY_WEAVE: 'display:weave', // { on } per-machine gate weave
  DISPLAY_EXPOSURE: 'display:exposure', // { stops } per-machine resolve exposure, EV detents (#1830)
  VOICE_LOAD: 'voice:load', // { id }
  VOICE_DELETE: 'voice:delete', // { id } a performer voice
  VOICE_RENAME: 'voice:rename', // { id, name }
  VOICE_MIX: 'voice:mix', // { t } 0..1 the MIX road position
  MODE_LOAD: 'mode:load', // { id } a composition mode tile
  MOTION_LOAD: 'motion:load', // { id } a motion shelf tile
  SHAPES_LOAD: 'shapes:load', // { id } a shape set
  SHAPES_CYCLE: 'shapes:cycle', // { id } cycle a shape level
  DICE_CAST: 'dice:cast', // { assetIds } the crowned cast
  KEEP_ADD: 'keep:add', // { keep } a record in the keep ledger
  ROLL_SCOPE_CLEAR: 'roll:scopeClear', // clear the armed mode and motion
  PATTERN_MODE: 'pattern:mode', // { id, mode }
  PATTERN_PARAM: 'pattern:param', // { id, key, value }
  PATTERN_ADD: 'pattern:add', // { mode } add a PATTERN track
  PATTERN_SELECT: 'pattern:select', // { id }
  LAYER_PATCH: 'layer:patch', // { id, patch } OFF / MOD / FIELD / FEED link
  MACRO_ADD: 'macro:add', // add a math macro knob
  MACRO_REMOVE: 'macro:remove', // { id }
  MACRO_RENAME: 'macro:rename', // { id, name }
  FEEL_APPLY: 'feel:apply', // { id } a FEEL preset
  LIGHT_SET: 'light:set', // the CHIAROSCURO sun patch itself (an object, or a boolean for on/off)
  ATTACH_CLEAR: 'attach:clear', // { assetId } drop an asset's edited ATTACH points
  BEAT_BPM: 'beat:bpm', // { bpm } the BEAT master BPM
  BEAT_METRO: 'beat:metro', // { on } the metro click
  AUDIO_ROUTES_SET: 'audio:routesSet', // { routes, continuous } replace the route table (null = defaults)
  AUDIO_ROUTES_EDIT: 'audio:routesEdit', // { fn, continuous } edit the table with an updater function (in-process only: a function is not serialisable; the envelope work in #1457 will turn these into named ops)
  AUDIO_SIDECAR: 'audio:sidecar', // { sidecar, note } a pre-analysed envelope file, or null with the reason
  MIDI_ENABLED: 'midi:enabled', // { on }
  STARTUP_MODE: 'startup:mode', // { mode } chaos | fixed
  PROJECT_TITLE: 'project:title', // { title } the project name shown in exports
  TASTE_EXPERIMENTAL: 'taste:experimental', // { on } the experimental taste switch
  TASTE_CLEAR: 'taste:clear', // drop the loaded taste.json
  BLOOM: 'davis:bloom', // #1153: a keep after a run of the artist's rolls ({ rolls, at }): the moment an earned voice is minted
  ROLL_GUARD: 'roll:guard', // #1107: a roll just landed ({ kind: chaos|rules|weather|look|voice|curator|curate }); the guard checks the frame
  KINETIC_TAP: 'kinetic:tap', // loisActivity: every KINETIC tap (button + K)
  AUDIO_INPUT: 'audio:input', // #1459: { source: mic | file | none } the input changed
  AUDIO_ONSET: 'audio:onset', // #1459: { strength, band } a hit (spectral flux)
  AUDIO_TEMPO: 'audio:tempo', // #1459: { bpm, confidence } the estimate moved by more than 2 bpm
  AUDIO_ENERGY: 'audio:energy', // #1459: { level: low | mid | high } with hysteresis
  AUDIO_SILENCE_START: 'audio:silenceStart', // #1459: { ms } quiet for over 2 s
  AUDIO_SILENCE_END: 'audio:silenceEnd', // #1459: { ms } sound is back; how long the silence lasted
  MIND_DECISION: 'mind:decision', // #1462: { persona, bar, backend: apple | rules, seed, invented, reply } once a bar per persona
  MIND_REQUEST: 'mind:request', // #1462: { persona, bar, backend, invented, reply } on the downbeat after a decision that asks the stage
  MIND_STATUS: 'mind:status', // #1462/#1463: { available, backend: apple | rules | demo, model? } when the answering backend changes (dev panel)
  MIND_REQ: 'mind:req', // #1463: { persona, bar, seed, contextHash } a persona asks the model
  MIND_REPLY: 'mind:reply', // #1463: { persona, bar, backend, latencyMs, reply | null, error? } every answer, used or not
  MIND_ROUTE: 'mind:route', // #1483: { status: applied | dropped, reason?, op, delta?, bar, landBar? } what became of Davis's route proposal
  DIRECTOR_ROOM: 'director:room', // #1145: { verdict, n, lois, davis, intensity: low|mid|peak, relaxing, phase } when the Director's room changes (no gains)
  CLOCK_BEAT: 'clock:beat', // #1458: { bar, beat, bpm } every whole beat of the loop clock
  CLOCK_BAR: 'clock:bar', // #1458: { bar, bpm } every downbeat
  ACTIVITY_HEARTBEAT: 'activity:heartbeat', // #1390 (G8): { ts, idleMs } — loisActivity publishes while the artist is active
  DISH_DENSITY: 'dish:density', // #1412: { field } — the shared grid's contact-density field for the frame (engine/dishDensity.mjs; counts are that tick's, read-only)
};
