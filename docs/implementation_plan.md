# Bundle 8 — Davis/Evolve Panel Finalization

This bundle activates the core "Generative Autopilot" of the application, turning the Davis Mode panel from a visual placeholder into a fully functional, automated curation engine.

## Proposed Changes

### 1. State Management (`state/actions.js`, `state/reducer.js`)
- Add new state variables: `evolveTarget` (default: `'seed'`), `autoSnapshot` (default: `false`), and `lastEvolveTs` (default: `0`).
- Add actions: `SET_EVOLVE_TARGET`, `SET_AUTO_SNAPSHOT`, and `TRIGGER_EVOLVE`.
- The `TRIGGER_EVOLVE` action will handle the randomization logic:
  - If `evolveTarget === 'seed'`, it simply bumps the seed.
  - If `evolveTarget === 'layout'`, it randomizes all unlocked layout parameters.
  - If `evolveTarget === 'palette'`, it assigns a random palette.
  - If `evolveTarget === 'all'`, it does all of the above.

### 2. Auto-Evolve Engine (`App.jsx`)
- **Time-based Evolve**: Implement a `setInterval` that fires `TRIGGER_EVOLVE` based on `state.evolveInterval` when `evolveMode` is active and `evolveSource` is `'time'`.
- **Beat-based Evolve**: Update the `onBeat` callback from the audio engine to fire `TRIGGER_EVOLVE` when `evolveSource` is `'beat'`.
- **Auto-Snapshot**: Add a `useEffect` that listens for changes to `lastEvolveTs`. If `autoSnapshot` is true, it automatically calls the `exportSnapshot` utility to save a PNG of the *previous* state right before or after it evolves.

### 3. Davis Panel UI Polish (`panels/DavisPanel.jsx`)
- Add **MIDI/OSC placeholders**: Add disabled, greyed-out buttons to represent future hardware integration (U26).
- Add **Evolve Target Selection**: A new `<select>` dropdown to choose between `Seed Only`, `Layout`, `Palette`, and `All Parameters` (U27).
- Add **Auto-Snapshot Toggle**: A toggle button to enable saving a snapshot frame every time an evolve triggers (U29).
- Clean up the visual hierarchy of the panel to fit these new controls.

## Open Questions / Feedback Required

> [!WARNING]  
> If `Auto-Snapshot` is enabled and `Evolve` is running on a fast interval (e.g., every 500ms), it will attempt to download a PNG to your machine twice a second. Browsers usually suppress rapid automatic downloads to protect users. Is this acceptable, or should we limit auto-snapshots to only fire if the interval is > 2 seconds?

## Verification Plan
1. Set Evolve Source to `Time`, Interval to `1s`, and Target to `Seed Only`. Start Evolve and verify the seed changes every second.
2. Switch Target to `Palette` and verify the colors change.
3. Turn on Audio, switch Evolve Source to `Beat`, and verify the visuals evolve on loud drum hits.
4. Turn on `Auto-Snapshot` and verify that an image is downloaded alongside the evolve triggers.
