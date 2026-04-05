// src/webview/main.tsx
// Point d'entrée React de la webview
// Voir docs/PHASE2.md §2.1

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('[Jenkins Node Editor] Root element #root not found in DOM');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
