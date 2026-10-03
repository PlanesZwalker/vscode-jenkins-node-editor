// src/extension/JenkinsClient.ts
// Jenkins REST API client — validation, step catalog, build, logs

import { logger } from './logger';
import { buildJobPath } from './jobPath';
import type { ValidationError, StepDefinition, ExtensionConfig } from '../shared/types';

export class JenkinsClient {
  private readonly baseUrl: string;
  private readonly auth: string;
  /** Cached CSRF crumb — refetched on 403 */
  private crumbCache: { field: string; value: string } | null = null;

  constructor(config: ExtensionConfig) {
    this.baseUrl = config.jenkinsUrl.replace(/\/$/, '');
    this.auth = Buffer.from(`${config.jenkinsUser}:${config.jenkinsToken}`).toString('base64');
  }

  /**
   * Builds the Jenkins job path for URL interpolation. For multibranch jobs the
   * branch is a path segment: `glsl` + `dev` → `glsl/job/dev`.
   */
  private jobPath(jobName: string, branch?: string): string {
    return buildJobPath(jobName, branch);
  }

  // ─── CSRF crumb ────────────────────────────────────────────────────────

  /**
   * Fetches the Jenkins CSRF crumb. Returns null if the Jenkins instance
   * has CSRF protection disabled (older installations).
   */
  private async fetchCrumb(): Promise<{ field: string; value: string } | null> {
    try {
      const data = await this.request<{ crumbRequestField: string; crumb: string }>(
        '/crumbIssuer/api/json',
      );
      return { field: data.crumbRequestField, value: data.crumb };
    } catch {
      // CSRF disabled or not supported — proceed without crumb
      return null;
    }
  }

  private async getCrumb(): Promise<{ field: string; value: string } | null> {
    if (!this.crumbCache) {
      this.crumbCache = await this.fetchCrumb();
    }
    return this.crumbCache;
  }

  /** Builds the extra headers needed for POST requests. */
  private async crumbHeaders(): Promise<Record<string, string>> {
    const crumb = await this.getCrumb();
    if (!crumb) return {};
    return { [crumb.field]: crumb.value };
  }

  // ─── Validation ──────────────────────────────────────────────────

  async validatePipeline(content: string): Promise<ValidationError[]> {
    const body = `jenkinsfile=${encodeURIComponent(content)}`;
    const crumb = await this.crumbHeaders();
    const resp = await this.rawRequest('/pipeline-model-converter/validatejenkinfile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...crumb },
      body,
    });
    const text = await resp.text();
    if (text.includes('successfully validated')) return [];
    const errors: ValidationError[] = [];
    for (const line of text.split('\n')) {
      const m = line.match(/WorkflowScript:\s*(\d+):\s*(.+)/);
      if (m) {
        errors.push({ line: parseInt(m[1]), column: 0, message: m[2].trim(), severity: 'error' });
      } else if (line.trim() && !line.includes('successfully')) {
        errors.push({ line: 0, column: 0, message: line.trim(), severity: 'error' });
      }
    }
    return errors;
  }

  // ─── Step catalog ──────────────────────────────────────────────────────

  async getStepCatalog(): Promise<StepDefinition[]> {
    const data = await this.request<{ steps?: unknown[] }>('/pipeline-model-converter/steps');
    if (!Array.isArray(data.steps)) return [];
    return data.steps.map(s => this.mapStepDefinition(s as Record<string, unknown>));
  }

  // ─── Connection test ──────────────────────────────────────────────────

  /**
   * Probes the Jenkins server and the target job. Returns a step-by-step report.
   * Values passed in `overrides` (unsaved panel drafts) win over the config so the
   * user can test before saving.
   */
  async testConnection(
    jobName: string,
    branch?: string,
    overrides?: { user?: string; token?: string },
  ): Promise<Array<{ ok: boolean; label: string; detail: string }>> {
    const steps: Array<{ ok: boolean; label: string; detail: string }> = [];
    const auth = overrides && (overrides.user !== undefined || overrides.token !== undefined)
      ? Buffer.from(`${overrides.user ?? ''}:${overrides.token ?? ''}`).toString('base64')
      : this.auth;
    const authHeaders: Record<string, string> = { Authorization: `Basic ${auth}` };

    // 1. Reachability (no auth first — /api/json accepts anonymous read on many setups).
    let reachable = false;
    try {
      const r = await fetch(`${this.baseUrl}/api/json`, { headers: { Authorization: `Basic ${auth}` } });
      if (r.ok) {
        reachable = true;
        steps.push({ ok: true, label: 'Server reachable', detail: `${this.baseUrl} (HTTP ${r.status})` });
      } else {
        steps.push({ ok: false, label: 'Server reachable', detail: `HTTP ${r.status} ${r.statusText} — check the URL` });
      }
    } catch (err) {
      steps.push({ ok: false, label: 'Server reachable', detail: `${err instanceof Error ? err.message : String(err)} — check the URL / network` });
    }
    if (!reachable) return steps;

    // 2. Authentication.
    try {
      const r = await fetch(`${this.baseUrl}/me/api/json`, { headers: authHeaders });
      if (r.ok) {
        const me = await r.json() as { fullName?: string; id?: string };
        steps.push({ ok: true, label: 'Authenticated', detail: `${me.fullName || me.id || 'user'}` });
      } else {
        steps.push({ ok: false, label: 'Authenticated', detail: `HTTP ${r.status} ${r.statusText} — check user / API token` });
      }
    } catch (err) {
      steps.push({ ok: false, label: 'Authenticated', detail: err instanceof Error ? err.message : String(err) });
    }

    // 3. Job exists.
    if (!jobName) {
      steps.push({ ok: false, label: 'Job found', detail: 'No job path configured' });
      return steps;
    }
    const jobPath = buildJobPath(jobName, branch);
    try {
      const r = await fetch(`${this.baseUrl}/job/${jobPath}/api/json?tree=name,color,url`, { headers: authHeaders });
      if (r.ok) {
        const j = await r.json() as { name?: string; url?: string };
        steps.push({ ok: true, label: 'Job found', detail: `${j.name ?? jobName}${branch ? ` [${branch}]` : ''}` });
      } else {
        steps.push({ ok: false, label: 'Job found', detail: `HTTP ${r.status} — check the job path${branch ? ' / branch' : ''}` });
      }
    } catch (err) {
      steps.push({ ok: false, label: 'Job found', detail: err instanceof Error ? err.message : String(err) });
    }
    return steps;
  }

  // ─── Build ────────────────────────────────────────────────────────────

  async triggerBuild(jobName: string, params?: Record<string, string>, branch?: string): Promise<string> {
    const encodedName = this.jobPath(jobName, branch);
    const hasParams = params && Object.keys(params).length > 0;
    const urlPath = hasParams
      ? `/job/${encodedName}/buildWithParameters`
      : `/job/${encodedName}/build`;
    const body = hasParams ? new URLSearchParams(params!).toString() : undefined;
    const crumb = await this.crumbHeaders();
    const resp = await this.rawRequest(urlPath, {
      method: 'POST',
      headers: { ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...crumb },
      body,
    });
    if (resp.status !== 201 && resp.status !== 302 && !resp.ok) {
      throw new Error(`Jenkins build trigger failed: ${resp.status} ${resp.statusText}`);
    }
    const location = resp.headers.get('Location') ?? '';
    if (!location) throw new Error('Jenkins did not return a queue URL');
    return location;
  }

  async getBuildNumber(queueUrl: string): Promise<number> {
    const m = queueUrl.match(/\/queue\/item\/(\d+)/);
    const itemId = m ? m[1] : queueUrl.split('/').filter(Boolean).pop()!;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const data = await this.request<{ executable?: { number?: number } }>(
          `/queue/item/${itemId}/api/json`,
        );
        if (data.executable?.number !== undefined) return data.executable.number;
      } catch {
        logger.debug(`Queue poll attempt ${attempt + 1} failed, retrying...`);
      }
    }
    throw new Error(`Timed out waiting for build number from queue item ${itemId}`);
  }

  async *streamLogs(jobName: string, buildNumber: number, branch?: string): AsyncGenerator<string> {
    const encodedName = this.jobPath(jobName, branch);
    let start = 0;
    let moreData = true;
    while (moreData) {
      const resp = await this.rawRequest(
        `/job/${encodedName}/${buildNumber}/logText/progressiveText?start=${start}`,
        { method: 'GET' },
      );
      if (!resp.ok) break;
      const text = await resp.text();
      if (text) yield text;
      const newSize = parseInt(resp.headers.get('X-Text-Size') ?? String(start + text.length));
      start = newSize;
      moreData = resp.headers.get('X-More-Data') === 'true';
      if (moreData) await new Promise(r => setTimeout(r, 1000));
    }
  }

  async abortBuild(jobName: string, buildNumber: number, branch?: string): Promise<void> {
    const encodedName = this.jobPath(jobName, branch);
    const crumb = await this.crumbHeaders();
    const resp = await this.rawRequest(`/job/${encodedName}/${buildNumber}/stop`, {
      method: 'POST',
      headers: crumb,
    });
    if (!resp.ok && resp.status !== 302) {
      throw new Error(`Abort failed: ${resp.status} ${resp.statusText}`);
    }
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────

  private async request<T>(urlPath: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${urlPath}`;
    logger.debug(`Jenkins API: ${init.method ?? 'GET'} ${url}`);
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Jenkins API ${response.status}: ${response.statusText} — ${url}`);
    }
    return response.json() as Promise<T>;
  }

  private async rawRequest(urlPath: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${urlPath}`;
    const resp = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Basic ${this.auth}`,
        ...init.headers,
      },
    });
    // Invalidate crumb cache if Jenkins returns 403 (crumb may have expired)
    if (resp.status === 403) {
      this.crumbCache = null;
    }
    return resp;
  }

  private mapStepDefinition(raw: Record<string, unknown>): StepDefinition {
    return {
      name: String(raw['name'] ?? ''),
      displayName: String(raw['displayName'] ?? raw['name'] ?? ''),
      description: String(raw['description'] ?? ''),
      parameters: (Array.isArray(raw['parameters']) ? raw['parameters'] : []).map(
        (p: Record<string, unknown>) => ({
          name: String(p['name'] ?? ''),
          type: String(p['type'] ?? 'string'),
          required: Boolean(p['required'] ?? false),
          description: String(p['description'] ?? ''),
        }),
      ),
    };
  }
}
