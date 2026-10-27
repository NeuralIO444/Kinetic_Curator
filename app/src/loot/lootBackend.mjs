// lootBackend.mjs — #1479 slice 5b: which folder backend this window gets. The desktop shell reads local paths natively
// (lootNative.mjs); a browser uses the File System Access API where it has it (lootWeb.mjs). Both answer pickFolder, scan,
// hash and read in one shape, so the row and every slice after it take whichever this returns.
import { isTauriRuntime } from '../platform/desktop.mjs';
import { createLootNative } from './lootNative.mjs';
import { createLootWeb, webFolderSupport } from './lootWeb.mjs';
import { createLootSession } from './lootSession.mjs';

/** A browser with no folder-handle API (Safari, Firefox) still reads a chosen folder for the visit (slice 5c). */
export function createLootBackend({
  isDesktop = isTauriRuntime,
  native = null,
  web = null,
  session = null,
  supportsWeb = () => webFolderSupport() === null,
} = {}) {
  if (isDesktop()) return native || createLootNative();
  return supportsWeb() ? web || createLootWeb() : session || createLootSession();
}
