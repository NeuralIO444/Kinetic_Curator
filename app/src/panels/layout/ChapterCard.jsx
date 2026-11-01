// ChapterCard — #1855 (BOOK S2): the landing made visible. When a cold flip lands, the walk shows its
// path — each chapter it passed gets a beat, its own card — and comes to rest on the landed chapter:
// the name, the palette, three of the chapter's own marks (the S1 card, data/chapters.js). One glance,
// the era recognized.
//
// The deal is never gated on this display: the store commits the landing instantly (layoutSlice), and
// this card is the Davis-side motion around the discrete event — alive while it shows, then gone (the
// chapter's name stays behind in the START pill's deck readout). A warm tap while the cards are still
// passing snaps the display straight to the landed card: the instrument never makes the performer
// watch an animation.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store.js';
import { chapterById } from '../../data/chapters.js';
import { getCatalogPalette } from '../../data/palettes.js';
import { ASSETS } from '../../data/assets/index.js';
import { Events, on } from '../../composition/eventBus.js';

/** One beat per passed chapter while the walk goes by. */
const STEP_MS = 110;
/** The landed card rests, breathing, before it fades. */
const REST_MS = 2600;
/** The fade itself. */
const FADE_MS = 250;

const assetById = new Map(ASSETS.map((a) => [a.id, a]));

function CardFace({ chapter }) {
  const palette = getCatalogPalette(chapter.card.paletteId);
  return (
    <div
      className="chapter-card-face"
      style={{ background: palette.bg, color: palette.ink, '--ink': palette.ink, borderColor: palette.ink }}
    >
      <span className="chapter-card-name">{chapter.name}</span>
      <span className="chapter-card-marks" aria-hidden="true">
        {chapter.card.marks.map((id) => {
          const a = assetById.get(id);
          return a ? (
            <svg key={id} viewBox="0 0 100 100" className="chapter-card-glyph">
              <g dangerouslySetInnerHTML={{ __html: a.svg }} />
            </svg>
          ) : null;
        })}
      </span>
      <span className="chapter-card-swatches" aria-hidden="true">
        {(palette.swatches || []).slice(0, 6).map((hex) => (
          <span key={hex} style={{ background: hex }} />
        ))}
      </span>
    </div>
  );
}

export function ChapterCard() {
  const landing = useStore((s) => s.kineticLanding);
  // { seq, index, leaving } — which path card is up, and whether the rest is over.
  const [shown, setShown] = useState(null);
  const timers = useRef([]);
  const shownRef = useRef(null);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  // The walk, driven off the landing record: step through the path, rest on the landing, fade.
  useEffect(() => {
    if (!landing) return undefined;
    const clear = () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    };
    clear();
    const path = landing.path?.length ? landing.path : [landing.chapterId];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the display is a mirror of the landing record
    setShown({ seq: landing.seq, index: 0, leaving: false });
    for (let i = 1; i < path.length; i++) {
      timers.current.push(setTimeout(() => setShown({ seq: landing.seq, index: i, leaving: false }), i * STEP_MS));
    }
    const restAt = path.length * STEP_MS + REST_MS;
    timers.current.push(setTimeout(() => setShown((s) => (s ? { ...s, leaving: true } : s)), restAt));
    timers.current.push(setTimeout(() => setShown(null), restAt + FADE_MS));
    return clear;
  }, [landing]);

  // A warm tap while the cards are passing: skip to the landed card (the deal already committed).
  useEffect(
    () =>
      on(Events.KINETIC_TAP, () => {
        const s = shownRef.current;
        if (!s || s.leaving) return;
        const current = useStore.getState().kineticLanding;
        if (!current || current.seq !== s.seq) return;
        const last = (current.path?.length || 1) - 1;
        if (s.index >= last) return;
        for (const t of timers.current) clearTimeout(t);
        timers.current = [
          setTimeout(() => setShown((x) => (x ? { ...x, leaving: true } : x)), REST_MS),
          setTimeout(() => setShown(null), REST_MS + FADE_MS),
        ];
        setShown({ seq: s.seq, index: last, leaving: false });
      }),
    [],
  );

  if (!shown || !landing || shown.seq !== landing.seq) return null;
  const path = landing.path?.length ? landing.path : [landing.chapterId];
  const chapter = chapterById(path[Math.min(shown.index, path.length - 1)]);
  if (!chapter) return null;
  return (
    <div
      className={`chapter-card${shown.leaving ? ' leaving' : ''}`}
      role="status"
      aria-label={`landed in ${landing.name}`}
    >
      <CardFace chapter={chapter} />
    </div>
  );
}
