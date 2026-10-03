// test/suite/extension.e2e.js
// E2E dans un vrai VS Code : activation de l'extension, enregistrement du
// custom editor et des commandes. Exécuté par mocha (voir index.js).
const assert = require('assert');
const vscode = require('vscode');

const EXTENSION_ID = 'PlanesZwalker.vscode-jenkins-node-editor';

suite('Extension E2E', () => {
  test('extension is present', () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} not found`);
  });

  test('extension activates', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });

  test('registers the custom editor and commands', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    await ext.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'jenkinsNodeEditor.openEditor',
      'jenkinsNodeEditor.validate',
      'jenkinsNodeEditor.runBuild',
      'jenkinsNodeEditor.setToken',
    ]) {
      assert.ok(commands.includes(id), `command ${id} not registered`);
    }
  });

  test('contributes the Jenkinsfile custom editor', () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    const editors = ext.packageJSON?.contributes?.customEditors ?? [];
    assert.ok(
      editors.some(e => e.viewType === 'jenkinsNodeEditor.editor'),
      'customEditors missing jenkinsNodeEditor.editor'
    );
  });
});
