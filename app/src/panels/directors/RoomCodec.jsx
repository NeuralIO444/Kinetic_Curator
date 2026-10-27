// RoomCodec.jsx — #1560 S1: THE ROOM, re-cut to the codec (docs/research/room-codec/03-transcript-and-panel.md,
// frozen mockup kc-room-codec-mockup-2026-10-14.png).
//
// Layout: LOIS's face window left, Davis's right, the transcript between them, the room's verdict as the footer
// strip. The windows show each persona's CURRENT face/state rendering (RoomFaces.jsx — slice 2 swaps what
// renders inside them without touching this panel), dressed as the mockup dresses them: the name in the
// persona's colour, the state word bold beside it. The transcript is the retained bus window
// (curator/roomFeed.js): persona utterances and room events in arrival order, newest at the bottom — a window
// onto the real kc-voice/1 bus (law 1), never a chat. The third of the trio has no window, no name and no
// lines here (law 2), and nothing renders her sway (DS rule 10). Readout only, like the duel before it (#1126): nothing
// in the room is a button, nothing here acts, rewards or steers. Stillness is first-class (law 5): transcript
// lines simply replace — no scroll or arrival animation — and the faces settle under reduced motion exactly
// as they always have.
import { useEffect, useState } from 'react';
import { useStore } from '../../state/store.js';
import { loisActivity } from '../../curator/loisActivity.js';
import { resolveLoisFace } from '../../curator/loisFace.js';
import { resolveDavisState, DAVIS_STATES } from '../../curator/davisState.js';
import { roomFor } from '../../curator/directorsMatrix.js';
import { loisLook, davisLook } from '../../curator/mindFace.js';
import { getTaste } from '../../curator/tasteStore.js';
import { tasteBlocks, ROOM_FEED_MAX } from '../../curator/roomFeed.js';
import { useMindFaces } from '../../hooks/useMindFaces.js';
import { useRoomFeed } from '../../hooks/useRoomFeed.js';
import { LoisFaceNow, DavisFaceNow } from './RoomFaces.jsx';

const POLL_MS = 500;
// The transcript column's height is the face windows' height; it shows the tail of the window (08-Q5 default:
// the live tail — the retained 60 stay in the feed, the column shows the most recent lines that fit).
const VISIBLE_LINES = 6;
const TASTE_SLOTS = 10;

export function RoomCodec() {
  const seed = useStore((s) => s.seed);
  // The honest feed moves on keeps and rolls, not on the bus — the room polls it, change-gated, as the duel did.
  const [faces, setFaces] = useState(() => {
    const feed = loisActivity.snapshot();
    return { lois: resolveLoisFace(feed), davis: resolveDavisState(feed) };
  });
  useEffect(() => {
    const read = () => {
      const feed = loisActivity.snapshot();
      const lois = resolveLoisFace(feed);
      const davis = resolveDavisState(feed);
      setFaces((cur) =>
        cur.lois.code === lois.code && (cur.davis?.code ?? null) === (davis?.code ?? null) ? cur : { lois, davis },
      );
    };
    const timer = setInterval(read, POLL_MS);
    read();
    return () => clearInterval(timer);
  }, []);
  const { lois, davis } = faces;
  // #1462 — a mind request blends a state over the honest face, holds it for its decay, then eases back
  const mind = useMindFaces();
  const lLook = mind.lois?.id ? loisLook(mind.lois.id) : null;
  const dLook = mind.davis?.id ? davisLook(mind.davis.id) : null;
  const lOn = lLook && mind.lois.weight >= 0.5;
  const dOn = dLook && mind.davis.weight >= 0.5;
  // Davis's sigil turns at the tempo of a requested CANONICAL state; an invented one keeps his honest tempo
  const dCode = dOn && DAVIS_STATES[dLook.code] ? dLook.code : davis?.code;
  // the room exists only when BOTH have a state; the footer names it (the matrix's words, verbatim)
  const talk = roomFor(lois.code, davis ? davis.code : null);
  const loisWord = lOn ? lLook.code : lois.code;
  const davisWord = dOn ? (dLook.name ?? dLook.code) : davis ? (davis.name ?? davis.code) : '—';
  const records = useRoomFeed();
  const blocks = tasteBlocks(getTaste(), TASTE_SLOTS);
  const shown = records.slice(-VISIBLE_LINES);

  return (
    <div className="room-codec" role="group" aria-label="The Room">
      <div className="codec-window codec-lois" data-code={lois.code} data-mind={lLook ? lLook.code : undefined}>
        <div className="codec-face-slot">
          <LoisFaceNow face={lois.face} overlay={mind.lois} barS={mind.barS} />
        </div>
        <div className="codec-dressing">
          <span className="codec-name">lois</span>
          <span className="codec-state act">{loisWord}</span>
        </div>
      </div>

      <div className="codec-transcript">
        <div className="codec-head">
          <span className="codec-ch">CH kc-voice/1</span>
          <span className="codec-taste" title="TASTE — the taste context, as the head reads it">
            <i>TASTE</i>
            {Array.from({ length: TASTE_SLOTS }, (_, i) => (
              <span key={i} className={`codec-taste-block${i < blocks ? ' on' : ''}`} />
            ))}
          </span>
          <span className="codec-bus" title={`BUS — the bus window: the last ${ROOM_FEED_MAX} records`}>
            BUS {records.length}
          </span>
        </div>
        <div className="codec-lines">
          {shown.map((r) =>
            r.kind === 'persona' ? (
              <div className="codec-line persona" key={r.seq}>
                {r.bar !== null && <span className="codec-bar">bar {r.bar} </span>}
                <span className={`codec-who ${r.persona}`}>{r.persona}</span>{' '}
                <span className="codec-text">{r.text}</span>
              </div>
            ) : (
              <div className="codec-line room" key={r.seq}>
                {r.text}
              </div>
            ),
          )}
        </div>
      </div>

      <div
        className="codec-window codec-davis"
        data-code={davis ? davis.code : 'none'}
        data-mind={dLook ? dLook.code : undefined}
      >
        <div className="codec-face-slot">
          <DavisFaceNow seed={seed} code={dCode} />
        </div>
        <div className="codec-dressing">
          <span className="codec-name">davis</span>
          <span className="codec-state act">{davisWord}</span>
        </div>
      </div>

      <div className="codec-footer" {...(talk ? { 'data-verdict': talk.verdict } : {})}>
        <span className="codec-verdict act">{talk ? talk.verdict : 'THE ROOM'}</span>
        {talk && <span className="codec-verdict-line">{talk.verdictLine}</span>}
      </div>
    </div>
  );
}
