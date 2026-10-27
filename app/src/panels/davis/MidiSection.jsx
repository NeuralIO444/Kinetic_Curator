// MIDI (#617) — connect a controller, see what it says, map what it controls.
// Fail-out-loud: unsupported / refused / no device / unplugged all read in
// words, never as a silent dead control. Learn is a mode (Ableton pattern):
// LEARN on a row arms it, the next pad or knob you touch binds to that row,
// Esc or CANCEL backs out. Learn needs a connected device — with none there is
// nothing to wiggle, so the button says so instead of waiting forever.
//
// #1725 — the setup is pre-set configuration, so it no longer lives on the
// performance surface (Matt's ruling, 2026-10-21, on #1724's review). In the
// panel the section is a SLIM ROW — a MIDI button plus one honest status
// read (off, or on + the active bank; a failed connection says its word
// instead of claiming "on") — and the KEY LEGEND stays under it: the legend
// is what the performer reads in the dark during a set. The button launches
// the setup in a floating editor OVER the canvas, on the CHIAROSCURO
// pattern (#1629): portal + fixed position from the canvas wrap's anchor,
// no backdrop, the canvas stays live, Esc or click-away closes, no focus
// trap. One divergence from that file, forced by the room: Chiaroscuro
// closes the TE value dock when it opens, but the dock is a BUILD-panel
// tenant (its provider wraps BuildPanel only) — no dock can be open over
// DAVIS, so there is nothing to close here.
//
// While learn is armed the editor does not close — not by Esc (Esc cancels
// learn, as it always has), not by click-away, not by the row's button.
// Learn's mode must never sit armed and invisible behind a closed editor;
// its exits stay the ones it always had: Esc, CANCEL, device loss, MIDI off.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../state/store.js';
import { midiStatusView, describeMessage } from '../../midi/status.mjs';
import { MIDI_TARGETS } from '../../midi/targets.mjs';
import { keyFor } from '../../midi/map.mjs';
import { legendEntries } from '../../midi/banks.mjs';
import { describeKey } from '../../midi/message.mjs';
import { learnPrompt } from '../../midi/learn.mjs';
import { isEarned } from '../../state/earnedVoices.js';
import { emit, Events } from '../../composition/eventBus.js';
import { shelfAnchor } from '../shelfView.mjs';

function canvasAnchor() {
  const wrap = document.querySelector('.canvas-wrap');
  if (!wrap) return null;
  // The same anchor the CHIAROSCURO editor uses (shelfView's shelfAnchor):
  // top-left of the wrap rect shrunk by the 16px inset, and that rect's
  // size as the caps — the panel is content-sized by the CSS and may never
  // exceed the bound; past the height cap the body scrolls internally.
  const bound = shelfAnchor(wrap.getBoundingClientRect());
  if (!bound) return null;
  return { top: bound.top, left: bound.left, maxWidth: bound.width, maxHeight: bound.height };
}

// The panel row's one honest read (#1725): off, or on + the active bank.
// A connection that failed says its word instead of claiming "on".
function panelRead(enabled, status, bankName) {
  if (!enabled) return 'off';
  switch (status?.state) {
    case 'denied':
      return 'refused';
    case 'unsupported':
      return 'no midi';
    case 'no-devices':
      return 'no device';
    default:
      return `on · ${bankName}`;
  }
}

export function MidiSection() {
  const enabled = useStore((s) => s.midiEnabled);
  const status = useStore((s) => s.midiStatus);
  const last = useStore((s) => s.midiLast);
  const map = useStore((s) => s.midiMap);
  const banks = useStore((s) => s.midiBanks);
  const activeBank = useStore((s) => s.midiActiveBank);
  const userVoices = useStore((s) => s.userVoices);
  const learn = useStore((s) => s.midiLearn);
  const refused = useStore((s) => s.midiLearnRefused);
  const unbindMidi = useStore((s) => s.unbindMidi);
  const armMidiLearn = useStore((s) => s.armMidiLearn);
  const cancelMidiLearn = useStore((s) => s.cancelMidiLearn);
  const switchMidiBank = useStore((s) => s.switchMidiBank);
  const addMidiBank = useStore((s) => s.addMidiBank);
  const removeMidiBank = useStore((s) => s.removeMidiBank);
  const renameMidiBank = useStore((s) => s.renameMidiBank);
  const view = midiStatusView(status, enabled);
  const ready = enabled && status.state === 'ready';
  const armedTarget = learn?.armed ? MIDI_TARGETS.find((t) => t.id === learn.armed) : null;
  const armed = !!armedTarget;
  // #1720 — the legend reads the ACTIVE bank (map is its mirror): bound keys in
  // key order. A user-voice slot reads as the voice it will load, or as its
  // slot name while the shelf slot is empty (an honest no-op, dimmed).
  const myVoices = (userVoices || []).filter((v) => !isEarned(v));
  const legend = legendEntries(map).map((e) => {
    const slot = /^voice\.my\.(\d+)$/.exec(e.targetId);
    if (!slot) return e;
    const voice = myVoices[Number(slot[1]) - 1];
    return voice ? { ...e, label: voice.name } : { ...e, empty: true };
  });
  const renameBank = () => {
    const name = window.prompt('Bank name', banks[activeBank]?.name || '');
    if (name != null) renameMidiBank(name);
  };

  // The floating editor (#1725), on the CHIAROSCURO pattern.
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const editorRef = useRef(null);
  const anchorRef = useRef(null);

  const place = useCallback(() => {
    const next = canvasAnchor();
    setPos((prev) => {
      if (!next) return prev;
      if (
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.maxWidth === next.maxWidth &&
        prev.maxHeight === next.maxHeight
      )
        return prev;
      return next;
    });
  }, []);

  const openEditor = useCallback(() => {
    place();
    setOpen(true);
  }, [place]);

  const closeEditor = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // Esc while learn is armed cancels learn (the effect below) — the
      // editor stays open behind the mode it is hosting.
      if (armed) return;
      closeEditor();
    };
    const onDown = (e) => {
      if (armed) return; // learn is a mode: click-away must not strand it
      if (editorRef.current?.contains(e.target)) return;
      if (anchorRef.current?.contains(e.target)) return;
      closeEditor();
    };
    // Re-anchor on viewport resize, and after any drag ends (the column
    // divider resizes the canvas without a window resize event).
    const onResize = () => place();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointerup', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerup', onResize);
    };
  }, [open, armed, closeEditor, place]);

  // Esc backs out of learn.
  useEffect(() => {
    if (!armedTarget) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') cancelMidiLearn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armedTarget, cancelMidiLearn]);

  // The last device going away must not leave learn armed against nothing.
  useEffect(() => {
    if (armedTarget && !ready) cancelMidiLearn();
  }, [armedTarget, ready, cancelMidiLearn]);

  return (
    <div className="davis-midi" role="group" aria-label="MIDI">
      <div className="davis-midi-head">
        <i className="lbl">midi</i>
        <span className={`davis-midi-state ${view.tone}`} role="status">
          {panelRead(enabled, status, banks[activeBank]?.name)}
        </span>
        <button
          type="button"
          ref={anchorRef}
          className="chip-btn"
          onClick={() => {
            if (!armed) open ? closeEditor() : openEditor();
          }}
          aria-expanded={open}
          aria-haspopup="dialog"
          title="MIDI setup — connect a controller, banks and key mapping, over the canvas"
        >
          MIDI
        </button>
      </div>
      {legend.length > 0 && (
        <>
          <div className="davis-midi-legend-head">keys · {banks[activeBank]?.name}</div>
          <ul className="davis-midi-map davis-midi-legend" aria-label="Key legend">
            {legend.map((e) => (
              <li key={e.key}>
                <code>{e.keyLabel}</code>
                <span className={e.empty ? 'empty' : ''}>{e.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {open &&
        pos &&
        createPortal(
          <div
            ref={editorRef}
            className="midi-editor"
            role="dialog"
            aria-label="MIDI — controller setup"
            style={{ top: pos.top, left: pos.left, maxWidth: pos.maxWidth, maxHeight: pos.maxHeight }}
          >
            <div className="midi-editor-head">
              <div>
                <div className="te-dock-kicker">CONTROLLER SETUP</div>
                <div className="midi-editor-title">MIDI</div>
              </div>
              <button
                type="button"
                className="te-dock-close"
                onClick={() => {
                  if (!armed) closeEditor();
                }}
                aria-label="Close MIDI setup"
              >
                ×
              </button>
            </div>
            <div className="midi-editor-body">
              <div className="davis-midi-head">
                <i className="lbl">midi</i>
                <button
                  type="button"
                  className={`chip-btn ${enabled ? 'active' : ''}`}
                  aria-pressed={enabled}
                  onClick={() => emit(Events.MIDI_ENABLED, { on: !enabled })}
                  title={enabled ? 'Disconnect MIDI' : 'Connect a MIDI controller (the browser will ask for access)'}
                >
                  {enabled ? 'ON' : 'ENABLE'}
                </button>
              </div>
              <div className={`davis-midi-status ${view.tone}`} role="status">
                {view.line}
              </div>
              {view.note && <div className={`davis-midi-note ${view.tone}`}>{view.note}</div>}
              {enabled && last && (
                <div className="davis-midi-last" title="The last message seen">
                  {describeMessage(last)}
                </div>
              )}
              {armedTarget && (
                <div className={`davis-midi-learn ${refused ? 'bad' : ''}`} role="status" aria-live="polite">
                  {learnPrompt(armedTarget, refused)}
                </div>
              )}
              <div className="davis-midi-bank">
                <i className="lbl">bank</i>
                <select
                  aria-label="Active MIDI bank"
                  value={activeBank}
                  onChange={(e) => switchMidiBank(Number(e.target.value))}
                >
                  {banks.map((b, i) => (
                    <option key={i} value={i}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="micro-btn" title="Rename this bank" onClick={renameBank}>
                  ≡
                </button>
                <button type="button" className="micro-btn" title="New bank" onClick={() => addMidiBank()}>
                  +
                </button>
                <button
                  type="button"
                  className="micro-btn"
                  title="Delete this bank"
                  aria-label="Delete this bank"
                  disabled={banks.length <= 1}
                  onClick={() => {
                    if (window.confirm(`Delete bank "${banks[activeBank]?.name}" and its mappings?`)) removeMidiBank();
                  }}
                >
                  ×
                </button>
              </div>
              <ul className="davis-midi-map" aria-label="MIDI mappings">
                {MIDI_TARGETS.map((t) => {
                  const key = keyFor(map, t.id);
                  const isArmed = armedTarget?.id === t.id;
                  return (
                    <li key={t.id} className={isArmed ? 'armed' : ''}>
                      <span>{t.label}</span>
                      <code>{key ? describeKey(key) : '—'}</code>
                      <button
                        type="button"
                        className={`micro-btn ${isArmed ? 'active' : ''}`}
                        aria-pressed={isArmed}
                        disabled={!ready && !isArmed}
                        title={
                          isArmed
                            ? 'Cancel learn (Esc)'
                            : ready
                              ? `Learn: then touch a ${t.kind === 'cc' ? 'knob or fader' : 'pad or key'}`
                              : 'Connect a MIDI device to learn'
                        }
                        onClick={() => (isArmed ? cancelMidiLearn() : armMidiLearn(t.id))}
                      >
                        {isArmed ? 'CANCEL' : 'LEARN'}
                      </button>
                      {key && (
                        <button
                          type="button"
                          className="micro-btn"
                          aria-label={`Unmap ${t.label}`}
                          title="Remove this mapping"
                          onClick={() => unbindMidi(t.id)}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
