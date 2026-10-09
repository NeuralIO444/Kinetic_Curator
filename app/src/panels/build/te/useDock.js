// useDock — the hook for opening the TE value dock (#1202).
// The provider lives in ValueDock.jsx (split for React fast refresh).
import { useContext } from 'react';
import { DockContext } from './DockContext.js';

export function useDock() {
  const ctx = useContext(DockContext);
  if (!ctx) throw new Error('useDock must be used inside DockProvider');
  return ctx;
}
