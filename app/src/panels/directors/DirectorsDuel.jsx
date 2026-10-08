import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.js';
import { loisActivity } from '../../curator/loisActivity.js';
import { resolveLoisFace } from '../../curator/loisFace.js';
import { resolveDavisState } from '../../curator/davisState.js';
import { roomFor } from '../../curator/directorsMatrix.js';
import { DavisSigil } from '../../components/DavisSigil.jsx';

// The two Directors, side by side (#1126). READOUT ONLY: each column draws what the honest feed says (DS rule 3) and
// nothing here acts, rewards or steers. LOIS has one fixed face that judges; Davis has a face drawn from the seed
// that turns at the tempo of his state. With no signal Davis has no state and rests (rule 4). With both in a state
// there is a ROOM: each says his line from the matrix and the strip names the room. It reads, it never acts.
const POLL_MS = 500;

export function DirectorsDuel() {
  const seed = useStore((s) => s.seed);
  const [room, setRoom] = useState(() => ({ lois: resolveLoisFace(loisActivity.snapshot()), davis: resolveDavisState(loisActivity.snapshot()) }));
  useEffect(() => {
    const read = () => {
      const feed = loisActivity.snapshot();
      const lois = resolveLoisFace(feed); const davis = resolveDavisState(feed);
      setRoom((cur) => (cur.lois.code === lois.code && (cur.davis?.code ?? null) === (davis?.code ?? null) ? cur : { lois, davis }));
    };
    const timer = setInterval(read, POLL_MS);
    read();
    return () => clearInterval(timer);
  }, []);
  const { lois, davis } = room;
  // the room exists only when BOTH have a state; its lines are the document's, verbatim (directorsMatrix.js)
  const talk = roomFor(lois.code, davis ? davis.code : null);
  return (
    <div className="directors-duel" role="group" aria-label="The two Directors">
      <div className="duel-side duel-lois" data-code={lois.code}>
        <span className="duel-who lbl">lois</span>
        <span className="duel-face" aria-hidden="true">{lois.face}</span>
        <span className="duel-state act">{lois.code}</span>
        <span className="duel-desc name">{talk ? (talk.lois ?? '') : lois.label}</span>
      </div>
      <div className="duel-side duel-davis" data-code={davis ? davis.code : 'none'}>
        <span className="duel-who lbl">davis</span>
        <DavisSigil seed={seed} code={davis?.code} />
        <span className="duel-state act">{davis ? davis.code : '—'}</span>
        <span className="duel-desc name">{talk ? talk.davis : (davis ? davis.label : '')}</span>
      </div>
      {talk && (
        <div className="duel-verdict" data-verdict={talk.verdict}>
          <span className="duel-verdict-name act">{talk.verdict}</span>
          <span className="duel-verdict-line name">{talk.verdictLine}</span>
        </div>
      )}
    </div>
  );
}
