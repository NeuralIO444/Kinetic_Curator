# Stage-hardware measurement — Matt's checklist (#1719, unblocks the K-series flags and #2295)

Every GPU path in the K-series ships **OFF** until its cost is known on real hardware. This is one sitting on the Mac Studio (with the second display) and one on the stage iPad. Write the numbers into the table at the bottom and commit it, or paste them on #1719 and Claude will commit them.

Budgets the numbers are judged against (`data/quality.js` `FRAME_BUDGETS`): **60 fps** (16.7 ms a frame) on both. The render must stay under **8.0 ms on desktop** and **5.0 ms on iPad**. "Near bust" is 80% of that.

## 0. Set up (5 min)

1. Build what's on `main` and run it the way you perform with it: the Tauri app on the Mac, the WebView build on the iPad.
2. Plug in the second display on the Mac. On the iPad, use the build you'd take to a show.
3. Connect Safari's Web Inspector (Develop menu → the device → the KC page). Everything below that says "console" means its Console tab.
4. Pick ONE representative scene and keep it for every run: STIMULI on, a controller bound, evolve running, DISH LIFE on, a swarm layer and a dish layer present. Save it as a project so every run starts the same way.

## 1. The frame-time probe (paste into the console)

This measures what you actually see: the time between painted frames. It runs for 120 s, then prints p50/p95/max and how many frames missed 60 fps.

```js
(() => {
  const SECS = 120, gaps = [];
  let last = performance.now(), end = last + SECS * 1000;
  const tick = (t) => { gaps.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else done(); };
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const done = () => {
    const s = gaps.slice(1).sort((a, b) => a - b);
    const out = { frames: s.length, p50: q(s, 0.5).toFixed(2), p95: q(s, 0.95).toFixed(2), max: s[s.length - 1].toFixed(2),
      over16_7: s.filter((g) => g > 16.7 + 1).length, over33: s.filter((g) => g > 33.4).length };
    console.table(out); copy(JSON.stringify(out));
  };
  requestAnimationFrame(tick);
  console.log(`measuring ${SECS}s…`);
})();
```

`copy(...)` puts the result on the clipboard: paste it into the table.

## 2. The runs (in this order; one probe per run)

| # | Device | URL / flags | What it tells us |
|---|---|---|---|
| A | Mac | (none) | The baseline: today's CPU paths |
| B | Mac | `?gpuSwarm=1` | The swarm **shadow**: GPU runs beside the JS swarm, nothing on screen changes. Its own cost |
| C | Mac | `?gpuSwarmLive=1` | The GPU swarm **takeover** (what we'd ship) |
| D | Mac | `?gpuSwarmLive=1&gpuContacts=1` | Takeover + GPU dish contacts |
| E | Mac | D, plus in the console `window.__KC_GPU_FLUID = true; window.__KC_GPU_CULTURE = true` | Everything on (fluid + culture on the GPU too) |
| F–J | iPad | same as A–E | The real target |
| K | Mac + iPad | E with Syphon / stage output on (once #608 lands) | The publish cost |

Between runs, reload the page (the flags are read at load). Let the scene settle for ~10 s before pasting the probe.

**While each run plays, watch for and note:** a quality drop the governor makes (the quality tier changes on its own), a "slow render" or PERF PAUSED notice, and anything that looks wrong (swarm character, contacts that feel late — the takeover's one known feel risk is a contact met one frame late).

## 3. The cap ladder (#2295)

Only after F–J. With the run-J flags on the iPad, raise the swarm to its new top (the 1,024 step is on `main`; 2,048 is PR #2295, unmerged) and repeat the probe once at each step. The rule from the K3 rulings: a step ships only if p95 stays inside 16.7 ms with the governor holding its tier.

## 4. What the numbers decide

- **B/C/D vs A** (iPad): which GPU flags can default ON. A flag that doesn't beat or match A on the iPad stays off.
- **E**: whether the fluid + culture GPU paths (K1, K2) are worth turning on at all.
- **Cap ladder**: whether #2295 (2,048) merges or closes.
- Any run where the governor drops quality or pauses gets its own issue (that's #1719's acceptance).

## 5. Results (fill in)

| Run | Device / OS / build | p50 ms | p95 ms | max ms | frames >16.7 | frames >33 | Governor changes / notices |
|---|---|---|---|---|---|---|---|
| A | | | | | | | |
| B | | | | | | | |
| C | | | | | | | |
| D | | | | | | | |
| E | | | | | | | |
| F | | | | | | | |
| G | | | | | | | |
| H | | | | | | | |
| I | | | | | | | |
| J | | | | | | | |
| cap 1,024 | | | | | | | |
| cap 2,048 | | | | | | | |

**Known gap:** the governor's tier timeline isn't exposed in the running app (only to tests), so this sitting records it by eye. If you want it recorded automatically, a small dev-only `?perf=1` capture is a follow-up issue.
