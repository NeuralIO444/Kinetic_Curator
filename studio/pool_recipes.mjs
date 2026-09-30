#!/usr/bin/env node
// studio/pool_recipes.mjs — #762: a VARIED pool of project recipes for the taste model.
//
//   node studio/pool_recipes.mjs base.project.json --count 200 --seed 1 --out pool-recipes/
//
// A pool rendered from one project varies only the seed, so every render shares
// its features and the model can learn nothing from them (#759 caveat). This
// writes N variants of the base project whose layouts are rolled with the SAME
// dice the live CURATE button uses (randomizeKey / markovPick off the seeded
// curate stream), so the pool matches the distribution the head will score live.
// Deterministic: same base + --seed + --count → byte-identical recipes.
// Render them with: python3 studio/hits_bridge.py pool --recipes pool-recipes/ --pool pool/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { RANDOMIZABLE_KEYS, randomizeKey } from '../app/src/state/paramUtils.js';
import { hasChain, markovPick } from '../app/src/curator/transitions.js';
import { rngForIndex, CH } from '../app/src/engine/kernel/rng.js';

export function poolRecipes(base, { count = 50, seed = 1, lock = [] } = {}) {
  const locked = new Set(lock);
  const keys = RANDOMIZABLE_KEYS.filter((k) => !locked.has(k));
  const from = base.layoutParams || {};
  const out = [];
  for (let i = 0; i < count; i++) {
    const rng = rngForIndex(seed >>> 0, CH.curate, i, base.seedOffsets || null);
    const lp = { ...from };
    for (const k of keys) lp[k] = hasChain(k) ? markovPick(k, from[k], rng).value : randomizeKey(k, rng);
    out.push({ ...base, seed: ((base.seed >>> 0) + i + 1) >>> 0, layoutParams: lp });
  }
  return out;
}

function main(argv) {
  const args = { count: 50, seed: 1, out: 'pool-recipes', lock: [] };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') args.count = parseInt(argv[++i], 10);
    else if (a === '--seed') args.seed = parseInt(argv[++i], 10);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--lock') args.lock = String(argv[++i]).split(',').filter(Boolean);
    else pos.push(a);
  }
  if (pos.length !== 1 || !(args.count > 0)) {
    console.error('usage: node studio/pool_recipes.mjs base.project.json [--count N] [--seed S] [--out dir] [--lock k1,k2]');
    process.exit(2);
  }
  const base = JSON.parse(readFileSync(pos[0], 'utf8'));
  mkdirSync(args.out, { recursive: true });
  const recipes = poolRecipes(base, args);
  recipes.forEach((r, i) => writeFileSync(join(args.out, `recipe-${String(i).padStart(4, '0')}.project.json`), JSON.stringify(r, null, 2)));
  console.log(`${args.out}: ${recipes.length} recipes (seed ${args.seed}; varied: ${RANDOMIZABLE_KEYS.filter((k) => !args.lock.includes(k)).length} CURATE keys)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
