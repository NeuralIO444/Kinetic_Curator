// wetLive.mjs — #1841: the wet field's service mode, on one wire
// (the statsLive pattern, #1807). The live loop publishes how the
// wet-frame service served the field on every frame it requests —
// { mode, shed } — and the personas' show block reads it from here
// for its shed line: degradation at perfTier1 is VISIBLE in the
// show block, never a silent mode death (#1809's acceptance, owed
// since slice A; the line lands with the first degraded consumer,
// the dish). Only the two modes with something to say are carried:
// 'degraded' (a wanting consumer is being served stamps-only under
// a shed) and 'shed' (a wanting consumer was stood down). 'live'
// and 'off' publish null — the silence-is-default law: the line
// exists only while the field is not whole.

let line = null; // { mode: 'degraded' | 'shed', shed: string | null } | null

/** The live loop's per-frame publish: how the service just served. */
export function publishWetMode(mode, shed) {
  line = mode === 'degraded' || mode === 'shed' ? { mode, shed: shed || null } : null;
}

/** The show block's shed line, or null while the field is whole. */
export function getWetModeLine() {
  return line;
}

/** The loop ended: the wire carries nothing again. */
export function clearWetMode() {
  line = null;
}
