// src/extension/JenkinsNodeEditor.ts
// Implémentation principale du CustomTextEditorProvider
// Voir docs/PHASE1.md §1.7 et docs/PHASE4.md §4.2 pour les instructions complètes
//
// ╔══════════════════════════════════════════════════════════╗
// ║  AGENT : Implémente cette classe en suivant PHASE1.md   ║
// ║  puis PHASE4.md dans cet ordre.                         ║
// ╚══════════════════════════════════════════════════════════╝

import * as vscode from 'vscode';
import * as path from 'path';
import { JenkinsfileParser } from '../parser/JenkinsfileParser';
import { JenkinsfileGenerator } from '../parser/JenkinsfileGenerator';
import { MessageBus } from './MessageBus';
import { PositionStore, extractPositions, mergePositions } from './PositionStore';
import { JenkinsValidator } from './JenkinsValidator';
import { JenkinsClient } from './JenkinsClient';
import { logger } from './logger';
import type { ExtensionConfig, GraphModel, VSCodeTheme } from '../shared/types';

// ─── Utilitaires ────────────────────────────────────────────────────────────

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  const bytes = require('crypto').randomBytes(32) as Buffer;
  for (const b of bytes) { nonce += chars[b % chars.length]; }
  return nonce;
}

function mapVSCodeTheme(kind: vscode.ColorThemeKind): VSCodeTheme {
  switch (kind) {
    case vscode.ColorThemeKind.Dark:
    case vscode.ColorThemeKind.HighContrastDark:
      return 'dark';
    case vscode.ColorThemeKind.HighContrast:
      return 'high-contrast';
    default:
      return 'light';
  }
}

// ─── Provider principal ─────────────────────────────────────────────────────

export class JenkinsNodeEditor implements vscode.CustomTextEditorProvider {
  private readonly parser = new JenkinsfileParser();
  private readonly generator = new JenkinsfileGenerator();

  /** Map docUri → { bus, panel } pour les panels ouverts */
  private readonly activePanels = new Map<string, { bus: MessageBus; panel: vscode.WebviewPanel }>();

  /**
   * Sync-depth counter instead of a boolean flag.
   * Incremented before applyEdit, decremented in finally.
   * Handles re-entrant saves (e.g. slow disk + rapid edits) safely.
   */
  private syncDepth = 0;

  constructor(private readonly context: vscode.ExtensionContext) {}

  // ─── Secret storage helpers ───────────────────────────────────────────

  private static readonly SECRET_KEY = 'jenkinsNodeEditor.token';

  /** Saves the Jenkins API token into VS Code's encrypted SecretStorage. */
  async storeToken(token: string): Promise<void> {
    await this.context.secrets.store(JenkinsNodeEditor.SECRET_KEY, token);
  }

  /** Retrieves the token from SecretStorage, falling back to settings (migration path). */
  private async resolveToken(): Promise<string> {
    const secret = await this.context.secrets.get(JenkinsNodeEditor.SECRET_KEY);
    if (secret) return secret;
    // One-time migration: move token from settings → SecretStorage then clear it
    const cfg = vscode.workspace.getConfiguration('jenkinsNodeEditor');
    const legacyToken = cfg.get<string>('jenkinsToken', '');
    if (legacyToken) {
      await this.context.secrets.store(JenkinsNodeEditor.SECRET_KEY, legacyToken);
      await cfg.update('jenkinsToken', undefined, vscode.ConfigurationTarget.Global);
      await cfg.update('jenkinsToken', undefined, vscode.ConfigurationTarget.Workspace);
      logger.info('Migrated Jenkins token from settings to SecretStorage');
      return legacyToken;
    }
    return '';
  }

  // ─── Point d'entrée VSCode ─────────────────────────────────────────────

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // TODO: Implémenter cette méthode selon docs/PHASE1.md §1.7 + docs/PHASE4.md §4.2
    //
    // Étapes :
    // 1. Configurer webviewPanel.webview.options (enableScripts, localResourceRoots)
    // 2. Générer le HTML de la webview (getWebviewHtml)
    // 3. Créer un MessageBus et un PositionStore
    // 4. Enregistrer les handlers de messages (READY, GRAPH_CHANGED, VALIDATE_REQUEST, etc.)
    // 5. Écouter vscode.workspace.onDidChangeTextDocument
    // 6. Écouter vscode.window.onDidChangeActiveColorTheme
    // 7. Nettoyer les listeners dans webviewPanel.onDidDispose
    //
    // ANTI-BOUCLE : voir docs/PHASE4.md §4.7 pour la gestion du flag isSyncing

    // 1. Configure webview
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    webviewPanel.webview.html = this.getWebviewHtml(webviewPanel.webview, document);

    // 2. Setup bus + store
    const bus = new MessageBus(webviewPanel);
    const posStore = new PositionStore(document.uri);
    const config = await this.getConfig();
    this.activePanels.set(document.uri.toString(), { bus, panel: webviewPanel });

    // 3. Handle READY — send initial graph
    const readyDisposable = bus.on('READY', async () => {
      try {
        const { graph } = await this.parser.parse(document.getText());
        const saved = await posStore.load();
        const merged = mergePositions(graph, saved);
        bus.send({ type: 'INIT', graph: merged, theme: mapVSCodeTheme(vscode.window.activeColorTheme.kind), config });
      } catch (err) {
        logger.error('Failed to parse on READY', err);
      }
    });

    // 4. Handle GRAPH_CHANGED — write back to document
    const graphChangedDisposable = bus.on('GRAPH_CHANGED', async (msg) => {
      if (this.syncDepth > 0) return;
      const positions = extractPositions(msg.graph);
      await posStore.save(positions);
      await this.applyGraphToDocument(msg.graph, document);
    });

    // 5. Handle VALIDATE_REQUEST
    const validateDisposable = bus.on('VALIDATE_REQUEST', async (msg) => {
      try {
        const validator = new JenkinsValidator(config);
        const errors = await validator.validate(msg.content ?? document.getText());
        bus.send({ type: 'VALIDATION_RESULT', errors });
      } catch (err) {
        logger.error('Validation error', err);
        bus.send({ type: 'VALIDATION_RESULT', errors: [] });
      }
    });

    // 6. Handle RUN_BUILD
    const runDisposable = bus.on('RUN_BUILD', async (msg) => {
      if (!config.jenkinsUrl) {
        bus.send({ type: 'LOG_LINE', line: 'Jenkins URL not configured', stream: 'stderr' });
        return;
      }
      try {
        const client = new JenkinsClient(config);
        const queueUrl = await client.triggerBuild(msg.jobName, msg.params);
        const buildNumber = await client.getBuildNumber(queueUrl);
        bus.send({ type: 'BUILD_STATUS', status: 'running' });
        for await (const line of client.streamLogs(msg.jobName, buildNumber)) {
          bus.send({ type: 'LOG_LINE', line, stream: 'stdout' });
        }
        bus.send({ type: 'BUILD_STATUS', status: 'success' });
      } catch (err) {
        bus.send({ type: 'LOG_LINE', line: String(err), stream: 'stderr' });
        bus.send({ type: 'BUILD_STATUS', status: 'failure' });
      }
    });

    // 7. Handle ABORT_BUILD
    const abortDisposable = bus.on('ABORT_BUILD', async (msg) => {
      if (!config.jenkinsUrl) return;
      try {
        const client = new JenkinsClient(config);
        await client.abortBuild(msg.jobName, msg.buildNumber);
        bus.send({ type: 'BUILD_STATUS', status: 'aborted' });
      } catch (err) {
        logger.error('Abort error', err);
      }
    });

    // 8. Listen to document changes
    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (this.syncDepth > 0) return;
      try {
        const { graph } = await this.parser.parse(e.document.getText());
        const saved = await posStore.load();
        const merged = mergePositions(graph, saved);
        bus.send({ type: 'DOC_CHANGED', graph: merged });
      } catch (err) {
        logger.error('Parse error on doc change', err);
      }
    });

    // 9. Listen to theme changes
    const themeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
      bus.send({ type: 'THEME_CHANGED', theme: mapVSCodeTheme(theme.kind) });
    });

    // 10. Cleanup on dispose
    webviewPanel.onDidDispose(() => {
      this.activePanels.delete(document.uri.toString());
      bus.dispose();
      readyDisposable.dispose();
      graphChangedDisposable.dispose();
      validateDisposable.dispose();
      runDisposable.dispose();
      abortDisposable.dispose();
      docChangeDisposable.dispose();
      themeDisposable.dispose();
    });
  }

  // ─── Génération HTML ───────────────────────────────────────────────────

  private getWebviewHtml(
    webview: vscode.Webview,
    document: vscode.TextDocument
  ): string {
    // TODO: Voir docs/PHASE1.md §1.7 pour le template HTML complet
    //
    // Points critiques :
    // - CSP stricte avec nonce (voir le template dans PHASE1.md)
    // - scriptUri via webview.asWebviewUri(...)
    // - stylesUri via webview.asWebviewUri(...)
    // - title = nom du fichier

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

    const fileName = path.basename(document.fileName);
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link rel="stylesheet" href="${stylesUri}" />
  <title>${fileName}</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  // ─── Synchronisation graphe → fichier ─────────────────────────────────

  private async applyGraphToDocument(
    graph: GraphModel,
    document: vscode.TextDocument
  ): Promise<void> {
    // TODO: Voir docs/PHASE4.md §4.2 et §4.7
    //
    // 1. Générer le Jenkinsfile depuis le graphe : this.generator.generate(graph)
    // 2. Créer un WorkspaceEdit qui remplace tout le contenu du document
    // 3. Appliquer l'edit : vscode.workspace.applyEdit(edit)
    // 4. Gérer le flag isSyncing pour éviter la boucle (voir §4.7)

    const text = this.generator.generate(graph);
    if (!text.trim()) return;
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length),
    );
    edit.replace(document.uri, fullRange, text);
    this.syncDepth++;
    try {
      await vscode.workspace.applyEdit(edit);
    } finally {
      this.syncDepth--;
    }
  }

  // ─── Config extension ──────────────────────────────────────────────────

  private async getConfig(): Promise<ExtensionConfig> {
    const config = vscode.workspace.getConfiguration('jenkinsNodeEditor');
    return {
      jenkinsUrl: config.get<string>('jenkinsUrl', ''),
      jenkinsUser: config.get<string>('jenkinsUser', ''),
      jenkinsToken: await this.resolveToken(),
      autoLayout: config.get<boolean>('autoLayout', true),
      syncDelay: config.get<number>('syncDelay', 300),
    };
  }
}
