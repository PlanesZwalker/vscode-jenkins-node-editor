// Tests for #6 build parameters parsing and #7 multibranch job path.
import { describe, it, expect } from 'vitest';
import { JenkinsfileParser } from '../../src/parser/JenkinsfileParser';
import { buildJobPath } from '../../src/extension/jobPath';

const parser = new JenkinsfileParser();

const PARAMS_PIPELINE = `pipeline {
  agent any
  parameters {
    booleanParam(name: 'FORCE_BUILD', defaultValue: false,
        description: 'Force rebuild even without changes')
    booleanParam(name: 'BUILD_WORKERS', defaultValue: true, description: 'Build the 4 workers')
    string(name: 'DEPLOY_NAMESPACES', defaultValue: '',
        description: 'Target namespaces, space separated')
    choice(name: 'ENV', choices: ['dev', 'staging', 'prod'], description: 'Target env')
  }
  stages { stage('X') { steps { echo 'ok' } } }
}`;

describe('#6 parseParameters', () => {
  it('parses unquoted booleans, empty strings and multi-line descriptions', async () => {
    const { graph } = await parser.parse(PARAMS_PIPELINE);
    const p = (graph.meta.parameters ?? []) as Array<Record<string, unknown>>;
    const byName = Object.fromEntries(p.map(x => [x['name'], x]));

    expect(p).toHaveLength(4);
    expect(byName['FORCE_BUILD']['type']).toBe('booleanParam');
    expect(byName['FORCE_BUILD']['defaultValue']).toBe('false');
    expect(byName['FORCE_BUILD']['description']).toBe('Force rebuild even without changes');
    expect(byName['BUILD_WORKERS']['defaultValue']).toBe('true');
    expect(byName['DEPLOY_NAMESPACES']['defaultValue']).toBe('');
    expect(byName['ENV']['choices']).toEqual(['dev', 'staging', 'prod']);
  });
});

describe('#7 buildJobPath (multibranch)', () => {
  it('encodes folders as /job/', () => {
    expect(buildJobPath('my-folder/my-job')).toBe('my-folder/job/my-job');
  });
  it('appends the branch for multibranch jobs', () => {
    expect(buildJobPath('glsl', 'dev')).toBe('glsl/job/dev');
    expect(buildJobPath('my-folder/my-job', 'main')).toBe('my-folder/job/my-job/job/main');
  });
  it('does not duplicate a branch already in the path', () => {
    expect(buildJobPath('glsl/dev', 'dev')).toBe('glsl/job/dev');
  });
  it('handles empty branch / job', () => {
    expect(buildJobPath('glsl', '')).toBe('glsl');
    expect(buildJobPath('glsl', undefined)).toBe('glsl');
  });
  it('encodes spaces and slashes in names', () => {
    expect(buildJobPath('my folder/job 1')).toBe('my%20folder/job/job%201');
  });
});
