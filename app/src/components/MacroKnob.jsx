// MacroKnob — one assignable math-macro knob (#724).
//
// The knob is a spring-back JOG, not an absolute position: drag vertically
// to drive every assigned slider through its own range proportionally;
// release and the knob returns to center while the sliders stay where they
// landed. The macro nudges — it can never snap a slider or fight a manual
// tweak. Per-target invert (⇅) gives the "spread-everything" gesture.
//
// Learn: hit LEARN, then wiggle any fine-grain sliders — each wiggled
// slider assigns itself ("touch the thing to assign the thing", the #617
// interaction language, mouse/touch instead of MIDI). LEARN again or Esc
// disarms. Assigned targets show as chips: ⇅ flips direction, × removes.
import { useRef, useState, useCallback } from 'react';
import { useStore } from '../state/store.js';
import { getTargetSpec, MATH_MAX_NAME } from '../curator/mathMacros.js';

/** Pixels of vertical drag for one full sweep (delta 1.0). */
const SWEEP_PX = 160;

export function MacroKnob({ macro }) {
  const armed = useStore((s) => s.mathLearnArmed === macro.id);
  const arm = useStore((s) => s.mathLearnArm);
  const remove = useStore((s) => s.removeMathMacro);
  const rename = useStore((s) => s.renameMathMacro);
  const unassign = useStore((s) => s.mathUnassign);
  const toggleInvert = useStore((s) => s.mathToggleInvert);
  const drive = useStore((s) => s.driveMathMacro);

  const [jog, setJog] = useState(0); // -1..1 visual displacement, springs to 0
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(macro.name);
  const drag = useRef(null);
  const jogRef = useRef(0);

  const applyDelta = useCallback((delta) => {
    if (!delta) return;
    drive(macro.id, delta);
    jogRef.current = Math.max(-1, Math.min(1, jogRef.current + delta));
    setJog(jogRef.current);
  }, [drive, macro.id]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY };
    jogRef.current = 0;
    setJog(0);
    setDragging(true);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY; // up = positive
    drag.current.y = e.clientY;
    applyDelta(dy / SWEEP_PX);
  };
  const endDrag = () => {
    drag.current = null;
    jogRef.current = 0;
    setDragging(false);
    setJog(0); // springs back — the CSS transition animates the return
  };

  const onKeyDown = (e) => {
    let d;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') d = 0.05;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') d = -0.05;
    else if (e.key === 'Home') d = -jogRef.current || -1;
    else return;
    e.preventDefault();
    applyDelta(d);
    // Keyboard nudges don't spring back — the knob is a handle, not a value.
    setTimeout(() => { jogRef.current = 0; setJog(0); }, 350);
  };

  const commitName = () => {
    setEditing(false);
    const clean = draft.trim().slice(0, MATH_MAX_NAME);
    if (clean) rename(macro.id, clean);
    else setDraft(macro.name);
  };

  const rotation = jog * 135; // ±135° indicator sweep

  return (
    <div className={`macro-card ${armed ? 'macro-armed' : ''}`}>
      <div className="macro-head">
        {editing ? (
          <input
            className="macro-name-edit" value={draft} autoFocus
            maxLength={MATH_MAX_NAME}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') { setDraft(macro.name); setEditing(false); }
            }}
          />
        ) : (
          <button
            className="macro-name" title="Click to rename"
            onClick={() => { setDraft(macro.name); setEditing(true); }}
          >
            {macro.name}
          </button>
        )}
        <button
          className={`macro-learn ${armed ? 'armed' : ''}`}
          title={armed ? 'Learning — wiggle sliders to assign, click to stop' : 'Learn: arm, then wiggle sliders to assign them'}
          onClick={() => arm(macro.id)}
        >
          {armed ? '● LEARN' : '○ LEARN'}
        </button>
        <button
          className="macro-delete" title="Delete this macro"
          onClick={() => remove(macro.id)}
        >
          ×
        </button>
      </div>

      <div
        className="macro-knob"
        role="slider"
        tabIndex={0}
        aria-label={`${macro.name} macro knob`}
        aria-valuetext={macro.targets.length ? `${macro.targets.length} sliders assigned` : 'no sliders assigned'}
        title="Drag up/down to drive the assigned sliders — springs back. The macro nudges, never snaps."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div
          className={`macro-knob-dial ${dragging ? 'held' : ''}`}
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div className="macro-knob-pointer" />
        </div>
      </div>

      <div className="macro-targets">
        {macro.targets.length === 0 && (
          <span className="macro-empty">
            {armed ? 'wiggle sliders to assign…' : 'hit LEARN, then wiggle sliders'}
          </span>
        )}
        {macro.targets.map((t) => {
          const spec = getTargetSpec(t.key);
          return (
            <span key={t.key} className={`macro-chip ${t.invert ? 'inverted' : ''}`}
              title={spec ? `${spec.label} (${spec.min}–${spec.max})` : t.key}>
              <button
                className="macro-invert"
                title={t.invert ? 'Direction: down when the knob goes up — click to flip' : 'Direction: up with the knob — click to flip'}
                onClick={() => toggleInvert(macro.id, t.key)}
              >
                {t.invert ? '⇅' : '⇈'}
              </button>
              {spec ? spec.label : t.key}
              <button
                className="macro-unassign" title="Remove from this macro"
                onClick={() => unassign(macro.id, t.key)}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
