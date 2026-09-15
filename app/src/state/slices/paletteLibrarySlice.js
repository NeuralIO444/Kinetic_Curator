// User palette library (#55) — save the palette you're working on, switch
// back to it later, move it between machines as JSON.
//
// Deliberately NOT part of the project document: a project records which
// palette it used, the library is the operator's own kit that outlives any
// one project. Lives in its own localStorage key.
import { getCatalogPalette, normalizeHex } from '../../data/palettes.js';

export const USER_PALETTES_KEY = 'kc:user-palettes:v1';

/** Accept only well-formed entries — this data can come from a file. */
export function sanitizePalette(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const swatches = Array.isArray(raw.swatches)
    ? raw.swatches.map(normalizeHex).filter(Boolean)
    : [];
  if (swatches.length === 0) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : `user-${Date.now().toString(36)}`;
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

  /** Snapshot the palette currently on screen (catalog + overrides) as a new entry. */
  saveUserPalette: (name) => set((state) => {
    const base = getCatalogPalette(state.paletteId, state.userPalettes);
    const o = state.paletteOverrides;
    const entry = sanitizePalette({
      id: `user-${Date.now().toString(36)}`,
      name: name || `${base.name} ✎`,
      bg: o?.bg || base.bg,
      ink: o?.ink || base.ink,
      swatches: base.swatches.map((s, i) => o?.swatches?.[i] || s),
    });
    if (!entry) return {};
    const userPalettes = [...state.userPalettes, entry];
    persist(userPalettes);
    // Switch to the saved entry so overrides collapse into it rather than
    // lingering as unsaved edits on top of a catalog palette.
    return { userPalettes, paletteId: entry.id, paletteOverrides: null };
  }),

  deleteUserPalette: (id) => set((state) => {
    const userPalettes = state.userPalettes.filter((p) => p.id !== id);
    if (userPalettes.length === state.userPalettes.length) return {};
    persist(userPalettes);
    // Don't strand the app on a palette that no longer exists.
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

  /** Merge imported entries; same-id entries are replaced. */
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
