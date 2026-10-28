// #1709 — project folder / session file naming. Pure: no I/O, no randomness, no clock.
// STRICT: the name as typed IS the folder name. Forbidden characters are refused, never rewritten.
// Collisions are refused (case-insensitive, NFC). Session numbers are max+1; gaps are never reused.

export const FOLDER_PREFIX = 'KC1_Loot_';
export const SESSION_EXT = '.kcproject';
export const NAME_MAX = 64;
/**
 * The filesystem's own limit is 255 BYTES per name (APFS, ext4), and the longest name built from a project name is a
 * session file (`<name>_<nnnn>.kcproject`). 64 four-byte characters plus the prefix would pass the character cap and
 * fail on disk, so a name is also capped in UTF-8 bytes, with room for the prefix and a session suffix.
 */
export const NAME_MAX_BYTES = 200;
const utf8Bytes = (s) => new TextEncoder().encode(s).length;

const FORBIDDEN = /[/\\:*?"<>|\u0000-\u001f\u007f]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function validateProjectName(input) {
  if (typeof input !== 'string') return { ok: false, reason: 'Name must be text.' };
  const name = input.normalize('NFC');
  if (name.length === 0) return { ok: false, reason: 'Name is empty.' };
  if (FORBIDDEN.test(name)) {
    return {
      ok: false,
      reason: 'Name contains a character a folder cannot have (/ \\ : * ? " < > | or a control character).',
    };
  }
  if (name.startsWith(' ') || name.endsWith(' ')) {
    return { ok: false, reason: 'Name cannot start or end with a space.' };
  }
  if (name.startsWith('.')) return { ok: false, reason: 'Name cannot start with a dot.' };
  if (name.endsWith('.')) return { ok: false, reason: 'Name cannot end with a dot.' };
  const stem = name.split('.')[0].toLowerCase();
  if (RESERVED.test(stem)) return { ok: false, reason: 'Name is reserved by Windows.' };
  if ([...name].length > NAME_MAX) {
    return { ok: false, reason: `Name is longer than ${NAME_MAX} characters.` };
  }
  if (utf8Bytes(name) > NAME_MAX_BYTES) {
    return { ok: false, reason: 'Name is too long for a folder (too many wide characters).' };
  }
  return { ok: true, name };
}

export function folderNameFor(name) {
  const v = validateProjectName(name);
  if (!v.ok) throw new Error(`projectNaming: invalid project name — ${v.reason}`);
  return FOLDER_PREFIX + v.name;
}

export function projectNameFromFolder(folder) {
  if (typeof folder !== 'string') return null;
  const f = folder.normalize('NFC');
  if (!f.startsWith(FOLDER_PREFIX)) return null;
  const v = validateProjectName(f.slice(FOLDER_PREFIX.length));
  return v.ok ? v.name : null;
}

const foldKey = (s) => s.normalize('NFC').toLowerCase();

export function nameCollides(name, existingFolderNames) {
  const want = foldKey(folderNameFor(name));
  return (existingFolderNames || []).some((f) => typeof f === 'string' && foldKey(f) === want);
}

export function sessionFileName(name, n) {
  const v = validateProjectName(name);
  if (!v.ok) throw new Error(`projectNaming: invalid project name — ${v.reason}`);
  if (!Number.isInteger(n) || n < 1) throw new Error('projectNaming: session number must be an integer >= 1');
  return `${v.name}_${String(n).padStart(2, '0')}${SESSION_EXT}`;
}

export function parseSessionNumber(name, file) {
  if (typeof name !== 'string' || typeof file !== 'string') return null;
  const head = `${name}_`;
  if (!file.startsWith(head) || !file.endsWith(SESSION_EXT)) return null;
  const digits = file.slice(head.length, file.length - SESSION_EXT.length);
  if (!/^[0-9]{2,}$/.test(digits)) return null;
  if (digits.length > 2 && digits[0] === '0') return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export function nextSessionNumber(name, files) {
  let max = 0;
  for (const f of files || []) {
    const n = parseSessionNumber(name, f);
    if (n !== null && n > max) max = n;
  }
  return max + 1;
}
