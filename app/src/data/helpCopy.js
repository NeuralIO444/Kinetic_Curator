export const HELP_TOPICS = [
  { id: 'stimuli-depth', group: 'Stimuli', title: 'DEPTH', text: 'How hard the mic pushes scale/alpha. Not the Ghost bar.' },
  { id: 'stimuli-scale', group: 'Stimuli', title: 'SCALE', text: 'Bands → node size. Phrase CLOCK is a separate counter.' },
  { id: 'stimuli-alpha', group: 'Stimuli', title: 'ALPHA', text: 'Bands → opacity pulse.' },
  { id: 'stimuli-life', group: 'Stimuli', title: 'LIFE', text: 'Slow LFO while RUN is on. Independent of phrase and evolve.' },
  { id: 'stimuli-video', group: 'Stimuli', title: 'VIDEO', text: 'Stub. motionEnergy is unused. Camera does not drive Ghost Station.' },
  { id: 'davis-audio', group: 'Ghost Station', title: 'CLOCK AUDIO', text: 'Tick on a mic attack. Held noise is not a beat — armed · no attack.' },
  { id: 'davis-metro', group: 'Ghost Station', title: 'CLOCK METRO', text: 'Internal BPM. No mic.' },
  { id: 'davis-interval', group: 'Ghost Station', title: 'INTERVAL', text: 'Seconds between Evolve fires. Dead while SOURCE is BEAT.' },
  { id: 'davis-evolve-beat', group: 'Ghost Station', title: 'SOURCE BEAT', text: 'Evolve on the same attack as phrase AUDIO. Press EVOLVE to arm.' },
  { id: 'layout-accum', group: 'Layout', title: 'ACCUM', text: 'Pixel trail buffer. CLEAR wipes the buffer only, not the live SVG.' },
  { id: 'output-webm', group: 'Output', title: 'REC WEBM', text: 'Captures the tab. Does not sample the ACCUM buffer. Studio --accum is the trail still.' },
];

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
