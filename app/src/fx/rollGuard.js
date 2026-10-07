// rollGuard.js — after a roll lands, look at the frame; if it is dead, deal again (#1107).
//
// Pure of the DOM and the store: everything it touches is injected, so the selfcheck drives it with fakes.
//   settle()      resolves when the rolled frame has had time to bake and present
//   capture()     resolves { pixels } of a small downsample of the PRESENTED frame (or null)
//   unchanged()   true while the state is still exactly the roll that landed (a manual edit or a newer roll
//                 makes it false: the guard never touches what a person did after the roll)
//   redeal(kind)  undo the dead roll, then roll again (so the accepted roll is the one entry in undo)
// At most MAX_REDEALS silent re-deals per press, then it stops and keeps what it has. A newer press cancels an
// older check (generation counter), so hammering KIN never stacks guards.
import { frameHealth, isDeadFrame } from './frameHealth.js';

export const MAX_REDEALS = 3;

export function createRollGuard({ settle, capture, unchanged, redeal, health = frameHealth, onDead = () => {} }) {
  let gen = 0;
  /** @returns {Promise<{redeals:number, dead:boolean, cancelled:boolean}>} */
  async function check(kind, snapshot) {
    const mine = ++gen;
    let redeals = 0;
    for (;;) {
      await settle();
      if (mine !== gen || !unchanged(snapshot)) return { redeals, dead: false, cancelled: true };
      const frame = await Promise.resolve().then(capture).catch(() => null);
      if (mine !== gen || !unchanged(snapshot)) return { redeals, dead: false, cancelled: true };
      if (!frame || !frame.pixels) return { redeals, dead: false, cancelled: false }; // can't see: trust the roll
      const h = health(frame.pixels);
      if (!isDeadFrame(h)) return { redeals, dead: false, cancelled: false };
      if (redeals >= MAX_REDEALS) return { redeals, dead: true, cancelled: false };
      onDead(kind, h, redeals);
      snapshot = redeal(kind);
      redeals += 1;
    }
  }
  return { check, cancel: () => { gen += 1; } };
}
