// lookLibraryRows.mjs — #2148 step 2: the Look Library browser's view model. Pure: the store's `lookLibrary` in, rows out.
// The browser only LISTS, selects, removes and exports; it never applies a Look to the scene (loading into the 16 slots is the
// next step) and never touches the slots, the palette library or the project.
import { buildLookPack } from '../../data/lookPack.mjs';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** How many layout parameters a Look names, in plain words ("5 params"). */
const paramSummary = (look) => plural(Object.keys(look.layoutParams || {}).length, 'param', 'params');

/**
 * One row per installed Look, in install order (the order the Library holds them; new Looks arrive last).
 * @returns {{ id, name, mode, paletteId, seeded: boolean, detail: string }[]}
 */
export function lookLibraryRows(library) {
  if (!Array.isArray(library)) return [];
  return library.map((e) => ({
    id: e.id,
    name: e.name,
    mode: e.look.mode,
    paletteId: e.look.paletteId,
    seeded: e.look.seed !== undefined,
    detail: `${e.look.mode} · ${e.look.paletteId} · ${paramSummary(e.look)}${e.look.seed !== undefined ? ' · seeded' : ''}`,
  }));
}

/** Toggle one id in a selection (a plain array, no duplicates, insertion order kept). Never mutates. */
export const toggleSelected = (selected, id) =>
  selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];

/** Drop ids that are no longer in the Library (a removal, a reload): a stale selection must not export a ghost. */
export const pruneSelection = (selected, library) => {
  const have = new Set((library || []).map((e) => e.id));
  const kept = selected.filter((id) => have.has(id));
  return kept.length === selected.length ? selected : kept;
};

/** The Library entries a selection names, in Library order. */
export const selectedEntries = (library, selected) => {
  const want = new Set(selected);
  return (library || []).filter((e) => want.has(e.id));
};

/** The pack that "Export selected" writes (empty selection → null: nothing to export). */
export function exportSelectionPack(library, selected) {
  const entries = selectedEntries(library, selected);
  if (!entries.length) return null;
  return buildLookPack(entries, { name: entries.length === 1 ? entries[0].name : 'Looks' });
}

/** The line under the list: how many are installed and how many are picked. */
export function libraryCountLine(library, selected) {
  const total = Array.isArray(library) ? library.length : 0;
  if (total === 0) return 'No Looks installed yet';
  const picked = selectedEntries(library, selected).length;
  return picked > 0 ? `${plural(total, 'Look', 'Looks')} · ${picked} selected` : plural(total, 'Look', 'Looks');
}

/** The empty state, in words: where Looks come from. */
export const LIBRARY_EMPTY_LINE =
  'Looks you install land here. Pipeline → ↑ IMPORT takes .kclook and .kcpack files, or ⎘ PASTE LOOK.';
