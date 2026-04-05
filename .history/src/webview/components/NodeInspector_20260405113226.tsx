// src/webview/components/NodeInspector.tsx
// Panneau d'inspection des propriétés du nœud sélectionné

import React, { useCallback, useState } from 'react';
import { useGraphStore } from '../store/graphStore';

// ── Primitive field components ────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'var(--je-input-bg)',
  color: 'var(--je-input-fg)',
  border: '1px solid var(--je-input-border)',
  borderRadius: 3,
  padding: '4px 8px',
  fontSize: 12,
  width: '100%',
  boxSizing: 'border-box',
};

function Field({ label, value, onChange, type = 'text', options, placeholder, hint }: {
  label: string;
  value: string | number | boolean | undefined;
  onChange: (v: string | boolean) => void;
  type?: 'text' | 'textarea' | 'checkbox' | 'select' | 'number';
  options?: string[];
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', marginBottom: 3, fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </label>
      {type === 'checkbox' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
          <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />
          <span style={{ opacity: 0.8 }}>{value ? 'Yes' : 'No'}</span>
        </label>
      ) : type === 'textarea' ? (
        <textarea
          rows={4}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: 11 }}
        />
      ) : type === 'select' && options ? (
        <select value={String(value ?? '')} onChange={e => onChange(e.target.value)} style={inputStyle}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}
      {hint && <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2, fontStyle: 'italic' }}>{hint}</div>}
    </div>
  );
}

// ── Key-value list editor (for env vars, params, etc.) ───────────────────────

type KVEntry = { key: string; value: string };

function KVEditor({ label, entries, onChange, keyPlaceholder = 'KEY', valuePlaceholder = 'value' }: {
  label: string;
  entries: KVEntry[];
  onChange: (entries: KVEntry[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const addRow = () => onChange([...entries, { key: '', value: '' }]);
  const removeRow = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: 'key' | 'value', val: string) => {
    const next = [...entries];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
        <button onClick={addRow} style={{ fontSize: 11, padding: '1px 6px', background: 'var(--je-input-bg)', border: '1px solid var(--je-border)', color: 'var(--je-fg)', borderRadius: 3, cursor: 'pointer' }}>+ Add</button>
      </div>
      {entries.length === 0 && <div style={{ fontSize: 11, opacity: 0.4, fontStyle: 'italic' }}>None — click + Add</div>}
      {entries.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <input
            value={e.key}
            onChange={ev => updateRow(i, 'key', ev.target.value)}
            placeholder={keyPlaceholder}
            style={{ ...inputStyle, flex: 1, width: 'auto' }}
          />
          <input
            value={e.value}
            onChange={ev => updateRow(i, 'value', ev.target.value)}
            placeholder={valuePlaceholder}
            style={{ ...inputStyle, flex: 2, width: 'auto' }}
          />
          <button onClick={() => removeRow(i)} style={{ fontSize: 11, padding: '0 6px', background: 'transparent', border: '1px solid var(--je-error)', color: 'var(--je-error)', borderRadius: 3, cursor: 'pointer' }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ── String list editor (for options, etc.) ───────────────────────────────────

function ListEditor({ label, items, onChange, placeholder }: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const addRow = () => onChange([...items, '']);
  const removeRow = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const updateRow = (i: number, val: string) => {
    const next = [...items];
    next[i] = val;
    onChange(next);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
        <button onClick={addRow} style={{ fontSize: 11, padding: '1px 6px', background: 'var(--je-input-bg)', border: '1px solid var(--je-border)', color: 'var(--je-fg)', borderRadius: 3, cursor: 'pointer' }}>+ Add</button>
      </div>
      {items.length === 0 && <div style={{ fontSize: 11, opacity: 0.4, fontStyle: 'italic' }}>None — click + Add</div>}
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <input value={item} onChange={ev => updateRow(i, ev.target.value)} placeholder={placeholder} style={{ ...inputStyle, flex: 1, width: 'auto' }} />
          <button onClick={() => removeRow(i)} style={{ fontSize: 11, padding: '0 6px', background: 'transparent', border: '1px solid var(--je-error)', color: 'var(--je-error)', borderRadius: 3, cursor: 'pointer' }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ── Section collapsible ───────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', background: 'var(--je-input-bg)', border: 'none', borderBottom: '1px solid var(--je-border)', color: 'var(--je-fg)', padding: '5px 8px', fontSize: 11, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', opacity: 0.85 }}
      >
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ paddingTop: 10 }}>{children}</div>}
    </div>
  );
}

// ── Kind-specific inspector panels ───────────────────────────────────────────

function StageInspector({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  const envVars = (data['environment'] as KVEntry[] | undefined) ?? [];
  const options = (data['options'] as string[] | undefined) ?? [];

  return <>
    <Section title="Stage">
      <Field label="Name" value={String(data['name'] ?? data['label'] ?? '')}
        onChange={v => { update('name', v); update('label', v); }}
        placeholder="e.g. Build, Test, Deploy" />
      <Field label="Fail fast (parallel)" value={Boolean(data['failFast'])} onChange={v => update('failFast', v)} type="checkbox" />
    </Section>

    <Section title="Agent" defaultOpen={false}>
      <Field label="Override agent" value={String(data['agentType'] ?? '')}
        onChange={v => update('agentType', v)} type="select"
        options={['', 'any', 'none', 'label', 'docker', 'dockerfile']}
        hint="Leave blank to inherit pipeline agent" />
      {data['agentType'] === 'label' && <Field label="Label" value={String(data['agentLabel'] ?? '')} onChange={v => update('agentLabel', v)} placeholder="e.g. linux" />}
      {data['agentType'] === 'docker' && <>
        <Field label="Image" value={String(data['dockerImage'] ?? '')} onChange={v => update('dockerImage', v)} placeholder="e.g. maven:3.9" />
        <Field label="Args" value={String(data['dockerArgs'] ?? '')} onChange={v => update('dockerArgs', v)} placeholder="e.g. -v /tmp:/tmp" />
      </>}
    </Section>

    <Section title="When condition" defaultOpen={false}>
      <Field label="Condition type" value={String(data['whenType'] ?? '')}
        onChange={v => update('whenType', v)} type="select"
        options={['', 'branch', 'environment', 'expression', 'tag', 'changeRequest', 'buildingTag', 'not', 'allOf', 'anyOf']}
        hint="Controls when this stage runs" />
      {data['whenType'] === 'branch' && <Field label="Branch pattern" value={String(data['whenBranch'] ?? '')} onChange={v => update('whenBranch', v)} placeholder="e.g. main or PR-*" />}
      {data['whenType'] === 'environment' && <>
        <Field label="Env variable" value={String(data['whenEnvName'] ?? '')} onChange={v => update('whenEnvName', v)} placeholder="e.g. DEPLOY_ENV" />
        <Field label="Equals value" value={String(data['whenEnvValue'] ?? '')} onChange={v => update('whenEnvValue', v)} placeholder="e.g. production" />
      </>}
      {data['whenType'] === 'expression' && <Field label="Groovy expression" value={String(data['whenExpression'] ?? '')}
        onChange={v => update('whenExpression', v)} type="textarea" placeholder="e.g. return params.RUN_TESTS == true" />}
      {data['whenType'] === 'tag' && <Field label="Tag pattern" value={String(data['whenTag'] ?? '')} onChange={v => update('whenTag', v)} placeholder="e.g. v*" />}
    </Section>

    <Section title="Environment variables" defaultOpen={false}>
      <KVEditor label="" entries={envVars} onChange={v => update('environment', v)} keyPlaceholder="VAR_NAME" valuePlaceholder="value or credentials('id')" />
    </Section>

    <Section title="Options" defaultOpen={false}>
      <ListEditor label="" items={options} onChange={v => update('options', v)} placeholder="e.g. skipDefaultCheckout()" />
    </Section>
  </>;
}

function AgentInspector({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  return <>
    <Section title="Agent">
      <Field label="Type" value={String(data['type'] ?? 'any')}
        onChange={v => update('type', v)} type="select"
        options={['any', 'none', 'label', 'docker', 'dockerfile', 'kubernetes']}
        hint="Where the pipeline or stage will run" />
      {data['type'] === 'label' && <Field label="Node label" value={String(data['label'] ?? '')} onChange={v => update('label', v)} placeholder="e.g. linux, windows, macos" />}
      {data['type'] === 'docker' && <>
        <Field label="Image" value={String(data['image'] ?? '')} onChange={v => update('image', v)} placeholder="e.g. maven:3.9-eclipse-temurin-17" />
        <Field label="Args" value={String(data['args'] ?? '')} onChange={v => update('args', v)} placeholder="e.g. -v /var/run/docker.sock:/var/run/docker.sock" />
        <Field label="Registry URL" value={String(data['registryUrl'] ?? '')} onChange={v => update('registryUrl', v)} placeholder="e.g. https://registry.hub.docker.com" />
        <Field label="Registry credentials" value={String(data['registryCredentials'] ?? '')} onChange={v => update('registryCredentials', v)} placeholder="credentials ID" />
        <Field label="Reuse node" value={Boolean(data['reuseNode'])} onChange={v => update('reuseNode', v)} type="checkbox" />
      </>}
      {data['type'] === 'dockerfile' && <>
        <Field label="Dockerfile" value={String(data['filename'] ?? 'Dockerfile')} onChange={v => update('filename', v)} />
        <Field label="Directory" value={String(data['dir'] ?? '.')} onChange={v => update('dir', v)} />
        <Field label="Args" value={String(data['args'] ?? '')} onChange={v => update('args', v)} />
      </>}
      {data['type'] === 'kubernetes' && <>
        <Field label="YAML file" value={String(data['yamlFile'] ?? '')} onChange={v => update('yamlFile', v)} placeholder="e.g. pod.yaml" />
        <Field label="Default container" value={String(data['defaultContainer'] ?? '')} onChange={v => update('defaultContainer', v)} />
      </>}
    </Section>
  </>;
}

function StepInspector({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  const stepType = String(data['type'] ?? 'sh');

  return <>
    <Section title="Step">
      <Field label="Type" value={stepType}
        onChange={v => { update('type', v); update('label', v); }} type="select"
        options={['sh', 'bat', 'echo', 'git', 'checkout', 'archiveArtifacts', 'junit', 'withCredentials', 'timeout', 'retry', 'script', 'input', 'sleep', 'stash', 'unstash', 'publishHTML', 'emailext', 'slackSend', 'custom']} />
    </Section>

    {(stepType === 'sh' || stepType === 'bat') && <Section title={stepType === 'bat' ? 'Batch script' : 'Shell script'}>
      <Field label="Script" value={String(data['script'] ?? '')} onChange={v => update('script', v)} type="textarea" placeholder="echo 'hello'" />
      <Field label="Label (display name)" value={String(data['displayLabel'] ?? '')} onChange={v => update('displayLabel', v)} placeholder="e.g. Compile project" />
      <Field label="Return stdout" value={Boolean(data['returnStdout'])} onChange={v => update('returnStdout', v)} type="checkbox" />
      <Field label="Encoding" value={String(data['encoding'] ?? '')} onChange={v => update('encoding', v)} placeholder="e.g. UTF-8 (default)" />
    </Section>}

    {stepType === 'echo' && <Section title="Message">
      <Field label="Text" value={String(data['message'] ?? '')} onChange={v => { update('message', v); update('label', `echo: ${v}`); }} placeholder="Hello from Jenkins!" />
    </Section>}

    {stepType === 'git' && <Section title="Git">
      <Field label="Repository URL" value={String(data['url'] ?? '')} onChange={v => update('url', v)} placeholder="https://github.com/org/repo.git" />
      <Field label="Branch" value={String(data['branch'] ?? 'main')} onChange={v => update('branch', v)} />
      <Field label="Credentials ID" value={String(data['credentialsId'] ?? '')} onChange={v => update('credentialsId', v)} placeholder="my-git-creds" />
      <Field label="Poll for changes" value={Boolean(data['poll'])} onChange={v => update('poll', v)} type="checkbox" />
    </Section>}

    {stepType === 'checkout' && <Section title="Checkout SCM">
      <Field label="SCM type" value={String(data['scm'] ?? 'scm')} onChange={v => update('scm', v)} type="select" options={['scm', 'git', 'svn']} hint="'scm' uses the pipeline-configured SCM" />
    </Section>}

    {stepType === 'archiveArtifacts' && <Section title="Archive Artifacts">
      <Field label="Include pattern" value={String(data['artifacts'] ?? '')} onChange={v => update('artifacts', v)} placeholder="**/target/*.jar, **/dist/**" />
      <Field label="Exclude pattern" value={String(data['excludes'] ?? '')} onChange={v => update('excludes', v)} placeholder="**/*.tmp" />
      <Field label="Allow empty archive" value={Boolean(data['allowEmptyArchive'])} onChange={v => update('allowEmptyArchive', v)} type="checkbox" />
      <Field label="Only if successful" value={Boolean(data['onlyIfSuccessful'])} onChange={v => update('onlyIfSuccessful', v)} type="checkbox" />
    </Section>}

    {stepType === 'junit' && <Section title="JUnit Results">
      <Field label="Test results pattern" value={String(data['pattern'] ?? '')} onChange={v => update('pattern', v)} placeholder="**/test-results/*.xml" />
      <Field label="Allow empty results" value={Boolean(data['allowEmptyResults'])} onChange={v => update('allowEmptyResults', v)} type="checkbox" />
      <Field label="Keep long stdio" value={Boolean(data['keepLongStdio'])} onChange={v => update('keepLongStdio', v)} type="checkbox" />
    </Section>}

    {stepType === 'withCredentials' && <Section title="Credentials">
      <Field label="Credential type" value={String(data['credType'] ?? 'usernamePassword')}
        onChange={v => update('credType', v)} type="select"
        options={['usernamePassword', 'string', 'file', 'sshUserPrivateKey', 'certificate']} />
      <Field label="Credentials ID" value={String(data['credentialsId'] ?? '')} onChange={v => update('credentialsId', v)} placeholder="my-credentials-id" />
      {data['credType'] === 'usernamePassword' && <>
        <Field label="Username variable" value={String(data['usernameVar'] ?? 'USERNAME')} onChange={v => update('usernameVar', v)} />
        <Field label="Password variable" value={String(data['passwordVar'] ?? 'PASSWORD')} onChange={v => update('passwordVar', v)} />
      </>}
      {data['credType'] === 'string' && <Field label="Variable name" value={String(data['variable'] ?? 'SECRET')} onChange={v => update('variable', v)} />}
    </Section>}

    {stepType === 'timeout' && <Section title="Timeout">
      <Field label="Time" value={Number(data['time'] ?? 5)} onChange={v => update('time', parseInt(String(v)))} type="number" />
      <Field label="Unit" value={String(data['unit'] ?? 'MINUTES')} onChange={v => update('unit', v)} type="select" options={['SECONDS', 'MINUTES', 'HOURS', 'DAYS']} />
      <Field label="Activity timeout" value={Boolean(data['activity'])} onChange={v => update('activity', v)} type="checkbox" hint="Timeout on inactivity, not total time" />
    </Section>}

    {stepType === 'retry' && <Section title="Retry">
      <Field label="Max retries" value={Number(data['count'] ?? 3)} onChange={v => update('count', parseInt(String(v)))} type="number" />
    </Section>}

    {stepType === 'input' && <Section title="Input">
      <Field label="Message" value={String(data['message'] ?? '')} onChange={v => update('message', v)} placeholder="e.g. Deploy to production?" />
      <Field label="ID" value={String(data['inputId'] ?? '')} onChange={v => update('inputId', v)} placeholder="e.g. Proceed" />
      <Field label="Submitter" value={String(data['submitter'] ?? '')} onChange={v => update('submitter', v)} placeholder="user or group" />
      <Field label="OK button text" value={String(data['ok'] ?? 'Proceed')} onChange={v => update('ok', v)} />
    </Section>}

    {stepType === 'sleep' && <Section title="Sleep">
      <Field label="Time" value={Number(data['time'] ?? 5)} onChange={v => update('time', parseInt(String(v)))} type="number" />
      <Field label="Unit" value={String(data['unit'] ?? 'SECONDS')} onChange={v => update('unit', v)} type="select" options={['NANOSECONDS', 'MICROSECONDS', 'MILLISECONDS', 'SECONDS', 'MINUTES', 'HOURS', 'DAYS']} />
    </Section>}

    {stepType === 'stash' && <Section title="Stash">
      <Field label="Name" value={String(data['stashName'] ?? '')} onChange={v => update('stashName', v)} placeholder="e.g. built-app" />
      <Field label="Include pattern" value={String(data['includes'] ?? '**')} onChange={v => update('includes', v)} />
      <Field label="Exclude pattern" value={String(data['excludes'] ?? '')} onChange={v => update('excludes', v)} />
    </Section>}

    {stepType === 'unstash' && <Section title="Unstash">
      <Field label="Name" value={String(data['stashName'] ?? '')} onChange={v => update('stashName', v)} placeholder="e.g. built-app" />
    </Section>}

    {stepType === 'slackSend' && <Section title="Slack Notification">
      <Field label="Channel" value={String(data['channel'] ?? '')} onChange={v => update('channel', v)} placeholder="e.g. #builds" />
      <Field label="Message" value={String(data['slackMessage'] ?? '')} onChange={v => update('slackMessage', v)} type="textarea" />
      <Field label="Color" value={String(data['color'] ?? '')} onChange={v => update('color', v)} type="select" options={['', 'good', 'warning', 'danger', '#439FE0']} hint="good=green, warning=yellow, danger=red" />
    </Section>}

    {stepType === 'script' && <Section title="Groovy Script">
      <Field label="Script body" value={String(data['script'] ?? '')} onChange={v => update('script', v)} type="textarea" placeholder="// Scripted Groovy&#10;node { ... }" />
    </Section>}

    {stepType === 'custom' && <Section title="Raw step">
      <Field label="Raw Groovy" value={String(data['rawContent'] ?? '')} onChange={v => update('rawContent', v)} type="textarea" placeholder="myPlugin(arg: 'value')" />
    </Section>}
  </>;
}

function PostInspector({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  return <>
    <Section title="Post condition">
      <Field label="Condition" value={String(data['condition'] ?? 'always')}
        onChange={v => { update('condition', v); update('label', `post: ${v}`); }} type="select"
        options={['always', 'success', 'failure', 'unstable', 'changed', 'aborted', 'fixed', 'regression', 'cleanup']}
        hint="When should this post block run?" />
    </Section>
  </>;
}

function PipelineInspector({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  const envVars = (data['environment'] as KVEntry[] | undefined) ?? [];
  const options = (data['options'] as string[] | undefined) ?? [];
  const triggers = (data['triggers'] as string[] | undefined) ?? [];
  const params = (data['parameters'] as Array<{ type: string; name: string; defaultValue: string; description: string }> | undefined) ?? [];

  const updateParam = (i: number, field: string, val: string) => {
    const next = [...params];
    next[i] = { ...next[i], [field]: val };
    update('parameters', next);
  };
  const addParam = () => update('parameters', [...params, { type: 'string', name: '', defaultValue: '', description: '' }]);
  const removeParam = (i: number) => update('parameters', params.filter((_, idx) => idx !== i));

  return <>
    <Section title="Pipeline">
      <Field label="Description" value={String(data['description'] ?? '')} onChange={v => update('description', v)} placeholder="What does this pipeline do?" />
    </Section>

    <Section title="Agent">
      <Field label="Type" value={String(data['agentType'] ?? 'any')}
        onChange={v => update('agentType', v)} type="select"
        options={['any', 'none', 'label', 'docker', 'dockerfile', 'kubernetes']} />
      {data['agentType'] === 'label' && <Field label="Label" value={String(data['agentLabel'] ?? '')} onChange={v => update('agentLabel', v)} placeholder="e.g. linux" />}
      {data['agentType'] === 'docker' && <>
        <Field label="Image" value={String(data['dockerImage'] ?? '')} onChange={v => update('dockerImage', v)} placeholder="e.g. maven:3.9" />
        <Field label="Args" value={String(data['dockerArgs'] ?? '')} onChange={v => update('dockerArgs', v)} />
      </>}
    </Section>

    <Section title="Environment variables" defaultOpen={false}>
      <KVEditor label="" entries={envVars} onChange={v => update('environment', v)} keyPlaceholder="VAR_NAME" valuePlaceholder="value or credentials('id')" />
    </Section>

    <Section title="Parameters" defaultOpen={false}>
      <div style={{ marginBottom: 6 }}>
        <button onClick={addParam} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--je-input-bg)', border: '1px solid var(--je-border)', color: 'var(--je-fg)', borderRadius: 3, cursor: 'pointer', width: '100%' }}>
          + Add parameter
        </button>
      </div>
      {params.length === 0 && <div style={{ fontSize: 11, opacity: 0.4, fontStyle: 'italic' }}>No parameters defined</div>}
      {params.map((p, i) => (
        <div key={i} style={{ background: 'var(--je-input-bg)', border: '1px solid var(--je-border)', borderRadius: 4, padding: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <select value={p.type} onChange={e => updateParam(i, 'type', e.target.value)} style={{ ...inputStyle, width: 'auto', flex: 1, marginRight: 4 }}>
              {['string', 'booleanParam', 'choice', 'password', 'text', 'file', 'run'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={() => removeParam(i)} style={{ fontSize: 11, padding: '0 6px', background: 'transparent', border: '1px solid var(--je-error)', color: 'var(--je-error)', borderRadius: 3, cursor: 'pointer' }}>✕</button>
          </div>
          <input value={p.name} onChange={e => updateParam(i, 'name', e.target.value)} placeholder="Parameter name" style={{ ...inputStyle, marginBottom: 4 }} />
          <input value={p.defaultValue} onChange={e => updateParam(i, 'defaultValue', e.target.value)} placeholder="Default value" style={{ ...inputStyle, marginBottom: 4 }} />
          <input value={p.description} onChange={e => updateParam(i, 'description', e.target.value)} placeholder="Description" style={inputStyle} />
        </div>
      ))}
    </Section>

    <Section title="Options" defaultOpen={false}>
      <ListEditor label="" items={options} onChange={v => update('options', v)} placeholder="e.g. buildDiscarder(logRotator(numToKeepStr: '10'))" />
    </Section>

    <Section title="Triggers" defaultOpen={false}>
      <ListEditor label="" items={triggers} onChange={v => update('triggers', v)} placeholder="e.g. cron('H/15 * * * *')" />
    </Section>
  </>;
}

function ParallelInspector({ data, update }: { data: Record<string, unknown>; update: (k: string, v: unknown) => void }) {
  const branches = (data['branches'] as string[] | undefined) ?? ['Branch A', 'Branch B'];
  return <>
    <Section title="Parallel">
      <Field label="Fail fast on first failure" value={Boolean(data['failFast'])} onChange={v => update('failFast', v)} type="checkbox" hint="Stop all branches as soon as one fails" />
    </Section>
    <Section title="Branch names" defaultOpen={true}>
      <ListEditor label="" items={branches} onChange={v => update('branches', v)} placeholder="Branch name" />
    </Section>
  </>;
}

// ── Main inspector ────────────────────────────────────────────────────────────

export default function NodeInspector() {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const nodes = useGraphStore(s => s.nodes);
  const updateNodeData = useGraphStore(s => s.updateNodeData);
  const deleteNode = useGraphStore(s => s.deleteNode);
  const selectNode = useGraphStore(s => s.selectNode);

  const node = nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;

  const data = node.data as Record<string, unknown>;
  const kind = node.type ?? 'step';

  const update = useCallback((key: string, value: unknown) => {
    updateNodeData(node.id, { [key]: value });
  }, [node.id, updateNodeData]);

  const kindColors: Record<string, string> = {
    pipeline: '#3C3489',
    stage: '#534AB7',
    step: '#185FA5',
    agent: '#0F6E56',
    parallel: '#854F0B',
    post: '#A32D2D',
  };

  return (
    <div style={{
      width: 300,
      flexShrink: 0,
      background: 'var(--je-sidebar-bg)',
      borderLeft: '1px solid var(--je-border)',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid var(--je-border)',
        background: kindColors[kind] ? `${kindColors[kind]}22` : undefined,
        borderTop: `2px solid ${kindColors[kind] ?? 'var(--je-border)'}`,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 11, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {kind === 'step' ? `step · ${String(data['type'] ?? 'sh')}` : kind}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 1 }}>
            {String(data['label'] ?? data['name'] ?? node.id)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => { deleteNode(node.id); }}
            title="Delete this node (Del)"
            style={{ background: 'transparent', border: '1px solid var(--je-error)', color: 'var(--je-error)', padding: '2px 8px', fontSize: 11, borderRadius: 3, cursor: 'pointer' }}
          >🗑</button>
          <button
            onClick={() => selectNode(null)}
            title="Close inspector (Esc)"
            style={{ background: 'transparent', border: '1px solid var(--je-border)', color: 'var(--je-fg)', padding: '2px 8px', fontSize: 11, borderRadius: 3, cursor: 'pointer' }}
          >✕</button>
        </div>
      </div>

      {/* Fields */}
      <div style={{ padding: '10px 12px', flex: 1, overflowY: 'auto' }}>
        {kind === 'pipeline' && <PipelineInspector data={data} update={update} />}
        {kind === 'stage' && <StageInspector data={data} update={update} />}
        {kind === 'step' && <StepInspector data={data} update={update} />}
        {kind === 'agent' && <AgentInspector data={data} update={update} />}
        {kind === 'parallel' && <ParallelInspector data={data} update={update} />}
        {kind === 'post' && <PostInspector data={data} update={update} />}

        {/* Validation errors */}
        {Array.isArray(data['validationErrors']) && (data['validationErrors'] as unknown[]).length > 0 && (
          <div style={{ marginTop: 12, padding: 8, background: 'rgba(228,75,74,0.1)', border: '1px solid var(--je-error)', borderRadius: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--je-error)', fontWeight: 600, marginBottom: 4 }}>⚠ Validation errors</div>
            {(data['validationErrors'] as Array<{ message: string }>).map((e, i) => (
              <div key={i} style={{ fontSize: 11, opacity: 0.9 }}>• {e.message}</div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, opacity: 0.25, fontSize: 10 }}>id: {node.id}</div>
      </div>
    </div>
  );
}


import React, { useCallback } from 'react';
import { useGraphStore } from '../store/graphStore';

function Field({
  label, value, onChange, type = 'text', options,
}: {
  label: string;
  value: string | number | boolean | undefined;
  onChange: (v: string | boolean) => void;
  type?: 'text' | 'textarea' | 'checkbox' | 'select' | 'number';
  options?: string[];
}) {
  const inputStyle = {
    background: 'var(--je-input-bg)',
    color: 'var(--je-input-fg)',
    border: '1px solid var(--je-input-border)',
    borderRadius: 3,
    padding: '4px 8px',
    fontSize: 12,
    fontFamily: type === 'textarea' ? 'var(--vscode-editor-font-family, monospace)' : 'inherit',
    width: '100%',
    resize: 'vertical' as const,
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {type === 'checkbox' ? (
        <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />
      ) : type === 'textarea' ? (
        <textarea rows={4} value={String(value ?? '')} onChange={e => onChange(e.target.value)} style={inputStyle} />
      ) : type === 'select' && options ? (
        <select value={String(value ?? '')} onChange={e => onChange(e.target.value)} style={inputStyle}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={String(value ?? '')} onChange={e => onChange(e.target.value)} style={inputStyle} />
      )}
    </div>
  );
}

export default function NodeInspector() {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const nodes = useGraphStore(s => s.nodes);
  const updateNodeData = useGraphStore(s => s.updateNodeData);
  const deleteNode = useGraphStore(s => s.deleteNode);
  const selectNode = useGraphStore(s => s.selectNode);

  const node = nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;

  const data = node.data as Record<string, unknown>;
  const kind = node.type ?? 'step';

  const update = useCallback((key: string, value: unknown) => {
    updateNodeData(node.id, { [key]: value });
  }, [node.id, updateNodeData]);

  return (
    <div style={{
      width: 280,
      flexShrink: 0,
      background: 'var(--je-sidebar-bg)',
      borderLeft: '1px solid var(--je-border)',
      overflowY: 'auto',
      padding: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {kind}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => { deleteNode(node.id); }}
            style={{ background: 'var(--je-error)', padding: '2px 8px', fontSize: 11 }}
            title="Delete node"
          >
            Delete
          </button>
          <button onClick={() => selectNode(null)} style={{ background: 'transparent', border: '1px solid var(--je-border)', padding: '2px 8px', fontSize: 11 }}>
            ✕
          </button>
        </div>
      </div>

      {/* Champs selon le type de nœud */}

      {kind === 'stage' && <>
        <Field label="Name" value={String(data['name'] ?? data['label'] ?? '')} onChange={v => { update('name', v); update('label', v); }} />
        <Field label="Fail fast" value={Boolean(data['failFast'])} onChange={v => update('failFast', v)} type="checkbox" />
      </>}

      {kind === 'agent' && <>
        <Field label="Type" value={String(data['type'] ?? 'any')}
          onChange={v => update('type', v)} type="select"
          options={['any', 'none', 'label', 'docker', 'dockerfile']} />
        {data['type'] === 'label' && <Field label="Label" value={String(data['label'] ?? '')} onChange={v => update('label', v)} />}
        {data['type'] === 'docker' && <>
          <Field label="Image" value={String(data['image'] ?? '')} onChange={v => update('image', v)} />
          <Field label="Args" value={String(data['args'] ?? '')} onChange={v => update('args', v)} />
          <Field label="Reuse node" value={Boolean(data['reuseNode'])} onChange={v => update('reuseNode', v)} type="checkbox" />
        </>}
        {data['type'] === 'dockerfile' && <Field label="Filename" value={String(data['filename'] ?? 'Dockerfile')} onChange={v => update('filename', v)} />}
      </>}

      {kind === 'step' && <>
        <Field label="Type" value={String(data['type'] ?? 'sh')}
          onChange={v => { update('type', v); update('label', v); }} type="select"
          options={['sh', 'echo', 'git', 'checkout', 'archiveArtifacts', 'junit', 'withCredentials', 'timeout', 'retry', 'script', 'custom']} />
        {(data['type'] === 'sh' || data['type'] === 'script') && <>
          <Field label="Script" value={String(data['script'] ?? '')} onChange={v => update('script', v)} type="textarea" />
          <Field label="Return stdout" value={Boolean(data['returnStdout'])} onChange={v => update('returnStdout', v)} type="checkbox" />
        </>}
        {data['type'] === 'echo' && <Field label="Message" value={String(data['message'] ?? '')} onChange={v => { update('message', v); update('label', `echo: ${v}`); }} />}
        {data['type'] === 'git' && <>
          <Field label="URL" value={String(data['url'] ?? '')} onChange={v => update('url', v)} />
          <Field label="Branch" value={String(data['branch'] ?? 'main')} onChange={v => update('branch', v)} />
          <Field label="Credentials ID" value={String(data['credentialsId'] ?? '')} onChange={v => update('credentialsId', v)} />
        </>}
        {data['type'] === 'archiveArtifacts' && <Field label="Artifacts pattern" value={String(data['artifacts'] ?? '')} onChange={v => update('artifacts', v)} />}
        {data['type'] === 'junit' && <Field label="Test results pattern" value={String(data['pattern'] ?? '')} onChange={v => update('pattern', v)} />}
        {data['type'] === 'timeout' && <>
          <Field label="Time" value={Number(data['time'] ?? 5)} onChange={v => update('time', parseInt(String(v)))} type="number" />
          <Field label="Unit" value={String(data['unit'] ?? 'MINUTES')} onChange={v => update('unit', v)} type="select" options={['SECONDS', 'MINUTES', 'HOURS', 'DAYS']} />
        </>}
        {data['type'] === 'retry' && <Field label="Count" value={Number(data['count'] ?? 3)} onChange={v => update('count', parseInt(String(v)))} type="number" />}
        {data['type'] === 'custom' && <Field label="Raw content" value={String(data['rawContent'] ?? '')} onChange={v => update('rawContent', v)} type="textarea" />}
      </>}

      {kind === 'parallel' && <>
        <Field label="Fail fast" value={Boolean(data['failFast'])} onChange={v => update('failFast', v)} type="checkbox" />
      </>}

      {kind === 'post' && <>
        <Field label="Condition" value={String(data['condition'] ?? 'always')}
          onChange={v => { update('condition', v); update('label', `post: ${v}`); }} type="select"
          options={['always', 'success', 'failure', 'unstable', 'changed', 'aborted', 'cleanup']} />
      </>}

      {/* Erreurs de validation sur ce nœud */}
      {Array.isArray(data['validationErrors']) && (data['validationErrors'] as unknown[]).length > 0 && (
        <div style={{ marginTop: 16, padding: 8, background: 'rgba(228,75,74,0.1)', border: '1px solid var(--je-error)', borderRadius: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--je-error)', marginBottom: 4 }}>Validation errors</div>
          {(data['validationErrors'] as Array<{message: string}>).map((e, i) => (
            <div key={i} style={{ fontSize: 11, opacity: 0.9 }}>{e.message}</div>
          ))}
        </div>
      )}

      {/* ID du nœud (debug) */}
      <div style={{ marginTop: 16, opacity: 0.3, fontSize: 10 }}>ID: {node.id}</div>
    </div>
  );
}
