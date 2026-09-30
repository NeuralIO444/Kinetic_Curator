// engine.mjs — Web MIDI in, honest about every way it can fail (#617).
//
// createMidiEngine() wraps navigator.requestMIDIAccess behind an injectable
// `requestAccess`, so every state is testable without hardware:
//
//   unsupported — no Web MIDI here (Safari, Firefox without the add-on)
//   denied      — the browser refused / the user said no
//   no-devices  — access granted, nothing plugged in
//   ready       — N inputs, handlers attached
//
// Hot-plug is handled (statechange): an unplugged input is dropped from the
// status line by name. Nothing is left "zombie": when the last input a hold was
// engaged on disappears, every held target is RELEASED (a frozen canvas must not
// stay frozen because a cable was pulled). The mapping itself is project data and
// stays; the status says the device is gone.
import { parseMidi, bindKey } from './message.mjs';
import { getMidiTarget } from './targets.mjs';

/**
 * Apply one parsed message to the mapping. Pure of hardware; `state` carries the
 * edge-detection memory ({ prevCc: Map, held: Map<targetId, sourceInput> }).
 * @returns {string|null} the target id that fired, or null
 */
export function dispatchMidi(msg, map, ctx, state, source = null) {
  const key = bindKey(msg);
  const id = map[key];
  const target = id ? getMidiTarget(id) : null;
  if (!target) return null;
  const isCc = msg.type === 'cc';
  if (target.kind === 'cc') {
    if (!isCc) return null;
    target.run(ctx, msg.value / 127);
    return id;
  }
  const on = isCc ? msg.value >= 64 : msg.type === 'noteon';
  if (target.kind === 'hold') {
    const was = state.held.has(id);
    if (on === was) return null;
    if (on) state.held.set(id, source); else state.held.delete(id);
    target.run(ctx, on);
    return id;
  }
  // trigger: fire on the rising edge only (a pad's note-off, or a CC falling, does nothing)
  if (isCc) {
    const was = state.prevCc.get(key) ?? 0;
    state.prevCc.set(key, msg.value);
    if (!(msg.value >= 64 && was < 64)) return null;
  } else if (!on) {
    return null;
  }
  target.run(ctx);
  return id;
}

/**
 * Release engaged holds: all of them (stop), or only those whose source input is
 * no longer connected (`stillConnected`, a Set), so pulling one cable never
 * leaves a frozen canvas behind but doesn't disturb another device's hold.
 */
export function releaseHolds(ctx, state, stillConnected = null) {
  for (const [id, src] of [...state.held]) {
    if (stillConnected && src && stillConnected.has(src)) continue;
    state.held.delete(id);
    getMidiTarget(id)?.run(ctx, false);
  }
}

export function createMidiEngine({ requestAccess, getMap, ctx, onStatus = () => {}, onMessage = () => false }) {
  const state = { prevCc: new Map(), held: new Map() };
  let access = null;
  let attached = new Set();
  let stopped = false;
  let last = { state: 'off', inputs: [], error: '' };
  const publish = (next) => { last = { ...last, ...next }; onStatus(last); };

  const handle = (e) => {
    const msg = parseMidi(e.data);
    if (!msg) return;
    // learn mode (PR 2) claims the message; a consumed message never also fires a mapping
    if (onMessage(msg) === true) return;
    dispatchMidi(msg, getMap(), ctx, state, e.target ?? null);
  };

  function scan() {
    if (!access || stopped) return;
    const inputs = [...access.inputs.values()].filter((i) => i.state !== 'disconnected');
    const now = new Set(inputs);
    for (const i of attached) if (!now.has(i)) { try { i.onmidimessage = null; } catch { /* gone */ } }
    for (const i of inputs) i.onmidimessage = handle;
    const lost = [...attached].filter((i) => !now.has(i)).map((i) => i.name || 'MIDI device');
    attached = now;
    releaseHolds(ctx, state, now); // a hold engaged by an unplugged device must not stay engaged
    if (inputs.length === 0) {
      publish({ state: 'no-devices', inputs: [], error: lost.length ? `unplugged: ${lost.join(', ')}` : '' });
    } else {
      publish({ state: 'ready', inputs: inputs.map((i) => i.name || 'MIDI device'), error: lost.length ? `unplugged: ${lost.join(', ')}` : '' });
    }
  }

  return {
    get status() { return last; },
    async start() {
      stopped = false;
      if (typeof requestAccess !== 'function') { publish({ state: 'unsupported', inputs: [], error: 'Web MIDI is not available in this browser (use Chrome or Edge)' }); return last; }
      publish({ state: 'connecting', inputs: [], error: '' });
      try {
        access = await requestAccess({ sysex: false });
      } catch (e) {
        publish({ state: 'denied', inputs: [], error: `MIDI access refused${e?.message ? `: ${e.message}` : ''}` });
        return last;
      }
      if (stopped) return last;
      access.onstatechange = scan;
      scan();
      return last;
    },
    stop() {
      stopped = true;
      for (const i of attached) { try { i.onmidimessage = null; } catch { /* gone */ } }
      attached = new Set();
      if (access) access.onstatechange = null;
      releaseHolds(ctx, state);
      access = null;
      publish({ state: 'off', inputs: [], error: '' });
    },
  };
}
