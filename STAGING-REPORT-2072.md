# STAGING-REPORT — #2072 Tauri macOS build cannot request the microphone (MIC BLOCKED forever)

Branch: `feat/tauri-mic-plist-2072` · Base: origin/main `01cbdde4` · Builder staging record — local commit only, no push, no PR.

## The change (2 files)

1. **`src-tauri/Info.plist` (new)** — a valid XML property list declaring exactly one key:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
   	<key>NSMicrophoneUsageDescription</key>
   	<string>Kinetic Curator listens to live audio through the microphone to drive the instrument and its conducting.</string>
   </dict>
   </plist>
   ```

   Tauri v1's bundler merges a plist at `src-tauri/Info.plist` into the app bundle's Info.plist at bundle time; that merge is the whole mechanism. No code changes, no `tauri.conf.json` changes — nothing in the conf gates or overrides the plist merge, and the issue's fix shape asks for the plist only.

2. **`docs/BUILDING_AND_RUNNING.md` (+1 note in §3, macOS Desktop Build Workflow)** — a pointer recording that the bundle declares the usage string via `src-tauri/Info.plist`, what happens without it (silent MIC BLOCKED), and that verification targets the bundled app. No pre-existing statement about macOS permissions existed anywhere in `README.md`, `docs/`, or `tauri.conf.json` (grep for microphone / NSMicrophone / UsageDescription / privacy: the only hits are unrelated — the manifesto's microphone-as-input prose and archive docs); nothing is contradicted.

## Plist parse proof

```
$ python3 -c "import plistlib; print(plistlib.load(open('src-tauri/Info.plist','rb')))"
{'NSMicrophoneUsageDescription': 'Kinetic Curator listens to live audio through the microphone to drive the instrument and its conducting.'}
```

## Why the microphone key is the only one (grep evidence, this tree)

- The only device-capture call in `app/src` is `navigator.mediaDevices.getUserMedia(audioInputConstraints(source.id))` at `app/src/hooks/useAudioInput.js:201` (the other two `getUserMedia` hits are comments in `audioInputConstraints.mjs` / `audioLoss.mjs`).
- `audioInputConstraints()` (`app/src/hooks/audioInputConstraints.mjs`) returns `{ audio }` only — it never sets a `video` key, so the request is microphone-only.
- No `getDisplayMedia` anywhere in `app/src` (screen capture: none). Every `camera` hit in `app/src` is the render/parallax camera in comments and hints, not a device.
- `canvas.captureStream` (`useLoopCapture.js`, `useMediaExport.js`) records the app's own GL canvas — no OS permission is involved.
- Conclusion: the app requests exactly one TCC-gated capability, the microphone, so `NSMicrophoneUsageDescription` is the only usage string the bundle needs. No camera or screen-recording keys were added.

## Verification run here

- `npm run format:check` in `app/` (after `npm install --prefix app`): **PASS** — "All matched files use Prettier code style!" (`app/package-lock.json` churn from the install was reverted; it is not part of this change.)
- Full selfcheck sweep intentionally not run: the diff touches no JS/JSX/Rust source — one plist and one docs note; there is no suite whose verdict this change can move. CI runs the manifest on the PR regardless.

## On-Mac verification (still owed — the proof of this fix)

The sandbox cannot build or run a macOS bundle, so the behavioural proof runs on Matt's Mac Studio, against the **bundled app**:

1. Pull the merged branch; `npm run tauri build` → `src-tauri/target/release/bundle/macos/Kinetic_Curator.app`.
2. Launch the bundled app, open STIMULI, click **AUDIO** — macOS must now show the microphone permission prompt carrying the usage string above.
3. Allow it; confirm **Kinetic Curator** now appears in System Settings → Privacy & Security → Microphone, switched on.
4. Click AUDIO again with a live input: the meter runs and the footer no longer shows MIC BLOCKED.

## Known caveat

A bare `tauri dev` binary may not carry the bundle plist (dev runs the unbundled binary; TCC attribution differs), so a missing prompt under `tauri dev` proves nothing either way. The bundled `.app` from `tauri build` is the only verification target — exactly as the issue's fix shape states.
