import { emit, Events } from '../composition/eventBus.js';
import { useApp } from '../state/AppContext.jsx';
import { QUALITY_PRESETS, getBudgetName } from '../data/quality.js';

// BudgetKnob — the one performer-facing governor knob (#296, R3 of the
// governor×TE roadmap). It replaces the AUTO ON/OFF boolean with a chosen
// ceiling: FULL / SHOW / LEAN — the quality tiers renamed as deliberate
// creative constraints.
//
// Interaction is modeled on the 30FPS frame-lock: tactile, deliberately
// chosen, never auto-cleared. Choosing a ceiling sets the tier AND arms
// the governor (autoQuality on) — the governor then defends the budget you
// set: it may shed downward from the ceiling when frames demand it and
// restores back up to it, but the ceiling itself is yours and is never
// cleared automatically. (A manual quality choice cancels any governor
// quality-shed claim via SET_QUALITY, so recovery never overrides the
// operator's own tier — the existing #264 contract.)
//
// #2483 — the ceiling is its own store field (qualityCeiling), written
// only through that SET_QUALITY choice and by project load. The governor
// sheds the separate live tier (`quality`) underneath it, so the pressed
// button here always shows the performer's choice exactly as set; while
// a shed claim is active the knob adds a small "shedding" tag instead of
// moving the button.
//
// The store's autoQuality flag stays exactly as the governor reads it;
// this knob only ever arms, never disarms. A legacy project saved with
// the governor off keeps it off (compatibility) — the knob reads dimmed
// until a ceiling is chosen, which re-arms.

const CEILING_ORDER = ['high', 'balanced', 'performance'];

export function BudgetKnob() {
  const { state } = useApp((s) => ({
    quality: s.quality,
    qualityCeiling: s.qualityCeiling,
    qualityShedFrom: s.qualityShedFrom,
    autoQuality: s.autoQuality,
  }));
  const { quality = 'balanced', qualityCeiling = 'balanced', qualityShedFrom = null, autoQuality = true } = state;

  // The governor is underneath the ceiling right now: it holds a shed
  // claim (qualityShedFrom) and the live tier sits below the choice.
  const shedding = autoQuality && qualityShedFrom != null;

  const choose = (tierId) => {
    if (tierId === qualityCeiling && autoQuality) return;
    emit(Events.EXPORT_QUALITY, tierId);
    emit(Events.EXPORT_AUTO_QUALITY, true);
  };

  const armedTitle =
    'Your performance budget — the governor defends it. ' +
    'It may shed below your ceiling to hold frame rate and restores back up ' +
    'to it; your choice is never cleared automatically.';
  const disarmedTitle =
    'Governor currently off (legacy project setting). ' +
    'Choose a ceiling to arm it — the governor will then defend that budget.';

  return (
    <div
      className="undo-group"
      role="group"
      aria-label="Performance budget ceiling"
      title={autoQuality ? armedTitle : disarmedTitle}
      style={autoQuality ? undefined : { opacity: 0.55 }}
    >
      <span className="meter-label lbl" style={{ marginRight: 2 }}>
        budget
      </span>
      {CEILING_ORDER.map((tierId) => {
        const preset = QUALITY_PRESETS[tierId];
        const active = qualityCeiling === tierId && autoQuality;
        return (
          <button
            key={tierId}
            type="button"
            className={`undo-btn ${active ? '' : 'disabled'}`}
            aria-pressed={active}
            onClick={() => choose(tierId)}
            title={`${getBudgetName(tierId)} — ${preset.description}. ${autoQuality ? 'Governor defends this budget.' : 'Choosing re-arms the governor.'}`}
            style={active ? { borderColor: 'var(--accent)', color: 'var(--accent)', opacity: 1 } : undefined}
          >
            {getBudgetName(tierId)}
          </button>
        );
      })}
      {shedding ? (
        <span
          className="lbl"
          title={`The governor is shedding below your ceiling to hold frame rate (currently ${getBudgetName(quality)}). It restores back up to your ceiling when frames recover.`}
          style={{ marginLeft: 4, color: 'var(--kc-warn)', fontSize: '9px', letterSpacing: '0.08em' }}
        >
          shedding
        </span>
      ) : null}
    </div>
  );
}
