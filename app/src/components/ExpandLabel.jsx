import { splitLabel } from './expandLabel.mjs';

// A label that rests short and opens to its full form (#1103). The PARENT decides when: any
// ancestor with `.xl` opens it on :hover, :focus-visible, `.open` or `[data-open="true"]`
// (see styles/controls.css), so one button, one rule. Casing is CSS (`.act` on the parent).
// The accessible name is always the full word: the short form is `aria-hidden`.
// The reveal form lets go of its letters one at a time, last first, like heat leaving (#1103).
// `mode="swap"` forces the cross-fade form even when the short text is a prefix: a button whose short
// text CHANGES over a session (L → LOK) must keep one structure, or the cool-down would snap, not animate.
export function ExpandLabel({ short, full, tailClass = '', mode }) {
  const p = splitLabel(short, full);
  if ((mode ?? p.mode) === 'reveal') {
    return (
      <span className="xl-word" aria-hidden="true" style={{ '--xl-tail': p.fullN - p.shortN }}>
        <span className="xl-head">{p.head}</span>
        {/* each letter of the tail is its own span so the word can retreat one letter at a time (--i of --n) */}
        <span className={`xl-tail ${tailClass}`.trim()}>
          {[...p.tail].map((ch, i) => <span key={i} className="xl-ch" style={{ '--i': i, '--n': p.tail.length }}>{ch}</span>)}
        </span>
      </span>
    );
  }
  return (
    <span className="xl-swap" aria-hidden="true" style={{ '--xl-short': p.shortN, '--xl-full': p.fullN }}>
      <span className="xl-swap-short">{short}</span>
      <span className="xl-swap-full">{full}</span>
    </span>
  );
}
