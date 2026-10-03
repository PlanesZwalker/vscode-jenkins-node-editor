// Tests for the autoLayout setting plumbing (#3) — pure, no vscode import.
import { describe, it, expect } from 'vitest';
import { JenkinsfileParser } from '../../src/parser/JenkinsfileParser';
import { applyDagreLayout } from '../../src/parser/layout';
import type { JenkinsNode, JenkinsEdge } from '../../src/shared/types';

const PIPE = `pipeline {
  agent any
  stages {
    stage('Build') { steps { echo 'a' } }
    stage('Test')  { steps { echo 'b' } }
  }
}`;

const parser = new JenkinsfileParser();

describe('#3 autoLayout option', () => {
  it('autoLayout: true lays the graph out (non-zero positions)', async () => {
    const { graph } = await parser.parse(PIPE, { autoLayout: true });
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.some(n => n.position.y !== 0 || n.position.x !== 0)).toBe(true);
  });

  it('autoLayout: false leaves positions at the origin', async () => {
    const { graph } = await parser.parse(PIPE, { autoLayout: false });
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.every(n => n.position.x === 0 && n.position.y === 0)).toBe(true);
  });

  it('defaults to autoLayout: true (backwards compatible)', async () => {
    const { graph } = await parser.parse(PIPE);
    expect(graph.nodes.some(n => n.position.y !== 0 || n.position.x !== 0)).toBe(true);
  });
});

describe('#3 applyDagreLayout honours saved positions', () => {
  const nodes: JenkinsNode[] = [
    { id: 'a', kind: 'stage', label: 'A', data: {}, position: { x: 0, y: 0 } },
    { id: 'b', kind: 'stage', label: 'B', data: {}, position: { x: 0, y: 0 } },
  ];
  const edges: JenkinsEdge[] = [{ id: 'e', source: 'a', target: 'b', type: 'sequence' }];

  it('keeps a saved position for a known node', () => {
    const out = applyDagreLayout(nodes, edges, { existingPositions: { a: { x: 999, y: 888 } } });
    const a = out.find(n => n.id === 'a')!;
    const b = out.find(n => n.id === 'b')!;
    expect(a.position).toEqual({ x: 999, y: 888 });
    // `b` has no saved position → dagre places it.
    expect(b.position.x !== 0 || b.position.y !== 0).toBe(true);
  });

  it('lays out everything when no positions are saved', () => {
    const out = applyDagreLayout(nodes, edges);
    const a = out.find(n => n.id === 'a')!;
    const b = out.find(n => n.id === 'b')!;
    // dagre ranks them vertically (TB): the target sits below the source.
    expect(b.position.y).toBeGreaterThan(a.position.y);
  });
});
