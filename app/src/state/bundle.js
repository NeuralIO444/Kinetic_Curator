// bundle.js — the export-everything bundle (#1051). Pure: no DOM, no store, no
// localStorage, so the round trip and the failure modes are selfcheckable.
//
// One file holds everything a performer would be sorry to lose: the project,
// user palettes, favorites, keeps, the loaded taste, the biology policy and
// the canvas presets. Each part keeps its OWN existing format and is
// re-validated on the way back in by its OWN existing sanitizer (passed in),
// because a file is a trust boundary. One bad part never blocks the others.

export const BUNDLE_KIND = 'kc-bundle';
export const BUNDLE_VERSION = 1;

/** Every part a bundle can carry, in apply order. */
export const BUNDLE_PARTS = Object.freeze([
  'project', 'userPalettes', 'userVoices', 'favorites', 'keeps', 'taste', 'biology', 'canvasPresets',
]);

/** Plain names for messages. */
export const BUNDLE_PART_LABELS = Object.freeze({
  project: 'project', userPalettes: 'palettes', userVoices: 'voices', favorites: 'favorites', keeps: 'keeps',
  taste: 'taste', biology: 'biology policy', canvasPresets: 'canvas presets',
});

/**
 * How a part lands when a bundle is restored (#1064). The confirm line is built
 * from this, so it can never promise a replace for something that merges.
 *   replace: what is here is swapped for what the bundle holds
 *   merge:   the bundle's entries are ADDED; ones you have stay, ones you deleted
 *            since the export come back (palettes use the existing palette importer)
 */
export const BUNDLE_APPLY_MODE = Object.freeze({
  project: 'replace', userPalettes: 'merge', userVoices: 'replace', favorites: 'replace',
  keeps: 'replace', taste: 'replace', biology: 'replace', canvasPresets: 'replace',
});

/** Names inside a sentence ("replace the project, voices and keeps"). */
const SENTENCE_NAMES = Object.freeze({
  project: 'the project', userPalettes: 'palettes', userVoices: 'voices', favorites: 'favorites',
  keeps: 'keeps', taste: 'taste', biology: 'the biology policy', canvasPresets: 'canvas presets',
});

const joinList = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * The confirm line shown before ↑ BUNDLE applies anything: replaces are named as
 * replaces, merges as merges, and unreadable parts are listed as skipped.
 */
export function bundleConfirmLine(fileName, summary) {
  const nm = (n) => SENTENCE_NAMES[n] || n;
  const replaces = summary.good.filter((g) => BUNDLE_APPLY_MODE[g] !== 'merge').map(nm);
  const merges = summary.good.filter((g) => BUNDLE_APPLY_MODE[g] === 'merge').map(nm);
  const bits = [];
  if (replaces.length) bits.push(`replace ${joinList(replaces)}`);
  if (merges.length) bits.push(`add ${joinList(merges)} (ones you deleted since the export come back; the ones you have stay)`);
  let line = bits.length ? `${fileName} will ${bits.join(', and ')}.` : `${fileName} holds nothing readable.`;
  if (summary.bad.length) line += ` Skipped, unreadable: ${summary.bad.map((b) => `${nm(b.name)} (${b.error})`).join('; ')}.`;
  return line;
}

/**
 * Which localStorage key each part is the carrier of. Together with
 * BUNDLE_LEFT_OUT this must account for EVERY `kc:` key the app writes: the
 * bundle's promise is "everything a performer would be sorry to lose" (#1051),
 * and bundleKeys.selfcheck scans the source so a new key cannot slip past.
 */
export const BUNDLE_STORAGE_KEYS = Object.freeze({
  project: ['kc:project:v1', 'kc:pipeline:v1'], // the autosave and the rolling pipeline record are the project document
  userPalettes: ['kc:user-palettes:v1'],
  userVoices: ['kc:user-voices:v1'],
  favorites: ['kc:favorites:v1'],
  keeps: ['kc:keeps:v1'],
  taste: ['kc:taste:v1'],
  biology: ['kc:biology:v1'],
  canvasPresets: ['kc:canvas-presets'],
});

/** Keys deliberately NOT in the bundle, each with the reason. */
export const BUNDLE_LEFT_OUT = Object.freeze({
  'kc:weave:v1': 'per-machine display preference, not project content',
  'kc:fxaa:v1': 'per-machine display preference, not project content',
  'kc:pool-view:v1': 'per-machine display preference (asset pool layout)',
  'kc:startup-mode:v1': 'per-machine startup preference',
  'kc:active-panel-tab': 'a remembered tab, a convenience',
  'kc:first-run-seen': 'first-run flag',
  'kc:tour-seen': 'first-run flag',
  'kc:patch-oneliner-seen': 'first-run flag',
  'kc:retrain-nudge:v1': 'a derived counter, rebuilt from keeps',
  'kc:dice-crowns:v1': 'dice affinity index; the crowns themselves persist in the keeps ledger',
  'kc:worker': 'developer flag for the render worker',
  'kc:pipeline:backup': 'autosave plumbing: the previous copy of the project the bundle already carries',
  'kc:project:quarantine': 'autosave plumbing: a refused project kept for inspection',
  'kc:project:restored-session': 'autosave plumbing: a boot notice',
  'kc:queen:trace': '#1139: developer trace flag for the sway module (off by default), never project content',
  'kc:director:trace': '#1145: developer trace flag for the Director scheduler (off by default), never project content',
});

/**
 * @param {object} p  { project, userPalettes, favorites, keeps, taste, biology,
 *   canvasPresets, appVersion, now }. A part that is null/undefined is left
 *   out (taste is null until one is loaded).
 */
export function buildBundle(p = {}) {
  const parts = {};
  for (const name of BUNDLE_PARTS) {
    if (p[name] !== null && p[name] !== undefined) parts[name] = p[name];
  }
  return {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    exportedAt: new Date(p.now ?? Date.now()).toISOString(),
    appVersion: typeof p.appVersion === 'string' ? p.appVersion : '',
    parts,
  };
}

/** Is this a bundle at all? (cheap, for choosing an error message) */
export function isBundle(raw) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw) && raw.kind === BUNDLE_KIND;
}

/**
 * @param {*} raw  parsed JSON
 * @param {Record<string,(value:any)=>({ok:true,value:any}|{ok:false,error:string})>} sanitizers
 *   one per part; a part with no sanitizer is refused, never trusted.
 * @returns {{ok:false,error:string} | {ok:true, parts:Record<string,{ok:true,value:any}|{ok:false,error:string}>, exportedAt:string, appVersion:string}}
 */
export function parseBundle(raw, sanitizers = {}) {
  if (!isBundle(raw)) return { ok: false, error: 'not a KC-1 bundle' };
  if (raw.version !== BUNDLE_VERSION) {
    return { ok: false, error: `bundle version ${String(raw.version)} is not supported (this app reads version ${BUNDLE_VERSION})` };
  }
  const src = raw.parts && typeof raw.parts === 'object' && !Array.isArray(raw.parts) ? raw.parts : {};
  const parts = {};
  for (const name of BUNDLE_PARTS) {
    if (!(name in src)) continue;
    const san = sanitizers[name];
    if (typeof san !== 'function') { parts[name] = { ok: false, error: 'no reader for this part' }; continue; }
    try {
      const r = san(src[name]);
      // `given` (how many entries the file held) lets the result line say how many were dropped.
      parts[name] = r && r.ok
        ? { ok: true, value: r.value, ...(Number.isFinite(r.given) ? { given: r.given } : {}) }
        : { ok: false, error: (r && r.error) || 'invalid' };
    } catch (e) {
      parts[name] = { ok: false, error: String((e && e.message) || e).slice(0, 120) };
    }
  }
  if (Object.keys(parts).length === 0) return { ok: false, error: 'the bundle holds nothing' };
  return {
    ok: true,
    parts,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
  };
}

/** Names of the parts that will be applied / refused, for the confirm and result lines. */
export function bundleSummary(parsed) {
  if (!parsed || !parsed.ok) return { good: [], bad: [] };
  const good = []; const bad = [];
  for (const name of BUNDLE_PARTS) {
    const p = parsed.parts[name];
    if (!p) continue;
    (p.ok ? good : bad).push(p.ok ? name : { name, error: p.error });
  }
  return { good, bad };
}

/**
 * What actually landed, for one part: `voices (5)`, `palettes (+3)` for a merge,
 * `voices (5 of 6; 1 dropped)` when entries were refused or capped. Without a
 * count it is just the name.
 * @param {{kept:number, given?:number}} [c]
 */
export function bundlePartPhrase(name, c) {
  const label = BUNDLE_PART_LABELS[name] || name;
  if (!c || !Number.isFinite(c.kept)) return label;
  const lead = BUNDLE_APPLY_MODE[name] === 'merge' ? '+' : '';
  const given = Number.isFinite(c.given) ? c.given : c.kept;
  return given > c.kept
    ? `${label} (${lead}${c.kept} of ${given}; ${given - c.kept} dropped)`
    : `${label} (${lead}${c.kept})`;
}

/**
 * One honest sentence for the pipeline message slot. `counts` is what each apply
 * path reported: { part: { kept, given } }. A part with entries in the file of
 * which NONE were usable is reported as skipped, not as imported.
 */
export function bundleMessage(summary, verb, counts = {}) {
  const lab = (n) => BUNDLE_PART_LABELS[n] || n;
  const bad = summary.bad.map((b) => `${lab(b.name)} (${b.error})`);
  const good = [];
  for (const name of summary.good) {
    const c = counts[name];
    if (c && Number.isFinite(c.kept) && c.kept === 0 && c.given > 0) bad.push(`${lab(name)} (none of ${c.given} were usable)`);
    else good.push(bundlePartPhrase(name, c));
  }
  const head = good.length ? `${verb}: ${good.join(', ')}` : `${verb}: nothing`;
  return bad.length ? `${head}. Skipped: ${bad.join('; ')}` : head;
}

/** mm-dd filename for a bundle. */
export function bundleFilename(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `kinetic-curator-bundle-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
