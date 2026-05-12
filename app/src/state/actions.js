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
export const SET_SEARCH        = 'SET_SEARCH';
export const SET_CAT_FILTER    = 'SET_CAT_FILTER';
export const SET_POOL_VIEW     = 'SET_POOL_VIEW';

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
export const TOGGLE_FULLSCREEN   = 'TOGGLE_FULLSCREEN';
export const SET_RENDERING_MODE  = 'SET_RENDERING_MODE';
export const SET_PERF_MODE       = 'SET_PERF_MODE';
export const SET_MODE            = 'SET_MODE';     // 'studio' | 'live'
export const RESTORE_STATE       = 'RESTORE_STATE';

// ── Keyframe playback ────────────────────────────────────────
export const SET_KEYFRAME_PLAY      = 'SET_KEYFRAME_PLAY';
export const SET_KEYFRAME_DURATION  = 'SET_KEYFRAME_DURATION';

// ── Layers ───────────────────────────────────────────────────
export const ADD_LAYER           = 'ADD_LAYER';
export const REMOVE_LAYER        = 'REMOVE_LAYER';
export const TOGGLE_LAYER        = 'TOGGLE_LAYER';
export const SET_LAYER_OPACITY   = 'SET_LAYER_OPACITY';
export const SET_LAYER_BLEND     = 'SET_LAYER_BLEND';
export const SET_LAYER_NAME      = 'SET_LAYER_NAME';
export const MOVE_LAYER          = 'MOVE_LAYER';
export const ACTIVATE_LAYER      = 'ACTIVATE_LAYER';
export const DEACTIVATE_LAYER    = 'DEACTIVATE_LAYER';


// ── Effects ───────────────────────────────────────────────────────────────
export const SET_BLEND_MODE = 'SET_BLEND_MODE';
export const SET_BLEND_STRENGTH = 'SET_BLEND_STRENGTH';
export const SET_ECHO_ENABLED = 'SET_ECHO_ENABLED';
export const SET_ECHO_COUNT = 'SET_ECHO_COUNT';
export const SET_ECHO_DECAY = 'SET_ECHO_DECAY';
export const SET_TRAIL_ENABLED = 'SET_TRAIL_ENABLED';
export const SET_TRAIL_LENGTH = 'SET_TRAIL_LENGTH';
export const SET_FEEDBACK_ENABLED = 'SET_FEEDBACK_ENABLED';
export const SET_FEEDBACK_STRENGTH = 'SET_FEEDBACK_STRENGTH';
export const SET_FEEDBACK_DEPTH = 'SET_FEEDBACK_DEPTH';
export const SET_PARTICLES_ENABLED = 'SET_PARTICLES_ENABLED';
export const SET_PARTICLE_COUNT = 'SET_PARTICLE_COUNT';
export const SET_PARTICLE_SPEED = 'SET_PARTICLE_SPEED';
export const SET_MOTION_ENABLED = 'SET_MOTION_ENABLED';
export const SET_MOTION_TYPE = 'SET_MOTION_TYPE';
export const SET_BLAST_RADIUS_ENABLED = 'SET_BLAST_RADIUS_ENABLED';
export const SET_BLAST_RADIUS = 'SET_BLAST_RADIUS';
export const SET_BLAST_FORCE = 'SET_BLAST_FORCE';
export const SET_COLOR_STRATEGY = 'SET_COLOR_STRATEGY';
export const SET_COLOR_HARMONY = 'SET_COLOR_HARMONY';

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
export const TOGGLE_PARAM_KINETIC   = 'TOGGLE_PARAM_KINETIC';
export const RANDOMIZE_PARAM        = 'RANDOMIZE_PARAM';
export const RANDOMIZE_UNLOCKED     = 'RANDOMIZE_UNLOCKED';
