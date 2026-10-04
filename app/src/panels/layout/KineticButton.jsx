// KINETIC button (#942 shell, #943 RULES layer) — the top-menu storm generator.
// Tap (or K): a calm tap runs the RULES pass — a restrained structural
// reworking of the current piece (separation, focal hierarchy, off-center
// allowed, edge-bleed) in one undo step. The WEATHER/HEAT layers (#944–#945)
// will conduct tap order later; for now every tap is calm, so the button
// calls kineticRulesPass directly. kineticRoll (the naive full re-roll)
// stays in the slice for #945's heat ceiling.
//
// The button breathes on the x-axis: a compact pill at rest (comfortable
// touch target, menu row stays clean), expanding to the full KINETIC label
// on hover/press/focus. Heat-driven swelling lands with #945.
import { useStore } from '../../state/store.js';
import { useHotkeys } from '../../hooks/useHotkeys.js';

export function KineticButton() {
  const kineticRulesPass = useStore((s) => s.kineticRulesPass);
  // useHotkeys matches e.key then e.key.toLowerCase(), so 'k' covers 'K'.
  useHotkeys({ k: () => kineticRulesPass() });

  return (
    <button
      type="button"
      className="kinetic-btn"
      onClick={() => kineticRulesPass()}
      title="KINETIC — recompose the piece under design rules: separation, focal hierarchy, off-center, edge-bleed (K)"
      aria-label="Kinetic — recompose under design rules"
    >
      <span className="kinetic-glyph" aria-hidden="true">◉</span>
      <span className="kinetic-word" aria-hidden="true">
        <span className="kinetic-short">KIN</span>
        <span className="kinetic-rest">ETIC</span>
      </span>
    </button>
  );
}
