import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { LearningPathServiceError } from '@/src/lib/learning-units/learning-path-errors';
import { PracticeCategoryError } from './service';
import { VocabularyPoolAssignmentError } from '@/src/lib/vocabulary-pools/assignment.server';

export const practiceCategoryRouteErrorResponse = createRouteErrorResponse(
  PracticeCategoryError,
  LearningPathServiceError,
  VocabularyPoolAssignmentError
);
