// determinism.mjs — a local ESLint plugin: KC-1's same-seed law as a lint
// wall (audit fix 4, #1637). Promotes the #553 regex guard
// (mathRandomGuard.selfcheck, retired) to an AST rule and extends it to
// the clocks the guard never saw.
//
// The law: engine code does not read unseeded chance or the wall clock.
// Random comes from the seeded channels in engine/kernel/rng.js; time
// comes in as a parameter (loop time). Every exception is an allowlist
// entry with an exact count and a written reason
// (eslint-rules/determinism-allowlist.mjs) — enforced both ways, so the
// list cannot rot.
//
// Scope: Math.random is enforced across all of src/ (the #553 guard's
// coverage, including its forbidden zones, where no allowance applies).
// Date.now / performance.now are enforced in the sim-adjacent trees
// (options.clockDirs): engine, GL, biology, curator, data, state, fx.
// UI trees keep their interaction-timing clocks.
//
// Known surface, stated plainly: direct member access only
// (Math.random, Date.now, performance.now) — the idiomatic forms, and
// the surface the regex guard effectively covered. Destructured or
// aliased access is out of scope for this wall.

const APIS = [
  { key: 'Math.random', object: 'Math', property: 'random', clock: false },
  { key: 'Date.now', object: 'Date', property: 'now', clock: true },
  { key: 'performance.now', object: 'performance', property: 'now', clock: true },
];

function propertyName(prop) {
  if (!prop) return null;
  if (prop.type === 'Identifier') return prop.name;
  if (prop.type === 'Literal') return String(prop.value);
  return null;
}

function srcRelative(filename) {
  const norm = String(filename || '')
    .split('\\')
    .join('/');
  const idx = norm.lastIndexOf('/src/');
  if (idx < 0) return null;
  return norm.slice(idx + '/src/'.length);
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'No unseeded Math.random and no wall-clock reads (Date.now / performance.now) in engine paths without a reasoned, exact-count allowance.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'object' },
          forbidden: { type: 'array', items: { type: 'string' } },
          clockDirs: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unseeded:
        'Determinism law: {{api}} in {{rel}} breaks same-seed replay. Route random through the seeded channels in engine/kernel/rng.js and pass time in as a parameter (loop time) — or add an exact-count allowance WITH a written reason in eslint-rules/determinism-allowlist.mjs.',
      forbidden:
        'Determinism law: Math.random is forbidden in {{rel}} (the sim, the kernel, placement, the GL layer) — no allowance applies. Use the seeded channels in engine/kernel/rng.js.',
      stale:
        'Determinism allowlist is stale for {{rel}}: {{api}} is allowed {{allowed}}x but the file has {{found}}x. Update eslint-rules/determinism-allowlist.mjs — a removed call means the allowance shrinks too.',
      reasonless:
        'Determinism allowance for {{rel}} ({{api}}) has no written reason — an exemption without a reason fails like a violation (#1637). Give the reason in eslint-rules/determinism-allowlist.mjs.',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const allow = options.allow || {};
    const forbidden = (options.forbidden || []).map((p) => new RegExp(p));
    const clockDirs = options.clockDirs || [];
    const rel = srcRelative(context.filename);
    if (!rel) return {};

    const found = { 'Math.random': [], 'Date.now': [], 'performance.now': [] };

    return {
      MemberExpression(node) {
        if (!node.object || node.object.type !== 'Identifier') return;
        const prop = propertyName(node.property);
        for (const api of APIS) {
          if (node.object.name === api.object && prop === api.property) {
            found[api.key].push(node);
            break;
          }
        }
      },

      'Program:exit'(programNode) {
        const inClockScope = clockDirs.some((d) => rel.startsWith(d));
        const isForbidden = forbidden.some((re) => re.test(rel));
        const allowances = allow[rel] || {};

        // An exemption without a reason fails like a violation.
        for (const [apiKey, entry] of Object.entries(allowances)) {
          if (!entry || typeof entry.why !== 'string' || entry.why.trim() === '') {
            context.report({
              node: programNode,
              messageId: 'reasonless',
              data: { rel, api: apiKey },
            });
          }
        }

        for (const api of APIS) {
          if (api.clock && !inClockScope) continue;
          const occurrences = found[api.key];
          const entry = allowances[api.key];
          let allowedCount = entry && Number.isInteger(entry.count) ? entry.count : 0;
          if (api.key === 'Math.random' && isForbidden) allowedCount = 0;

          if (occurrences.length > allowedCount) {
            for (const node of occurrences.slice(allowedCount)) {
              context.report({
                node,
                messageId: api.key === 'Math.random' && isForbidden ? 'forbidden' : 'unseeded',
                data: { api: api.key, rel },
              });
            }
          } else if (occurrences.length < allowedCount) {
            context.report({
              node: programNode,
              messageId: 'stale',
              data: { rel, api: api.key, allowed: allowedCount, found: occurrences.length },
            });
          }
        }
      },
    };
  },
};

export default {
  rules: {
    'no-unseeded-random-or-clock': rule,
  },
};

const probe = { x: 1 };
