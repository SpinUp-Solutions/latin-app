import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { LearningPathServiceError } from '@/src/lib/learning-units/learning-path-errors';
import { PracticeCategoryError } from './service';

export const practiceCategoryRouteErrorResponse = createRouteErrorResponse(
  PracticeCategoryError,
  LearningPathServiceError
);
