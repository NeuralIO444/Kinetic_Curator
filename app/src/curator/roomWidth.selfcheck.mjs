// node src/curator/roomWidth.selfcheck.mjs
// #1145 step 3 — LOIS's room tightens or loosens Davis's shifts, from the room table's own kin_weight.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KIN_FULL, ROOM_MIN, roomWidthFor, roomWidthFromCodes } from './roomWidth.js';
import { DIRECTOR_TABLE } from './directorTable.js';
import { createShiftTracker, shiftWidthFor } from './davisShift.js';
import { BAND_NORMAL, BAND_RELAX } from './stress.js';

// 1. no room (silence is the default) is step 2's width exactly
{
  assert.deepEqual(roomWidthFor(null), { width: 1, room: null });
  assert.deepEqual(roomWidthFromCodes(null, 'FLOW'), { width: 1, room: null });
  assert.deepEqual(roomWidthFromCodes('NOD', null), { width: 1, room: null });
  assert.deepEqual(roomWidthFromCodes('???', '???'), { width: 1, room: null });
}

// 2. it follows the room's own kin_weight: the rooms that roll more also shift more, never above the band's width
{
  const rooms = Object.keys(DIRECTOR_TABLE);
  assert.equal(rooms.length, 20);
  for (const key of rooms) {
    const [l, d] = key.split('\u00d7');
    const r = roomWidthFromCodes(l, d);
    const kin = DIRECTOR_TABLE[key].kin_weight;
    assert.ok(r.width >= ROOM_MIN && r.width <= 1, `${key}: ${r.width}`);
    assert.ok(Math.abs(r.width - Math.min(1, Math.max(ROOM_MIN, kin / KIN_FULL))) < 1e-12, `${key} follows its kin_weight`);
    assert.deepEqual([r.room.lois, r.room.davis], [l, d]);
    assert.ok(Number.isInteger(r.room.n) && r.room.n >= 1 && r.room.n <= 20);
  }
  const savour = roomWidthFromCodes('NOD', 'BLOOM').width; // the earned keep: kin 0.5
  const both = roomWidthFromCodes('BURN', 'FLOW').width; // both barrels: kin 1.75
  const mid = roomWidthFromCodes('VIBE', 'SEEDLING').width; // kin 1.0
  assert.ok(savour < mid && mid < both, `savoured ${savour.toFixed(2)} < steady ${mid.toFixed(2)} < both barrels ${both.toFixed(2)}`);
  assert.equal(both, 1, 'the hottest room lets Davis use the band\'s whole width');
}

// 3. it only ever narrows what the band allows, and the width of a shift is band x room
{
  const t = (room) => createShiftTracker().update([{ x: 1, y: 1, formed: true }], { seed: 9, band: BAND_RELAX, room }).born[0];
  const full = t(null);
  const savour = t(() => roomWidthFromCodes('NOD', 'BLOOM'));
  assert.equal(full.width, shiftWidthFor(BAND_RELAX));
  assert.ok(Math.abs(savour.width - shiftWidthFor(BAND_RELAX) * roomWidthFromCodes('NOD', 'BLOOM').width) < 1e-3);
  assert.ok(savour.width < full.width);
  assert.deepEqual(savour.room, roomWidthFromCodes('NOD', 'BLOOM').room, 'the room that gave the shift is on the event');
  assert.equal(full.room, null);
  // the room is read at a birth and only then (a function is called lazily)
  let calls = 0;
  const tr = createShiftTracker();
  const room = () => { calls += 1; return roomWidthFromCodes('VIBE', 'FLOW'); };
  tr.update([{ x: 1, y: 1, formed: false }], { seed: 1, band: BAND_NORMAL, room });
  assert.equal(calls, 0, 'no birth, no room read');
  tr.update([{ x: 1, y: 1, formed: true }], { seed: 1, band: BAND_NORMAL, room });
  tr.update([{ x: 1, y: 1, formed: true }], { seed: 1, band: BAND_NORMAL, room });
  assert.equal(calls, 1, 'read once, at the birth');
  // a moth born in a savoured room differs less from standard than one born in a burn (same seed, place, band)
  const spread = (kinCodes) => {
    let m = 0;
    for (let s = 1; s <= 200; s++) {
      const b = createShiftTracker().update([{ x: 10 + s, y: 5, formed: true }], { seed: s, band: BAND_RELAX, room: () => roomWidthFromCodes(...kinCodes) }).born[0];
      m += Math.abs(b.traits.spread) + Math.abs(b.traits.wing - 1) * 30;
    }
    return m / 200;
  };
  assert.ok(spread(['NOD', 'BLOOM']) < spread(['BURN', 'FLOW']), 'the savoured room keeps moths closer to standard');
}

// 4. wired: the app reads the room from the honest feed at a birth; the module imports only the room table
{
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.ok(/setRoomProvider\(\(\) => \{[\s\S]*?loisActivity\.snapshot\(\)[\s\S]*?roomWidthFromCodes\(/.test(app));
  const live = readFileSync(new URL('./formationLive.js', import.meta.url), 'utf8');
  assert.ok(/room: \(\) => \{ try \{ return roomProvider \? roomProvider\(\) : null; \} catch \{ return null; \} \}/.test(live), 'a broken room is no room, never a broken frame');
}

console.log('roomWidth.selfcheck: ok (#1145 step 3)');
