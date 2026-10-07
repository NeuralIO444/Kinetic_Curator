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
// Armed vs. current get distinct visuals: `active` = what's on screen,
// `armed` = pinned for the next roll (outline + pin glyph). The ModeGrid in
// the LAYOUT panel stays the full picker for direct selection.
import { useStore } from '../state/store.js';
import { LAYOUT_MODES } from '../data/layout-modes.js';
import { MOTION_MODES, isMotionActive } from '../data/voices.js';

const MODE_FAVORITES = LAYOUT_MODES.slice(0, 4);

export function ModeStrip() {
  const mode = useStore((s) => s.layoutParams.mode);
  const layoutParams = useStore((s) => s.layoutParams);
  const armedMode = useStore((s) => s.armedMode);
  const armedMotion = useStore((s) => s.armedMotion);
  const toggleArmMode = useStore((s) => s.toggleArmMode);
  const toggleArmMotion = useStore((s) => s.toggleArmMotion);
  const clearRollScope = useStore((s) => s.clearRollScope);
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
              title={isArmed
                ? `${m.name} — ARMED as roll scope. Tap again to disarm.`
                : `${m.name} — arm as roll scope: the next KINETIC roll pins this mode. Key ${i + 1}`}
              aria-pressed={isArmed}
            >
              {m.glyph}
              {isArmed && <span className="pin-glyph" aria-hidden="true">📌</span>}
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
              title={isArmed
                ? `${m.name} — ARMED as roll scope. Tap again to disarm.`
                : `${m.name} — ${m.vibe} Arm as roll scope: the next KINETIC roll pins this motion.`}
              aria-pressed={isArmed}
            >
              {m.name}
              {isArmed && <span className="pin-glyph" aria-hidden="true">📌</span>}
            </button>
          );
        })}
      </div>
      {anyArmed && (
        <button
          type="button"
          className="scope-clear"
          onClick={clearRollScope}
          title="Clear roll scope — back to full-freedom rolls"
          aria-label="Clear roll scope"
        >
          ✕
        </button>
      )}
    </div>
  );
}
