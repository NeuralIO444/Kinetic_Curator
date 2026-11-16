// Look Library state (#2148 step 1) — where installed Looks live (docs/DLC_PRESET_TYPES.md §1–§2).
//
// Pipeline IMPORT only INSTALLS here; the Library UI and the 16 Look slots are later steps. Installing a pack never
// touches slots, the live scene, the palette library or the project document. Persisted in localStorage like the
// palette library and the voice shelf — it outlives any one project and is deliberately NOT part of the project
// document. A stored list is a trust boundary: every entry is re-read through the kc-look/1 type on the way in.
import { sanitizeLookLibrary, installLooks, parseLookFile } from '../../data/lookPack.mjs';
import { noteSessionOnly } from '../sessionOnly.mjs';

export const LOOK_LIBRARY_KEY = 'kc:look-library:v1';

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
    const raw = ls.getItem(LOOK_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    const kept = sanitizeLookLibrary(list);
    if (kept.length < list.length) noteSessionOnly(); // entries that no longer read were dropped; say so on the shared flag
    return kept;
  } catch {
    noteSessionOnly();
    return [];
  }
}

function persist(list) {
  const ls = storage();
  if (!ls) {
    noteSessionOnly();
    return;
  }
  try {
    ls.setItem(LOOK_LIBRARY_KEY, JSON.stringify(list));
  } catch {
    noteSessionOnly();
  }
}

export const createLookLibrarySlice = (set, get) => ({
  /** [{ id, name, look }] — Looks installed from packs and files; never the slots. */
  lookLibrary: readStored(),

  /**
   * Read a Look file (one kc-look/1 preset or a kc-pack/1 of Looks) and install what reads into the Library.
   * Returns { read, merged } for the receipt; nothing is applied to the scene.
   */
  installLookFile: (input) => {
    const read = parseLookFile(input);
    if (!read.ok) return { read, merged: { library: get().lookLibrary, added: 0, duplicates: 0, overflow: 0 } };
    const merged = installLooks(get().lookLibrary, read.items);
    if (merged.added > 0) {
      persist(merged.library);
      set({ lookLibrary: merged.library });
    }
    return { read, merged };
  },

  /** Remove one installed Look (a later Library UI calls this). */
  removeLibraryLook: (id) =>
    set((state) => {
      if (!state.lookLibrary.some((e) => e.id === id)) return {};
      const lookLibrary = state.lookLibrary.filter((e) => e.id !== id);
      persist(lookLibrary);
      return { lookLibrary };
    }),
});
