// src/extension/JenkinsValidator.ts
// Validation du Jenkinsfile — locale ou via API Jenkins
// Voir docs/PHASE5.md §5.2 pour l'implémentation complète

import { JenkinsClient } from './JenkinsClient';
import { logger } from './logger';
import type { ValidationError, ExtensionConfig } from '../shared/types';

export class JenkinsValidator {
  private client: JenkinsClient | null = null;

  constructor(config: ExtensionConfig) {
    if (config.jenkinsUrl && config.jenkinsUser && config.jenkinsToken) {
      this.client = new JenkinsClient(config);
      logger.info(`JenkinsValidator: using remote Jenkins at ${config.jenkinsUrl}`);
    } else {
      logger.info('JenkinsValidator: no Jenkins configured, using local validation only');
    }
  }

  async validate(content: string): Promise<ValidationError[]> {
    // Toujours commencer par la validation locale (rapide)
    const localErrors = this.validateLocally(content);

    // Si Jenkins est configuré ET qu'il n'y a pas d'erreurs locales bloquantes,
    // faire la validation distante
    if (this.client && !localErrors.some(e => e.severity === 'error')) {
      try {
        const remoteErrors = await this.client.validatePipeline(content);
        return [...localErrors, ...remoteErrors];
      } catch (err) {
        logger.warn(`Remote validation failed: ${err instanceof Error ? err.message : String(err)}`);
        return [
          ...localErrors,
          {
            severity: 'warning',
            message: `Jenkins remote validation unavailable: ${err instanceof Error ? err.message : String(err)}`,
          },
        ];
      }
    }

    return localErrors;
  }

  private validateLocally(content: string): ValidationError[] {
    // TODO: Implémenter selon docs/PHASE5.md §5.2
    //
    // Vérifications à faire :
    // 1. Le fichier commence-t-il par "pipeline {" (déclaratif) ou "node" (scripted) ?
    // 2. Les accolades { } sont-elles équilibrées ?
    // 3. Présence d'un bloc "agent" ?
    // 4. Présence d'un bloc "stages" ?
    // 5. Au moins un "stage" dans "stages" ?
    //
    // Retourner un tableau de ValidationError (jamais throw)

    const errors: ValidationError[] = [];
    const trimmed = content.trim();

    if (!trimmed) {
      errors.push({ severity: 'error', message: 'Empty Jenkinsfile' });
      return errors;
    }

    // Vérification des accolades
    let depth = 0;
    let line = 1;
    let lastOpenLine = 1;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') line++;
      if (content[i] === '{') { depth++; lastOpenLine = line; }
      if (content[i] === '}') {
        depth--;
        if (depth < 0) {
          errors.push({ severity: 'error', message: `Unexpected closing brace`, line });
          break;
        }
      }
    }
    if (depth > 0) {
      errors.push({
        severity: 'error',
        message: `Unclosed block: ${depth} opening brace${depth > 1 ? 's' : ''} not closed`,
        line: lastOpenLine,
      });
    }

    // Vérification structure déclarative de base
    if (trimmed.startsWith('pipeline')) {
      if (!content.includes('agent')) {
        errors.push({ severity: 'warning', message: 'No "agent" directive found' });
      }
      if (!content.includes('stages')) {
        errors.push({ severity: 'error', message: 'No "stages" block found' });
      }
    }

    return errors;
  }
}
