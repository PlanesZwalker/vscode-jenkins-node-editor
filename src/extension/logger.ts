// src/extension/logger.ts
// Logger centralisé vers le panneau Output de VSCode
// En production, NE PAS utiliser console.log — utiliser ce module

import * as vscode from 'vscode';

const channel = vscode.window.createOutputChannel('Jenkins Node Editor');

export const logger = {
  info(msg: string): void {
    channel.appendLine(`[${timestamp()}] [INFO]  ${msg}`);
  },

  warn(msg: string): void {
    channel.appendLine(`[${timestamp()}] [WARN]  ${msg}`);
  },

  error(msg: string, err?: unknown): void {
    channel.appendLine(`[${timestamp()}] [ERROR] ${msg}`);
    if (err instanceof Error) {
      channel.appendLine(`  ${err.stack ?? err.message}`);
    } else if (err !== undefined) {
      channel.appendLine(`  ${String(err)}`);
    }
  },

  debug(msg: string): void {
    if (process.env.NODE_ENV === 'development') {
      channel.appendLine(`[${timestamp()}] [DEBUG] ${msg}`);
    }
  },

  /** Ouvre le panneau Output Jenkins Node Editor */
  show(): void {
    channel.show(true); // true = preserve focus
  },
};

function timestamp(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}
