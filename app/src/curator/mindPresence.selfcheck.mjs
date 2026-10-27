// #1464 Mind 3 — the personality layer: hidden engagement, four tiers, decay and cool-down, the zodiac character, the
// third's ghost, recorded with the take; and all of it the same on the rules as on a model.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  signOf,
  SIGNS,
  GOVERNOR_BIRTHDAY,
  GOVERNOR_SIGN,
  readCalendar,
  modulation,
  zodiacBlock,
  UNMODULATED,
  TEMPERAMENT,
  seasonOf,
} from './mindZodiac.js';
import {
  createEngagement,
  decodeEngagement,
  encodeEngagement,
  tierOf,
  TIER_FLOORS,
  decayed,
  ABSENCE_MS,
  coolOf,
  COOL_ENTER,
} from './mindEngage.js';
import { createPresence, shapeAt, checkTraits, EASE_BARS, TIER_SHAPE, GHOST_KINDS } from './mindPresence.js';
import { createPresenceDriver, STORAGE_KEY } from './mindPresenceLive.js';
import { startGhost, getGhost } from './mindGhost.js';
import { startMind, setMindTap, replayMindFrame, endMindReplay } from './mindLive.js';
import { createMindRecorder, checkMindRecord } from './mindRecord.js';
import { buildContext } from './mindContext.js';
import { CANONICAL_STATES } from './mindContract.js';
import { Events, emit, on, clearPending } from '../composition/eventBus.js';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));
const DAY = 86400000;
const memStore = (init = {}) => {
  const m = { ...init };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => {
      m[k] = String(v);
    },
    m,
  };
};
const dec = (persona, bar, reply, seed = bar * 7919) => ({
  persona,
  bar,
  backend: 'rules',
  seed,
  invented: false,
  reply,
});

await ok(
  'zodiac canon: the signs come from the birthdays — Davis Gemini, LOIS Cancer, the third Libra; the Governor Capricorn',
  () => {
    assert.deepEqual(SIGNS, { davis: 'gemini', lois: 'cancer', queen: 'libra' });
    assert.deepEqual([...GOVERNOR_BIRTHDAY], [1977, 1, 8]);
    assert.equal(GOVERNOR_SIGN, 'capricorn');
    assert.equal(signOf(9, 22), 'virgo');
    assert.equal(signOf(9, 23), 'libra');
    assert.equal(signOf(12, 22), 'capricorn');
    assert.equal(signOf(1, 19), 'capricorn');
    assert.equal(signOf(1, 20), 'aquarius');
    assert.equal(signOf(6, 20), 'gemini');
    assert.equal(signOf(6, 21), 'cancer');
    assert.equal(signOf(13, 1), null);
    for (const s of Object.values(SIGNS)) assert.ok(TEMPERAMENT[s], `${s} has a temperament`);
  },
);

await ok('one calendar reading: moon phase and season from the date, null when the date is unusable', () => {
  assert.equal(readCalendar(new Date(Date.UTC(2024, 0, 11, 12))).moonPhase, 'new'); // new moon 2024-01-11
  const full = readCalendar(new Date(Date.UTC(2024, 0, 25, 18))); // full moon 2024-01-25
  assert.equal(full.moonPhase, 'full');
  assert.ok(full.illumination > 0.95);
  assert.equal(readCalendar(new Date(2026, 9, 14)).season, 'autumn');
  assert.equal(seasonOf(3, 19), 'winter');
  assert.equal(seasonOf(3, 20), 'spring');
  assert.equal(seasonOf(12, 21), 'winter');
  assert.equal(readCalendar(new Date('nope')), null);
  assert.equal(readCalendar('2026-10-14'), null, 'only a Date');
});

await ok(
  'modulation: the reading colours each persona; a failed reading skips it entirely and leaves no zodiac block',
  () => {
    const fullSummer = { moonPhase: 'full', illumination: 1, season: 'summer' };
    const m = modulation('lois', fullSummer);
    assert.ok(m.tempo > 1.2 && m.intensity === 1.1, 'Cancer, full moon, her season: quicker and stronger');
    assert.ok(
      modulation('queen', { ...fullSummer, season: 'spring' }).intensity < 1,
      'Libra in spring (opposite autumn) is damped',
    );
    assert.ok(
      modulation('queen', { ...fullSummer, season: 'autumn' }).intensity > 1,
      'and strongest in her own season',
    );
    assert.ok(
      modulation('lois', fullSummer).tempo - 1 > modulation('davis', fullSummer).tempo - 1,
      'the moon pulls LOIS hardest',
    );
    assert.equal(modulation('lois', null), UNMODULATED);
    assert.equal(zodiacBlock('lois', null), null);
    assert.deepEqual(zodiacBlock('queen', fullSummer), { sign: 'libra', moonPhase: 'full', season: 'summer' });
    assert.deepEqual(
      buildContext({ zodiac: zodiacBlock('davis', fullSummer) }).zodiac,
      { sign: 'gemini', moonPhase: 'full', season: 'summer' },
      'the Mind 1 context accepts it',
    );
  },
);

await ok('engagement: independent per persona, earned by signals, only while the artist is present', () => {
  const e = createEngagement();
  let t = 1e12;
  for (let i = 0; i < 500; i++) e.step({ active: true, audio: true }, (t += 2000));
  assert.ok(e.get('queen').score > e.get('lois').score * 3, 'sound is what the third rewards');
  const k = createEngagement();
  k.step({ active: true, keeps: 3, exports: 1 }, 1e12);
  assert.ok(
    k.get('lois').score > k.get('davis').score && k.get('lois').score > k.get('queen').score,
    "keeps and exports are LOIS's",
  );
  const r = createEngagement();
  r.step({ active: true, returns: 2, dwelling: true }, 1e12);
  assert.ok(r.get('davis').score > r.get('lois').score, "returning to seeds is Davis's");
  const idle = createEngagement();
  assert.equal(idle.step({ active: false, keeps: 9 }, 1e12), false);
  assert.equal(idle.get('lois').score, 0, 'an absent artist earns nothing');
});

await ok('four tiers by score; the tier is the highest reached and never drops', () => {
  assert.deepEqual(TIER_FLOORS.map(tierOf), [1, 2, 3, 4]);
  assert.equal(tierOf(TIER_FLOORS[2] - 0.01), 2);
  const e = createEngagement();
  e.step({ active: true, keeps: 50 }, 1e12); // 300 points for LOIS
  assert.equal(e.get('lois').tier, 3);
  e.step({ active: true }, 1e12 + 60 * DAY); // two months away: the score halves six times
  assert.ok(e.get('lois').score < TIER_FLOORS[1]);
  assert.equal(e.get('lois').tier, 3, 'no demotion');
  assert.equal(e.get('lois').cool, true, 'cool-down instead');
});

await ok('decay: only across an absence, each persona on her own half-life', () => {
  assert.equal(decayed(100, ABSENCE_MS, 10), 100, 'a short break is not an absence');
  assert.ok(Math.abs(decayed(100, 10 * DAY, 10) - 50) < 1e-9, 'one half-life halves it');
  assert.ok(decayed(100, 10 * DAY, 10, 1.1) > decayed(100, 10 * DAY, 10, 1), 'the zodiac stretches it slightly');
  const e = createEngagement();
  e.step({ active: true, keeps: 20, audio: true }, 1e12);
  const before = { lois: e.get('lois').score, queen: e.get('queen').score };
  e.step({ active: true }, 1e12 + 14 * DAY);
  assert.ok(
    e.get('lois').score / before.lois < e.get('queen').score / before.queen,
    'LOIS forgets faster than the third',
  );
});

await ok('cool-down has hysteresis: in below 85% of the floor, out at the floor; tier 1 never cools', () => {
  const f = TIER_FLOORS[2];
  assert.equal(coolOf(f * COOL_ENTER + 1, 3, false), false);
  assert.equal(coolOf(f * COOL_ENTER - 1, 3, false), true);
  assert.equal(coolOf(f - 1, 3, true), true);
  assert.equal(coolOf(f, 3, true), false);
  assert.equal(coolOf(0, 1, false), false);
});

await ok('persisted on this machine, by index (no persona is named), and malformed saves start fresh', () => {
  const e = createEngagement();
  e.step({ active: true, keeps: 12, audio: true }, 1e12);
  const raw = e.encode();
  assert.ok(!/lois|davis|queen/i.test(raw), 'no names written down');
  const back = createEngagement(decodeEngagement(raw));
  for (const p of ['lois', 'davis', 'queen']) assert.equal(back.get(p).tier, e.get(p).tier);
  assert.equal(decodeEngagement('{garbage').lois.score, 0);
  assert.equal(decodeEngagement({ v: 1, p: [[-5, 1, 0, null]] }).lois.score, 0);
  assert.equal(decodeEngagement(encodeEngagement(decodeEngagement(null))).queen.peak, 1);
});

await ok('a tier-up eases in over a few bars; it starts at its own tier on a new session', () => {
  const p = createPresence('davis', { level: 1 });
  const levels = [];
  for (let b = 0; b < EASE_BARS + 2; b++) {
    p.shape(dec('davis', b, { propose: null }), { tier: 2 });
    levels.push(p.level);
  }
  assert.deepEqual(levels, [1.25, 1.5, 1.75, 2, 2, 2]);
  assert.equal(createPresence('lois', { level: 3 }).level, 3);
  assert.ok(shapeAt(1.5).strength > TIER_SHAPE[1].strength && shapeAt(1.5).strength < TIER_SHAPE[2].strength);
});

const runFaces = (persona, tier, { cool = false, room = {}, bars = 3000 } = {}) => {
  const p = createPresence(persona, { level: tier });
  const moves = [];
  for (let b = 0; b < bars; b++) {
    const reply = persona === 'lois' ? { critique: null } : { propose: null };
    const out = p.shape(dec(persona, b, reply), { tier, cool, room });
    assert.ok(checkTraits(out.traits), 'traits validate');
    if (out.reply.state) moves.push(out);
  }
  return moves;
};

await ok(
  'tiers govern frequency and strength: her own moves come more often and show more strongly as she rises',
  () => {
    for (const persona of ['lois', 'davis']) {
      const t1 = runFaces(persona, 1);
      const t4 = runFaces(persona, 4);
      assert.ok(t1.length > 0, `${persona} is not mute at tier 1`);
      assert.ok(t4.length > t1.length * 2, `${persona}: tier 4 moves more often (${t4.length} vs ${t1.length})`);
      assert.ok(t4[0].reply.state.intensity > t1[0].reply.state.intensity, 'and more strongly');
      for (const m of [...t1, ...t4]) {
        assert.equal(m.traits.g, 1, 'her own move is marked');
        assert.equal(m.invented, true, 'and recorded as invented: never a measured verdict');
        assert.ok(TEMPERAMENT[SIGNS[persona]].moves.includes(m.reply.state.id), "one of her sign's moves");
        assert.ok(!CANONICAL_STATES[persona].includes(m.reply.state.id));
      }
    }
  },
);

await ok(
  'cool-down is quieter, rarer and softer; an away room makes no moves; the same seed rolls the same moves',
  () => {
    const warm = runFaces('davis', 3);
    const cooling = runFaces('davis', 3, { cool: true });
    assert.ok(cooling.length < warm.length && cooling[0].reply.state.intensity < warm[0].reply.state.intensity);
    assert.equal(runFaces('lois', 4, { room: { lois: 'AWAY' } }).length, 0);
    assert.deepEqual(
      runFaces('lois', 2).map((m) => [m.bar, m.reply.state]),
      runFaces('lois', 2).map((m) => [m.bar, m.reply.state]),
    );
  },
);

await ok(
  "a model's move is scaled to the tier, rested when too soon, and its line kept only when the tier allows it",
  () => {
    const p = createPresence('lois', { level: 1 });
    const move = (bar, extra = {}) =>
      p.shape(dec('lois', bar, { critique: null, state: { id: 'glint', intensity: 1, decay: 1 }, ...extra }), {
        tier: 1,
        room: { lois: 'VIBE' },
      });
    const a = move(0);
    assert.ok(a.reply.state.intensity < 1 && a.invented === true && !a.traits.r);
    const b = move(1);
    assert.equal(b.traits.r, 1, 'rested');
    assert.ok(!b.reply.state, 'the face stays honest');
    const vibe = { id: 'VIBE', intensity: 1, decay: 0 }; // a validated reading, as the thinker hands it on
    const reading = p.shape(dec('lois', 2, { critique: null, state: vibe }), { tier: 1, room: { lois: 'VIBE' } });
    assert.deepEqual(reading.reply.state, vibe, 'a reading is never touched');
    assert.ok(!reading.traits.r);
    const long = 'x'.repeat(90);
    const p1 = createPresence('lois', { level: 1 });
    const p4 = createPresence('lois', { level: 4 });
    assert.ok(
      !('line' in p1.shape(dec('lois', 0, { critique: null, line: long }), { tier: 1 }).reply),
      'too long for tier 1',
    );
    assert.equal(
      p4.shape(dec('lois', 0, { critique: null, line: long }), { tier: 4 }).reply.line,
      long,
      'earned at tier 4',
    );
  },
);

await ok(
  "the third's ghost: near-silent at tier 1, clearer and more frequent higher up; the mood picks warm, drift or lean",
  () => {
    const ghosts = (tier) => {
      const p = createPresence('queen', { level: tier });
      const out = [];
      for (let b = 0; b < 3000; b++) {
        const d = p.shape(dec('queen', b, { mood: b % 600 < 300 ? 'lift' : 'weird', lean: {} }), { tier });
        assert.ok(checkTraits(d.traits));
        if (d.traits.gh) out.push(d.traits.gh);
      }
      return out;
    };
    const g1 = ghosts(1);
    const g4 = ghosts(4);
    assert.ok(g1.length > 0 && g1.every((g) => g.s <= TIER_SHAPE[1].ghostMax), 'tier 1: present but deniable');
    assert.ok(g4.length > g1.length * 2 && Math.max(...g4.map((g) => g.s)) > 0.5);
    assert.ok(g4.every((g) => GHOST_KINDS.includes(g.k)));
    assert.ok(g4.some((g) => g.k === 'warm') && g4.some((g) => g.k === 'lean'));
  },
);

await ok(
  "the live layer on the rules: tier and zodiac in each persona's own context, traits on every decision, recorded",
  async () => {
    clearPending();
    const store = memStore();
    const clock = { t: 1e12 };
    const presence = createPresenceDriver({
      storage: store,
      now: () => clock.t,
      today: new Date(Date.UTC(2024, 0, 25, 18)),
      getSignals: () => ({ active: true, audio: true }),
    });
    const asked = [];
    const model = {
      available: () => true,
      ask: (persona, ctx) => {
        asked.push([persona, ctx]);
        return Promise.reject(new Error('busy'));
      },
    };
    let frame = 0;
    const rec = createMindRecorder({ getFrame: () => frame });
    setMindTap((d, requested) => rec.update(d, requested));
    const live = [];
    const off = on(Events.MIND_DECISION, (d) => live.push(d));
    const stop = startMind({
      presence,
      model,
      getSnapshot: () => ({ room: { lois: 'VIBE', davis: 'FLOW' } }),
      getSeed: () => 5,
    });
    for (let b = 0; b < 40; b++) {
      frame = b;
      clock.t += 2000;
      emit(Events.CLOCK_BAR, { bar: b });
      await tick();
    }
    stop();
    setMindTap(null);
    off();
    clearPending();
    assert.equal(live.length, 120);
    assert.ok(
      live.every((d) => d.backend === 'rules' && checkTraits(d.traits)),
      'every decision carries its traits',
    );
    const lois = asked.find(([p]) => p === 'lois')[1];
    const third = asked.find(([p]) => p === 'queen')[1];
    assert.equal(lois.tier, 't1');
    assert.equal(lois.zodiac.sign, 'cancer');
    assert.equal(third.zodiac.sign, 'libra');
    assert.equal(lois.zodiac.moonPhase, 'full');
    assert.ok(store.m[STORAGE_KEY], 'the scores were saved');
    const record = rec.finish();
    assert.equal(record.version, 2);
    assert.ok(checkMindRecord(record));
    assert.ok(record.decisions.every((r) => r.length === 9));
    const bad = JSON.parse(JSON.stringify(record));
    bad.decisions[0][8] = { t: 9, l: 1, c: 0 };
    assert.equal(checkMindRecord(bad), null, 'tampered traits are refused');
    assert.ok(
      checkMindRecord({ version: 1, decisions: [[0, 'lois', 0, 'rules', 1, 0, 0, { critique: null }]] }),
      'a version 1 take still plays',
    );
    assert.equal(
      checkMindRecord({
        version: 1,
        decisions: [[0, 'lois', 0, 'rules', 1, 0, 0, { critique: null }, { t: 1, l: 1, c: 0 }]],
      }),
      null,
    );
  },
);

await ok('a failed reading: no zodiac block, no modulation — the tiers and everything else run as normal', () => {
  const p = createPresenceDriver({
    storage: memStore(),
    today: new Date('nope'),
    getSignals: () => ({ active: true }),
  });
  assert.equal(p.reading, null);
  assert.deepEqual(p.contextFor('lois'), { tier: 't1' });
  const d = p.shape(dec('lois', 0, { critique: null }), { room: {} });
  assert.ok(checkTraits(d.traits) && d.traits.t === 1);
});

await ok('across sessions: the scores come back from storage and decay by the time away', () => {
  const store = memStore();
  const clock = { t: 1e12 };
  const a = createPresenceDriver({
    storage: store,
    now: () => clock.t,
    today: new Date('nope'),
    getSignals: () => ({ active: true, keeps: (clock.t - 1e12) / 1000 }),
  });
  for (let i = 0; i < 60; i++) {
    clock.t += 1000;
    a.beforeBar();
  }
  a.stop();
  const tier = a.engagement('lois').tier;
  const score = a.engagement('lois').score;
  assert.ok(tier >= 3, `kept a lot: tier ${tier}`);
  clock.t += 30 * DAY;
  const b = createPresenceDriver({
    storage: store,
    now: () => clock.t,
    today: new Date('nope'),
    getSignals: () => ({ active: true }),
  });
  assert.equal(b.engagement('lois').tier, tier, 'the tier came back');
  assert.equal(b.contextFor('lois').tier, `t${tier}`);
  b.beforeBar();
  assert.ok(b.engagement('lois').score < score / 4, 'a month away: three half-lives');
});

await ok('a take replays the ghost exactly as recorded; nothing asks a backend', async () => {
  clearPending();
  const stopG = startGhost();
  const record = {
    version: 2,
    decisions: [
      [
        0,
        'queen',
        0,
        'rules',
        1,
        0,
        0,
        { mood: 'lift', lean: {} },
        { t: 3, l: 3, c: 0, gh: { k: 'warm', s: 0.4, b: 2 } },
      ],
      [5, 'queen', 1, 'rules', 2, 0, 0, { mood: 'calm', lean: {} }, { t: 3, l: 3, c: 0 }],
    ],
  };
  assert.ok(checkMindRecord(record));
  replayMindFrame(0, record);
  assert.deepEqual({ ...getGhost() }, { kind: 'warm', strength: 0.4, band: 2 });
  replayMindFrame(5, record);
  assert.equal(getGhost().strength, 0, 'and leaves when the take says so');
  endMindReplay();
  stopG();
});

await ok(
  'hidden and wired: only the app and the dev MIND tab read it; pure modules read no clock; nothing names the third',
  () => {
    for (const f of ['mindZodiac.js', 'mindEngage.js', 'mindPresence.js']) {
      const code = src(`./${f}`)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      assert.ok(
        !/Date\.now|performance\.now|Math\.random|setTimeout|setInterval|localStorage|document|window/.test(code),
        f,
      );
    }
    const app = src('../App.jsx');
    assert.match(app, /const presence = createPresenceDriver\(\{/);
    assert.match(app, /startMind\(\{\s*presence,/);
    assert.match(app, /const stopGhost = startGhost\(\)/);
    assert.match(src('../panels/devTabs.mjs'), /import\('\.\/MindPanel\.jsx'\)/);
    assert.match(src('../panels/stimulus/MeterHero.jsx'), /getGhost\(\)/);
    for (const f of ['../panels/MindPanel.jsx', '../panels/stimulus/MeterHero.jsx'])
      assert.ok(!/queen/i.test(src(f)), `${f} never names her`);
    assert.ok(!/queen/i.test(STORAGE_KEY));
    assert.match(src('../../../src-tauri/helpers/kc-mind/main.swift'), /"tier" is how present you are/);
  },
);

console.log(`mindPresence.selfcheck: ${n} checks passed`);
