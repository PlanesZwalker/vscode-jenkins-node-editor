// src/extension/MessageBus.ts
// Bridge typé entre l'extension host et la webview
// Voir docs/PHASE4.md §4.1 pour l'implémentation complète

import * as vscode from 'vscode';
import type { ExtensionMessage, WebviewMessage } from '../shared/messages';

export class MessageBus {
  private readonly panel: vscode.WebviewPanel;
  private readonly handlers = new Map<string, Array<(msg: WebviewMessage) => void>>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;

    // Écouter tous les messages entrants de la webview
    const sub = panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      this.dispatch(msg);
    });
    this.disposables.push(sub);
  }

  /** Envoyer un message à la webview */
  send(message: ExtensionMessage): void {
    // TODO: poster le message via this.panel.webview.postMessage(message)
    // Gérer l'erreur si le panel est déjà disposé (panel.webview peut throw)
    this.panel.webview.postMessage(message);
  }

  /** S'abonner à un type de message de la webview */
  on<T extends WebviewMessage['type']>(
    type: T,
    handler: (msg: Extract<WebviewMessage, { type: T }>) => void
  ): vscode.Disposable {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as (msg: WebviewMessage) => void);
    this.handlers.set(type, list);

    return new vscode.Disposable(() => {
      const updated = (this.handlers.get(type) ?? []).filter(h => h !== handler);
      this.handlers.set(type, updated);
    });
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.handlers.clear();
  }

  private dispatch(msg: WebviewMessage): void {
    const handlers = this.handlers.get(msg.type) ?? [];
    handlers.forEach(h => {
      try {
        h(msg);
      } catch (err) {
        console.error(`[MessageBus] Handler error for ${msg.type}:`, err);
      }
    });
  }
}
