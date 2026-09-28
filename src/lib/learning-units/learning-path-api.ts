import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { TestServiceError } from '@/src/lib/tests/errors';
import { LearningPathServiceError } from './learning-path-errors';

export const learningPathRouteErrorResponse = createRouteErrorResponse(LearningPathServiceError, TestServiceError);
