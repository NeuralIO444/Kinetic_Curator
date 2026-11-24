// agentUi/uiRegistry.selfcheck.mjs — issue 2509.
// Pins the agent UI registry so the shipped manifest cannot silently drift:
//   · the registry is well-formed (UI_PROBLEMS) and covers the ruled panel list;
//   · the manifest is exactly the registry's JSON form (round-trip + per-control equality);
//   · every channel names something real — a bus event in Events, a store action on the
//     live store, a dispatch type in state/actions.js, a module export that exists in
//     its file AND in the bridge's channel table, a recipe the bridge implements;
//   · every read path resolves against the live store's state keys (layoutParams keys
//     against DEFAULT_LAYOUT_PARAMS, beastSettings keys against the initial state,
//     light keys against LIGHT_DEFAULT);
//   · every lpRow's stops match PARAM_STOPS and its range matches PARAM_SPEC (with the
//     documented editor-span / exiled-key exceptions pinned below), and the two option
//     lists QA caught as copies (KINEME_PATTERNS, DOCTRINE_IDS) equal their module exports;
//   · the bridge's state() allowlist is exactly the registered read surface, and known
//     unregistered store keys are refused by name;
//   · every entry's source component exists and names the channel's own literal
//     (Events.<NAME> / the store action / the dispatch type / the module export) —
//     the registry describes the UI as built, not as imagined.
// Run: node src/agentUi/uiRegistry.selfcheck.mjs

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_UI_SCHEMA, PANELS, UI_CONTROLS, UI_PROBLEMS, buildManifest, controlById } from './uiRegistry.mjs';
import { MODULE_CHANNELS, MODULE_READS, RECIPES, STATE_READ_PATHS, stateSnapshot } from './uiBridge.mjs';
import { Events } from '../composition/eventBus.js';
import * as Actions from '../state/actions.js';
import { useStore } from '../state/store.js';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC, PARAM_STOPS } from '../data/layout-modes.js';
import { BEAST_SETTING_RANGES } from '../engine/beastSettings.mjs';
import { KINEME_PATTERNS } from '../engine/kineme.js';
import { DOCTRINE_IDS } from '../curator/doctrines.mjs';
import { LIGHT_DEFAULT } from '../data/light.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
};

// ── shape + coverage ──────────────────────────────────────────────────────────
check(UI_PROBLEMS.length === 0, `UI_PROBLEMS not empty: ${UI_PROBLEMS.join(' | ')}`);
const REQUIRED_PANELS = [
  'topbar',
  'canvas',
  'assets',
  'inspector',
  'shelf',
  'build',
  'play',
  'pipeline',
  'stimuli',
  'directors',
  'dev',
  'wetlab',
  'studio',
  'transport',
];
check(
  JSON.stringify(PANELS.map((p) => p.id)) === JSON.stringify(REQUIRED_PANELS),
  `panel list drifted: ${PANELS.map((p) => p.id).join(',')}`,
);

// ── manifest correspondence ───────────────────────────────────────────────────
const manifest = buildManifest();
check(manifest.schema === AGENT_UI_SCHEMA, 'manifest schema mismatch');
const roundTripped = JSON.parse(JSON.stringify(manifest));
check(JSON.stringify(roundTripped) === JSON.stringify(manifest), 'manifest is not pure JSON data');
check(manifest.controls.length === UI_CONTROLS.length, 'manifest control count != registry count');
for (const mc of manifest.controls) {
  const rc = controlById(mc.id);
  check(!!rc, `manifest control ${mc.id} missing from registry`);
  if (rc) check(JSON.stringify(mc) === JSON.stringify({ ...rc }), `manifest control ${mc.id} != registry entry`);
}
const byPanelSum = Object.values(manifest.counts.byPanel).reduce((a, b) => a + b, 0);
check(byPanelSum === UI_CONTROLS.length, 'byPanel counts do not sum to the control count');

// ── channels name real things ─────────────────────────────────────────────────
const state = useStore.getState();
const usedModuleKeys = new Set();
const usedRecipes = new Set();
for (const c of UI_CONTROLS) {
  const ch = c.channel;
  if (!ch) continue;
  if (ch.kind === 'bus') {
    for (const e of ch.emits ?? [ch]) {
      check(Object.hasOwn(Events, e.event), `${c.id}: bus event ${e.event} not in Events`);
    }
  } else if (ch.kind === 'store') {
    check(typeof state[ch.action] === 'function', `${c.id}: store action ${ch.action} not a function on the store`);
  } else if (ch.kind === 'apply') {
    check(Actions[ch.type] === ch.type, `${c.id}: dispatch type ${ch.type} not exported from state/actions.js`);
  } else if (ch.kind === 'module') {
    const key = `${ch.module}#${ch.export}`;
    usedModuleKeys.add(key);
    check(typeof MODULE_CHANNELS[key] === 'function', `${c.id}: bridge has no module channel ${key}`);
    const file = path.join(SRC, ch.module);
    check(existsSync(file), `${c.id}: module file missing: ${ch.module}`);
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8');
      const re = new RegExp(`export\\s+(async\\s+)?(function|const|let|var)\\s+${ch.export}\\b`);
      check(re.test(text), `${c.id}: ${ch.export} not exported from ${ch.module}`);
    }
  } else if (ch.kind === 'recipe') {
    usedRecipes.add(ch.recipe);
    check(typeof RECIPES[ch.recipe] === 'function', `${c.id}: bridge has no recipe ${ch.recipe}`);
  }
}
for (const key of Object.keys(MODULE_CHANNELS))
  check(usedModuleKeys.has(key), `bridge module channel ${key} unused by the registry`);
for (const name of Object.keys(RECIPES)) check(usedRecipes.has(name), `bridge recipe ${name} unused by the registry`);

// ── reads resolve ─────────────────────────────────────────────────────────────
// A layout param key is real when any of the layout-modes tables knows it. Three keys
// are read-time-defaulted by design (the panels read them with a ?? fallback and they
// live outside every table — accumScan's exile is documented at layout-modes.js:124);
// each exempt key is pinned against the component that reads it that way.
const READ_DEFAULTED_KEYS = {
  riftShear: 'panels/layout/LayoutSliders.jsx',
  accumScan: 'panels/layout/AccumFamily.jsx',
  accumScanFlip: 'panels/layout/AccumFamily.jsx',
};
const isLayoutParamKey = (key) =>
  Object.hasOwn(DEFAULT_LAYOUT_PARAMS, key) ||
  Object.hasOwn(PARAM_SPEC, key) ||
  Object.hasOwn(PARAM_STOPS, key) ||
  Object.hasOwn(READ_DEFAULTED_KEYS, key);
for (const [key, file] of Object.entries(READ_DEFAULTED_KEYS)) {
  const text = readFileSync(path.join(SRC, file), 'utf8');
  check(text.includes(`'${key}'`) || text.includes(`.${key}`), `read-defaulted key ${key} not read in ${file}`);
}
for (const c of UI_CONTROLS) {
  for (const r of c.reads ?? []) {
    if (r.startsWith('module:')) {
      check(typeof MODULE_READS[r.slice('module:'.length)] === 'function', `${c.id}: no bridge module read for ${r}`);
      continue;
    }
    const [head, sub] = r.split('.');
    check(Object.hasOwn(state, head), `${c.id}: read head ${head} not a state key`);
    if (head === 'layoutParams' && sub) {
      check(isLayoutParamKey(sub), `${c.id}: layoutParams.${sub} unknown to the layout-modes tables`);
    }
    if (head === 'light' && sub) {
      check(Object.hasOwn(LIGHT_DEFAULT, sub), `${c.id}: light.${sub} not a key of LIGHT_DEFAULT (data/light.js)`);
    }
    if (head === 'beastSettings' && sub) {
      check(Object.hasOwn(state.beastSettings ?? {}, sub), `${c.id}: beastSettings.${sub} not in the initial state`);
      if (Object.hasOwn(BEAST_SETTING_RANGES, sub)) {
        const range = BEAST_SETTING_RANGES[sub];
        if (c.range) {
          check(
            c.range.min === range.min && c.range.max === range.max,
            `${c.id}: range ${c.range.min}..${c.range.max} != BEAST_SETTING_RANGES ${range.min}..${range.max}`,
          );
        }
      }
    }
  }
  // LAYOUT_PARAM literal keys must be real layout params too.
  const ch = c.channel;
  if (ch?.kind === 'bus') {
    for (const e of ch.emits ?? [ch]) {
      if (
        e.event === 'LAYOUT_PARAM' &&
        e.payload &&
        typeof e.payload.key === 'string' &&
        !e.payload.key.includes('$')
      ) {
        check(
          isLayoutParamKey(e.payload.key),
          `${c.id}: LAYOUT_PARAM key ${e.payload.key} unknown to the layout-modes tables`,
        );
      }
    }
  }
}

// ── lpRow stops / ranges vs the app's own tables ─────────────────────────────
// Every entry carrying `stops` is a BUILD layout-param row (lpRow). Its stops must
// equal PARAM_STOPS and its range must match PARAM_SPEC, with three documented
// exception classes, each pinned exactly rather than waived:
//   · LP_STOPS_NO_TABLE — riftShear is exiled from the stop table by design (it adds
//     no default layout key); its stops are a literal in its panel row, pinned here
//     against that literal, which must also appear in the source component.
//   · LP_RANGE_EDITOR_SPANS — PARAM_SPEC is the project-load trust boundary; the
//     registry range is the panel editor's span, which is narrower for two rows:
//     swarmCohesion's editor max is 0.6 (#272 retune, per the PARAM_STOPS comment)
//     and leaveFade's editor spans its usable 0..0.2. The span is pinned exactly
//     AND must live inside the spec bounds.
//   · LP_RANGE_NO_SPEC — the two keys with no PARAM_SPEC entry at all (accumScan's
//     exile is documented at layout-modes.js; riftShear likewise): panel span pinned.
const LP_STOPS_NO_TABLE = { riftShear: '[0, 0.25, 0.55, 1]' };
const LP_RANGE_EDITOR_SPANS = {
  swarmCohesion: { min: 0, max: 0.6 },
  leaveFade: { min: 0, max: 0.2 },
};
const LP_RANGE_NO_SPEC = {
  riftShear: { min: 0, max: 1 },
  accumScan: { min: 0, max: 1 },
};
for (const c of UI_CONTROLS) {
  if (!c.stops) continue;
  const ch = c.channel;
  const emit0 = ch?.kind === 'bus' ? (ch.emits ?? [ch])[0] : null;
  const key =
    emit0?.event === 'LAYOUT_PARAM' && typeof emit0.payload?.key === 'string' && !emit0.payload.key.includes('$')
      ? emit0.payload.key
      : null;
  check(key !== null, `${c.id}: carries stops but is not a literal LAYOUT_PARAM row — the stops pin cannot see it`);
  if (!key) continue;
  if (Object.hasOwn(PARAM_STOPS, key)) {
    check(
      JSON.stringify(c.stops) === JSON.stringify(PARAM_STOPS[key].stops),
      `${c.id}: stops ${JSON.stringify(c.stops)} != PARAM_STOPS.${key} ${JSON.stringify(PARAM_STOPS[key].stops)}`,
    );
  } else if (Object.hasOwn(LP_STOPS_NO_TABLE, key)) {
    check(
      JSON.stringify(c.stops) === JSON.stringify(JSON.parse(LP_STOPS_NO_TABLE[key])),
      `${c.id}: stops ${JSON.stringify(c.stops)} != the panel-literal stops pinned for ${key}`,
    );
    const text = readFileSync(path.join(SRC, c.source), 'utf8');
    check(
      text.includes(`stops={${LP_STOPS_NO_TABLE[key]}}`),
      `${c.id}: source ${c.source} does not carry the pinned stops literal for ${key}`,
    );
  } else {
    check(false, `${c.id}: stops for ${key} have no PARAM_STOPS entry and no pinned exception`);
  }
  check(!!c.range, `${c.id}: lpRow carries stops but no range`);
  if (c.range) {
    if (Object.hasOwn(LP_RANGE_NO_SPEC, key)) {
      const span = LP_RANGE_NO_SPEC[key];
      check(
        c.range.min === span.min && c.range.max === span.max,
        `${c.id}: range ${c.range.min}..${c.range.max} != the pinned no-spec span ${span.min}..${span.max} for ${key}`,
      );
    } else if (Object.hasOwn(PARAM_SPEC, key)) {
      const spec = PARAM_SPEC[key];
      check(
        c.range.min >= spec.min && c.range.max <= spec.max,
        `${c.id}: range ${c.range.min}..${c.range.max} escapes PARAM_SPEC.${key} ${spec.min}..${spec.max}`,
      );
      const span = LP_RANGE_EDITOR_SPANS[key] ?? spec;
      check(
        c.range.min === span.min && c.range.max === span.max,
        `${c.id}: range ${c.range.min}..${c.range.max} != ${LP_RANGE_EDITOR_SPANS[key] ? 'pinned editor span' : 'PARAM_SPEC.' + key} ${span.min}..${span.max}`,
      );
    } else {
      check(false, `${c.id}: range for ${key} has no PARAM_SPEC entry and no pinned exception`);
    }
  }
}

// ── imported option lists equal their module exports ─────────────────────────
// The registry imports these; the pin catches a future re-literalization that drifts.
check(
  JSON.stringify(controlById('directors.motion')?.options) === JSON.stringify(KINEME_PATTERNS),
  'directors.motion options != KINEME_PATTERNS (engine/kineme.js)',
);
check(
  JSON.stringify(controlById('directors.doctrine')?.options) === JSON.stringify(DOCTRINE_IDS),
  'directors.doctrine options != DOCTRINE_IDS (curator/doctrines.mjs)',
);

// ── state() allowlist: exactly the registered read surface ───────────────────
{
  const expected = new Set([
    ...UI_CONTROLS.flatMap((c) => c.reads ?? []),
    ...Object.keys(MODULE_READS).map((k) => `module:${k}`),
  ]);
  check(
    STATE_READ_PATHS.length === expected.size,
    `STATE_READ_PATHS has ${STATE_READ_PATHS.length} paths, registry read surface has ${expected.size}`,
  );
  for (const p of STATE_READ_PATHS) check(expected.has(p), `STATE_READ_PATHS names unregistered path ${p}`);
  for (const p of expected) check(STATE_READ_PATHS.includes(p), `registered read ${p} missing from STATE_READ_PATHS`);
  const snap = stateSnapshot();
  check(
    JSON.stringify(Object.keys(snap).sort()) === JSON.stringify([...STATE_READ_PATHS]),
    'state() with no keys must return exactly the registered read paths',
  );
  check(
    JSON.stringify(Object.keys(stateSnapshot(['layers']))) === JSON.stringify(['layers']),
    "state(['layers']) must return only the layers path",
  );
  // The overreach QA flagged, refused by name: whole-store keys no control reads.
  for (const bad of ['shelfDiskRoot', 'keeps', 'historyUndoStack', 'midiMap', 'layoutParams.nope', 'light.xNope']) {
    const r = stateSnapshot([bad]);
    check(r && r.ok === false, `state() must refuse unregistered key ${bad}`);
  }
}

// ── source pins: the component exists and names the channel literal ──────────
// A few controls build their emit key dynamically (template keys, `${name}Fade`);
// their pin literal is the stable fragment the source actually contains.
const PIN_OVERRIDES = {
  'build.tunnel-fade': 'tunnel',
  'build.prism-fade': 'prism',
  'build.flow-fade': 'flow',
  'directors.behave-override': 'behave',
};
function pinLiteral(c) {
  if (PIN_OVERRIDES[c.id]) return PIN_OVERRIDES[c.id];
  const ch = c.channel;
  if (!ch) return null;
  if (ch.kind === 'bus') {
    const first = (ch.emits ?? [ch])[0];
    return `Events.${first.event}`;
  }
  if (ch.kind === 'store') return ch.action;
  if (ch.kind === 'apply') return ch.type;
  if (ch.kind === 'module') return ch.export;
  return null; // recipes: bridge-side, pinned above
}
for (const c of UI_CONTROLS) {
  if (!c.source) {
    failures.push(`${c.id}: no source component named`);
    continue;
  }
  const file = path.join(SRC, c.source);
  check(existsSync(file), `${c.id}: source missing: ${c.source}`);
  if (!existsSync(file)) continue;
  const literal = pinLiteral(c);
  if (literal) {
    const text = readFileSync(file, 'utf8');
    check(text.includes(literal), `${c.id}: source ${c.source} does not name ${literal}`);
  }
}

if (failures.length > 0) {
  console.error(`uiRegistry.selfcheck: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `uiRegistry.selfcheck: OK — ${UI_CONTROLS.length} controls, ${PANELS.length} panels, manifest correspondence + channels + reads + sources pinned`,
);
