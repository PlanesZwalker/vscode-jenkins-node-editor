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

  // Commande : configurer le token Jenkins de façon sécurisée
  context.subscriptions.push(
    vscode.commands.registerCommand('jenkinsNodeEditor.setToken', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'Enter your Jenkins API token',
        password: true,
        placeHolder: 'token will be stored in VS Code SecretStorage, not in settings',
        ignoreFocusOut: true,
      });
      if (token !== undefined) {
        await editor.storeToken(token);
        vscode.window.showInformationMessage('Jenkins API token saved securely.');
      }
    })
  );

  // Commande : valider le Jenkinsfile
  context.subscriptions.push(
    vscode.commands.registerCommand('jenkinsNodeEditor.validate', () => {
      // Envoie la requête à la webview active ; sinon, éditeur non ouvert.
      if (!editor.sendToActive({ type: 'VALIDATE_REQUEST' })) {
        vscode.window.showInformationMessage('Jenkins Node Editor is not open — open a Jenkinsfile first.');
      }
    })
  );

  // Commande : lancer un build Jenkins
  context.subscriptions.push(
    vscode.commands.registerCommand('jenkinsNodeEditor.runBuild', () => {
      if (!editor.sendToActive({ type: 'RUN_BUILD' })) {
        vscode.window.showInformationMessage('Jenkins Node Editor is not open — open a Jenkinsfile first.');
      }
    })
  );

  logger.info('Jenkins Node Editor activated successfully');
}

export function deactivate(): void {
  logger.info('Jenkins Node Editor deactivated');
}
