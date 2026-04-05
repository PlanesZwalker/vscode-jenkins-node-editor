# PHASE 2 — Moteur de rendu nodal (Webview React)

## Objectif
Construire l'interface React avec React Flow : canvas interactif, palette de nœuds, panneau
d'inspection, toolbar. À la fin de cette phase, l'éditeur affiche un graphe statique hardcodé
(pas encore connecté au parser).

## Critères d'acceptation
- [ ] La webview affiche un canvas React Flow avec nœuds et edges
- [ ] La palette latérale liste tous les types de nœuds Jenkins
- [ ] Drag depuis la palette → nœud créé sur le canvas à la position de drop
- [ ] Cliquer sur un nœud → panneau d'inspection affiche ses propriétés éditables
- [ ] Modifier une propriété dans l'inspecteur → le nœud se met à jour
- [ ] Zoom in/out, pan, fit-view fonctionnent
- [ ] Bouton "Auto-layout" réorganise le graphe via dagre
- [ ] Thème light/dark VSCode → couleurs du canvas s'adaptent
- [ ] Aucune prop drilling : tout passe par Zustand

---

## 2.1 — `src/webview/main.tsx`

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

## 2.2 — `src/webview/App.tsx`

Layout principal : `NodePalette` (gauche, 240px) | `NodeCanvas` (centre, flex-1) | `NodeInspector` (droite, 300px, conditionnel).

```tsx
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import NodeCanvas from './components/NodeCanvas';
import NodePalette from './components/NodePalette';
import NodeInspector from './components/NodeInspector';
import Toolbar from './components/Toolbar';
import LogPanel from './components/LogPanel';
import { useGraphStore } from './store/graphStore';
import { useVSCodeBridge } from './hooks/useVSCodeBridge';
import { useTheme } from './hooks/useTheme';

export default function App() {
  useVSCodeBridge();  // Initialise la communication avec l'extension
  const theme = useTheme();
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const showLogs = useGraphStore(s => s.showLogs);

  return (
    <div className="app-container" data-theme={theme}>
      <Toolbar />
      <div className="editor-body">
        <NodePalette />
        <ReactFlowProvider>
          <NodeCanvas />
        </ReactFlowProvider>
        {selectedNodeId && <NodeInspector />}
      </div>
      {showLogs && <LogPanel />}
    </div>
  );
}
```

## 2.3 — `src/webview/store/graphStore.ts`

Store Zustand central. TOUS les états mutables passent par ici.

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Node, Edge, OnNodesChange, OnEdgesChange, Connection } from '@xyflow/react';
import type { GraphModel, JenkinsNode, JenkinsEdge } from '../../parser/ASTTypes';

type GraphStore = {
  // State
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  showLogs: boolean;
  logs: string[];
  isDirty: boolean;
  isValidating: boolean;
  validationErrors: ValidationError[];
  buildStatus: 'idle' | 'running' | 'success' | 'failure' | 'aborted';

  // Actions
  setGraph: (model: GraphModel) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  addNode: (node: JenkinsNode) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  deleteNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  setValidationErrors: (errors: ValidationError[]) => void;
  appendLog: (line: string) => void;
  clearLogs: () => void;
  toggleLogs: () => void;
  setBuildStatus: (status: GraphStore['buildStatus']) => void;
  markClean: () => void;
};

// Implémente avec immer pour les mutations immuables
export const useGraphStore = create<GraphStore>()(
  immer((set, get) => ({
    // ... implémentation complète
    // Pour chaque action qui modifie nodes/edges, set isDirty = true
    // markClean() est appelé après chaque sync réussie vers le fichier texte
  }))
);
```

**Types `ValidationError`** :
```typescript
type ValidationError = {
  nodeId?: string;
  severity: 'error' | 'warning';
  message: string;
  line?: number;
};
```

## 2.4 — `src/webview/nodes/` — Types de nœuds

### Nœuds à implémenter

Chaque nœud est un composant React Flow custom. Tous doivent :
- Accepter `data: JenkinsNodeData` via les props React Flow
- Afficher un handle `source` (bas) et un handle `target` (haut) avec `<Handle>`
- Afficher un badge coloré indiquant le type
- Être sélectionnable (style différent si `selected`)
- Avoir un bouton "supprimer" (×) visible au hover

#### `StageNode.tsx`
- Badge violet
- Titre = `data.label`
- Sous-titre = nombre d'étapes contenues
- Click → sélectionne et ouvre l'inspecteur

#### `StepNode.tsx`
- Badge bleu
- Titre = nom de la commande (`sh`, `echo`, `git`, etc.)
- Preview du contenu (1 ligne max, tronquée)
- Couleur selon le type de step (shell = orange, git = vert, etc.)

#### `AgentNode.tsx`
- Badge vert
- Affiche le type d'agent : `any`, `none`, `label: "..."`, `docker: image: "..."`
- Forme légèrement différente (coins plus arrondis)

#### `ParallelNode.tsx`
- Badge ambre
- Affiche le nombre de branches parallèles
- Handles multiples pour les branches

#### `PostNode.tsx`
- Badge rouge/gris selon la condition (`always`, `failure`, `success`, `unstable`)
- Titre = condition post

### `src/webview/nodes/index.ts`
```typescript
import StageNode from './StageNode';
import StepNode from './StepNode';
import AgentNode from './AgentNode';
import ParallelNode from './ParallelNode';
import PostNode from './PostNode';

export const nodeTypes = {
  stage: StageNode,
  step: StepNode,
  agent: AgentNode,
  parallel: ParallelNode,
  post: PostNode,
} as const;
```

## 2.5 — `src/webview/components/NodeCanvas.tsx`

Composant central React Flow.

```tsx
import React, { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from '../nodes';
import { useGraphStore } from '../store/graphStore';

export default function NodeCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, selectNode, addNode } =
    useGraphStore();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Drop handler depuis la palette
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/jenkins-node-type');
      if (!type) return;
      // Convertir les coords écran en coords React Flow
      // Créer un nouveau nœud avec les valeurs par défaut du type
      // Appeler addNode()
    },
    [addNode]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div ref={reactFlowWrapper} className="canvas-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => selectNode(node.id)}
        onPaneClick={() => selectNode(null)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
        <MiniMap nodeStrokeWidth={3} />
      </ReactFlow>
    </div>
  );
}
```

## 2.6 — `src/webview/components/NodePalette.tsx`

Panneau gauche avec les types de nœuds disponibles. Chaque item est draggable.

Items à afficher (groupés) :

**Structure**
- Pipeline (nœud racine, un seul par graphe)
- Agent
- Stage
- Parallel

**Steps courants**
- sh (Shell)
- echo
- git / checkout
- archiveArtifacts
- junit
- docker.build
- withCredentials
- timeout
- retry

**Post-conditions**
- always
- success
- failure
- unstable
- changed

Implémentation drag :
```typescript
const onDragStart = (event: React.DragEvent, nodeType: string) => {
  event.dataTransfer.setData('application/jenkins-node-type', nodeType);
  event.dataTransfer.effectAllowed = 'move';
};
```

## 2.7 — `src/webview/components/NodeInspector.tsx`

Panneau droit. Affiche les propriétés du nœud sélectionné sous forme de formulaire.

Champs à afficher selon le type :

**Stage** : `name` (text), `when` (textarea), `failFast` (checkbox)

**Step (sh)** : `script` (textarea, monospace), `label` (text), `returnStdout` (checkbox)

**Step (git)** : `url` (text), `branch` (text), `credentialsId` (text)

**Agent** : `type` (select: any/none/label/docker), `label` (text, si type=label), `image` (text, si type=docker)

**Parallel** : `branches` (liste dynamique de noms)

**Post** : `condition` (select: always/success/failure/unstable/changed)

Chaque modification appelle `updateNodeData(id, newData)` dans le store.

## 2.8 — `src/webview/utils/layout.ts`

Auto-layout avec dagre. Appelé par le bouton "Auto-layout" dans la toolbar.

```typescript
import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

export function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 40 });

  nodes.forEach(node => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach(edge => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map(node => {
    const { x, y } = g.node(node.id);
    return {
      ...node,
      position: {
        x: x - NODE_WIDTH / 2,
        y: y - NODE_HEIGHT / 2,
      },
    };
  });
}
```

## 2.9 — `src/webview/utils/theme.ts`

Lit les CSS variables VSCode et les expose comme variables CSS custom sur `:root`.

```typescript
export type VSCodeTheme = 'light' | 'dark' | 'high-contrast';

export function detectTheme(): VSCodeTheme {
  if (document.body.classList.contains('vscode-high-contrast')) return 'high-contrast';
  if (document.body.classList.contains('vscode-dark')) return 'dark';
  return 'light';
}

// Variables VSCode à mapper sur des variables CSS custom de l'app
export const THEME_VAR_MAP: Record<string, string> = {
  '--vscode-editor-background': '--je-bg',
  '--vscode-editor-foreground': '--je-fg',
  '--vscode-focusBorder': '--je-accent',
  '--vscode-badge-background': '--je-badge-bg',
  '--vscode-badge-foreground': '--je-badge-fg',
  '--vscode-list-activeSelectionBackground': '--je-selected-bg',
  '--vscode-list-activeSelectionForeground': '--je-selected-fg',
  '--vscode-editorError-foreground': '--je-error',
  '--vscode-editorWarning-foreground': '--je-warning',
};

export function applyThemeVars(): void {
  const root = document.documentElement;
  const computed = getComputedStyle(document.body);
  Object.entries(THEME_VAR_MAP).forEach(([vscodeVar, appVar]) => {
    root.style.setProperty(appVar, computed.getPropertyValue(vscodeVar));
  });
}
```

## 2.10 — CSS globals

`src/webview/styles/globals.css` doit :
- Importer Tailwind directives
- Définir les variables CSS custom de base
- Styler le canvas React Flow pour qu'il utilise les variables VSCode
- Styler les handles des nœuds
- Définir les animations de connexion

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --je-bg: var(--vscode-editor-background);
  --je-fg: var(--vscode-editor-foreground);
  /* ... autres variables */
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--je-bg);
  color: var(--je-fg);
}

.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.canvas-container {
  flex: 1;
  height: 100%;
}

/* Override React Flow pour thème VSCode */
.react-flow__background {
  background: var(--je-bg);
}

.react-flow__minimap {
  background: var(--je-bg);
}
```

## Notes importantes
- Utilise `useCallback` sur TOUS les handlers React Flow (`onNodesChange`, `onEdgesChange`, `onConnect`) pour éviter les re-renders
- `snapToGrid={true}` avec `snapGrid={[16, 16]}` pour l'alignement propre
- `proOptions={{ hideAttribution: true }}` pour masquer le logo React Flow (légal si open source)
- Les nœuds custom DOIVENT appeler `useUpdateNodeInternals()` si leur taille change dynamiquement
