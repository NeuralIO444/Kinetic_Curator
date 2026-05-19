// Action types — VERB_NOUN naming convention
// Every state mutation goes through dispatch(action)

// ── Playback ─────────────────────────────────────────────────
export const SET_RUNNING     = 'SET_RUNNING';
export const SET_FPS         = 'SET_FPS';
export const SET_SEED        = 'SET_SEED';
export const BUMP_SEED       = 'BUMP_SEED';

// ── Palette ──────────────────────────────────────────────────
export const SET_PALETTE_ID  = 'SET_PALETTE_ID';

// ── Layout params ────────────────────────────────────────────
export const SET_LAYOUT_PARAM  = 'SET_LAYOUT_PARAM';
export const SET_LAYOUT_PARAMS = 'SET_LAYOUT_PARAMS';
export const APPLY_PRESET      = 'APPLY_PRESET';

// ── Asset pool ───────────────────────────────────────────────
export const TOGGLE_ASSET      = 'TOGGLE_ASSET';
export const TOGGLE_ALL_ASSETS = 'TOGGLE_ALL_ASSETS';
export const SET_SEARCH      = 'SET_SEARCH';
export const SET_CAT_FILTER  = 'SET_CAT_FILTER';
export const SET_POOL_VIEW   = 'SET_POOL_VIEW';

// ── Stimulus / input ─────────────────────────────────────────
export const SET_WEBCAM_ENABLED  = 'SET_WEBCAM_ENABLED';
export const SET_AUDIO_ENABLED   = 'SET_AUDIO_ENABLED';
export const SET_MOTION_ENERGY   = 'SET_MOTION_ENERGY';
export const SET_AUDIO_STIMULUS  = 'SET_AUDIO_STIMULUS';
export const SET_BEAT_PULSE      = 'SET_BEAT_PULSE';
export const SET_AUDIO_BANDS     = 'SET_AUDIO_BANDS';
export const SET_AUDIO_GAIN      = 'SET_AUDIO_GAIN';
export const SET_AUDIO_SOURCE    = 'SET_AUDIO_SOURCE';
export const SET_AUDIO_MONITOR   = 'SET_AUDIO_MONITOR';


// ── Davis mode & Global View ───────────────────────────────────
export const SET_EVOLVE_MODE     = 'SET_EVOLVE_MODE';
export const SET_EVOLVE_SOURCE   = 'SET_EVOLVE_SOURCE';
export const SET_EVOLVE_TARGET   = 'SET_EVOLVE_TARGET';
export const SET_EVOLVE_INTERVAL = 'SET_EVOLVE_INTERVAL';
export const SET_AUTO_SNAPSHOT   = 'SET_AUTO_SNAPSHOT';
export const TRIGGER_EVOLVE      = 'TRIGGER_EVOLVE';
export const SET_SLOW_RENDER     = 'SET_SLOW_RENDER';
export const TOGGLE_FULLSCREEN   = 'TOGGLE_FULLSCREEN';

// ── Snapshots / favorites ────────────────────────────────────
export const ADD_SNAPSHOT      = 'ADD_SNAPSHOT';
export const REMOVE_SNAPSHOT   = 'REMOVE_SNAPSHOT';
export const CLEAR_SNAPSHOTS   = 'CLEAR_SNAPSHOTS';
export const SET_EXPORT_RESOLUTION = 'SET_EXPORT_RESOLUTION';
export const SET_IS_RECORDING    = 'SET_IS_RECORDING';
export const ADD_FAVORITE      = 'ADD_FAVORITE';
export const REMOVE_FAVORITE   = 'REMOVE_FAVORITE';
export const RECALL_FAVORITE   = 'RECALL_FAVORITE';
export const SET_MOTION_SMOOTHING = 'SET_MOTION_SMOOTHING';

// ── Parameter exploration (Bundle 3) ─────────────────────────
export const TOGGLE_PARAM_LOCK      = 'TOGGLE_PARAM_LOCK';
export const RANDOMIZE_PARAM        = 'RANDOMIZE_PARAM';
export const RANDOMIZE_UNLOCKED     = 'RANDOMIZE_UNLOCKED';

// ── Cellular Automaton ───────────────────────────────────────
export const STEP_CA_GRID    = 'STEP_CA_GRID';
export const RESET_CA_GRID   = 'RESET_CA_GRID';
