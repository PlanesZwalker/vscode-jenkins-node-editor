// src/webview/hooks/useJenkinsAPI.ts
// Voir docs/PHASE5.md §5.3

import { useCallback } from 'react';
import { useGraphStore } from '../store/graphStore';
import { postToExtension } from './useVSCodeBridge';

export function useJenkinsAPI() {
  const setBuildStatus = useGraphStore(s => s.setBuildStatus);
  const clearLogs = useGraphStore(s => s.clearLogs);
  const setIsValidating = useGraphStore(s => s.setIsValidating);

  const validate = useCallback(() => {
    setIsValidating(true);
    postToExtension({ type: 'VALIDATE_REQUEST' });
  }, [setIsValidating]);

  const runBuild = useCallback((branch?: string, params?: Record<string, string>) => {
    clearLogs();
    setBuildStatus('running');
    postToExtension({ type: 'RUN_BUILD', branch, params });
  }, [clearLogs, setBuildStatus]);

  const abortBuild = useCallback(() => {
    postToExtension({ type: 'ABORT_BUILD' });
  }, []);

  return { validate, runBuild, abortBuild };
}
