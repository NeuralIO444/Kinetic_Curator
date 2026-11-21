// useProjectWizard.js — #1710: the first-run wizard (project/projectWizard.mjs) wired to the running instrument.
//
// The saved doc the wizard adopts is captured at BOOT, before the browser boot runs: browserBoot restores the
// autosave and (in CHAOS mode) rolls a new scene over it, and the autosave would then hold the roll. The wizard's
// adoption takes the doc exactly as it was saved, so this read happens first and the wizard is handed the snapshot.
import { createProjectWizard } from '../project/projectWizard.mjs';
import { projectFolderLive } from './useProjectFolder.js';
import { readPipelineAutosave, parseProject, PROJECT_VERSION } from '../state/projectDocument.js';

const storage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

let bootSavedRead; // undefined = not captured yet; the whole boot read, verdict included
/**
 * The browser autosave read as it stood when this launch booted — taken ONCE, before the browser boot can
 * roll over it. The read is destructive by design (#107 §6): a document it cannot parse is quarantined on
 * that read and the slot emptied, so the `quarantined` verdict exists only in this one result. Every boot
 * consumer reads it here — a second readPipelineAutosave() would find the slot already emptied, report no
 * quarantine, and a corrupt autosave would be refused in silence (no RESTORE FAILED on the MasterBar).
 */
export function captureBootSavedRead() {
  if (bootSavedRead === undefined) {
    try {
      bootSavedRead = readPipelineAutosave();
    } catch {
      // A read that throws left the document unread with the session still at risk — the quarantine
      // verdict in another shape (#1646): the boot must say RESTORE FAILED, and there is no doc.
      bootSavedRead = { doc: null, quarantined: true, fromBackup: false };
    }
  }
  return bootSavedRead;
}

let bootSavedDoc; // undefined = not captured yet; null = there was none
/** The browser autosave doc as it stood when this launch booted (read once, before the browser boot can roll over it). */
export function captureBootSavedDoc() {
  if (bootSavedDoc === undefined) bootSavedDoc = captureBootSavedRead().doc ?? null;
  return bootSavedDoc;
}

/** A fresh project's seed: identity for the opener, never a sim input (the useProjectFolder mintId pattern). */
const mintSeed = () => {
  try {
    const b = new Uint32Array(1);
    globalThis.crypto.getRandomValues(b);
    return b[0];
  } catch {
    return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
  }
};

let wizard = null;
/** The one wizard for this launch (created on first use). */
export function projectWizard() {
  if (!wizard) {
    wizard = createProjectWizard({
      storage: storage(),
      desktop: () => projectFolderLive().unavailable() === null,
      readSavedDoc: () => captureBootSavedDoc(),
      // A project remembered for reopening, or one already open, means folders are in use here — the ask is moot.
      everOpened: () => {
        const live = projectFolderLive();
        return live.isOpen() || live.lastRoot() != null;
      },
      // Landing is the wizard's difference from the PIPELINE row: the adopted (or blank) doc goes on stage, so the
      // stage IS session 01 and the first edit's autosave cannot rewrite it with the rolled scene.
      createProject: (name, doc) => projectFolderLive().create(name, { doc, land: true }),
      // An empty project: the document the sanitizers make of a bare v1 stub — nothing in it but defaults.
      blankDoc: () => parseProject({ version: PROJECT_VERSION, seed: mintSeed() }).doc,
    });
  }
  return wizard;
}
