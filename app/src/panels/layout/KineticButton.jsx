// KINETIC button (#942) — the top-menu storm generator, shell version.
// Tap (or K): naive full re-roll of the recipe — new seed, palette,
// composition preset, asset pool, FX chain, blend modes — in one undo step.
// The RULES/WEATHER/HEAT layers (#943–#945) will replace the naive roll later;
// this file owns only the button chrome and the tap wiring.
//
// The button breathes on the x-axis: a compact pill at rest (comfortable
// touch target, menu row stays clean), expanding to the full KINETIC label
// on hover/press/focus. Heat-driven swelling lands with #945.
import { useStore } from '../../state/store.js';
import { useHotkeys } from '../../hooks/useHotkeys.js';

export function KineticButton() {
  const kineticRoll = useStore((s) => s.kineticRoll);
  // useHotkeys matches e.key then e.key.toLowerCase(), so 'k' covers 'K'.
  useHotkeys({ k: () => kineticRoll() });

  return (
    <button
      type="button"
      className="kinetic-btn"
      onClick={() => kineticRoll()}
      title="KINETIC — roll a fresh recipe: new seed, palette, composition, assets, FX (K)"
      aria-label="Kinetic — roll a fresh recipe"
    >
      <span className="kinetic-glyph" aria-hidden="true">◉</span>
      <span className="kinetic-word" aria-hidden="true">
        <span className="kinetic-short">KIN</span>
        <span className="kinetic-rest">ETIC</span>
      </span>
    </button>
  );
}
