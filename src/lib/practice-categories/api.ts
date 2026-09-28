import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { LearningPathServiceError } from '@/src/lib/learning-units/learning-path-errors';
import { TestServiceError } from '@/src/lib/tests/errors';
import { PracticeCategoryError } from './service';
import { VocabularyPoolAssignmentError } from '@/src/lib/vocabulary-pools/assignment.server';
import { VocabularyPoolStateError } from '@/src/lib/vocabulary-pools/pool-state.server';

export const practiceCategoryRouteErrorResponse = createRouteErrorResponse(
  PracticeCategoryError,
  LearningPathServiceError,
  VocabularyPoolAssignmentError,
  VocabularyPoolStateError,
  TestServiceError
);
