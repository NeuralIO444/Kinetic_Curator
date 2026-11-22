// personaRollbackLive — #2397: the desktop half of the rollback button. Reads the canonical taste and
// the store artifact from the adapters data home, plans the rollback with the pure mirror of the
// trainer's rules (personaRollback.mjs), and only then writes: the taste first (canonical form), the
// history record second — the log only ever records what actually landed. Desktop-only; every refusal
// leaves every file untouched. The effect lands at the next launch: the boot bridge loads the restored
// entry then, and this session keeps playing on the heads it loaded at its own boot.
import { isTauriRuntime } from '../platform/desktop.mjs';
import { planRollback, canonicalStringify, historyLine, rollbackTimestamp } from './personaRollback.mjs';
import { ADAPTERS_DIR, ADAPTERS_TASTE_FILE } from './personaHeadsLive.js';

export const HEADS_STORE_DIR = 'persona-heads';
export const HISTORY_FILE = 'history.jsonl';

const short = (e) =>
  String((e && e.message) || e || 'failed')
    .replace(/\s+/g, ' ')
    .slice(0, 160);

/**
 * @param deps { isDesktop, appDataDir, join, readTextFile, writeTextFile, now } — injected by the
 *             selfcheck; absent, the Tauri v1 API is loaded lazily.
 * @returns { ok, record? , reason? } — the record is what history.jsonl gained.
 */
export async function rollbackPersonaHead(id, kind, deps = {}) {
  const isDesktop = deps.isDesktop || isTauriRuntime;
  if (!isDesktop()) return { ok: false, reason: 'rollback needs the desktop app — the store lives in its data folder' };
  try {
    const pathApi = deps.appDataDir && deps.join ? null : await import('@tauri-apps/api/path');
    const fsApi = deps.readTextFile && deps.writeTextFile ? null : await import('@tauri-apps/api/fs');
    const appDataDir = deps.appDataDir || pathApi.appDataDir;
    const join = deps.join || pathApi.join;
    const readTextFile = deps.readTextFile || fsApi.readTextFile;
    const writeTextFile = deps.writeTextFile || fsApi.writeTextFile;
    const now = deps.now || (() => rollbackTimestamp());
    const home = await appDataDir();
    const tastePath = await join(home, ADAPTERS_DIR, ADAPTERS_TASTE_FILE);
    let taste;
    try {
      taste = JSON.parse(await readTextFile(tastePath));
    } catch {
      return { ok: false, reason: 'the canonical taste is unreadable — nothing was touched' };
    }
    const current = taste && taste.personas && taste.personas[id] && taste.personas[id][kind];
    let artifactText = null;
    if (current && Number.isInteger(current.version) && current.version > 1) {
      const artifactPath = await join(home, ADAPTERS_DIR, HEADS_STORE_DIR, id, kind, `v${current.version - 1}.json`);
      try {
        artifactText = await readTextFile(artifactPath);
      } catch {
        return {
          ok: false,
          reason: `the store artifact for ${id}|${kind} v${current.version - 1} is missing — nothing was touched`,
        };
      }
    }
    const plan = planRollback(taste, id, kind, artifactText, now());
    if (!plan.ok) return plan;
    await writeTextFile(tastePath, canonicalStringify(taste));
    const historyPath = await join(home, ADAPTERS_DIR, HEADS_STORE_DIR, HISTORY_FILE);
    let existing = '';
    try {
      existing = await readTextFile(historyPath);
    } catch {
      existing = '';
    }
    await writeTextFile(historyPath, existing + historyLine(plan.record));
    return { ok: true, record: plan.record };
  } catch (e) {
    return { ok: false, reason: short(e) };
  }
}
