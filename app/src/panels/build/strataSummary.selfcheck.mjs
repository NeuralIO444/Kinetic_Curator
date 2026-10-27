// strataSummary.selfcheck.mjs — #1203 block-stack one-liners. Pure module,
// runs under node: `node src/panels/build/strataSummary.selfcheck.mjs`.
import { strataSummary, trimNum } from './strataSummary.mjs';

let failures = 0;
const check = (name, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
  );
};

// trimNum: integers plain, floats trimmed to 2dp.
check('trimNum int', trimNum(18), '18');
check('trimNum float', trimNum(0.6), '0.6');
check('trimNum trims', trimNum(0.333), '0.33');
check('trimNum junk', trimNum(undefined), '');

// MATH: first op's first two params, formatted with the op's own formatter.
check(
  'math two params',
  strataSummary({ type: 'math', effects: [{ kind: 'threshold', params: { level: 0.6, softness: 0.1 } }] }, 'math', 100),
  'level 0.6 · softness 0.1',
);
check(
  'math exposure unit',
  strataSummary({ type: 'math', effects: [{ kind: 'gain', params: { exposure: 1.5 } }] }, 'math', 100),
  'exposure +1.5 st',
);
check('math no ops', strataSummary({ type: 'math', effects: [] }, 'math', 100), '');
check('math unknown kind', strataSummary({ type: 'math', effects: [{ kind: 'nope', params: {} }] }, 'math', 100), '');

// FX: first filled effect's first two params; wet fallback when empty.
check(
  'fx tear',
  strataSummary({ type: 'fx', effects: [{ kind: 'tear', params: { bands: 18, amount: 12 } }] }, 'fx', 100),
  'bands 18 · amount 12',
);
check('fx empty falls back to wet', strataSummary({ type: 'fx', effects: [] }, 'fx', 75), 'wet 75%');

// PATTERN: density + mode.
check(
  'pattern',
  strataSummary({ type: 'pattern', pattern: { mode: 'QUILT', density: 9 } }, 'content', 100),
  'cells 9 · quilt',
);

// CONTENT: patch wins, then blend, always wet; max two items.
check(
  'content plain',
  strataSummary({ type: 'content', layerBlendMode: 'normal', patch: { mode: 'off' } }, 'content', 100),
  'wet 100%',
);
check(
  'content blend',
  strataSummary(
    { type: 'content', layerBlendMode: 'screen', layerOpacity: 0.8, patch: { mode: 'off' } },
    'content',
    80,
  ),
  'screen · wet 80%',
);
check(
  'content patch',
  strataSummary({ type: 'content', layerBlendMode: 'normal', patch: { mode: 'mod', to: 'x' } }, 'content', 100),
  'patch mod · wet 100%',
);

// #1409 — the dish state on a CONTENT block: OFF always confesses, ON
// shows only when armed (radius > 0), ON + radius 0 stays silent so a
// default Look's line is byte-identical to pre-A3.
const kc = { type: 'content', layerBlendMode: 'normal', patch: { mode: 'off' } };
check('dish off', strataSummary(kc, 'content', 100, { on: false, armed: true }), 'dish off · wet 100%');
check('dish off, radius moot', strataSummary(kc, 'content', 100, { on: false, armed: false }), 'dish off · wet 100%');
check('dish on armed', strataSummary(kc, 'content', 100, { on: true, armed: true }), 'dish on · wet 100%');
check('dish on idle is silent', strataSummary(kc, 'content', 100, { on: true, armed: false }), 'wet 100%');
check('dish state omitted is silent', strataSummary(kc, 'content', 100), 'wet 100%');
check(
  'dish off outranks blend',
  strataSummary({ type: 'content', layerBlendMode: 'screen', patch: { mode: 'off' } }, 'content', 80, {
    on: false,
    armed: false,
  }),
  'dish off · screen',
);
check(
  'patch still wins over dish',
  strataSummary({ type: 'content', layerBlendMode: 'normal', patch: { mode: 'mod', to: 'x' } }, 'content', 100, {
    on: false,
    armed: true,
  }),
  'patch mod · dish off',
);
check(
  'dish never speaks on fx',
  strataSummary({ type: 'fx', effects: [] }, 'fx', 75, { on: false, armed: true }),
  'wet 75%',
);
check(
  'dish never speaks on pattern',
  strataSummary({ type: 'pattern', pattern: { mode: 'QUILT', density: 9 } }, 'content', 100, {
    on: false,
    armed: true,
  }),
  'cells 9 · quilt',
);

check('null layer', strataSummary(null, 'content', 100), '');

if (failures) {
  console.error(`${failures} FAILURES`);
  process.exit(1);
}
console.log('strataSummary selfcheck: all green');
