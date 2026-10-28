// projectFile.mjs — #1709: the .kcproject session file and the project manifest. Pure: text in, text out.
//
// Matt's ruling (#1567, 2026-10-20): the format is VERSIONED FROM DAY ONE and MIGRATED FORWARD ON OPEN. Every session
// file carries its format version (`kcproject/1` at first ship); opening an older file migrates it forward; the app
// never writes an older version than current; a file from a newer app is REFUSED PLAINLY rather than mangled.
//
//   session file  { format: 'kcproject/1', savedAt, projectId, session, app, doc }
//                 `doc` is the existing project document (projectDocument.serializeProject), so parseProject and every
//                 sanitizer behind it are reused unchanged — the composition has one parser, not two.
//   manifest      project.kc.json { kind: 'kc-project', v: 1, projectId, name, createdAt }
//                 the project's identity; `name` follows a rename (rename renames the folder — one name, one truth).
//
// Reading never writes. A refused file is reported, never repaired: the caller leaves it byte-identical.
// Version 0 is everything from before folder projects: the browser autosave envelope { version, savedAt, doc } and the
// bare document an older export wrote. It migrates forward to version 1 on open, which is how the first-run wizard
// brings the browser autosave in as session 01 (#1710).
import { parseProject, PROJECT_VERSION } from './projectDocument.js';

export const KCPROJECT_FORMAT = 'kcproject';
/** The version this app writes. Bump it and add a MIGRATIONS step; never write anything else. */
export const KCPROJECT_VERSION = 1;
export const MANIFEST_FILE = 'project.kc.json';
export const MANIFEST_KIND = 'kc-project';
export const MANIFEST_VERSION = 1;

const FORMAT_RE = /^kcproject\/(\d{1,6})$/;
const PROJECT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const formatTag = (v) => `${KCPROJECT_FORMAT}/${v}`;
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** A project id: 8–64 of [A-Za-z0-9_-]. The caller mints it (crypto in the app, a fixed id in tests). */
export function isProjectId(id) {
  return typeof id === 'string' && PROJECT_ID_RE.test(id);
}

/**
 * Forward migrations, one step each: MIGRATIONS[n] turns a version-n envelope into a version-(n+1) envelope. Steps
 * only reshape the envelope; the composition inside is always re-read by parseProject at the end.
 */
export const MIGRATIONS = Object.freeze({
  // 0 → 1: the browser autosave envelope or a bare document becomes a session file with no project yet.
  0: (raw) => ({
    format: formatTag(1),
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : null,
    projectId: null,
    session: null,
    app: null,
    doc: isObj(raw.doc) ? raw.doc : raw,
  }),
});

/** Which version a parsed value claims: { version } , or { version: null } when it is not a project file at all. */
function versionOf(raw) {
  if (!isObj(raw)) return { version: null };
  if (typeof raw.format === 'string') {
    const m = FORMAT_RE.exec(raw.format);
    return m ? { version: Number(m[1]) } : { version: null, badFormat: raw.format };
  }
  if ('format' in raw) return { version: null, badFormat: String(raw.format) };
  // version 0: the pre-folder envelope, or a bare document (parseProject decides whether the inside is real)
  return { version: 0 };
}

/**
 * Read a session file. Never throws, never writes.
 * @returns {{ ok: true, doc, meta: { version, migratedFrom, savedAt, projectId, session, app }, sanitized }
 *          | { ok: false, error: string, newer?: true, found?: number }}
 *   `migratedFrom` is the version on disk when it was older than KCPROJECT_VERSION (else null): the next save writes
 *   the current version. `newer: true` means a newer app wrote it — refuse plainly, leave the file as it is.
 */
export function readSessionFile(text) {
  let raw;
  try {
    raw = typeof text === 'string' ? JSON.parse(text) : text;
  } catch (e) {
    return { ok: false, error: `not readable as a project file (${e.message})` };
  }
  const { version, badFormat } = versionOf(raw);
  if (version === null) {
    return { ok: false, error: badFormat ? `unknown file format "${badFormat}"` : 'not a project file' };
  }
  if (version > KCPROJECT_VERSION) {
    return {
      ok: false,
      newer: true,
      found: version,
      error: `made by a newer version of KC-1 (${formatTag(version)}); this app reads up to ${formatTag(KCPROJECT_VERSION)}`,
    };
  }
  let env = raw;
  for (let v = version; v < KCPROJECT_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) return { ok: false, error: `no migration from ${formatTag(v)}` };
    env = step(env);
  }
  if (!isObj(env.doc)) return { ok: false, error: 'the file holds no composition' };
  // the composition inside carries its own version (projectDocument): a newer one is a newer app too
  const inner = typeof env.doc.version === 'string' ? Number(env.doc.version) : env.doc.version;
  if (Number.isFinite(inner) && inner > PROJECT_VERSION) {
    return {
      ok: false,
      newer: true,
      found: version,
      error: `its composition was made by a newer version of KC-1 (document v${inner}); this app reads up to v${PROJECT_VERSION}`,
    };
  }
  const parsed = parseProject(env.doc);
  if (!parsed.ok) return { ok: false, error: parsed.error || 'the composition does not parse' };
  return {
    ok: true,
    doc: parsed.doc,
    sanitized: parsed.sanitized,
    meta: {
      version,
      migratedFrom: version < KCPROJECT_VERSION ? version : null,
      savedAt: typeof env.savedAt === 'string' ? env.savedAt : null,
      projectId: isProjectId(env.projectId) ? env.projectId : null,
      session: Number.isInteger(env.session) && env.session >= 1 ? env.session : null,
      app: isObj(env.app) && typeof env.app.version === 'string' ? { version: env.app.version.slice(0, 32) } : null,
    },
  };
}

/**
 * Write a session file: always the CURRENT version. `doc` is a serialized project document.
 * @returns {string} JSON text, ending in a newline
 */
export function writeSessionFile({ doc, projectId, session, savedAt, appVersion = null }) {
  if (!isObj(doc)) throw new Error('writeSessionFile: doc must be a project document');
  if (!isProjectId(projectId)) throw new Error('writeSessionFile: invalid projectId');
  if (!Number.isInteger(session) || session < 1) throw new Error('writeSessionFile: session must be an integer >= 1');
  if (typeof savedAt !== 'string')
    throw new Error('writeSessionFile: savedAt must be an ISO string (the caller owns the clock)');
  const env = {
    format: formatTag(KCPROJECT_VERSION),
    savedAt,
    projectId,
    session,
    app: typeof appVersion === 'string' ? { version: appVersion.slice(0, 32) } : null,
    doc,
  };
  return `${JSON.stringify(env)}\n`;
}

/** A new manifest (the caller mints projectId and owns the clock). Returns JSON text. */
export function writeManifest({ projectId, name, createdAt }) {
  if (!isProjectId(projectId)) throw new Error('writeManifest: invalid projectId');
  if (typeof name !== 'string' || !name) throw new Error('writeManifest: name required');
  if (typeof createdAt !== 'string') throw new Error('writeManifest: createdAt must be an ISO string');
  return `${JSON.stringify({ kind: MANIFEST_KIND, v: MANIFEST_VERSION, projectId, name, createdAt }, null, 2)}\n`;
}

/**
 * Read a manifest. Never throws.
 * @returns {{ ok: true, manifest: { projectId, name, createdAt } } | { ok: false, error, newer?: true }}
 */
export function readManifest(text) {
  let raw;
  try {
    raw = typeof text === 'string' ? JSON.parse(text) : text;
  } catch (e) {
    return { ok: false, error: `manifest not readable (${e.message})` };
  }
  if (!isObj(raw) || raw.kind !== MANIFEST_KIND) return { ok: false, error: 'not a KC-1 project manifest' };
  if (!Number.isInteger(raw.v) || raw.v < 1) return { ok: false, error: 'manifest has no version' };
  if (raw.v > MANIFEST_VERSION) {
    return { ok: false, newer: true, error: `project made by a newer version of KC-1 (manifest v${raw.v})` };
  }
  if (!isProjectId(raw.projectId)) return { ok: false, error: 'manifest has no valid projectId' };
  if (typeof raw.name !== 'string' || !raw.name) return { ok: false, error: 'manifest has no name' };
  return {
    ok: true,
    manifest: {
      projectId: raw.projectId,
      name: raw.name,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    },
  };
}
