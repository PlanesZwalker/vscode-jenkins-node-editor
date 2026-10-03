// Regression tests for real-world Jenkinsfiles.
// Bug: opening a Jenkinsfile showed no pipeline (no error) because
//   1. detectMode() only matched `pipeline {` at the very start of the file
//      (comments / @Library / top-level constants before it broke detection),
//   2. nested `stages { }` blocks were not recursed into,
//   3. stage('Name (x)') args broke the non-greedy keyword matcher.
import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { JenkinsfileParser, detectMode } from '../../src/parser/JenkinsfileParser';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');
const load = (n: string) => fs.readFileSync(path.join(FIXTURES_DIR, n), 'utf8');

describe('detectMode — leading content', () => {
  it('declarative preceded by comments + top-level constants', () => {
    expect(detectMode(`// header\nFOO = ['a','b']\n\npipeline {\n  agent any\n}`)).toBe('declarative');
  });
  it('declarative preceded by @Library', () => {
    expect(detectMode(`@Library('shared') _\npipeline {\n  agent any\n}`)).toBe('declarative');
  });
  it('plain declarative', () => {
    expect(detectMode('pipeline {\n agent any\n}')).toBe('declarative');
  });
  it('scripted still detected', () => {
    expect(detectMode('node {\n stage("B") {}\n}')).toBe('scripted');
  });
});

describe('JenkinsfileParser — leading constants + nested stages', () => {
  let parser: JenkinsfileParser;
  beforeEach(() => { parser = new JenkinsfileParser(); });

  it('detects declarative despite leading constants', async () => {
    const { mode, errors } = await parser.parse(load('leading-constants-nested.Jenkinsfile'));
    expect(mode).toBe('declarative');
    expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
  });

  it('extracts ALL stages, including nested ones', async () => {
    const { graph } = await parser.parse(load('leading-constants-nested.Jenkinsfile'));
    const stages = graph.nodes.filter(n => n.kind === 'stage');
    // top-level: Sync Sources, Build Lock, Master
    // nested:     Gate disque, Staging, Dev, Master's Deploy (prod)
    // deep:       Free RAM (staging), Build images, Deploy (dev)
    expect(stages.length).toBeGreaterThanOrEqual(8);
    const names = stages.map(n => (n.data as Record<string, unknown>)['name']);
    expect(names).toContain('Sync Sources');
    expect(names).toContain('Master');
    expect(names).toContain('Gate disque');
    expect(names).toContain('Deploy (prod)');
  });

  it('preserves stage names containing parentheses', async () => {
    const { graph } = await parser.parse(load('leading-constants-nested.Jenkinsfile'));
    const names = graph.nodes.filter(n => n.kind === 'stage')
      .map(n => (n.data as Record<string, unknown>)['name']);
    expect(names).toContain('Free RAM (staging)');
    expect(names).toContain('Deploy (dev)');
  });

  it('emits an edge for every node (graph is connected, not empty)', async () => {
    const { graph } = await parser.parse(load('leading-constants-nested.Jenkinsfile'));
    expect(graph.edges.length).toBeGreaterThan(0);
    const nodeIds = new Set(graph.nodes.map(n => n.id));
    graph.edges.forEach(e => {
      expect(nodeIds.has(e.source)).toBe(true);
      expect(nodeIds.has(e.target)).toBe(true);
    });
  });

  it('auto-layout is hierarchical (contains edges keep steps under stages)', async () => {
    const { graph } = await parser.parse(load('leading-constants-nested.Jenkinsfile'));
    // If `contains` edges were dropped from dagre, every step/agent/post would
    // collapse into rank 0 (y≈0). Require several distinct vertical ranks.
    const bands = new Set(graph.nodes.map(n => Math.round(n.position.y / 100)));
    expect(bands.size).toBeGreaterThanOrEqual(4);
    const pipelineY = graph.nodes.find(n => n.kind === 'pipeline')!.position.y;
    const stepY = graph.nodes.find(n => n.kind === 'step')!.position.y;
    expect(stepY).toBeGreaterThan(pipelineY);
  });
});
