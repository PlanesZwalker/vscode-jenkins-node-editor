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
import * as crypto from 'crypto';
import { JenkinsfileParser } from '../parser/JenkinsfileParser';
import { JenkinsfileGenerator } from '../parser/JenkinsfileGenerator';
import { MessageBus } from './MessageBus';
import { PositionStore, extractPositions, mergePositions } from './PositionStore';
import { computeMinimalEdit, isEditSafe, normalizeEol, usesCrlf } from '../parser/surgicalEdit';
import { JenkinsValidator } from './JenkinsValidator';
import { JenkinsClient } from './JenkinsClient';
import { logger } from './logger';
import type { ExtensionConfig, GraphModel, PublicConfig, ConfigKey, VSCodeTheme } from '../shared/types';
import type { WebviewMessage } from '../shared/messages';
import { inferNodeId } from '../parser/nodeMapping';

// ─── Utilitaires ────────────────────────────────────────────────────────────

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  const bytes = crypto.randomBytes(32) as Buffer;
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

  /** Dernier graphe connu par document — sert à rattacher les erreurs aux nœuds. */
  private readonly lastGraph = new Map<string, GraphModel>();

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
        const { graph, errors } = await this.parser.parse(document.getText());
        const saved = await posStore.load();
        const merged = mergePositions(graph, saved);
        this.lastGraph.set(document.uri.toString(), merged);
        bus.send({ type: 'INIT', graph: merged, theme: mapVSCodeTheme(vscode.window.activeColorTheme.kind), config });
        // Seed the webview config panel (token presence only, never the value).
        bus.send({ type: 'CONFIG', config: this.publicConfig(config) });
        // Expose the Jenkinsfile's build parameters so the UI can offer a Run form.
        const jobParams = (merged.meta.parameters ?? []).map(p => ({
          name: String(p['name'] ?? ''),
          type: String(p['type'] ?? 'string'),
          defaultValue: String(p['defaultValue'] ?? ''),
          description: String(p['description'] ?? ''),
          choices: Array.isArray(p['choices']) ? (p['choices'] as string[]) : undefined,
        })).filter(p => p.name);
        bus.send({ type: 'PARAMS', params: jobParams });
        // Never fail silently: surface parse errors/warnings to the webview.
        if (errors.length > 0) bus.send({ type: 'PARSE_ERRORS', errors });
        // Fetch the Jenkins step catalogue in the background (non-blocking) so the
        // palette can offer real steps. Silently skipped when Jenkins isn't set up.
        if (config.jenkinsUrl) {
          new JenkinsClient(config).getStepCatalog()
            .then(steps => { if (steps.length > 0) bus.send({ type: 'STEP_CATALOG', steps }); })
            .catch(err => logger.warn(`Step catalogue unavailable: ${err instanceof Error ? err.message : String(err)}`));
        }
      } catch (err) {
        logger.error('Failed to parse on READY', err);
        bus.send({ type: 'PARSE_ERRORS', errors: [{ severity: 'error', message: `Parse failed: ${err instanceof Error ? err.message : String(err)}` }] });
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
        // Attach each error to its node so the webview can show inline markers.
        const graph = this.lastGraph.get(document.uri.toString()) ?? null;
        const mapped = errors.map(e => ({ ...e, nodeId: e.nodeId ?? inferNodeId(e, graph) }));
        bus.send({ type: 'VALIDATION_RESULT', errors: mapped });
      } catch (err) {
        logger.error('Validation error', err);
        bus.send({ type: 'VALIDATION_RESULT', errors: [] });
      }
    });

    // 6. Handle RUN_BUILD — MUST always end with a terminal BUILD_STATUS, otherwise
    // the webview stays stuck on "running" (it sets that optimistically on click).
    const runDisposable = bus.on('RUN_BUILD', async (msg) => {
      // Re-read config live: the user may have just saved settings in the panel.
      const live = await this.getConfig();
      const jobName = msg.jobName || live.jenkinsJobName;
      // Branch: explicit request wins, else the configured default (multibranch).
      const branch = msg.branch || live.jenkinsBranch || undefined;
      // Missing settings → ask the webview to open the configuration panel.
      const missing = this.missingBuildKeys(live);
      if (missing.length > 0) {
        bus.send({ type: 'LOG_LINE', line: `Jenkins not configured — missing: ${missing.join(', ')}`, stream: 'stderr' });
        bus.send({ type: 'CONFIG_REQUIRED', missing });
        bus.send({ type: 'BUILD_STATUS', status: 'failure' });
        return;
      }
      try {
        const client = new JenkinsClient(live);
        const queueUrl = await client.triggerBuild(jobName, msg.params, branch);
        bus.send({ type: 'BUILD_STATUS', status: 'running' });
        const buildNumber = await client.getBuildNumber(queueUrl);
        for await (const line of client.streamLogs(jobName, buildNumber, branch)) {
          bus.send({ type: 'LOG_LINE', line, stream: 'stdout' });
        }
        bus.send({ type: 'BUILD_STATUS', status: 'success' });
      } catch (err) {
        bus.send({ type: 'LOG_LINE', line: err instanceof Error ? err.message : String(err), stream: 'stderr' });
        bus.send({ type: 'BUILD_STATUS', status: 'failure' });
      }
    });

    // 7. Handle ABORT_BUILD — always send a terminal status.
    const abortDisposable = bus.on('ABORT_BUILD', async (msg) => {
      const live = await this.getConfig();
      const jobName = msg.jobName || live.jenkinsJobName;
      const branch = live.jenkinsBranch || undefined;
      if (!live.jenkinsUrl || !jobName || msg.buildNumber === undefined) {
        bus.send({ type: 'LOG_LINE', line: 'Nothing to abort (no Jenkins URL, job, or build number).', stream: 'stderr' });
        bus.send({ type: 'BUILD_STATUS', status: 'aborted' });
        return;
      }
      try {
        const client = new JenkinsClient(live);
        await client.abortBuild(jobName, msg.buildNumber, branch);
        bus.send({ type: 'BUILD_STATUS', status: 'aborted' });
      } catch (err) {
        logger.error('Abort error', err);
        bus.send({ type: 'LOG_LINE', line: err instanceof Error ? err.message : String(err), stream: 'stderr' });
        bus.send({ type: 'BUILD_STATUS', status: 'failure' });
      }
    });

    // 8. Handle SET_CONFIG — persist a setting edited from the webview panel.
    const setConfigDisposable = bus.on('SET_CONFIG', async (msg) => {
      try {
        await this.setConfigValue(msg.key, msg.value);
        const updated = await this.getConfig();
        bus.send({ type: 'CONFIG', config: this.publicConfig(updated) });
        if (this.missingBuildKeys(updated).length === 0) {
          bus.send({ type: 'LOG_LINE', line: 'Jenkins configuration saved — you can run the build.', stream: 'stdout' });
        }
      } catch (err) {
        logger.error('Failed to save setting', err);
        bus.send({ type: 'LOG_LINE', line: `Failed to save setting: ${err instanceof Error ? err.message : String(err)}`, stream: 'stderr' });
      }
    });

    // 9. Handle TEST_CONNECTION — probe server / auth / job without triggering a build.
    const testConnDisposable = bus.on('TEST_CONNECTION', async (msg) => {
      const live = await this.getConfig();
      // Unsaved panel drafts win; otherwise fall back to the stored config.
      const url = (msg.url || live.jenkinsUrl).replace(/\/$/, '');
      const user = msg.user ?? live.jenkinsUser;
      const token = msg.token ?? live.jenkinsToken;
      const jobName = msg.jobName ?? live.jenkinsJobName;
      const branch = (msg.branch ?? live.jenkinsBranch) || undefined;
      if (!url) {
        bus.send({ type: 'CONNECTION_RESULT', steps: [{ ok: false, label: 'Server reachable', detail: 'No Jenkins URL provided' }] });
        return;
      }
      try {
        const client = new JenkinsClient({ ...live, jenkinsUrl: url, jenkinsUser: user, jenkinsToken: token });
        const steps = await client.testConnection(jobName, branch, { user, token });
        bus.send({ type: 'CONNECTION_RESULT', steps });
      } catch (err) {
        bus.send({ type: 'CONNECTION_RESULT', steps: [{ ok: false, label: 'Connection test', detail: err instanceof Error ? err.message : String(err) }] });
      }
    });

    // 10. Listen to document changes
    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (this.syncDepth > 0) return;
      try {
        const { graph, errors } = await this.parser.parse(e.document.getText());
        const saved = await posStore.load();
        const merged = mergePositions(graph, saved);
        this.lastGraph.set(document.uri.toString(), merged);
        bus.send({ type: 'DOC_CHANGED', graph: merged });
        bus.send({ type: 'PARSE_ERRORS', errors });
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
      this.lastGraph.delete(document.uri.toString());
      bus.dispose();
      readyDisposable.dispose();
      graphChangedDisposable.dispose();
      validateDisposable.dispose();
      runDisposable.dispose();
      abortDisposable.dispose();
      setConfigDisposable.dispose();
      testConnDisposable.dispose();
      docChangeDisposable.dispose();
      themeDisposable.dispose();
    });
  }

  // ─── Configuration Jenkins ────────────────────────────────────────────

  /** Réglages requis pour déclencher un build, dans l'ordre d'affichage. */
  private missingBuildKeys(config: ExtensionConfig): ConfigKey[] {
    const missing: ConfigKey[] = [];
    if (!config.jenkinsUrl) missing.push('jenkinsUrl');
    if (!config.jenkinsUser) missing.push('jenkinsUser');
    if (!config.jenkinsJobName) missing.push('jenkinsJobName');
    if (!config.jenkinsToken) missing.push('jenkinsToken');
    return missing;
  }

  /** Vue de la config sûre à transmettre à la webview (jamais le token). */
  private publicConfig(config: ExtensionConfig): PublicConfig {
    return {
      jenkinsUrl: config.jenkinsUrl,
      jenkinsUser: config.jenkinsUser,
      jenkinsJobName: config.jenkinsJobName,
      jenkinsBranch: config.jenkinsBranch,
      hasToken: !!config.jenkinsToken,
    };
  }

  /** Enregistre un réglage (token → SecretStorage, le reste → settings global). */
  async setConfigValue(key: ConfigKey, value: string): Promise<void> {
    if (key === 'jenkinsToken') {
      await this.storeToken(value);
      return;
    }
    const cfg = vscode.workspace.getConfiguration('jenkinsNodeEditor');
    await cfg.update(key, value, vscode.ConfigurationTarget.Global);
  }

  // ─── API pour les commandes de la palette ─────────────────────────────

  /** Envoie une requête à la webview active (utilisé par les commandes de la palette). */
  sendToActive(message: WebviewMessage): boolean {
    const active = [...this.activePanels.values()].at(-1);
    if (!active) return false;
    active.bus.send(message as never);
    return true;
  }

  /** Vrai si au moins un éditeur nodal est ouvert. */
  get hasActiveEditor(): boolean {
    return this.activePanels.size > 0;
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
    // The graph is a lossy view of the Jenkinsfile, so we must NOT regenerate the
    // whole file (that destroyed ~90% of a real 780-line file). Instead: regenerate,
    // diff against the current text, and replace only the smallest changed region.
    // Everything outside that region is preserved byte-for-byte. A safety guard
    // refuses edits that would delete most of the file (lossy regeneration).
    const current = document.getText();
    let regenerated = this.generator.generate(graph);
    if (!regenerated.trim()) return;

    // Match the document's line endings (generator always emits LF). Without this
    // a CRLF Jenkinsfile diffs as "every line changed" → full-file rewrite.
    regenerated = normalizeEol(regenerated, usesCrlf(current));

    const edit = computeMinimalEdit(current, regenerated);
    if (!edit) return; // nothing changed — no write, no document touch

    const safety = isEditSafe(edit, current.length);
    if (!safety.safe) {
      logger.warn(`Graph sync skipped — ${safety.reason}`);
      vscode.window.showWarningMessage(
        `Jenkins Node Editor: ${safety.reason}`
      );
      return;
    }

    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.replace(
      document.uri,
      new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)),
      edit.newText,
    );
    this.syncDepth++;
    try {
      await vscode.workspace.applyEdit(wsEdit);
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
      jenkinsJobName: config.get<string>('jenkinsJobName', ''),
      jenkinsBranch: config.get<string>('jenkinsBranch', ''),
      autoLayout: config.get<boolean>('autoLayout', true),
      syncDelay: config.get<number>('syncDelay', 300),
    };
  }
}
