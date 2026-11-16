// deal/dealKey.mjs — #2232: the string-keyed draw every deal adapter uses. Pure: no clock, no Math.random.
//
// The same FNV-1a the creature family hashes with (engine/creatureBreed.js, engine/kineticBirths.mjs), plus the
// splitmix finalizer kineticBirths measured it needs: keys that differ only in a trailing counter ("…|0" … "…|15")
// cluster under raw FNV-1a, and a draw keyed on a press or attempt number would repeat one pick forever.
// A draw is a pure function of its key, so a hand is a pure function of (seed, press, scope, attempt).

/** FNV-1a over UTF-16 code units. */
export function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A float in [0, 1) that is a pure function of `key`. */
export function u01(key) {
  let h = hash32(key);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** An index in [0, n) that is a pure function of `key`. n < 1 → 0. */
export function pickIndex(key, n) {
  const len = Math.floor(n);
  return len >= 1 ? Math.min(len - 1, Math.floor(u01(key) * len)) : 0;
}
