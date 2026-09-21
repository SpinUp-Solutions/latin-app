import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import type {
  EvaluationCase,
  EvaluationCaseInput,
  EvaluationFunctionDeleteRequest,
  EvaluationFunctionRunRequest,
  EvaluationFunctionSaveRequest,
  EvaluationRunResult,
  EvaluationRunSummary,
} from './contracts';

const FIREBASE_EVALUATION_TIMEOUT_MS = 540_000;

export async function runEvaluationInFirebase(request: EvaluationFunctionRunRequest): Promise<EvaluationRunResult> {
  const callable = httpsCallable<EvaluationFunctionRunRequest, EvaluationRunResult>(functions, 'runAiEvaluationFn', {
    timeout: FIREBASE_EVALUATION_TIMEOUT_MS,
  });
  return (await callable(request)).data;
}

export async function listEvaluationCasesInFirebase(): Promise<EvaluationCase[]> {
  const callable = httpsCallable<Record<string, never>, { cases: EvaluationCase[] }>(
    functions,
    'listAiEvaluationCasesFn'
  );
  return (await callable({})).data.cases;
}

export async function listEvaluationRunsInFirebase(): Promise<EvaluationRunSummary[]> {
  const callable = httpsCallable<Record<string, never>, { runs: EvaluationRunSummary[] }>(
    functions,
    'listAiEvaluationRunsFn'
  );
  return (await callable({})).data.runs;
}

export async function saveEvaluationCaseInFirebase(
  input: EvaluationCaseInput,
  caseId?: string
): Promise<EvaluationCase> {
  const callable = httpsCallable<EvaluationFunctionSaveRequest, { case: EvaluationCase }>(
    functions,
    'saveAiEvaluationCaseFn'
  );
  return (await callable({ input, ...(caseId ? { caseId } : {}) })).data.case;
}

export async function deleteEvaluationCaseInFirebase(caseId: string): Promise<void> {
  const callable = httpsCallable<EvaluationFunctionDeleteRequest, { success: true }>(
    functions,
    'deleteAiEvaluationCaseFn'
  );
  await callable({ caseId });
}
