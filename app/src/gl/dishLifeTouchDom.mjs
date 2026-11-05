// dishLifeTouchDom.mjs — DISH LIFE slice 3c (#1923): the DOM side of "hands on the instrument".
//
// Any pointer, touch, wheel or key anywhere in the app counts as the performer's hand (the ruled rule: "any
// performer touch ends it — KINETIC always interrupts"). Passive capture-phase listeners on the window, so a panel
// that stops propagation still counts. MIDI and audio reach the bus from their own hooks.
import { noteTouch } from '../engine/dishLifeTouch.mjs';

const POINTER = ['pointerdown', 'pointermove', 'wheel', 'touchstart'];
const KEY = ['keydown'];

/** Install the listeners on `win` (a Window-like). Returns the disposer. A missing window installs nothing. */
export function installDishLifeTouch(win) {
  if (!win || typeof win.addEventListener !== 'function') return () => {};
  const onPointer = () => noteTouch('pointer');
  const onKey = () => noteTouch('key');
  const opt = { capture: true, passive: true };
  for (const t of POINTER) win.addEventListener(t, onPointer, opt);
  for (const t of KEY) win.addEventListener(t, onKey, opt);
  return () => {
    for (const t of POINTER) win.removeEventListener(t, onPointer, opt);
    for (const t of KEY) win.removeEventListener(t, onKey, opt);
  };
}
