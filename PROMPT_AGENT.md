# PROMPT PRINCIPAL — Agent de code : Jenkins Node Editor VSCode Extension

## CONTEXTE

Tu es un agent de code expert TypeScript/React/VSCode. Tu dois implémenter une extension
VSCode complète qui permet de **visualiser et éditer des fichiers `Jenkinsfile` sous forme
d'éditeur nodal interactif** (type node graph).

Le projet est entièrement scaffoldé et documenté. Tous les fichiers nécessaires sont présents :
- Les squelettes TypeScript/TSX avec les `TODO` commentés
- Les instructions détaillées phase par phase dans `docs/`
- Les types partagés complets dans `src/shared/`
- Les fixtures de test dans `test/fixtures/`

**Ton rôle : implémenter les `TODO` dans l'ordre des phases, sans modifier l'architecture.**

---

## DÉMARRAGE OBLIGATOIRE

Avant d'écrire la moindre ligne de code, lis ces fichiers dans cet ordre exact :

1. `AGENT_INSTRUCTIONS.md`          ← Vue d'ensemble, stack, conventions, modèle de données
2. `docs/PHASE1.md`                 ← Fondations VSCode Extension
3. `docs/PHASE2.md`                 ← Moteur React Flow
4. `docs/PHASE3.md`                 ← Parser Jenkinsfile ↔ Graphe
5. `docs/PHASE4.md`                 ← Synchronisation bidirectionnelle
6. `docs/PHASE5.md`                 ← Intégration Jenkins API
7. `docs/PHASE6.md`                 ← Packaging & Publication
8. `src/shared/types.ts`            ← Tous les types TypeScript
9. `src/shared/messages.ts`         ← Protocole de messages

---

## ORDRE D'IMPLÉMENTATION

Implémente **une phase à la fois**, dans l'ordre. Valide les critères d'acceptation
de chaque phase avant de passer à la suivante.

### Phase 1 — Fondations
Fichiers à compléter :
- `src/extension/extension.ts` — déjà complet, vérifier seulement
- `src/extension/JenkinsNodeEditor.ts` — implémenter `resolveCustomTextEditor` et `getWebviewHtml`
- `src/extension/MessageBus.ts` — déjà complet
- `src/extension/logger.ts` — déjà complet

Critère de validation : `npm run build` sans erreur + F5 ouvre la fenêtre Extension Host.

### Phase 2 — Moteur React Flow
Fichiers à compléter :
- `src/webview/store/graphStore.ts` — compléter `autoLayout` 
- `src/webview/components/NodeCanvas.tsx` — déjà complet
- `src/webview/components/NodePalette.tsx` — déjà complet
- `src/webview/components/NodeInspector.tsx` — déjà complet
- `src/webview/components/Toolbar.tsx` — déjà complet
- `src/webview/components/LogPanel.tsx` — déjà complet
- Tous les nœuds dans `src/webview/nodes/` — déjà complets

Critère de validation : la webview affiche un canvas React Flow avec la palette et les nœuds.

### Phase 3 — Parser (priorité absolue, la plus complexe)
Fichiers à compléter :
- `src/parser/JenkinsfileParser.ts` — implémenter TOUT : `tokenizeBlocks`, `parseDeclarative`,
  `parseScripted`, `parseAgent`, `parseStep`, `parseWhen`, `parseEnvironment`
- `src/parser/JenkinsfileGenerator.ts` — implémenter `generateDeclarative`, `generateStage`,
  `generateStep`, `generatePost`
- `src/parser/layout.ts` — déjà complet

Critère de validation : `npm run test:unit` — tous les tests de `test/suite/parser.test.ts` passent.

### Phase 4 — Synchronisation VSCode
Fichiers à compléter :
- `src/extension/JenkinsNodeEditor.ts` — compléter `resolveCustomTextEditor` avec
  la gestion des messages, le debounce, et l'anti-boucle de sync
- `src/extension/PositionStore.ts` — déjà complet (bug: doublon de type à corriger)
- `src/webview/hooks/useVSCodeBridge.ts` — déjà complet
- `src/webview/hooks/useGraphSync.ts` — déjà complet

Critère de validation : modifier le graphe → le fichier texte se met à jour en < 500ms.

### Phase 5 — Jenkins API
Fichiers à compléter :
- `src/extension/JenkinsClient.ts` — implémenter TOUT : `validatePipeline`, `getStepCatalog`,
  `triggerBuild`, `getBuildNumber`, `streamLogs`, `abortBuild`
- `src/extension/JenkinsValidator.ts` — déjà complet

Critère de validation : avec une instance Jenkins configurée, "Validate" et "Run" fonctionnent.

### Phase 6 — Packaging
- Compléter `package.json` : remplacer `YOUR_PUBLISHER_ID` et `YOUR_USERNAME`
- `npm run package` → `.vsix` < 5 MB
- Documenter le `README.md` (à créer)

---

## RÈGLES STRICTES

### Ne jamais faire
- ❌ Modifier `src/shared/types.ts` ou `src/shared/messages.ts` (types contractuels)
- ❌ Changer l'architecture des dossiers
- ❌ Utiliser `any` TypeScript implicite
- ❌ Utiliser `console.log` → utiliser `logger.info/error` dans l'extension host
- ❌ Passer à la Phase N+1 avant que les critères de la Phase N soient verts
- ❌ Installer des dépendances npm non listées dans `AGENT_INSTRUCTIONS.md`

### Toujours faire
- ✅ Lire le fichier `.md` correspondant AVANT d'implémenter la phase
- ✅ Implémenter la gestion d'erreur (try/catch) sur toutes les opérations async
- ✅ Respecter le flag `isSyncing` pour éviter les boucles (voir `docs/PHASE4.md §4.7`)
- ✅ Vérifier `npm run build` après chaque phase
- ✅ Vérifier `npm run lint` (warnings tolérés, erreurs bloquantes)

---

## COMMANDES UTILES

```bash
npm run build          # Build complet (extension + webview)
npm run build:ext      # Build extension host seulement (plus rapide)
npm run build:web      # Build webview seulement
npm run watch          # Mode watch (dev)
npm run test:unit      # Tests unitaires Vitest (parser)
npm run lint           # ESLint
```

---

## POINTS TECHNIQUES CRITIQUES

### Anti-boucle de synchronisation (PHASE4)
Quand le graphe change → on écrit dans le fichier → `onDidChangeTextDocument` se déclenche →
on reparse → on envoie `DOC_CHANGED` → boucle infinie.
**Solution** : flag `isSyncing = true` pendant l'écriture, ignorer `onDidChangeTextDocument`
si `isSyncing`. Voir `docs/PHASE4.md §4.7`.

### CSP Webview (PHASE1)
La Content Security Policy est STRICTE. Chaque script doit avoir `nonce="${nonce}"`.
Sans ça, la webview est blanche et la console affiche des erreurs CSP.

### React Flow + Zustand (PHASE2)
Les handlers `onNodesChange`, `onEdgesChange`, `onConnect` DOIVENT être wrappés dans
`useCallback` ou lus directement depuis le store pour éviter les re-renders infinis.

### tree-sitter WASM (PHASE3)
Si tu utilises tree-sitter, le fichier `.wasm` doit être copié dans `dist/` au build.
Si c'est trop complexe, implémente le parser regex maison décrit dans `docs/PHASE3.md §3.3`
— il couvre 90% des Jenkinsfiles réels et est plus simple à déboguer.

### retainContextWhenHidden (PHASE1)
**OBLIGATOIRE** dans les options du CustomEditorProvider. Sans ça, React perd son state
à chaque fois que l'utilisateur change d'onglet.

---

## LIVRABLE ATTENDU

À la fin de l'implémentation :
- `npm run build` → 0 erreur
- `npm run test:unit` → tous verts, coverage > 80% sur `src/parser/`
- `npm run package` → `vscode-jenkins-node-editor-0.1.0.vsix` < 5 MB
- Ouvrir un `Jenkinsfile` dans VSCode → l'éditeur nodal s'affiche
- Modifier un nœud → le fichier texte se met à jour
- Modifier le fichier texte → le graphe se met à jour
