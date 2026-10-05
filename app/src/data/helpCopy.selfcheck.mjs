// helpCopy.selfcheck.mjs — #222 tour + #158 hover-help map invariants.
//
// Node-only: the ? overlay and hover titles must read from the one
// helpCopy.js map so the two can never drift; the 4-step tour's steps
// must reference real panel tabs; the wiring (tour entry points, the
// `? help` footer hint) must be present in the components.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');

function read(rel) {
  return readFileSync(join(src, rel), 'utf8');
}

import { HELP_TOPICS, HELP_SHORTCUTS, helpText } from './helpCopy.js';

// ── 1. The map itself: unique ids, every field a non-empty sentence ──
{
  const ids = HELP_TOPICS.map((t) => t.id);
  assert.deepStrictEqual([...new Set(ids)], ids, 'HELP_TOPICS ids must be unique');
  for (const t of HELP_TOPICS) {
    for (const k of ['id', 'group', 'title', 'text']) {
      assert.ok(typeof t[k] === 'string' && t[k].trim().length > 0,
        `HELP_TOPICS entry missing ${k}: ${JSON.stringify(t)}`);
    }
  }
  assert.ok(HELP_SHORTCUTS.length > 0, 'HELP_SHORTCUTS must not be empty');
  console.log(`help topics: ${HELP_TOPICS.length}, shortcuts: ${HELP_SHORTCUTS.length}`);
}

// ── 2. #158: webm copy is honest about ACCUM (matches the REC WEBM title) ──
{
  const webm = HELP_TOPICS.find((t) => t.id === 'output-webm');
  assert.ok(webm, 'output-webm topic must exist');
  assert.ok(/ACCUM/i.test(webm.text),
    'output-webm must say what it records — the old "does not sample the ACCUM buffer" copy was stale');
}

// ── 3. #222: the tour is exactly 4 steps, each with id/title/body,
//            and every referenced tab exists in the panel registry ──
{
  const tourSrc = read('data/tour.js');
  const registrySrc = read('composition/PanelRegistry.js');
  const registryIds = [...registrySrc.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);

  const stepTitles = [...tourSrc.matchAll(/title:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.strictEqual(stepTitles.length, 4,
    `tour must have exactly 4 steps (found ${stepTitles.length})`);
  const stepBodies = [...tourSrc.matchAll(/body:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.strictEqual(stepBodies.length, 4, 'each tour step needs a body sentence');
  const stepIds = [...tourSrc.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual([...new Set(stepIds)], stepIds, 'tour step ids must be unique');

  const stepTabs = [...tourSrc.matchAll(/tab:\s*'([^']+)'/g)].map((m) => m[1]);
  for (const tab of stepTabs) {
    assert.ok(registryIds.includes(tab),
      `tour step references tab '${tab}' which is not in PanelRegistry`);
  }
  assert.ok(tourSrc.includes("TOUR_STORAGE_KEY = 'kc:tour-seen'"),
    'tour must persist kc:tour-seen');

  // The overlay renders the data module, not its own copy.
  const overlaySrc = read('components/TourOverlay.jsx');
  assert.ok(overlaySrc.includes("from '../data/tour.js'"),
    'TourOverlay must render the tour.js data module');
  console.log(`tour steps: ${stepTitles.length}, tabs hit: ${[...new Set(stepTabs)].join(', ')}`);
}

// ── 4. Wiring: entry points and the `? help` footer hint ──
{
  const appSrc = read('App.jsx');
  assert.ok(appSrc.includes("import { TourOverlay } from './components/TourOverlay.jsx'"),
    'App.jsx must import TourOverlay');
  assert.ok(appSrc.includes('<TourOverlay'), 'App.jsx must render TourOverlay');
  assert.ok(appSrc.includes('onTour={() => setTourOpen(true)}'),
    'FirstRunOverlay must get the tour entry');
  // The footer's '?' is the single help entry (the tray's '? help' was removed 2026-09-18 as a duplicate).
  assert.ok(appSrc.includes('title="Help"'),
    'footer needs the single `?` help entry');

  const firstRunSrc = read('components/FirstRunOverlay.jsx');
  assert.ok(firstRunSrc.includes('TAKE THE TOUR'), 'first-run card needs a tour button');

  const hotkeySrc = read('components/HotkeyOverlay.jsx');
  assert.ok(hotkeySrc.includes('Replay the tour'), '? overlay needs a tour replay button');
  assert.ok(hotkeySrc.includes("from '../data/helpCopy.js'"),
    '? overlay must read the single helpCopy.js map');

  const traySrc = read('components/FavoritesTray.jsx');
  assert.ok(!traySrc.includes('? help'), 'tray must not duplicate the footer `?` help entry');

  const masterSrc = read('components/MasterBar.jsx');
  assert.ok(masterSrc.includes("title={running ? 'Live loop is running"),
    'LIVE/PAUSED pill needs a one-line title');
  console.log('wiring: App / FirstRun / Hotkey / Tray / MasterBar all present');
}

// ── 5. #158 remainder: hover titles read the single map via helpText ──
{
  assert.strictEqual(typeof helpText, 'function', 'helpCopy.js must export helpText(id)');
  for (const id of ['layout-accum', 'output-webm', 'davis-clear', 'layers-blend']) {
    assert.ok(helpText(id).length > 0, `helpText('${id}') must resolve to a sentence`);
  }
  assert.strictEqual(helpText('no-such-id'), '', 'helpText on unknown id must be empty, not throw');
  // The four remaining areas from the issue wire their hover titles through
  // the map, so hover and the `?` overlay cannot drift.
  const wired = {
    'panels/layout/AccumFamily.jsx': 'layout-accum',
    'panels/pipeline/SnapRecordRow.jsx': 'output-webm',
    'components/MasterBar.jsx': 'output-webm',
    'panels/build/LayerStack.jsx': 'layers-blend',
    'panels/DavisPanel.jsx': 'davis-clear',
  };
  for (const [file, id] of Object.entries(wired)) {
    const s = read(file);
    assert.ok(s.includes("from '../../data/helpCopy.js'") || s.includes("from '../data/helpCopy.js'"),
      `${file} must import from the single helpCopy.js map`);
    assert.ok(s.includes('helpText('), `${file} must read hover titles via helpText()`);
    assert.ok(s.includes(`helpText('${id}')`), `${file} must wire helpText('${id}')`);
  }
  console.log('single-source hover titles: 5 components wired');
}

// ── 6. #535: group names match panel titles; tour-derived copy can't drift ──
{
  // Every help group must be a real panel title (case-insensitive) or one of
  // the two sanctioned chrome groups (Master = top bar, Help = ? overlay) —
  // so a panel rename/move fails loudly instead of orphaning copy.
  const registrySrc = read('composition/PanelRegistry.js');
  const panelTitles = new Set(
    [...registrySrc.matchAll(/title:\s*'([^']+)'/g)].map((m) => m[1].toUpperCase())
  );
  const chrome = new Set(['MASTER', 'HELP']);
  for (const t of HELP_TOPICS) {
    const g = t.group.toUpperCase();
    assert.ok(panelTitles.has(g) || chrome.has(g),
      `help group '${t.group}' (${t.id}) matches no panel title — rename the group or the panel`);
  }
  console.log(`help groups: ${new Set(HELP_TOPICS.map((t) => t.group)).size} all placed`);

  // The help-tour text is generated from TOUR_STEPS, never hardcoded.
  const helpSrc = read('data/helpCopy.js');
  assert.ok(/from '\.\/tour\.js'/.test(helpSrc),
    'helpCopy.js must import the tour data module for derived copy');
  const { TOUR_STEPS } = await import('./tour.js');
  const helpTour = HELP_TOPICS.find((t) => t.id === 'help-tour');
  assert.ok(helpTour, 'help-tour topic must exist');
  for (const s of TOUR_STEPS) {
    assert.ok(helpTour.text.includes(s.id),
      `help-tour text must name tour step '${s.id}' — it is generated from TOUR_STEPS`);
  }
  assert.ok(helpTour.text.includes(String(TOUR_STEPS.length)),
    'help-tour text must carry the live step count');

  // The first-run tooltip is generated from TOUR_STEPS, never hardcoded.
  const firstRunSrc = read('components/FirstRunOverlay.jsx');
  assert.ok(/from '\.\.\/data\/tour\.js'/.test(firstRunSrc),
    'FirstRunOverlay must import the tour data module for its tooltip');

  // Tour bodies + help texts must not name retired tabs: these are the names
  // that actually went stale before (#535) — OUTPUT→PIPELINE (#542),
  // DAVIS→DIRECTOR (#830), LAYOUT/LAYERS→BUILD (#443/#445), GHOST retired.
  // A denylist (not an ALLCAPS scan) so file formats like PNG don't trip it.
  const staleNames = ['OUTPUT', 'DAVIS', 'LAYOUT', 'LAYERS', 'GHOST'];
  const tourBodies = [...read('data/tour.js').matchAll(/body:\s*'([^']+)'/g)].map((m) => m[1]);
  const copyBlobs = [
    ...tourBodies,
    ...HELP_TOPICS.map((t) => `${t.group} ${t.title} ${t.text}`),
  ];
  for (const blob of copyBlobs) {
    for (const stale of staleNames) {
      assert.ok(!new RegExp(`\\b${stale}\\b`).test(blob),
        `copy names retired tab '${stale}' — re-aim it: ${blob.slice(0, 60)}…`);
    }
  }
  console.log('tour-derived copy: help-tour + first-run tooltip generated, bodies name real tabs');
}

console.log('helpCopy.selfcheck OK');