// node src/curator/canonBus.selfcheck.mjs
// #2049 (Canon S6) — the trio sees the system: Canon records on the core buses. Pins:
//   1. a Canon record carries a declared bus binding, in the bus's own vocabulary (decisions, not frames)
//   2. the probe: the DECLARATION is what connects it — the binder wires exactly what a record lists, and a
//      record that does not list a channel is deaf to it (no hand-wired driver)
//   3. a record announces itself when it takes the stage (canon:stand, once per standing, stamped with its cause)
//   4. the per-bar persona context includes the Canon/bus state — proven by a context snapshot
//   5. the replay law holds: a recorded take replays unchanged; the Canon is muted in replay, asks the stage for
//      nothing, and the rules backend answers exactly as it did
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { on, emit, Events } from '../composition/eventBus.js';
import { CANON_STYLES, CANON_STYLE_BUS, canonStyleRecord } from '../data/canon/styles.js';
import { canonStyle } from '../data/canon/index.js';
import { startCanonBus, standingStyles, unknownChannels } from './canonBus.mjs';
import { buildContext, canonOf, CONTEXT_VERSION } from './mindContext.js';
import { rulesReply } from './mindRules.js';
import { PERSONAS } from './mindContract.js';
import { createMindRecorder } from './mindRecord.js';
import { replayMindFrame, endMindReplay } from './mindLive.js';

const here = dirname(fileURLToPath(import.meta.url));
const opLook = canonStyle('op').looks[0];
const swissLook = canonStyle('swiss').looks[0];
const stage = (lookId, voiceId = null) => ({
  layoutParams: { composition: lookId },
  kineticVoiceId: voiceId,
  kineticChapterId: null,
});
const collect = (channel) => {
  const got = [];
  const off = on(channel, (payload, meta) => got.push({ payload, meta }));
  return { got, off };
};

// ── 1. a declared binding, in the bus's vocabulary ──────────────────────────────────────────────────────────
{
  const channels = new Set(Object.values(Events));
  assert.equal(Events.CANON_STAND, 'canon:stand', 'the Canon has a channel in the bus’s own table');
  for (const s of CANON_STYLES) {
    assert.ok(s.bus && Object.isFrozen(s.bus) && Object.isFrozen(s.bus.listens), `${s.id}: carries a frozen binding`);
    assert.ok(s.bus.listens.length >= 1 && s.bus.announces.length >= 1, `${s.id}: listens and announces`);
    for (const c of [...s.bus.listens, ...s.bus.announces])
      assert.ok(channels.has(c), `${s.id}: ${c} is a bus channel`);
    assert.deepEqual(unknownChannels(s), []);
  }
  // decisions, not frames: nothing a record binds to is a per-frame stream (the bus has none — and stays that way)
  for (const c of CANON_STYLE_BUS.listens) assert.doesNotMatch(c, /frame|tick|level|phase/, `${c} is a decision`);
  assert.deepEqual([...CANON_STYLE_BUS.announces], [Events.CANON_STAND]);
  assert.ok(CANON_STYLE_BUS.listens.includes(Events.CLOCK_BAR) && CANON_STYLE_BUS.listens.includes(Events.AUDIO_ONSET));
  assert.deepEqual(unknownChannels({ bus: { listens: ['made:up'], announces: [] } }), ['made:up']);
}

// ── 2. the declaration is the wiring ────────────────────────────────────────────────────────────────────────
{
  let state = stage(opLook);
  const bus = startCanonBus({ getState: () => state });
  // the whole wiring is the cross product of records × their declared channels — nothing else was subscribed
  const expected = CANON_STYLES.flatMap((s) => s.bus.listens.map((channel) => ({ id: s.id, channel })));
  assert.deepEqual(bus.bindings(), expected);
  bus.stop();

  // two records, same stage, different declarations: only what each LISTS reaches it
  const hearsOnsets = {
    id: 'op',
    bus: { listens: [Events.CLOCK_BAR, Events.AUDIO_ONSET], announces: [Events.CANON_STAND] },
  };
  const deafToOnsets = { id: 'swiss', bus: { listens: [Events.CLOCK_BAR], announces: [] } };
  const both = () => ['op', 'swiss'];
  const b2 = startCanonBus({ getState: () => state, records: [hearsOnsets, deafToOnsets], standing: both });
  assert.deepEqual(b2.bindings(), [
    { id: 'op', channel: 'clock:bar' },
    { id: 'op', channel: 'audio:onset' },
    { id: 'swiss', channel: 'clock:bar' },
  ]);
  emit(Events.CLOCK_BAR, { bar: 4, bpm: 120 }); // both take the stage on the downbeat
  for (let i = 0; i < 3; i++) emit(Events.AUDIO_ONSET, { strength: 0.8, band: 'low' });
  emit(Events.CLOCK_BAR, { bar: 5, bpm: 120 });
  const snap = b2.snapshot();
  const op = snap.standing.find((s) => s.id === 'op');
  const swiss = snap.standing.find((s) => s.id === 'swiss');
  assert.deepEqual(
    { bars: op.bars, onsets: op.onsets },
    { bars: 1, onsets: 3 },
    'the record that lists onsets heard them',
  );
  assert.deepEqual(
    { bars: swiss.bars, onsets: swiss.onsets },
    { bars: 1, onsets: 0 },
    'the one that does not is deaf to them',
  );
  // a channel nobody lists reaches nobody
  emit(Events.KINETIC_TAP, { kind: 'look' });
  assert.equal(b2.snapshot().standing.find((s) => s.id === 'op').taps, 0);
  // an unknown channel in a declaration binds nothing (and throws nothing)
  const b3 = startCanonBus({
    getState: () => state,
    records: [{ id: 'op', bus: { listens: ['made:up'], announces: ['also:made:up'] } }],
    standing: both,
  });
  assert.deepEqual(b3.bindings(), []);
  b3.stop();
  // stop() unsubscribes: nothing is heard afterwards
  b2.stop();
  emit(Events.AUDIO_ONSET, { strength: 1, band: 'low' });
  assert.deepEqual(b2.snapshot().standing, []);
  // by source: the binder names no style and special-cases no record
  const src = readFileSync(join(here, 'canonBus.mjs'), 'utf8');
  for (const s of CANON_STYLES)
    assert.doesNotMatch(src, new RegExp(`['"]${s.id}['"]`), `the binder does not hand-wire ${s.id}`);
  assert.doesNotMatch(src, /setState|useStore/, 'the binder never writes the store');
}

// ── 3. a record announces itself when it takes the stage ────────────────────────────────────────────────────
{
  let state = stage(swissLook);
  const stands = collect(Events.CANON_STAND);
  const bus = startCanonBus({ getState: () => state });
  assert.deepEqual(standingStyles(state), ['swiss']);
  emit(Events.CLOCK_BAR, { bar: 1, bpm: 120 });
  assert.equal(stands.got.length, 1, 'Swiss took the stage: one announcement');
  assert.deepEqual(stands.got[0].payload, { kind: 'style', id: 'swiss', chapter: 'swiss', via: 'clock:bar', bar: 1 });
  assert.equal(stands.got[0].meta.cause, 'canon', 'the envelope says who');
  emit(Events.CLOCK_BAR, { bar: 2, bpm: 120 });
  emit(Events.AUDIO_ONSET, { strength: 0.5, band: 'mid' });
  assert.equal(stands.got.length, 1, 'standing is announced once, not every bar');
  // the stage changes (a Look tap lands Op Art with SWARM): Op Art, Memphis and Japanese stand; Swiss leaves
  state = stage(opLook, 'swarm');
  emit(Events.KINETIC_TAP, { kind: 'look' });
  assert.deepEqual(
    stands.got
      .slice(1)
      .map((g) => g.payload.id)
      .sort(),
    ['japanese', 'memphis', 'op'],
  );
  assert.ok(stands.got.slice(1).every((g) => g.payload.via === 'kinetic:tap' && g.payload.bar === 2));
  assert.deepEqual(stands.got.find((g) => g.payload.id === 'op').payload.chapter, 'op-art');
  const snap = bus.snapshot();
  assert.deepEqual(snap.standing.map((s) => s.id).sort(), ['japanese', 'memphis', 'op']);
  assert.equal(snap.style, 'op');
  assert.deepEqual(snap.voice, ['memphis', 'japanese']);
  // nothing Canon on stage → no state, no announcement
  state = { layoutParams: {} };
  emit(Events.CLOCK_BAR, { bar: 3, bpm: 120 });
  assert.equal(bus.snapshot(), null);
  assert.equal(stands.got.length, 4);
  bus.stop();
  stands.off();
}

// ── 4. the per-bar persona context carries the Canon/bus state ──────────────────────────────────────────────
{
  let state = { ...stage(opLook, 'swarm'), kineticChapterId: 'op-art' };
  const bus = startCanonBus({ getState: () => state });
  emit(Events.CLOCK_BAR, { bar: 8, bpm: 126 });
  emit(Events.AUDIO_ONSET, { strength: 0.9, band: 'low' });
  emit(Events.AUDIO_ONSET, { strength: 0.7, band: 'low' });
  emit(Events.CLOCK_BAR, { bar: 9, bpm: 126 });
  const base = {
    layers: [],
    enabledAssetCount: 6,
    paletteId: 'v01d',
    room: {},
    keepsCount: 2,
    bpm: 126,
    audio: 'none',
  };
  const ctx = buildContext({ ...base, canon: bus.snapshot() }); // what App.jsx's getSnapshot hands the minds
  // THE CONTEXT SNAPSHOT
  assert.deepEqual(ctx.canon, {
    style: 'op',
    voice: ['memphis', 'japanese'],
    chapter: 'op-art',
    book: 'op-art',
    standing: [
      { id: 'op', bars: 1, onsets: 2, taps: 0 },
      { id: 'memphis', bars: 1, onsets: 2, taps: 0 },
      { id: 'japanese', bars: 1, onsets: 2, taps: 0 },
    ],
  });
  // every id the trio is handed resolves back to a Canon record — the block is a view INTO the database
  for (const s of ctx.canon.standing) assert.ok(canonStyleRecord(s.id));
  // absent stays absent: no Canon state → no key, and the rest of the context is byte-identical
  const without = buildContext(base);
  assert.ok(!('canon' in without));
  const { canon: _c, ...rest } = ctx;
  assert.deepEqual(rest, without, 'the Canon block changes nothing else in the context');
  assert.equal(CONTEXT_VERSION, 3, 'an optional block, like show / zodiac / marks — no version bump');
  // the sanitizer is the trust boundary
  assert.equal(canonOf(null), null);
  assert.equal(canonOf({}), null);
  assert.equal(canonOf({ style: 'DROP TABLE', voice: 'x', standing: [{ id: 5 }] }), null);
  assert.deepEqual(canonOf({ style: 'op', standing: [{ id: 'op', bars: -3, onsets: 1e9, taps: 'x' }] }).standing, [
    { id: 'op', bars: 0, onsets: 9999, taps: 0 },
  ]);
  assert.equal(
    canonOf({ voice: new Array(40).fill('op'), style: 'op' }).voice.length,
    4,
    'capped — a summary, never the manifest',
  );
  // the live wiring: the shell starts the binder and hands its snapshot to the minds
  const app = readFileSync(join(here, '..', 'App.jsx'), 'utf8');
  assert.match(app, /startCanonBus\(\{ getState: useStore\.getState, isReplaying: isPlaybackActive \}\)/);
  assert.match(app, /canon: canonBus\.snapshot\(\)/);
  assert.match(app, /canonBus\.stop\(\)/);
  bus.stop();
}

// ── 5. the replay law ───────────────────────────────────────────────────────────────────────────────────────
{
  // (a) the rules backend answers exactly as it did: the Canon block is something a model may read, never a
  //     term the rules read
  const base = {
    layers: [],
    enabledAssetCount: 6,
    paletteId: 'v01d',
    room: { lois: 'NOD', davis: 'FLOW' },
    keepsCount: 2,
    bpm: 126,
  };
  const canon = {
    style: 'op',
    voice: ['memphis'],
    chapter: 'op-art',
    book: 'op-art',
    standing: [{ id: 'op', bars: 4, onsets: 9, taps: 1 }],
  };
  for (const persona of PERSONAS)
    for (let bar = 0; bar < 24; bar++) {
      const seed = (0x2049 ^ Math.imul(bar + 1, 0x9e3779b1)) >>> 0;
      assert.deepEqual(
        rulesReply(persona, buildContext({ ...base, canon }), { seed, bar }),
        rulesReply(persona, buildContext(base), { seed, bar }),
        `${persona} bar ${bar}: the rules reply is unchanged by the Canon block`,
      );
    }

  // (b) a recorded take replays unchanged with the Canon binder running and the stage full of Canon traffic
  const recorder = createMindRecorder({ getFrame: () => frame });
  let frame = 0;
  for (let bar = 0; bar < 6; bar++) {
    frame = bar * 120;
    for (const persona of PERSONAS) {
      const seed = (7 ^ Math.imul(bar + 1, 0x9e3779b1)) >>> 0;
      const reply = rulesReply(persona, buildContext(base), { seed, bar });
      if (reply) recorder.update({ persona, bar, backend: 'rules', seed, invented: false, reply }, bar % 2 === 0);
    }
  }
  const take = recorder.finish();
  assert.ok(take.decisions.length >= 6);
  const replay = (withCanon) => {
    const out = [];
    const offs = [Events.MIND_DECISION, Events.MIND_REQUEST, Events.MIND_ROUTE].map((ch) =>
      on(ch, (payload, meta) => out.push([ch, payload, meta && meta.cause])),
    );
    let state = stage(opLook, 'swarm');
    const stands = collect(Events.CANON_STAND);
    const bus = withCanon ? startCanonBus({ getState: () => state, isReplaying: () => true }) : null;
    endMindReplay();
    for (let f = 0; f <= 6 * 120; f += 60) {
      if (withCanon) {
        // the stage is busy while the take plays: bars, onsets, taps, the look changing under it
        emit(Events.CLOCK_BAR, { bar: f / 120, bpm: 120 });
        emit(Events.AUDIO_ONSET, { strength: 0.9, band: 'low' });
        emit(Events.KINETIC_TAP, { kind: 'look' });
        state = stage(f % 120 ? swissLook : opLook, 'swarm');
      }
      replayMindFrame(f, take);
    }
    endMindReplay();
    const said = stands.got.length;
    const snap = bus ? bus.snapshot() : null;
    if (bus) bus.stop();
    stands.off();
    offs.forEach((off) => off());
    return { out, said, standing: snap ? snap.standing : [] };
  };
  const plain = replay(false);
  const busy = replay(true);
  assert.ok(plain.out.length >= take.decisions.length);
  assert.deepEqual(busy.out, plain.out, 'the take replays decision for decision, with the Canon running');
  assert.equal(busy.said, 0, 'the Canon is muted while a take plays back — it announces nothing');
  assert.deepEqual(busy.standing, [], 'and hears nothing');

  // (c) the Canon asks the stage for nothing: it subscribes to none of its own announcements, emits only the
  //     channels records declare, and nothing in the store or the stage listens for canon:stand
  let state = stage(opLook);
  const requests = [Events.MIND_REQUEST, Events.LAYOUT_PARAM, Events.LAYOUT_PRESET, Events.LAYOUT_CURATE].map((ch) =>
    collect(ch),
  );
  const bus = startCanonBus({ getState: () => state });
  assert.ok(
    bus.bindings().every((b) => b.channel !== Events.CANON_STAND),
    'no record listens to its own announcement',
  );
  const frozen = JSON.stringify(state);
  emit(Events.CLOCK_BAR, { bar: 1, bpm: 120 });
  emit(Events.AUDIO_ONSET, { strength: 1, band: 'low' });
  assert.equal(JSON.stringify(state), frozen, 'the binder read the state and wrote nothing');
  assert.ok(
    requests.every((r) => r.got.length === 0),
    'taking the stage asks the stage for nothing',
  );
  requests.forEach((r) => r.off());
  bus.stop();
}

console.log(
  `canonBus.selfcheck: ok — ${CANON_STYLES.length} records carry declared bus bindings; the declaration is the wiring; canon:stand announced once per standing; the per-bar context carries the Canon; replay unchanged`,
);
