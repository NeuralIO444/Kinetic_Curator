// devPanel.selfcheck.mjs — registry shape gate for the merged DEV panel (#691).
//
// Node-only. PanelRegistry.js can't be imported in Node (import.meta.env is
// undefined there), so the registry half asserts on source text; the tab
// half imports devTabs.mjs, which is node-safe because lazy() defers the
// dynamic imports (nothing loads a panel chunk until its tab renders);
// the preference half imports devMode.mjs, which is node-safe because its
// storage read fails closed to OFF.
//
// What it proves:
//  A. PanelRegistry has exactly one DEV registration — id 'dev', gated by
//     the RUNTIME gate (#2077): dev build OR Dev mode on. The panel chunk
//     is an unconditional lazy() — no compile-time ternary to null;
//  B. no stale 'shaderlab' / 'xray' / 'govtune' registrations remain;
//  C. devTabs exposes exactly eleven tabs, in order (X-Ray / Gov Tune /
//     Shader Lab per #691, then Biology per #793, Units, Kernel per #1233,
//     Mind per #1464, Census, Taste, Shelf, MegaMind), each a React.lazy
//     component — i.e. one lazy chunk per tab, loaded only when its tab
//     opens;
//  D. the Dev mode preference itself: OFF by default, flips in memory,
//     notifies its listeners, and the Settings tab's toggle is wired to
//     the same module the registry reads (no second prefs store).
//
// #2077 (Matt's ruling, 2026-11-10) — the gate reversal, on record: this
// suite used to pin the opposite ("the dev registration must stay gated
// behind import.meta.env.DEV", prod never registers it — the #691 design
// decision). The ruling reverses it so MegaMind's ruled home (dev panel
// first, #1525) is reachable in the shipped app: registration is now the
// runtime decision pinned in A. The mitigations are the ones Matt chose:
// off by default, honestly named, one deliberate toggle in Settings. The
// sharp tools inside the panel are the accepted cost. Do not "restore"
// the compile-time gate without a ruling that supersedes #2077.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_TABS } from '../panels/devTabs.mjs';
import { DEV_MODE_KEY, devModeOn, onDevModeChange, setDevMode } from './devMode.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const registrySrc = readFileSync(join(APP, 'src/composition/PanelRegistry.js'), 'utf8');

// A. exactly one DEV registration, id 'dev', behind the #2077 runtime gate.
const pushed = [...registrySrc.matchAll(/PANEL_REGISTRY\.push\(\s*\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]);
assert.deepStrictEqual(
  pushed,
  ['dev'],
  `registry must push exactly one dev entry (id 'dev'), got: ${JSON.stringify(pushed)}`,
);
assert.ok(
  /import\.meta\.env\.DEV \|\| devModeOn\(\)/.test(registrySrc),
  'the dev gate must be runtime: dev build OR the Dev mode preference (#2077)',
);
assert.ok(
  /p\.id !== 'dev' \|\| devPanelAvailable\(\)/.test(registrySrc),
  'panelsByZone must withhold the dev entry until the runtime gate passes (#2077)',
);
assert.ok(
  !/import\.meta\.env\.DEV\s*\?/.test(registrySrc) && !/DevPanel\s*=\s*null/.test(registrySrc),
  'the DevPanel chunk must be an unconditional lazy() — a compile-time null would leave release builds no chunk to load (#2077)',
);

// B. the three old ids are gone from the registry.
for (const dead of ['shaderlab', 'xray', 'govtune']) {
  assert.ok(
    !new RegExp(`id:\\s*'${dead}'`).test(registrySrc),
    `stale '${dead}' registration must not remain in the registry`,
  );
}

// C. the tabs in order — #691's three plus Biology (#793), Units, then
// Kernel (#1233), Mind (#1464), Census (#1507), Taste Trees (XGBoost
// T3), Shelf (#1590), and MegaMind (#1525) — each a React.lazy component.
assert.deepStrictEqual(
  DEV_TABS.map((t) => t.id),
  ['xray', 'govtune', 'shaderlab', 'biology', 'units', 'kernel', 'mind', 'census', 'taste', 'shelf', 'megamind'],
  `DEV_TABS must be X-Ray / Gov Tune / Shader Lab / Biology / Units / Kernel / Mind / Census (#1507) / Taste (XGBoost T3) / Shelf (#1590) / MegaMind (#1525), got: ${JSON.stringify(DEV_TABS.map((t) => t.id))}`,
);
for (const t of DEV_TABS) {
  assert.ok(
    t.component?.$$typeof === Symbol.for('react.lazy'),
    `tab '${t.id}' must be a React.lazy component (one chunk per tab)`,
  );
}

// D. the preference: OFF by default (Node has no localStorage, and the
// read fails closed), flips notify listeners, and the Settings toggle in
// HotkeyOverlay is bound to this same module — one store, read by the
// registry and written by the toggle.
assert.equal(DEV_MODE_KEY, 'kc:dev-mode:v1', 'the Dev mode preference key');
assert.equal(devModeOn(), false, 'Dev mode defaults OFF');
let flips = 0;
const off = onDevModeChange(() => flips++);
assert.equal(setDevMode(true), true, 'setDevMode(true) turns Dev mode on');
assert.equal(devModeOn(), true, 'Dev mode reads on after the flip');
assert.equal(setDevMode(false), false, 'setDevMode(false) turns Dev mode off');
assert.equal(devModeOn(), false, 'Dev mode reads off after the flip back');
assert.equal(flips, 2, 'each flip notifies listeners exactly once (the Shell re-renders on it)');
off();
const overlaySrc = readFileSync(join(APP, 'src/components/HotkeyOverlay.jsx'), 'utf8');
assert.ok(
  overlaySrc.includes("from '../composition/devMode.mjs'") && overlaySrc.includes('setDevMode('),
  'the Settings tab toggle must write through devMode.mjs — the same store the registry reads',
);
const shellSrc = readFileSync(join(APP, 'src/composition/Shell.jsx'), 'utf8');
assert.ok(
  shellSrc.includes('onDevModeChange') && shellSrc.includes('useSyncExternalStore'),
  'the Shell must subscribe to Dev mode flips so the tab strip updates without a reload',
);

console.log(
  `[selfcheck] dev panel OK — one DEV registry entry (runtime gate #2077: dev build or Dev mode on); ${DEV_TABS.length} lazy tabs; Dev mode defaults off and notifies; no stale dev ids`,
);
