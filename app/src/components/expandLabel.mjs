// expandLabel.mjs — how a label opens from its short form to its full form (#1103). Pure.
//
// The top bar's buttons rest short ([KIN], [L], [LOK]) and open to the full word on hover,
// focus or tap. Two cases:
//   reveal  the short form is the start of the full form (KIN → KINETIC, V → VOICE: …).
//           The tail slides in after the head, exactly as KIN always has.
//   swap    it is not (LOK → LOOKS). The two forms cross-fade and the box changes width.
//
// The face is monospace, so a width is a character count: no measuring, no layout reads.

/** @returns {{mode:'reveal'|'swap', head:string, tail:string, shortN:number, fullN:number}} */
export function splitLabel(short, full) {
  const s = String(short ?? ''); const f = String(full ?? '');
  const reveal = f.length > s.length && f.toLowerCase().startsWith(s.toLowerCase());
  return {
    mode: reveal ? 'reveal' : 'swap',
    head: reveal ? f.slice(0, s.length) : s,
    tail: reveal ? f.slice(s.length) : '',
    shortN: s.length,
    fullN: Math.max(f.length, s.length),
  };
}
