import { evaluationClient } from '../ai-evaluations/firebase-client';
import type {
  VocabularyEvaluationCase,
  VocabularyEvaluationCaseInput,
  VocabularyEvaluationRunResult,
} from './contracts';

export const {
  run: runVocabularyEvaluationInFirebase,
  list: listVocabularyEvaluationCasesInFirebase,
  save: saveVocabularyEvaluationCaseInFirebase,
  remove: deleteVocabularyEvaluationCaseInFirebase,
} = evaluationClient<VocabularyEvaluationCaseInput, VocabularyEvaluationCase, VocabularyEvaluationRunResult>({
  run: 'runVocabAutocompleteEvalFn',
  list: 'listVocabAutocompleteEvalCasesFn',
  save: 'saveVocabAutocompleteEvalCaseFn',
  remove: 'deleteVocabAutocompleteEvalCaseFn',
});
