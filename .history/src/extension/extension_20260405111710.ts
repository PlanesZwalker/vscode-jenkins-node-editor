// src/extension/extension.ts
// Point d'entrée de l'extension VSCode
// Voir docs/PHASE1.md section 1.6 pour les instructions complètes

import * as vscode from 'vscode';
import { JenkinsNodeEditor } from './JenkinsNodeEditor';
import { logger } from './logger';

export function activate(context: vscode.ExtensionContext): void {
  logger.info('Jenkins Node Editor activating...');

  const editor = new JenkinsNodeEditor(context);

  // Enregistrer le CustomTextEditorProvider
  // Voir docs/PHASE1.md §1.7 pour l'implémentation complète de JenkinsNodeEditor
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'jenkinsNodeEditor.editor',
      editor,
      {
        webviewOptions: {
          // CRITIQUE : conserver le contexte React quand l'onglet est masqué
          retainContextWhenHidden: true,
          enableFindWidget: false,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // Commande : ouvrir le node editor sur le fichier actif
  context.subscriptions.push(
    vscode.commands.registerCommand('jenkinsNodeEditor.openEditor', (uri?: vscode.Uri) => {
      // uri is provided when invoked from explorer/editor context menu
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        vscode.window.showInformationMessage('No active file to open in Jenkins Node Editor');
        return;
      }
      vscode.commands.executeCommand(
        'vscode.openWith',
        targetUri,
        'jenkinsNodeEditor.editor'
      );
    })
  );

  // Commande : valider le Jenkinsfile
  context.subscriptions.push(
    vscode.commands.registerCommand('jenkinsNodeEditor.validate', () => {
      // La validation est déclenchée via le MessageBus depuis la webview active
      // Cette commande est un raccourci clavier / palette
      vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      // TODO Phase 5 : envoyer VALIDATE_REQUEST au panel actif
    })
  );

  // Commande : lancer un build Jenkins
  context.subscriptions.push(
    vscode.commands.registerCommand('jenkinsNodeEditor.runBuild', () => {
      // TODO Phase 5 : envoyer RUN_BUILD au panel actif
    })
  );

  logger.info('Jenkins Node Editor activated successfully');
}

export function deactivate(): void {
  logger.info('Jenkins Node Editor deactivated');
}
