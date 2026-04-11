// src/extension/JenkinsClient.ts
// Jenkins REST API client — validation, step catalog, build, logs

import { logger } from './logger';
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

  // ─── Build ────────────────────────────────────────────────────────────

  async triggerBuild(jobName: string, params?: Record<string, string>): Promise<string> {
    const encodedName = jobName.split('/').map(encodeURIComponent).join('/job/');
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

  async *streamLogs(jobName: string, buildNumber: number): AsyncGenerator<string> {
    const encodedName = jobName.split('/').map(encodeURIComponent).join('/job/');
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

  async abortBuild(jobName: string, buildNumber: number): Promise<void> {
    const encodedName = jobName.split('/').map(encodeURIComponent).join('/job/');
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
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Basic ${this.auth}`,
        ...init.headers,
      },
    });
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
