// useMidi — runs the MIDI engine while `midiEnabled` (#617).
//
// Enabling is an explicit click (the browser asks for MIDI access on that
// gesture); nothing connects at boot. The engine talks to the instrument only
// through the event bus and the store, so a mapped pad does exactly what the
// on-screen button does.
import { useEffect } from 'react';
import { useStore } from '../state/store.js';
import { emit, Events } from '../composition/eventBus.js';
import { createMidiEngine } from '../midi/engine.mjs';

export function useMidi() {
  const enabled = useStore((s) => s.midiEnabled);
  useEffect(() => {
    if (!enabled) return undefined;
    const engine = createMidiEngine({
      requestAccess: typeof navigator !== 'undefined' && navigator.requestMIDIAccess ? navigator.requestMIDIAccess.bind(navigator) : null,
      getMap: () => useStore.getState().midiMap,
      ctx: { emit, Events, getState: useStore.getState },
      onStatus: (status) => useStore.getState().setMidiStatus(status),
      onMessage: (msg) => { useStore.getState().setMidiLast(msg); return false; },
    });
    engine.start();
    return () => {
      engine.stop();
      useStore.getState().setMidiLast(null);
    };
  }, [enabled]);
}
