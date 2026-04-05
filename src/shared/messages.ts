// src/shared/messages.ts
// Protocole de messages typé entre l'extension host et la webview
// Toute modification ici doit être répercutée des deux côtés

import type {
  GraphModel,
  ValidationError,
  ExtensionConfig,
  StepDefinition,
  VSCodeTheme,
  BuildStatus,
} from './types';

// ─── Extension → Webview ────────────────────────────────────────────────────

export type ExtensionMessage =
  /** Envoyé une seule fois après READY, fournit le graphe initial et la config */
  | { type: 'INIT'; graph: GraphModel; config: ExtensionConfig }

  /** Le document texte a changé (modifié dans l'éditeur classique) */
  | { type: 'DOC_CHANGED'; graph: GraphModel }

  /** Résultat d'une validation (locale ou via API Jenkins) */
  | { type: 'VALIDATION_RESULT'; errors: ValidationError[] }

  /** Catalogue des steps disponibles sur l'instance Jenkins */
  | { type: 'STEP_CATALOG'; steps: StepDefinition[] }

  /** Une ligne de log du build en cours */
  | { type: 'LOG_LINE'; line: string; stream: 'stdout' | 'stderr' }

  /** Changement de statut du build Jenkins */
  | { type: 'BUILD_STATUS'; status: BuildStatus }

  /** Le thème VSCode a changé */
  | { type: 'THEME_CHANGED'; theme: VSCodeTheme };

// ─── Webview → Extension ────────────────────────────────────────────────────

export type WebviewMessage =
  /** La webview est prête à recevoir des données */
  | { type: 'READY' }

  /** Le graphe a changé (modification dans l'éditeur nodal) */
  | { type: 'GRAPH_CHANGED'; graph: GraphModel }

  /** Demande de validation du Jenkinsfile courant */
  | { type: 'VALIDATE_REQUEST' }

  /** Déclencher un build Jenkins */
  | { type: 'RUN_BUILD'; jobName?: string; branch?: string; params?: Record<string, string> }

  /** Annuler le build en cours */
  | { type: 'ABORT_BUILD' }

  /** Erreur côté webview */
  | { type: 'ERROR'; message: string; stack?: string };
