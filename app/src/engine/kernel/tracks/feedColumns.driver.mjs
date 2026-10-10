// #1308 — deterministic feed-delay golden sequence driver.
//
// Shared by the pre-change golden capture and feedColumns.selfcheck.mjs so
// both run the EXACT same frame sequence. Takes a `columnHashes(field)`
// extractor as a dependency so the sequence is shape-agnostic: the capture
// deinterleaves the old {flow} field, the selfcheck hashes the new {u,v}
// SoA columns directly. Deterministic — seeded PRNGs only, no Date/RNG.
//
// deps: { createFeedDelay, createFeedLive, applyFeed, normalizePatch,
//         MAX_TRACKS, columnHashes }

export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeLuma(w, h, seed) {
  const out = new Float32Array(w * h);
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out[i] = ((s >>> 16) & 0xff) / 255;
  }
  return out;
}

export function runFeedGolden(deps) {
  const { createFeedDelay, createFeedLive, applyFeed, normalizePatch, MAX_TRACKS, columnHashes } = deps;
  const records = [];
  const rec = (label, obj) => records.push({ label, ...obj });
  const fieldsOf = (delay) =>
    Array.from({ length: MAX_TRACKS }, (_, t) => columnHashes(delay.field(t)));

  // --- A. raw delay: push() path, multi-track, re-push, reset --------------
  {
    const W = 40, H = 28;
    const delay = createFeedDelay(W, H);
    rec('A0.pristine', { fields: fieldsOf(delay) });
    delay.push(0, makeLuma(W, H, 11));
    delay.push(2, makeLuma(W, H, 22));
    rec('A1.pushed', { fields: fieldsOf(delay) });
    delay.push(0, makeLuma(W, H, 33)); // re-push same slot
    delay.push(3, makeLuma(W, H, 44));
    rec('A2.repushed', { fields: fieldsOf(delay) });
    // applyTo through each track's field, two strengths
    for (const strength of [0.5, 1.7]) {
      const patch = normalizePatch({ mode: 'feed', from: 0, to: 1, strength });
      const pts = [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.8 }];
      const outs = [];
      for (let t = 0; t < MAX_TRACKS; t++) {
        outs.push(applyFeed(pts, delay.field(t), { ...patch, from: t }));
      }
      rec(`A3.applyTo.s${strength}`, { out: JSON.stringify(outs) });
    }
    delay.reset();
    rec('A4.reset', { fields: fieldsOf(delay) });
  }

  // --- B. feedLive: pushSource/commit/applyTo, 16 deterministic frames ------
  {
    const live = createFeedLive(160, 112); // w=40, h=28 after FEED_SCALE
    const rng = mulberry32(1308);
    const dst = [{ x: 0.25, y: 0.5 }, { x: 0.7, y: 0.3 }];
    const patch = { mode: 'feed', from: 1, to: 2, strength: 0.9 };
    for (let f = 0; f < 16; f++) {
      for (let t = 0; t < MAX_TRACKS; t++) {
        const n = 2 + Math.floor(rng() * 14);
        const pts = [];
        for (let i = 0; i < n; i++) pts.push({ x: rng() * 1.4 - 0.2, y: rng() * 1.4 - 0.2 });
        if (f === 9 && t === 2) pts.length = 0; // empty frame mid-sequence
        live.pushSource(t, pts);
      }
      if (f === 4) live.pushSource(0, [{ x: 0.5, y: 0.5 }]); // last-write-wins
      live.commit();
      rec(`B.frame${f}`, {
        fields: fieldsOf(live.delay),
        out: JSON.stringify(live.applyTo(dst, patch)),
      });
    }
    live.reset();
    rec('B.reset', {
      fields: fieldsOf(live.delay),
      out: JSON.stringify(live.applyTo(dst, patch)),
    });
  }

  // --- C. interleaved push + pushSource on one delay (independent paths) ---
  {
    const live = createFeedLive(64, 64); // w=16, h=16
    live.delay.push(1, makeLuma(16, 16, 555));
    live.pushSource(1, [{ x: 0.3, y: 0.3 }]); // staged but uncommitted
    rec('C.staged', { fields: fieldsOf(live.delay) });
    live.commit();
    rec('C.committed', { fields: fieldsOf(live.delay) });
  }

  return records;
}
