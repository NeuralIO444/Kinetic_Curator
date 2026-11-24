// agentUi/uiRegistry.selfcheck.mjs — issue 2509.
// Pins the agent UI registry so the shipped manifest cannot silently drift:
//   · the registry is well-formed (UI_PROBLEMS) and covers the ruled panel list;
//   · the manifest is exactly the registry's JSON form (round-trip + per-control equality);
//   · every channel names something real — a bus event in Events, a store action on the
//     live store, a dispatch type in state/actions.js, a module export that exists in
//     its file AND in the bridge's channel table, a recipe the bridge implements;
//   · every read path resolves against the live store's state keys (layoutParams keys
//     against DEFAULT_LAYOUT_PARAMS, beastSettings keys against the initial state);
//   · every entry's source component exists and names the channel's own literal
//     (Events.<NAME> / the store action / the dispatch type / the module export) —
//     the registry describes the UI as built, not as imagined.
// Run: node src/agentUi/uiRegistry.selfcheck.mjs

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT_UI_SCHEMA, PANELS, UI_CONTROLS, UI_PROBLEMS, buildManifest, controlById } from './uiRegistry.mjs';
import { MODULE_CHANNELS, MODULE_READS, RECIPES } from './uiBridge.mjs';
import { Events } from '../composition/eventBus.js';
import * as Actions from '../state/actions.js';
import { useStore } from '../state/store.js';
import { DEFAULT_LAYOUT_PARAMS, PARAM_SPEC, PARAM_STOPS } from '../data/layout-modes.js';
import { BEAST_SETTING_RANGES } from '../engine/beastSettings.mjs';

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
