// Mode/behave quick strip (#964) — MODE/MOTION chips as roll-scope
// modifiers, always visible like the PaletteStrip.
//
// The chips no longer select composition/motion outright. Tapping a chip
// ARMS it: the armed MODE pins the layout mode (and keeps the composition
// too), the armed MOTION pins the motion numbers. The next KINETIC roll
// reworks everything else ("more like this, but different"). No chips
// armed → today's full-freedom roll. Tap again to disarm; the ✕ clears all.
// Arms persist until disarmed — the fast, performance-friendly version of
// the Build panel's locks.
//
// Armed vs. current get distinct visuals: `active` (filled) = what's on
// screen, `armed` = pinned for the next roll of its axis. #2050: armed is a
// discrete fact, so it renders TE — a corner detent on the chip — never a
// fill change and never the Davis outline + pin emoji the first version wore. The
// detent is a pure readout of the store's arm state (armedMode /
// armedMotion — the same state the rolls read and the bus publishes): it
// stands exactly while the arm stands. Arms persist across rolls until
// disarmed (#964), so the detent survives rolls too; it clears in the same
// commit the arm itself clears. The ModeGrid in the LAYOUT panel stays the
// full picker for direct selection.
import { useStore } from '../state/store.js';
import { LAYOUT_MODES } from '../data/layout-modes.js';
import { MOTION_MODES, isMotionActive } from '../data/voices.js';
import { emit, Events } from '../composition/eventBus.js';
import { PoemRow } from './PoemRow.jsx'; // #1918 — the poem rides this strip, to the right of motion (Matt 2026-11-02)

const MODE_FAVORITES = LAYOUT_MODES.slice(0, 4);

export function ModeStrip() {
  const mode = useStore((s) => s.layoutParams.mode);
  const layoutParams = useStore((s) => s.layoutParams);
  const armedMode = useStore((s) => s.armedMode);
  const armedMotion = useStore((s) => s.armedMotion);
  const toggleArmMode = useStore((s) => s.toggleArmMode);
  const toggleArmMotion = useStore((s) => s.toggleArmMotion);
  const anyArmed = armedMode != null || armedMotion != null;

  return (
    <div className="mode-strip">
      <span className="mode-strip-label lbl">mode</span>
      <div className="mode-strip-chips">
        {MODE_FAVORITES.map((m, i) => {
          const isArmed = armedMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className={`chip-btn ${mode === m.id ? 'active' : ''}${isArmed ? ' armed' : ''}`}
              onClick={() => toggleArmMode(m.id)}
              title={
                isArmed
                  ? `${m.name} — ARMED as roll scope. Tap again to disarm.`
                  : `${m.name} — arm as roll scope: the next KINETIC roll pins this mode. Key ${i + 1}`
              }
              aria-pressed={isArmed}
            >
              {m.glyph}
              {isArmed && <span className="chip-detent" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <span className="mode-strip-label lbl">motion</span>
      <div className="mode-strip-chips">
        {MOTION_MODES.map((m) => {
          const isArmed = armedMotion === m.id;
          return (
            <button
              key={m.id}
              type="button"
              className={`chip-btn act ${isMotionActive(layoutParams, m) ? 'active' : ''}${isArmed ? ' armed' : ''}`}
              onClick={() => toggleArmMotion(m.id)}
              title={
                isArmed
                  ? `${m.name} — ARMED as roll scope. Tap again to disarm.`
                  : `${m.name} — ${m.vibe} Arm as roll scope: the next KINETIC roll pins this motion.`
              }
              aria-pressed={isArmed}
            >
              {m.name}
              {isArmed && <span className="chip-detent" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {anyArmed && (
        <button
          type="button"
          className="scope-clear"
          onClick={() => emit(Events.ROLL_SCOPE_CLEAR)}
          title="Clear roll scope — back to full-freedom rolls"
          aria-label="Clear roll scope"
        >
          ✕
        </button>
      )}
      <PoemRow />
    </div>
  );
}
