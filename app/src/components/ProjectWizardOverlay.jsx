import { useCallback, useEffect, useState } from 'react';
import { projectWizard } from '../hooks/useProjectWizard.js';
import { validateProjectName } from '../state/projectNaming.mjs';

/**
 * The first-run project wizard (#1710) — its own step, shown once the Play Me card is gone (App sequences it).
 * Desktop only, asked once: bring the browser autosave in as the new project folder's session 01, start fresh
 * with an empty project, or skip and keep playing in the browser session. Dismissing counts as asked.
 */
export function ProjectWizardOverlay() {
  const [wizard] = useState(() => projectWizard());
  const [phase, setPhase] = useState(() => wizard.begin());
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const check = name ? validateProjectName(name) : null;

  const dismiss = useCallback(() => {
    wizard.skip();
    setPhase('done');
  }, [wizard]);

  // #107 §7: Escape is the app's one panic key — it must close this too.
  useEffect(() => {
    if (phase === 'done') return;
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, dismiss]);

  if (phase === 'done' || phase === 'pending') return null;
  const adopt = phase === 'adopt';

  const create = async (kind) => {
    setBusy(true);
    setNote(null);
    try {
      const r = kind === 'adopt' ? await wizard.adopt(name) : await wizard.fresh(name);
      if (r && r.ok) setPhase('done');
      else if (r && !r.cancelled) setNote(wizard.note());
    } catch (e) {
      setNote(String((e && e.message) || e).slice(0, 160));
    } finally {
      setBusy(false);
    }
  };
  const hint = note || (check && !check.ok ? check.reason : null);

  return (
    <div className="first-run-overlay" role="dialog" aria-modal="true" aria-labelledby="project-wizard-title">
      <div className="first-run-card">
        <div className="first-run-mark">◈</div>
        <h2 id="project-wizard-title" className="first-run-title">
          MAKE IT A PROJECT
        </h2>
        <p className="first-run-manifesto">
          {adopt
            ? 'You have work saved in this browser. KC-1 projects live in a folder — one folder per project, with the sessions saved inside it. Bring your saved work in as the first session of a new project, or start fresh with an empty one.'
            : 'KC-1 projects live in a folder — one folder per project, with the sessions saved inside it. Make your first project now, or skip this and play in the browser session.'}
        </p>
        <input
          type="text"
          aria-label="Project name"
          placeholder="Project name"
          value={name}
          maxLength={64}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && check?.ok && !busy) create(adopt ? 'adopt' : 'fresh');
          }}
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            marginBottom: 10,
            fontSize: 12,
          }}
        />
        {adopt ? (
          <button
            type="button"
            className="first-run-play"
            disabled={busy || !check?.ok}
            onClick={() => create('adopt')}
          >
            BRING MY WORK IN
          </button>
        ) : null}
        <button
          type="button"
          className="first-run-play"
          disabled={busy || !check?.ok}
          onClick={() => create('fresh')}
          style={
            adopt ? { background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--ink)' } : undefined
          }
        >
          {adopt ? 'START FRESH' : 'CREATE PROJECT'}
        </button>
        <button type="button" className="first-run-skip" disabled={busy} onClick={dismiss}>
          Not now
        </button>
        {hint ? (
          <p className="first-run-manifesto" role="status" style={{ margin: '12px 0 0' }}>
            {hint}
          </p>
        ) : null}
        {adopt ? (
          <p className="first-run-manifesto" style={{ margin: '12px 0 0' }}>
            Your browser copy stays where it is. If you close the project later, the next launch falls back to that
            browser session.
          </p>
        ) : null}
      </div>
    </div>
  );
}
