// KINETIC button (#942 shell, #943 RULES layer, #944 WEATHER layer) — the
// top-menu storm generator.
//
// Tap routing (#944): a tap within ~2s of the previous tap finds the button
// "warm" and runs the WEATHER pass — palette weather, light mood,
// atmospheric FX over the same structure (skeleton holds; air changes).
// Otherwise it's a fresh RULES pass — a restrained structural reworking
// (separation, focal hierarchy, off-center allowed, edge-bleed) in one undo
// step. Heat/CHAOS (#945) will conduct tap order later; kineticRoll (the
// naive full re-roll) stays in the slice for #945's heat ceiling.
//
// The button breathes on the x-axis: a compact pill at rest (comfortable
// touch target, menu row stays clean), expanding to the full KINETIC label
// on hover/press/focus. Heat-driven swelling lands with #945.
import { useRef } from 'react';
import { useStore } from '../../state/store.js';
import { useHotkeys } from '../../hooks/useHotkeys.js';
import { routeKineticTap } from './kineticWarm.mjs';

export function KineticButton() {
  const kineticRulesPass = useStore((s) => s.kineticRulesPass);
  const kineticWeatherPass = useStore((s) => s.kineticWeatherPass);
  // Warm-window tap tracking (#944): a human-gesture timestamp, kept in the
  // button — not the document — so the store stays wall-clock-free (#806).
  const lastTapRef = useRef(0);
  const tap = () => {
    const now = Date.now();
    const kind = routeKineticTap(lastTapRef.current, now);
    lastTapRef.current = now;
    if (kind === 'weather') kineticWeatherPass();
    else kineticRulesPass();
  };
  // useHotkeys matches e.key then e.key.toLowerCase(), so 'k' covers 'K'.
  useHotkeys({ k: tap });

  return (
    <button
      type="button"
      className="kinetic-btn"
      onClick={tap}
      title="KINETIC — tap: recompose under design rules; tap again while warm: drift the atmosphere (K)"
      aria-label="Kinetic — recompose, or drift the atmosphere on a warm second tap"
    >
      <span className="kinetic-glyph" aria-hidden="true">◉</span>
      <span className="kinetic-word" aria-hidden="true">
        <span className="kinetic-short">KIN</span>
        <span className="kinetic-rest">ETIC</span>
      </span>
    </button>
  );
}
