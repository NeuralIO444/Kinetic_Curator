// lootStarter.mjs — #1479 slice 5c: the starter folder for a browser that cannot create folders (Safari, Firefox). A
// store-only zip (no compression: it is a few hundred bytes) holding `KC-1 Loot/` with the four subfolders and one
// note. The note sits at the top, outside the subfolders, so a first scan has nothing to log. Pure: bytes in, bytes out,
// so a selfcheck reads the archive back with its own reader and (where it exists) the system unzip.
import { SUBFOLDERS, FOLDER_NAME } from './lootWeb.mjs';

const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01: fixed so the same app always makes the same bytes
const DOS_TIME = 0;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = (s) => new TextEncoder().encode(s);

export const STARTER_NOTE = [
  'KC-1 loot folder',
  '',
  'Put your own files in the folders next to this note:',
  '  images/    SVG files (other image types are noted in the log, not used yet)',
  '  audio/     WAV, AIFF or MP3 files',
  '  palettes/  JSON palette files',
  '  looks/     look files (JSON); KC-1 saves its own keep exports here when this browser lets it',
  '',
  'KC-1 reads your files where they are. It never moves, renames, changes or deletes them;',
  'the only files it writes are its own keep exports in looks/.',
  'Then open KC-1, go to PIPELINE > loot folder, and point at this folder.',
  '',
].join('\n');

/** The files of the starter folder: [{ name, bytes }]; a name ending in `/` is an (empty) folder. */
export function starterFiles() {
  return [
    { name: `${FOLDER_NAME}/`, bytes: new Uint8Array(0) },
    { name: `${FOLDER_NAME}/README.txt`, bytes: enc(STARTER_NOTE) },
    ...SUBFOLDERS.map((s) => ({ name: `${FOLDER_NAME}/${s}/`, bytes: new Uint8Array(0) })),
  ];
}

/** A store-only zip of [{ name, bytes }]. UTF-8 names, deterministic. */
export function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of files) {
    const name = enc(f.name);
    const crc = crc32(f.bytes);
    const head = [
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(f.bytes.length),
      ...u32(f.bytes.length),
      ...u16(name.length),
      ...u16(0),
    ];
    chunks.push(Uint8Array.from(head), name, f.bytes);
    central.push({ name, crc, size: f.bytes.length, offset });
    offset += head.length + name.length + f.bytes.length;
  }
  const cdStart = offset;
  for (const c of central) {
    const dir = c.name[c.name.length - 1] === 0x2f;
    const rec = [
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(DOS_TIME),
      ...u16(DOS_DATE),
      ...u32(c.crc),
      ...u32(c.size),
      ...u32(c.size),
      ...u16(c.name.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(dir ? 0x10 : 0),
      ...u32(c.offset),
    ];
    chunks.push(Uint8Array.from(rec), c.name);
    offset += rec.length + c.name.length;
  }
  const end = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(central.length),
    ...u16(central.length),
    ...u32(offset - cdStart),
    ...u32(cdStart),
    ...u16(0),
  ];
  chunks.push(Uint8Array.from(end));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The starter folder as zip bytes. */
export const starterZip = () => zipStore(starterFiles());
export const STARTER_ZIP_NAME = `${FOLDER_NAME.replace(/\s+/g, '-')}.zip`;
