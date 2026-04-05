# AGENT INSTRUCTIONS — VSCode Jenkins Node Editor Extension

## OVERVIEW

Tu dois implémenter une extension VSCode qui permet de **visualiser et éditer des fichiers
`Jenkinsfile` sous forme d'éditeur nodal interactif** (type node graph / Blueprint). L'éditeur
nodal s'ouvre en parallèle ou à la place de l'éditeur texte classique. Toute modification dans
le graphe est reflétée dans le fichier texte, et vice versa.

Ce document est le **plan complet et contractuel** de l'implémentation. Lis-le entièrement avant
d'écrire la moindre ligne de code. Chaque section décrit une phase, ses fichiers cibles, ses
contraintes techniques et ses critères d'acceptation.

---

## STACK TECHNIQUE

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Extension host | TypeScript 5.x + Node 20 | Standard VSCode |
| UI Webview | React 18 + Vite (mode library) | Écosystème mature |
| Éditeur nodal | **React Flow 11** (`@xyflow/react`) | Meilleur rapport features/taille |
| Parser Jenkinsfile | **tree-sitter** (WASM) + grammaire Groovy | Parse incrémental robuste |
| State management | **Zustand** | Léger, compatible React Flow |
| Styling | **Tailwind CSS** (JIT) + CSS variables VSCode | Thème auto light/dark |
| Tests | **Vitest** (unit) + `@vscode/test-electron` (E2E) | |
| Build | **esbuild** (extension) + **Vite** (webview) | |
| Lint | ESLint + Prettier | |

---

## ARCHITECTURE GLOBALE

```
vscode-jenkins-node-editor/
├── AGENT_INSTRUCTIONS.md          ← CE FICHIER
├── package.json                   ← Manifest extension + scripts
├── tsconfig.json                  ← Config TS extension host
├── tsconfig.webview.json          ← Config TS webview
├── vite.config.ts                 ← Build webview
├── esbuild.config.js              ← Build extension host
├── .eslintrc.json
├── .prettierrc
├── .vscodeignore
├── .vscode/
│   ├── launch.json                ← Debug config (F5)
│   └── tasks.json                 ← Build tasks
├── media/
│   └── icon.png                   ← Icône extension 128×128
├── src/
│   ├── extension/
│   │   ├── extension.ts           ← Point d'entrée (activate/deactivate)
│   │   ├── JenkinsNodeEditor.ts   ← CustomTextEditorProvider principal
│   │   ├── WebviewManager.ts      ← Cycle de vie du panel webview
│   │   ├── MessageBus.ts          ← Bridge typé extension ↔ webview
│   │   ├── JenkinsValidator.ts    ← Validation via API REST Jenkins
│   │   └── JenkinsClient.ts       ← Client REST Jenkins (build, logs)
│   ├── parser/
│   │   ├── JenkinsfileParser.ts   ← Jenkinsfile → AST → GraphModel
│   │   ├── JenkinsfileGenerator.ts← GraphModel → Jenkinsfile texte
│   │   ├── ASTTypes.ts            ← Types pour l'AST interne
│   │   └── grammar/               ← Grammaire tree-sitter Groovy (WASM)
│   └── webview/
│       ├── main.tsx               ← Point d'entrée React
│       ├── App.tsx                ← Composant racine
│       ├── components/
│       │   ├── NodeCanvas.tsx     ← React Flow canvas principal
│       │   ├── NodePalette.tsx    ← Palette latérale drag-source
│       │   ├── NodeInspector.tsx  ← Panneau propriétés nœud sélectionné
│       │   ├── Toolbar.tsx        ← Barre outils (zoom, layout, validate)
│       │   └── LogPanel.tsx       ← Affichage logs Jenkins streaming
│       ├── nodes/
│       │   ├── StageNode.tsx      ← Nœud "stage { ... }"
│       │   ├── StepNode.tsx       ← Nœud step individuel (sh, echo, etc.)
│       │   ├── AgentNode.tsx      ← Nœud "agent { ... }"
│       │   ├── ParallelNode.tsx   ← Nœud "parallel { ... }"
│       │   ├── PostNode.tsx       ← Nœud "post { always/failure/... }"
│       │   └── index.ts           ← Export nodeTypes map
│       ├── hooks/
│       │   ├── useVSCodeBridge.ts ← Hook communication extension↔webview
│       │   ├── useGraphSync.ts    ← Sync graphe ↔ document texte
│       │   └── useJenkinsAPI.ts   ← Hook API Jenkins (validate, run)
│       ├── store/
│       │   └── graphStore.ts      ← Store Zustand (nodes, edges, config)
│       └── utils/
│           ├── layout.ts          ← Auto-layout dagre
│           └── theme.ts           ← Adaptateur thème VSCode → CSS vars
├── test/
│   ├── suite/
│   │   ├── parser.test.ts         ← Tests unitaires parser
│   │   ├── generator.test.ts      ← Tests unitaires générateur
│   │   └── extension.test.ts      ← Tests E2E extension
│   └── fixtures/
│       ├── simple.Jenkinsfile
│       ├── parallel.Jenkinsfile
│       └── complex.Jenkinsfile
└── docs/
    ├── PHASE1.md
    ├── PHASE2.md
    ├── PHASE3.md
    ├── PHASE4.md
    ├── PHASE5.md
    └── PHASE6.md
```

---

## PHASES D'IMPLÉMENTATION

Implémente dans l'ordre strict des phases. Ne passe pas à la phase N+1 avant que tous les
critères d'acceptation de la phase N soient satisfaits.

### PHASE 1 — Fondations (voir `docs/PHASE1.md`)
### PHASE 2 — Moteur nodal React Flow (voir `docs/PHASE2.md`)
### PHASE 3 — Parser bidirectionnel (voir `docs/PHASE3.md`)
### PHASE 4 — Intégration VSCode (voir `docs/PHASE4.md`)
### PHASE 5 — Fonctionnalités Jenkins avancées (voir `docs/PHASE5.md`)
### PHASE 6 — Packaging & Publication (voir `docs/PHASE6.md`)

---

## CONVENTIONS DE CODE

### TypeScript
- `strict: true` dans tous les tsconfig
- Pas de `any` implicite — utilise `unknown` + type guards
- Tous les messages cross-frame sont des **discriminated unions** typés
- Préfixe `I` interdit pour les interfaces (préfère `type`)

### Nommage
- Fichiers : `PascalCase.ts` pour les classes, `camelCase.ts` pour les modules
- Composants React : `PascalCase.tsx`
- Types/interfaces : `PascalCase`
- Constantes globales : `UPPER_SNAKE_CASE`
- Variables/fonctions : `camelCase`

### React
- Composants fonctionnels uniquement (pas de classes)
- `useCallback` et `useMemo` sur tous les handlers passés à React Flow
- Pas de state local pour ce qui doit être synchronisé — tout passe par Zustand

### Sécurité Webview
- CSP stricte dans chaque panel (voir template dans `docs/PHASE1.md`)
- `getNonce()` pour chaque script inline
- Jamais d'eval, jamais de `innerHTML` non sanitisé

---

## MODÈLE DE DONNÉES CENTRAL

```typescript
// GraphModel — le modèle partagé entre parser, store et générateur

type NodeKind =
  | 'pipeline'
  | 'agent'
  | 'stage'
  | 'step'
  | 'parallel'
  | 'post'
  | 'environment'
  | 'options'
  | 'parameters'
  | 'triggers';

type JenkinsNode = {
  id: string;
  kind: NodeKind;
  label: string;
  data: Record<string, unknown>;  // Propriétés spécifiques au type
  position: { x: number; y: number };
};

type JenkinsEdge = {
  id: string;
  source: string;
  target: string;
  type: 'sequence' | 'parallel' | 'condition';
};

type GraphModel = {
  nodes: JenkinsNode[];
  edges: JenkinsEdge[];
  meta: {
    jenkinsVersion?: string;
    agentLabel?: string;
    declarative: boolean;  // true = déclaratif, false = scripted
  };
};
```

---

## PROTOCOLE DE MESSAGES (extension ↔ webview)

Tous les messages sont des objets JSON avec un champ `type` discriminant.

```typescript
// Extension → Webview
type ExtensionMessage =
  | { type: 'INIT'; graph: GraphModel; config: ExtensionConfig }
  | { type: 'DOC_CHANGED'; graph: GraphModel }
  | { type: 'VALIDATION_RESULT'; errors: ValidationError[] }
  | { type: 'LOG_LINE'; line: string; stream: 'stdout' | 'stderr' }
  | { type: 'BUILD_STATUS'; status: 'running' | 'success' | 'failure' | 'aborted' }
  | { type: 'THEME_CHANGED'; theme: VSCodeTheme };

// Webview → Extension
type WebviewMessage =
  | { type: 'GRAPH_CHANGED'; graph: GraphModel }
  | { type: 'VALIDATE_REQUEST' }
  | { type: 'RUN_BUILD'; branch?: string }
  | { type: 'ABORT_BUILD' }
  | { type: 'READY' }
  | { type: 'ERROR'; message: string };
```

---

## CRITÈRES D'ACCEPTATION GLOBAUX

Avant de considérer l'extension terminée, tous ces points doivent être verts :

- [ ] Ouvrir un `Jenkinsfile` → l'éditeur nodal s'ouvre automatiquement
- [ ] Modifier un nœud → le fichier texte est mis à jour dans les 500ms
- [ ] Modifier le fichier texte → le graphe se met à jour sans perte de position
- [ ] Drag un nœud depuis la palette → il apparaît sur le canvas avec propriétés par défaut
- [ ] Connexion Jenkins configurée → le bouton "Validate" appelle l'API et affiche les erreurs
- [ ] Connexion Jenkins configurée → "Run" déclenche le build et streame les logs
- [ ] Thème VSCode light/dark/high-contrast → l'éditeur s'adapte sans rechargement
- [ ] Undo/Redo (`Ctrl+Z` / `Ctrl+Y`) → fonctionne comme dans l'éditeur texte
- [ ] `Ctrl+S` → sauvegarde le fichier (même comportement que l'éditeur texte)
- [ ] Extension packagée avec `vsce package` sans erreur
- [ ] Taille du `.vsix` < 5 MB (sans les node_modules)
- [ ] Tests unitaires parser : coverage > 80%
- [ ] `vsce publish` → disponible sur le Marketplace

---

## DÉPENDANCES NPM

### Extension host (`dependencies`)
```json
{
  "tree-sitter": "^0.21.0",
  "tree-sitter-groovy": "^0.1.0",
  "dagre": "^0.8.5"
}
```

### Extension host (`devDependencies`)
```json
{
  "@types/vscode": "^1.85.0",
  "@types/node": "^20.0.0",
  "@vscode/test-electron": "^2.3.0",
  "@vscode/vsce": "^2.22.0",
  "esbuild": "^0.20.0",
  "typescript": "^5.3.0",
  "eslint": "^8.56.0",
  "prettier": "^3.2.0",
  "vitest": "^1.2.0"
}
```

### Webview (`dependencies`)
```json
{
  "@xyflow/react": "^12.0.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "zustand": "^4.5.0",
  "dagre": "^0.8.5",
  "clsx": "^2.1.0"
}
```

### Webview (`devDependencies`)
```json
{
  "@types/react": "^18.2.0",
  "@types/react-dom": "^18.2.0",
  "@types/dagre": "^0.7.3",
  "vite": "^5.0.0",
  "@vitejs/plugin-react": "^4.2.0",
  "tailwindcss": "^3.4.0",
  "autoprefixer": "^10.4.0",
  "postcss": "^8.4.0"
}
```

---

## COMMANDES NPM ATTENDUES

```bash
npm run build          # Build extension + webview (prod)
npm run build:ext      # Build extension host seulement
npm run build:web      # Build webview seulement
npm run watch          # Watch mode (dev)
npm run test           # Tous les tests
npm run test:unit      # Tests unitaires Vitest
npm run test:e2e       # Tests E2E @vscode/test-electron
npm run lint           # ESLint
npm run format         # Prettier
npm run package        # vsce package → .vsix
npm run publish        # vsce publish
```
