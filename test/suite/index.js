// test/suite/index.js
// Point d'entrée du harnais E2E (@vscode/test-electron).
// Lancé par test/runTests.js dans un VS Code réel ; mocha exécute les *.e2e.js.
const path = require('path');
const Mocha = require('mocha');
const { glob } = require('glob');

async function run() {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 });
  const testsRoot = path.resolve(__dirname, '.');

  // `.e2e.js` uniquement — les *.test.ts sont pour Vitest (node pur, sans VS Code).
  const files = await glob('**/*.e2e.js', { cwd: testsRoot });
  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    try {
      mocha.run(failures => {
        if (failures > 0) reject(new Error(`${failures} test(s) failed.`));
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { run };
