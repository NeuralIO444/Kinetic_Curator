// Collapsible panel hook
import { useState, useCallback } from 'react';

export function useCollapse(defaultOpen = true) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen(o => !o), []);
  return { open, toggle };
}
