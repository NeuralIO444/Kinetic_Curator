// Voice state (#280) — curated mode personas + the performer's own shelf.
//
// Built-in flagship voices live in data/voices.js. User voices are the
// operator's kit: captured from the live instrument, persisted in
// localStorage (like the palette library — they outlive any one project and
// are deliberately NOT part of the project document).
//
// Loading a voice never hard-cuts: loadVoice snapshots the current
// effective state and opens a MIX — the live loop renders the interpolated
// blend (see resolveLiveRenderState) until the driver commits the target.

import { createGrid } from '../../engine/ca-engine.js';
import {
  DEFAULT_LAYOUT_PARAMS,
  validateLayoutParams,
} from '../../data/layout-modes.js';
import { normalizeHex } from '../../data/palettes.js';
import {
  FLAGSHIP_VOICES,
  resolveVoiceState,
  sanitizeFx,
  captureLiveVoiceState,
  VOICE_SWATCH_COUNT,
} from '../../data/voices.js';
import { pushToUndo } from '../history.js';

export const USER_VOICES_KEY = 'kc:user-voices:v1';
export const MAX_USER_VOICES = 12;

function swatchesN(colors) {
  const clean = (Array.isArray(colors) ? colors : []).map((c) => normalizeHex(c)).filter(Boolean);
  const base = clean.length ? clean : ['#888888'];
  const out = [];
  for (let i = 0; i < VOICE_SWATCH_COUNT; i++) out.push(base[i % base.length]);
  return out;
}

/** Accept only well-formed entries — this data comes from localStorage. */
export function sanitizeUserVoice(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : null;
  if (!id) return null;
  const name = typeof raw.name === 'string' && raw.name.trim()
    ? raw.name.trim().slice(0, 24)
    : 'VOICE';
  const st = raw.state && typeof raw.state === 'object' ? raw.state : null;
  if (!st) return null;
  const { params } = validateLayoutParams({ ...DEFAULT_LAYOUT_PARAMS, ...(st.params || {}) });
  const pal = st.palette && typeof st.palette === 'object' ? st.palette : {};
  const assets = st.assets === 'all'
    ? 'all'
    : (st.assets && typeof st.assets === 'object'
      ? Object.fromEntries(Object.entries(st.assets).filter(([, v]) => typeof v === 'boolean').slice(0, 400))
      : 'all');
  return {
    id,
    name,
    state: {
      params,
      palette: {
        bg: normalizeHex(pal.bg) || '#0a0a0a',
        ink: normalizeHex(pal.ink) || '#f0f0e8',
        swatches: swatchesN(pal.swatches),
      },
      fx: sanitizeFx(st.fx),
      assets,
      blendSeconds: Number.isFinite(st.blendSeconds) && st.blendSeconds > 0 ? Math.min(30, st.blendSeconds) : 2,
    },
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readStored() {
  const ls = storage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(USER_VOICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : []).map(sanitizeUserVoice).filter(Boolean);
  } catch {
    return [];
  }
}

function persist(list) {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(USER_VOICES_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[voices] save failed', e);
  }
}

/** Next auto-name: VOICE 01, VOICE 02, … — never reuses a live number. */
export function nextVoiceName(list) {
  let max = 0;
  for (const v of list || []) {
    const m = /^VOICE (\d+)$/.exec(v.name || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `VOICE ${String(max + 1).padStart(2, '0')}`;
}

/** Find a voice definition by id across flagships and the user shelf. */
export function findVoiceDef(id, userVoices) {
  const f = FLAGSHIP_VOICES.find((v) => v.id === id);
  if (f) return { ...f, kind: 'flagship', displayName: `${f.name} — ${f.title}` };
  const u = (userVoices || []).find((v) => v.id === id);
  if (u) {
    return {
      id: u.id,
      name: u.name,
      title: u.name,
      kind: 'user',
      displayName: u.name,
      palette: u.state.palette,
      params: u.state.params,
      fx: u.state.fx,
      assets: u.state.assets,
      blendSeconds: u.state.blendSeconds,
    };
  }
  return null;
}

export const createVoiceSlice = (set) => ({
  userVoices: readStored(),
  /** null | { from, to, t, durationMs, auto, startedAt, targetVoiceId, targetName } */
  voiceMix: null,
  /** Voice id whose chip is lit — cleared the moment hands touch a param. */
  activeVoiceId: null,

  /**
   * Drop the needle on a voice: snapshot the current effective state and
   * open a MIX toward the target. The live loop renders the blend; the
   * driver commits when t reaches 1. Retargeting mid-mix re-snapshots from
   * the in-flight blend, so chains stay smooth.
   */
  loadVoice: (voiceId) => set((state) => {
    const def = findVoiceDef(voiceId, state.userVoices);
    if (!def) return {};
    if (state.activeVoiceId === voiceId && !state.voiceMix) return {};
    const from = captureLiveVoiceState(state);
    const to = resolveVoiceState(def);
    const durationMs = Math.max(200, (to.blendSeconds || 2) * 1000);
    return {
      voiceMix: {
        from,
        to,
        t: 0,
        durationMs,
        auto: true,
        startedAt: Date.now(),
        targetVoiceId: voiceId,
        targetName: def.displayName || def.name || voiceId,
      },
      activeVoiceId: voiceId,
    };
  }),

  /** Scrub the MIX position by hand — pauses the auto-advance. */
  setVoiceMixT: (t) => set((state) => {
    const mix = state.voiceMix;
    if (!mix) return {};
    const nt = Math.min(1, Math.max(0, Number(t) || 0));
    if (Math.abs(nt - mix.t) < 0.001) return {};
    return { voiceMix: { ...mix, t: nt, auto: false } };
  }),

  /** Resume the auto-advance from the scrubbed position. */
  resumeVoiceMix: () => set((state) => {
    const mix = state.voiceMix;
    if (!mix || mix.auto) return {};
    return {
      voiceMix: { ...mix, auto: true, startedAt: Date.now() - mix.t * mix.durationMs },
    };
  }),

  /** Bail out of a mix — the committed state is untouched. */
  cancelVoiceMix: () => set((state) => {
    if (!state.voiceMix) return {};
    return { voiceMix: null, activeVoiceId: null };
  }),

  /**
   * Land the mix: the target becomes the committed state in one undo step.
   * Called by the driver at t=1.
   */
  commitVoiceMix: () => set((state) => {
    const mix = state.voiceMix;
    if (!mix || !mix.to) return {};
    const to = mix.to;
    const next = { ...pushToUndo(state, true) };
    next.layoutParams = { ...to.params };
    next.paletteOverrides = {
      bg: to.palette.bg,
      ink: to.palette.ink,
      swatches: [...to.palette.swatches],
    };
    if (to.assets === 'all') {
      const m = {};
      for (const k of Object.keys(state.enabledAssets || {})) m[k] = true;
      next.enabledAssets = m;
    } else {
      next.enabledAssets = { ...to.assets };
    }
    // A user voice captured while on the cellular engine restores its grid.
    if (to.params.mode === 'ca' && !state.caGrid) next.caGrid = createGrid(40, 28);
    next.voiceMix = null;
    next.activeVoiceId = mix.targetVoiceId || null;
    return next;
  }),

  /**
   * The + chip: capture the current live state as a new user voice.
   * Returns {} when the shelf is full — the UI disables + at the cap.
   */
  captureUserVoice: () => set((state) => {
    if (state.userVoices.length >= MAX_USER_VOICES) return {};
    const entry = sanitizeUserVoice({
      id: `uv-${Date.now().toString(36)}`,
      name: nextVoiceName(state.userVoices),
      state: captureLiveVoiceState(state),
      createdAt: Date.now(),
    });
    if (!entry) return {};
    const userVoices = [...state.userVoices, entry];
    persist(userVoices);
    // Capturing doesn't switch voices — it shelves what you're hearing.
    return { userVoices };
  }),

  renameUserVoice: (id, name) => set((state) => {
    const clean = typeof name === 'string' ? name.trim().slice(0, 24) : '';
    if (!clean) return {};
    const userVoices = state.userVoices.map((v) => (v.id === id ? { ...v, name: clean } : v));
    persist(userVoices);
    return { userVoices };
  }),

  /** Long-press: overwrite the chip with the current live state. */
  overwriteUserVoice: (id) => set((state) => {
    const target = state.userVoices.find((v) => v.id === id);
    if (!target) return {};
    const nextState = captureLiveVoiceState(state);
    const userVoices = state.userVoices.map((v) => (v.id === id
      ? sanitizeUserVoice({ id: v.id, name: v.name, state: nextState, createdAt: v.createdAt })
      : v)).filter(Boolean);
    persist(userVoices);
    return { userVoices };
  }),

  deleteUserVoice: (id) => set((state) => {
    const userVoices = state.userVoices.filter((v) => v.id !== id);
    if (userVoices.length === state.userVoices.length) return {};
    persist(userVoices);
    const next = { userVoices };
    if (state.activeVoiceId === id) next.activeVoiceId = null;
    return next;
  }),
});
