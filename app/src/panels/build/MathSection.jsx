// MathSection — the MATH shelf in BUILD (#724).
//
// Assignable macro knobs over the fine-grain sliders: one big knob drives
// many sliders at once (scale-all, shift-all, spread-everything). Learn-mode
// assign: hit LEARN on a knob, then wiggle sliders — no menus. Setups persist
// in the project doc. Esc disarms learn.
import { useEffect } from 'react';
import { useStore } from '../../state/store.js';
import { MATH_MAX_MACROS } from '../../curator/mathMacros.js';
import { MacroKnob } from '../../components/MacroKnob.jsx';

export function MathSection() {
  const macros = useStore((s) => s.mathMacros || []);
  const armed = useStore((s) => s.mathLearnArmed);
  const add = useStore((s) => s.addMathMacro);
  const disarm = useStore((s) => s.mathLearnDisarm);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && useStore.getState().mathLearnArmed) disarm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disarm]);

  return (
    <div className="math-section">
      <p className="math-blurb">
        Broad strokes over the fine sliders. One knob drives many sliders at
        once — hit <b>LEARN</b>, wiggle sliders to gang them, then drag the
        knob. It springs back; the macro nudges, never snaps. Setups save
        with the project.
      </p>
      {armed && (
        <p className="math-learning">
          ● Learning — wiggle sliders to assign them. LEARN again or Esc to stop.
        </p>
      )}
      <div className="math-knobs">
        {macros.map((m) => <MacroKnob key={m.id} macro={m} />)}
        {macros.length < MATH_MAX_MACROS && (
          <button className="math-add" onClick={add} title="Add a macro knob">
            + MACRO
          </button>
        )}
      </div>
    </div>
  );
}
