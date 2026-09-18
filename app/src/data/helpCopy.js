export const HELP_TOPICS = [
  { id: 'stimuli-depth', group: 'Stimuli', title: 'DEPTH', text: 'How hard the mic pushes scale/alpha. Not the Ghost bar.' },
  { id: 'stimuli-scale', group: 'Stimuli', title: 'SCALE', text: 'Bands → node size. Phrase CLOCK is a separate counter.' },
  { id: 'stimuli-alpha', group: 'Stimuli', title: 'ALPHA', text: 'Bands → opacity pulse.' },
  { id: 'stimuli-life', group: 'Stimuli', title: 'LIFE', text: 'Slow LFO while RUN is on. Independent of phrase and evolve.' },
  { id: 'stimuli-video', group: 'Stimuli', title: 'VIDEO', text: 'Stub. motionEnergy is unused. Camera does not drive Ghost Station.' },
  { id: 'stimuli-audio', group: 'Stimuli', title: 'AUDIO', text: 'Mic on. Drives reactivity and the Ghost Station AUDIO / BEAT clocks.' },
  { id: 'davis-evolve', group: 'Ghost Station', title: 'EVOLVE', text: 'Re-roll the picture. TIME fires on INTERVAL; BEAT fires on a mic attack.' },
  { id: 'davis-favorite', group: 'Ghost Station', title: 'FAVORITE', text: 'Save the current seed as a hit (F).' },
  { id: 'davis-new-seed', group: 'Ghost Station', title: 'NEW SEED', text: 'Jump to a fresh random seed (N).' },
  { id: 'davis-morph', group: 'Ghost Station', title: 'MORPH EVOLVE', text: 'Ease layout changes over DURATION instead of hard-jumping. Seed and palette still snap.' },
  { id: 'layout-randomize', group: 'Layout', title: 'CURATOR', text: 'Re-roll every unlocked param and keep the taste model\'s pick. Until the MLX curator is trained, it\'s an honest dice roll — the bar says so.' },
  { id: 'layout-mode', group: 'Layout', title: 'MODE', text: 'How placements are arranged. Cellular enables the Ghost Station CA wrap mode.' },
  { id: 'layout-blend', group: 'Layout', title: 'BLEND', text: 'How shapes mix where they overlap.' },
  { id: 'output-render', group: 'Output', title: 'RENDER FINAL', text: 'Save the current frame as PNG at the chosen resolution.' },
  { id: 'output-snap', group: 'Output', title: 'SNAP', text: 'Quick PNG snapshot (S).' },
  { id: 'output-batch', group: 'Output', title: 'BATCH', text: 'Render N sequential seeds as PNG + JSON sidecars.' },
  { id: 'assets-import', group: 'Assets', title: 'IMPORT', text: 'Drop an SVG into the project overlay. The canon is untouched.' },
  { id: 'master-run', group: 'Master', title: 'RUN', text: 'Play / pause the live loop (Space).' },
  { id: 'help-tour', group: 'Help', title: 'TOUR', text: 'Replay the 4-step first-run tour (preset, slider, PLAY, still) from the HELP tab.' },
  { id: 'davis-audio', group: 'Ghost Station', title: 'CLOCK AUDIO', text: 'Tick on a mic attack. Held noise is not a beat — armed · no attack.' },
  { id: 'davis-metro', group: 'Ghost Station', title: 'CLOCK METRO', text: 'Internal BPM. No mic.' },
  { id: 'davis-interval', group: 'Ghost Station', title: 'INTERVAL', text: 'Seconds between Evolve fires. Dead while SOURCE is BEAT.' },
  { id: 'davis-evolve-beat', group: 'Ghost Station', title: 'SOURCE BEAT', text: 'Evolve on the same attack as phrase AUDIO. Press EVOLVE to arm.' },
  { id: 'layout-accum', group: 'Layout', title: 'ACCUM', text: 'Pixel trail buffer — trails and glow render live in the WebGL canvas. CLEAR wipes the buffer only, not the canvas.' },
  { id: 'output-webm', group: 'Output', title: 'REC WEBM', text: 'Records the live WebGL canvas to WebM — ACCUM trails included. What plays is what exports.' },
  { id: 'output-recipe', group: 'Output', title: 'RECIPE', text: 'Each snapshot has a copy button for its recipe as plain text (seed, params, sub-seed offsets). Paste it back with PASTE RECIPE to restore the exact scene.' },
  { id: 'davis-clear', group: 'Ghost Station', title: 'CLEAR', text: 'Wipe the trail buffer to the background.' },
  { id: 'layers-blend', group: 'Layers', title: 'BLEND', text: 'How this layer composites onto the stack below.' },
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
