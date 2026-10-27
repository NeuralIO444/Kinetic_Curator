// node src/loot/lootAudio.selfcheck.mjs
// #1479 slice 8 — audio from the loot folder: judged by bytes not names; weird files refused with a reason, never thrown.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sniffAudio, checkAudio, takeInAudio, audioChoices, loadAudio, MAX_AUDIO_BYTES } from './lootAudio.mjs';
import { emptyIndex, withRoot, applyPlan } from './lootIndex.mjs';
import { planScan } from './lootScan.mjs';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const ascii = (s, len = 64) => {
  const b = new Uint8Array(len);
  [...s].forEach((c, i) => {
    b[i] = c.charCodeAt(0);
  });
  return b;
};
const wav = () => {
  const b = ascii('RIFF', 64);
  b.set(ascii('WAVE', 4), 8);
  return b;
};
const aiff = () => {
  const b = ascii('FORM', 64);
  b.set(ascii('AIFF', 4), 8);
  return b;
};
const mp3 = () => ascii('ID3', 64);
const NOW = 7_000_000;
const OLD = NOW - 90_000;

function world(files) {
  const native = {
    read: async (_r, rel) => (files[rel] ? { ok: true, bytes: files[rel] } : { ok: false, reason: 'gone' }),
  };
  const entries = Object.entries(files).map(([rel, b]) => ({
    rel,
    size: b.length,
    mtimeMs: OLD,
    hash: createHash('sha256').update(rel).digest('hex'),
  }));
  const { index } = applyPlan(withRoot(emptyIndex(), '/L'), planScan({ entries, prev: null, nowMs: NOW }), {
    nowMs: NOW,
  });
  return { native, index };
}

await ok('sniff is by bytes: wav, aiff, mp3 (ID3 and frame sync); text is null', () => {
  assert.equal(sniffAudio(wav()), 'wav');
  assert.equal(sniffAudio(aiff()), 'aiff');
  assert.equal(sniffAudio(mp3()), 'mp3');
  const f = new Uint8Array(64);
  f[0] = 0xff;
  f[1] = 0xfb;
  assert.equal(sniffAudio(f), 'mp3');
  assert.equal(sniffAudio(ascii('hello, I am a text file')), null);
  assert.equal(sniffAudio(null), null);
});

await ok('weird files: text named .wav, zero-byte, truncated, huge are refused with a reason', async () => {
  assert.match(checkAudio(ascii('not audio at all, just text')).reason, /not an audio/);
  assert.match(checkAudio(new Uint8Array(0)).reason, /empty/);
  assert.match(checkAudio(wav().slice(0, 20)).reason, /too short/);
  assert.match(checkAudio({ length: MAX_AUDIO_BYTES + 1 }).reason, /too big/);
});

const files = {
  'audio/kick.wav': wav(),
  'audio/pad.mp3': mp3(),
  'audio/fake.wav': ascii('this is text'),
  'audio/empty.wav': new Uint8Array(0),
  'audio/cut.aif': aiff().slice(0, 20),
};

await ok('a scan takes the good, holds the bad with reasons, and is not retried', async () => {
  const w = world(files);
  const r = await takeInAudio({ native: w.native, index: w.index });
  assert.deepEqual(r.summary, { taken: 2, rejected: 3, unreadable: 0 });
  assert.deepEqual(
    audioChoices(r.index).map((c) => c.name),
    ['kick.wav', 'pad.mp3'],
  );
  const again = await takeInAudio({ native: w.native, index: r.index });
  assert.deepEqual(again.summary, { taken: 0, rejected: 0, unreadable: 0 });
});

await ok('loadAudio re-checks the bytes, makes a blob url, and refuses a file that changed or vanished', async () => {
  const w = world(files);
  const { index } = await takeInAudio({ native: w.native, index: w.index });
  const id = audioChoices(index)[0].id;
  const made = [];
  const good = await loadAudio({
    native: w.native,
    index,
    id,
    makeUrl: (b, m) => {
      made.push(m);
      return 'blob:x';
    },
  });
  assert.deepEqual([good.ok, good.url, good.name, made[0]], [true, 'blob:x', 'kick.wav', 'audio/wav']);
  files['audio/kick.wav'] = ascii('now text');
  assert.match((await loadAudio({ native: w.native, index, id, makeUrl: () => 'u' })).reason, /not an audio/);
  delete files['audio/kick.wav'];
  assert.match((await loadAudio({ native: w.native, index, id, makeUrl: () => 'u' })).reason, /unreadable/);
  assert.equal((await loadAudio({ native: w.native, index, id: 'nope', makeUrl: () => 'u' })).ok, false);
});

console.log(`lootAudio.selfcheck: ${n} checks passed`);
