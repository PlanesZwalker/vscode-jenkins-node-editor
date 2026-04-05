# PHASE 5 — Fonctionnalités Jenkins avancées

## Objectif
Connecter l'extension à une instance Jenkins réelle : validation du Jenkinsfile via l'API REST,
catalogue de steps pour l'autocomplétion, déclenchement de builds avec streaming de logs.

## Critères d'acceptation
- [ ] Avec `jenkinsUrl` configuré : bouton "Validate" appelle l'API Jenkins et affiche les erreurs
- [ ] Les erreurs de validation sont affichées sur les nœuds concernés (badge rouge)
- [ ] La palette de nœuds se peuple depuis le catalogue Jenkins (`/pipeline-model-converter/steps`)
- [ ] Bouton "Run" → déclenche un build Jenkins → logs streamés dans le LogPanel
- [ ] Bouton "Abort" → annule le build en cours
- [ ] Status du build (running/success/failure) visible dans la toolbar
- [ ] Si aucune instance Jenkins configurée → fonctionnalités avancées désactivées avec message clair

---

## 5.1 — `src/extension/JenkinsClient.ts`

Client HTTP Jenkins. Utilise l'API REST Jenkins.

```typescript
import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';

export type JenkinsBuild = {
  number: number;
  url: string;
  result: string | null;
  building: boolean;
};

export class JenkinsClient {
  private baseUrl: string;
  private auth: string;

  constructor(config: ExtensionConfig) {
    this.baseUrl = config.jenkinsUrl.replace(/\/$/, '');
    this.auth = Buffer.from(`${config.jenkinsUser}:${config.jenkinsToken}`).toString('base64');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Jenkins API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async validatePipeline(jenkinsfileContent: string): Promise<ValidationResult> {
    // POST /pipeline-model-converter/validatejenkinsfile
    const form = new URLSearchParams({ jenkinsfile: jenkinsfileContent });
    const response = await fetch(`${this.baseUrl}/pipeline-model-converter/validatejenkinfile`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const text = await response.text();
    return this.parseValidationResponse(text);
  }

  async getStepCatalog(): Promise<StepDefinition[]> {
    // GET /pipeline-model-converter/steps
    const data = await this.request<{ steps: any[] }>('/pipeline-model-converter/steps');
    return data.steps.map(this.mapStepDefinition);
  }

  async triggerBuild(jobName: string, params?: Record<string, string>): Promise<string> {
    // POST /job/{jobName}/build ou /job/{jobName}/buildWithParameters
    const endpoint = params
      ? `/job/${encodeURIComponent(jobName)}/buildWithParameters`
      : `/job/${encodeURIComponent(jobName)}/build`;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${this.auth}`,
        ...params && { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
      body: params ? new URLSearchParams(params).toString() : undefined,
    });

    // Jenkins retourne l'URL du build dans le header 'Location'
    const queueUrl = response.headers.get('Location');
    if (!queueUrl) throw new Error('No queue URL returned');
    return queueUrl;
  }

  async getBuildNumber(queueUrl: string): Promise<number> {
    // Attendre que le build sorte de la queue et obtenir son numéro
    // Polling de /queue/item/{id}/api/json jusqu'à ce que executable.number soit disponible
    const queueId = queueUrl.match(/queue\/item\/(\d+)/)?.[1];
    if (!queueId) throw new Error('Invalid queue URL');

    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const item = await this.request<{ executable?: { number: number } }>(
        `/queue/item/${queueId}/api/json`
      );
      if (item.executable?.number) return item.executable.number;
    }
    throw new Error('Build did not start within 60 seconds');
  }

  async *streamLogs(jobName: string, buildNumber: number): AsyncGenerator<string> {
    // Streaming des logs via /job/{jobName}/{buildNumber}/logText/progressiveText
    let start = 0;
    let moreData = true;

    while (moreData) {
      const response = await fetch(
        `${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/logText/progressiveText?start=${start}`,
        { headers: { 'Authorization': `Basic ${this.auth}` } }
      );

      const text = await response.text();
      if (text) yield text;

      const nextStart = response.headers.get('X-Text-Size');
      const more = response.headers.get('X-More-Data');
      start = nextStart ? parseInt(nextStart) : start;
      moreData = more === 'true';

      if (moreData) await sleep(1000);
    }
  }

  async abortBuild(jobName: string, buildNumber: number): Promise<void> {
    await fetch(
      `${this.baseUrl}/job/${encodeURIComponent(jobName)}/${buildNumber}/stop`,
      { method: 'POST', headers: { 'Authorization': `Basic ${this.auth}` } }
    );
  }

  private parseValidationResponse(text: string): ValidationResult {
    // Jenkins retourne "Jenkinsfile successfully validated." ou des erreurs
    if (text.includes('successfully validated')) {
      return { valid: true, errors: [] };
    }
    // Parser les erreurs du format Jenkins
    const errors: ValidationError[] = [];
    const lines = text.split('\n');
    lines.forEach(line => {
      const match = line.match(/WorkflowScript:\s*(\d+):\s*(.+)/);
      if (match) {
        errors.push({
          line: parseInt(match[1]),
          severity: 'error',
          message: match[2].trim(),
        });
      }
    });
    return { valid: false, errors };
  }

  private mapStepDefinition(raw: any): StepDefinition {
    return {
      name: raw.name,
      displayName: raw.displayName ?? raw.name,
      description: raw.description ?? '',
      parameters: (raw.parameters ?? []).map((p: any) => ({
        name: p.name,
        type: p.type,
        required: p.required ?? false,
        description: p.description ?? '',
      })),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type ValidationResult = { valid: boolean; errors: ValidationError[] };
type ValidationError = { line?: number; message: string; severity: 'error' | 'warning' };

type StepDefinition = {
  name: string;
  displayName: string;
  description: string;
  parameters: { name: string; type: string; required: boolean; description: string }[];
};
```

## 5.2 — `src/extension/JenkinsValidator.ts`

```typescript
import { JenkinsClient } from './JenkinsClient';
import type { ValidationError } from '../shared/types';

export class JenkinsValidator {
  private client: JenkinsClient | null = null;

  constructor(config: ExtensionConfig) {
    if (config.jenkinsUrl && config.jenkinsUser && config.jenkinsToken) {
      this.client = new JenkinsClient(config);
    }
  }

  async validate(content: string): Promise<ValidationError[]> {
    if (!this.client) {
      // Validation locale uniquement : vérifier la syntaxe de base
      return this.validateLocally(content);
    }

    try {
      const result = await this.client.validatePipeline(content);
      return result.errors;
    } catch (err) {
      return [{
        severity: 'warning',
        message: `Jenkins validation failed: ${err instanceof Error ? err.message : String(err)}`,
      }];
    }
  }

  private validateLocally(content: string): ValidationError[] {
    const errors: ValidationError[] = [];
    // Vérifications de base :
    if (!content.trim().startsWith('pipeline')) {
      errors.push({ severity: 'warning', message: 'File does not start with "pipeline {" — may not be declarative syntax' });
    }
    // Vérifier les accolades équilibrées
    let depth = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') depth--;
      if (depth < 0) {
        errors.push({ severity: 'error', message: `Unexpected closing brace at position ${i}` });
        break;
      }
    }
    if (depth !== 0) {
      errors.push({ severity: 'error', message: `Unbalanced braces: ${depth} unclosed opening brace(s)` });
    }
    return errors;
  }
}
```

## 5.3 — `src/webview/hooks/useJenkinsAPI.ts`

```typescript
import { useCallback } from 'react';
import { useGraphStore } from '../store/graphStore';
import { postToExtension } from './useVSCodeBridge';

export function useJenkinsAPI() {
  const setBuildStatus = useGraphStore(s => s.setBuildStatus);
  const clearLogs = useGraphStore(s => s.clearLogs);

  const validate = useCallback(() => {
    postToExtension({ type: 'VALIDATE_REQUEST' });
  }, []);

  const runBuild = useCallback((branch?: string) => {
    clearLogs();
    setBuildStatus('running');
    postToExtension({ type: 'RUN_BUILD', branch });
  }, [clearLogs, setBuildStatus]);

  const abortBuild = useCallback(() => {
    postToExtension({ type: 'ABORT_BUILD' });
  }, []);

  return { validate, runBuild, abortBuild };
}
```

## 5.4 — `src/webview/components/LogPanel.tsx`

Panel de logs en bas de l'écran.

```tsx
import React, { useEffect, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';

export default function LogPanel() {
  const logs = useGraphStore(s => s.logs);
  const buildStatus = useGraphStore(s => s.buildStatus);
  const clearLogs = useGraphStore(s => s.clearLogs);
  const toggleLogs = useGraphStore(s => s.toggleLogs);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll vers le bas à chaque nouvelle ligne
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const statusColor = {
    idle: 'var(--je-fg)',
    running: '#EF9F27',
    success: '#639922',
    failure: '#E24B4A',
    aborted: '#888780',
  }[buildStatus];

  return (
    <div className="log-panel" style={{ height: '200px', borderTop: '1px solid var(--vscode-panel-border)' }}>
      <div className="log-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px' }}>
        <span style={{ color: statusColor, fontWeight: 500 }}>
          Build {buildStatus}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={clearLogs}>Clear</button>
          <button onClick={toggleLogs}>✕</button>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: '12px', overflow: 'auto', height: 'calc(100% - 32px)', padding: '8px', background: 'var(--vscode-terminal-background)' }}>
        {logs.map((line, i) => (
          <div key={i} style={{ whiteSpace: 'pre-wrap', color: line.startsWith('[ERROR]') ? '#E24B4A' : 'inherit' }}>
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

## 5.5 — `src/webview/components/Toolbar.tsx`

```tsx
import React from 'react';
import { useReactFlow } from '@xyflow/react';
import { useGraphStore } from '../store/graphStore';
import { useJenkinsAPI } from '../hooks/useJenkinsAPI';
import { applyDagreLayout } from '../utils/layout';

export default function Toolbar() {
  const { fitView } = useReactFlow();
  const { validate, runBuild, abortBuild } = useJenkinsAPI();
  const buildStatus = useGraphStore(s => s.buildStatus);
  const validationErrors = useGraphStore(s => s.validationErrors);
  const toggleLogs = useGraphStore(s => s.toggleLogs);
  const nodes = useGraphStore(s => s.nodes);
  const edges = useGraphStore(s => s.edges);

  const handleAutoLayout = () => {
    const laidOut = applyDagreLayout(nodes, edges);
    useGraphStore.getState().setNodes(laidOut);
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  };

  const errorCount = validationErrors.filter(e => e.severity === 'error').length;
  const warnCount = validationErrors.filter(e => e.severity === 'warning').length;

  return (
    <div className="toolbar" style={{ display: 'flex', gap: '8px', padding: '6px 12px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
      <button onClick={handleAutoLayout} title="Auto-layout (dagre)">⊞ Layout</button>
      <button onClick={() => fitView({ padding: 0.2 })} title="Fit view">⊡ Fit</button>
      <span style={{ flex: 1 }} />
      {errorCount > 0 && <span style={{ color: '#E24B4A' }}>✗ {errorCount} error{errorCount > 1 ? 's' : ''}</span>}
      {warnCount > 0 && <span style={{ color: '#EF9F27' }}>⚠ {warnCount} warning{warnCount > 1 ? 's' : ''}</span>}
      <button onClick={validate}>✓ Validate</button>
      {buildStatus === 'running'
        ? <button onClick={abortBuild} style={{ color: '#E24B4A' }}>■ Abort</button>
        : <button onClick={() => runBuild()}>▶ Run</button>
      }
      <button onClick={toggleLogs}>≡ Logs</button>
    </div>
  );
}
```

## 5.6 — Affichage des erreurs de validation sur les nœuds

Quand `VALIDATION_RESULT` arrive, les erreurs doivent être associées aux nœuds concernés.
La correspondance se fait par numéro de ligne.

Dans le store, après `setValidationErrors`, mapper les erreurs sur les nœuds :

```typescript
// Dans graphStore.ts, action setValidationErrors
setValidationErrors: (errors) => set(state => {
  state.validationErrors = errors;
  // Associer les erreurs aux nœuds par leur position dans le fichier
  // (si les nœuds ont une propriété `sourceLine` ajoutée par le parser)
  state.nodes = state.nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      validationErrors: errors.filter(e =>
        e.nodeId === node.id ||
        (e.line && node.data.sourceLine && Math.abs(e.line - (node.data.sourceLine as number)) < 5)
      ),
    },
  }));
}),
```

Dans chaque composant nœud, afficher un badge rouge si `data.validationErrors?.length > 0`.

## 5.7 — Récupération du catalogue de steps

Au démarrage, si Jenkins est configuré, charger le catalogue des steps et l'utiliser pour :
1. Enrichir la palette avec les steps disponibles sur cette instance Jenkins
2. Fournir l'autocomplétion dans le NodeInspector pour le champ "step type"
3. Afficher la documentation du step sélectionné

```typescript
// Dans JenkinsNodeEditor.ts, après READY :
bus.on('READY', async () => {
  // ... init habituel
  if (client) {
    try {
      const steps = await client.getStepCatalog();
      bus.send({ type: 'STEP_CATALOG', steps });
    } catch {
      // Non critique, on ignore l'erreur
    }
  }
});
```

Ajoute `{ type: 'STEP_CATALOG'; steps: StepDefinition[] }` au type `ExtensionMessage`.
