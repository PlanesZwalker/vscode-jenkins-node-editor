// src/webview/utils/theme.ts
// Adaptateur thème VSCode → variables CSS de l'application
// Voir docs/PHASE2.md §2.9

export type VSCodeTheme = 'light' | 'dark' | 'high-contrast';

export function detectTheme(): VSCodeTheme {
  const body = document.body;
  if (body.classList.contains('vscode-high-contrast')) return 'high-contrast';
  if (body.classList.contains('vscode-dark')) return 'dark';
  return 'light';
}

// Mapping des variables CSS VSCode → variables CSS locales de l'app
// Les variables VSCode sont disponibles globalement dans la webview
const THEME_VAR_MAP: Record<string, string> = {
  '--vscode-editor-background':                 '--je-bg',
  '--vscode-editor-foreground':                 '--je-fg',
  '--vscode-focusBorder':                       '--je-accent',
  '--vscode-badge-background':                  '--je-badge-bg',
  '--vscode-badge-foreground':                  '--je-badge-fg',
  '--vscode-list-activeSelectionBackground':    '--je-selected-bg',
  '--vscode-list-activeSelectionForeground':    '--je-selected-fg',
  '--vscode-editorError-foreground':            '--je-error',
  '--vscode-editorWarning-foreground':          '--je-warning',
  '--vscode-editorInfo-foreground':             '--je-info',
  '--vscode-panel-border':                      '--je-border',
  '--vscode-sideBar-background':                '--je-sidebar-bg',
  '--vscode-input-background':                  '--je-input-bg',
  '--vscode-input-foreground':                  '--je-input-fg',
  '--vscode-input-border':                      '--je-input-border',
  '--vscode-button-background':                 '--je-button-bg',
  '--vscode-button-foreground':                 '--je-button-fg',
  '--vscode-button-hoverBackground':            '--je-button-hover-bg',
  '--vscode-terminal-background':               '--je-terminal-bg',
  '--vscode-terminal-foreground':               '--je-terminal-fg',
};

export function applyThemeVars(): void {
  const root = document.documentElement;
  const computed = getComputedStyle(document.body);

  Object.entries(THEME_VAR_MAP).forEach(([vscodeVar, appVar]) => {
    const value = computed.getPropertyValue(vscodeVar).trim();
    if (value) {
      root.style.setProperty(appVar, value);
    }
  });
}
