// roomFeed.selfcheck.mjs — #1560 S1: the codec transcript's content law, proven against the classifier.
// Persona lines only from decisions that carry an utterance; the Queen never becomes a line (law 2);
// room events only from facts the bus already carries; the window holds the last 60, in arrival order.
import assert from 'node:assert/strict';
import { personaLineFrom, roomLineFrom, verdictLineOf, createRoomFeed, tasteBlocks, ROOM_FEED_MAX, startRoomFeed, getRoomFeed, getRoomDepth, resetRoomFeed } from './roomFeed.js';
import { Events, emit } from '../composition/eventBus.js';

// ── persona utterances: only what a persona actually emitted ────────────────────────────────────────────────────
const d = personaLineFrom({ persona: 'davis', bar: 121, backend: 'rules', reply: { line: 'New seed, quiet room.' } });
assert.equal(d.kind, 'persona'); assert.equal(d.persona, 'davis'); assert.equal(d.bar, 121);
assert.equal(d.text, 'New seed, quiet room.');
const l = personaLineFrom({ persona: 'lois', bar: 127, reply: { line: '  VIBE. Barely.  ' } });
assert.equal(l.text, 'VIBE. Barely.', 'the line is the persona’s own words, trimmed of transport padding');
assert.equal(personaLineFrom({ persona: 'davis', bar: 3, reply: {} }), null, 'no line in the reply, no line in the transcript');
assert.equal(personaLineFrom({ persona: 'davis', bar: 3, reply: { line: '   ' } }), null, 'a blank utterance is silence');
assert.equal(personaLineFrom({ persona: 'davis', bar: 3 }), null, 'no reply at all is silence');
assert.equal(personaLineFrom({ persona: 'queen', bar: 3, reply: { line: 'sway this way' } }), null, 'law 2: the Queen has no lines');
assert.equal(personaLineFrom({ persona: 'davis', bar: 1.5, reply: { line: 'x' } }).bar, null, 'a non-integer bar is no bar tag');
assert.equal(personaLineFrom(null), null);

// ── room events: neutral facts the bus carries ──────────────────────────────────────────────────────────────────
assert.equal(roomLineFrom(Events.DICE_CAST, { assetIds: ['a', 'b', 'c'] }).text, 'crown landed · 3');
assert.equal(roomLineFrom(Events.DICE_CAST, {}).text, 'crown landed');
assert.equal(verdictLineOf('THE ROOM'), '— the room, working —', 'the frozen mockup’s tail line, verbatim');
assert.equal(verdictLineOf('THE CLASH'), '— the room, the clash —');
assert.equal(verdictLineOf(''), null);
assert.equal(roomLineFrom(Events.DIRECTOR_ROOM, { verdict: 'FULL BURN' }).text, '— the room, full burn —');
assert.equal(roomLineFrom(Events.DIRECTOR_ROOM, {}), null, 'a room record with no verdict is not transcript matter');
const applied = roomLineFrom(Events.MIND_ROUTE, { status: 'applied', op: { op: 'add', input: 'kick', target: 'swirl', depth: 0.5 } });
assert.equal(applied.text, 'route landed · + kick > swirl 0.5', 'the route speaks in the route table’s own words (describeOp)');
assert.equal(roomLineFrom(Events.MIND_ROUTE, { status: 'dropped', reason: 'off phrase', op: {} }).text, 'route dropped · off phrase');
assert.equal(roomLineFrom(Events.MIND_ROUTE, { status: 'applied', op: null }), null, 'an un-describable route is not narrated');
assert.equal(roomLineFrom(Events.BLOOM, { rolls: 41 }).text, 'bloom · a voice earned after 41 rolls');
assert.equal(roomLineFrom(Events.BLOOM, {}).text, 'bloom · a voice earned');
assert.equal(roomLineFrom(Events.CLOCK_BAR, { bar: 9 }), null, 'the clock itself is not a room event');
assert.equal(roomLineFrom('nope', {}), null);

// ── the retained window: last 60, in order; a standing verdict is not news twice ────────────────────────────────
{
  const feed = createRoomFeed();
  for (let i = 1; i <= ROOM_FEED_MAX + 5; i++) feed.push({ kind: 'persona', persona: 'davis', bar: i, text: `line ${i}` });
  assert.equal(feed.depth(), ROOM_FEED_MAX, 'the window is the bus depth: 60');
  assert.equal(feed.records()[0].text, 'line 6', 'the oldest fall off the top; order is arrival order');
  assert.equal(feed.records().at(-1).text, `line ${ROOM_FEED_MAX + 5}`);
}
{
  const feed = createRoomFeed();
  feed.push(roomLineFrom(Events.DIRECTOR_ROOM, { verdict: 'THE ROOM' }));
  feed.push(roomLineFrom(Events.DIRECTOR_ROOM, { verdict: 'THE ROOM', intensity: 'warm' }));
  assert.equal(feed.depth(), 1, 'the same verdict again (a warmer band) is not a second line');
  feed.push(roomLineFrom(Events.DIRECTOR_ROOM, { verdict: 'THE CLASH' }));
  feed.push(roomLineFrom(Events.DIRECTOR_ROOM, { verdict: 'THE ROOM' }));
  assert.equal(feed.depth(), 3, 'a verdict that changes away and back is news both times');
  feed.push({ kind: 'room', text: '' });
  assert.equal(feed.depth(), 3, 'an empty line never enters the window');
  feed.clear();
  assert.equal(feed.depth(), 0);
}

// ── the TASTE meter: the taste head’s fidelity, with the house’s absent-below-the-bar read ───────────────────────
assert.equal(tasteBlocks(null), 0);
assert.equal(tasteBlocks({}), 0);
assert.equal(tasteBlocks({ head: { fidelity: 0.2 } }), 0, 'below the fidelity bar the taste reads as absent');
assert.equal(tasteBlocks({ head: { fidelity: 0.3 } }), 3);
assert.equal(tasteBlocks({ head: { fidelity: 0.8 } }), 8);
assert.equal(tasteBlocks({ head: { fidelity: 1 } }), 10);
assert.equal(tasteBlocks({ head: { fidelity: 2 } }), 10, 'clamped to the meter’s slots');

// ── live wiring: the feed hears the real bus, in arrival order, and the Queen stays off it ───────────────────────
{
  const stop = startRoomFeed();
  resetRoomFeed();
  emit(Events.MIND_DECISION, { persona: 'davis', bar: 121, backend: 'rules', reply: { line: 'New seed, quiet room.' } });
  emit(Events.MIND_DECISION, { persona: 'queen', bar: 121, backend: 'rules', reply: { line: 'never rendered' } });
  emit(Events.MIND_DECISION, { persona: 'lois', bar: 122, backend: 'rules', reply: {} }); // no utterance: silence
  emit(Events.DICE_CAST, { assetIds: ['a', 'b'] });
  emit(Events.DIRECTOR_ROOM, { verdict: 'THE ROOM', n: 6, lois: 'VIBE', davis: 'FLOW', intensity: 'mid', relaxing: false, phase: 'explore' });
  const recs = getRoomFeed();
  assert.equal(getRoomDepth(), 3, 'three records: one utterance, one crown, one room line');
  assert.deepEqual(recs.map((r) => r.text), ['New seed, quiet room.', 'crown landed · 2', '— the room, working —']);
  assert.equal(recs[0].bar, 121);
  stop();
  resetRoomFeed();
}

console.log('roomFeed.selfcheck: OK');
