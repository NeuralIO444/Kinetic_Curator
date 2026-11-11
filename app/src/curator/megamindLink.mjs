// megamindLink.mjs — #1525 MegaMind S1: the Ollama link's pure core. Detection only — no persona calls (S2).
//
// The doctrine (docs/research/megamind-local-model-plan-2026-10-14.md): never assume, measure. Model names
// come verbatim from the visitor's own Ollama and are never constructed; the cadence tier comes from a timed
// warm probe in MegaMind's real verdict format, never from the name; a retired model fails with honest copy
// naming the gate, never a silent hang. Everything network-shaped takes an injected fetch so the selfcheck
// can drive it against fixtures that mirror real Ollama replies.
import { validateReply } from './mindContract.js';

// ── the House configuration — the one supported setup ────────────────────────────────────────────────────
export const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';
export const HOUSE_MODEL = 'qwen3-vl:8b-instruct';
export const HOUSE_MODEL_LIGHT = 'qwen3-vl:4b-instruct';
export const HOUSE_NUM_CTX = 16384; // pinned at connect, never varied (changing it reloads the model)
export const HOUSE_KEEP_ALIVE = '30m';
export const HOUSE_NUM_PREDICT = 150;

/**
 * The House recommendation, verbatim. This is the ONE canonical source: the dev panel renders this string,
 * and README.md, docs/wiki-home.md and docs/MEGAMIND.md carry it character-for-character (the selfcheck
 * fails if any of them drifts). Revise the pick here and nowhere else.
 */
export const HOUSE_TEXT = [
  'MegaMind — the House configuration (the one supported setup)',
  `Model: ${HOUSE_MODEL}, served by Ollama on your own machine (lighter machines: ${HOUSE_MODEL_LIGHT})`,
  `Endpoint: ${DEFAULT_ENDPOINT}`,
  `Persona calls: think off · temperature 0 for verdicts · num_predict capped at ${HOUSE_NUM_PREDICT}`,
  `Context: num_ctx pinned at ${HOUSE_NUM_CTX.toLocaleString('en-US')} at connect and never varied · keep_alive "${HOUSE_KEEP_ALIVE}", the model preloaded at connect`,
  'Ollama must trust this origin: restart it with OLLAMA_ORIGINS set to the exact origin KC-1 is served from',
  'Everything else you connect may work, but it is unsupported — Ollama cloud models included: they are badged cloud and never recommended.',
].join('\n');

/** Cadence tier bounds from the warm probe (plan §2): A per-bar, B phrase, C deep-verdict-only. */
export const TIER_A_MAX_MS = 3000;
export const TIER_B_MAX_MS = 8000;
export const TIER_BLURB = Object.freeze({ A: 'per-bar', B: 'phrase', C: 'deep verdicts only' });

const TAGS_TIMEOUT_MS = 10000;
const SHOW_TIMEOUT_MS = 15000;
/** A cold 32B load can be slow; the probe is bounded so a connect can never hang silently. */
export const PROBE_TIMEOUT_MS = 180000;

// ── endpoints and names ──────────────────────────────────────────────────────────────────────────────────

/** A typed endpoint as a clean base URL, or null. Trailing slashes go; only http(s) speaks Ollama here. */
export function normalizeEndpoint(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/\/+$/, '');
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, ''));
  } catch {
    return null;
  }
}

/**
 * True when an endpoint's origin is the ONE origin the desktop shell may connect to. The shell's CSP
 * (src-tauri/tauri.conf.json, #1525) allows exactly the House endpoint's origin in connect-src and no
 * other remote address, so inside the shell any other endpoint is refused by the app itself — a gate
 * of its own ('shell-endpoint' in errorCopy), never the generic unreachable failure.
 */
export function isDesktopShellEndpoint(endpoint) {
  try {
    return new URL(endpoint).origin === new URL(DEFAULT_ENDPOINT).origin;
  } catch {
    return false;
  }
}

/**
 * Cloud pointers, by name shape alone (plan §1: Ollama's cloud naming has several shapes —
 * `gpt-oss:120b-cloud`, `glm-5.1:cloud`, `deepseek-v3.1:671b-cloud`). A cloud model is connectable
 * and badged, never recommended: it runs on Ollama's cloud, not on the visitor's machine.
 */
export function isCloudModel(name) {
  if (typeof name !== 'string') return false;
  const n = name.split('@')[0].trim(); // drop any digest
  return /(?:^|[:-])cloud$/.test(n);
}

// ── /api/tags and /api/show, parsed ──────────────────────────────────────────────────────────────────────

/** The model list, names verbatim. Entries without a usable name are not models KC-1 can point at. */
export function parseTags(raw) {
  const list = raw && Array.isArray(raw.models) ? raw.models : [];
  const out = [];
  for (const m of list) {
    if (!m || typeof m.name !== 'string' || !m.name) continue;
    const d = m.details && typeof m.details === 'object' ? m.details : {};
    out.push({
      name: m.name,
      size: Number.isFinite(m.size) ? m.size : null,
      family: typeof d.family === 'string' ? d.family : null,
      parameterSize: typeof d.parameter_size === 'string' ? d.parameter_size : null,
    });
  }
  return out;
}

/**
 * One model's show data: capabilities verbatim, and the context length found by scanning the model_info
 * keys for `*.context_length` — the architecture prefix is the model's own, never hardcoded (plan §2).
 * `thinking` is 'controllable' only when the capabilities say the model exposes thinking control; a model
 * with no thinking metadata may still think by default (R1 distills) — the probe is what catches that.
 */
export function parseShow(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const capabilities = Array.isArray(r.capabilities) ? r.capabilities.filter((c) => typeof c === 'string') : [];
  const info = r.model_info && typeof r.model_info === 'object' ? r.model_info : {};
  let context = null;
  for (const [k, v] of Object.entries(info)) {
    if (k.endsWith('.context_length') && Number.isFinite(v) && v > 0) {
      context = Math.floor(v);
      break;
    }
  }
  const d = r.details && typeof r.details === 'object' ? r.details : {};
  return {
    capabilities,
    context,
    architecture: typeof info['general.architecture'] === 'string' ? info['general.architecture'] : null,
    family: typeof d.family === 'string' ? d.family : null,
    parameterSize: typeof d.parameter_size === 'string' ? d.parameter_size : null,
    vision: capabilities.includes('vision'),
    thinking: capabilities.includes('thinking') ? 'controllable' : 'unreported',
  };
}

/** The badges a connected model wears: vision (its show data says so), cloud (its name is a cloud pointer). */
export function badgesFor(model, show) {
  const badges = [];
  if (show && show.vision) badges.push('vision');
  if (isCloudModel(model)) badges.push('cloud');
  return badges;
}

// ── the warm probe: one verdict, MegaMind's real format ──────────────────────────────────────────────────

/** The flat verdict schema the probe asks in — LOIS's kc-voice/1 shape, nothing deeper (plan §2). */
export const PROBE_FORMAT = Object.freeze({
  type: 'object',
  properties: {
    critique: {
      anyOf: [
        {
          type: 'object',
          properties: { target: { type: 'string' }, delta: { type: 'number' } },
          required: ['target', 'delta'],
        },
        { type: 'null' },
      ],
    },
    state: { type: 'string' },
    line: { type: 'string' },
  },
  required: ['critique'],
});

const PROBE_SYSTEM =
  "You are LOIS in KC-1's Mind trio. You answer with one flat JSON verdict and nothing else — no prose, no reasoning.";
const PROBE_USER =
  'Warm-up probe, not a real show: the room is calm, Davis is FLOW, nothing has been kept yet, the stage is quiet. ' +
  'Return the verdict JSON now: critique null, or one critique with a target and a small delta.';

/**
 * The probe request body. `think: false` rides only when the model's show data says thinking is
 * controllable (plan §2: "where supported"); num_ctx is the House pin; num_predict is capped;
 * temperature 0, because this measures verdict behaviour.
 */
export function buildProbeBody(model, { thinking = false } = {}) {
  return {
    model,
    stream: false,
    keep_alive: HOUSE_KEEP_ALIVE,
    ...(thinking ? { think: false } : {}),
    format: PROBE_FORMAT,
    options: { temperature: 0, num_predict: HOUSE_NUM_PREDICT, num_ctx: HOUSE_NUM_CTX },
    messages: [
      { role: 'system', content: PROBE_SYSTEM },
      { role: 'user', content: PROBE_USER },
    ],
  };
}

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/**
 * Grade a probe reply's content. Clean = it parses as a kc-voice/1 LOIS verdict after any think block is
 * stripped, nothing leaked, and the language didn't drift (plan §2/§3: drift is real, and no vendor locks
 * a language). A leaked <think> means thinking could not be turned off — the cadence killer, tier C.
 */
export function checkProbeReply(content) {
  if (typeof content !== 'string') return { clean: false, thinkLeak: false, drift: false, reply: null };
  const thinkLeak = /<think>/i.test(content);
  const stripped = content.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim();
  let parsed = null;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { clean: false, thinkLeak, drift: false, reply: null };
  }
  const reply = validateReply('lois', parsed);
  const drift = CJK.test(JSON.stringify(parsed));
  return { clean: !!reply && !thinkLeak && !drift, thinkLeak, drift, reply };
}

/** The tier is the measurement, never the name: fast + clean A, phrase-paced + clean B, else C. */
export function classifyTier({ ms, clean }) {
  if (!clean || !Number.isFinite(ms)) return 'C';
  if (ms <= TIER_A_MAX_MS) return 'A';
  if (ms <= TIER_B_MAX_MS) return 'B';
  return 'C';
}

// ── fetch, with honest gates ─────────────────────────────────────────────────────────────────────────────

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  let ctl = null;
  let timer = null;
  try {
    if (typeof AbortController !== 'undefined') {
      ctl = new AbortController();
      timer = setTimeout(() => ctl.abort(), timeoutMs);
    }
    return await fetchImpl(url, { ...init, ...(ctl ? { signal: ctl.signal } : {}) });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const isAbort = (e) => !!e && (e.name === 'AbortError' || e.code === 20);

/**
 * When the real request fails outright, an opaque no-cors request separates the two gates a plain
 * failure hides: something answering at the endpoint (the origin is not allowed) vs nothing there
 * (Ollama not running, or the browser refused the local-network prompt).
 */
export async function reachGate(fetchImpl, endpoint) {
  try {
    await fetchWithTimeout(fetchImpl, `${endpoint}/`, { mode: 'no-cors' }, TAGS_TIMEOUT_MS);
    return 'origin';
  } catch {
    return 'unreachable';
  }
}

async function jsonCall(fetchImpl, endpoint, path, init, timeoutMs) {
  let res;
  try {
    res = await fetchWithTimeout(fetchImpl, `${endpoint}${path}`, init, timeoutMs);
  } catch (e) {
    if (isAbort(e)) return { ok: false, gate: 'unreachable', timedOut: true };
    return { ok: false, gate: await reachGate(fetchImpl, endpoint) };
  }
  if (!res || typeof res.status !== 'number') return { ok: false, gate: 'bad-reply' };
  if (!res.ok) return { ok: false, gate: 'http', status: res.status };
  try {
    return { ok: true, status: res.status, data: await res.json() };
  } catch {
    return { ok: false, gate: 'bad-reply', status: res.status };
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** GET /api/tags → { ok, models } or { ok: false, gate, status? }. */
export async function fetchTags(fetchImpl, endpoint) {
  const r = await jsonCall(fetchImpl, endpoint, '/api/tags', { method: 'GET' }, TAGS_TIMEOUT_MS);
  return r.ok ? { ok: true, models: parseTags(r.data) } : r;
}

/** POST /api/show → { ok, show } or { ok: false, gate, status? } (a 404 here is a model that is gone). */
export async function fetchShow(fetchImpl, endpoint, model) {
  const r = await jsonCall(
    fetchImpl,
    endpoint,
    '/api/show',
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ model }) },
    SHOW_TIMEOUT_MS,
  );
  if (!r.ok) return r.status === 404 ? { ok: false, gate: 'model-gone', status: 404 } : r;
  return { ok: true, show: parseShow(r.data) };
}

/** Load the model with the House pins so the timed probe measures a WARM model. Best-effort by design. */
export async function preloadModel(fetchImpl, endpoint, model) {
  const r = await jsonCall(
    fetchImpl,
    endpoint,
    '/api/generate',
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ model, stream: false, keep_alive: HOUSE_KEEP_ALIVE, options: { num_ctx: HOUSE_NUM_CTX } }),
    },
    PROBE_TIMEOUT_MS,
  );
  return { ok: r.ok };
}

/**
 * The timed warm probe. Returns { ms, clean, thinkLeak, drift, timedOut, httpStatus } — an HTTP failure
 * or a timeout is data for the tier (C), never a hang: the caller decides what an unusable probe means.
 */
export async function runWarmProbe(
  fetchImpl,
  endpoint,
  model,
  { thinking = false, now, timeoutMs = PROBE_TIMEOUT_MS } = {},
) {
  const t0 = now();
  let res;
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      `${endpoint}/api/chat`,
      { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(buildProbeBody(model, { thinking })) },
      timeoutMs,
    );
  } catch (e) {
    return { ms: now() - t0, clean: false, thinkLeak: false, drift: false, timedOut: isAbort(e), httpStatus: null };
  }
  const ms = now() - t0;
  if (!res || !res.ok) {
    return { ms, clean: false, thinkLeak: false, drift: false, timedOut: false, httpStatus: res ? res.status : null };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  const grade = checkProbeReply(data && data.message ? data.message.content : null);
  return { ms, ...grade, timedOut: false, httpStatus: res.status };
}

// ── honest error copy: every gate names itself ───────────────────────────────────────────────────────────

/** The visitor's OS from a platform/UA string, for the per-OS Ollama restart step. */
export function detectOs(text) {
  const s = String(text || '');
  if (/mac/i.test(s)) return 'mac';
  if (/win/i.test(s)) return 'windows';
  if (/linux|x11/i.test(s)) return 'linux';
  return 'other';
}

/** True for Safari (not Chrome/Chromium/Edge/Firefox wearing a Safari token, and not the desktop shell). */
export function isSafariUa(ua) {
  const s = String(ua || '');
  return /safari/i.test(s) && !/chrome|chromium|crios|edg|firefox|fxios|opr\//i.test(s);
}

function originRestartLines(os, origin) {
  const v = `OLLAMA_ORIGINS=${origin}`;
  switch (os) {
    case 'mac':
      return [
        'On macOS: quit Ollama from its menu-bar icon, then in Terminal run:',
        `  launchctl setenv OLLAMA_ORIGINS "${origin}"`,
        'Then open Ollama again and press Connect.',
      ];
    case 'windows':
      return [
        'On Windows: in PowerShell run:',
        `  setx OLLAMA_ORIGINS "${origin}"`,
        'Then quit Ollama from the system tray and start it again, and press Connect.',
      ];
    case 'linux':
      return [
        'On Linux: put the variable in the ollama service\u2019s environment, e.g.:',
        `  systemctl --user edit ollama   # add: Environment="${v}"`,
        'Then `systemctl --user restart ollama` and press Connect. If you run `ollama serve` yourself, restart it with the variable set.',
      ];
    default:
      return [`Set ${v} in Ollama\u2019s environment on your system, restart Ollama, then press Connect.`];
  }
}

/**
 * The copy for every way a connect can fail. Each gate names itself in plain words; the origin gate
 * carries the exact OLLAMA_ORIGINS= line for THIS page's origin plus the restart step for the OS.
 * ctx: { endpoint, model, origin, os, status }
 */
export function errorCopy(gate, ctx = {}) {
  const { endpoint = DEFAULT_ENDPOINT, model = null, origin = '', os = 'other', status = null } = ctx;
  switch (gate) {
    case 'bad-endpoint':
      return {
        title: 'That endpoint doesn\u2019t parse.',
        lines: [`Use the full address of your Ollama — the House endpoint is ${DEFAULT_ENDPOINT}.`],
      };
    case 'safari':
      return {
        title: 'Safari can\u2019t reach a local model.',
        lines: [
          'Safari blocks a page from talking to a model server on your own machine, so the link can neither be tested nor used from Safari.',
          'Open KC-1 in the desktop app to connect a local model.',
        ],
      };
    case 'shell-endpoint':
      return {
        title: 'The desktop app only connects to Ollama at one address.',
        lines: [
          `The desktop shell allows the link exactly one origin — ${DEFAULT_ENDPOINT}, Ollama on this machine — and refuses every other endpoint itself, before any request leaves the app. Nothing was sent to ${endpoint}.`,
          `Set the endpoint to ${DEFAULT_ENDPOINT} and press Connect again.`,
        ],
      };
    case 'unreachable':
      return {
        title: `Nothing answered at ${endpoint}.`,
        lines: [
          'Ollama may not be running — start it, then press Connect again.',
          'Or the browser refused the local-network prompt: allow this site to access your local network, then retry.',
        ],
      };
    case 'origin':
      return {
        title: 'Ollama answered, but it won\u2019t talk to this page.',
        lines: [
          'Ollama only answers the origins it has been told to trust. Restart it with this page\u2019s origin allowed:',
          `  OLLAMA_ORIGINS=${origin}`,
          ...originRestartLines(os, origin),
        ],
      };
    case 'http':
      return {
        title: `Ollama answered with an error${status ? ` (HTTP ${status})` : ''}.`,
        lines: [
          'The address answered but the request failed. If that port serves something that isn\u2019t Ollama, point the endpoint at Ollama itself.',
        ],
      };
    case 'bad-reply':
      return {
        title: 'That endpoint answered in a shape KC-1 can\u2019t read.',
        lines: [
          'It answered, but not with Ollama\u2019s model data. Check the endpoint points at Ollama itself, not a proxy or another app.',
        ],
      };
    case 'model-gone':
      return {
        title: model
          ? `${model} isn\u2019t in Ollama\u2019s list any more.`
          : 'That model isn\u2019t in Ollama\u2019s list any more.',
        lines: [
          'It may have been renamed, retired or removed since it was saved. KC-1 never guesses a name — pick from the list Ollama reports now.',
          `To restore the House model:  ollama pull ${HOUSE_MODEL}`,
        ],
      };
    case 'no-models':
      return {
        title: 'Ollama is running, but it has no models.',
        lines: ['Pull the House model, then press Connect again:', `  ollama pull ${HOUSE_MODEL}`],
      };
    default:
      return {
        title: 'The connect failed.',
        lines: ['Nothing was measured and nothing was stored. Try Connect again.'],
      };
  }
}
