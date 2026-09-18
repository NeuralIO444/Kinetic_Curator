// Curator bar — the taste-guided re-roll over unlocked params.
// Rolls CURATE_CANDIDATES scenes, keeps the curator engine's pick.
// No trained engine on file yet: honest dice roll, and the hint says so.
import { emit, Events } from '../../composition/eventBus.js';
import { getActiveCurator, curatorHint } from '../../curator/curate.js';

export function CuratorBar({ lockCount }) {
  const hint = curatorHint(getActiveCurator());
  return (
    <div className="randomize-bar">
      <button className="randomize-btn" onClick={() => emit(Events.LAYOUT_CURATE)}>
        Curator
      </button>
      <span className="randomize-hint">{lockCount > 0 ? `${lockCount} locked · ` : ''}{hint}</span>
    </div>
  );
}
