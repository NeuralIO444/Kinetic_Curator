// loisRank.selfcheck.mjs — #948 heuristic rank + blunt verdict.
// LOIS is selectable, not the default. The score is a ruler (glance,
// distance from the pile, boldness), not a trained eye. Davis stays house.
import assert from 'node:assert';
import { rankLois, scoreLoisHeuristic, loisVerdict, getLoisVerdict, clearLoisVerdict } from './loisRank.js';
import { extractFeatures, scoreCandidate, setActivePersona, getActivePersonaId, personaCurator } from './taste.js';
import { getPersonaTaste } from './personaTastes.js';
import { getRenderProfile } from './renderProfiles.js';
import { curatorHint, pickCurated } from './curate.js';

const davisFav = {
  count: 580, scale: [0.8, 1.4], rotate: [-20, 20], alpha: [60, 80],
  jitter: 4, displacement: 2, density: 110, zTiers: 6,
  noiseSpeed: 0.8, noiseFreq: 0.006, swarmCohesion: 1.4, gravityWells: 0.8,
  particleCount: 200, damping: 0.95, wind: 0.4, breath: 0.15, lifeDrift: 0.2, flap: 0.15,
};
const mid = {
  count: 280, scale: [0.7, 1.1], rotate: [-15, 15], alpha: [55, 70],
  jitter: 18, displacement: 10, density: 70, zTiers: 4,
  noiseSpeed: 0.6, noiseFreq: 0.006, swarmCohesion: 1.3, gravityWells: 0.7,
  particleCount: 140, damping: 0.95, wind: 0.45, breath: 0.2, lifeDrift: 0.25, flap: 0.2,
};
const outlier = {
  count: 40, scale: [0.15, 2.9], rotate: [-180, 180], alpha: [15, 100],
  jitter: 150, displacement: 150, density: 22, zTiers: 2,
  noiseSpeed: 1.9, noiseFreq: 0.014, swarmCohesion: 0.3, gravityWells: 0.2,
  particleCount: 55, damping: 0.91, wind: 1.9, breath: 0.75, lifeDrift: 0.85, flap: 0.88,
};
const pool = [davisFav, ...Array.from({ length: 6 }, () => ({ ...mid })), outlier];

{
  const frozen = pool.map((c) => Object.freeze({ ...c }));
  const ranked = rankLois(frozen);
  assert.strictEqual(ranked.index, pool.length - 1, 'the wild pitch, not the pile');
  assert.ok(ranked.parts.originality > 0.45, 'outlier sits far from the mean');
  assert.ok(ranked.parts.boldness > 0.45, 'outlier is not cautious');
  assert.strictEqual(getLoisVerdict(), ranked.verdict);
  assert.ok(!/great|wonderful|nice work|love this/i.test(ranked.verdict), 'no generic praise');
  assert.ok(ranked.verdict.length < 60, 'short');
}

// House voice wants the dense ordered pitch. LOIS wants the one that
// doesn't look like the pile.
{
  const w = getPersonaTaste('davis').weights;
  const scores = pool.map((c) => scoreCandidate(extractFeatures(c), w));
  const davis = scores.indexOf(Math.max(...scores));
  const lois = rankLois(pool).index;
  assert.strictEqual(davis, 0, 'Davis argmax is the ordered dense pitch');
  assert.strictEqual(lois, pool.length - 1, 'LOIS argmax is the wild pitch');
}

{
  const muddy = scoreLoisHeuristic(extractFeatures(mid), extractFeatures(mid));
  assert.ok(muddy.originality < 0.05, 'a candidate is not original against itself');
  assert.strictEqual(loisVerdict({ glance: 0.1, originality: 0.8, boldness: 0.8 }), 'No hit at a glance. Out.');
  assert.strictEqual(loisVerdict({ glance: 0.5, originality: 0.1, boldness: 0.8 }), 'Too close to the pile. Habit.');
  assert.strictEqual(loisVerdict({ glance: 0.5, originality: 0.5, boldness: 0.1 }), 'Cautious or creative, kid. Pick one.');
}

{
  assert.strictEqual(rankLois([]).index, -1);
  clearLoisVerdict();
  assert.strictEqual(getLoisVerdict(), '');
  assert.ok(!getRenderProfile('lois'), 'no generation profile');
}

{
  setActivePersona('davis');
  assert.strictEqual(getActivePersonaId(), 'davis', 'Davis remains the default');
  setActivePersona('lois');
  assert.strictEqual(getActivePersonaId(), 'lois');
  const eng = personaCurator();
  assert.strictEqual(eng.heuristic, true);
  assert.strictEqual(eng.status(), 'active');
  assert.strictEqual(curatorHint(eng), `heuristic pick: LOIS · ${getLoisVerdict() || 'Walk in. Show me something.'}`);
  const picked = pickCurated(pool.map((c) => ({ ...c })), eng, () => 0.2);
  assert.strictEqual(picked.curated, true);
  assert.strictEqual(picked.index, pool.length - 1);
  assert.match(curatorHint(eng), /^heuristic pick: LOIS · /);
  assert.doesNotMatch(curatorHint(eng), /persona pick/);
  setActivePersona('davis');
  assert.strictEqual(getActivePersonaId(), 'davis');
}

console.log('loisRank.selfcheck: ok');
