# PHASE 4 — Intégration VSCode (synchronisation bidirectionnelle)

## Objectif
Connecter le parser (Phase 3) à l'extension VSCode (Phase 1) et au graphe React Flow (Phase 2).
Toute modification dans le graphe doit mettre à jour le fichier texte, et tout changement dans
le fichier texte doit mettre à jour le graphe, sans perte de données.

## Critères d'acceptation
- [ ] Ouvrir un vrai Jenkinsfile → le graphe s'affiche correctement
- [ ] Déplacer un nœud → position sauvegardée mais pas writée dans le fichier (métadonnées séparées)
- [ ] Modifier les propriétés d'un nœud → le fichier texte est mis à jour (debounced 300ms)
- [ ] Modifier le fichier texte dans l'éditeur classique → le graphe se met à jour dans les 500ms
- [ ] `Ctrl+Z` dans le graphe → undo de la dernière modification, fichier restauré
- [ ] `Ctrl+S` → sauvegarde le fichier (même comportement que l'éditeur classique)
- [ ] Édition concurrente (deux onglets) → pas de corruption de données
- [ ] Les positions des nœuds sont persistées dans `.vscode/jenkins-node-positions.json`

---

## 4.1 — `src/extension/MessageBus.ts`

Interface typée pour tous les messages. Implémente un système pub/sub simple.

```typescript
import * as vscode from 'vscode';
import type { ExtensionMessage, WebviewMessage } from '../shared/messages';

export class MessageBus {
  private panel: vscode.WebviewPanel;
  private handlers = new Map<string, ((msg: WebviewMessage) => void)[]>();

  constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
    panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      this.dispatch(msg);
    });
  }

  send(message: ExtensionMessage): void {
    this.panel.webview.postMessage(message);
  }

  on<T extends WebviewMessage['type']>(
    type: T,
    handler: (msg: Extract<WebviewMessage, { type: T }>) => void
  ): vscode.Disposable {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as any);
    this.handlers.set(type, list);

    return new vscode.Disposable(() => {
      const updated = (this.handlers.get(type) ?? []).filter(h => h !== handler);
      this.handlers.set(type, updated);
    });
  }

  private dispatch(msg: WebviewMessage): void {
    const handlers = this.handlers.get(msg.type) ?? [];
    handlers.forEach(h => h(msg));
  }
}
```

## 4.2 — `src/extension/JenkinsNodeEditor.ts` (version complète)

Cette version intègre le parser et le générateur.

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { JenkinsfileParser } from '../parser/JenkinsfileParser';
import { JenkinsfileGenerator } from '../parser/JenkinsfileGenerator';
import { MessageBus } from './MessageBus';
import { PositionStore } from './PositionStore';
import type { GraphModel } from '../shared/types';

export class JenkinsNodeEditor implements vscode.CustomTextEditorProvider {
  private parser = new JenkinsfileParser();
  private generator = new JenkinsfileGenerator();
  private activePanels = new Map<string, { bus: MessageBus; panel: vscode.WebviewPanel }>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const docKey = document.uri.toString();
    const bus = new MessageBus(webviewPanel);
    const positionStore = new PositionStore(document.uri, this.context);

    this.activePanels.set(docKey, { bus, panel: webviewPanel });

    // Setup webview
    webviewPanel.webview.options = { enableScripts: true, localResourceRoots: [this.context.extensionUri] };
    webviewPanel.webview.html = this.getWebviewHtml(webviewPanel.webview, document);

    // Debounce helper
    let syncTimer: NodeJS.Timeout | undefined;
    const debouncedSyncToFile = (graph: GraphModel) => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => this.applyGraphToDocument(graph, document), 300);
    };

    // Webview → Extension
    bus.on('READY', async () => {
      const result = await this.parser.parse(document.getText());
      const positions = await positionStore.load();
      // Appliquer les positions sauvegardées sur les nœuds parsés
      const graphWithPositions = mergePositions(result.graph, positions);
      bus.send({ type: 'INIT', graph: graphWithPositions, config: this.getConfig() });
    });

    bus.on('GRAPH_CHANGED', async ({ graph }) => {
      // Sauvegarder les positions séparément
      await positionStore.save(extractPositions(graph));
      // Appliquer les changements sémantiques dans le fichier
      debouncedSyncToFile(graph);
    });

    bus.on('VALIDATE_REQUEST', async () => {
      const validator = new JenkinsValidator(this.getConfig());
      const errors = await validator.validate(document.getText());
      bus.send({ type: 'VALIDATION_RESULT', errors });
    });

    // Extension → Webview : changements du document texte
    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() !== docKey) return;
      if (e.contentChanges.length === 0) return;

      // Attendre que le debounce de graphToFile soit terminé pour éviter les boucles
      clearTimeout(syncTimer);
      const result = await this.parser.parse(document.getText());
      const positions = await positionStore.load();
      const graph = mergePositions(result.graph, positions);
      bus.send({ type: 'DOC_CHANGED', graph });
    });

    // Thème VSCode
    const themeDisposable = vscode.window.onDidChangeActiveColorTheme(theme => {
      bus.send({ type: 'THEME_CHANGED', theme: mapVSCodeTheme(theme.kind) });
    });

    webviewPanel.onDidDispose(() => {
      this.activePanels.delete(docKey);
      docChangeDisposable.dispose();
      themeDisposable.dispose();
      clearTimeout(syncTimer);
    });
  }

  private async applyGraphToDocument(graph: GraphModel, document: vscode.TextDocument): Promise<void> {
    const newContent = this.generator.generate(graph);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      newContent
    );
    await vscode.workspace.applyEdit(edit);
  }

  private getConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration('jenkinsNodeEditor');
    return {
      jenkinsUrl: config.get<string>('jenkinsUrl', ''),
      jenkinsUser: config.get<string>('jenkinsUser', ''),
      jenkinsToken: config.get<string>('jenkinsToken', ''),
      autoLayout: config.get<boolean>('autoLayout', true),
      syncDelay: config.get<number>('syncDelay', 300),
    };
  }

  private getWebviewHtml(webview: vscode.Webview, document: vscode.TextDocument): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js')
    );
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.css')
    );
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${stylesUri}" />
  <title>Jenkins Node Editor — ${path.basename(document.fileName)}</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
```

## 4.3 — `src/extension/PositionStore.ts`

Persistance des positions des nœuds dans `.vscode/jenkins-node-positions.json`.

```typescript
import * as vscode from 'vscode';
import * as path from 'path';

type NodePosition = { x: number; y: number };
type PositionMap = Record<string, NodePosition>;

export class PositionStore {
  private storePath: string;

  constructor(documentUri: vscode.Uri, context: vscode.ExtensionContext) {
    // Clé = hash du chemin absolu du fichier
    const fileKey = Buffer.from(documentUri.fsPath).toString('base64').replace(/[/+=]/g, '_');
    this.storePath = path.join(
      path.dirname(documentUri.fsPath),
      '.vscode',
      `jenkins-positions-${fileKey}.json`
    );
  }

  async load(): Promise<PositionMap> {
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(this.storePath));
      return JSON.parse(Buffer.from(content).toString('utf8'));
    } catch {
      return {};
    }
  }

  async save(positions: PositionMap): Promise<void> {
    const content = Buffer.from(JSON.stringify(positions, null, 2), 'utf8');
    await vscode.workspace.fs.writeFile(vscode.Uri.file(this.storePath), content);
  }
}

export function extractPositions(graph: GraphModel): PositionMap {
  return Object.fromEntries(graph.nodes.map(n => [n.id, n.position]));
}

export function mergePositions(graph: GraphModel, positions: PositionMap): GraphModel {
  return {
    ...graph,
    nodes: graph.nodes.map(n => ({
      ...n,
      position: positions[n.id] ?? n.position,
    })),
  };
}
```

## 4.4 — `src/webview/hooks/useVSCodeBridge.ts`

Hook React côté webview qui gère la communication avec l'extension.

```typescript
import { useEffect, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';

// API VSCode disponible dans la webview
declare const acquireVsCodeApi: () => {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

let vscode: ReturnType<typeof acquireVsCodeApi>;
try {
  vscode = acquireVsCodeApi();
} catch {
  // Fallback pour le développement hors VSCode (storybook, etc.)
  vscode = {
    postMessage: (msg) => console.log('[DEV] postMessage:', msg),
    getState: () => null,
    setState: () => {},
  };
}

export function postToExtension(msg: WebviewMessage): void {
  vscode.postMessage(msg);
}

export function useVSCodeBridge(): void {
  const initialized = useRef(false);
  const { setGraph, setValidationErrors, appendLog, setBuildStatus } = useGraphStore();

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'INIT':
          setGraph(msg.graph);
          // Appliquer autoLayout si configuré et pas de positions existantes
          break;
        case 'DOC_CHANGED':
          setGraph(msg.graph);
          break;
        case 'VALIDATION_RESULT':
          setValidationErrors(msg.errors);
          break;
        case 'LOG_LINE':
          appendLog(msg.line);
          break;
        case 'BUILD_STATUS':
          setBuildStatus(msg.status);
          break;
        case 'THEME_CHANGED':
          applyThemeVars();
          break;
      }
    };

    window.addEventListener('message', handler);

    if (!initialized.current) {
      initialized.current = true;
      postToExtension({ type: 'READY' });
    }

    return () => window.removeEventListener('message', handler);
  }, [setGraph, setValidationErrors, appendLog, setBuildStatus]);
}
```

## 4.5 — `src/webview/hooks/useGraphSync.ts`

Synchronisation du graphe vers l'extension (debounced).

```typescript
import { useEffect, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';
import { postToExtension } from './useVSCodeBridge';

const SYNC_DELAY = 300;

export function useGraphSync(): void {
  const nodes = useGraphStore(s => s.nodes);
  const edges = useGraphStore(s => s.edges);
  const isDirty = useGraphStore(s => s.isDirty);
  const markClean = useGraphStore(s => s.markClean);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isDirty) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const graph = buildGraphModel(nodes, edges);
      postToExtension({ type: 'GRAPH_CHANGED', graph });
      markClean();
    }, SYNC_DELAY);

    return () => clearTimeout(timerRef.current);
  }, [nodes, edges, isDirty, markClean]);
}

function buildGraphModel(nodes: Node[], edges: Edge[]): GraphModel {
  // Convertir les ReactFlow Nodes/Edges en GraphModel
  return {
    nodes: nodes.map(n => ({
      id: n.id,
      kind: n.type as NodeKind,
      label: (n.data as any).label ?? '',
      data: n.data as any,
      position: n.position,
    })),
    edges: edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: (e.data?.type ?? 'sequence') as JenkinsEdge['type'],
    })),
    meta: { declarative: true },
  };
}
```

## 4.6 — Gestion du Undo/Redo

VSCode gère le undo/redo au niveau du `TextDocument`. En appliquant les modifications
via `WorkspaceEdit`, on s'insère automatiquement dans la pile d'annulation de VSCode.

**Important** : N'implémente PAS un undo/redo custom dans le graphe. Laisse VSCode gérer ça.
Quand l'utilisateur fait Ctrl+Z, le fichier est restauré → `onDidChangeTextDocument` est déclenché
→ le graphe se met à jour via `DOC_CHANGED`.

**Cependant**, pour les déplacements de nœuds (qui ne touchent pas le fichier), utilise
`useStore` de Zustand avec `temporal` middleware (zustand/middleware/temporal) pour un undo local.

## 4.7 — Éviter les boucles de synchronisation

Le cycle dangereux :
```
Utilisateur modifie graphe → écrit dans le fichier → onDidChangeTextDocument → met à jour le graphe → ...
```

**Solution** : Flag `isSyncing` dans l'extension host.

```typescript
// Dans JenkinsNodeEditor.ts
private isSyncing = false;

private async applyGraphToDocument(...): Promise<void> {
  this.isSyncing = true;
  try {
    // ... WorkspaceEdit
  } finally {
    // Attendre le prochain cycle pour reset le flag
    setTimeout(() => { this.isSyncing = false; }, 50);
  }
}

// Dans onDidChangeTextDocument handler :
if (this.isSyncing) return;  // Ignorer les changements causés par nous-mêmes
```

## 4.8 — Gitignore entry

Ajoute dans le `.gitignore` du workspace utilisateur (ou documente-le) :
```
.vscode/jenkins-positions-*.json
```

Ces fichiers sont des métadonnées locales, pas du code.
