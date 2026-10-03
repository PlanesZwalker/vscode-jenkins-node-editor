// Tests for the connection test (#8). `logger` is mocked to avoid the `vscode` import.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/extension/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { JenkinsClient } from '../../src/extension/JenkinsClient';
import type { ExtensionConfig } from '../../src/shared/types';

const config: ExtensionConfig = {
  jenkinsUrl: 'https://jenkins.test/',
  jenkinsUser: 'alice',
  jenkinsToken: 'tok',
  jenkinsJobName: 'glsl',
  jenkinsBranch: 'dev',
  autoLayout: true,
  syncDelay: 300,
};

/** Stubs global.fetch with per-URL responses. */
function stubFetch(routes: Array<{ match: string; status: number; body?: unknown }>) {
  const calls: string[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes
      .filter(r => url.includes(r.match))
      .sort((a, b) => b.match.length - a.match.length)[0];
    const status = route?.status ?? 404;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Unauthorized',
      json: async () => route?.body ?? {},
      text: async () => JSON.stringify(route?.body ?? {}),
    } as unknown as Response;
  }) as typeof fetch;
  return calls;
}

describe('#8 testConnection', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('reports success for reachable + authed + existing job', async () => {
    const calls = stubFetch([
      { match: '/api/json', status: 200, body: {} },
      { match: '/me/api/json', status: 200, body: { fullName: 'Alice' } },
      { match: '/job/glsl/job/dev/api/json', status: 200, body: { name: 'glsl' } },
    ]);
    const steps = await new JenkinsClient(config).testConnection('glsl', 'dev');
    expect(steps).toHaveLength(3);
    expect(steps.every(s => s.ok)).toBe(true);
    expect(steps[1].detail).toBe('Alice');
    expect(steps[2].detail).toBe('glsl [dev]');
    // Branch must be a path segment.
    expect(calls.some(c => c.includes('/job/glsl/job/dev/'))).toBe(true);
  });

  it('stops after a reachability failure', async () => {
    stubFetch([{ match: '/api/json', status: 500 }]);
    const steps = await new JenkinsClient(config).testConnection('glsl', 'dev');
    expect(steps).toHaveLength(1);
    expect(steps[0].ok).toBe(false);
    expect(steps[0].label).toBe('Server reachable');
  });

  it('flags bad credentials but still probes the job', async () => {
    stubFetch([
      { match: '/api/json', status: 200, body: {} },
      { match: '/me/api/json', status: 401 },
      { match: '/job/glsl/api/json', status: 404 },
    ]);
    const steps = await new JenkinsClient(config).testConnection('glsl');
    expect(steps.map(s => s.ok)).toEqual([true, false, false]);
    expect(steps[1].detail).toContain('401');
    expect(steps[2].detail).toContain('404');
  });

  it('uses overrides (unsaved drafts) for auth and reports a missing job path', async () => {
    stubFetch([
      { match: '/api/json', status: 200, body: {} },
      { match: '/me/api/json', status: 200, body: { id: 'bob' } },
    ]);
    const steps = await new JenkinsClient(config).testConnection('', undefined, { user: 'bob', token: 'x' });
    expect(steps).toHaveLength(3);
    expect(steps[1].detail).toBe('bob');
    expect(steps[2].ok).toBe(false);
    expect(steps[2].detail).toBe('No job path configured');
  });

  it('normalises a trailing slash in the base URL', async () => {
    const calls = stubFetch([
      { match: '/api/json', status: 200, body: {} },
      { match: '/me/api/json', status: 200, body: {} },
      { match: '/job/glsl/api/json', status: 200, body: { name: 'glsl' } },
    ]);
    await new JenkinsClient(config).testConnection('glsl');
    expect(calls.every(c => !c.includes('//api/json') && !c.includes('test//'))).toBe(true);
  });
});
