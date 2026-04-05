# PHASE 1 — Fondations du projet

## Objectif
Mettre en place la structure complète du projet, le manifest de l'extension, les configs de build,
et un WebviewPanel fonctionnel qui affiche "Hello Jenkins Node Editor" dans une webview.

## Critères d'acceptation de cette phase
- [ ] `npm run build` produit `dist/extension.js` et `dist/webview/index.html` sans erreur
- [ ] Appuyer sur F5 dans VSCode lance une fenêtre Extension Development Host
- [ ] Ouvrir n'importe quel fichier nommé `Jenkinsfile` → le panel webview s'ouvre
- [ ] Le panel affiche le texte brut du Jenkinsfile dans la webview (sans graphe encore)
- [ ] Le titre du panel = nom du fichier
- [ ] Fermer le panel puis rouvrir le fichier → le panel se rouvre
- [ ] Aucune erreur dans la console Extension Host ni dans la console DevTools webview

---

## 1.1 — `package.json` (manifest extension)

Crée `/package.json` avec ce contenu EXACT (complète les champs vides) :

```json
{
  "name": "vscode-jenkins-node-editor",
  "displayName": "Jenkins Node Editor",
  "description": "Visual node-based editor for Jenkinsfile pipelines",
  "version": "0.1.0",
  "publisher": "TON_PUBLISHER_ID",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other", "Visualization"],
  "keywords": ["jenkins", "pipeline", "jenkinsfile", "node editor", "CI/CD"],
  "activationEvents": [],
  "main": "./dist/extension.js",
  "contributes": {
    "customEditors": [
      {
        "viewType": "jenkinsNodeEditor.editor",
        "displayName": "Jenkins Node Editor",
        "selector": [
          { "filenamePattern": "Jenkinsfile" },
          { "filenamePattern": "*.jenkinsfile" },
          { "filenamePattern": "Jenkinsfile.*" }
        ],
        "priority": "option"
      }
    ],
    "commands": [
      {
        "command": "jenkinsNodeEditor.openEditor",
        "title": "Open Jenkins Node Editor",
        "category": "Jenkins"
      },
      {
        "command": "jenkinsNodeEditor.validate",
        "title": "Validate Jenkinsfile",
        "category": "Jenkins"
      },
      {
        "command": "jenkinsNodeEditor.runBuild",
        "title": "Run Jenkins Build",
        "category": "Jenkins"
      }
    ],
    "menus": {
      "editor/title": [
        {
          "command": "jenkinsNodeEditor.openEditor",
          "when": "resourceFilename == Jenkinsfile || resourceExtname == .jenkinsfile",
          "group": "navigation"
        }
      ]
    },
    "configuration": {
      "title": "Jenkins Node Editor",
      "properties": {
        "jenkinsNodeEditor.jenkinsUrl": {
          "type": "string",
          "default": "",
          "description": "Jenkins server URL (ex: http://localhost:8080)"
        },
        "jenkinsNodeEditor.jenkinsUser": {
          "type": "string",
          "default": "",
          "description": "Jenkins username"
        },
        "jenkinsNodeEditor.jenkinsToken": {
          "type": "string",
          "default": "",
          "description": "Jenkins API token"
        },
        "jenkinsNodeEditor.autoLayout": {
          "type": "boolean",
          "default": true,
          "description": "Auto-layout graph on open"
        },
        "jenkinsNodeEditor.syncDelay": {
          "type": "number",
          "default": 300,
          "description": "Debounce delay (ms) before syncing graph → text"
        }
      }
    }
  },
  "scripts": {
    "build": "npm run build:ext && npm run build:web",
    "build:ext": "node esbuild.config.js",
    "build:web": "vite build --config vite.config.ts",
    "watch": "concurrently \"node esbuild.config.js --watch\" \"vite build --watch --config vite.config.ts\"",
    "test": "npm run test:unit && npm run test:e2e",
    "test:unit": "vitest run",
    "test:e2e": "node ./test/runTests.js",
    "lint": "eslint src --ext .ts,.tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx}\"",
    "package": "vsce package",
    "publish": "vsce publish"
  }
}
```

## 1.2 — `tsconfig.json` (extension host)

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "sourceMap": true,
    "rootDir": "src/extension",
    "outDir": "dist",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/extension/**/*.ts", "src/parser/**/*.ts"],
  "exclude": ["src/webview"]
}
```

## 1.3 — `tsconfig.webview.json`

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src/webview/**/*.ts", "src/webview/**/*.tsx"]
}
```

## 1.4 — `esbuild.config.js`

```javascript
const esbuild = require('esbuild');
const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/extension/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  minify: !isWatch,
};

if (isWatch) {
  esbuild.context(buildOptions).then(ctx => ctx.watch());
} else {
  esbuild.build(buildOptions).catch(() => process.exit(1));
}
```

## 1.5 — `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/webview',
    rollupOptions: {
      input: 'src/webview/main.tsx',
      output: {
        entryFileNames: 'main.js',
        assetFileNames: '[name][extname]',
      },
    },
    target: 'es2022',
    minify: true,
    cssMinify: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src/webview') },
  },
});
```

## 1.6 — `src/extension/extension.ts`

Point d'entrée principal. Doit :
1. Enregistrer le `CustomTextEditorProvider` (`JenkinsNodeEditor`)
2. Enregistrer les commandes contributées
3. Disposer proprement à la désactivation

```typescript
import * as vscode from 'vscode';
import { JenkinsNodeEditor } from './JenkinsNodeEditor';

export function activate(context: vscode.ExtensionContext): void {
  const editor = new JenkinsNodeEditor(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'jenkinsNodeEditor.editor',
      editor,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
          enableFindWidget: false,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jenkinsNodeEditor.openEditor', () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        vscode.commands.executeCommand(
          'vscode.openWith',
          activeEditor.document.uri,
          'jenkinsNodeEditor.editor'
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jenkinsNodeEditor.validate', () => {
      vscode.commands.executeCommand('jenkinsNodeEditor.editor.validate');
    })
  );
}

export function deactivate(): void {}
```

## 1.7 — `src/extension/JenkinsNodeEditor.ts`

Implémente `vscode.CustomTextEditorProvider`. C'est la classe centrale de la phase 1.

Responsabilités :
- `resolveCustomTextEditor(document, webviewPanel, token)` : point d'entrée pour chaque fichier
- Initialiser la webview avec la CSP stricte
- Charger le HTML de la webview depuis `dist/webview/`
- Envoyer le contenu initial du document à la webview via `postMessage`
- Écouter les changements du document (`vscode.workspace.onDidChangeTextDocument`)

**CSP à utiliser (OBLIGATOIRE)** :
```
default-src 'none';
script-src 'nonce-${nonce}' ${webview.cspSource};
style-src ${webview.cspSource} 'unsafe-inline';
font-src ${webview.cspSource};
img-src ${webview.cspSource} data:;
connect-src 'none';
```

**Fonction `getNonce()`** :
```typescript
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
```

**HTML template de la webview** :
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${stylesUri}" />
  <title>Jenkins Node Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__VSCODE_INITIAL_STATE__ = ${JSON.stringify(initialState)};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>
```

`initialState` doit contenir :
```typescript
{
  rawContent: document.getText(),
  fileName: document.fileName,
  theme: getCurrentTheme(), // 'light' | 'dark' | 'high-contrast'
  config: getExtensionConfig(), // lire les settings de l'extension
}
```

## 1.8 — `.vscode/launch.json`

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "${defaultBuildTask}"
    },
    {
      "name": "Run Extension Tests",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/dist/test/suite/index"
      ],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "${defaultBuildTask}"
    }
  ]
}
```

## 1.9 — `.vscode/tasks.json`

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "build",
      "type": "shell",
      "command": "npm run build",
      "group": { "kind": "build", "isDefault": true },
      "problemMatcher": ["$tsc"]
    }
  ]
}
```

## 1.10 — `.vscodeignore`

```
.vscode/**
src/**
test/**
docs/**
node_modules/**
*.map
tsconfig*.json
esbuild.config.js
vite.config.ts
.eslintrc.json
.prettierrc
```

## Notes importantes
- `retainContextWhenHidden: true` est ESSENTIEL pour ne pas perdre le state React quand l'onglet est masqué
- La webview doit détecter le thème VSCode via `document.body.classList` (VSCode ajoute `vscode-light`, `vscode-dark`, `vscode-high-contrast`)
- Utilise `vscode.Uri.joinPath(context.extensionUri, ...)` pour construire les URIs des assets
