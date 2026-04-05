# PHASE 3 — Parser bidirectionnel Jenkinsfile ↔ Graphe

## Objectif
Implémenter la conversion dans les deux sens :
- **Jenkinsfile → GraphModel** : parser le DSL Groovy et produire le modèle de graphe
- **GraphModel → Jenkinsfile** : régénérer un Jenkinsfile propre et formaté depuis le graphe

## Critères d'acceptation
- [ ] `parse(simpleJenkinsfile)` → GraphModel correct avec tous les stages
- [ ] `parse(parallelJenkinsfile)` → GraphModel avec nœuds parallèles
- [ ] `generate(graphModel)` → Jenkinsfile valide syntaxiquement
- [ ] Round-trip : `generate(parse(input))` produit un fichier sémantiquement équivalent
- [ ] Les erreurs de syntaxe Groovy sont capturées et retournées proprement (pas de crash)
- [ ] Tests unitaires : tous les fixtures du dossier `test/fixtures/` passent

---

## 3.1 — Stratégie de parsing

### Approche recommandée : Parsing hybride

Le DSL Jenkins est un sous-ensemble de Groovy. Deux options :

**Option A — tree-sitter (recommandée)**
- `tree-sitter` avec la grammaire `tree-sitter-groovy` en WASM
- Avantages : parsing incrémental, récupération d'erreurs, positions dans le fichier
- Inconvénients : nécessite le chargement du WASM

**Option B — Parser regex/récursif maison (fallback)**
- Pour le DSL déclaratif Jenkins, les patterns sont très réguliers
- Suffisant pour couvrir 90% des cas
- Plus facile à débugger

**Implémente les deux et expose une interface commune.** Utilise tree-sitter si disponible, fallback sur le parser maison.

```typescript
// src/parser/JenkinsfileParser.ts

interface ParserResult {
  graph: GraphModel;
  errors: ParseError[];
  mode: 'declarative' | 'scripted';
}

interface ParseError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

export class JenkinsfileParser {
  async parse(source: string): Promise<ParserResult> {
    // 1. Détecter si c'est du déclaratif ou du scripted
    // 2. Tenter tree-sitter
    // 3. Fallback sur parser maison si tree-sitter échoue
    // 4. Retourner GraphModel + erreurs
  }
}
```

## 3.2 — Détection du mode (déclaratif vs scripted)

```typescript
function detectMode(source: string): 'declarative' | 'scripted' {
  const trimmed = source.trim();
  // Le mode déclaratif commence toujours par 'pipeline {'
  if (/^pipeline\s*\{/.test(trimmed)) return 'declarative';
  // Le mode scripted commence par 'node' ou contient des structures Groovy
  return 'scripted';
}
```

## 3.3 — Parser déclaratif (regex récursif)

C'est le parser à implémenter en priorité. Il couvre ~90% des Jenkinsfiles réels.

### Structure d'un Jenkinsfile déclaratif

```groovy
pipeline {
  agent { ... }           // → AgentNode
  environment { ... }    // → EnvironmentNode
  options { ... }        // → OptionsNode
  parameters { ... }     // → ParametersNode
  triggers { ... }       // → TriggersNode
  stages {
    stage('Build') {     // → StageNode
      agent { ... }
      when { ... }
      steps {
        sh '...'         // → StepNode(type='sh')
        echo '...'       // → StepNode(type='echo')
        parallel {       // → ParallelNode
          stage('A') { steps { ... } }
          stage('B') { steps { ... } }
        }
      }
    }
  }
  post {                 // → PostNode
    always { ... }
    failure { ... }
    success { ... }
  }
}
```

### Algorithme de parsing par tokenisation de blocs

```typescript
// Tokenise les blocs { } de manière récursive
function tokenizeBlocks(source: string): Block[] {
  // Chaque Block = { keyword, args, children: Block[], startLine, endLine }
  // Parcourir caractère par caractère, tracker la profondeur des accolades
  // À chaque '{' ouvert, créer un nouveau Block
  // À chaque '}' fermé, finaliser le Block courant
}

// Extraire les steps depuis un bloc "steps { ... }"
function parseSteps(stepsBlock: Block): JenkinsNode[] {
  // Patterns à reconnaître :
  // sh 'cmd'  ou  sh(script: 'cmd', returnStdout: true)
  // echo 'msg'
  // git url: '...', branch: '...'
  // checkout scm
  // archiveArtifacts artifacts: '...'
  // junit '...'
  // withCredentials([...]) { ... }
  // timeout(time: 5, unit: 'MINUTES') { ... }
  // retry(3) { ... }
  // withEnv(['VAR=val']) { ... }
}
```

### Extraction des propriétés par type

```typescript
// Parsers spécialisés pour chaque type de bloc

function parseAgent(source: string): AgentData {
  // Patterns :
  // agent any  → { type: 'any' }
  // agent none → { type: 'none' }
  // agent { label 'linux' } → { type: 'label', label: 'linux' }
  // agent { docker { image 'node:18' } } → { type: 'docker', image: 'node:18' }
  // agent { dockerfile { filename 'Dockerfile' } } → { type: 'dockerfile', filename: 'Dockerfile' }
}

function parseWhen(source: string): WhenData {
  // branch 'main'
  // environment name: 'DEPLOY', value: 'true'
  // expression { return params.RUN_TESTS }
  // anyOf { branch 'main'; branch 'develop' }
  // allOf { ... }
  // not { branch 'main' }
}

function parseStep(line: string): StepData | null {
  // Regex patterns pour les steps courants
  const patterns = [
    { re: /^sh\s+['"](.+?)['"]\s*$/, type: 'sh', fields: ['script'] },
    { re: /^sh\s*\(\s*script:\s*['"](.+?)['"]\s*\)/, type: 'sh', fields: ['script'] },
    { re: /^echo\s+['"](.+?)['"]/, type: 'echo', fields: ['message'] },
    { re: /^git\s+url:\s*['"](.+?)['"](?:,\s*branch:\s*['"](.+?)['"])?/, type: 'git', fields: ['url', 'branch'] },
    { re: /^archiveArtifacts\s+artifacts:\s*['"](.+?)['"]/, type: 'archiveArtifacts', fields: ['artifacts'] },
    { re: /^junit\s+['"](.+?)['"]/, type: 'junit', fields: ['pattern'] },
    { re: /^timeout\s*\(\s*time:\s*(\d+)(?:,\s*unit:\s*['"](\w+)['"])?/, type: 'timeout', fields: ['time', 'unit'] },
    { re: /^retry\s*\(\s*(\d+)\s*\)/, type: 'retry', fields: ['count'] },
  ];
}
```

## 3.4 — Assignation des positions (layout initial)

Après parsing, les nœuds n'ont pas de position. Appliquer le layout dagre automatiquement :

```typescript
function assignInitialPositions(nodes: JenkinsNode[], edges: JenkinsEdge[]): JenkinsNode[] {
  // Utiliser applyDagreLayout() de utils/layout.ts
  // Convertir JenkinsNode → ReactFlow Node pour dagre, puis reconvertir
}
```

## 3.5 — `src/parser/JenkinsfileGenerator.ts`

Génération de Jenkinsfile depuis le GraphModel. Doit produire un code proprement indenté.

```typescript
export class JenkinsfileGenerator {
  private indent = 0;
  private lines: string[] = [];

  generate(model: GraphModel): string {
    this.lines = [];
    this.indent = 0;

    if (model.meta.declarative) {
      this.generateDeclarative(model);
    } else {
      this.generateScripted(model);
    }

    return this.lines.join('\n');
  }

  private write(line: string): void {
    this.lines.push('  '.repeat(this.indent) + line);
  }

  private block(header: string, fn: () => void): void {
    this.write(header + ' {');
    this.indent++;
    fn();
    this.indent--;
    this.write('}');
  }

  private generateDeclarative(model: GraphModel): void {
    this.block('pipeline', () => {
      // 1. Trouver le nœud agent racine et le générer
      const agent = model.nodes.find(n => n.kind === 'agent' && isRootAgent(n));
      if (agent) this.generateAgent(agent);

      // 2. Générer environment, options, parameters, triggers (si présents)
      // 3. Générer stages { ... } avec tous les StageNode dans l'ordre topologique
      // 4. Générer post { ... } si présent

      this.block('stages', () => {
        const stageNodes = getTopologicalOrder(model.nodes, model.edges)
          .filter(n => n.kind === 'stage');
        stageNodes.forEach(stage => this.generateStage(stage, model));
      });
    });
  }

  private generateStage(node: JenkinsNode, model: GraphModel): void {
    const data = node.data as StageData;
    this.block(`stage('${escapeGroovyString(data.name)}')`, () => {
      if (data.agent) this.generateAgent(data.agent as any);
      if (data.when) this.generateWhen(data.when as any);

      // Récupérer les steps enfants (edges sortants vers des StepNode)
      const childSteps = getChildNodes(node.id, model).filter(n => n.kind === 'step');
      const parallelChildren = getChildNodes(node.id, model).filter(n => n.kind === 'parallel');

      if (parallelChildren.length > 0) {
        this.block('steps', () => {
          this.block('parallel', () => {
            parallelChildren.forEach(p => this.generateParallel(p, model));
          });
        });
      } else if (childSteps.length > 0) {
        this.block('steps', () => {
          childSteps.forEach(step => this.generateStep(step));
        });
      }
    });
  }

  private generateStep(node: JenkinsNode): void {
    const data = node.data as StepData;
    switch (data.type) {
      case 'sh':
        if (data.script?.includes('\n')) {
          this.write(`sh '''\n${data.script}\n'''`);
        } else {
          this.write(`sh '${escapeGroovyString(String(data.script))}'`);
        }
        break;
      case 'echo':
        this.write(`echo '${escapeGroovyString(String(data.message))}'`);
        break;
      case 'git':
        this.write(`git url: '${data.url}', branch: '${data.branch || 'main'}'`);
        break;
      // ... autres types
    }
  }
}

// Fonctions utilitaires
function escapeGroovyString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getTopologicalOrder(nodes: JenkinsNode[], edges: JenkinsEdge[]): JenkinsNode[] {
  // Tri topologique via Kahn's algorithm
}
```

## 3.6 — `src/parser/ASTTypes.ts`

Tous les types du modèle interne. Ce fichier EST importé par la webview (types partagés).

```typescript
export type NodeKind =
  | 'pipeline' | 'agent' | 'stage' | 'step'
  | 'parallel' | 'post' | 'environment' | 'options'
  | 'parameters' | 'triggers' | 'when';

export type AgentData = {
  type: 'any' | 'none' | 'label' | 'docker' | 'dockerfile';
  label?: string;
  image?: string;
  filename?: string;
  args?: string;
};

export type StageData = {
  name: string;
  when?: WhenData;
  agent?: AgentData;
  failFast?: boolean;
};

export type StepData = {
  type: string;  // 'sh' | 'echo' | 'git' | 'archiveArtifacts' | etc.
  [key: string]: unknown;  // Propriétés spécifiques au type
};

export type ParallelData = {
  branches: string[];  // Noms des branches parallèles
  failFast?: boolean;
};

export type PostData = {
  condition: 'always' | 'success' | 'failure' | 'unstable' | 'changed' | 'aborted';
};

export type WhenData = {
  type: 'branch' | 'environment' | 'expression' | 'anyOf' | 'allOf' | 'not';
  value?: string;
  conditions?: WhenData[];
};

export type JenkinsNode = {
  id: string;
  kind: NodeKind;
  label: string;
  data: AgentData | StageData | StepData | ParallelData | PostData | WhenData | Record<string, unknown>;
  position: { x: number; y: number };
};

export type JenkinsEdge = {
  id: string;
  source: string;
  target: string;
  type: 'sequence' | 'parallel' | 'condition' | 'contains';
};

export type GraphModel = {
  nodes: JenkinsNode[];
  edges: JenkinsEdge[];
  meta: {
    jenkinsVersion?: string;
    agentLabel?: string;
    declarative: boolean;
    options?: Record<string, unknown>;
    parameters?: ParameterDef[];
    triggers?: TriggerDef[];
  };
};

export type ParameterDef = {
  type: 'string' | 'boolean' | 'choice' | 'text' | 'password';
  name: string;
  defaultValue?: string;
  description?: string;
  choices?: string[];
};

export type TriggerDef = {
  type: 'cron' | 'pollSCM' | 'upstream';
  schedule?: string;
  projects?: string[];
};
```

## 3.7 — Fixtures de test

### `test/fixtures/simple.Jenkinsfile`
```groovy
pipeline {
  agent any
  stages {
    stage('Build') {
      steps {
        sh 'mvn clean package'
        archiveArtifacts artifacts: '**/target/*.jar'
      }
    }
    stage('Test') {
      steps {
        sh 'mvn test'
        junit '**/target/surefire-reports/*.xml'
      }
    }
    stage('Deploy') {
      steps {
        sh './deploy.sh'
        echo 'Deployment complete'
      }
    }
  }
  post {
    failure {
      echo 'Build failed!'
    }
    always {
      cleanWs()
    }
  }
}
```

### `test/fixtures/parallel.Jenkinsfile`
```groovy
pipeline {
  agent any
  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }
    stage('Tests') {
      parallel {
        stage('Unit Tests') {
          agent { label 'linux' }
          steps {
            sh 'npm test'
            junit 'test-results/**/*.xml'
          }
        }
        stage('Integration Tests') {
          agent { docker { image 'node:18-alpine' } }
          steps {
            sh 'npm run test:integration'
          }
        }
        stage('Lint') {
          steps {
            sh 'npm run lint'
          }
        }
      }
    }
    stage('Build') {
      steps {
        sh 'npm run build'
        archiveArtifacts artifacts: 'dist/**'
      }
    }
  }
}
```

### `test/fixtures/complex.Jenkinsfile`
```groovy
pipeline {
  agent none
  options {
    timeout(time: 1, unit: 'HOURS')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }
  parameters {
    string(name: 'TARGET_ENV', defaultValue: 'staging', description: 'Deploy target')
    booleanParam(name: 'RUN_INTEGRATION', defaultValue: true, description: 'Run integration tests')
  }
  triggers {
    cron('H */4 * * 1-5')
  }
  environment {
    DOCKER_REGISTRY = 'registry.example.com'
    APP_NAME = 'my-app'
  }
  stages {
    stage('Build') {
      agent { label 'docker' }
      steps {
        sh 'docker build -t ${DOCKER_REGISTRY}/${APP_NAME}:${BUILD_NUMBER} .'
      }
    }
    stage('Push') {
      agent { label 'docker' }
      when {
        anyOf {
          branch 'main'
          branch 'develop'
        }
      }
      steps {
        withCredentials([usernamePassword(credentialsId: 'docker-registry', usernameVariable: 'USER', passwordVariable: 'PASS')]) {
          sh 'docker login -u $USER -p $PASS ${DOCKER_REGISTRY}'
          sh 'docker push ${DOCKER_REGISTRY}/${APP_NAME}:${BUILD_NUMBER}'
        }
      }
    }
    stage('Deploy') {
      agent { label 'deploy' }
      when {
        environment name: 'TARGET_ENV', value: 'production'
      }
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          sh './deploy.sh ${TARGET_ENV} ${BUILD_NUMBER}'
        }
      }
    }
  }
  post {
    success {
      slackSend channel: '#builds', message: "Build ${BUILD_NUMBER} succeeded"
    }
    failure {
      mail to: 'team@example.com', subject: "Build failed: ${BUILD_NUMBER}"
    }
    always {
      cleanWs()
    }
  }
}
```

## 3.8 — Tests unitaires

`test/suite/parser.test.ts` :
```typescript
import { describe, it, expect } from 'vitest';
import { JenkinsfileParser } from '../../src/parser/JenkinsfileParser';
import { JenkinsfileGenerator } from '../../src/parser/JenkinsfileGenerator';
import * as fs from 'fs';
import * as path from 'path';

const parser = new JenkinsfileParser();
const generator = new JenkinsfileGenerator();

describe('JenkinsfileParser', () => {
  it('parse simple.Jenkinsfile correctly', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../fixtures/simple.Jenkinsfile'), 'utf8');
    const result = await parser.parse(source);
    expect(result.errors).toHaveLength(0);
    expect(result.mode).toBe('declarative');
    expect(result.graph.nodes.filter(n => n.kind === 'stage')).toHaveLength(3);
    // Build stage has 2 steps
    // Test stage has 2 steps
    // Deploy stage has 2 steps
  });

  it('parse parallel.Jenkinsfile correctly', async () => { /* ... */ });
  it('parse complex.Jenkinsfile correctly', async () => { /* ... */ });
  it('handles syntax errors gracefully', async () => { /* ... */ });
});

describe('JenkinsfileGenerator', () => {
  it('generates valid Jenkinsfile from simple graph', () => { /* ... */ });
  it('round-trip is semantically equivalent', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../fixtures/simple.Jenkinsfile'), 'utf8');
    const { graph } = await parser.parse(source);
    const generated = generator.generate(graph);
    const reparsed = await parser.parse(generated);
    // Compare structures sémantiquement (pas textuellement)
    expect(reparsed.graph.nodes.length).toBe(graph.nodes.length);
  });
});
```
