// data/recipeDefaults — frozen layout-default epochs for recipe links (#2323, recipes-v3-spec §3.3, audit F4).
//
// Today a link encodes layout as a delta against the LIVE DEFAULT_LAYOUT_PARAMS, so every default change silently
// changes every old link. An epoch is a frozen copy of the defaults as they stood when it was cut; a v3 link (R4)
// names its epoch and is decoded against THAT copy. The v1/v2 decode is unchanged (live defaults + the 4 legacy zeros).
//
// Never edit an epoch file. To change a default: cut epoch-N+1 (copy the new defaults to epoch-N+1.json, add it
// below, bump LAYOUT_DEFAULTS_EPOCH and EPOCH_HASHES). recipeDefaults.selfcheck.mjs fails until you do.
import epoch1 from './epoch-1.json' with { type: 'json' };

/** The epoch new links are written against. Equal to the newest entry in EPOCHS. */
export const LAYOUT_DEFAULTS_EPOCH = 1;

const EPOCHS = Object.freeze({ 1: epoch1 });

/** Hash of each frozen epoch as cut — pinned here so an edit to an old epoch file cannot pass quietly. */
export const EPOCH_HASHES = Object.freeze({ 1: '7f11177ea003a3f0' });

const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
};

/** A stable 64-bit hex hash of a plain JSON value: key order never matters (two FNV-1a passes over the canonical form). */
export function stableHash(value) {
  const s = canonical(value);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

const deepCopy = (v) => JSON.parse(JSON.stringify(v));

/** A private, mutable copy of the layout defaults as they stood at epoch n; null for an epoch this build does not know. */
export function defaultsForEpoch(n) {
  return Object.prototype.hasOwnProperty.call(EPOCHS, n) ? deepCopy(EPOCHS[n]) : null;
}

/**
 * Compare the live defaults with an epoch. `changed` lists every top-level key that differs (edited, added or
 * removed); `hint` is the fix to print when the compare fails.
 */
export function compareToEpoch(live, epoch, n = LAYOUT_DEFAULTS_EPOCH) {
  const keys = [...new Set([...Object.keys(live), ...Object.keys(epoch)])].sort();
  const changed = keys.filter((k) => canonical(live[k]) !== canonical(epoch[k]));
  const ok = changed.length === 0 && stableHash(live) === stableHash(epoch);
  return {
    ok,
    changed,
    hint: ok
      ? ''
      : `DEFAULT_LAYOUT_PARAMS no longer matches layout-defaults epoch ${n} (changed: ${changed.join(', ') || 'hash only'}). ` +
        `Old links are decoded against the epoch they were cut at, so do not edit epoch-${n}.json: cut epoch-${n + 1} ` +
        `(copy the new defaults to data/recipeDefaults/epoch-${n + 1}.json, add it to EPOCHS and EPOCH_HASHES, bump LAYOUT_DEFAULTS_EPOCH).`,
  };
}
