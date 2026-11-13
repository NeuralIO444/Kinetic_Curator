// DEV → MEGAMIND (#1525 MegaMind S1). The local model link: point KC-1 at your own Ollama, connect, and see
// what detection measured — model, cadence tier, badges, context. Dev panel first (Matt's ruling,
// 2026-11-10); a user-Settings home is a later move only on a further ruling.
//
// S1 proved the link and published the measured capabilities to the registry every later stage reads.
// S2 (#1526) wires the personas through it (the adapter + backend chain live in the Mind path itself —
// nothing to press here) and lands the register surfaces in the section below: each is a deliberate
// press, gated on its capability, validated before it is shown. Nothing is probed on page load or when
// this tab opens — connecting is a user act, and the buttons are the only way anything is measured.
import { useEffect, useState } from 'react';
import { ensureLinkDriver, getLinkView, subscribeLink } from '../curator/megamindLive.js';
import { HOUSE_TEXT, TIER_BLURB } from '../curator/megamindLink.mjs';
import { CAPABILITY_CONSUMERS, capabilityEnabled } from '../composition/capabilityRegistry.mjs';
import { ensureSurfacesDriver, getSurfacesView, subscribeSurfaces } from '../curator/megamindSurfacesLive.js';
import { ensureVisionDriver, getVisionView, subscribeVision } from '../curator/megamindVisionLive.js';
import { ensureEmbedDriver, getEmbedView, readShelfKeeps, subscribeEmbed } from '../curator/megamindEmbedLive.js';
import { semanticEnabled } from '../curator/megamindEmbed.mjs';
import { ASSETS } from '../data/assets/index.js';

const cell = { padding: '2px 6px', borderBottom: '1px solid #333', textAlign: 'left', whiteSpace: 'nowrap' };
const btn = {
  background: 'none',
  border: '1px solid #555',
  color: 'inherit',
  padding: '3px 10px',
  cursor: 'pointer',
  font: 'inherit',
};
const badge = {
  border: '1px solid #777',
  padding: '0 5px',
  marginLeft: 6,
  fontSize: 11,
  letterSpacing: 0.5,
};
const fmtCtx = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : 'unknown');

function Status({ view }) {
  if (view.phase === 'connecting') return <p style={{ opacity: 0.85 }}>Asking Ollama for its model list…</p>;
  if (view.phase === 'detecting')
    return <p style={{ opacity: 0.85 }}>Measuring {view.model} — show data, preload, one timed warm probe…</p>;
  if (view.phase === 'connected' && view.record) {
    const r = view.record;
    return (
      <div>
        <p style={{ margin: '0 0 4px' }}>
          connected · {r.model} · <strong>tier {r.tier}</strong> ({TIER_BLURB[r.tier]}) · ctx {fmtCtx(r.context)}
          {r.badges.map((b) => (
            <span key={b} style={badge}>
              {b}
            </span>
          ))}
        </p>
        <p style={{ opacity: 0.75, margin: '0 0 4px' }}>
          warm probe {r.probeMs.toLocaleString('en-US')} ms ·{' '}
          {r.probeClean
            ? 'reply in verdict shape'
            : 'reply NOT in verdict shape — deep verdicts only, and S2\u2019s format ladder decides the rest'}
          {' · '}thinking {r.thinking === 'controllable' ? 'controllable (sent off)' : 'not reported by the model'}
        </p>
        {r.badges.includes('cloud') && (
          <p style={{ opacity: 0.85, margin: '0 0 4px' }}>
            This is a cloud pointer: it runs on Ollama&rsquo;s cloud, not on this machine. May work — unsupported, and
            never the recommendation.
          </p>
        )}
      </div>
    );
  }
  if (view.saved)
    return (
      <p style={{ opacity: 0.85 }}>
        saved: {view.saved.model} @ {view.saved.endpoint} — not connected. Nothing is probed until you press Connect;
        MegaMind is on rules.
      </p>
    );
  return <p style={{ opacity: 0.85 }}>not connected — MegaMind is on rules.</p>;
}

export function MegaMindPanel() {
  const [driver] = useState(() => ensureLinkDriver());
  const [view, setView] = useState(getLinkView);
  const [endpointText, setEndpointText] = useState(() => (getLinkView() ? getLinkView().endpoint : ''));
  useEffect(() => subscribeLink(() => setView(getLinkView())), []);
  // The embeddings slot's record lives in its own driver (a second model, its own probe); the
  // registry table below reads its search.semantic row from that record, not the link's.
  useState(() => ensureEmbedDriver());
  const [embedView, setEmbedView] = useState(getEmbedView);
  useEffect(() => subscribeEmbed(() => setEmbedView(getEmbedView())), []);
  if (!view) return <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>The link has not been touched yet.</div>;
  const busy = view.phase === 'connecting' || view.phase === 'detecting';
  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Your own local Ollama, measured — never assumed. While a local model is linked and alive it answers the personas
        at its measured cadence; disconnect — or the model dying — returns MegaMind to the default chain silently.
      </p>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <input
          type="text"
          value={endpointText}
          onChange={(e) => setEndpointText(e.target.value)}
          disabled={busy}
          aria-label="Ollama endpoint"
          style={{
            background: 'none',
            border: '1px solid #555',
            color: 'inherit',
            padding: '3px 6px',
            font: 'inherit',
            minWidth: 220,
          }}
        />
        <button type="button" style={btn} disabled={busy} onClick={() => driver.connect(endpointText)}>
          Connect
        </button>
        {view.models.length > 0 && (
          <select
            value={view.model ?? ''}
            disabled={busy}
            aria-label="Model"
            onChange={(e) => driver.changeModel(e.target.value)}
            style={{
              background: 'none',
              border: '1px solid #555',
              color: 'inherit',
              padding: '3px 6px',
              font: 'inherit',
            }}
          >
            {view.models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {view.phase === 'connected' && (
          <>
            <button type="button" style={btn} disabled={busy} onClick={() => driver.redetect()}>
              Re-detect
            </button>
            <button type="button" style={btn} disabled={busy} onClick={() => driver.disconnect()}>
              Disconnect
            </button>
          </>
        )}
      </div>
      <Status view={view} />
      {view.error && (
        <div style={{ border: '1px solid #a33', padding: '6px 8px', margin: '8px 0' }}>
          <p style={{ margin: '0 0 4px' }}>
            <strong>{view.error.title}</strong>
          </p>
          {view.error.lines.map((l, i) => (
            <p key={i} style={{ margin: '0 0 2px', opacity: 0.85, whiteSpace: 'pre-wrap' }}>
              {l}
            </p>
          ))}
        </div>
      )}
      <details style={{ marginTop: 10 }} open>
        <summary>the House configuration — the one supported setup</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11 }}>{HOUSE_TEXT}</pre>
      </details>
      <Surfaces record={view.record} />
      <Vision record={view.record} />
      <Embeddings endpoint={endpointText} />
      <details style={{ marginTop: 10 }}>
        <summary>capability registry — what later stages may do</summary>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {CAPABILITY_CONSUMERS.map((c) => (
              <tr key={c.id}>
                <td style={cell}>{c.id}</td>
                <td style={cell}>{c.stage}</td>
                <td style={cell}>
                  {c.id === 'search.semantic'
                    ? semanticEnabled(embedView ? embedView.record : null)
                      ? 'ENABLED'
                      : 'off'
                    : capabilityEnabled(c.id)
                      ? 'ENABLED'
                      : 'off'}
                </td>
                <td style={{ ...cell, whiteSpace: 'normal', opacity: 0.7 }}>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// ── S3 (#1527): vision — stage description lives here; render judging lives in the candidate tray ────
// LOIS vision judging (E4 render judging + E5 offspring pre-judging) is a press on the DIRECTORS
// candidate tray, where the stills are; what lives in MegaMind's home is the accessibility surface:
// an on-demand description of the current stage frame, printed here. Speaking it is a second,
// separate press and never automatic. With no frame offered by the stage, the honest state is
// "no frame" — a description is never fabricated.
function Vision({ record }) {
  const [driver] = useState(() => ensureVisionDriver());
  const [vv, setVv] = useState(getVisionView);
  useEffect(() => subscribeVision(() => setVv(getVisionView())), []);
  if (!vv) return null;
  const local = !!record && !record.badges.includes('cloud');
  const describeOn = local && capabilityEnabled('stage.describe');
  const judgeOn = local && capabilityEnabled('lois.vision');
  const speak = () => {
    if (!vv.description) return;
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    synth.speak(new SpeechSynthesisUtterance(vv.description.text));
  };
  return (
    <details style={{ marginTop: 10 }} open>
      <summary>S3 — vision (occasional, deliberate press only; nothing is judged per-bar)</summary>
      <p style={{ opacity: 0.75, margin: '8px 0 4px' }}>
        Render judging: {judgeOn ? 'enabled' : 'off'} — the &ldquo;judge stills&rdquo; press on the DIRECTORS candidate
        tray sends each finalist&rsquo;s displayed still to LOIS&rsquo;s vision (variant stills are the E5
        pre-judgements). Verdicts sit beside the bake-time rules verdict and steer nothing; each accrues in the judge
        ledger, never in the taste ledgers.
      </p>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
        <button
          type="button"
          style={btn}
          disabled={!describeOn || vv.describing}
          onClick={() => driver.describeStage()}
        >
          describe the stage
        </button>
        {vv.description && (
          <button type="button" style={btn} onClick={speak}>
            speak it
          </button>
        )}
      </div>
      {vv.describing && <p style={{ opacity: 0.85 }}>asking the model to look at the stage…</p>}
      {vv.describeError && <p style={{ opacity: 0.9, color: '#e88' }}>{vv.describeError}</p>}
      {vv.description && (
        <div style={{ margin: '4px 0' }}>
          <p style={{ margin: '0 0 2px' }}>{vv.description.text}</p>
          <p style={{ margin: 0, opacity: 0.7 }}>
            described by {vv.description.model} · frame sha256 {vv.description.frameSha256.slice(0, 12)}… · the frame
            the stage was showing when you pressed
          </p>
        </div>
      )}
      {!local && (
        <p style={{ opacity: 0.75 }}>
          {record
            ? 'The linked model is a cloud pointer — vision surfaces are local-only, like everything in MegaMind.'
            : 'Connect a local model with the vision badge to enable stage description.'}
        </p>
      )}
      {local && !describeOn && (
        <p style={{ opacity: 0.75 }}>The linked model carries no vision badge — stage description stays off.</p>
      )}
    </details>
  );
}

// ── S2 (#1526): the register surfaces ─────────────────────────────────────────────────────────────────────
// The persona adapter itself lives in the Mind path (no controls here — the tier IS the control). What
// lives here is the rest of the §6b register: pacing proposals, crown drafts, narration, Davis's reason
// prose, and the docs guide. Every button is gated on its capability consumer and a LOCAL record (a
// cloud pointer enables none of this), every reply is validated before it renders, and a discarded
// reply shows as an honest error line — this is a dev surface, not a performance surface.
function Surfaces({ record }) {
  const [driver] = useState(() => ensureSurfacesDriver());
  const [sv, setSv] = useState(getSurfacesView);
  const [guideText, setGuideText] = useState('');
  useEffect(() => subscribeSurfaces(() => setSv(getSurfacesView())), []);
  if (!sv) return null;
  const local = !!record && !record.badges.includes('cloud');
  const on = (consumer) => local && capabilityEnabled(consumer);
  const busy = !!sv.busy;
  const act = (consumer, label, fn) => (
    <button type="button" style={btn} disabled={busy || !on(consumer)} onClick={fn} title={consumer}>
      {label}
    </button>
  );
  return (
    <details style={{ marginTop: 10 }} open>
      <summary>S2 — the register surfaces (validated before shown; suggestions, never edits)</summary>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        {act('director.pacing', 'propose pacing', () => driver.proposePacing())}
        {act('crown.assist', 'draft crown note', () => driver.draftCrown())}
        {act('devpanel.narration', 'narrate telemetry', () => driver.narrateTelemetry())}
        {act('devpanel.narration', 'narrate census', () => driver.narrateCensus())}
        {act('narration.driftRetrain', 'narrate drift', () => driver.narrateDrift())}
        {act('narration.davisReason', "write Davis's reason", () => driver.writeReason())}
      </div>
      {sv.busy && <p style={{ opacity: 0.85 }}>asking the model — {sv.busy}…</p>}
      {sv.error && <p style={{ opacity: 0.9, color: '#e88' }}>discarded / unavailable — {sv.error}</p>}
      {sv.pacing && (
        <p style={{ margin: '4px 0' }}>
          <strong>pacing:</strong> {sv.pacing.proposal.move}
          {sv.pacing.proposal.line ? ` — ${sv.pacing.proposal.line}` : ''} · scheduler judgement:{' '}
          {sv.pacing.judgement.ok ? 'valid' : 'invalid'} ({sv.pacing.judgement.reason}). Proposals never move the
          Director — actuation waits on #1145&rsquo;s open questions.
        </p>
      )}
      {sv.crownDraft && (
        <div style={{ margin: '4px 0' }}>
          <p style={{ margin: '0 0 2px' }}>
            <strong>crown draft</strong> ({sv.crownDraft.forLayout || 'latest crown'}), for editing — nothing is saved
            by showing it:
          </p>
          <p style={{ margin: '0 0 2px', opacity: 0.85 }}>note: {sv.crownDraft.note}</p>
          <p style={{ margin: '0 0 2px', opacity: 0.85 }}>caption: {sv.crownDraft.caption}</p>
          {sv.crownDraft.lookNames.length > 0 && (
            <p style={{ margin: '0 0 2px', opacity: 0.85 }}>
              look names: {sv.crownDraft.lookNames.join(' · ')} (a name lands only on Matt&rsquo;s word)
            </p>
          )}
        </div>
      )}
      {sv.telemetryLine && (
        <p style={{ margin: '4px 0' }}>
          <strong>telemetry:</strong> {sv.telemetryLine}
        </p>
      )}
      {sv.censusLine && (
        <p style={{ margin: '4px 0' }}>
          <strong>census:</strong> {sv.censusLine}
        </p>
      )}
      {sv.drift && (
        <p style={{ margin: '4px 0' }}>
          <strong>drift:</strong> {sv.drift.line}
          {sv.drift.proposeRetrain
            ? ' — the model PROPOSES a Studio retrain (a proposal only; taste.json is never touched from here).'
            : ''}
        </p>
      )}
      {sv.reason && (
        <p style={{ margin: '4px 0' }}>
          <strong>davis&rsquo;s reason:</strong> {sv.reason.line}{' '}
          <span style={{ opacity: 0.7 }}>(grounded in: {sv.reason.clause})</span>
        </p>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <input
          type="text"
          value={guideText}
          onChange={(e) => setGuideText(e.target.value)}
          disabled={busy || !on('guide.docs')}
          aria-label="Ask the docs guide"
          placeholder="ask the shipped docs…"
          style={{
            background: 'none',
            border: '1px solid #555',
            color: 'inherit',
            padding: '3px 6px',
            font: 'inherit',
            minWidth: 260,
          }}
        />
        <button
          type="button"
          style={btn}
          disabled={busy || !on('guide.docs') || !guideText.trim()}
          onClick={() => driver.askGuide(guideText.trim())}
          title="guide.docs"
        >
          ask the guide
        </button>
      </div>
      {sv.guide && (
        <p style={{ margin: '4px 0' }}>
          <strong>guide:</strong> {sv.guide.answer}
          {sv.guide.sources.length > 0 && <span style={{ opacity: 0.7 }}> [{sv.guide.sources.join(', ')}]</span>}
        </p>
      )}
      {!local && (
        <p style={{ opacity: 0.75 }}>
          {record
            ? 'The linked model is a cloud pointer — the register surfaces are local-only, like the adapter.'
            : 'Connect a local model to enable these surfaces.'}
        </p>
      )}
    </details>
  );
}

// ── #1528: the embeddings slot — a SECOND model in the same machinery, measured the same way ────────
// The link above answers the personas; this slot measures a local embedding model on the same
// Ollama and adds the meaning axis: semantic search over the shelf keeps + the asset library here,
// and (via the export below) the miner's semantic novelty component in the run tool. The probe is
// a real embed call — the House model is a chat/vision model and nothing here claims it can embed;
// with no embedding model installed the slot stays unprobed and everything behaves exactly as
// before. Cloud pointers are refused whole: the slot is local-only, like every MegaMind surface.
function Embeddings({ endpoint }) {
  const [driver] = useState(() => ensureEmbedDriver());
  const [ev, setEv] = useState(getEmbedView);
  const [query, setQuery] = useState('');
  useEffect(() => subscribeEmbed(() => setEv(getEmbedView())), []);
  if (!ev) return null;
  const busy = ev.phase === 'listing' || ev.phase === 'probing' || !!ev.busy;
  const on = semanticEnabled(ev.record);
  const shelfKeeps = () => readShelfKeeps(typeof globalThis !== 'undefined' ? globalThis.localStorage : null);
  const keepLabel = (rec) =>
    `seed ${rec.seed ?? '—'} · ${rec.config?.layout?.mode ?? 'layout ?'} · ${rec.config?.palette?.id ?? 'palette ?'}`;
  return (
    <details style={{ marginTop: 10 }} open>
      <summary>follow-on — embeddings slot (#1528): semantic search + the miner&rsquo;s meaning axis</summary>
      <p style={{ opacity: 0.75, margin: '8px 0 4px' }}>
        A second model on the same Ollama, measured by a real embed probe (never by its name). It adds a
        meaning-distance beside the explorer&rsquo;s feature-distance: search below, and the miner&rsquo;s semantic
        novelty axis via the export. Embeddings are computed locally and cached on this machine, keyed by model + text —
        no text leaves the machine.
      </p>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
        <button type="button" style={btn} disabled={busy} onClick={() => driver.connect(endpoint)}>
          Connect slot
        </button>
        {ev.models.length > 0 && (
          <select
            value={ev.model ?? ''}
            disabled={busy}
            aria-label="Embedding model"
            onChange={(e) => driver.changeModel(e.target.value)}
            style={{
              background: 'none',
              border: '1px solid #555',
              color: 'inherit',
              padding: '3px 6px',
              font: 'inherit',
            }}
          >
            {ev.models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {ev.record && (
          <>
            <button type="button" style={btn} disabled={busy} onClick={() => driver.reprobe()}>
              Re-probe
            </button>
            <button type="button" style={btn} disabled={busy} onClick={() => driver.disconnect()}>
              Disconnect slot
            </button>
          </>
        )}
      </div>
      {ev.phase === 'listing' && <p style={{ opacity: 0.85 }}>Asking Ollama for its model list…</p>}
      {ev.phase === 'probing' && (
        <p style={{ opacity: 0.85 }}>Measuring {ev.model} — one timed embed probe, then an image probe…</p>
      )}
      {ev.record && (
        <p style={{ margin: '0 0 4px' }}>
          slot ready · {ev.record.model} · <strong>{ev.record.dims} dims</strong> · text probe{' '}
          {ev.record.textProbeMs !== null ? `${ev.record.textProbeMs.toLocaleString('en-US')} ms` : 'untimed'} · stills:{' '}
          {ev.record.imageEmbed ? 'image embeds measured' : 'text only — no image embed measured'} · cache{' '}
          {ev.cacheCount} vector{ev.cacheCount === 1 ? '' : 's'}
        </p>
      )}
      {!ev.record && ev.saved && (
        <p style={{ opacity: 0.85 }}>
          saved slot: {ev.saved.model} — not probed. Nothing is measured until you press Connect slot; search and the
          miner axis stay off.
        </p>
      )}
      {!ev.record && !ev.saved && (
        <p style={{ opacity: 0.85 }}>
          no slot measured — semantic search is off and the miner runs on its feature axis alone, exactly as before.
        </p>
      )}
      {ev.error && (
        <div style={{ border: '1px solid #a33', padding: '6px 8px', margin: '8px 0' }}>
          <p style={{ margin: '0 0 4px' }}>
            <strong>{ev.error.title}</strong>
          </p>
          {ev.error.lines.map((l, i) => (
            <p key={i} style={{ margin: '0 0 2px', opacity: 0.85, whiteSpace: 'pre-wrap' }}>
              {l}
            </p>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy || !on}
          aria-label="Semantic search"
          placeholder="find the spiky ones…"
          style={{
            background: 'none',
            border: '1px solid #555',
            color: 'inherit',
            padding: '3px 6px',
            font: 'inherit',
            minWidth: 260,
          }}
        />
        <button
          type="button"
          style={btn}
          disabled={busy || !on || !query.trim()}
          onClick={() => driver.searchText(query.trim(), { keeps: shelfKeeps(), assets: ASSETS })}
        >
          search keeps &amp; library
        </button>
        <button
          type="button"
          style={btn}
          disabled={busy || !ev.record}
          onClick={() => driver.downloadExport({ keeps: shelfKeeps(), assets: ASSETS })}
        >
          export embeddings for the run tool
        </button>
      </div>
      {ev.busy && (
        <p style={{ opacity: 0.85 }}>
          embedding with {ev.record ? ev.record.model : 'the slot'} — {ev.busy}…
        </p>
      )}
      {ev.message && <p style={{ opacity: 0.9, margin: '4px 0' }}>{ev.message}</p>}
      {ev.search && (
        <div style={{ margin: '6px 0' }}>
          <p style={{ margin: '0 0 4px' }}>
            <strong>“{ev.search.query}”</strong> — ranked by meaning distance (0 = same meaning), over{' '}
            {ev.search.embedded} embedded item{ev.search.embedded === 1 ? '' : 's'}:
          </p>
          {ev.search.keeps.length > 0 && (
            <>
              <p style={{ margin: '4px 0 2px', opacity: 0.75 }}>keeps:</p>
              {ev.search.keeps.map((h) => (
                <p key={h.id} style={{ margin: '0 0 2px' }}>
                  {keepLabel(h.record)} · distance {h.distance.toFixed(3)}{' '}
                  <button
                    type="button"
                    style={{ ...btn, padding: '0 6px', marginLeft: 6 }}
                    disabled={busy}
                    onClick={() => driver.moreLikeKeep(h.record, shelfKeeps(), { assets: ASSETS })}
                  >
                    more like this
                  </button>
                </p>
              ))}
            </>
          )}
          {ev.search.assets.length > 0 && (
            <>
              <p style={{ margin: '4px 0 2px', opacity: 0.75 }}>library:</p>
              {ev.search.assets.map((h) => (
                <p key={h.id} style={{ margin: '0 0 2px' }}>
                  {h.asset.id} · {h.asset.category} · distance {h.distance.toFixed(3)}
                </p>
              ))}
            </>
          )}
          {ev.search.keeps.length === 0 && ev.search.assets.length === 0 && (
            <p style={{ opacity: 0.85 }}>Nothing embedded yet to rank — the corpus texts embed on the first search.</p>
          )}
        </div>
      )}
    </details>
  );
}
