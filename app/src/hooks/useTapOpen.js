import { useEffect, useRef, useState } from 'react';

// Touch has no hover, and this is a stage instrument (#1103): a touch on an expanding button
// opens it, and it closes by itself after `ms`. Mouse and keyboard keep using :hover / :focus.
export function useTapOpen(ms = 1500) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    open,
    props: {
      onPointerDown: (e) => {
        if (e.pointerType !== 'touch') return;
        setOpen(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpen(false), ms);
      },
    },
  };
}
