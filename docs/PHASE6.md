# PHASE 6 — Packaging & Publication

## Objectif
Packager l'extension en `.vsix`, configurer les tests E2E, mettre en place la CI GitHub Actions,
et publier sur le Marketplace VSCode et Open VSX.

## Critères d'acceptation
- [ ] `npm run package` → produit un `.vsix` < 5 MB sans erreur
- [ ] Le `.vsix` s'installe localement via `code --install-extension *.vsix`
- [ ] Tests unitaires : `npm run test:unit` → tous verts, coverage > 80%
- [ ] Tests E2E : `npm run test:e2e` → tous verts sur Linux, macOS, Windows
- [ ] GitHub Actions : CI passe sur push + PR
- [ ] `npm run publish` → extension visible sur le Marketplace

---

## 6.1 — `.vscodeignore` (version finale)

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
vite.config.ts
.eslintrc.json
.prettierrc
.github/**
*.Jenkinsfile
coverage/**
```

## 6.2 — Optimisation du bundle

### Extension host (esbuild)
Le bundle `dist/extension.js` doit être minimal. Vérifie que `tree-sitter` est correctement
externalisé ou bundlé en WASM selon l'approche choisie.

```javascript
// esbuild.config.js — version finale avec analyse de taille
const result = await esbuild.build({
  ...buildOptions,
  metafile: true,
});

if (!isWatch) {
  // Analyser la taille du bundle
  const text = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
  console.log(text);
}
```

### Webview (Vite)
Active le tree-shaking agressif pour React Flow (n'importe que les composants utilisés) :

```typescript
// vite.config.ts — optimisation
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,  // Bundle unique pour la webview (pas de code splitting dans webview)
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ['@xyflow/react', 'react', 'react-dom', 'zustand', 'dagre'],
  },
});
```

**Taille cible** :
- `dist/extension.js` : < 500 KB
- `dist/webview/main.js` : < 2 MB (React Flow est lourd)
- Total `.vsix` : < 5 MB

## 6.3 — Tests E2E

### `test/runTests.js`
```javascript
const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-extensions'],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
```

### `test/suite/index.ts`
```typescript
import * as path from 'path';
import Mocha from 'mocha';
import glob from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 30000 });
  const testsRoot = path.resolve(__dirname, '.');

  return new Promise((resolve, reject) => {
    glob('**/*.test.js', { cwd: testsRoot }, (err, files) => {
      if (err) return reject(err);
      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));
      try {
        mocha.run(failures => {
          if (failures > 0) reject(new Error(`${failures} tests failed`));
          else resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}
```

### `test/suite/extension.test.ts`
```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('Extension Test Suite', () => {
  test('Extension activates', async () => {
    const ext = vscode.extensions.getExtension('TON_PUBLISHER.vscode-jenkins-node-editor');
    assert.ok(ext);
    await ext!.activate();
    assert.strictEqual(ext!.isActive, true);
  });

  test('Opens custom editor for Jenkinsfile', async function () {
    this.timeout(10000);
    const fixturePath = path.join(__dirname, '../../test/fixtures/simple.Jenkinsfile');
    const uri = vscode.Uri.file(fixturePath);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'jenkinsNodeEditor.editor');
    // Vérifier que le panel custom est ouvert
    await new Promise(r => setTimeout(r, 2000));
    const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
    const jenkinsTab = tabs.find(t => (t.input as any)?.viewType === 'jenkinsNodeEditor.editor');
    assert.ok(jenkinsTab, 'Jenkins Node Editor tab should be open');
  });

  test('Validate command available', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('jenkinsNodeEditor.validate'));
  });
});
```

## 6.4 — GitHub Actions CI

### `.github/workflows/ci.yml`
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [20]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Unit tests
        run: npm run test:unit

      - name: E2E tests (Linux)
        if: runner.os == 'Linux'
        run: xvfb-run -a npm run test:e2e

      - name: E2E tests (non-Linux)
        if: runner.os != 'Linux'
        run: npm run test:e2e

      - name: Package
        run: npm run package

      - name: Upload VSIX
        uses: actions/upload-artifact@v4
        with:
          name: vsix-${{ matrix.os }}
          path: '*.vsix'

  publish:
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci
      - run: npm run build

      - name: Publish to VS Marketplace
        run: npx vsce publish
        env:
          VSCE_PAT: ${{ secrets.VSCE_PAT }}

      - name: Publish to Open VSX
        run: npx ovsx publish
        env:
          OVSX_PAT: ${{ secrets.OVSX_PAT }}
```

## 6.5 — README.md (pour le Marketplace)

Le README est la première chose que les utilisateurs voient sur le Marketplace.
Il doit contenir :

1. **Badge** : version, downloads, rating
2. **Screenshot/GIF** du node editor en action (OBLIGATOIRE pour être accepté)
3. **Features** : liste claire des fonctionnalités
4. **Requirements** : VSCode >= 1.85, optionnel: Jenkins instance
5. **Extension Settings** : tableau des settings disponibles
6. **Usage** :
   - Ouvrir un Jenkinsfile
   - Cliquer sur l'icône Jenkins dans la barre titre
   - Ou : clic droit → "Open With" → "Jenkins Node Editor"
7. **Known Issues**
8. **Release Notes**

## 6.6 — Publier sur le Marketplace

### Prérequis
1. Créer un compte sur https://marketplace.visualstudio.com/manage
2. Créer un Personal Access Token (PAT) avec scope `Marketplace (Manage)`
3. `npx vsce login TON_PUBLISHER_ID`

### Commandes
```bash
# Vérifier le manifest
npx vsce ls

# Packager
npx vsce package

# Publier
npx vsce publish

# Publier une version spécifique
npx vsce publish minor  # 0.1.0 → 0.2.0
npx vsce publish patch  # 0.1.0 → 0.1.1
```

### Open VSX (pour VS Codium et autres)
```bash
npx ovsx publish -p $OVSX_PAT
```

## 6.7 — Checklist pre-publication

- [ ] `publisher` dans `package.json` est ton vrai ID publisher
- [ ] `version` est ≥ `0.1.0`
- [ ] `icon` dans `package.json` pointe vers `media/icon.png` (128×128 PNG)
- [ ] `repository.url` dans `package.json` pointe vers ton repo GitHub
- [ ] `license` dans `package.json` (MIT recommandé)
- [ ] `README.md` contient au moins un screenshot
- [ ] `CHANGELOG.md` existe
- [ ] Pas de `console.log` laissés en production (remplace par un logger conditionnel)
- [ ] Taille du `.vsix` vérifiée < 5 MB
- [ ] L'extension fonctionne sans connexion Jenkins (mode local)
- [ ] Testé sur VSCode stable ET VSCode Insiders

## 6.8 — Logger conditionnel pour la production

```typescript
// src/extension/logger.ts
import * as vscode from 'vscode';

const channel = vscode.window.createOutputChannel('Jenkins Node Editor');

export const logger = {
  info: (msg: string) => channel.appendLine(`[INFO] ${msg}`),
  warn: (msg: string) => channel.appendLine(`[WARN] ${msg}`),
  error: (msg: string, err?: unknown) => {
    channel.appendLine(`[ERROR] ${msg}`);
    if (err) channel.appendLine(err instanceof Error ? err.stack ?? err.message : String(err));
  },
  show: () => channel.show(),
};
```

Remplace tous les `console.log/error` par `logger.info/error`. L'utilisateur peut voir les
logs via "Output" → "Jenkins Node Editor".
