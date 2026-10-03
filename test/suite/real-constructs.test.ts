// Regression on a real-world Jenkinsfile (skipped when the file is absent so the
// suite stays green on other machines / CI).
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { JenkinsfileParser } from '../../src/parser/JenkinsfileParser';
import { isRawStep } from '../../src/parser/stepParser';

const REAL = 'C:/Users/anne/Desktop/GLSL_DISCORD/Jenkinsfile';
const hasReal = fs.existsSync(REAL);

describe.skipIf(!hasReal)('real-world Jenkinsfile: raw constructs', () => {
  it('captures multi-line sh heredocs / checkout([…]) / script{} as editable nodes', async () => {
    const src = fs.readFileSync(REAL, 'utf8').replace(/\r\n/g, '\n');
    const { graph, errors, mode } = await new JenkinsfileParser().parse(src);

    expect(mode).toBe('declarative');
    expect(errors).toHaveLength(0);
    expect(graph.nodes.filter(n => n.kind === 'stage').length).toBe(21);

    const steps = graph.nodes.filter(n => n.kind === 'step');
    // Every step must be either structured or carry its exact source text.
    expect(steps.every(s => isRawStep(s.data as Record<string, unknown>) || (s.data as Record<string, unknown>)['script'] !== undefined || (s.data as Record<string, unknown>)['message'] !== undefined)).toBe(true);

    const raws = steps.map(s => String((s.data as Record<string, unknown>)['rawContent'] ?? ''));
    // `checkout([…])` spans several lines and must be captured whole.
    const checkout = raws.find(r => r.startsWith('checkout('));
    expect(checkout).toBeDefined();
    expect(checkout).toContain('GitSCM');
    expect(checkout!.split('\n').length).toBeGreaterThan(1);

    // A `sh '''…'''` heredoc must be captured whole (not truncated at line 1).
    const heredoc = raws.find(r => r.startsWith("sh '''"));
    expect(heredoc).toBeDefined();
    expect(heredoc!.split('\n').length).toBeGreaterThan(3);

    // `script { … }` blocks inside the pipeline must be captured with their braces.
    const scripts = raws.filter(r => r.startsWith('script'));
    expect(scripts.length).toBeGreaterThanOrEqual(10);
    expect(scripts[0]).toMatch(/^script\s*\{[\s\S]*\}$/);

    // Everything outside `pipeline { }` (Groovy helpers) is preserved verbatim.
    expect(graph.meta.preamble).toBeDefined();
    expect(graph.meta.epilogue).toContain('def deployDockerLocalFull');
  });
});
