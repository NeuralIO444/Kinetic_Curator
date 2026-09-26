// devPanel.selfcheck.mjs — registry shape gate for the merged DEV panel (#691).
//
// Node-only. PanelRegistry.js can't be imported in Node (import.meta.env is
// undefined there), so the registry half asserts on source text; the tab
// half imports devTabs.mjs, which is node-safe because lazy() defers the
// dynamic imports (nothing loads a panel chunk until its tab renders).
//
// What it proves:
//  A. PanelRegistry has exactly one DEV registration — id 'dev', still gated
//     behind import.meta.env.DEV (prod never registers it);
//  B. no stale 'shaderlab' / 'xray' / 'govtune' registrations remain;
//  C. devTabs exposes exactly three tabs, in the #691 order (X-Ray /
//     Gov Tune / Shader Lab), each a React.lazy component — i.e. one lazy
//     chunk per tab, loaded only when its tab opens.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_TABS } from '../panels/devTabs.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const registrySrc = readFileSync(join(APP, 'src/composition/PanelRegistry.js'), 'utf8');

// A. exactly one DEV registration, id 'dev', DEV-gated.
const pushed = [...registrySrc.matchAll(/PANEL_REGISTRY\.push\(\s*\{\s*id:\s*'([^']+)'/g)]
  .map((m) => m[1]);
assert.deepStrictEqual(pushed, ['dev'],
  `registry must push exactly one dev entry (id 'dev'), got: ${JSON.stringify(pushed)}`);
assert.ok(/import\.meta\.env\.DEV && DevPanel/.test(registrySrc),
  'the dev registration must stay gated behind import.meta.env.DEV');

// B. the three old ids are gone from the registry.
for (const dead of ['shaderlab', 'xray', 'govtune']) {
  assert.ok(!new RegExp(`id:\\s*'${dead}'`).test(registrySrc),
    `stale '${dead}' registration must not remain in the registry`);
}

// C. three tabs in the #691 order, each a React.lazy component.
assert.deepStrictEqual(DEV_TABS.map((t) => t.id), ['xray', 'govtune', 'shaderlab'],
  `DEV_TABS must be X-Ray / Gov Tune / Shader Lab, got: ${JSON.stringify(DEV_TABS.map((t) => t.id))}`);
for (const t of DEV_TABS) {
  assert.ok(t.component?.$$typeof === Symbol.for('react.lazy'),
    `tab '${t.id}' must be a React.lazy component (one chunk per tab)`);
}

console.log('[selfcheck] dev panel OK — one DEV registry entry (DEV-gated); three lazy tabs; no stale dev ids');
