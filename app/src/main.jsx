import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './agentUi/uiBridge.mjs';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/panels.css';
import './styles/controls.css';
import './styles/canvas.css';
import './styles/pool.css';
import './styles/ux-polish.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
