// src/webview/hooks/useVSCodeBridge.ts
// Voir docs/PHASE4.md §4.4

import { useEffect, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';
import { applyThemeVars } from '../utils/theme';
import type { ExtensionMessage } from '../../shared/messages';
import type { WebviewMessage } from '../../shared/messages';

// ─── API VSCode (disponible dans le contexte webview) ───────────────────────

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// Singleton — acquireVsCodeApi() ne peut être appelé qu'une fois
let _vscode: ReturnType<typeof acquireVsCodeApi> | null = null;

function getVSCode() {
  if (!_vscode) {
    try {
      _vscode = acquireVsCodeApi();
    } catch {
      // Mode développement hors VSCode (navigateur, Storybook, etc.)
      _vscode = {
        postMessage: (msg) => console.log('[DEV bridge] →', msg),
        getState: () => null,
        setState: () => {},
      };
    }
  }
  return _vscode;
}

export function postToExtension(msg: WebviewMessage): void {
  getVSCode().postMessage(msg);
}

// ─── Hook principal ──────────────────────────────────────────────────────────

export function useVSCodeBridge(): void {
  const initialized = useRef(false);
  const store = useGraphStore();

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionMessage>) => {
      const msg = event.data;
      if (!msg?.type) return;

      switch (msg.type) {
        case 'INIT':
          store.setGraph(msg.graph);
          // TODO: appliquer msg.config (syncDelay, autoLayout, etc.)
          break;

        case 'DOC_CHANGED':
          store.setGraph(msg.graph);
          break;

        case 'VALIDATION_RESULT':
          store.setValidationErrors(msg.errors);
          break;

        case 'STEP_CATALOG':
          store.setStepCatalog(msg.steps);
          break;

        case 'LOG_LINE':
          store.appendLog(msg.line);
          break;

        case 'BUILD_STATUS':
          store.setBuildStatus(msg.status);
          break;

        case 'THEME_CHANGED':
          applyThemeVars();
          break;
      }
    };

    window.addEventListener('message', handler);

    // Signaler que la webview est prête
    if (!initialized.current) {
      initialized.current = true;
      postToExtension({ type: 'READY' });
    }

    return () => window.removeEventListener('message', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
