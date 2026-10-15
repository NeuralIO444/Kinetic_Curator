// lootBackend.mjs — #1479 slice 5b: which folder backend this window gets. The desktop shell reads local paths natively
// (lootNative.mjs); a browser uses the File System Access API where it has it (lootWeb.mjs). Both answer pickFolder, scan,
// hash and read in one shape, so the row and every slice after it take whichever this returns.
import { isTauriRuntime } from '../platform/desktop.mjs';
import { createLootNative } from './lootNative.mjs';
import { createLootWeb } from './lootWeb.mjs';

export function createLootBackend({ isDesktop = isTauriRuntime, native = null, web = null } = {}) {
  return isDesktop() ? (native || createLootNative()) : (web || createLootWeb());
}
