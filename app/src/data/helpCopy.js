export const HELP_TOPICS = [
  { id: 'stimuli-depth', group: 'Stimuli', title: 'depth', text: 'How hard the mic pushes scale/alpha. Not the Ghost bar.' },
  { id: 'stimuli-scale', group: 'Stimuli', title: 'scale', text: 'Bands → node size. Phrase CLOCK is a separate counter.' },
  { id: 'stimuli-alpha', group: 'Stimuli', title: 'alpha', text: 'Bands → opacity pulse.' },
  { id: 'stimuli-life', group: 'Stimuli', title: 'life', text: 'Slow LFO while RUN is on. Independent of phrase and evolve.' },
  { id: 'stimuli-attack', group: 'Stimuli', title: 'attack', text: 'How fast the audio envelope opens on a transient. Low is snappy, high is heavy.' },
  { id: 'stimuli-decay', group: 'Stimuli', title: 'decay', text: 'How fast the audio envelope falls after the hit. Long is fluid and lingering.' },
  { id: 'stimuli-response', group: 'Stimuli', title: 'response', text: 'Envelope shape — linear, exponential (heavy), logarithmic (lifts quiet swells), or peak-hold (punchy attacks, smooth falloff).' },
  { id: 'stimuli-swell', group: 'Stimuli', title: 'swell', text: 'How hard the music swells GLOW. 0 means the music never moves the glow — the washout control for loud passages at high glow.' },
  { id: 'stimuli-video', group: 'Stimuli', title: 'video', text: 'Stub. motionEnergy is unused. Camera does not drive Ghost Station.' },
  { id: 'stimuli-audio', group: 'Stimuli', title: 'audio', text: 'Mic on. Drives reactivity and the Ghost Station AUDIO / BEAT clocks.' },
  { id: 'davis-evolve', group: 'Play', title: 'evolve', text: 'Re-roll the picture. TIME fires on INTERVAL; BEAT fires on a mic attack.' },
  { id: 'davis-favorite', group: 'Ghost Station', title: 'favorite', text: 'Save the current seed as a hit (F).' },
  { id: 'davis-new-seed', group: 'Ghost Station', title: 'new seed', text: 'Jump to a fresh random seed (N).' },
  { id: 'davis-morph', group: 'Play', title: 'morph evolve', text: 'Ease layout changes over DURATION instead of hard-jumping. Seed and palette still snap.' },
  { id: 'layout-randomize', group: 'Build', title: 'curator', text: 'Re-roll every unlocked param and keep the taste model\'s pick. Until the MLX curator is trained, it\'s an honest dice roll — the bar says so.' },
  { id: 'layout-mode', group: 'Build', title: 'mode', text: 'How placements are arranged. Cellular enables the Ghost Station CA wrap mode.' },
  { id: 'layout-blend', group: 'Build', title: 'blend', text: 'How shapes mix where they overlap.' },
  { id: 'output-render', group: 'Output', title: 'render final', text: 'Save the current frame as PNG at the chosen resolution.' },
  { id: 'output-snap', group: 'Output', title: 'snap', text: 'Quick PNG snapshot (S).' },
  { id: 'output-batch', group: 'Output', title: 'batch', text: 'Render N sequential seeds as PNG + JSON sidecars.' },
  { id: 'assets-import', group: 'Assets', title: 'import', text: 'Drop an SVG into the project overlay. The canon is untouched.' },
  { id: 'master-run', group: 'Master', title: 'run', text: 'Play / pause the live loop (Space).' },
  { id: 'help-tour', group: 'Help', title: 'tour', text: 'Replay the 4-step first-run tour (preset, slider, PLAY, still) from the HELP tab.' },
  { id: 'davis-audio', group: 'Ghost Station', title: 'clock audio', text: 'Tick on a mic attack. Held noise is not a beat — armed · no attack.' },
  { id: 'davis-metro', group: 'Ghost Station', title: 'clock metro', text: 'Internal BPM. No mic.' },
  { id: 'davis-interval', group: 'Ghost Station', title: 'interval', text: 'Seconds between Evolve fires. Dead while SOURCE is BEAT.' },
  { id: 'davis-evolve-beat', group: 'Play', title: 'source beat', text: 'Evolve on the same attack as phrase AUDIO. Press EVOLVE to arm.' },
  { id: 'layout-accum', group: 'Build', title: 'accum', text: 'Pixel trail buffer — trails and glow render live in the WebGL canvas. CLEAR wipes the buffer only, not the canvas.' },
  { id: 'output-webm', group: 'Output', title: 'rec webm', text: 'Records the live WebGL canvas to WebM — ACCUM trails included. What plays is what exports.' },
  { id: 'output-recipe', group: 'Output', title: 'recipe', text: 'Each snapshot has a copy button for its recipe as plain text (seed, params, sub-seed offsets). Paste it back with PASTE RECIPE to restore the exact scene.' },
  { id: 'davis-clear', group: 'Ghost Station', title: 'clear', text: 'Wipe the trail buffer to the background.' },
  { id: 'layers-blend', group: 'Build', title: 'blend', text: 'How this layer composites onto the stack below.' },
  { id: 'output-loop', group: 'Output', title: 'capture loop', text: 'Records a fixed-length take and exports it as a seamless looping WebM — the tail dissolves into the head so there is no visible cut.' },
  { id: 'layout-flow', group: 'Build', title: 'flow', text: 'Curl-advects the ACCUM trail buffer as it decays — trails curl like smoke instead of just fading. 0 is off.' },
  { id: 'layers-patch-mod', group: 'Build', title: 'mod', text: 'Source motion shoves this track — glow, fade, nudge. A still source drives nothing; strength sets how hard it pushes when things move.' },
  { id: 'layers-patch-field', group: 'Build', title: 'field', text: 'Pulls this track toward the source track\u2019s shape. Strength sets how hard each frame tugs — the hop never lands past 4px.' },
  { id: 'layers-patch-feed', group: 'Build', title: 'feed', text: 'Blends this track toward where the source was a frame ago. Strength is blend per frame — 0.16 breathes, 1.00 smears.' },
];

// #158: the single source of truth. Hover `title` attributes and the `?`
// overlay both read through this, so the two can never drift.
const HELP_BY_ID = Object.fromEntries(HELP_TOPICS.map((t) => [t.id, t]));
export function helpText(id) {
  return HELP_BY_ID[id]?.text ?? '';
}

export const HELP_SHORTCUTS = [
  { key: 'SPACE', desc: 'Play / Pause' },
  { key: 'S', desc: 'Snapshot current frame' },
  { key: 'F', desc: 'Favorite current seed' },
  { key: 'G', desc: 'Toggle fullscreen' },
  { key: 'E', desc: 'Toggle evolve mode' },
  { key: 'N', desc: 'New random seed' },
  { key: '?', desc: 'Toggle help sheet' },
  { key: '⌘Z', desc: 'Undo' },
  { key: '⌘⇧Z', desc: 'Redo' },
];
