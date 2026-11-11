// megamindVisionLive.js — #1527 MegaMind S3: the vision surfaces, wired live.
//
// The driver in the megamindSurfacesLive idiom: it owns what the pure core (megamindVision.mjs) may
// not touch — image bytes, hashing, canvas copies, storage, the wall clock — asks the linked model
// through megamindVoice's surface chat (the S2 path, extended to carry one base64 image on the user
// message), validates every reply before it exists anywhere, and publishes a view the surfaces render
// (the DIRECTORS candidate tray for judging, the MEGAMIND tab for stage description).
//
// Every action is a deliberate press. Nothing here runs on page load, panel open, tray load, a bar,
// or a timer; the driver subscribes to no bus event and fires nothing by itself. Gates are the
// capability registry's, read through the surfaces' localRecord law (surfaceRecord): `lois.vision`
// (vision badge + tier B or better) for judging, `stage.describe` (vision badge) for description —
// a cloud-badged record enables neither.
//
// Apple vision joins behind this same ask shape only after the on-device probe in
// STAGING-REPORT-1527.md measures it: there is deliberately no Apple transport here, and no code
// path in this file can construct an unmeasured record.
import { getCapabilities } from '../composition/capabilityRegistry.mjs';
import { SURFACE_TIMEOUT_MS, askSurfaceText, surfaceRecord } from './megamindVoice.mjs';
import {
  JUDGE_LEDGER_FILE,
  JUDGE_LEDGER_KEY,
  VISION_IMAGE_MAX_SIDE,
  buildRenderJudgeRequest,
  buildStageDescribeRequest,
  parseJudgeLedger,
  parseVisionReply,
  serializeJudgeRow,
  validateStageDescription,
  validateVisionVerdict,
  visionLedgerRow,
} from './megamindVision.mjs';
import { getTaste } from './tasteStore.js';
import { isTauriRuntime } from '../platform/desktop.mjs';

// ── the stage-frame seam ─────────────────────────────────────────────────────────────────────────────
// Stage description needs the current frame without reaching into the store or the GL loop: the App
// registers a provider (wrapping captureStill with downloadFile:false — the existing capture path,
// so the described frame is the exact frame the instrument shows). No provider, or a provider that
// returns nothing, is the honest "no frame" state — never a fabricated description.
let stageFrameProvider = null;

/** Register (or clear, with null) the stage-frame provider: () => Promise<{ bytes, mime } | null>. */
export function setStageFrameProvider(fn) {
  stageFrameProvider = typeof fn === 'function' ? fn : null;
}

export function getStageFrameProvider() {
  return stageFrameProvider;
}

// ── byte plumbing (defaults; injected fakes drive the selfcheck) ─────────────────────────────────────

/** SHA-256 of the exact bytes, hex — the binding every verdict carries. */
export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

const loadImage = (url) =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('the still could not be decoded as an image'));
    img.src = url;
  });

/**
 * The model's copy of a still: the EXACT bytes when they are already a PNG inside the size cap
 * (nothing re-encoded — the bytes judged are the file's bytes), else a canvas copy with the longest
 * side capped at VISION_IMAGE_MAX_SIDE; an SVG is rasterized (a vision model cannot read vector
 * text). The returned `sent` block is what the ledger records — the hash always names the source.
 */
export async function prepareImageCopy(bytes, mime) {
  const isSvg = mime === 'image/svg+xml';
  const blob = new Blob([bytes], { type: mime || 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth || (isSvg ? 1000 : 0);
    const h = img.naturalHeight || (isSvg ? 700 : 0);
    if (!w || !h) throw new Error('the still could not be decoded as an image');
    const longest = Math.max(w, h);
    if (!isSvg && longest <= VISION_IMAGE_MAX_SIDE) {
      return {
        base64: bytesToBase64(bytes),
        width: w,
        height: h,
        format: (mime || 'image/png').replace(/^image\//, ''),
        downscaled: false,
        rasterized: false,
      };
    }
    const scale = Math.min(1, VISION_IMAGE_MAX_SIDE / longest);
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
    const out = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('the model copy could not be encoded'))), 'image/png'),
    );
    const outBytes = new Uint8Array(await out.arrayBuffer());
    return {
      base64: bytesToBase64(outBytes),
      width: cw,
      height: ch,
      format: 'png',
      downscaled: scale < 1,
      rasterized: isSvg,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── the judge ledger's storage (tasteLedger's pattern, a separate ledger) ────────────────────────────

export function readJudgeLedgerText(storage) {
  if (!storage) return '';
  try {
    return storage.getItem(JUDGE_LEDGER_KEY) || '';
  } catch {
    return '';
  }
}

export function judgeLedgerCount(storage) {
  return parseJudgeLedger(readJudgeLedgerText(storage), () => {}).rows.length;
}

/** Desktop mirror: append the same line to $APPDATA/ledgers/judge.jsonl (best-effort, like taste's). */
async function mirrorJudgeRow(line) {
  const { BaseDirectory, createDir, writeTextFile } = await import('@tauri-apps/api/fs');
  await createDir('ledgers', { dir: BaseDirectory.AppData, recursive: true });
  await writeTextFile(`ledgers/${JUDGE_LEDGER_FILE}`, line, { dir: BaseDirectory.AppData, append: true });
}

/** Append one row to the judge ledger. Returns false when the local save failed (reported, not hidden). */
export function appendJudgeRow(row, storage) {
  if (!row || !storage) return false;
  const line = serializeJudgeRow(row);
  try {
    storage.setItem(JUDGE_LEDGER_KEY, (storage.getItem(JUDGE_LEDGER_KEY) || '') + line);
  } catch {
    return false;
  }
  if (isTauriRuntime()) mirrorJudgeRow(line).catch(() => {});
  return true;
}

/** Download the judge ledger as judge.jsonl (the tray's export — the PIPELINE ↓ LEDGERS pattern). */
export function downloadJudgeLedger(storage) {
  const blob = new Blob([readJudgeLedgerText(storage)], { type: 'application/x-ndjson' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = JUDGE_LEDGER_FILE;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ── the driver ───────────────────────────────────────────────────────────────────────────────────────

export function createVisionDriver({
  fetchImpl = (...a) => globalThis.fetch(...a),
  storage = typeof globalThis !== 'undefined' ? globalThis.localStorage : null,
  prepareImage = prepareImageCopy,
  hashBytes = sha256Hex,
  stamp = () => Date.now(),
} = {}) {
  let view = {
    verdicts: {}, // card key -> { judge, verdict, readings, line, kind, at, sha256 }
    cardErrors: {}, // card key -> why this card has no vision verdict
    judging: null, // { done, total } while a press is working through the tray
    description: null, // { text, at, frameSha256, model }
    describeError: null,
    describing: false,
    ledgerCount: judgeLedgerCount(storage),
    error: null,
  };
  const listeners = new Set();
  const publish = () => {
    for (const fn of listeners) {
      try {
        fn(view);
      } catch {
        /* a listener must not break the vision driver */
      }
    }
  };
  const set = (patch) => {
    view = { ...view, ...patch };
    publish();
  };

  /** Ask the model for one vision reply and validate it; one re-ask on a discarded reply. */
  async function ask(consumerId, buildMessages, validate, { numPredict } = {}) {
    const rec = surfaceRecord(consumerId);
    if (!rec) throw new Error('that surface is not enabled by the linked model');
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await askSurfaceText({
        fetchImpl,
        record: rec,
        messages: buildMessages(),
        timeoutMs: SURFACE_TIMEOUT_MS,
        numPredict,
      });
      const out = validate(parseVisionReply(text));
      if (out) return { out, rec };
    }
    throw new Error('the reply was discarded — shape or language failed twice');
  }

  /** Judge one still. item: { key, kind, bytes, mime, facts, seed, runId, record, fingerprint, expectedSha256 } */
  async function judgeOne(item) {
    if (!surfaceRecord('lois.vision')) throw new Error('render judging needs a local vision model at tier B or better');
    const bytes = item.bytes instanceof Uint8Array ? item.bytes : new Uint8Array(item.bytes || []);
    if (!bytes.length) throw new Error('no still bytes to judge');
    const sha256 = await hashBytes(bytes);
    if (item.expectedSha256 && sha256 !== item.expectedSha256)
      throw new Error('the still on disk does not match the hash the run recorded for it — refused');
    const sent = await prepareImage(bytes, item.mime);
    const { out, rec } = await ask(
      'lois.vision',
      () => buildRenderJudgeRequest({ facts: item.facts || {}, imageBase64: sent.base64 }),
      validateVisionVerdict,
      { numPredict: 300 },
    );
    const row = visionLedgerRow({
      verdict: out,
      kind: item.kind,
      seed: item.seed,
      run: item.runId,
      record: item.record,
      still: { sha256, fingerprint: item.fingerprint ?? null, sent },
      taste: getTaste(),
      model: rec.model,
      at: stamp(),
    });
    let ledgerFailed = false;
    if (row) ledgerFailed = !appendJudgeRow(row, storage);
    set({
      verdicts: { ...view.verdicts, [item.key]: { ...out, kind: item.kind, at: row ? row.at : null, sha256 } },
      cardErrors: { ...view.cardErrors, [item.key]: undefined },
      ledgerCount: judgeLedgerCount(storage),
      error: ledgerFailed
        ? 'a verdict landed but the judge-ledger write failed — it is shown, not accrued'
        : view.error,
    });
    return out;
  }

  const driver = {
    view: () => view,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** The tray's one deliberate press: judge every loaded finalist's still, in order, card by card. */
    async judgeStills(items) {
      const list = Array.isArray(items) ? items : [];
      set({ judging: { done: 0, total: list.length }, error: null });
      let done = 0;
      for (const item of list) {
        try {
          await judgeOne(item);
        } catch (e) {
          set({ cardErrors: { ...view.cardErrors, [item.key]: String(e && e.message ? e.message : e).slice(0, 160) } });
        }
        done += 1;
        set({ judging: { done, total: list.length } });
      }
      set({ judging: null, ledgerCount: judgeLedgerCount(storage) });
    },
    /** Stage description, on demand: the registered frame provider's exact current frame, described. */
    async describeStage() {
      set({ describing: true, describeError: null });
      try {
        if (!surfaceRecord('stage.describe')) throw new Error('stage description needs a local vision model linked');
        const provider = getStageFrameProvider();
        if (!provider) throw new Error('no frame — the stage has not offered a frame to describe');
        const frame = await provider();
        if (!frame || !frame.bytes || !frame.bytes.length)
          throw new Error('no frame — the stage capture returned nothing');
        const bytes = frame.bytes instanceof Uint8Array ? frame.bytes : new Uint8Array(frame.bytes);
        const frameSha256 = await hashBytes(bytes);
        const sent = await prepareImage(bytes, frame.mime || 'image/png');
        const { out, rec } = await ask(
          'stage.describe',
          () => buildStageDescribeRequest({ imageBase64: sent.base64 }),
          validateStageDescription,
          { numPredict: 800 },
        );
        set({ description: { text: out.description, at: stamp(), frameSha256, model: rec.model } });
      } catch (e) {
        set({ describeError: String(e && e.message ? e.message : e).slice(0, 200) });
      } finally {
        set({ describing: false });
      }
    },
    /** The ledger, inspectable from the tray: its count rides the view; the text exports on a press. */
    ledgerText: () => readJudgeLedgerText(storage),
    exportLedger: () => downloadJudgeLedger(storage),
  };
  return driver;
}

// ── the app-wide singleton (created lazily by a surface; creation asks nothing) ─────────────────────
let driver = null;
let view = null;
const panelListeners = new Set();

export function ensureVisionDriver() {
  if (!driver) {
    driver = createVisionDriver();
    view = driver.view();
    driver.subscribe((v) => {
      view = v;
      for (const fn of panelListeners) {
        try {
          fn();
        } catch {
          /* a listener must not break the surface */
        }
      }
    });
  }
  return driver;
}

export function getVisionView() {
  return view;
}
export function subscribeVision(fn) {
  panelListeners.add(fn);
  return () => panelListeners.delete(fn);
}

/** Is a vision consumer enabled by what's linked right now (local records only)? For button gates. */
export function visionSurfaceOn(consumerId, raw = getCapabilities()) {
  return surfaceRecord(consumerId, raw) !== null;
}
