// Taxonomy contract (#735). Face nouns live in docs/TAXONOMY.md.
// This module is the *runtime* half: semver + Look-id aliases.
//
// Versioning (do not mix with project.format):
//   MAJOR — Look/Voice click semantics change (e.g. Look starts writing paint)
//   MINOR — new noun, new home, or new alias capability
//   PATCH — face string / comment / extra example
//
// resolveLookId is ONLY for layoutParams.composition / getPreset.
// Never run it on a voice id. Frozen voice ids do not rename.

export const TAXONOMY_VERSION = '1.4.0';
export const TAXONOMY_COMPAT = 'look-apply=layout-only';

/** Voice ids. Face titles may change; these strings do not. */
export const FROZEN_VOICE_IDS = Object.freeze(['swarm', 'hype', 'murmuration', 'dark-glass']);

/**
 * Old Look id → canonical COMPOSITION_PRESETS id.
 * Keys may collide with a voice id (that is why the Look moved).
 * Values must exist as a current Look id and must not be a frozen voice id.
 */
export const LOOK_ALIASES = Object.freeze({
  murmuration: 'dusk-flock',
});

export function parseSemver(s) {
  const m = String(s ?? '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

export function compareSemver(a, b) {
  const A = typeof a === 'string' ? parseSemver(a) : a;
  const B = typeof b === 'string' ? parseSemver(b) : b;
  if (!A || !B) throw new Error(`[taxonomy] bad semver: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
  return A.major - B.major || A.minor - B.minor || A.patch - B.patch;
}

/** What kind of bump `to` is relative to `from`. */
export function classifyBump(from, to) {
  const c = compareSemver(from, to);
  if (c === 0) return 'none';
  const A = parseSemver(from);
  const B = parseSemver(to);
  if (B.major !== A.major) return 'major';
  if (B.minor !== A.minor) return 'minor';
  return 'patch';
}

export function bumpSemver(version, kind) {
  const v = parseSemver(version);
  if (!v) throw new Error(`[taxonomy] bad semver: ${version}`);
  if (kind === 'major') return formatSemver({ major: v.major + 1, minor: 0, patch: 0 });
  if (kind === 'minor') return formatSemver({ major: v.major, minor: v.minor + 1, patch: 0 });
  if (kind === 'patch') return formatSemver({ major: v.major, minor: v.minor, patch: v.patch + 1 });
  throw new Error(`[taxonomy] bump kind must be major|minor|patch, got ${kind}`);
}

/** Canonical Look id. Unknown strings pass through (normalizeLayoutParams still enums them). */
export function resolveLookId(id) {
  if (typeof id !== 'string' || !id) return id;
  return LOOK_ALIASES[id] || id;
}

export function isFrozenVoiceId(id) {
  return FROZEN_VOICE_IDS.includes(id);
}
