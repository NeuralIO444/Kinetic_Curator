// agentUi/uiBridge.mjs — issue 2509: the action bridge behind the shipped manifest.
//
// Installs window.__KC_UI__ — the deliberate, always-on sibling of the test-only
// __KC_EXPOSE_STORE hook (issue 2477's R5 pattern). Matt's ruling (2026-11-24): the
// manifest ships in the live build so an agent can read and drive the real UI on the
// hosted build, not only in a test harness.
//
//   __KC_UI__.manifest()        the registry's JSON form (uiRegistry.buildManifest)
//   __KC_UI__.act(id, value?, param?)   perform one registered control through its own
//                               channel — the same bus event / store action / dispatch
//                               type / module function the control itself calls. Never a
//                               parallel write path; no authority the panels don't have.
//   __KC_UI__.read(id, param?)  the control's registered read paths, resolved live
//   __KC_UI__.stage()           fps / node count / tape / watchdog / build, from the store
//   __KC_UI__.state(keys?)       a JSON-safe snapshot of store data (functions stripped)
//
// act() answers { ok, id, before, after } — the read paths snapshotted around the call,
// so a caller can verify the change landed. Errors are reported, never thrown across
// the hook. Controls with no lawful channel (dialog-local state, file IO, downloads,
// native bridges) answer ok:false with the registry's reason.

import { useStore } from '../state/store.js';
import { emit, Events } from '../composition/eventBus.js';
import { applyAction } from '../state/applyAction.js';
import { FRAME_BUDGET_MS } from '../state/tapeBudget.js';
import * as devModeModule from '../composition/devMode.mjs';
import * as tuningModule from '../personas/tuning.mjs';
import * as biologyPolicy from '../biology/policy.js';
import * as tasteModule from '../curator/taste.js';
import * as governorLog from '../gl/governorEventLog.mjs';
import { captureFavorite } from '../state/slices/davisSlice.js';
import { nextRoute } from '../data/audioRoutes.js';
import { getPresetsByGroup } from '../data/presets.js';
import { treatments } from '../curator/treatmentsLive.mjs';
import { AGENT_UI_SCHEMA, buildManifest, controlById } from './uiRegistry.mjs';

// Module channels: keyed exactly as the registry names them ('<module>#<export>').
// The selfcheck pins every registry module channel has an entry here, and vice versa.
export const MODULE_CHANNELS = Object.freeze({
  'composition/devMode.mjs#setDevMode': (v) => devModeModule.setDevMode(v),
  'personas/tuning.mjs#setTuningValue': (path, v) => tuningModule.setTuningValue(path, v),
  'personas/tuning.mjs#resetTuning': () => tuningModule.resetTuning(),
  'biology/policy.js#resetBiologyPolicy': () => biologyPolicy.resetBiologyPolicy(),
  'curator/taste.js#setActivePersona': (id) => tasteModule.setActivePersona(id),
  'gl/governorEventLog.mjs#clearGovernorEvents': () => governorLog.clearGovernorEvents(),
});

// Module-held reads, for registry reads of the form 'module:<module>#<export>'.
export const MODULE_READS = Object.freeze({
  'composition/devMode.mjs#devModeOn': () => devModeModule.devModeOn(),
  'curator/taste.js#getActivePersonaId': () => tasteModule.getActivePersonaId(),
  'personas/tuning.mjs#tuningValue': ({ param }) => tuningModule.tuningValue(param),
});

// Recipes: channels whose payload is derived from live state, built with the same
// module helpers the panel itself calls. Keyed by the registry's recipe name; each
// receives the actuation context { value, param }.
export const RECIPES = Object.freeze({
  // Looks menu: resolve the preset id to the same object the menu passes.
  loadLookPreset({ param }) {
    for (const group of getPresetsByGroup()) {
      const hit = (group.presets ?? []).find((p) => p.id === param);
      if (hit) {
        emit(Events.LAYOUT_PRESET, hit);
        return;
      }
    }
    throw new Error(`unknown look preset ${param}`);
  },
  // DAVIS ★: captureFavorite is the panel's own builder, fed the live state.
  addFavorite() {
    const st = useStore.getState();
    emit(Events.DAVIS_FAVORITE, { action: 'add', favorite: captureFavorite(st, st.paletteId) });
  },
  // ModMatrix + route: the panel's own edit function, built from nextRoute.
  routeAdd() {
    emit(Events.AUDIO_ROUTES_EDIT, {
      fn: (table) => {
        const r = nextRoute(table);
        return r ? [...table, r] : table;
      },
      continuous: false,
    });
  },
  // Doctrine tiles: the panel calls the treatments driver with by: 'performer';
  // tapping the standing doctrine clears it.
  setDoctrine({ value }) {
    const current = useStore.getState().poemDoctrine;
    treatments.doctrine('poem', { standing: current === value ? null : value, by: 'performer' });
  },
  // Stratum header: the panel picks the select event by the stratum's own type.
  selectLayer({ param }) {
    const layer = (useStore.getState().layers ?? []).find((l) => l.id === param);
    if (!layer) throw new Error(`unknown layer ${param}`);
    if (layer.type === 'pattern') emit(Events.PATTERN_SELECT, { id: layer.id });
    else if (layer.type === 'math') emit(Events.MATH_SELECT, { id: layer.id });
    else if (layer.type === 'fx') emit(Events.FX_SELECT, { id: layer.id });
    else emit(Events.LAYER_SET_ACTIVE, { id: layer.id });
  },
});

function getPath(obj, path) {
  let cur = obj;
  for (const seg of String(path).split('.')) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function resolveTemplate(tpl, ctx) {
  if (typeof tpl === 'string') {
    if (tpl === '$value') return ctx.value;
    if (tpl === '$toggle') return ctx.toggle;
    if (tpl === '$param') return ctx.param;
    if (tpl.startsWith('$param.')) return getPath(ctx.param, tpl.slice('$param.'.length));
    if (tpl.includes('$param')) return tpl.replaceAll('$param', String(ctx.param));
    if (tpl.includes('$value')) return tpl.replaceAll('$value', String(ctx.value));
    return tpl;
  }
  if (Array.isArray(tpl)) return tpl.map((t) => resolveTemplate(t, ctx));
  if (tpl && typeof tpl === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(tpl)) out[k] = resolveTemplate(v, ctx);
    return out;
  }
  return tpl;
}

function templateUses(tpl, token) {
  if (typeof tpl === 'string') return tpl.includes(token);
  if (Array.isArray(tpl)) return tpl.some((t) => templateUses(t, token));
  if (tpl && typeof tpl === 'object') return Object.values(tpl).some((v) => templateUses(v, token));
  return false;
}

function readOne(path, ctx) {
  if (path.startsWith('module:')) {
    const fn = MODULE_READS[path.slice('module:'.length)];
    return fn ? fn(ctx) : undefined;
  }
  return getPath(useStore.getState(), path);
}

function readEntry(entry, param) {
  if (!entry.reads || entry.reads.length === 0) return null;
  const out = {};
  for (const path of entry.reads) out[path] = readOne(path, { param });
  return out;
}

function perform(entry, ctx) {
  const ch = entry.channel;
  if (ch.kind === 'bus') {
    const emits = ch.emits ?? [ch];
    for (const e of emits) {
      const eventName = Events[e.event];
      if (!eventName) throw new Error(`unknown bus event ${e.event}`);
      emit(eventName, e.payload !== undefined ? resolveTemplate(e.payload, ctx) : undefined);
    }
    return;
  }
  if (ch.kind === 'store') {
    const fn = useStore.getState()[ch.action];
    if (typeof fn !== 'function') throw new Error(`unknown store action ${ch.action}`);
    fn(...(ch.args ?? []).map((a) => resolveTemplate(a, ctx)));
    return;
  }
  if (ch.kind === 'apply') {
    applyAction({ type: ch.type, ...(ch.fields ? resolveTemplate(ch.fields, ctx) : {}) });
    return;
  }
  if (ch.kind === 'module') {
    const fn = MODULE_CHANNELS[`${ch.module}#${ch.export}`];
    if (!fn) throw new Error(`unknown module channel ${ch.module}#${ch.export}`);
    fn(...(ch.args ?? []).map((a) => resolveTemplate(a, ctx)));
    return;
  }
  if (ch.kind === 'recipe') {
    const fn = RECIPES[ch.recipe];
    if (!fn) throw new Error(`unknown recipe ${ch.recipe}`);
    fn({ value: ctx.value, param: ctx.param });
    return;
  }
  throw new Error(`unknown channel kind ${ch.kind}`);
}

export function act(id, value, param) {
  const entry = controlById(id);
  if (!entry) return { ok: false, id, error: 'unknown control id' };
  if (!entry.channel) {
    return { ok: false, id, error: entry.note ?? 'no bridge channel — local or readout control' };
  }
  const before = readEntry(entry, param);
  const firstRead = entry.reads && entry.reads.length > 0 ? before[entry.reads[0]] : undefined;
  const ctx = { value, param, toggle: !firstRead };
  // A toggle actuated with an explicit target state that already holds is a no-op
  // success — the control itself would have nothing to change.
  if (
    entry.kind === 'toggle' &&
    value !== undefined &&
    templateUses(entry.channel.payload ?? entry.channel.args ?? entry.channel.fields ?? {}, '$toggle') &&
    Boolean(firstRead) === Boolean(value)
  ) {
    return { ok: true, id, before, after: before, noop: true };
  }
  try {
    perform(entry, ctx);
  } catch (e) {
    return { ok: false, id, error: String(e?.message ?? e), before };
  }
  return { ok: true, id, before, after: readEntry(entry, param) };
}

export function read(id, param) {
  const entry = controlById(id);
  if (!entry) return { ok: false, id, error: 'unknown control id' };
  return { ok: true, id, values: readEntry(entry, param) };
}

export function stage() {
  const st = useStore.getState();
  const frameMs = st.stageTimings?.gpuFrame || (st.fps > 0 ? 1000 / st.fps : 0);
  return {
    build: import.meta.env?.VITE_BUILD_ID || 'dev',
    fps: st.fps ?? null,
    nodeCount: st.nodeCount ?? null,
    tapePct: frameMs > 0 ? Math.round(((frameMs / FRAME_BUDGET_MS) * 100 + Number.EPSILON) * 10) / 10 : 0,
    running: !!st.running,
    slowRender: !!st.slowRender,
    slowRenderSource: st.slowRenderSource ?? null,
    watchdog: !!(st.slowRender && st.slowRenderSource === 'watchdog'),
    lastWatchdogReason: st.lastWatchdogReason ?? null,
    quality: st.quality ?? null,
  };
}

export function stateSnapshot(keys) {
  const st = useStore.getState();
  const pick = keys && keys.length > 0 ? Object.fromEntries(keys.map((k) => [k, st[k]])) : st;
  return JSON.parse(JSON.stringify(pick, (k, v) => (typeof v === 'function' ? undefined : v)));
}

const MANIFEST = Object.freeze({ ...buildManifest(), build: import.meta.env?.VITE_BUILD_ID || 'dev' });

export function installAgentUi() {
  if (typeof window === 'undefined') return null;
  const hook = Object.freeze({
    schema: AGENT_UI_SCHEMA,
    manifest: () => MANIFEST,
    act,
    read,
    stage,
    state: stateSnapshot,
  });
  window.__KC_UI__ = hook;
  return hook;
}

installAgentUi();
