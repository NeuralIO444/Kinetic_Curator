// labelCase.selfcheck.mjs — #536 TE micro-label lowercase & chip-identity invariants.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');

function read(rel) {
  return readFileSync(join(src, rel), 'utf8');
}

import { HELP_TOPICS, HELP_SHORTCUTS } from './helpCopy.js';

// ── 1. HELP_TOPICS titles are lowercase (#536 Tier-1) ──
{
  for (const t of HELP_TOPICS) {
    assert.strictEqual(
      t.title,
      t.title.toLowerCase(),
      `HELP_TOPICS entry '${t.id}' title '${t.title}' must be lowercase in accordance with #536`
    );
  }
  console.log(`[ok] all ${HELP_TOPICS.length} HELP_TOPICS titles are lowercase`);
}

// ── 2. PanelRegistry icon collision resolved (PLAY !== DAVIS) ──
{
  const registrySrc = read('composition/PanelRegistry.js');
  const panelEntries = [...registrySrc.matchAll(/\{\s*id:\s*'([^']+)',\s*title:\s*'([^']+)',\s*icon:\s*'([^']+)'/g)]
    .map(([, id, title, icon]) => ({ id, title, icon }));

  const icons = panelEntries.map((p) => p.icon);
  const iconSet = new Set(icons);
  assert.strictEqual(
    iconSet.size,
    icons.length,
    `PANEL_REGISTRY icons must be unique across all registered panels: found duplicate in ${JSON.stringify(icons)}`
  );

  const davis = panelEntries.find((p) => p.id === 'davis');
  const play = panelEntries.find((p) => p.id === 'play');
  assert.ok(davis && play, 'both davis and play must be registered in PanelRegistry');
  assert.notStrictEqual(
    davis.icon,
    play.icon,
    `PLAY icon (${play.icon}) must not collide with DAVIS icon (${davis.icon})`
  );
  console.log(`[ok] panel icons are unique; PLAY (${play.icon}) vs DAVIS (${davis.icon}) collision resolved`);

  // ── 3. Uppercase Allowlist Invariant: Panels stay uppercase ──
  const ALLOWED_UPPERCASE_PANELS = new Set([
    'CANVAS', 'BUILD', 'ASSETS', 'STIMULI', 'DAVIS', 'PLAY', 'PIPELINE',
    'SHADER LAB', 'X-RAY', 'GOV TUNE',
  ]);
  for (const p of panelEntries) {
    assert.ok(
      ALLOWED_UPPERCASE_PANELS.has(p.title),
      `Panel title '${p.title}' is not in the allowed uppercase set`
    );
  }

  for (const s of HELP_SHORTCUTS) {
    assert.ok(
      typeof s.key === 'string' && s.key.length > 0,
      `Shortcut key '${s.key}' must be valid`
    );
  }
  console.log('[ok] uppercase allowlist verified for panels and shortcut keys');
}

// ── 4. CSS Micro-Label Transforms: meters and readouts are lowercase ──
{
  const panelsCss = read('styles/panels.css');
  const controlsCss = read('styles/controls.css');

  assert.ok(
    /\.meter-pill\s*\{[^}]*text-transform:\s*lowercase/s.test(panelsCss),
    'panels.css must define text-transform: lowercase on .meter-pill'
  );
  assert.ok(
    /\.stim-meter-label\s*\{[^}]*text-transform:\s*lowercase/s.test(panelsCss),
    'panels.css must define text-transform: lowercase on .stim-meter-label'
  );
  assert.ok(
    /\.davis-label\s*\{[^}]*text-transform:\s*lowercase/s.test(panelsCss),
    'panels.css must define text-transform: lowercase on .davis-label'
  );
  assert.ok(
    /\.fx-param label\s*\{[^}]*text-transform:\s*lowercase/s.test(panelsCss),
    'panels.css must define text-transform: lowercase on .fx-param label'
  );
  assert.ok(
    /\.randomize-hint\s*\{[^}]*text-transform:\s*lowercase/s.test(controlsCss),
    'controls.css must define text-transform: lowercase on .randomize-hint'
  );
  assert.ok(
    /\.chip-btn\.chip-behave\s*\{[^}]*border-radius:\s*9999px/s.test(panelsCss),
    'panels.css must define pill shape for .chip-btn.chip-behave'
  );

  console.log('[ok] CSS micro-label transforms and chip identities verified');
}

console.log('labelCase.selfcheck OK');
