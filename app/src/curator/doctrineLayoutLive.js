// curator/doctrineLayoutLive.js — #2386 (P6): the live reads behind a doctrine's layout call.
//
// Two reads, both at ARM time only (never in a frame; the draw reads the record and nothing else):
//   doctrineLayoutOn()      the per-machine switch, off by default (window.__KC_DOCTRINE_LAYOUT === true)
//   layoutStanceNow(id)     what the band said to this horn this phrase (build / counter / rest), or null — the band
//                           off, or its numbers unruled, always reads null
import { getBandView } from '../personas/bandLive.js';
import { bandRead } from './hornFaces.js';
import { layoutStance } from './doctrineLayout.mjs';

export function doctrineLayoutOn() {
  try {
    return globalThis.__KC_DOCTRINE_LAYOUT === true;
  } catch {
    return false;
  }
}

export function layoutStanceNow(id) {
  try {
    const read = bandRead(id, getBandView());
    return read ? layoutStance(read.answer) : null;
  } catch {
    return null;
  }
}
