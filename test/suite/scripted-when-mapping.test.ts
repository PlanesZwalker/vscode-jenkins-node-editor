// Tests for #1 scripted support, #2 nested `when` conditions, #4 error→node mapping.
import { describe, it, expect } from 'vitest';
import { JenkinsfileParser } from '../../src/parser/JenkinsfileParser';
import { JenkinsfileGenerator } from '../../src/parser/JenkinsfileGenerator';
import { inferNodeId } from '../../src/parser/nodeMapping';
import type { GraphModel } from '../../src/shared/types';

const parser = new JenkinsfileParser();
const generator = new JenkinsfileGenerator();

const SCRIPTED = `node {
  stage('Build') {
    sh 'make'
    echo 'built'
  }
  stage('Test') {
    sh 'make test'
  }
  stage('Deploy') {
    sh './deploy.sh'
  }
}`;

const SCRIPTED_NESTED = `node {
  if (env.BRANCH_NAME == 'main') {
    stage('Prod') {
      sh './prod.sh'
    }
  }
}`;

const WHEN_ANYOF = `pipeline {
  agent any
  stages {
    stage('Gate') {
      when { anyOf { branch 'dev'; branch 'master' } }
      steps { echo 'ok' }
    }
    stage('NotTag') {
      when { not { tag 'skip' } }
      steps { echo 'ok' }
    }
  }
}`;

describe('#1 scripted pipeline: stages AND steps', () => {
  it('extracts every stage and its steps', async () => {
    const { graph, mode } = await parser.parse(SCRIPTED);
    expect(mode).toBe('scripted');
    const stages = graph.nodes.filter(n => n.kind === 'stage');
    expect(stages.map(n => (n.data as any).name)).toEqual(['Build', 'Test', 'Deploy']);
    const steps = graph.nodes.filter(n => n.kind === 'step');
    expect(steps.length).toBeGreaterThanOrEqual(4); // sh,echo,sh,sh
  });

  it('finds stages nested inside wrappers (if {})', async () => {
    const { graph } = await parser.parse(SCRIPTED_NESTED);
    const stages = graph.nodes.filter(n => n.kind === 'stage');
    expect(stages.map(n => (n.data as any).name)).toContain('Prod');
  });

  it('generator emits real steps, not a TODO placeholder', async () => {
    const { graph } = await parser.parse(SCRIPTED);
    const out = generator.generate(graph);
    expect(out).not.toContain('// TODO: steps');
    expect(out).toContain("sh 'make'");
    expect(out).toContain("stage('Deploy')");
    expect(out.trimEnd().endsWith('}')).toBe(true);
  });

  it('round-trips scripted stages + steps (reparse preserves them)', async () => {
    const { graph } = await parser.parse(SCRIPTED);
    const out = generator.generate(graph);
    const { graph: g2 } = await parser.parse(out);
    expect(g2.nodes.filter(n => n.kind === 'stage').length).toBe(3);
    expect(g2.nodes.filter(n => n.kind === 'step').length).toBeGreaterThanOrEqual(4);
  });
});

describe('#2 nested when conditions', () => {
  it('parses anyOf with real child conditions', async () => {
    const { graph } = await parser.parse(WHEN_ANYOF);
    const gate = graph.nodes.find(n => n.kind === 'stage' && (n.data as any).name === 'Gate')!;
    const when = (gate.data as any).when;
    expect(when.type).toBe('anyOf');
    expect(when.conditions.map((c: any) => c.value)).toEqual(['dev', 'master']);
  });

  it('parses not { tag }', async () => {
    const { graph } = await parser.parse(WHEN_ANYOF);
    const s = graph.nodes.find(n => n.kind === 'stage' && (n.data as any).name === 'NotTag')!;
    expect((s.data as any).when).toMatchObject({ type: 'not', conditions: [{ type: 'tag', value: 'skip' }] });
  });

  it('generator writes the nested conditions back (no empty comment)', async () => {
    const { graph } = await parser.parse(WHEN_ANYOF);
    const out = generator.generate(graph);
    expect(out).not.toContain('// conditions');
    expect(out).toContain("branch 'dev'");
    expect(out).toContain("branch 'master'");
    expect(out).toContain("tag 'skip'");
  });

  it('round-trips when conditions', async () => {
    const { graph } = await parser.parse(WHEN_ANYOF);
    const out = generator.generate(graph);
    const { graph: g2 } = await parser.parse(out);
    const gate = g2.nodes.find(n => n.kind === 'stage' && (n.data as any).name === 'Gate')!;
    expect((gate.data as any).when.conditions.map((c: any) => c.value)).toEqual(['dev', 'master']);
  });
});

describe('#4 error → node mapping', () => {
  const graph: GraphModel = {
    nodes: [
      { id: 'stage-1', kind: 'stage', label: 'Build', data: { name: 'Build', sourceLine: 5 }, position: { x: 0, y: 0 } },
      { id: 'stage-2', kind: 'stage', label: 'Deploy', data: { name: 'Deploy', sourceLine: 20 }, position: { x: 0, y: 0 } },
    ],
    edges: [],
    meta: { declarative: true },
  };

  it('maps by stage name mentioned in the message', () => {
    expect(inferNodeId({ severity: 'error', message: "stage('Deploy') is missing steps" }, graph)).toBe('stage-2');
  });

  it('maps by nearest stage at or above the error line', () => {
    expect(inferNodeId({ severity: 'error', message: 'Unexpected token', line: 25 }, graph)).toBe('stage-2');
    expect(inferNodeId({ severity: 'error', message: 'Unexpected token', line: 10 }, graph)).toBe('stage-1');
  });

  it('returns undefined when nothing matches', () => {
    expect(inferNodeId({ severity: 'error', message: 'x', line: 1 }, graph)).toBeUndefined();
    expect(inferNodeId({ severity: 'error', message: 'x' }, null)).toBeUndefined();
  });
});
