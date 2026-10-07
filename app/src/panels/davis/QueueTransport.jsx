// QUEUE transport (#966) — autoplay for the HITS setlist, in the Play panel.
// Walks the FavoritesTray's visible queue in order (loops at the end).
// TIME mode holds each hit for seconds-per-hit; BEAT mode holds beats-per-hit
// at the BEAT button's tempo (UX-4 #950 — state.beatBpm, 120 fallback until it
// lands). Tap-to-jump lives in FavoritesTray: any tap sets queueIndex and the
// timer restarts from the jumped-to hit without pausing.
// Advances reuse the deterministic recipe path (recall), or the morph path
// when MORPH EVOLVE is on — playback is sequencing, not new rendering.
import { useCallback, useEffect } from 'react';
import { useStore } from '../../state/store.js';
import { LOIS_LINES } from '../loisLines.mjs';
import { emit, Events } from '../../composition/eventBus.js';
import {
  visibleQueue,
  nextQueueIndex,
  clampQueueIndex,
  queueHoldMs,
  queuePositionLabel,
  QUEUE_SECONDS_MIN,
  QUEUE_SECONDS_MAX,
  QUEUE_BEATS_MIN,
  QUEUE_BEATS_MAX,
  QUEUE_BEAT_FALLBACK_BPM,
} from '../../state/queueTransport.js';
import { RangeRow } from '../../components/RangeRow.jsx';

export function QueueTransport() {
  const favorites = useStore((s) => s.favorites);
  const queuePlaying = useStore((s) => s.queuePlaying);
  const queueIndex = useStore((s) => s.queueIndex);
  const queueSource = useStore((s) => s.queueSource);
  const queueSecondsPerHit = useStore((s) => s.queueSecondsPerHit);
  const queueBeatsPerHit = useStore((s) => s.queueBeatsPerHit);
  // #966 — restarts the hold even when a manual jump lands on the current hit.
  const queueJumpNonce = useStore((s) => s.queueJumpNonce);
  const morphEvolve = useStore((s) => s.morphEvolve);
  // #966 — BEAT advance hook: tempo follows the UX-4 BEAT button once it
  // lands; until then the 120 fallback keeps TIME-adjacent behavior honest.
  const beatBpmRaw = useStore((s) => s.beatBpm);
  const beatFromButton = beatBpmRaw != null;
  const beatBpm = beatFromButton ? beatBpmRaw : QUEUE_BEAT_FALLBACK_BPM;

  const toggleQueuePlaying = useStore((s) => s.toggleQueuePlaying);
  const setQueuePlaying = useStore((s) => s.setQueuePlaying);
  const setQueueIndex = useStore((s) => s.setQueueIndex);
  const setQueueSource = useStore((s) => s.setQueueSource);
  const setQueueSecondsPerHit = useStore((s) => s.setQueueSecondsPerHit);
  const setQueueBeatsPerHit = useStore((s) => s.setQueueBeatsPerHit);

  const queue = visibleQueue(favorites);
  const idx = clampQueueIndex(queueIndex, queue.length);
  const holdMs = queueHoldMs(queueSource, queueSecondsPerHit, queueBeatsPerHit, beatBpm);

  // Same fire path as tapping a tray chip: recall, or morph when the
  // morph-evolve toggle is on (ease vs. hard-cut between hits).
  const fire = useCallback((fav) => {
    if (!fav) return;
    emit(Events.DAVIS_FAVORITE, {
      action: morphEvolve ? 'morph' : 'recall',
      favorite: fav,
    });
  }, [morphEvolve]);

  // Advance on the clock. Keyed on queueIndex so a tap-to-jump restarts the
  // hold from the jumped-to hit without pausing playback.
  useEffect(() => {
    if (!queuePlaying) return;
    const q = visibleQueue(useStore.getState().favorites);
    if (q.length === 0) {
      setQueuePlaying(false);
      return;
    }
    const hold = queueHoldMs(
      useStore.getState().queueSource,
      useStore.getState().queueSecondsPerHit,
      useStore.getState().queueBeatsPerHit,
      useStore.getState().beatBpm ?? QUEUE_BEAT_FALLBACK_BPM,
    );
    const t = setTimeout(() => {
      const s = useStore.getState();
      const qq = visibleQueue(s.favorites);
      if (qq.length === 0) {
        s.setQueuePlaying(false);
        return;
      }
      const now = clampQueueIndex(s.queueIndex, qq.length);
      const next = nextQueueIndex(now, qq.length);
      s.setQueueIndex(next);
      const fav = qq[next];
      emit(Events.DAVIS_FAVORITE, {
        action: s.morphEvolve ? 'morph' : 'recall',
        favorite: fav,
      });
    }, hold);
    return () => clearTimeout(t);
    // queueJumpNonce: a manual tap/keyboard jump restarts the hold even when
    // the jumped-to hit is already current (re-firing it must not get cut
    // short by the old timer).
  }, [queuePlaying, queueIndex, queueJumpNonce, queueSource, queueSecondsPerHit, queueBeatsPerHit, beatBpm, favorites, setQueuePlaying]);

  const toggle = () => {
    if (queue.length === 0) return;
    if (!queuePlaying) {
      // Pressing play fires the current hit immediately, then holds.
      setQueueIndex(idx);
      fire(queue[idx]);
    }
    toggleQueuePlaying();
  };

  const empty = queue.length === 0;

  return (
    <div className="queue-transport">
      {/* #1032 — voice 1: the empty setlist, before the first keep. */}
      {empty && <div className="lois-line name">{LOIS_LINES.play}</div>}
      <div className="davis-source-row">
        <span className="davis-label lbl">queue</span>
        <button
          type="button"
          className={`chip-btn queue-play${queuePlaying ? ' active' : ''}`}
          aria-pressed={queuePlaying}
          disabled={empty}
          title={empty ? 'Press F to save hits first — the queue plays your HITS setlist.' : queuePlaying ? 'Stop the queue.' : 'Play the HITS setlist in order. Loops at the end.'}
          onClick={toggle}
        >
          {queuePlaying ? '■ STOP' : '▶ PLAY'}
        </button>
        <span
          className="davis-readout"
          title={empty ? 'No hits yet' : `Now playing hit ${idx + 1} of ${queue.length}`}
        >
          HIT {queuePositionLabel(idx, queue.length)}
        </span>
        {queuePlaying && (
          <span className="queue-note" aria-hidden="true">
            {morphEvolve ? 'morphing between hits' : 'hard-cutting between hits'}
          </span>
        )}
      </div>

      <div className="davis-source-row">
        <span className="davis-label lbl">advance</span>
        <button
          type="button"
          className={`chip-btn${queueSource === 'time' ? ' active' : ''}`}
          aria-pressed={queueSource === 'time'}
          title="Each hit holds for the HOLD seconds below."
          onClick={() => setQueueSource('time')}
        >
          TIME
        </button>
        <button
          type="button"
          className={`chip-btn${queueSource === 'beat' ? ' active' : ''}`}
          aria-pressed={queueSource === 'beat'}
          title="Each hit holds for the BEATS count below, at the BEAT button's tempo."
          onClick={() => setQueueSource('beat')}
        >
          BEAT
        </button>
      </div>

      {queueSource === 'time' ? (
        <div className="davis-interval-row">
          <span className="davis-label lbl">hold</span>
          <RangeRow layout="bare" tone="ink"
            min={QUEUE_SECONDS_MIN}
            max={QUEUE_SECONDS_MAX}
            step={1}
            value={queueSecondsPerHit}
            hint="Seconds each hit holds before advancing."
            onChange={(v) => setQueueSecondsPerHit(v)}
          />
          <span className="davis-readout">{queueSecondsPerHit}s / hit</span>
        </div>
      ) : (
        <>
          <div className="davis-interval-row">
            <span className="davis-label lbl">beats</span>
            <RangeRow layout="bare" tone="ink"
              min={QUEUE_BEATS_MIN}
              max={QUEUE_BEATS_MAX}
              step={1}
              value={queueBeatsPerHit}
              hint="Beats each hit holds, at the BEAT button's tempo."
              onChange={(v) => setQueueBeatsPerHit(v)}
            />
            <span className="davis-readout">
              {queueBeatsPerHit} @ {beatBpm} BPM = {(holdMs / 1000).toFixed(1)}s
            </span>
          </div>
          <div className="queue-note">
            {beatFromButton
              ? `Tempo from the BEAT button (${beatBpm} BPM).`
              : 'BEAT tempo follows the UX-4 BEAT button — 120 BPM fallback until it lands.'}
          </div>
        </>
      )}
    </div>
  );
}
