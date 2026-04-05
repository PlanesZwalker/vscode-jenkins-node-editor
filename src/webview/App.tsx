// src/webview/App.tsx
// Composant racine — layout principal
// Voir docs/PHASE2.md §2.2

import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import NodeCanvas from './components/NodeCanvas';
import NodePalette from './components/NodePalette';
import NodeInspector from './components/NodeInspector';
import Toolbar from './components/Toolbar';
import LogPanel from './components/LogPanel';
import { useGraphStore } from './store/graphStore';
import { useVSCodeBridge } from './hooks/useVSCodeBridge';
import { useGraphSync } from './hooks/useGraphSync';
import { applyThemeVars, detectTheme } from './utils/theme';

export default function App() {
  // Initialiser la communication avec l'extension host
  useVSCodeBridge();

  // Synchroniser le graphe → fichier texte (debounced)
  useGraphSync();

  // Appliquer les variables CSS du thème VSCode au démarrage
  React.useEffect(() => {
    applyThemeVars();
  }, []);

  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const showLogs = useGraphStore(s => s.showLogs);

  return (
    <div
      className="app-container"
      data-theme={detectTheme()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--vscode-editor-background)',
        color: 'var(--vscode-editor-foreground)',
        fontFamily: 'var(--vscode-font-family)',
        fontSize: 'var(--vscode-font-size)',
      }}
    >
      {/* Toolbar en haut */}
      <ReactFlowProvider>
        <Toolbar />

        {/* Corps éditeur */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Palette de nœuds (gauche) */}
          <NodePalette />

          {/* Canvas principal */}
          <NodeCanvas />

          {/* Inspecteur (droite, conditionnel) */}
          {selectedNodeId && <NodeInspector />}
        </div>

        {/* Panel de logs (bas, conditionnel) */}
        {showLogs && <LogPanel />}
      </ReactFlowProvider>
    </div>
  );
}
