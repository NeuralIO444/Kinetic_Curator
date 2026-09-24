// DrawerOverlay — generic veil+sheet chrome for any zone:'drawer' registry
// entry (#248 Phase 1, first use: ASSETS). Same visual pattern
// PrintDeskModal already uses for OUTPUT's print desk; Shell.jsx supplies
// the panel component, this file owns none of them — "the Shell knows
// nothing about features" extends to the drawer zone too.
import { useEffect } from 'react';

const veil = { position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const sheet = {
  width: 1100, maxWidth: '96vw', maxHeight: '90vh',
  border: '1px solid var(--line)', display: 'flex', flexDirection: 'column',
};

export function DrawerOverlay({ Comp, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={veil} onClick={onClose} role="presentation">
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <Comp />
      </div>
    </div>
  );
}
