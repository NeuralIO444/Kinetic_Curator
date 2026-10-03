import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  confirmReplaceMessage, loadedMessage, exportSavedMessage, exportFilename,
  nextExportFilename, nextTitleVersion, titleSlug,
  missingPaletteMessage, rememberRecent, readRecent, dirtyMessage, shouldExportOnKey,
} from './pipelineNotices.mjs';

test('#647 import confirms before replace', () => {
  assert.match(confirmReplaceMessage(), /replaces the current piece/);
});

test('#630 #646 loaded message names the file, seed, tracks, palette', () => {
  const doc = { seed: 12345, layers: [{}, {}], paletteId: 'praystation' };
  const msg = loadedMessage('dusk.json', doc);
  assert.match(msg, /dusk\.json/);
  assert.match(msg, /seed 12345/);
  assert.match(msg, /2 tracks/);
  assert.match(msg, /praystation/);
  assert.match(loadedMessage('a.json', { title: 'Dusk Flock', seed: 1, layers: [{}], paletteId: 'bone' }), /Dusk Flock/);
});

test('#646 sanitized count shown only when repairs happened', () => {
  const doc = { seed: 7, layers: [], paletteId: 'praystation' };
  assert.doesNotMatch(loadedMessage('c.json', doc, 0), /sanitized/);
  assert.doesNotMatch(loadedMessage('c.json', doc), /sanitized/);
  assert.match(loadedMessage('h.json', doc, 1), /1 field sanitized/);
  assert.match(loadedMessage('h.json', doc, 3), /3 fields sanitized/);
});

test('#649 #651 export names the title and confirms', () => {
  const name = exportFilename({ title: 'Night Migration', seed: 16 }, 3);
  assert.equal(name, 'night-migration-v3-10.project.json');
  assert.equal(exportSavedMessage(name), 'Saved night-migration-v3-10.project.json');
  assert.match(exportFilename({ seed: 255 }), /^kinetic-curator-ff\.project\.json$/);
});

test('#651 title slug + per-title version counter', () => {
  assert.equal(titleSlug('  Night Migration!! '), 'night-migration');
  assert.equal(titleSlug(''), '');
  assert.equal(titleSlug(null), '');
  const mem = new Map();
  const store = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
  };
  assert.equal(nextTitleVersion('dusk', store), 1);
  assert.equal(nextTitleVersion('dusk', store), 2);
  assert.equal(nextTitleVersion('dawn', store), 1);
  assert.equal(nextExportFilename({ title: 'Dusk', seed: 16 }, store), 'dusk-v3-10.project.json');
  // untitled keeps the seed naming, no version
  assert.match(nextExportFilename({ seed: 255 }, store), /^kinetic-curator-ff\.project\.json$/);
});

test('#650 missing user palette warns', () => {
  assert.equal(missingPaletteMessage({ paletteId: 'bone' }, []), null);
  assert.match(missingPaletteMessage({ paletteId: 'user:mine' }, []), /Missing palette/);
  assert.equal(missingPaletteMessage({ paletteId: 'user:mine' }, [{ id: 'mine' }]), null);
});

test('#653 recent files cap at 5, newest first', () => {
  const mem = new Map();
  const store = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
  };
  for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) rememberRecent(n, store);
  assert.deepEqual(readRecent(store), ['f', 'e', 'd', 'c', 'b']);
});

test('#648 dirty when live payload differs', () => {
  assert.equal(dirtyMessage(null, 'live'), null);
  assert.equal(dirtyMessage('same', 'same'), null);
  assert.match(dirtyMessage('old', 'live'), /behind/);
});

test('#652 X exports, E stays Evolve', () => {
  assert.equal(shouldExportOnKey({ key: 'x' }), true);
  assert.equal(shouldExportOnKey({ key: 'e' }), false);
  assert.equal(shouldExportOnKey({ key: 'x', target: { tagName: 'INPUT' } }), false);
  assert.equal(shouldExportOnKey({ key: 'x', metaKey: true }), false);
});
