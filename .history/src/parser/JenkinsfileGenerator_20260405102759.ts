// src/parser/JenkinsfileGenerator.ts
// GraphModel → Jenkinsfile texte
// Voir docs/PHASE3.md §3.5 pour l'implémentation complète

import type { GraphModel, JenkinsNode, JenkinsEdge, StepData, AgentData, PostData } from '../shared/types';

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

    return this.lines.join('\n') + '\n';
  }

  // ─── Écriture indentée ───────────────────────────────────────────────

  private write(line: string): void {
    this.lines.push('  '.repeat(this.indent) + line);
  }

  private writeln(): void {
    this.lines.push('');
  }

  private block(header: string, fn: () => void): void {
    this.write(`${header} {`);
    this.indent++;
    fn();
    this.indent--;
    this.write('}');
  }

  // ─── Génération déclarative ──────────────────────────────────────────

  private generateDeclarative(model: GraphModel): void {
    const agentNodes = model.nodes.filter(n => n.kind === 'agent');
    const stageNodes = model.nodes.filter(n => n.kind === 'stage');
    const postNodes = model.nodes.filter(n => n.kind === 'post');

    this.block('pipeline', () => {
      // agent
      if (agentNodes.length > 0) {
        this.generateAgent(agentNodes[0].data as AgentData);
      } else {
        this.write('agent any');
      }
      this.writeln();

      // environment
      const env = model.meta.environment as { variables?: Array<{ key: string; value: string; isSecret?: boolean }> } | undefined;
      if (env?.variables && env.variables.length > 0) {
        this.block('environment', () => {
          for (const { key, value, isSecret } of env.variables!) {
            if (isSecret) { this.write(`${key} = credentials('${escapeGroovyString(value)}')`); }
            else { this.write(`${key} = '${escapeGroovyString(value)}'`); }
          }
        });
        this.writeln();
      }

      // options
      const opts = model.meta.options as Record<string, unknown> | undefined;
      if (opts && Object.keys(opts).length > 0) {
        this.block('options', () => {
          if (opts['disableConcurrentBuilds']) this.write('disableConcurrentBuilds()');
          if (opts['skipDefaultCheckout']) this.write('skipDefaultCheckout()');
          const to = opts['timeout'] as { time: number; unit: string } | undefined;
          if (to) this.write(`timeout(time: ${to.time}, unit: '${to.unit}')`);
          const bd = opts['buildDiscarder'] as { numToKeepStr: string } | undefined;
          if (bd) this.write(`buildDiscarder(logRotator(numToKeepStr: '${bd.numToKeepStr}'))`);
        });
        this.writeln();
      }

      // parameters
      const params = model.meta.parameters as Array<Record<string, unknown>> | undefined;
      if (params && params.length > 0) {
        this.block('parameters', () => {
          for (const p of params) {
            const t = String(p['type'] ?? 'string');
            const n = String(p['name'] ?? '');
            const dv = String(p['defaultValue'] ?? '');
            const desc = String(p['description'] ?? '');
            this.write(`${t}(name: '${n}', defaultValue: '${escapeGroovyString(dv)}', description: '${escapeGroovyString(desc)}')`);
          }
        });
        this.writeln();
      }

      // triggers
      const triggers = model.meta.triggers as Array<Record<string, unknown>> | undefined;
      if (triggers && triggers.length > 0) {
        this.block('triggers', () => {
          for (const tr of triggers) {
            if (tr['type'] === 'cron') this.write(`cron('${escapeGroovyString(String(tr['schedule'] ?? ''))}')`);
            else if (tr['type'] === 'pollSCM') this.write(`pollSCM('${escapeGroovyString(String(tr['schedule'] ?? ''))}')`);
          }
        });
        this.writeln();
      }

      // stages — only top-level stage nodes (sequence edges from pipeline or other stages)
      const seqEdges = model.edges.filter(e => e.type === 'sequence');
      const allSeqTargets = new Set(seqEdges.map(e => e.target));
      // root stages: sequence targets whose source is the pipeline node
      const pipelineNode = model.nodes.find(n => n.kind === 'pipeline');
      const rootStageIds = seqEdges
        .filter(e => e.source === pipelineNode?.id)
        .map(e => e.target);
      // build ordered list following sequence chain from root
      const orderedStages: string[] = [];
      const visitSeq = (id: string) => {
        if (orderedStages.includes(id)) return;
        const node = model.nodes.find(n => n.id === id);
        if (!node || node.kind !== 'stage') return;
        orderedStages.push(id);
        const next = seqEdges.filter(e => e.source === id).map(e => e.target);
        next.forEach(visitSeq);
      };
      rootStageIds.forEach(visitSeq);
      if (orderedStages.length === 0) {
        // fallback: topological order of all stage nodes
        getTopologicalOrder(stageNodes, model.edges).forEach(n => orderedStages.push(n.id));
      }

      if (orderedStages.length > 0) {
        this.block('stages', () => {
          for (const sid of orderedStages) {
            const sn = model.nodes.find(n => n.id === sid);
            if (sn) { this.generateStage(sn, model); this.writeln(); }
          }
        });
      }

      // post
      if (postNodes.length > 0) {
        this.writeln();
        this.generatePost(postNodes, model);
      }
    });
  }

  private generateScripted(model: GraphModel): void {
    // TODO: Mode scripted basique
    this.block('node', () => {
      const stages = model.nodes.filter(n => n.kind === 'stage');
      stages.forEach(stage => {
        const data = stage.data as { name?: string };
        this.block(`stage('${escapeGroovyString(data.name ?? stage.label)}')`, () => {
          this.write('// TODO: steps');
        });
        this.writeln();
      });
    });
  }

  // ─── Génération des nœuds ────────────────────────────────────────────

  private generateAgent(data: AgentData): void {
    // TODO: Voir docs/PHASE3.md §3.5
    switch (data.type) {
      case 'any':
        this.write('agent any');
        break;
      case 'none':
        this.write('agent none');
        break;
      case 'label':
        this.write(`agent { label '${escapeGroovyString(data.label ?? '')}' }`);
        break;
      case 'docker':
        this.block('agent', () => {
          this.block('docker', () => {
            this.write(`image '${escapeGroovyString(data.image ?? '')}'`);
            if (data.args) this.write(`args '${escapeGroovyString(data.args)}'`);
            if (data.reuseNode) this.write('reuseNode true');
          });
        });
        break;
      case 'dockerfile':
        this.block('agent', () => {
          this.block('dockerfile', () => {
            if (data.filename) this.write(`filename '${escapeGroovyString(data.filename)}'`);
          });
        });
        break;
    }
  }

  private generateStage(node: JenkinsNode, model: GraphModel): void {
    const data = node.data as { name?: string; agent?: AgentData; when?: Record<string, unknown>; failFast?: boolean };
    const name = data.name ?? node.label;
    this.block(`stage('${escapeGroovyString(name)}')`, () => {
      // per-stage agent
      if (data.agent) { this.generateAgent(data.agent); }
      // when
      if (data.when) {
        this.block('when', () => { this.writeWhen(data.when!); });
      }
      // failFast
      if (data.failFast) { this.write('failFast true'); }

      const children = getChildNodes(node.id, model);
      const parallelNode = children.find(c => c.kind === 'parallel');
      const stepChildren = children.filter(c => c.kind === 'step');

      if (parallelNode) {
        // parallel block: look for child stages of the parallel node
        const branchStages = getChildNodes(parallelNode.id, model).filter(c => c.kind === 'stage');
        // also look for sequence edges from this stage
        const seqBranches = model.edges
          .filter(e => e.source === node.id && e.type === 'parallel')
          .map(e => model.nodes.find(n => n.id === e.target))
          .filter((n): n is JenkinsNode => n !== undefined && n.kind === 'stage');
        const allBranches = branchStages.length > 0 ? branchStages : seqBranches;
        if (data.failFast === undefined && allBranches.length > 0) { /* already written */ }
        if (allBranches.length > 0) {
          this.block('parallel', () => {
            for (const branch of allBranches) { this.generateStage(branch, model); this.writeln(); }
          });
        }
      } else if (stepChildren.length > 0) {
        this.block('steps', () => { stepChildren.forEach(s => this.generateStep(s)); });
      } else {
        this.block('steps', () => { this.write('// TODO: add steps'); });
      }
    });
  }

  private writeWhen(when: Record<string, unknown>): void {
    const t = String(when['type'] ?? '');
    if (t === 'branch') { this.write(`branch '${escapeGroovyString(String(when['value'] ?? ''))}'`); }
    else if (t === 'environment') { this.write(`environment name: '${escapeGroovyString(String(when['name'] ?? ''))}', value: '${escapeGroovyString(String(when['value'] ?? ''))}'`); }
    else if (t === 'expression') { this.block('expression', () => { this.write(String(when['value'] ?? 'true')); }); }
    else if (t === 'tag') { this.write(`tag '${escapeGroovyString(String(when['value'] ?? ''))}'`); }
    else if (t === 'anyOf') { this.block('anyOf', () => { this.write('// conditions'); }); }
    else if (t === 'allOf') { this.block('allOf', () => { this.write('// conditions'); }); }
    else if (t === 'not') { this.block('not', () => { this.write('// condition'); }); }
  }

  private generateStep(node: JenkinsNode): void {
    const d = node.data as StepData;
    switch (d.type) {
      case 'sh':
        if (d.returnStdout) { this.write(`sh(script: '${escapeGroovyString(d.script ?? '')}', returnStdout: true)`); }
        else { this.write(`sh '${escapeGroovyString(d.script ?? '')}'`); }
        break;
      case 'echo':
        this.write(`echo '${escapeGroovyString(d.message ?? '')}'`);
        break;
      case 'git':
        if (d.branch) { this.write(`git url: '${escapeGroovyString(d.url ?? '')}', branch: '${escapeGroovyString(d.branch)}'`); }
        else { this.write(`git '${escapeGroovyString(d.url ?? '')}'`); }
        break;
      case 'checkout':
        this.write(d.url === 'scm' ? 'checkout scm' : `checkout([$class: 'GitSCM', userRemoteConfigs: [[url: '${escapeGroovyString(d.url ?? '')}']]])`);
        break;
      case 'archiveArtifacts':
        this.write(`archiveArtifacts artifacts: '${escapeGroovyString(d.artifacts ?? '')}', fingerprint: ${d.fingerprint ?? false}`);
        break;
      case 'junit':
        this.write(`junit '${escapeGroovyString(d.pattern ?? '')}'`);
        break;
      case 'timeout':
        this.write(`timeout(time: ${d.time ?? 10}, unit: '${d.unit ?? 'MINUTES'}')`);
        break;
      case 'retry':
        this.write(`retry(${d.count ?? 3})`);
        break;
      case 'custom':
        this.write(String((d as unknown as Record<string, unknown>)['rawContent'] ?? d.label ?? '// custom step'));
        break;
      default:
        this.write(String((d as unknown as Record<string, unknown>)['rawContent'] ?? `${d.type}()`));
    }
  }

  private generatePost(nodes: JenkinsNode[], model: GraphModel): void {
    const ORDER = ['always', 'success', 'failure', 'unstable', 'changed', 'aborted', 'cleanup'];
    const sorted = [...nodes].sort((a, b) => {
      const ac = String((a.data as Record<string, unknown>)['condition'] ?? '');
      const bc = String((b.data as Record<string, unknown>)['condition'] ?? '');
      return ORDER.indexOf(ac) - ORDER.indexOf(bc);
    });
    this.block('post', () => {
      for (const pn of sorted) {
        const cond = String((pn.data as Record<string, unknown>)['condition'] ?? 'always');
        const stepChildren = getChildNodes(pn.id, model).filter(c => c.kind === 'step');
        this.block(cond, () => {
          if (stepChildren.length > 0) { stepChildren.forEach(s => this.generateStep(s)); }
          else { this.write('// no steps'); }
        });
      }
    });
  }
}

// ─── Utilitaires ────────────────────────────────────────────────────────────

function escapeGroovyString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getTopologicalOrder(nodes: JenkinsNode[], edges: JenkinsEdge[]): JenkinsNode[] {
  // Algorithme de Kahn pour le tri topologique
  // Retourner les nœuds dans l'ordre source → destination

  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  nodes.forEach(n => { inDegree.set(n.id, 0); adjList.set(n.id, []); });
  edges.forEach(e => {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    adjList.get(e.source)?.push(e.target);
  });

  const queue = nodes.filter(n => inDegree.get(n.id) === 0);
  const result: JenkinsNode[] = [];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    (adjList.get(current.id) ?? []).forEach(targetId => {
      const deg = (inDegree.get(targetId) ?? 1) - 1;
      inDegree.set(targetId, deg);
      if (deg === 0) {
        const n = nodeMap.get(targetId);
        if (n) queue.push(n);
      }
    });
  }

  return result;
}

function getChildNodes(nodeId: string, model: GraphModel): JenkinsNode[] {
  const childIds = model.edges
    .filter(e => e.source === nodeId && e.type === 'contains')
    .map(e => e.target);
  return model.nodes.filter(n => childIds.includes(n.id));
}

export { escapeGroovyString, getTopologicalOrder, getChildNodes };
