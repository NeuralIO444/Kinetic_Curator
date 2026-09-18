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

import { HELP_TOPICS, HELP_SHORTCUTS } from './helpCopy.js';

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

console.log('helpCopy.selfcheck OK');
