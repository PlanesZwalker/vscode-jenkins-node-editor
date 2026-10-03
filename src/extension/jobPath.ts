// src/extension/jobPath.ts
// Pure helper for Jenkins job URL paths. Kept free of `vscode` so it is testable.

/**
 * Builds the Jenkins job path used in URLs. Folders are separated by `/job/`.
 * For multibranch jobs the branch is a path segment: `glsl` + `dev` → `glsl/job/dev`.
 * A branch already present in the path is not duplicated.
 */
export function buildJobPath(jobName: string, branch?: string): string {
  const segments = jobName.split('/').filter(Boolean);
  if (branch && !segments.includes(branch)) segments.push(branch);
  return segments.map(encodeURIComponent).join('/job/');
}
