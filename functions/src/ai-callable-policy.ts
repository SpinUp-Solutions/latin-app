export const AI_CALLABLE_ACCESS = {
  autocompleteWord: 'admin',
  resolveRootWordFn: 'admin',
  gradeTranslationFn: 'authenticated',
  listAiEvaluationCasesFn: 'admin',
  listAiEvaluationRunsFn: 'admin',
  saveAiEvaluationCaseFn: 'admin',
  deleteAiEvaluationCaseFn: 'admin',
  runAiEvaluationFn: 'admin',
} as const;

export type AICallableName = keyof typeof AI_CALLABLE_ACCESS;

export function aiCallableAccessError(
  callableName: AICallableName,
  actorId: string | undefined,
  role?: unknown
): 'unauthenticated' | 'permission-denied' | null {
  if (!actorId) return 'unauthenticated';
  return AI_CALLABLE_ACCESS[callableName] === 'admin' && role !== 'admin' ? 'permission-denied' : null;
}

export function shouldEnforceAIAppCheck(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.FUNCTIONS_EMULATOR !== 'true';
}
