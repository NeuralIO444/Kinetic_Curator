// projectWizard.mjs — #1710: the first-run project wizard's state machine. Pure: the ask, the answer, the
// exactly-once rule — over injected storage, an injected saved-doc read, and the injected create path, so it is
// proven without the app and runs unchanged on it.
//
// Matt's rulings (2026-11-21, on the issue):
//   · Q1 — the wizard is its own step immediately after the Play Me card is dismissed. Play Me stays the front door.
//   · Q2 — ask ONCE. Trigger: desktop app + a browser autosave doc exists + no project folder has ever been opened on
//     this machine + the ask has never been shown. Dismissing without answering counts as asked — never nag again.
//     The PIPELINE row remains the standing path after a dismissal.
//   · Q3 — adoption takes the autosave doc EXACTLY AS SAVED (read from storage, un-rolled — never the on-screen
//     scene), and the browser copy is LEFT IN PLACE. The wizard's copy names the consequence plainly.
//   · Q4 — create-or-skip. The wizard offers creation but never demands it; skipping lands in the browser session
//     exactly as today. With no prior autosave, first run goes straight to the creation offer.
//
// The marker is set the moment the wizard is shown, so a dismissal is an ask that already happened. A refused name
// or a cancelled folder pick keeps the wizard where it was, with the reason in plain words.
export const WIZARD_ASKED_KEY = 'kc:project-folder:wizard-asked';

export function createProjectWizard({ storage, desktop, readSavedDoc, everOpened, createProject, blankDoc }) {
  if (
    typeof desktop !== 'function' ||
    typeof readSavedDoc !== 'function' ||
    typeof everOpened !== 'function' ||
    typeof createProject !== 'function' ||
    typeof blankDoc !== 'function'
  )
    throw new Error('createProjectWizard: desktop, readSavedDoc, everOpened, createProject, blankDoc');
  let phase = 'pending'; // pending | adopt | create | done
  let savedDoc = null;
  let note = null;
  let askedMem = false; // the ask still counts this session when storage itself is unavailable

  const asked = () => {
    if (askedMem) return true;
    try {
      return storage?.getItem(WIZARD_ASKED_KEY) === '1';
    } catch {
      return false;
    }
  };
  const markAsked = () => {
    askedMem = true;
    try {
      storage?.setItem(WIZARD_ASKED_KEY, '1');
    } catch {
      /* the ask still counts for this session */
    }
  };

  return {
    /** The phase: 'pending' before begin, 'adopt' (a saved doc is waiting) or 'create' (none), 'done'. */
    phase: () => phase,
    /** The saved doc this wizard would adopt, once begin() has read it (null otherwise). */
    savedDoc: () => savedDoc,
    /** The plain reason the last create attempt failed, or null. */
    note: () => note,

    /**
     * Evaluate the trigger once. When the wizard will show, the asked marker is set here — dismissal counts as asked.
     * @returns {'adopt' | 'create' | 'done'}
     */
    begin() {
      if (phase !== 'pending') return phase;
      if (!desktop() || asked() || everOpened()) {
        phase = 'done';
        return phase;
      }
      savedDoc = readSavedDoc() ?? null;
      phase = savedDoc ? 'adopt' : 'create';
      markAsked();
      return phase;
    },

    /** Adopt the saved doc as session 01 of the new project (the folder pick happens inside the create path). */
    async adopt(name) {
      if (phase !== 'adopt') return { ok: false, reason: 'the wizard is not asking to adopt' };
      note = null;
      const r = await createProject(name, savedDoc);
      if (r.ok) phase = 'done';
      else if (!r.cancelled) note = r.reason || 'that did not work';
      return r;
    },

    /** Start fresh: a blank document as session 01 (the adopt variant offers this too). */
    async fresh(name) {
      if (phase !== 'adopt' && phase !== 'create') return { ok: false, reason: 'the wizard is not asking' };
      note = null;
      const r = await createProject(name, blankDoc());
      if (r.ok) phase = 'done';
      else if (!r.cancelled) note = r.reason || 'that did not work';
      return r;
    },

    /** Skip / dismiss: the browser session carries on as today. The marker was already set at begin(). */
    skip() {
      note = null;
      phase = 'done';
      return phase;
    },
  };
}
