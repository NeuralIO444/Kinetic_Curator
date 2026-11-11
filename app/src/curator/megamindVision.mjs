// megamindVision.mjs — #1527 MegaMind S3: LOIS gets eyes — the vision core, pure.
//
// Three surfaces, all occasional and deliberate-press only (plan §6b, Matt's 2026-11-10 scope ruling —
// the loot surface is NOT here; it rides #1479 and joins when that builds):
//   E4 (#1508) render judging — LOIS judges mined finalists' actual stills.
//   E5 (#1530) offspring pre-judging — variant finalists' stills, judged before the tray's crown/pass.
//   stage description — an on-demand spoken/printed description of the current frame (accessibility).
//
// Laws held here (plan §4 + the issue + the 2026-10-15 judge-ledger hook amendment):
// - Enable by capability, never by name: `lois.vision` needs the vision badge AND tier B or better;
//   `stage.describe` needs the vision badge (capabilityRegistry's consumer table — the gates live
//   there; the live driver reads them through the surfaces' localRecord law, so a cloud-badged record
//   enables none of this: local is not cloud).
// - Stills = live: the image judged is the exact still the tray displays (the run folder's PNG/SVG
//   bytes) or the exact current stage frame. Every verdict binds to its image by SHA-256, plus the
//   bake fingerprint where the run recorded one. Only a COPY is ever downscaled for the model (the
//   longest side capped at VISION_IMAGE_MAX_SIDE — the House frame-cost research: a 1280px frame
//   costs roughly 1,600 prompt tokens); the record says what form was actually sent.
// - A vision verdict is a validated, discardable record: the model reads the picture into a fixed
//   schema of coarse readings; KC-1's own gates (below, mirroring loisJudge's critic gates) turn the
//   readings into the verdict — the same shape as lois-render-v1 judging measured stats. A bad,
//   malformed, CJK or ungrounded reply is discarded, never rendered as a verdict.
// - Vision verdicts steer nothing: no reordering, no auto-crown/pass, no selection change. They sit
//   beside the E4 rules verdict on the card, never replacing it.
// - Judge-ledger hook (2026-10-15): verdicts accrue in a SEPARATE judge ledger — never as taste
//   training labels. Rows are stamped with the candidate's recipe, the current taste version and the
//   head kind (the stamps T2 writes on crown records), so a future retrain MAY draw on them only if
//   Matt rules they graduate. Nothing here trains, distils, or ships a head; taste.json is never
//   written.
// - The vision core is backend-neutral: requests are messages + one base64 image, verdicts are the
//   validated record shape below. An Apple provider joins behind the same shape ONLY after the
//   on-device probe specified in STAGING-REPORT-1527.md measures it (the S1 pattern) — an unmeasured
//   Apple record enables nothing, and this module constructs none.
import { MAX_LINE } from './mindContract.js';
import { hasCjk, parseJsonText } from './megamindVoice.mjs';

export const VISION_JUDGE_ID = 'lois-vision-v1';

/** The model never sees a frame larger than this on its longest side (a copy is capped; see header). */
export const VISION_IMAGE_MAX_SIDE = 1280;

/** The judge ledger's storage key + file name (tasteLedger's pattern, a separate ledger entirely). */
export const JUDGE_LEDGER_KEY = 'kc:ledger:judge:v1';
export const JUDGE_LEDGER_FILE = 'judge.jsonl';

// ── the fixed verdict schema: four coarse readings, KC-1's gates decide ─────────────────────────────
// The readings mirror loisJudge's four critic gates one-for-one, so a vision verdict and the rules
// verdict read side by side on the card: presence (ink), contrast, exposure, promise.

export const PRESENCE_READINGS = Object.freeze(['empty', 'sparse', 'balanced', 'wall']);
export const CONTRAST_READINGS = Object.freeze(['flat', 'present', 'strong']);
export const EXPOSURE_READINGS = Object.freeze(['crushed', 'even', 'blown']);
export const PROMISE_READINGS = Object.freeze(['kept', 'broken', 'na']);

/** The flat schema the readings arrive in (the prompt states it; the validator enforces it). */
export const VISION_READINGS_SHAPE =
  '{"presence": "empty"|"sparse"|"balanced"|"wall", "contrast": "flat"|"present"|"strong", "exposure": "crushed"|"even"|"blown", "promise": "kept"|"broken"|"na", "line": "<one short critic line, optional>"}';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cleanLine = (v, max) =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max && !hasCjk(v) ? v.trim() : null;

/**
 * KC-1's gates over LOIS's readings — the verdict is computed here, never taken from the model's
 * word, exactly as judgeRender computes its verdict from measured stats:
 *   presence: an empty frame or a solid wall is not a look (loisJudge INK_MIN / INK_MAX)
 *   contrast: a flat field fails (CONTRAST_MIN)
 *   exposure: crushed to black or blown to white fails (MEAN_MIN / MEAN_MAX)
 *   promise:  a render that breaks its recipe's promise fails (the promise gate)
 */
export function visionVerdictFromReadings(readings) {
  const r = readings || {};
  if (r.presence !== 'sparse' && r.presence !== 'balanced') return 'pass';
  if (r.contrast === 'flat') return 'pass';
  if (r.exposure !== 'even') return 'pass';
  if (r.promise === 'broken') return 'pass';
  return 'keep';
}

/** A raw readings object as a clean one, or null (every reading must be one of its schema's words). */
export function sanitizeReadings(raw) {
  if (!isObj(raw)) return null;
  if (!PRESENCE_READINGS.includes(raw.presence)) return null;
  if (!CONTRAST_READINGS.includes(raw.contrast)) return null;
  if (!EXPOSURE_READINGS.includes(raw.exposure)) return null;
  if (!PROMISE_READINGS.includes(raw.promise)) return null;
  return {
    presence: raw.presence,
    contrast: raw.contrast,
    exposure: raw.exposure,
    promise: raw.promise,
  };
}

/**
 * One vision reply as a validated verdict record, or null: the readings must fit the fixed schema,
 * no CJK anywhere in the reply (drift voids it, as everywhere in MegaMind), and an offered line must
 * be a clean bounded line. The verdict is the gates' computation over the readings.
 */
export function validateVisionVerdict(raw) {
  if (!isObj(raw)) return null;
  if (hasCjk(JSON.stringify(raw))) return null;
  const readings = sanitizeReadings(raw);
  if (!readings) return null;
  let line = null;
  if (raw.line !== undefined && raw.line !== null) {
    line = cleanLine(raw.line, MAX_LINE);
    if (!line) return null;
  }
  return { judge: VISION_JUDGE_ID, verdict: visionVerdictFromReadings(readings), readings, line };
}

// ── the asks ────────────────────────────────────────────────────────────────────────────────────────

const JUDGE_SYSTEM = [
  'You are LOIS, the critic inside KC-1, a generative visual instrument. You are shown ONE rendered still and you judge the picture itself — not its recipe, not its numbers. Blunt, arrogant, never cruel; you judge the product: is this the one?',
  'Answer with exactly one JSON object and nothing else — no prose around it, no reasoning. Answer in English only, every word; never answer in Chinese, Japanese or Korean.',
].join('\n');

/**
 * The render-judging ask: the still (one base64 image on the user message) plus the recipe facts the
 * promise reading is judged against. The E4 rules verdict is deliberately NOT shown — these are
 * independent eyes; the two verdicts meet on the card, not in the prompt.
 * facts: { layout, paletteId, castSize, density ('high'|'mid'|'low'|null), variant }
 */
export function buildRenderJudgeRequest({ facts = {}, imageBase64 } = {}) {
  const f = facts && typeof facts === 'object' ? facts : {};
  const recipe = {
    layout: typeof f.layout === 'string' ? f.layout : null,
    palette: typeof f.paletteId === 'string' ? f.paletteId : null,
    castSize: Number.isInteger(f.castSize) ? f.castSize : null,
    density: ['high', 'mid', 'low'].includes(f.density) ? f.density : null,
  };
  const promiseText =
    recipe.density === 'high'
      ? 'Its recipe promised density "high": a full frame. If the picture drew almost nothing, the promise is "broken".'
      : recipe.density === 'low'
        ? 'Its recipe promised density "low": a whisper. If the picture filled the frame into a wall, the promise is "broken".'
        : 'Its recipe made no density promise you can hold it to: answer promise "na".';
  return [
    { role: 'system', content: JUDGE_SYSTEM },
    {
      role: 'user',
      content:
        (f.variant
          ? 'This still is a variant offspring bred from a kept Look, offered for pre-judging before anyone crowns or passes it. '
          : 'This still is a mined candidate render, offered for judging. ') +
        'Read the picture and answer with these readings: ' +
        VISION_READINGS_SHAPE +
        '. presence: how much of the frame is drawn — "empty" (next to nothing), "sparse" (a little, honestly placed), "balanced" (a composed fullness), "wall" (a solid fill, no air). contrast: "flat" (no luminance contrast to speak of), "present", or "strong". exposure: "crushed" (drowned in black), "even", or "blown" (burned to white). promise: ' +
        promiseText +
        ' The line, when you give one, is one short critic sentence about the picture. Recipe facts (context only — judge the picture): ' +
        JSON.stringify(recipe),
      images: [imageBase64],
    },
  ];
}

const DESCRIBE_SYSTEM = [
  'You describe pictures inside KC-1, a generative visual instrument, for a listener who cannot see the stage. Plain, concrete, unhurried: what is actually there, in words a person can picture.',
  'Answer with exactly one JSON object and nothing else — no prose around it, no reasoning. Answer in English only, every word; never answer in Chinese, Japanese or Korean.',
].join('\n');

/** The stage-description ask: the current frame (one base64 image) and nothing else. */
export function buildStageDescribeRequest({ imageBase64 } = {}) {
  return [
    { role: 'system', content: DESCRIBE_SYSTEM },
    {
      role: 'user',
      content:
        'Describe this stage frame for someone who cannot see it. Reply: {"description": "<the description>"}. Cover, in two to four sentences: the overall composition and layout, the shapes and marks present and how full the frame is, the colours and light (dark or bright, contrast), and the general mood. Name nothing you cannot see; invent no controls, no text, no story beyond the picture.',
      images: [imageBase64],
    },
  ];
}

/** A stage description as a clean record, or null: bounded, English, non-empty. */
export function validateStageDescription(raw) {
  if (!isObj(raw)) return null;
  if (hasCjk(JSON.stringify(raw))) return null;
  const description = cleanLine(raw.description, 600);
  if (!description) return null;
  return { description };
}

/** Parse a vision reply's text (json-object mode) — the surfaces' shared discipline. */
export const parseVisionReply = (text) => parseJsonText(typeof text === 'string' ? text : '');

// ── the judge ledger: accrual rows, stamped like T2's crown records ──────────────────────────────────

const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * The T2 stamps from a loaded taste, exactly as the dice crown reads them (useDiceRoll's orderMeta):
 * the taste's version and its head's kind. No taste loaded → both null — absent stays absent, and a
 * row stamped null is the honest record that no taste regime stood over the judging.
 */
export function tasteStamps(taste) {
  if (!taste || typeof taste !== 'object') return { tasteVersion: null, headKind: null };
  return {
    tasteVersion: Number.isInteger(taste.version) && taste.version >= 0 ? taste.version : null,
    headKind: taste.head && typeof taste.head.kind === 'string' ? taste.head.kind.slice(0, 24) : null,
  };
}

/**
 * One judge-ledger row from a validated vision verdict. Mirrors loisVerdictRow's recipe shape
 * ({ layoutParams, paletteId, assets } from the candidate's config) and stamps, and binds the verdict
 * to the judged image: the SHA-256 of the EXACT still bytes (the run-folder file, or the captured
 * stage frame's bytes), the bake fingerprint where the run recorded one, and what form was sent to
 * the model (the original bytes when they fit the cap, else the downscaled/rasterized copy — the
 * hash always names the source, never the copy).
 *   input: { verdict, kind: 'render'|'variant', seed, run, record, still: { sha256, fingerprint,
 *            sent: { format, width, height, downscaled, rasterized } }, taste, model, at }
 * Null when there is no verdict or no bound image — an unbound verdict accrues nothing.
 */
export function visionLedgerRow(input = {}) {
  const { verdict, kind, seed, run, record, still, taste, model, at } = input;
  if (!verdict || verdict.judge !== VISION_JUDGE_ID) return null;
  if (kind !== 'render' && kind !== 'variant') return null;
  if (!still || !SHA256_RE.test(String(still.sha256 || ''))) return null;
  const cfg = record && typeof record === 'object' ? record.config : null;
  const stamps = tasteStamps(taste);
  const sent = still.sent && typeof still.sent === 'object' ? still.sent : {};
  return {
    judge: VISION_JUDGE_ID,
    kind,
    verdict: verdict.verdict,
    readings: { ...verdict.readings },
    line: verdict.line ?? null,
    seed: Number.isFinite(seed) ? seed >>> 0 : (record?.seed ?? null),
    run: typeof run === 'string' ? run : null,
    recipe: {
      layoutParams: cfg && typeof cfg.layout === 'object' ? cfg.layout : null,
      paletteId: cfg && typeof cfg.palette?.id === 'string' ? cfg.palette.id : null,
      assets: cfg && Array.isArray(cfg.assets) ? [...cfg.assets] : [],
    },
    provenance: record && typeof record === 'object' ? (record.provenance ?? null) : null,
    still: {
      sha256: still.sha256,
      fingerprint: typeof still.fingerprint === 'string' ? still.fingerprint : null,
      sent: {
        format: typeof sent.format === 'string' && sent.format ? sent.format : 'png',
        width: Number.isInteger(sent.width) ? sent.width : null,
        height: Number.isInteger(sent.height) ? sent.height : null,
        downscaled: sent.downscaled === true,
        rasterized: sent.rasterized === true,
      },
    },
    tasteVersion: stamps.tasteVersion,
    headKind: stamps.headKind,
    model: typeof model === 'string' ? model : null,
    at: Number.isFinite(at) ? at : null,
  };
}

/** The judge ledger's own schema check — deliberately NOT tasteLedger.isLedgerRow (see the selfcheck:
 * a judge row must fail that check, so no training reader can ever mistake it for a label). */
export function isJudgeLedgerRow(o) {
  if (!isObj(o)) return false;
  if (o.judge !== VISION_JUDGE_ID) return false;
  if (o.kind !== 'render' && o.kind !== 'variant') return false;
  if (o.verdict !== 'keep' && o.verdict !== 'pass') return false;
  if (!sanitizeReadings(o.readings)) return false;
  if (visionVerdictFromReadings(o.readings) !== o.verdict) return false;
  if (!isObj(o.recipe) || !('layoutParams' in o.recipe) || !('paletteId' in o.recipe)) return false;
  if (!isObj(o.still) || !SHA256_RE.test(String(o.still.sha256 || ''))) return false;
  if (!(o.tasteVersion === null || (Number.isInteger(o.tasteVersion) && o.tasteVersion >= 0))) return false;
  if (!(o.headKind === null || typeof o.headKind === 'string')) return false;
  return true;
}

/** One JSONL line, newline-terminated (tasteLedger.serializeRow's shape). */
export const serializeJudgeRow = (row) => `${JSON.stringify(row)}\n`;

/** Parse judge-ledger text: a corrupt or off-schema line is skipped WITH a warning, never silently. */
export function parseJudgeLedger(text, warn = (m) => console.warn(m)) {
  const rows = [];
  let skipped = 0;
  String(text ?? '')
    .split('\n')
    .forEach((line, i) => {
      if (!line.trim()) return;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        skipped++;
        warn(`[judge-ledger] line ${i + 1}: not JSON — skipped`);
        return;
      }
      if (!isJudgeLedgerRow(o)) {
        skipped++;
        warn(`[judge-ledger] line ${i + 1}: not a judge row — skipped`);
        return;
      }
      rows.push(o);
    });
  return { rows, skipped };
}
