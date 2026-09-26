// User palette library (#55) + palette FADE seconds (#278).
// FADE is a feel pref, not project JSON.
import { getCatalogPalette, normalizeHex } from '../../data/palettes.js';
import { sanitizeMixSeconds, MIX_DEFAULT } from '../../gl/paletteMix.mjs';

export const USER_PALETTES_KEY = 'kc:user-palettes:v1';

// Fallback ids must be unique per call (#628): a synchronous import map would
// otherwise give every id-less entry the same Date.now() millisecond and the
// store would dedupe them to one. Ids are identity, not sim — a module-level
// counter suffix is fine, no determinism concern.
let fallbackIdSeq = 0;
export function nextFallbackPaletteId() {
  return `user-${Date.now().toString(36)}-${(fallbackIdSeq++).toString(36)}`;
}

export function sanitizePalette(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const swatches = Array.isArray(raw.swatches)
    ? raw.swatches.map(normalizeHex).filter(Boolean)
    : [];
  if (swatches.length === 0) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : nextFallbackPaletteId();
  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : 'UNTITLED',
    era: 'user palette',
    bg: normalizeHex(raw.bg) || '#0a0a0a',
    ink: normalizeHex(raw.ink) || '#f0f0e8',
    swatches,
    user: true,
  };
}

function readStored() {
  try {
    const raw = localStorage.getItem(USER_PALETTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(sanitizePalette).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function persist(list) {
  try {
    localStorage.setItem(USER_PALETTES_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[palette library] save failed', e);
  }
}

export const createPaletteLibrarySlice = (set, get) => ({
  userPalettes: readStored(),
  paletteMixSeconds: MIX_DEFAULT,

  setPaletteMixSeconds: (v) => set({ paletteMixSeconds: sanitizeMixSeconds(v) }),

  saveUserPalette: (name) => set((state) => {
    const base = getCatalogPalette(state.paletteId, state.userPalettes);
    const o = state.paletteOverrides;
    const entry = sanitizePalette({
      id: nextFallbackPaletteId(),
      name: name || `${base.name} ✎`,
      bg: o?.bg || base.bg,
      ink: o?.ink || base.ink,
      swatches: base.swatches.map((s, i) => o?.swatches?.[i] || s),
    });
    if (!entry) return {};
    const userPalettes = [...state.userPalettes, entry];
    persist(userPalettes);
    return { userPalettes, paletteId: entry.id, paletteOverrides: null };
  }),

  deleteUserPalette: (id) => set((state) => {
    const userPalettes = state.userPalettes.filter((p) => p.id !== id);
    if (userPalettes.length === state.userPalettes.length) return {};
    persist(userPalettes);
    const next = { userPalettes };
    if (state.paletteId === id) {
      next.paletteId = 'praystation';
      next.paletteOverrides = null;
    }
    return next;
  }),

  renameUserPalette: (id, name) => set((state) => {
    const userPalettes = state.userPalettes.map((p) =>
      (p.id === id ? { ...p, name: String(name || '').trim().slice(0, 40) || p.name } : p));
    persist(userPalettes);
    return { userPalettes };
  }),

  importUserPalettes: (list) => set((state) => {
    const incoming = (Array.isArray(list) ? list : [list]).map(sanitizePalette).filter(Boolean);
    if (incoming.length === 0) return {};
    const byId = new Map(state.userPalettes.map((p) => [p.id, p]));
    for (const p of incoming) byId.set(p.id, p);
    const userPalettes = [...byId.values()];
    persist(userPalettes);
    return { userPalettes };
  }),

  clearUserPalettes: () => set(() => {
    persist([]);
    return { userPalettes: [] };
  }),

  exportUserPalettes: () => get().userPalettes,
});
