// test/suite/parser.test.ts
// Tests unitaires du parser et du générateur
// Voir docs/PHASE3.md §3.8

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { JenkinsfileParser } from '../../src/parser/JenkinsfileParser';
import { JenkinsfileGenerator } from '../../src/parser/JenkinsfileGenerator';
import { detectMode } from '../../src/parser/JenkinsfileParser';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

describe('detectMode', () => {
  it('detects declarative pipeline', () => {
    expect(detectMode('pipeline {\n  agent any\n}')).toBe('declarative');
  });
  it('detects scripted pipeline', () => {
    expect(detectMode('node {\n  stage("Build") {}\n}')).toBe('scripted');
  });
  it('handles leading whitespace', () => {
    expect(detectMode('  pipeline { }')).toBe('declarative');
  });
});

describe('JenkinsfileParser — simple.Jenkinsfile', () => {
  let parser: JenkinsfileParser;
  let source: string;

  beforeEach(() => {
    parser = new JenkinsfileParser();
    source = loadFixture('simple.Jenkinsfile');
  });

  it('parses without errors', async () => {
    const result = await parser.parse(source);
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('detects declarative mode', async () => {
    const result = await parser.parse(source);
    expect(result.mode).toBe('declarative');
  });

  it('extracts 3 stages', async () => {
    const result = await parser.parse(source);
    const stages = result.graph.nodes.filter(n => n.kind === 'stage');
    expect(stages).toHaveLength(3);
  });

  it('stage names are correct', async () => {
    const result = await parser.parse(source);
    const stageNames = result.graph.nodes
      .filter(n => n.kind === 'stage')
      .map(n => (n.data as Record<string, unknown>)['name']);
    expect(stageNames).toContain('Build');
    expect(stageNames).toContain('Test');
    expect(stageNames).toContain('Deploy');
  });

  it('extracts agent node', async () => {
    const result = await parser.parse(source);
    const agents = result.graph.nodes.filter(n => n.kind === 'agent');
    expect(agents.length).toBeGreaterThanOrEqual(1);
    const rootAgent = agents[0];
    expect((rootAgent.data as Record<string, unknown>)['type']).toBe('any');
  });

  it('extracts post nodes', async () => {
    const result = await parser.parse(source);
    const postNodes = result.graph.nodes.filter(n => n.kind === 'post');
    expect(postNodes.length).toBeGreaterThanOrEqual(1);
  });

  it('all nodes have valid positions after layout', async () => {
    const result = await parser.parse(source);
    result.graph.nodes.forEach(node => {
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
      expect(isNaN(node.position.x)).toBe(false);
      expect(isNaN(node.position.y)).toBe(false);
    });
  });

  it('edges connect existing nodes', async () => {
    const result = await parser.parse(source);
    const nodeIds = new Set(result.graph.nodes.map(n => n.id));
    result.graph.edges.forEach(edge => {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    });
  });
});

describe('JenkinsfileParser — parallel.Jenkinsfile', () => {
  let parser: JenkinsfileParser;

  beforeEach(() => { parser = new JenkinsfileParser(); });

  it('parses without fatal errors', async () => {
    const source = loadFixture('parallel.Jenkinsfile');
    const result = await parser.parse(source);
    const fatalErrors = result.errors.filter(e => e.severity === 'error');
    expect(fatalErrors).toHaveLength(0);
  });

  it('detects parallel stages', async () => {
    const source = loadFixture('parallel.Jenkinsfile');
    const result = await parser.parse(source);
    const parallelNodes = result.graph.nodes.filter(n => n.kind === 'parallel');
    expect(parallelNodes.length).toBeGreaterThanOrEqual(1);
  });
});

describe('JenkinsfileParser — error handling', () => {
  let parser: JenkinsfileParser;

  beforeEach(() => { parser = new JenkinsfileParser(); });

  it('handles empty string gracefully', async () => {
    const result = await parser.parse('');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.graph.nodes).toHaveLength(0);
  });

  it('handles unbalanced braces', async () => {
    const result = await parser.parse('pipeline { agent any stages {');
    expect(result.errors.some(e => e.severity === 'error')).toBe(true);
  });

  it('returns partial graph even with errors', async () => {
    const result = await parser.parse('pipeline { agent any\nstages {\nstage("Build") { steps { sh "make" } }\n');
    // Doit retourner ce qu'il peut parser, même si incomplet
    expect(result.graph).toBeDefined();
  });
});

describe('JenkinsfileGenerator', () => {
  let parser: JenkinsfileParser;
  let generator: JenkinsfileGenerator;

  beforeEach(() => {
    parser = new JenkinsfileParser();
    generator = new JenkinsfileGenerator();
  });

  it('generates valid Jenkinsfile from parsed graph', async () => {
    const source = loadFixture('simple.Jenkinsfile');
    const { graph } = await parser.parse(source);
    const generated = generator.generate(graph);
    expect(generated).toContain('pipeline');
    expect(generated).toContain('stages');
    expect(generated.trim().endsWith('}')).toBe(true);
  });

  it('round-trip preserves stage count', async () => {
    const source = loadFixture('simple.Jenkinsfile');
    const { graph: original } = await parser.parse(source);
    const generated = generator.generate(original);
    const { graph: reparsed } = await parser.parse(generated);

    const originalStages = original.nodes.filter(n => n.kind === 'stage').length;
    const reparsedStages = reparsed.nodes.filter(n => n.kind === 'stage').length;
    expect(reparsedStages).toBe(originalStages);
  });

  it('generated output is properly indented', async () => {
    const source = loadFixture('simple.Jenkinsfile');
    const { graph } = await parser.parse(source);
    const generated = generator.generate(graph);
    const lines = generated.split('\n').filter(l => l.trim());
    // Chaque ligne imbriquée doit avoir une indentation de 2 espaces par niveau
    lines.forEach(line => {
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      expect(indent % 2).toBe(0);
    });
  });
});
