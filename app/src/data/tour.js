/**
 * First-run guided tour data (#222, re-aimed #535). Pure data + helpers — no
 * components, so the tour stays portable across panel renames. Rendered by
 * components/TourOverlay.jsx.
 *
 * Step tabs are registry ids; bodies name the tab titles the user actually
 * sees (BUILD, PLAY, PIPELINE). Derived copy (tooltips, help text) must read
 * TOUR_STEPS via tourStepNames()/tourStepIds() — never hardcode the list.
 */
export const TOUR_STORAGE_KEY = 'kc:tour-seen';

export const TOUR_STEPS = [
  {
    id: 'look',
    tab: null,
    title: '1 · Pick a Look',
    body: 'Hit looks ▾ in the strip up top. A Look re-costumes the layout — your palette and marks stay put.',
  },
  {
    id: 'slider',
    tab: 'build',
    title: '2 · Push it around',
    body: 'Drag any BUILD slider. The canvas answers live — nothing here can break, so push it around.',
  },
  {
    id: 'play',
    tab: 'play',
    title: '3 · Hit PLAY',
    body: 'Space (or the ▶ RUN pill up top) starts the live loop. Evolve and the phrase bar perform from the PLAY tab.',
  },
  {
    id: 'still',
    tab: 'pipeline',
    title: '4 · Keep the moment',
    body: 'PIPELINE → ↓ SNAP (S) saves the frame as PNG. The PRINT DESK block in the same panel handles post and editions.',
  },
];

/**
 * Plain-language step names, derived from TOUR_STEPS so tooltips and help
 * text can never drift from the tour (#535). "Pick a Look, Push it around…"
 */
export function tourStepNames() {
  return TOUR_STEPS.map((s) => s.title.replace(/^\d+\s*·\s*/, ''));
}

/** Stable short ids for compact derived copy: "look, slider, play, still". */
export function tourStepIds() {
  return TOUR_STEPS.map((s) => s.id);
}

/**
 * Flip the panel tab strip to `tab`. The tour is a card, not coach marks
 * (#158): the operator sees the real control. Never throws — a tour must
 * never break the app.
 */
export function activateTourTab(tab) {
  if (!tab) return;
  try {
    document.getElementById(`kc-tab-${tab}`)?.click();
  } catch { /* ignore */ }
}

export function hasSeenTour() {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
