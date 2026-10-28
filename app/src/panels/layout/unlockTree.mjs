// unlockTree.mjs — #1630: the catalogue behind BUILD's unlock tree, pure.
//
// Matt's ruling (2026-10-16): the greyed-out and Davis-only controls gather
// in a section at the bottom of BUILD that explains how to unlock them —
// like a skill tree in an RPG. This module is the catalogue the section
// renders, and every entry is derived from the code that does the gating:
//
//   · the Davis ladder reads mindConduct's TIER_OPS — the ops each
//     engagement tier may make are computed from that table, not restated.
//   · the voice-only settings are the params with no performer control:
//     material + shading's neighbours retired by #268, and the knobs that
//     left performer sight in #310 (they stay in state; voices and presets
//     still set them).
//   · the material knobs mirror MaterialSliders' per-material gate; the
//     mode gates mirror the #272 visible-but-inert conditions in
//     LayoutSliders / SwarmSliders / HypeSliders / AppearanceSliders,
//     predicate for predicate, including the two reasons whose wording
//     depends on the current mode (COHESION and DAMPING in hype).
//   · the voice-shelf node mirrors VoicesShelf's shelfFull condition.
//
// States are honest signals only: 'lit' when the condition is met right
// now, 'dark' when it is not, 'his' for the settings no performer control
// exists for at all — where the answer is "Davis decides," the node says
// so. No scores, no percentages: the tier is the standing the app tracks
// (mindEngage, read live via mindPresenceLive's presence view); the raw
// score stays in the dev panel, where it has always lived.
//
// unlockTree.selfcheck.mjs pins this catalogue against the gating sources,
// so a new greyed control (or a changed reason) fails the suite until the
// tree learns it too.
import { TIER_OPS } from '../../curator/mindConduct.js';

/** Plain names for the materials the bodies ship with (MaterialSliders' NAMES + the flat floor). */
const MATERIAL_NAMES = Object.freeze({
  flat: 'Flat',
  glass: 'Glass',
  plate: 'Plate',
  wash: 'Wash',
  stipple: 'Stipple',
});

/** What one route op means in plain language, for the ladder lines. */
const OP_LINES = Object.freeze({
  depth: 'deepen or soften an audio route',
  add: 'open a new audio route',
  retarget: 'move a route to a new target',
  remove: 'close an audio route',
  spectrum: "steer a mark from the song's spectrum",
});

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The ops tier t adds over tier t-1, from the live gate table (t1 adds nothing — it is the floor). */
function opsAddedAt(t) {
  const prev = TIER_OPS[`t${t - 1}`] || [];
  return (TIER_OPS[`t${t}`] || []).filter((op) => !prev.includes(op));
}

/**
 * The whole tree for one live snapshot.
 * @param input { mode, symmetry, material, hasGround, hasWeather, voiceCount, voiceCap,
 *                davis: { tier, cool } | null }
 * @returns [{ id, title, note?, nodes: [{ id, name, state, line }] }]
 *   state: 'lit' | 'dark' | 'his'
 */
export function buildUnlockTree(input = {}) {
  const mode = input.mode;
  const symmetry = input.symmetry ?? 'none';
  const material = typeof input.material === 'string' ? input.material : null;
  const hasGround = !!input.hasGround;
  const hasWeather = !!input.hasWeather;
  const voiceCap = Number.isFinite(input.voiceCap) ? input.voiceCap : 12;
  const voiceCount = Number.isFinite(input.voiceCount) ? input.voiceCount : 0;
  const davis = input.davis && Number.isFinite(input.davis.tier) ? input.davis : null;

  // The gate predicates, exactly as the slider components compute them.
  const isSwarm = mode === 'swarm' || mode === 'murmuration';
  const isHype = mode === 'hype';
  const growth = mode === 'dla' || mode === 'eden';
  const bilateral = symmetry === 'bilateral';
  const radial = /^(?:radial|kaleido)-\d+$/.test(symmetry);

  const node = (id, name, state, line) => ({ id, name, state, line });
  const gate = (id, name, lit, litLine, darkLine) => node(id, name, lit ? 'lit' : 'dark', lit ? litLine : darkLine);

  // ── Davis — the ladder (tier 1 → 4, the order of TIER_OPS) ──────────────
  const ladder = [1, 2, 3, 4].map((t) => {
    const added = opsAddedAt(t);
    let line;
    if (!davis) line = 'His standing is not readable yet — the trio has not started.';
    else if (t === 1) line = 'The trio is in the room: faces, lines, presence. Davis makes no route edits at tier 1.';
    else line = `${cap(added.map((op) => OP_LINES[op] || op).join('; '))}.`;
    if (davis && davis.tier === t && davis.cool) {
      line += ' In cool-down — quieter until his score climbs back to the tier floor.';
    }
    return node(`tier-${t}`, `TIER ${t}`, davis && davis.tier >= t ? 'lit' : 'dark', line);
  });

  // ── Davis — his settings (no performer control exists) ──────────────────
  const materialName = material ? MATERIAL_NAMES[material] || material : '—';
  const his = [
    node(
      'voice-material',
      'MATERIAL',
      'his',
      `Which body the marks wear. Voices set it — there is no performer control (#268). This Look: ${materialName}.`,
    ),
    node(
      'voice-ztiers',
      'Z-TIERS',
      'his',
      'How many depth tiers the bodies sort into. Voices and presets set it — the knob left BUILD (#310).',
    ),
    node(
      'voice-noisefreq',
      'NOISE FREQ',
      'his',
      'The grain of the noise warp. Voices and presets set it — the knob left BUILD (#310).',
    ),
    node(
      'voice-displace',
      'DISPLACE',
      'his',
      'How far the noise warp pushes the marks. Voices and presets set it — the knob left BUILD (#310).',
    ),
  ];

  // ── Materials — the M4 knobs, gated per body ─────────────────────────────
  const matGate = (m, name) =>
    gate(
      `mat-${m}`,
      name,
      material === m,
      `This Look's material — the ${MATERIAL_NAMES[m].toLowerCase()} knobs above are live.`,
      `Lights when the Look's material is ${MATERIAL_NAMES[m].toLowerCase()} — Davis sets the material.`,
    );
  const materials = [
    matGate('glass', 'GLASS — ALPHA'),
    matGate('plate', 'PLATE — RADIUS · CENTRE X · CENTRE Y'),
    matGate('wash', 'WASH — STRENGTH · SPREAD'),
    matGate('stipple', 'STIPPLE — DOTS'),
  ];

  // ── Modes — the #272 gates ───────────────────────────────────────────────
  const modes = [
    gate(
      'gate-swarm-family',
      'PARTICLES · GRAVITY · BREATH',
      isSwarm || isHype,
      'Live in this mode.',
      'Lights in the swarm modes (swarm, murmuration) and hype.',
    ),
    node(
      'gate-cohesion',
      'COHESION',
      isSwarm ? 'lit' : 'dark',
      isSwarm
        ? 'Live in this mode.'
        : isHype
          ? 'In hype the BEHAVE table drives cohesion — the knob stays dark there.'
          : 'Lights in the swarm modes (swarm, murmuration).',
    ),
    node(
      'gate-damping',
      'DAMPING',
      isSwarm ? 'lit' : 'dark',
      isSwarm
        ? 'Live in this mode.'
        : isHype
          ? 'In hype, moth bodies pin damping at 0.97 or above for stability — the knob stays dark there.'
          : 'Lights in the swarm modes (swarm, murmuration).',
    ),
    gate(
      'gate-moth',
      'BODY · TIGHT · WIND · METABOLISM',
      isHype,
      'Live — the moth bodies are on stage.',
      'Lights in hype mode — these drive the moth bodies.',
    ),
    gate(
      'gate-flap',
      'FLAP',
      isHype && (bilateral || radial),
      'Live — hype, and a symmetric body to beat.',
      isHype
        ? 'Hype is on — flap still needs a symmetric body: bilateral, radial or kaleido symmetry.'
        : 'Needs hype mode and a symmetric body — wings and fans are only built for symmetric organisms.',
    ),
    gate(
      'gate-growth',
      'GROWTH RATE · BRANCHING',
      growth,
      'Live in this mode.',
      'Lights in the growth modes — DLA and Eden.',
    ),
    gate(
      'gate-ground',
      'GROUND · EDGE · SHADOW · SNAP',
      hasGround,
      'A PATTERN layer sits below the active one — live.',
      'Lights when a PATTERN layer sits below the active layer.',
    ),
    gate(
      'gate-weather',
      'WEATHER',
      hasWeather,
      'An FX layer with HAZE sits above the active one — live.',
      'Lights when an FX layer with HAZE sits above the active layer.',
    ),
    gate('gate-divergence', 'DIVERGENCE', mode === 'phyllotaxis', 'Live in this mode.', 'Lights in phyllotaxis mode.'),
  ];

  // ── The shelf — a standing capacity gate ─────────────────────────────────
  const shelf = [
    gate(
      'shelf-voice',
      'CAPTURE A VOICE',
      voiceCount < voiceCap,
      `Room on the shelf — ${voiceCount} of ${voiceCap} voices.`,
      `The voice shelf holds ${voiceCap} — delete a voice to make room.`,
    ),
  ];

  return [
    {
      id: 'davis-ladder',
      title: 'DAVIS — THE LADDER',
      note: 'Tiers are earned by playing: keeps, lingering on a frame, returning to kept seeds, evolving. A tier never demotes — a quiet spell is a cool-down, not a step back.',
      nodes: ladder,
    },
    { id: 'davis-settings', title: 'DAVIS — HIS SETTINGS', nodes: his },
    { id: 'materials', title: 'MATERIALS — KNOBS BY BODY', nodes: materials },
    { id: 'modes', title: 'MODES — THE GATES', nodes: modes },
    { id: 'shelf', title: 'THE SHELF', nodes: shelf },
  ];
}

/** Every node id in the catalogue (the selfcheck pins this set against the gating sources). */
export const UNLOCK_NODE_IDS = Object.freeze(buildUnlockTree({}).flatMap((g) => g.nodes.map((n) => n.id)));
