import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import type {
  VocabularyEvaluationCase,
  VocabularyEvaluationCaseInput,
  VocabularyEvaluationDeleteRequest,
  VocabularyEvaluationRunRequest,
  VocabularyEvaluationRunResult,
  VocabularyEvaluationSaveRequest,
} from './contracts';

const RUN_TIMEOUT_MS = 540_000;

export async function runVocabularyEvaluationInFirebase(
  request: VocabularyEvaluationRunRequest
): Promise<VocabularyEvaluationRunResult> {
  const callable = httpsCallable<VocabularyEvaluationRunRequest, VocabularyEvaluationRunResult>(
    functions,
    'runVocabAutocompleteEvalFn',
    { timeout: RUN_TIMEOUT_MS }
  );
  return (await callable(request)).data;
}

export async function listVocabularyEvaluationCasesInFirebase(): Promise<VocabularyEvaluationCase[]> {
  const callable = httpsCallable<Record<string, never>, { cases: VocabularyEvaluationCase[] }>(
    functions,
    'listVocabAutocompleteEvalCasesFn'
  );
  return (await callable({})).data.cases;
}

export async function saveVocabularyEvaluationCaseInFirebase(
  input: VocabularyEvaluationCaseInput,
  caseId?: string
): Promise<VocabularyEvaluationCase> {
  const callable = httpsCallable<VocabularyEvaluationSaveRequest, { case: VocabularyEvaluationCase }>(
    functions,
    'saveVocabAutocompleteEvalCaseFn'
  );
  return (await callable({ input, ...(caseId ? { caseId } : {}) })).data.case;
}

export async function deleteVocabularyEvaluationCaseInFirebase(caseId: string): Promise<void> {
  const callable = httpsCallable<VocabularyEvaluationDeleteRequest, { success: true }>(
    functions,
    'deleteVocabAutocompleteEvalCaseFn'
  );
  await callable({ caseId });
}
