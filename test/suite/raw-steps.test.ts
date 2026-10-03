import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { JenkinsfileParser } from '../../src/parser/JenkinsfileParser';
import { JenkinsfileGenerator } from '../../src/parser/JenkinsfileGenerator';
import { parseStep, isRawStep } from '../../src/parser/stepParser';
import { computeMinimalEdit } from '../../src/parser/surgicalEdit';

const parser = new JenkinsfileParser();
const gen = new JenkinsfileGenerator();
const load = (f: string) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

describe('stepParser: raw vs structured', () => {
  it('keeps script{} whole and raw', () => {
    const s = parseStep('script { def x = 1 }')!;
    expect(s['type']).toBe('script');
    expect(s['rawContent']).toBe('script { def x = 1 }');
    expect(isRawStep(s)).toBe(true);
  });
  it('keeps checkout([...]) whole and raw', () => {
    const s = parseStep("checkout([$class: 'GitSCM', branches: [[name: 'main']]])")!;
    expect(s['type']).toBe('checkout');
    expect(isRawStep(s)).toBe(true);
  });
  it('keeps withCredentials([...]) whole and raw', () => {
    const s = parseStep("withCredentials([string(credentialsId: 'A', variable: 'B')]) { }")!;
    expect(s['type']).toBe('withCredentials');
    expect(isRawStep(s)).toBe(true);
  });
  it('keeps multi-line sh() with triple quotes raw', () => {
    const s = parseStep("sh(script: '''\necho hi\n''', returnStdout: true)")!;
    expect(s['type']).toBe('sh');
    expect(isRawStep(s)).toBe(true);
    expect(String(s['rawContent'])).toContain("'''");
  });
  it('still structures a simple sh', () => {
    const s = parseStep("sh 'make build'")!;
    expect(s['type']).toBe('sh');
    expect(s['script']).toBe('make build');
  });
  it('does not treat control keywords as steps', () => {
    expect(parseStep('if (x) {')).toBeNull();
    expect(parseStep('}')).toBeNull();
    expect(parseStep('// comment')).toBeNull();
  });
});

describe('multi-line steps inside steps{}', () => {
  it('captures sh \'\'\'…\'\'\', checkout([…]) and script{} as editable nodes', async () => {
    const src = load('test/fixtures/raw-steps.Jenkinsfile');
    const { graph } = await parser.parse(src);
    const steps = graph.nodes.filter(n => n.kind === 'step');
    const byType = (t: string) => steps.filter(s => (s.data as Record<string, unknown>)['type'] === t);

    expect(byType('checkout')).toHaveLength(1);
    expect(byType('sh')).toHaveLength(1);
    expect(byType('script')).toHaveLength(1);

    // The raw content must contain the multi-line bodies (nothing dropped).
    expect(String((byType('sh')[0].data as Record<string, unknown>)['rawContent'])).toContain('docker build');
    expect(String((byType('script')[0].data as Record<string, unknown>)['rawContent'])).toContain('git rev-parse');
    expect(String((byType('checkout')[0].data as Record<string, unknown>)['rawContent'])).toContain('GitSCM');
  });

  it('regeneration is byte-identical (no-op sync produces no edit)', async () => {
    const src = load('test/fixtures/raw-steps.Jenkinsfile');
    const { graph } = await parser.parse(src);
    const out = gen.generate(graph);
    expect(computeMinimalEdit(src, out)).toBeNull();
  });
});
