import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import type {
  EvaluationCase,
  EvaluationCaseInput,
  EvaluationFunctionRunRequest,
  EvaluationRunResult,
} from './contracts';

const FIREBASE_EVALUATION_TIMEOUT_MS = 540_000;

/** The browser side of one evaluation suite, given the names its four Cloud Functions are exported under. */
export function evaluationClient<Input, Case, Result>(names: {
  run: string;
  list: string;
  save: string;
  remove: string;
}) {
  return {
    run: async (request: EvaluationFunctionRunRequest) =>
      (
        await httpsCallable<EvaluationFunctionRunRequest, Result>(functions, names.run, {
          timeout: FIREBASE_EVALUATION_TIMEOUT_MS,
        })(request)
      ).data,
    list: async () =>
      (await httpsCallable<Record<string, never>, { cases: Case[] }>(functions, names.list)({})).data.cases,
    save: async (input: Input, caseId?: string) =>
      (
        await httpsCallable<{ input: Input; caseId?: string }, { case: Case }>(
          functions,
          names.save
        )({ input, ...(caseId ? { caseId } : {}) })
      ).data.case,
    remove: async (caseId: string): Promise<void> => {
      await httpsCallable<{ caseId: string }, { success: true }>(functions, names.remove)({ caseId });
    },
  };
}

export const {
  run: runEvaluationInFirebase,
  list: listEvaluationCasesInFirebase,
  save: saveEvaluationCaseInFirebase,
  remove: deleteEvaluationCaseInFirebase,
} = evaluationClient<EvaluationCaseInput, EvaluationCase, EvaluationRunResult>({
  run: 'runAiEvaluationFn',
  list: 'listAiEvaluationCasesFn',
  save: 'saveAiEvaluationCaseFn',
  remove: 'deleteAiEvaluationCaseFn',
});
