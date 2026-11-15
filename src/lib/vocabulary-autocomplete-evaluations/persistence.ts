import { VOCABULARY_EVALUATION_CASES_COLLECTION } from '../../../shared/constants/firestore';
import { evaluationCaseStore } from '../ai-evaluations/persistence';
import { vocabularyEvaluationCaseInputSchema } from './contracts';

export const vocabularyEvaluationCases = evaluationCaseStore(
  VOCABULARY_EVALUATION_CASES_COLLECTION,
  vocabularyEvaluationCaseInputSchema
);
