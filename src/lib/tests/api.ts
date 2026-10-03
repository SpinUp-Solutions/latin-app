import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { LearningPathServiceError } from '@/src/lib/learning-units/learning-path-errors';
import { VocabularyPoolAssignmentError } from '@/src/lib/vocabulary-pools/assignment.server';
import { VocabularyPoolStateError } from '@/src/lib/vocabulary-pools/pool-state.server';
import { GeneratedVocabularySourceError, TestServiceError } from './errors';

export const testRouteErrorResponse = createRouteErrorResponse(
  TestServiceError,
  VocabularyPoolAssignmentError,
  VocabularyPoolStateError,
  LearningPathServiceError,
  GeneratedVocabularySourceError
);
