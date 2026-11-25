// nativeLab.mjs — the DEV · NATIVE block's native calls, behind the app's one desktop gate.
//
// NativeLabBlock used to import Tauri's invoke statically and call it unguarded from every
// button. In a browser the invoke rejects with the raw IPC string ("window.__TAURI_IPC__ is
// not a function") and the block printed that string into the panel status line; two of the
// buttons appeared to do nothing because the line renders at the top of the panel, far from
// the DEV section at the bottom (issue 2490 in the session report's numbering).
//
// The law now (Matt's ruling on that issue, 2026-11-24):
// - In the browser the controls stay visible but disabled, labelled "Native app only", and
//   no click ever reaches the IPC bridge. This module is the second lock: with no desktop
//   runtime its methods return `unavailable` WITHOUT calling invoke.
// - In the desktop app a genuine native failure shows plain words in the panel
//   ("ANE evaluation failed"); the raw error string goes to the diagnostic log below for
//   diagnosis — never to the panel. (The governor event log cannot take these records: it
//   is contract-locked to governor shed/restore entries, so the raw strings live here, in a
//   sibling log of the same bounded ring-buffer shape.)
//
// The gate is the shared one: platform/desktop.mjs isTauriRuntime, the same check the loot
// folder and the curator modules use. Deps are injected (lootNative's shape) so the
// selfcheck can drive every path with no Tauri present. Nothing here throws.
import { isTauriRuntime } from '../../platform/desktop.mjs';

/** The label the ruling fixes for browser-disabled native controls. */
export const NATIVE_APP_ONLY_LABEL = 'Native app only';

/** Plain panel words per operation — what the performer reads when a native call fails. */
export const NATIVE_PLAIN_FAILURES = Object.freeze({
  test_disk_io: 'Native disk write failed',
  metal_init: 'Metal init failed',
  metal_step: 'Metal pass failed',
  curator_eval: 'ANE evaluation failed',
  media_export: 'Media export failed',
  ecore_dump: 'E-core dump failed',
});

// ── the raw-error diagnostic log ────────────────────────────────────────────

/** Schema id for the exported JSON, so dumps stay machine-readable. */
export const NATIVE_ERROR_LOG_SCHEMA = 'kc-native-error-log/1';

/** Ring buffer capacity — the governor log's bound, for the same reason. */
export const MAX_NATIVE_ERRORS = 128;

const rawErrors = [];

/** An error of any shape as one bounded line of text. */
export function rawErrorText(e) {
  return String((e && e.message) || e || 'failed')
    .replace(/\s+/g, ' ')
    .slice(0, 512);
}

/**
 * Record one raw native error for diagnosis. Returns the recorded entry:
 * { t, command, raw } — timestamp, the Tauri command that failed, the raw string.
 */
export function recordNativeError({ command, raw } = {}) {
  const entry = {
    t: new Date().toISOString(),
    command: String(command || 'unknown'),
    raw: rawErrorText(raw),
  };
  rawErrors.push(entry);
  if (rawErrors.length > MAX_NATIVE_ERRORS) rawErrors.splice(0, rawErrors.length - MAX_NATIVE_ERRORS);
  return entry;
}

/** Snapshot of the recorded raw errors, oldest → newest. A copy: safe to hold. */
export function getNativeErrors() {
  return [...rawErrors];
}

/** Empty the buffer (used by selfchecks and dev tooling). */
export function clearNativeErrors() {
  rawErrors.length = 0;
}

/** Current buffer occupancy, for health reads. */
export function nativeErrorLogSize() {
  return rawErrors.length;
}

/** Dump the whole log as JSON — the diagnosis artifact. */
export function exportNativeErrorLogJSON() {
  return JSON.stringify(
    {
      schema: NATIVE_ERROR_LOG_SCHEMA,
      exportedAt: new Date().toISOString(),
      count: rawErrors.length,
      capacity: MAX_NATIVE_ERRORS,
      errors: [...rawErrors],
    },
    null,
    2,
  );
}

// ── the gated calls ─────────────────────────────────────────────────────────

/**
 * @param invoke    (cmd, args) => Promise: Tauri's invoke, injected so a selfcheck can
 *                  drive it. Absent: loaded lazily, inside the call, loot-style.
 * @param isDesktop () => boolean — defaults to the shared gate.
 * @param record    (entry) => void — where raw errors go; defaults to the log above.
 */
export function createNativeLab({ invoke = null, isDesktop = isTauriRuntime, record = recordNativeError } = {}) {
  const call = async (op, cmd, args) => {
    if (!isDesktop()) return { ok: false, unavailable: true, plain: NATIVE_APP_ONLY_LABEL };
    try {
      const inv = invoke || (await import('@tauri-apps/api/tauri')).invoke;
      return { ok: true, value: await inv(cmd, args) };
    } catch (e) {
      record({ command: cmd, raw: e });
      return { ok: false, plain: NATIVE_PLAIN_FAILURES[op] };
    }
  };
  return {
    /** True only in the desktop shell — the block disables its controls on false. */
    available: () => !!isDesktop(),
    /** ⚡ TEST NATIVE DISK I/O — write_batch_frame. Resolves { ok, value: bytesWritten }. */
    testDiskIO: (data, path) => call('test_disk_io', 'write_batch_frame', { data, path }),
    /** ⚡ INIT METAL UMA — metal_init. Resolves { ok, value: stats }. */
    metalInit: (args) => call('metal_init', 'metal_init', args),
    /**
     * ⚡ DISPATCH METAL PASS — metal_step_boids then metal_step_accum, as one operation:
     * either failure is the one plain message. Resolves { ok, value: accumStats }.
     */
    async metalStep(boidsArgs, accumArgs) {
      const step = await call('metal_step', 'metal_step_boids', boidsArgs);
      if (!step.ok) return step;
      return call('metal_step', 'metal_step_accum', accumArgs);
    },
    /** ⚡ EVALUATE FRAME ON ANE — curator_evaluate_frame. Resolves { ok, value: res }. */
    curatorEval: () => call('curator_eval', 'curator_evaluate_frame'),
    /** ⚡ RECORD HEVC VIDEO — start_media_engine_export. Resolves { ok, value: res }. */
    mediaExport: (args) => call('media_export', 'start_media_engine_export', args),
    /** ⚡ DUMP BATCH (E-CORES) — dump_image_batch. Resolves { ok, value: res }. */
    ecoreDump: (args) => call('ecore_dump', 'dump_image_batch', args),
  };
}
