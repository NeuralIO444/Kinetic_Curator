/**
 * First-run guided tour data (#222). Pure data + helpers — no components,
 * so the tour stays portable to the planned PLAY/BUILD/ASSETS/OUTPUT
 * consolidation. Rendered by components/TourOverlay.jsx.
 */
export const TOUR_STORAGE_KEY = 'kc:tour-seen';

export const TOUR_STEPS = [
  {
    id: 'preset',
    tab: 'layout',
    title: '1 · Pick a recipe',
    body: 'Open LAYOUT and tap a recipe — V01D, HYDRA, KILN COLUMNS. Each one rebuilds the picture from a seed.',
  },
  {
    id: 'slider',
    tab: 'layout',
    title: '2 · Move a slider',
    body: 'Drag any param slider. The canvas answers live — nothing here can break, so push it around.',
  },
  {
    id: 'play',
    tab: null,
    title: '3 · Hit PLAY',
    body: 'Space (or the MasterBar RUN pill) starts the live loop. Evolve and the phrase bar perform from the DAVIS tab.',
  },
  {
    id: 'still',
    tab: 'pipeline',
    title: '4 · Render a still',
    body: 'PIPELINE → SNAP (S) saves the frame as PNG. The PRINT desk next door stacks post chips for editions.',
  },
];

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
