// tasteGate — the experimental taste switch (Matt, 2026-10-08; #762).
//
// The rule does not change: a taste whose distilled head scores below 0.3 fidelity (HEAD_MIN_FIDELITY) cannot
// reproduce the taste it was trained on, so by default the instrument ignores it and the persona curator stays on.
// This is the artist's own switch, per machine, OFF by default: with it on, a below-bar head may steer anyway, and
// every readout says "experimental" for as long as it does. It exists so a thin first model can be felt and iterated
// on without lowering the bar for anyone else. A head that is not even positively correlated (fidelity <= 0) never
// steers, switch or no switch: that would be noise wearing a taste's name.
export const EXPERIMENTAL_KEY = 'kc:taste:experimental:v1';

function read() {
  try {
    return localStorage.getItem(EXPERIMENTAL_KEY) === '1';
  } catch {
    return false;
  }
}

let on = read();

export function experimentalOn() {
  return on;
}

export function setExperimental(value) {
  on = !!value;
  try {
    if (on) localStorage.setItem(EXPERIMENTAL_KEY, '1');
    else localStorage.removeItem(EXPERIMENTAL_KEY);
  } catch {
    // private window / quota: the switch still holds for this session
  }
  return on;
}
