import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  confirmReplaceMessage, loadedMessage, exportSavedMessage, exportFilename,
  missingPaletteMessage, rememberRecent, readRecent, dirtyMessage, shouldExportOnKey,
} from './pipelineNotices.mjs';

test('#647 import confirms before replace', () => {
  assert.match(confirmReplaceMessage(), /replaces the current piece/);
});

test('#630 #646 loaded message names the file and the tracks', () => {
  assert.equal(loadedMessage('dusk.json', { layers: [{}, {}] }), 'Loaded dusk.json · 2 tracks');
  assert.match(loadedMessage('a.json', { title: 'Dusk Flock', layers: [{}] }), /Dusk Flock/);
});

test('#649 #651 export names the title and confirms', () => {
  const name = exportFilename({ title: 'Night Migration', seed: 16 });
  assert.equal(name, 'night-migration.project.json');
  assert.equal(exportSavedMessage(name), 'Saved night-migration.project.json');
  assert.match(exportFilename({ seed: 255 }), /ff/);
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
