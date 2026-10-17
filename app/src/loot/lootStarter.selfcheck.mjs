// node src/loot/lootStarter.selfcheck.mjs
// #1479 slice 5c — the starter-folder zip: read back with our own reader (central directory, CRC) and, where the system
// has one, with the real unzip, so what a Safari or Firefox user downloads is a genuinely valid archive.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, zipStore, starterFiles, starterZip, STARTER_NOTE, STARTER_ZIP_NAME } from './lootStarter.mjs';
import { SUBFOLDERS } from './lootWeb.mjs';
import { classify } from './lootClassify.mjs';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

/** A minimal zip reader: the central directory, then each local entry, CRC checked. */
function readZip(z) {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const eocd = z.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50, 'end of central directory');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const crc = dv.getUint32(p + 16, true); const size = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true); const el = dv.getUint16(p + 30, true); const cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(z.subarray(p + 46, p + 46 + nl));
    assert.equal(dv.getUint32(off, true), 0x04034b50);
    const lnl = dv.getUint16(off + 26, true); const lel = dv.getUint16(off + 28, true);
    const data = z.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + size);
    assert.equal(crc32(data), crc, `crc of ${name}`);
    out.push({ name, data });
    p += 46 + nl + el + cl;
  }
  return out;
}

ok('crc32 matches the known check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

ok('the starter zip holds the folder, the note, and the four subfolders', () => {
  const e = readZip(starterZip());
  assert.deepEqual(e.map((x) => x.name), ['KC-1 Loot/', 'KC-1 Loot/README.txt', ...SUBFOLDERS.map((s) => `KC-1 Loot/${s}/`)]);
  assert.equal(new TextDecoder().decode(e[1].data), STARTER_NOTE);
});

ok('the same bytes every time (deterministic)', () => {
  assert.deepEqual(starterZip(), starterZip());
});

ok('a first scan of the unzipped folder has nothing to log: the note sits outside the subfolders', () => {
  const files = starterFiles().filter((f) => !f.name.endsWith('/')).map((f) => f.name.replace(/^KC-1 Loot\//, ''));
  for (const rel of files) assert.equal(classify(rel).ignored, true, rel);
});

ok('utf-8 names and binary payloads survive', () => {
  const bytes = Uint8Array.from([0, 255, 1, 254]);
  const e = readZip(zipStore([{ name: 'ünï/b.bin', bytes }]));
  assert.equal(e[0].name, 'ünï/b.bin');
  assert.deepEqual([...e[0].data], [...bytes]);
});

ok('the real unzip accepts it (skipped where there is no unzip)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kc-starter-'));
  const f = join(dir, STARTER_ZIP_NAME);
  writeFileSync(f, starterZip());
  const r = spawnSync('unzip', ['-t', f], { encoding: 'utf8' });
  if (r.error) { console.log('    (no unzip on this machine)'); return; }
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /No errors detected/);
});

assert.ok(existsSync(new URL('./lootStarter.mjs', import.meta.url)));
console.log(`lootStarter.selfcheck: ${n} checks passed`);
